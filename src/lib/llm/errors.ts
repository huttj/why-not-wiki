import Anthropic from "@anthropic-ai/sdk";

export function getUserFriendlyError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    switch (err.status) {
      case 400:
        if (
          typeof err.message === "string" &&
          err.message.includes("credit balance")
        ) {
          return "The AI service is temporarily unavailable due to a billing issue. Please try again later.";
        }
        return "The AI service received an invalid request. Please try again.";
      case 401:
        return "The AI service could not authenticate. Please try again later.";
      case 403:
        return "Access to the AI service is currently restricted. Please try again later.";
      case 429:
        return "The AI service is currently experiencing high demand. Please wait a moment and try again.";
      case 500:
      case 502:
      case 503:
        return "The AI service is temporarily unavailable. Please try again in a few minutes.";
      default:
        return "Something went wrong with the AI service. Please try again later.";
    }
  }

  if (err instanceof Error) {
    // Catch any error messages that leak raw API details
    if (err.message.includes("credit balance") || err.message.includes("billing")) {
      return "The AI service is temporarily unavailable due to a billing issue. Please try again later.";
    }
    if (err.message.includes("rate limit") || err.message.includes("429")) {
      return "The AI service is currently experiencing high demand. Please wait a moment and try again.";
    }
  }

  return "Something went wrong. Please try again later.";
}
