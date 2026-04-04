import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import Anthropic from "@anthropic-ai/sdk";
import {
  ADMIN_SYSTEM_PROMPT,
  ADMIN_TOOL_DEFINITIONS,
} from "@/lib/llm/admin-prompt";
import {
  handleListTopics,
  handleGetTopic,
  handleUpdateTopic,
  handleDeleteTopic,
  handleCreateTopic,
  handleUpdateArgument,
  handleDeleteArgument,
  handleCreateArgument,
  handleGetStats,
} from "@/lib/llm/admin-tools";

export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();

  try {
    await requireAdmin(supabase);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { messages: clientMessages } = await request.json();
  if (!Array.isArray(clientMessages) || clientMessages.length === 0) {
    return NextResponse.json(
      { error: "Messages are required" },
      { status: 400 }
    );
  }

  const anthropic = new Anthropic();
  const messages: Anthropic.MessageParam[] = clientMessages.map(
    (m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        let continueLoop = true;

        while (continueLoop) {
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 4096,
            system: ADMIN_SYSTEM_PROMPT,
            tools: ADMIN_TOOL_DEFINITIONS as Anthropic.Tool[],
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
            // Signal text end before tool execution
            if (currentText) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "text_end" })}\n\n`
                )
              );
            }

            // Build assistant message
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

            // Process tool calls
            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            for (const tool of toolUseBlocks) {
              let parsedInput;
              try {
                parsedInput = JSON.parse(tool.input);
              } catch {
                parsedInput = {};
              }

              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "tool_call", name: tool.name, input: parsedInput })}\n\n`
                )
              );

              let result: unknown;
              try {
                switch (tool.name) {
                  case "list_topics":
                    result = await handleListTopics(supabase, parsedInput);
                    break;
                  case "get_topic":
                    result = await handleGetTopic(supabase, parsedInput);
                    break;
                  case "update_topic":
                    result = await handleUpdateTopic(supabase, parsedInput);
                    break;
                  case "delete_topic":
                    result = await handleDeleteTopic(supabase, parsedInput);
                    break;
                  case "create_topic":
                    result = await handleCreateTopic(supabase, parsedInput);
                    break;
                  case "update_argument":
                    result = await handleUpdateArgument(supabase, parsedInput);
                    break;
                  case "delete_argument":
                    result = await handleDeleteArgument(supabase, parsedInput);
                    break;
                  case "create_argument":
                    result = await handleCreateArgument(supabase, parsedInput);
                    break;
                  case "get_stats":
                    result = await handleGetStats(supabase);
                    break;
                  default:
                    result = { error: "Unknown tool" };
                }
              } catch (err) {
                result = {
                  error:
                    err instanceof Error ? err.message : "Tool execution failed",
                };
              }

              toolResults.push({
                type: "tool_result",
                tool_use_id: tool.id,
                content: JSON.stringify(result),
              });
            }

            messages.push({ role: "user", content: toolResults });
            currentText = "";
            toolUseBlocks = [];
          } else {
            continueLoop = false;
          }
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
        );
        controller.close();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Something went wrong";
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
