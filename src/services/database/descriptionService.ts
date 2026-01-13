import { openai as openaiProvider } from '@ai-sdk/openai';
import { generateText } from 'ai';

export interface DescriptionInput {
  title: string;
  content?: string;
  link?: string;
  metadata?: {
    source?: string;
    channel_name?: string;
    author?: string;
    site_name?: string;
  };
  type?: string;
  dimensions?: string[];
}

/**
 * Generate a 280-character description for a knowledge node.
 * Contextually grounded - adapts to node type (person, concept, article, etc.)
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

    // Ensure within character limit
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
  const lines: string[] = [`Title: ${input.title}`];

  if (input.link) lines.push(`URL: ${input.link}`);
  if (input.dimensions?.length) lines.push(`Dimensions: ${input.dimensions.join(', ')}`);
  if (input.metadata?.channel_name) lines.push(`Channel: ${input.metadata.channel_name}`);
  if (input.metadata?.author) lines.push(`Author: ${input.metadata.author}`);
  if (input.metadata?.site_name) lines.push(`Site: ${input.metadata.site_name}`);

  const contentPreview = input.content?.slice(0, 800) || '';
  if (contentPreview) lines.push(`Content: ${contentPreview}${input.content && input.content.length > 800 ? '...' : ''}`);

  return `Your job is to do your best to answer 'what is this' - the most simple, high level contextual information of what this thing is. Users will be adding a variety of different nodes (ideas, books, podcasts, people, papers etc). Do your best to take the available information and infer what it is - high level. If unsure, that's fine just give your best guess and say you're unsure. Max 280 characters.

${lines.join('\n')}`;
}

export const descriptionService = {
  generateDescription
};
