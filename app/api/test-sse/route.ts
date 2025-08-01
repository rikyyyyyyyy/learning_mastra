import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  console.log('🔍 Test SSE endpoint called');
  
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    start(controller) {
      // Send initial message
      controller.enqueue(
        encoder.encode('data: {"message": "SSE connection test successful!"}\n\n')
      );
      
      // Send a message every 2 seconds, 5 times
      let count = 0;
      const interval = setInterval(() => {
        count++;
        if (count <= 5) {
          controller.enqueue(
            encoder.encode(`data: {"count": ${count}, "time": "${new Date().toISOString()}"}\n\n`)
          );
        } else {
          clearInterval(interval);
          controller.close();
        }
      }, 2000);
      
      // Cleanup on abort
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
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