import { openai as openaiProvider } from '@ai-sdk/openai';
import { generateText } from 'ai';

export interface DescriptionInput {
  title: string;
  content?: string;
  metadata?: {
    source?: string;
    channel_name?: string;
    author?: string;
    site_name?: string;
  };
  type?: string;
}

/**
 * Generate a 280-character description for a knowledge node.
 * The description starts with "This is a..." and identifies the content type.
 */
export async function generateDescription(input: DescriptionInput): Promise<string> {
  try {
    const prompt = buildDescriptionPrompt(input);

    console.log(`[DescriptionService] Generating description for: "${input.title}"`);

    const response = await generateText({
      model: openaiProvider('gpt-4o-mini'),
      prompt,
      maxOutputTokens: 100,
      temperature: 0.3,
    });

    const description = response.text.trim();

    // Ensure it starts with "This is a" and is within limit
    const finalDescription = description.slice(0, 280);

    console.log(`[DescriptionService] Generated: "${finalDescription}"`);

    return finalDescription;
  } catch (error) {
    console.error('[DescriptionService] Error generating description:', error);
    // Return a fallback description
    return `This is a ${input.type || 'knowledge item'} titled "${input.title.slice(0, 200)}".`;
  }
}

function buildDescriptionPrompt(input: DescriptionInput): string {
  const metadataLines: string[] = [];

  if (input.metadata?.source) {
    metadataLines.push(`Source: ${input.metadata.source}`);
  }
  if (input.metadata?.channel_name) {
    metadataLines.push(`Channel: ${input.metadata.channel_name}`);
  }
  if (input.metadata?.author) {
    metadataLines.push(`Author: ${input.metadata.author}`);
  }
  if (input.metadata?.site_name) {
    metadataLines.push(`Site: ${input.metadata.site_name}`);
  }
  if (input.type) {
    metadataLines.push(`Type: ${input.type}`);
  }

  const contentPreview = input.content?.slice(0, 500) || '';

  return `Generate a concise description (max 280 characters) for this knowledge item.

CRITICAL REQUIREMENTS:
- Start with "This is a..."
- Identify the content type (article, video, paper, podcast episode, tweet, book, tutorial, etc.)
- Be specific about what the content covers
- Maximum 280 characters total

=== KNOWLEDGE ITEM ===
Title: ${input.title}
${metadataLines.length > 0 ? metadataLines.join('\n') : ''}
${contentPreview ? `\nContent preview: ${contentPreview}${input.content && input.content.length > 500 ? '...' : ''}` : ''}

=== YOUR RESPONSE ===
Write ONLY the description, nothing else. Start with "This is a..."`;
}

export const descriptionService = {
  generateDescription
};
