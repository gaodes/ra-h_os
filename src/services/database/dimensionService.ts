import { getSQLiteClient } from './sqlite-client';
import { openai as openaiProvider } from '@ai-sdk/openai';
import { generateText } from 'ai';

export interface Dimension {
  name: string;
  description: string | null;
  is_priority: boolean;
  updated_at: string;
}

export interface LockedDimension {
  name: string;
  description: string | null;
  count: number;
}

export class DimensionService {
  /**
   * Get all locked (priority) dimensions with their descriptions
   */
  static async getLockedDimensions(): Promise<LockedDimension[]> {
    const sqlite = getSQLiteClient();
    
    const result = sqlite.query(`
      WITH dimension_counts AS (
        SELECT nd.dimension, COUNT(*) AS count 
        FROM node_dimensions nd 
        GROUP BY nd.dimension
      )
      SELECT 
        d.name,
        d.description,
        COALESCE(dc.count, 0) AS count
      FROM dimensions d
      LEFT JOIN dimension_counts dc ON dc.dimension = d.name
      WHERE d.is_priority = 1
      ORDER BY d.name ASC
    `);

    return result.rows.map((row: any) => ({
      name: row.name,
      description: row.description,
      count: Number(row.count)
    }));
  }

  /**
   * Automatically assign locked dimensions + suggest keyword dimensions
   * Returns { locked: string[], keywords: string[] }
   */
  static async assignDimensions(nodeData: {
    title: string;
    content?: string;
    link?: string;
  }): Promise<{ locked: string[]; keywords: string[] }> {
    try {
      const lockedDimensions = await this.getLockedDimensions();

      if (lockedDimensions.length === 0) {
        console.log('[DimensionAssignment] No locked dimensions available');
        return { locked: [], keywords: [] };
      }

      const prompt = this.buildAssignmentPrompt(nodeData, lockedDimensions);

      console.log(`[DimensionAssignment] Processing: "${nodeData.title}"`);

      const response = await generateText({
        model: openaiProvider('gpt-4o-mini'),
        prompt,
        maxOutputTokens: 150, // Increased for two-part response
        temperature: 0.1,
      });

      console.log(`[DimensionAssignment] AI Response:\n${response.text}`);

      const result = this.parseAssignmentResponse(response.text, lockedDimensions);

      console.log(`[DimensionAssignment] Locked: ${result.locked.join(', ') || 'none'}`);
      console.log(`[DimensionAssignment] Keywords: ${result.keywords.join(', ') || 'none'}`);

      return result;

    } catch (error) {
      console.error('[DimensionAssignment] Error:', error);
      return { locked: [], keywords: [] };
    }
  }

  /**
   * Legacy method for backwards compatibility
   * @deprecated Use assignDimensions() instead
   */
  static async assignLockedDimensions(nodeData: {
    title: string;
    content?: string;
    link?: string;
  }): Promise<string[]> {
    const result = await this.assignDimensions(nodeData);
    return result.locked;
  }

  /**
   * Update dimension description
   */
  static async updateDimensionDescription(name: string, description: string): Promise<void> {
    const sqlite = getSQLiteClient();
    
    sqlite.query(`
      INSERT INTO dimensions(name, description, is_priority, updated_at) 
      VALUES (?, ?, 0, CURRENT_TIMESTAMP) 
      ON CONFLICT(name) DO UPDATE SET 
        description = ?, 
        updated_at = CURRENT_TIMESTAMP
    `, [name, description, description]);
  }

  /**
   * Get dimension by name with description
   */
  static async getDimensionByName(name: string): Promise<Dimension | null> {
    const sqlite = getSQLiteClient();
    
    const result = sqlite.query(`
      SELECT name, description, is_priority, updated_at 
      FROM dimensions 
      WHERE name = ?
    `, [name]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as any;
    return {
      name: row.name,
      description: row.description,
      is_priority: Boolean(row.is_priority),
      updated_at: row.updated_at
    };
  }

  /**
   * Build AI prompt for dimension assignment (locked + keyword dimensions)
   */
  private static buildAssignmentPrompt(
    nodeData: { title: string; content?: string; link?: string },
    lockedDimensions: LockedDimension[]
  ): string {
    const contentPreview = nodeData.content?.slice(0, 1000) || '';

    // Only include dimensions that have descriptions
    const dimensionsWithDescriptions = lockedDimensions.filter(d => d.description && d.description.trim().length > 0);

    const dimensionsList = dimensionsWithDescriptions
      .map(d => `DIMENSION: "${d.name}"\nDESCRIPTION: ${d.description}`)
      .join('\n---\n');

    return `You are categorizing a knowledge node. You will:
1. Assign LOCKED dimensions (from a provided list)
2. Suggest KEYWORD dimensions (to aid searchability)

=== NODE TO CATEGORIZE ===
Title: ${nodeData.title}
Content: ${contentPreview}${nodeData.content && nodeData.content.length > 1000 ? '...' : ''}
URL: ${nodeData.link || 'none'}

=== PART 1: LOCKED DIMENSIONS ===
CRITICAL: Read each dimension's DESCRIPTION carefully.
The description defines what belongs in that dimension.
Only assign if the content CLEARLY matches the description.
If unsure, skip it — better to miss than assign incorrectly.
Maximum 3 locked dimensions.

AVAILABLE LOCKED DIMENSIONS:
${dimensionsList}

=== PART 2: KEYWORD DIMENSIONS ===
Suggest 1-3 simple, lowercase keywords that:
- Capture the ESSENCE of this content
- Make it easily SEARCHABLE
- Are thoughtful and aid organization

Good keywords: ai, podcast, paper, productivity, machine-learning, book, video, interview, tutorial, framework
If unsure what keywords fit, respond with "none" — no noise is better than bad tags.

=== RESPONSE FORMAT ===
LOCKED:
[dimension names from the list above, one per line, or "none"]

KEYWORDS:
[lowercase keyword suggestions, one per line, or "none"]`;
  }

  /**
   * Parse AI response and extract locked + keyword dimensions
   */
  private static parseAssignmentResponse(
    response: string,
    availableDimensions: LockedDimension[]
  ): { locked: string[]; keywords: string[] } {
    const lockedDimensions: string[] = [];
    const keywordDimensions: string[] = [];

    // Split response into LOCKED and KEYWORDS sections
    const lockedMatch = response.match(/LOCKED:\s*([\s\S]*?)(?=KEYWORDS:|$)/i);
    const keywordsMatch = response.match(/KEYWORDS:\s*([\s\S]*?)$/i);

    // Parse LOCKED section
    if (lockedMatch) {
      const lockedLines = lockedMatch[1].trim().split('\n');
      for (const line of lockedLines) {
        const dimensionName = line.trim().toLowerCase();

        if (dimensionName === 'none' || dimensionName === '') {
          continue;
        }

        // Find matching dimension (case-insensitive)
        const matchedDimension = availableDimensions.find(
          d => d.name.toLowerCase() === dimensionName
        );

        if (matchedDimension && !lockedDimensions.includes(matchedDimension.name)) {
          lockedDimensions.push(matchedDimension.name);

          // Limit to 3 locked dimensions
          if (lockedDimensions.length >= 3) {
            break;
          }
        }
      }
    }

    // Parse KEYWORDS section
    if (keywordsMatch) {
      const keywordLines = keywordsMatch[1].trim().split('\n');
      for (const line of keywordLines) {
        // Clean and normalize keyword
        const keyword = line.trim().toLowerCase()
          .replace(/[^a-z0-9-]/g, '') // Only allow lowercase letters, numbers, hyphens
          .slice(0, 30); // Max 30 chars per keyword

        if (keyword === 'none' || keyword === '' || keyword.length < 2) {
          continue;
        }

        if (!keywordDimensions.includes(keyword)) {
          keywordDimensions.push(keyword);

          // Limit to 3 keywords
          if (keywordDimensions.length >= 3) {
            break;
          }
        }
      }
    }

    return { locked: lockedDimensions, keywords: keywordDimensions };
  }

  /**
   * Create or get a keyword dimension (unlocked)
   */
  static async ensureKeywordDimension(keyword: string): Promise<void> {
    const sqlite = getSQLiteClient();

    // INSERT OR IGNORE - if dimension exists, do nothing
    sqlite.query(`
      INSERT OR IGNORE INTO dimensions(name, description, is_priority, updated_at)
      VALUES (?, ?, 0, CURRENT_TIMESTAMP)
    `, [keyword, null]);
  }
}

export const dimensionService = new DimensionService();