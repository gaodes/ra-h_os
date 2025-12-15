import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 900;

class DelegationStreamBroadcaster {
  private connections = new Map<string, Set<ReadableStreamDefaultController>>();
  private pendingMessages = new Map<string, any[]>();
  private encoder = new TextEncoder();

  private encode(message: any) {
    return `data: ${JSON.stringify({ ...message, timestamp: Date.now() })}\n\n`;
  }

  private send(controller: ReadableStreamDefaultController, encoded: string) {
    try {
      controller.enqueue(this.encoder.encode(encoded));
      return true;
    } catch (error) {
      console.log('[DelegationStream] Removing dead connection', error);
      return false;
    }
  }

  addConnection(sessionId: string, controller: ReadableStreamDefaultController) {
    if (!this.connections.has(sessionId)) {
      this.connections.set(sessionId, new Set());
    }
    this.connections.get(sessionId)!.add(controller);
    console.log(`[DelegationStream] Connection added for ${sessionId}, total: ${this.connections.get(sessionId)!.size}`);

    const backlog = this.pendingMessages.get(sessionId);
    if (backlog && backlog.length > 0) {
      console.log(`[DelegationStream] Flushing ${backlog.length} queued events for ${sessionId}`);
      for (const message of backlog) {
        const encoded = this.encode(message);
        const delivered = this.send(controller, encoded);
        if (!delivered) {
          this.removeConnection(sessionId, controller);
          break;
        }
      }
      if ((this.connections.get(sessionId)?.size || 0) > 0) {
        this.pendingMessages.delete(sessionId);
      }
    }
  }

  removeConnection(sessionId: string, controller: ReadableStreamDefaultController) {
    const sessionConns = this.connections.get(sessionId);
    if (sessionConns) {
      sessionConns.delete(controller);
      console.log(`[DelegationStream] Connection removed from ${sessionId}, remaining: ${sessionConns.size}`);
      if (sessionConns.size === 0) {
        this.connections.delete(sessionId);
      }
    }
  }

  broadcast(sessionId: string, message: any) {
    const sessionConns = this.connections.get(sessionId);
    if (!sessionConns || sessionConns.size === 0) {
      const queue = this.pendingMessages.get(sessionId) ?? [];
      queue.push(message);
      // Prevent unbounded growth by keeping the latest 200 events
      if (queue.length > 200) {
        queue.splice(0, queue.length - 200);
      }
      this.pendingMessages.set(sessionId, queue);
      console.log(`[DelegationStream] Queued event for ${sessionId}, pending=${queue.length}`);
      return;
    }

    const encoded = this.encode(message);

    let successCount = 0;
    const staleControllers: ReadableStreamDefaultController[] = [];
    for (const controller of sessionConns) {
      if (this.send(controller, encoded)) {
        successCount++;
      } else {
        staleControllers.push(controller);
      }
    }

    if (staleControllers.length > 0) {
      staleControllers.forEach((controller) => sessionConns.delete(controller));
    }

    console.log(`[DelegationStream] Broadcasted to ${successCount}/${sessionConns.size} connections for ${sessionId}`);
  }

  sendKeepAlive(sessionId: string) {
    const sessionConns = this.connections.get(sessionId);
    if (!sessionConns) return;

    const ping = this.encoder.encode(`: keep-alive\n\n`);

    for (const controller of sessionConns) {
      try {
        controller.enqueue(ping);
      } catch {
        sessionConns.delete(controller);
      }
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var delegationStreamBroadcaster: DelegationStreamBroadcaster | undefined;
}

export const delegationStreamBroadcaster = 
  globalThis.delegationStreamBroadcaster ?? new DelegationStreamBroadcaster();

if (typeof window === 'undefined') {
  globalThis.delegationStreamBroadcaster = delegationStreamBroadcaster;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');

  if (!sessionId) {
    return new Response('Missing sessionId', { status: 400 });
  }

  const stream = new ReadableStream({
    start(controller) {
      const state = this as unknown as { cleanup?: () => void; abortHandler?: () => void };
      delegationStreamBroadcaster.addConnection(sessionId, controller);

      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'CONNECTION_ESTABLISHED', timestamp: Date.now() })}\n\n`));

      const keepAliveInterval = setInterval(() => {
        delegationStreamBroadcaster.sendKeepAlive(sessionId);
      }, 30000);

      const cleanup = () => {
        clearInterval(keepAliveInterval);
        delegationStreamBroadcaster.removeConnection(sessionId, controller);
        state.cleanup = undefined;
      };

      const abortHandler = () => {
        cleanup();
        request.signal.removeEventListener('abort', abortHandler);
        state.abortHandler = undefined;
      };

      request.signal.addEventListener('abort', abortHandler);

      state.cleanup = cleanup;
      state.abortHandler = abortHandler;
    },
    cancel() {
      console.log(`[DelegationStream] Stream cancelled for ${sessionId}`);
      const state = this as unknown as { cleanup?: () => void; abortHandler?: () => void };
      if (state.abortHandler) {
        request.signal.removeEventListener('abort', state.abortHandler);
        state.abortHandler = undefined;
      }
      if (state.cleanup) {
        state.cleanup();
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
