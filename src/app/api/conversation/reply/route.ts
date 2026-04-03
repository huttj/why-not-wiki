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

  const { conversation_id, message } = await request.json();
  if (!conversation_id || !message) {
    return NextResponse.json(
      { error: "conversation_id and message are required" },
      { status: 400 }
    );
  }

  // Fetch existing conversation
  const { data: conversation } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", conversation_id)
    .single();

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }

  // Build full message history for Anthropic
  const existingMessages: Array<{ role: string; content: string }> =
    conversation.messages || [];
  existingMessages.push({ role: "user", content: message.trim() });

  // Update conversation with new user message
  await supabase
    .from("conversations")
    .update({
      messages: existingMessages,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conversation_id);

  const anthropicMessages: Anthropic.MessageParam[] = existingMessages.map(
    (m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })
  );

  const anthropic = new Anthropic();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        let continueLoop = true;
        let messages = anthropicMessages;

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
              if (event.content_block.type === "tool_use") {
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
                      `data: ${JSON.stringify({ type: "status", message: "Searching the web..." })}\n\n`
                    )
                  );
                }
              } else if ((event.content_block as { type: string }).type === "web_search_tool_result") {
                const block = event.content_block as {
                  type: string;
                  content: Array<{ type: string; url: string; title: string; page_age: string | null }> | { type: string; error_code: string };
                };
                if (Array.isArray(block.content)) {
                  const citations = block.content
                    .filter((r) => r.type === "web_search_result")
                    .map((r) => ({ url: r.url, title: r.title, page_age: r.page_age }));
                  if (citations.length > 0) {
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify({ type: "citations", citations })}\n\n`
                      )
                    );
                  }
                }
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
            messages = [
              ...messages,
              { role: "assistant", content: assistantContent },
            ];

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
                    `data: ${JSON.stringify({ type: "status", message: `Searching archive...` })}\n\n`
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
                  conversation_id,
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

            messages = [
              ...messages,
              { role: "user", content: toolResults },
            ];
            currentText = "";
            toolUseBlocks = [];
          } else {
            continueLoop = false;

            // Save updated conversation
            if (currentText) {
              existingMessages.push({
                role: "assistant",
                content: currentText,
              });
              await supabase
                .from("conversations")
                .update({
                  messages: existingMessages,
                  updated_at: new Date().toISOString(),
                })
                .eq("id", conversation_id);
            }
          }
        }

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "done", conversation_id })}\n\n`
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
