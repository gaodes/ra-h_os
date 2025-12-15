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
   * Automatically assign locked dimensions to a node based on its content
   */
  static async assignLockedDimensions(nodeData: {
    title: string;
    content?: string;
    link?: string;
  }): Promise<string[]> {
    try {
      const lockedDimensions = await this.getLockedDimensions();
      
      if (lockedDimensions.length === 0) {
        console.log('No locked dimensions available for assignment');
        return [];
      }

      const prompt = this.buildAssignmentPrompt(nodeData, lockedDimensions);
      
      const response = await generateText({
        model: openaiProvider('gpt-4o-mini'),
        prompt,
        maxOutputTokens: 100,
        temperature: 0.1, // Low temperature for consistent results
      });

      const assignedDimensions = this.parseAssignmentResponse(response.text, lockedDimensions);
      
      console.log(`Assigned dimensions for "${nodeData.title}": ${assignedDimensions.join(', ')}`);
      return assignedDimensions;

    } catch (error) {
      console.error('Error assigning dimensions:', error);
      return []; // Graceful fallback
    }
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
   * Build AI prompt for dimension assignment
   */
  private static buildAssignmentPrompt(
    nodeData: { title: string; content?: string; link?: string },
    lockedDimensions: LockedDimension[]
  ): string {
    const contentPreview = nodeData.content?.slice(0, 500) || '';
    const dimensionsList = lockedDimensions
      .map(d => `- ${d.name}: ${d.description || `Infer purpose from name: ${d.name}`}`)
      .join('\n');

    return `Analyze this node content and assign appropriate dimensions from the available locked dimensions.

Node:
Title: ${nodeData.title}
Content: ${contentPreview}${nodeData.content && nodeData.content.length > 500 ? '...' : ''}
URL: ${nodeData.link || 'none'}

Available Locked Dimensions:
${dimensionsList}

Return only the dimension names that best match this content, maximum 3 dimensions.
Respond with just the dimension names, one per line.
If no dimensions are appropriate, respond with "none".

Examples of good responses:
Work
Learning

or

Research
Ideas
Tech

or

none`;
  }

  /**
   * Parse AI response and validate dimension names
   */
  private static parseAssignmentResponse(
    response: string, 
    availableDimensions: LockedDimension[]
  ): string[] {
    const lines = response.trim().toLowerCase().split('\n');
    const availableNames = availableDimensions.map(d => d.name.toLowerCase());
    const validDimensions: string[] = [];

    for (const line of lines) {
      const dimensionName = line.trim();
      
      if (dimensionName === 'none') {
        break;
      }
      
      // Find matching dimension (case-insensitive)
      const matchedDimension = availableDimensions.find(
        d => d.name.toLowerCase() === dimensionName
      );
      
      if (matchedDimension && !validDimensions.includes(matchedDimension.name)) {
        validDimensions.push(matchedDimension.name);
        
        // Limit to 3 dimensions max
        if (validDimensions.length >= 3) {
          break;
        }
      }
    }

    return validDimensions;
  }
}

export const dimensionService = new DimensionService();