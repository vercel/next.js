import "server-only";
import type { GenerateContentRequest, GenerateContentResponse } from "./types";

/**
 * AI Content Generation Client
 * Generates marketing content using AI (supports Claude, OpenAI, etc.)
 */

const API_KEY = process.env.OPENAI_API_KEY || process.env.CLAUDE_API_KEY;
const API_ENDPOINT = process.env.AI_API_ENDPOINT || "https://api.anthropic.com/v1/messages";

export async function generateContent(
  request: GenerateContentRequest
): Promise<GenerateContentResponse> {
  if (!API_KEY) {
    throw new Error(
      "AI API key not configured. Set OPENAI_API_KEY or CLAUDE_API_KEY environment variable."
    );
  }

  const { prompt, type, tone = "professional", maxLength = 1000 } = request;

  // Build the system prompt based on content type
  const systemPrompt = buildSystemPrompt(type, tone);

  // Detect if using Claude or OpenAI based on key prefix
  const isClaudeKey = API_KEY.startsWith("sk-ant-");

  try {
    if (isClaudeKey) {
      // Use Claude API
      const response = await fetch(API_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-sonnet-20241022",
          max_tokens: maxLength,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Claude API error: ${error.error?.message || "Unknown error"}`);
      }

      const data = await response.json();
      return {
        content: data.content[0].text,
        tokensUsed: data.usage.input_tokens + data.usage.output_tokens,
        model: data.model,
      };
    } else {
      // Use OpenAI API
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4-turbo-preview",
          messages: [
            {
              role: "system",
              content: systemPrompt,
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: maxLength,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`OpenAI API error: ${error.error?.message || "Unknown error"}`);
      }

      const data = await response.json();
      return {
        content: data.choices[0].message.content,
        tokensUsed: data.usage.total_tokens,
        model: data.model,
      };
    }
  } catch (error) {
    throw new Error(
      `Failed to generate content: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

function buildSystemPrompt(type: GenerateContentRequest["type"], tone: string): string {
  const prompts = {
    "ad-copy": `You are an expert advertising copywriter. Create compelling, concise ad copy that drives conversions. Use a ${tone} tone.`,
    "blog-post": `You are a professional content writer. Create engaging, informative blog content. Use a ${tone} tone.`,
    "social-media": `You are a social media expert. Create engaging, shareable social media content. Use a ${tone} tone.`,
    email: `You are an email marketing specialist. Create compelling email content that drives engagement. Use a ${tone} tone.`,
  };

  return prompts[type] || prompts["ad-copy"];
}
