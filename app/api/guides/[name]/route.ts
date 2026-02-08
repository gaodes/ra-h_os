import { NextRequest, NextResponse } from 'next/server';
import { readGuide, deleteGuide } from '@/services/guides/guideService';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const guide = readGuide(name);
    if (!guide) {
      return NextResponse.json(
        { success: false, error: `Guide "${name}" not found` },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: guide });
  } catch (error) {
    console.error('[API /guides/[name]] error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to read guide' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const result = deleteGuide(name);
    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: true, message: `Guide "${name}" deleted` });
  } catch (error) {
    console.error('[API /guides/[name] DELETE] error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete guide' },
      { status: 500 }
    );
  }
}
