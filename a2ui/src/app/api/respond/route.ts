import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  A2UIClientCapabilitiesError,
  CatalogNegotiationError,
  parseClientCapabilities,
} from "@/lib/a2ui/catalogs";
import { serializeA2UIStream } from "@/lib/a2ui/protocol";
import { generateA2UIMessageStream } from "@/lib/a2ui/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: {
    prompt?: unknown;
    a2uiClientCapabilities?: unknown;
  };

  try {
    body = (await request.json()) as {
      prompt?: unknown;
      a2uiClientCapabilities?: unknown;
    };
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  try {
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const clientCapabilities = parseClientCapabilities(body.a2uiClientCapabilities);

    if (!prompt) {
      return NextResponse.json(
        { error: "A non-empty prompt is required." },
        { status: 400 },
      );
    }

    const response = await generateA2UIMessageStream(prompt, {
      clientCapabilities,
    });
    const stream = serializeA2UIStream(response);

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof A2UIClientCapabilitiesError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof CatalogNegotiationError) {
      return NextResponse.json({ error: error.message }, { status: 406 });
    }

    const requestId = randomUUID();
    console.error(`[api/respond] ${requestId}`, error);

    return NextResponse.json(
      {
        error: "The server could not generate an A2UI response.",
        requestId,
      },
      { status: 500 },
    );
  }
}
