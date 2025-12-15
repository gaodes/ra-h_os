/**
 * Server-Sent Events (SSE) API Route
 * Streams real-time database change events to connected clients
 */

import { eventBroadcaster } from '@/services/events';

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Add this connection to the broadcaster
      console.log('🔌 New SSE connection established');
      eventBroadcaster.addConnection(controller);
      console.log('📊 Total SSE connections:', eventBroadcaster.getConnectionCount());

      // Send initial connection confirmation
      const initialMessage = `data: ${JSON.stringify({
        type: 'CONNECTION_ESTABLISHED',
        data: { timestamp: Date.now() }
      })}\n\n`;
      
      controller.enqueue(encoder.encode(initialMessage));

      // Store controller reference for cleanup
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (controller as any)._cleanup = () => {
        console.log('🔌 SSE connection cleanup');
        eventBroadcaster.removeConnection(controller);
      };
    },
    
    cancel(controller) {
      // Clean up when client disconnects
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((controller as any)._cleanup) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (controller as any)._cleanup();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  });
}