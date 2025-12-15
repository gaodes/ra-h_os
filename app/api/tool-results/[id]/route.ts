import { NextRequest } from 'next/server';
import { resultCache } from '@/services/tools/resultCache';

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params; // Next.js 15: params is a Promise
    const data = resultCache.get(id);
    if (!data) {
      return new Response(JSON.stringify({ success: false, error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e?.message || 'Failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
