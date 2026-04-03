import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, TOOL_DEFINITIONS } from "@/lib/llm/system-prompt";
import { handleSearchArchive, handleCategorizeTopic } from "@/lib/llm/tools";

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

  const { question } = await request.json();
  if (!question || typeof question !== "string" || question.trim().length === 0) {
    return NextResponse.json(
      { error: "Question is required" },
      { status: 400 }
    );
  }

  // Create conversation record
  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert({
      user_id: user.id,
      messages: [{ role: "user", content: question.trim() }],
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

        while (continueLoop) {
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
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
            currentText = "";
            toolUseBlocks = [];
          } else {
            continueLoop = false;

            // Save the final assistant text to conversation
            const allMessages = [
              { role: "user", content: question.trim() },
              ...(currentText
                ? [{ role: "assistant", content: currentText }]
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
        const message =
          err instanceof Error ? err.message : "An error occurred";
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
