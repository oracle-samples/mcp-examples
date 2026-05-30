"use client";

import Link from "next/link";
import { startTransition, useState } from "react";
import {
  availableCatalogChoices,
  exampleInlinePanelCatalog,
  REPORTING_CATALOG_ID,
} from "@/lib/a2ui/catalogs";
import { ResponseSurface } from "@/components/response-surface";
import { sampleA2UIStream } from "@/lib/a2ui/examples";
import {
  parseA2UIStream,
  type A2UIMessage,
  summarizeA2UIStream,
} from "@/lib/a2ui/protocol";

export function ResponsePlayground() {
  const [catalogId, setCatalogId] = useState(REPORTING_CATALOG_ID);
  const [draft, setDraft] = useState(sampleA2UIStream);
  const [messages, setMessages] = useState<A2UIMessage[]>(() =>
    parseA2UIStream(sampleA2UIStream),
  );
  const [summary, setSummary] = useState(() =>
    summarizeA2UIStream(parseA2UIStream(sampleA2UIStream)),
  );
  const [error, setError] = useState<string | null>(null);

  function renderDraft(nextDraft: string) {
    try {
      const nextMessages = parseA2UIStream(nextDraft);
      const nextSummary = summarizeA2UIStream(nextMessages);

      startTransition(() => {
        setMessages(nextMessages);
        setSummary(nextSummary);
        setError(null);
      });
    } catch (nextError) {
      startTransition(() => {
        setError(
          nextError instanceof Error ? nextError.message : "Invalid A2UI input.",
        );
      });
    }
  }

  return (
    <main className="page-shell">
      <section className="hero fade-in">
        <span className="eyebrow">Client renderer example</span>
        <h1>Paste A2UI JSONL and render it.</h1>
        <p>
          This page shows the client-side half directly. Paste a captured
          A2UI v0.8 message stream, process it through the official client
          runtime, and render the same negotiated catalog surface used by the
          live app.
        </p>
      </section>

      <section className="grid">
        <aside className="panel fade-in">
          <div className="panel-inner">
            <h2 className="section-title">Renderer Input</h2>
            <p className="section-copy">
              Use this when you already have a JSONL payload from `curl` and
              want to see the surface output in a webpage. If the stream refers
              to a non-default catalog, choose the matching renderer support
              before rendering.
            </p>

            <select
              value={catalogId}
              onChange={(event) => setCatalogId(event.target.value)}
              style={{ width: "100%", marginBottom: 14 }}
            >
              {availableCatalogChoices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}
                </option>
              ))}
            </select>

            <form
              className="composer"
              onSubmit={(event) => {
                event.preventDefault();
                renderDraft(draft);
              }}
            >
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                style={{ minHeight: 420 }}
                spellCheck={false}
              />

              <div className="composer-footer">
                <span className="subtle-note">
                  The browser passes the message stream to the official A2UI React runtime.
                </span>

                <div className="button-group">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setDraft(sampleA2UIStream);
                      renderDraft(sampleA2UIStream);
                    }}
                  >
                    Load sample
                  </button>
                  <button className="primary-button" type="submit">
                    Render A2UI
                  </button>
                </div>
              </div>
            </form>

            <div style={{ marginTop: 18 }}>
              <Link href="/" className="secondary-button">
                Back to live workbench
              </Link>
            </div>
          </div>
        </aside>

        <section className="history">
          <article className="conversation-card fade-in">
            <div className="conversation-meta">
              <h2>Rendered surface</h2>
              <span>Client-only example</span>
            </div>

            {error ? (
              <div className="surface">
                <div className="block callout-warning">
                  <h3>A2UI parse error</h3>
                  <p className="section-copy">{error}</p>
                </div>
              </div>
            ) : (
              <ResponseSurface
                messages={messages}
                inlineCatalogs={
                  catalogId === exampleInlinePanelCatalog.catalogId
                    ? [exampleInlinePanelCatalog]
                    : []
                }
                surfaceId={summary.surfaceId}
              />
            )}
          </article>
        </section>
      </section>
    </main>
  );
}
