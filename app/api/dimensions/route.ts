import { NextRequest, NextResponse } from 'next/server';
import { getSQLiteClient } from '@/services/database/sqlite-client';
import { eventBroadcaster } from '@/services/events';
import { DimensionService } from '@/services/database/dimensionService';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const sqlite = getSQLiteClient();

    // Get all dimensions with their counts
    const result = sqlite.query(`
      WITH dimension_counts AS (
        SELECT nd.dimension, COUNT(*) AS count
        FROM node_dimensions nd
        GROUP BY nd.dimension
      )
      SELECT
        d.name AS dimension,
        d.description,
        d.icon,
        d.is_priority AS isPriority,
        COALESCE(dc.count, 0) AS count
      FROM dimensions d
      LEFT JOIN dimension_counts dc ON dc.dimension = d.name
      ORDER BY d.is_priority DESC, d.name ASC
    `);

    return NextResponse.json({
      success: true,
      data: result.rows.map((row: any) => ({
        dimension: row.dimension,
        description: row.description,
        icon: row.icon || null,
        isPriority: Boolean(row.isPriority),
        count: Number(row.count)
      }))
    });
  } catch (error) {
    console.error('Error fetching dimensions:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch dimensions'
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawName = typeof body?.name === 'string' ? body.name.trim() : '';
    const description = typeof body?.description === 'string' ? body.description.trim() : null;
    const icon = typeof body?.icon === 'string' ? body.icon.trim() : null;
    const isPriority = typeof body?.isPriority === 'boolean' ? body.isPriority : false;
    
    if (!rawName) {
      return NextResponse.json({
        success: false,
        error: 'Dimension name is required'
      }, { status: 400 });
    }

    if (description && description.length > 500) {
      return NextResponse.json({
        success: false,
        error: 'Description must be 500 characters or less'
      }, { status: 400 });
    }

    const sqlite = getSQLiteClient();
    const result = sqlite.query(`
      INSERT INTO dimensions(name, description, icon, is_priority, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(name) DO UPDATE SET
        description = COALESCE(?, description),
        icon = COALESCE(?, icon),
        is_priority = COALESCE(?, is_priority),
        updated_at = CURRENT_TIMESTAMP
      RETURNING name, description, icon, is_priority
    `, [rawName, description, icon, isPriority ? 1 : 0, description, icon, isPriority ? 1 : 0]);

    if (result.rows.length === 0) {
      throw new Error('Failed to create dimension');
    }

    const row = result.rows[0];
    const dimension = row.name as string;
    const isPriorityValue = Boolean(row.is_priority);
    const descriptionValue = row.description as string | null;

    eventBroadcaster.broadcast({
      type: 'DIMENSION_UPDATED',
      data: { dimension, isPriority: isPriorityValue, description: descriptionValue, count: 0 }
    });

    return NextResponse.json({
      success: true,
      data: {
        dimension,
        description: descriptionValue,
        isPriority: isPriorityValue
      }
    });
  } catch (error) {
    console.error('Error creating dimension:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create dimension'
    }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const currentName = typeof body?.currentName === 'string' ? body.currentName.trim() : '';
    const newName = typeof body?.newName === 'string' ? body.newName.trim() : '';
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const description = typeof body?.description === 'string' ? body.description.trim() : '';
    const isPriority = typeof body?.isPriority === 'boolean' ? body.isPriority : undefined;
    
    // Handle isPriority update (lock/unlock) - simple case
    if (isPriority !== undefined && name && !currentName && !newName) {
      const sqlite = getSQLiteClient();
      const updateResult = sqlite.prepare(`
        UPDATE dimensions 
        SET is_priority = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE name = ?
      `).run(isPriority ? 1 : 0, name);

      if (updateResult.changes === 0) {
        return NextResponse.json({
          success: false,
          error: 'Dimension not found'
        }, { status: 404 });
      }

      eventBroadcaster.broadcast({
        type: 'DIMENSION_UPDATED',
        data: { dimension: name, isPriority }
      });

      return NextResponse.json({
        success: true,
        data: { dimension: name, isPriority }
      });
    }
    
    // Handle dimension name change
    if (currentName && newName && currentName !== newName) {
      if (!newName) {
        return NextResponse.json({
          success: false,
          error: 'New dimension name is required'
        }, { status: 400 });
      }

      const sqlite = getSQLiteClient();
      
      // Check if new name already exists
      const existingCheck = sqlite.query(`
        SELECT name FROM dimensions WHERE name = ?
      `, [newName]);

      if (existingCheck.rows.length > 0) {
        return NextResponse.json({
          success: false,
          error: 'A dimension with this name already exists'
        }, { status: 400 });
      }

      // Update dimension name in transaction (also handle description and isPriority if provided)
      const updateResult = sqlite.transaction(() => {
        // Build update query with optional fields
        const updates: string[] = ['name = ?', 'updated_at = CURRENT_TIMESTAMP'];
        const values: any[] = [newName];
        
        if (description !== '') {
          updates.push('description = ?');
          values.push(description || null);
        }
        
        if (isPriority !== undefined) {
          updates.push('is_priority = ?');
          values.push(isPriority ? 1 : 0);
        }
        
        values.push(currentName);
        
        const dimUpdate = sqlite.prepare(`
          UPDATE dimensions 
          SET ${updates.join(', ')}
          WHERE name = ?
        `).run(...values);

        // Update node_dimensions table
        const nodeDimUpdate = sqlite.prepare(`
          UPDATE node_dimensions 
          SET dimension = ? 
          WHERE dimension = ?
        `).run(newName, currentName);

        return {
          dimensionUpdated: dimUpdate.changes > 0,
          nodeLinksUpdated: nodeDimUpdate.changes
        };
      });

      if (!updateResult.dimensionUpdated) {
        return NextResponse.json({
          success: false,
          error: 'Dimension not found'
        }, { status: 404 });
      }

      eventBroadcaster.broadcast({
        type: 'DIMENSION_UPDATED',
        data: { 
          dimension: newName, 
          previousName: currentName,
          description: description || undefined,
          isPriority: isPriority !== undefined ? isPriority : undefined,
          renamed: true 
        }
      });

      return NextResponse.json({
        success: true,
        data: {
          dimension: newName,
          previousName: currentName,
          description: description || undefined,
          isPriority: isPriority !== undefined ? isPriority : undefined,
          nodeLinksUpdated: updateResult.nodeLinksUpdated
        }
      });
    }

    // Handle description and/or isPriority update (existing functionality)
    const targetName = name || currentName;
    if (!targetName) {
      return NextResponse.json({
        success: false,
        error: 'Dimension name is required'
      }, { status: 400 });
    }

    if (description && description.length > 500) {
      return NextResponse.json({
        success: false,
        error: 'Description must be 500 characters or less'
      }, { status: 400 });
    }

    const sqlite = getSQLiteClient();
    
    // Build update query
    if (description !== '' || isPriority !== undefined) {
      const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
      const values: any[] = [];
      
      if (description !== '') {
        updates.push('description = ?');
        values.push(description || null);
      }
      
      if (isPriority !== undefined) {
        updates.push('is_priority = ?');
        values.push(isPriority ? 1 : 0);
      }
      
      values.push(targetName);
      
      const updateResult = sqlite.prepare(`
        UPDATE dimensions 
        SET ${updates.join(', ')}
        WHERE name = ?
      `).run(...values);

      if (updateResult.changes === 0) {
        return NextResponse.json({
          success: false,
          error: 'Dimension not found'
        }, { status: 404 });
      }
    } else {
      // No updates provided
      return NextResponse.json({
        success: false,
        error: 'At least one update field (description or isPriority) must be provided'
      }, { status: 400 });
    }

    eventBroadcaster.broadcast({
      type: 'DIMENSION_UPDATED',
      data: { 
        dimension: targetName, 
        description: description !== '' ? description : undefined,
        isPriority: isPriority !== undefined ? isPriority : undefined
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        dimension: targetName,
        description: description !== '' ? description : undefined,
        isPriority: isPriority !== undefined ? isPriority : undefined
      }
    });
  } catch (error) {
    console.error('Error updating dimension:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update dimension'
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const dimension = (request.nextUrl.searchParams.get('name') || '').trim();
    if (!dimension) {
      return NextResponse.json({
        success: false,
        error: 'Dimension name is required'
      }, { status: 400 });
    }

    const sqlite = getSQLiteClient();
    const removal = sqlite.transaction(() => {
      const nodeDimStmt = sqlite.prepare('DELETE FROM node_dimensions WHERE dimension = ?');
      const dimStmt = sqlite.prepare('DELETE FROM dimensions WHERE name = ?');
      const removedLinks = nodeDimStmt.run(dimension).changes ?? 0;
      const removedRow = dimStmt.run(dimension).changes ?? 0;
      return {
        removedLinks,
        removedRow
      };
    });

    if (!removal.removedLinks && !removal.removedRow) {
      return NextResponse.json({
        success: false,
        error: 'Dimension not found'
      }, { status: 404 });
    }

    eventBroadcaster.broadcast({
      type: 'DIMENSION_UPDATED',
      data: { dimension, deleted: true }
    });

    return NextResponse.json({
      success: true,
      data: {
        dimension,
        deleted: true
      }
    });
  } catch (error) {
    console.error('Error deleting dimension:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to delete dimension'
    }, { status: 500 });
  }
}
