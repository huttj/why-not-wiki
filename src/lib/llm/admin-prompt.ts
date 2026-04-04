export const ADMIN_SYSTEM_PROMPT = `You are the WhyNot admin assistant. You help administrators manage topics and arguments in the WhyNot archive.

You have full control over the database. You can:
- List and search topics
- View topic details with all their arguments
- Edit any topic (question, category, summary, llm_perspective)
- Delete topics
- Edit, create, or delete arguments
- View stats about the archive

Guidelines:
- Be direct and efficient. Admins want quick actions, not lengthy explanations.
- When asked to do something, just do it. Confirm what you did briefly.
- When listing topics, show them in a clean, scannable format.
- When editing, show a brief before/after summary.
- If an action is destructive (delete), proceed when asked — the admin knows what they're doing.
- Use markdown formatting for clean output.
- Every time you reference a topic, conversation, or other entity, link to it using the app URL templates below.

App URL templates:
- Homepage: /
- Topic page: /topic/{slug} (e.g. /topic/why-cant-we-just-use-solar-panels)
- Conversation page: /conversation/{id} (e.g. /conversation/abc123-def456)
- Ask a question: /ask
- Admin panel: /admin

Always link entity references as markdown links. For example, when listing topics, make each topic title a link: [Why can't we just use solar panels?](/topic/why-cant-we-just-use-solar-panels). When mentioning a conversation, link it: [conversation](/conversation/{id}).

The three categories:
- 1 (❌ Can't work): There's a fundamental reason this can't work
- 2 (👍 Someone's on it): It's a good idea and someone is already working on it
- 3 (✅ Novel idea): It's a good idea and no one has done it yet

Argument positions: "for" (why it could work) or "against" (why it can't work).`;

export const ADMIN_TOOL_DEFINITIONS = [
  {
    name: "list_topics",
    description:
      "List topics in the archive. Can search by keyword or list all with pagination.",
    input_schema: {
      type: "object" as const,
      properties: {
        search: {
          type: "string",
          description: "Optional search query to filter topics",
        },
        limit: {
          type: "number",
          description: "Max number of topics to return (default 20)",
        },
        offset: {
          type: "number",
          description: "Offset for pagination (default 0)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_topic",
    description:
      "Get a single topic with all its arguments. Use topic ID or slug.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "Topic UUID",
        },
        slug: {
          type: "string",
          description: "Topic slug (alternative to id)",
        },
      },
      required: [],
    },
  },
  {
    name: "update_topic",
    description:
      "Update a topic's fields. Only include fields you want to change.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "Topic UUID to update",
        },
        question: {
          type: "string",
          description: "New question text",
        },
        category: {
          type: "number",
          enum: [1, 2, 3],
          description: "New category",
        },
        summary: {
          type: "string",
          description: "New summary/reasoning text",
        },
        llm_perspective: {
          type: "string",
          description: "New LLM perspective/assessment text",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_topic",
    description:
      "Delete a topic and all its associated arguments. This is irreversible.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "Topic UUID to delete",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "create_topic",
    description: "Create a new topic from scratch.",
    input_schema: {
      type: "object" as const,
      properties: {
        question: {
          type: "string",
          description: 'The "why can\'t we just...?" question',
        },
        category: {
          type: "number",
          enum: [1, 2, 3],
          description: "Category: 1=can't work, 2=someone's on it, 3=novel idea",
        },
        summary: {
          type: "string",
          description: "Summary/reasoning for the categorization",
        },
        llm_perspective: {
          type: "string",
          description: "LLM assessment text",
        },
        arguments_for: {
          type: "array",
          items: { type: "string" },
          description: "Arguments for why this idea could work",
        },
        arguments_against: {
          type: "array",
          items: { type: "string" },
          description: "Arguments against why this idea could work",
        },
      },
      required: ["question", "category"],
    },
  },
  {
    name: "update_argument",
    description: "Update an argument's text or position.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "Argument UUID to update",
        },
        summary: {
          type: "string",
          description: "New argument text",
        },
        position: {
          type: "string",
          enum: ["for", "against"],
          description: "New position",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_argument",
    description: "Delete an argument.",
    input_schema: {
      type: "object" as const,
      properties: {
        id: {
          type: "string",
          description: "Argument UUID to delete",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "create_argument",
    description: "Create a new argument for a topic.",
    input_schema: {
      type: "object" as const,
      properties: {
        topic_id: {
          type: "string",
          description: "Topic UUID to add the argument to",
        },
        position: {
          type: "string",
          enum: ["for", "against"],
          description: 'Argument position: "for" or "against"',
        },
        summary: {
          type: "string",
          description: "The argument text",
        },
      },
      required: ["topic_id", "position", "summary"],
    },
  },
  {
    name: "get_stats",
    description: "Get archive statistics: total topics, arguments, breakdown by category.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];
