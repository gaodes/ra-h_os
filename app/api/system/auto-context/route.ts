import { NextRequest, NextResponse } from 'next/server';
import {
  getAutoContextSettings,
  setAutoContextEnabled,
} from '@/services/settings/autoContextSettings';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const settings = getAutoContextSettings();
    return NextResponse.json({ success: true, data: settings });
  } catch (error) {
    console.error('Failed to read auto-context settings:', error);
    return NextResponse.json(
      { success: false, error: 'Unable to read auto-context settings' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body.autoContextEnabled !== 'boolean') {
      return NextResponse.json(
        { success: false, error: 'autoContextEnabled boolean is required' },
        { status: 400 }
      );
    }

    const updated = setAutoContextEnabled(body.autoContextEnabled);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Failed to update auto-context settings:', error);
    return NextResponse.json(
      { success: false, error: 'Unable to update auto-context settings' },
      { status: 500 }
    );
  }
}
