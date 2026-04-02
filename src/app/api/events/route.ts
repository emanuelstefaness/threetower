import { getBuildingStore } from "@/server/building/buildingStore";
import type { RoomStatusChangedEvent } from "@/lib/buildingTypes";

// SSE nunca deve ser pré-renderizado estaticamente.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const store = await getBuildingStore();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (evt: RoomStatusChangedEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
      };

      const unsubscribe = store.subscribe(send);

      // keeps the connection "alive" for some proxies
      controller.enqueue(encoder.encode(`event: connected\ndata: {}\n\n`));

      const ping = setInterval(() => {
        controller.enqueue(encoder.encode(`event: ping\ndata: {}\n\n`));
      }, 15_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(ping);
        unsubscribe();
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

