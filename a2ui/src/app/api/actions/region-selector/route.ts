import { NextResponse } from "next/server";
import type { A2UIClientEventMessage } from "@a2ui/react";
import { loadAppConfig } from "@/lib/config/app-config";
import { serializeA2UIStream } from "@/lib/a2ui/protocol";
import {
  buildRegionSelectorActionMessages,
  buildRegionSelectorPaginationMessages,
  REGION_SELECTOR_PAGINATE_ACTION_NAME,
} from "@/lib/a2ui/region-selector";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  try {
    const actionMessage = body as A2UIClientEventMessage;
    const stream = serializeA2UIStream(
      actionMessage.userAction?.name === REGION_SELECTOR_PAGINATE_ACTION_NAME
        ? await buildRegionSelectorPaginationMessages(
            actionMessage,
            await loadAppConfig(),
          )
        : buildRegionSelectorActionMessages(actionMessage),
    );

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Region selector action failed.",
      },
      { status: 400 },
    );
  }
}
