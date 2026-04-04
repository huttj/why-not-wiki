import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, TOOL_DEFINITIONS } from "@/lib/llm/system-prompt";
import { handleSearchArchive, handleCategorizeTopic } from "@/lib/llm/tools";
import { getUserFriendlyError } from "@/lib/llm/errors";

export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Ensure user exists in public.users (handles cases where the signup trigger
  // did not fire, e.g. pre-existing auth users or trigger failures)
  await supabase
    .from("users")
    .upsert({ id: user.id, email: user.email! }, { onConflict: "id" });

  const { question, topic_id } = await request.json();
  if (!question || typeof question !== "string" || question.trim().length === 0) {
    return NextResponse.json(
      { error: "Question is required" },
      { status: 400 }
    );
  }

  // If topic_id provided, fetch the existing topic for context
  let existingTopic: { id: string; slug: string; question: string; category: number } | null = null;
  if (topic_id) {
    const { data } = await supabase
      .from("topics")
      .select("id, slug, question, category")
      .eq("id", topic_id)
      .single();
    existingTopic = data;
  }

  // Create conversation record, pre-linked to topic if provided
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert({
      user_id: user.id,
      messages: [{ role: "user", content: question.trim() }],
      ...(existingTopic ? { topic_id: existingTopic.id } : {}),
    })
    .select("id")
    .single();

  if (convError) {
    console.error("Conversation insert error:", convError);
    return NextResponse.json(
      { error: "Failed to create conversation", details: convError.message },
      { status: 500 }
    );
  }

  const anthropic = new Anthropic();

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: question.trim() },
  ];

  // Use streaming with tool use loop
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        let continueLoop = true;
        let fullAssistantText = "";

        while (continueLoop) {
          // Augment system prompt with existing topic context to prevent duplicates
          let systemPrompt = SYSTEM_PROMPT;
          if (existingTopic) {
            systemPrompt += `\n\nIMPORTANT CONTEXT: This conversation is about an EXISTING topic in the archive.
- Topic ID: ${existingTopic.id}
- Topic slug: ${existingTopic.slug}
- Original question: "${existingTopic.question}"
- Current category: ${existingTopic.category}

When you categorize this topic, you MUST use is_new_topic: false and existing_topic_id: "${existingTopic.id}". Do NOT create a new topic — update the existing one. You do NOT need to search the archive for this topic since you already have its details.`;
          }

          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            system: systemPrompt,
            tools: [
              ...TOOL_DEFINITIONS,
              { type: "web_search_20250305", name: "web_search", max_uses: 3 },
            ] as Anthropic.Tool[],
            messages,
            stream: true,
          });

          let currentText = "";
          let toolUseBlocks: Array<{
            id: string;
            name: string;
            input: string;
          }> = [];
          let currentToolUse: {
            id: string;
            name: string;
            input: string;
          } | null = null;
          let stopReason: string | null = null;

          for await (const event of response) {
            if (event.type === "content_block_start") {
              if (event.content_block.type === "text") {
                // text block starting
              } else if (event.content_block.type === "tool_use") {
                currentToolUse = {
                  id: event.content_block.id,
                  name: event.content_block.name,
                  input: "",
                };
              } else if ((event.content_block as { type: string }).type === "server_tool_use") {
                const block = event.content_block as { type: string; name: string };
                if (block.name === "web_search") {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({ type: "web_search_start" })}\n\n`
                    )
                  );
                }
              } else if ((event.content_block as { type: string }).type === "web_search_tool_result") {
                // Extract citations from web search results
                const block = event.content_block as {
                  type: string;
                  content: Array<{ type: string; url: string; title: string; page_age: string | null }> | { type: string; error_code: string };
                };
                const citations: Array<{ url: string; title: string; page_age: string | null }> = [];
                if (Array.isArray(block.content)) {
                  citations.push(
                    ...block.content
                      .filter((r) => r.type === "web_search_result")
                      .map((r) => ({ url: r.url, title: r.title, page_age: r.page_age }))
                  );
                }
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "web_search_complete", citations })}\n\n`
                  )
                );
              }
            } else if (event.type === "content_block_delta") {
              if (event.delta.type === "text_delta") {
                currentText += event.delta.text;
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "text", text: event.delta.text })}\n\n`
                  )
                );
              } else if (
                event.delta.type === "input_json_delta" &&
                currentToolUse
              ) {
                currentToolUse.input += event.delta.partial_json;
              }
            } else if (event.type === "content_block_stop") {
              if (currentToolUse) {
                toolUseBlocks.push(currentToolUse);
                currentToolUse = null;
              }
            } else if (event.type === "message_delta") {
              stopReason = event.delta.stop_reason;
            }
          }

          if (stopReason === "tool_use" && toolUseBlocks.length > 0) {
            // Signal client to finalize current text block before tool execution
            if (currentText) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "text_end" })}\n\n`
                )
              );
            }
            // Build assistant message with all content blocks
            const assistantContent: Anthropic.ContentBlockParam[] = [];
            if (currentText) {
              assistantContent.push({ type: "text", text: currentText });
            }
            for (const tool of toolUseBlocks) {
              let parsedInput;
              try {
                parsedInput = JSON.parse(tool.input);
              } catch {
                parsedInput = {};
              }
              assistantContent.push({
                type: "tool_use",
                id: tool.id,
                name: tool.name,
                input: parsedInput,
              });
            }
            messages.push({ role: "assistant", content: assistantContent });

            // Process each tool call
            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            for (const tool of toolUseBlocks) {
              let parsedInput;
              try {
                parsedInput = JSON.parse(tool.input);
              } catch {
                parsedInput = {};
              }

              if (tool.name === "search_archive") {
                const results = await handleSearchArchive(supabase, parsedInput.query);
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "status", message: `Searching archive for "${parsedInput.query}"...` })}\n\n`
                  )
                );
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: tool.id,
                  content: JSON.stringify(results),
                });
              } else if (tool.name === "categorize_topic") {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "status", message: "Categorizing topic..." })}\n\n`
                  )
                );
                const topic = await handleCategorizeTopic(supabase, {
                  ...parsedInput,
                  conversation_id: conversation.id,
                });
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "categorized", topic })}\n\n`
                  )
                );
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: tool.id,
                  content: JSON.stringify(topic),
                });
              } else if (tool.name === "web_search") {
                // web_search is handled natively by the API
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: tool.id,
                  content: "Web search completed.",
                });
              } else {
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: tool.id,
                  content: "Unknown tool",
                  is_error: true,
                });
              }
            }

            messages.push({ role: "user", content: toolResults });
            fullAssistantText += currentText;
            currentText = "";
            toolUseBlocks = [];
          } else {
            continueLoop = false;

            // Save the final assistant text to conversation
            fullAssistantText += currentText;
            const allMessages = [
              { role: "user", content: question.trim() },
              ...(fullAssistantText
                ? [{ role: "assistant", content: fullAssistantText }]
                : []),
            ];
            await supabase
              .from("conversations")
              .update({
                messages: allMessages,
                updated_at: new Date().toISOString(),
              })
              .eq("id", conversation.id);
          }
        }

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "done", conversation_id: conversation.id })}\n\n`
          )
        );
        controller.close();
      } catch (err) {
        const message = getUserFriendlyError(err);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message })}\n\n`
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
