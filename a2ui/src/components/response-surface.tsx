"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  A2UIProvider,
  A2UIRenderer,
  type OnActionCallback,
  useA2UI,
} from "@a2ui/react";
import {
  type A2UICatalogDefinition,
  CatalogNegotiationError,
} from "@/lib/a2ui/catalogs";
import type { A2UIMessage } from "@/lib/a2ui/protocol";
import { planA2UIReplay } from "@/lib/a2ui/replay-plan";
import {
  CatalogRegistryProvider,
  createA2UIRegistry,
} from "@/components/a2ui-catalog-registry";

type ResponseSurfaceProps = {
  messages: A2UIMessage[];
  inlineCatalogs?: A2UICatalogDefinition[];
  surfaceId?: string;
  onAction?: OnActionCallback;
};

export function ResponseSurface({
  messages,
  inlineCatalogs = [],
  surfaceId,
  onAction,
}: ResponseSurfaceProps) {
  const registryResult = useMemo(() => {
    try {
      return {
        registry: createA2UIRegistry(inlineCatalogs),
        error: null,
      };
    } catch (error) {
      const message =
        error instanceof CatalogNegotiationError
          ? error.message
          : error instanceof Error
            ? error.message
            : "The renderer could not initialize the negotiated catalog.";

      return {
        registry: null,
        error: message,
      };
    }
  }, [inlineCatalogs]);

  if (registryResult.error) {
    return (
      <div className="surface">
        <section className="block callout-warning">
          <h3>Unsupported catalog</h3>
          <p className="section-copy">{registryResult.error}</p>
        </section>
      </div>
    );
  }

  const registry = registryResult.registry;
  if (!registry) {
    return null;
  }

  const resolvedSurfaceId = surfaceId ?? readSurfaceId(messages) ?? "main";

  return (
    <CatalogRegistryProvider registry={registry}>
      <A2UIProvider onAction={onAction}>
        <ProcessedSurface
          messages={messages}
          surfaceId={resolvedSurfaceId}
          registry={registry}
        />
      </A2UIProvider>
    </CatalogRegistryProvider>
  );
}

function ProcessedSurface({
  messages,
  surfaceId,
  registry,
}: {
  messages: A2UIMessage[];
  surfaceId: string;
  registry: ReturnType<typeof createA2UIRegistry>;
}) {
  const { processMessages, clearSurfaces } = useA2UI();
  const [processingError, setProcessingError] = useState<string | null>(null);
  const processedMessagesRef = useRef<A2UIMessage[]>([]);

  useEffect(() => {
    const replayPlan = planA2UIReplay(processedMessagesRef.current, messages);

    try {
      if (replayPlan.reset) {
        clearSurfaces();
      }

      if (replayPlan.messages.length > 0) {
        processMessages(replayPlan.messages);
      }

      processedMessagesRef.current = messages;
      setProcessingError(null);
    } catch (error) {
      clearSurfaces();
      processedMessagesRef.current = [];
      setProcessingError(
        error instanceof Error
          ? error.message
          : "The A2UI runtime rejected the message stream.",
      );
    }
  }, [clearSurfaces, messages, processMessages]);

  if (processingError) {
    return (
      <div className="surface">
        <section className="block callout-warning">
          <h3>Invalid A2UI stream</h3>
          <p className="section-copy">{processingError}</p>
        </section>
      </div>
    );
  }

  return (
    <A2UIRenderer
      surfaceId={surfaceId}
      registry={registry}
      fallback={
        <div className="surface">
          <div className="block">
            <p className="section-copy">Waiting for the server to shape a response.</p>
          </div>
        </div>
      }
    />
  );
}

function readSurfaceId(messages: A2UIMessage[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.beginRendering) {
      return message.beginRendering.surfaceId;
    }
    if (message.surfaceUpdate) {
      return message.surfaceUpdate.surfaceId;
    }
    if (message.dataModelUpdate) {
      return message.dataModelUpdate.surfaceId;
    }
    if (message.deleteSurface) {
      return message.deleteSurface.surfaceId;
    }
  }

  return null;
}
