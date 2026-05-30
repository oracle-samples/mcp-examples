"use client";

import Link from "next/link";
import { startTransition, useState } from "react";
import type { A2UIClientEventMessage } from "@a2ui/react";
import {
  availableCatalogChoices,
  exampleInlinePanelCatalog,
  PANEL_CATALOG_ID,
  REPORTING_CATALOG_ID,
  type A2UICatalogDefinition,
  type A2UIClientCapabilities,
} from "@/lib/a2ui/catalogs";
import type { A2UIMessage, A2UIStreamSummary } from "@/lib/a2ui/protocol";
import { parseA2UIStream, summarizeA2UIStream } from "@/lib/a2ui/protocol";
import { ResponseSurface } from "@/components/response-surface";

type Turn = {
  id: string;
  prompt: string;
  messages?: A2UIMessage[];
  summary?: A2UIStreamSummary;
  error?: string;
  actionError?: string;
  isActing?: boolean;
  inlineCatalogs?: A2UICatalogDefinition[];
};

type A2UIWorkbenchProps = {
  starterPrompts: string[];
};

const defaultPrompt =
  "Plan a production readiness review for a new application with model calls, a UI layer, and operational metrics.";

export function A2UIWorkbench({ starterPrompts }: A2UIWorkbenchProps) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [catalogId, setCatalogId] = useState(REPORTING_CATALOG_ID);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitPrompt(nextPrompt: string) {
    const trimmed = nextPrompt.trim();

    if (!trimmed || isSubmitting) {
      return;
    }

    const id = crypto.randomUUID();
    const clientCapabilities = buildClientCapabilities(catalogId);
    setIsSubmitting(true);

    startTransition(() => {
      setTurns((current) => [
        {
          id,
          prompt: trimmed,
          inlineCatalogs: clientCapabilities.inlineCatalogs,
        },
        ...current,
      ]);
    });

    try {
      const response = await fetch("/api/respond", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: trimmed,
          a2uiClientCapabilities: clientCapabilities,
        }),
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(errorBody?.error ?? "The request failed.");
      }

      const messages = parseA2UIStream(await response.text());
      const summary = summarizeA2UIStream(messages);

      startTransition(() => {
        setTurns((current) =>
          current.map((turn) =>
            turn.id === id ? { ...turn, messages, summary } : turn,
          ),
        );
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected request failure.";

      startTransition(() => {
        setTurns((current) =>
          current.map((turn) =>
            turn.id === id ? { ...turn, error: message } : turn,
          ),
        );
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitTurnAction(
    turnId: string,
    actionEndpoint: string,
    message: A2UIClientEventMessage,
  ) {
    startTransition(() => {
      setTurns((current) =>
        current.map((turn) =>
          turn.id === turnId
            ? { ...turn, isActing: true, actionError: undefined }
            : turn,
        ),
      );
    });

    try {
      const response = await fetch(actionEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        const errorBody = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(errorBody?.error ?? "Interactive action failed.");
      }

      const deltaMessages = parseA2UIStream(await response.text());

      startTransition(() => {
        setTurns((current) =>
          current.map((turn) => {
            if (turn.id !== turnId || !turn.messages) {
              return turn;
            }

            const nextMessages = [...turn.messages, ...deltaMessages];
            return {
              ...turn,
              isActing: false,
              actionError: undefined,
              messages: nextMessages,
              summary: summarizeA2UIStream(nextMessages),
            };
          }),
        );
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Interactive action failed.";

      startTransition(() => {
        setTurns((current) =>
          current.map((turn) =>
            turn.id === turnId
              ? { ...turn, isActing: false, actionError: message }
              : turn,
          ),
        );
      });
    }
  }

  return (
    <main className="page-shell">
      <section className="hero fade-in">
        <span className="eyebrow">Production-style A2UI</span>
        <h1>Shape agent output into an interface.</h1>
        <p>
          This example keeps the flow explicit: prompts go to a typed server
          route, the server returns A2UI protocol messages, and the client
          renders the negotiated catalog. Some prompts resolve to grounded
          reporting surfaces, and some resolve to grounded interactive surfaces
          that continue through `userAction`.
        </p>
      </section>

      <section className="grid">
        <aside className="panel fade-in">
          <div className="panel-inner">
            <h2 className="section-title">Prompt Studio</h2>
            <p className="section-copy">
              Start with a seeded production scenario or write your own prompt.
              The same main flow can return read-only reporting UI or
              interactive UI that posts follow-up `userAction` messages back to
              the server. The server defaults to mock mode until an OpenAI API
              key is configured.
            </p>

            <div className="prompt-list">
              {starterPrompts.map((starterPrompt) => (
                <button
                  key={starterPrompt}
                  className="prompt-chip"
                  type="button"
                  onClick={() => setPrompt(starterPrompt)}
                  disabled={isSubmitting}
                >
                  {starterPrompt}
                </button>
              ))}
            </div>

            <form
              className="composer"
              onSubmit={(event) => {
                event.preventDefault();
                void submitPrompt(prompt);
              }}
            >
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Describe the UI the assistant should generate."
              />

              <div className="composer-footer">
                <span className="subtle-note">
                  Server mode: mock unless `OPENAI_API_KEY` is set.
                </span>

                <div className="button-group">
                  <Link href="/render" className="secondary-button">
                    Open A2UI renderer
                  </Link>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setPrompt(defaultPrompt);
                      setCatalogId(REPORTING_CATALOG_ID);
                    }}
                    disabled={isSubmitting}
                  >
                    Reset
                  </button>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Generating..." : "Generate UI"}
                  </button>
                </div>
              </div>
            </form>

            <div style={{ marginTop: 18 }}>
              <label className="section-title" htmlFor="catalog-picker">
                Catalog negotiation
              </label>
              <p className="section-copy" style={{ marginTop: 8 }}>
                The browser advertises supported catalog IDs and can optionally
                send an inline catalog definition. The server chooses the first
                compatible catalog and returns its `catalogId`.
              </p>
              <select
                id="catalog-picker"
                value={catalogId}
                onChange={(event) => setCatalogId(event.target.value)}
                disabled={isSubmitting}
                style={{ width: "100%", marginTop: 10 }}
              >
                {availableCatalogChoices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label}
                  </option>
                ))}
              </select>
              <p className="subtle-note" style={{ marginTop: 8 }}>
                {
                  availableCatalogChoices.find((choice) => choice.id === catalogId)
                    ?.description
                }
              </p>
            </div>
          </div>
        </aside>

        <section className="history">
          {turns.length === 0 ? (
            <div className="panel empty-state fade-in">
              <div>
                <h2>Structured output appears here.</h2>
                <p>
                  Submit a prompt to see the A2UI message stream rendered as
                  the negotiated catalog runtime chosen for that request.
                </p>
              </div>
            </div>
          ) : (
            turns.map((turn, index) => (
              <article key={turn.id} className="conversation-card fade-in">
                <div className="conversation-meta">
                  <h2>Run {turns.length - index}</h2>
                  <span>
                    {readMeta(turn.summary, "source") === "openai"
                      ? "Live model response"
                      : readMeta(turn.summary, "source") === "mock"
                        ? "Offline mock response"
                        : readMeta(turn.summary, "source") === "server"
                          ? "Grounded server response"
                        : "Waiting for response"}
                  </span>
                  {turn.summary?.catalogId ? (
                    <span>{catalogLabel(turn.summary.catalogId)}</span>
                  ) : null}
                </div>

                <div className="user-turn">
                  <span className="user-turn-label">Prompt</span>
                  <p>{turn.prompt}</p>
                </div>

                {turn.error ? (
                  <div className="surface">
                    <div className="block callout-warning">
                      <h3>Request failed</h3>
                      <p className="section-copy">{turn.error}</p>
                    </div>
                  </div>
                ) : turn.messages ? (
                  <>
                    {turn.actionError ? (
                      <div className="surface">
                        <div className="block callout-warning">
                          <h3>Interaction failed</h3>
                          <p className="section-copy">{turn.actionError}</p>
                        </div>
                      </div>
                    ) : null}
                    {turn.isActing ? (
                      <div className="surface">
                        <div className="block callout-info">
                          <h3>Sending user action</h3>
                          <p className="section-copy">
                            Waiting for the server to apply the interaction.
                          </p>
                        </div>
                      </div>
                    ) : null}
                    <ResponseSurface
                      messages={turn.messages}
                      inlineCatalogs={turn.inlineCatalogs}
                      surfaceId={turn.summary?.surfaceId}
                      onAction={
                        readMetaValue(turn.summary, "actionEndpoint")
                          ? (message) =>
                              void submitTurnAction(
                                turn.id,
                                readMetaValue(turn.summary, "actionEndpoint"),
                                message,
                              )
                          : undefined
                      }
                    />
                  </>
                ) : (
                  <div className="surface">
                    <div className="block">
                      <p className="section-copy">
                        Waiting for the server to shape a response.
                      </p>
                    </div>
                  </div>
                )}
              </article>
            ))
          )}
        </section>
      </section>
    </main>
  );
}

function readMeta(
  summary: A2UIStreamSummary | undefined,
  key: "source" | "model" | "generatedAt",
) {
  return summary?.meta[key] !== undefined ? String(summary.meta[key] ?? "") : "";
}

function readMetaValue(
  summary: A2UIStreamSummary | undefined,
  key: string,
) {
  return summary?.meta[key] !== undefined ? String(summary.meta[key] ?? "") : "";
}

function buildClientCapabilities(
  preferredCatalogId: string,
): A2UIClientCapabilities {
  if (preferredCatalogId === exampleInlinePanelCatalog.catalogId) {
    return {
      supportedCatalogIds: [
        exampleInlinePanelCatalog.catalogId,
        PANEL_CATALOG_ID,
        REPORTING_CATALOG_ID,
      ],
      inlineCatalogs: [exampleInlinePanelCatalog],
    };
  }

  if (preferredCatalogId === PANEL_CATALOG_ID) {
    return {
      supportedCatalogIds: [PANEL_CATALOG_ID, REPORTING_CATALOG_ID],
    };
  }

  return {
    supportedCatalogIds: [REPORTING_CATALOG_ID, PANEL_CATALOG_ID],
  };
}

function catalogLabel(catalogId: string) {
  return (
    availableCatalogChoices.find((choice) => choice.id === catalogId)?.label ??
    catalogId
  );
}
