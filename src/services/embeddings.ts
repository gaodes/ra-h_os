import OpenAI from 'openai';
import { apiKeyService } from './storage/apiKeys';

// Initialize OpenAI client with dynamic API key support
function getOpenAiClient(): OpenAI {
  const apiKey = apiKeyService.getOpenAiKey();
  if (!apiKey) {
    throw new Error('OpenAI API key required. Please:\n1. Click the Settings icon (⚙️) in the bottom left\n2. Go to API Keys tab\n3. Add your OpenAI API key\n\nGet your key at: https://platform.openai.com/api-keys');
  }
  return new OpenAI({ apiKey });
}

export class EmbeddingService {
  /**
   * Generate embedding for a search query using OpenAI's text-embedding-3-small model
   * This matches the same model used in embed_universal.py for consistency
   */
  static async generateQueryEmbedding(query: string): Promise<number[]> {
    try {
      const openai = getOpenAiClient();
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: query.trim(),
        encoding_format: "float"
      });

      if (!response.data?.[0]?.embedding) {
        throw new Error('No embedding returned from OpenAI API');
      }

      return response.data[0].embedding;
    } catch (error) {
      console.error('Failed to generate query embedding:', error);
      throw new Error(`Embedding generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate embedding dimensions match expected size (1536 for text-embedding-3-small)
   */
  static validateEmbedding(embedding: number[]): boolean {
    return Array.isArray(embedding) && embedding.length === 1536;
  }
}