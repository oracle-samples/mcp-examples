import test from "node:test";
import assert from "node:assert/strict";
import { A2uiMessageProcessor } from "@a2ui/web_core/data/model-processor";
import {
  A2UIClientCapabilitiesError,
  exampleInlinePanelCatalog,
  negotiateCatalog,
  PANEL_CATALOG_ID,
  parseClientCapabilities,
  REPORTING_CATALOG_ID,
} from "../src/lib/a2ui/catalogs/index.ts";
import { renderA2UIViewModel } from "../src/lib/a2ui/compiler.ts";
import { buildMockViewModel } from "../src/lib/a2ui/mock.ts";
import {
  getComponentEntry,
  materializeA2UISurface,
  parseA2UIStream,
  serializeA2UIStream,
} from "../src/lib/a2ui/protocol.ts";
import { planA2UIReplay } from "../src/lib/a2ui/replay-plan.ts";
import { buildGroundedFailureViewModel } from "../src/lib/a2ui/grounded-failure.ts";
import {
  buildRegionSelection,
  buildRegionSelectionViewModel,
  buildRegionSelectorActionMessages,
  REGION_SELECTOR_PAGINATE_ACTION_NAME,
  isRegionChangePrompt,
} from "../src/lib/a2ui/region-selector.ts";

test("buildMockViewModel returns an incident-oriented semantic view", () => {
  const response = buildMockViewModel("Investigate a severe API latency incident.");

  assert.equal(response.title, "Incident Triage Console");
  assert.equal(response.meta.source, "mock");
  assert.equal(response.surfaceKind, "ops_console");
  assert.ok(response.table);
});

test("renderA2UIViewModel produces a materializable message stream", () => {
  const response = buildMockViewModel("Investigate a severe API latency incident.");
  const messages = renderA2UIViewModel(response);
  const serialized = serializeA2UIStream(messages);
  const parsed = parseA2UIStream(serialized);
  const surface = materializeA2UISurface(parsed);

  assert.equal(surface.root, "root");
  assert.equal(surface.surfaceId, "main");
  assert.equal(surface.catalogId, REPORTING_CATALOG_ID);
  assert.equal(surface.dataModel.meta?.source, "mock");
  assert.equal(surface.dataModel.text?.["page-title"], "Incident Triage Console");
  assert.ok(surface.components["header-card"]);
  assert.equal(getComponentEntry(surface.components["metrics-grid"])?.properties.variant, "metric-grid");
  assert.equal(getComponentEntry(surface.components["steps-list"])?.properties.variant, "steps");
  assert.equal(getComponentEntry(surface.components["table-header"])?.properties.variant, "table-header-row");
});

test("catalog negotiation honors client preference order", () => {
  const runtime = negotiateCatalog({
    supportedCatalogIds: [PANEL_CATALOG_ID, REPORTING_CATALOG_ID],
  });

  assert.equal(runtime.catalog.catalogId, PANEL_CATALOG_ID);
  assert.equal(runtime.roleComponents.column, "Stack");
});

test("inline catalogs can drive custom component names", () => {
  const runtime = negotiateCatalog({
    supportedCatalogIds: [exampleInlinePanelCatalog.catalogId, REPORTING_CATALOG_ID],
    inlineCatalogs: [exampleInlinePanelCatalog],
  });
  const response = buildMockViewModel("Plan a production readiness review.");
  const messages = renderA2UIViewModel(response, runtime);
  const surfaceUpdate = messages.find((message) => "surfaceUpdate" in message);

  assert.ok(surfaceUpdate && "surfaceUpdate" in surfaceUpdate);
  const rootComponent = surfaceUpdate.surfaceUpdate.components.find(
    (component) => component.id === "root",
  );
  const headerComponent = surfaceUpdate.surfaceUpdate.components.find(
    (component) => component.id === "header-card",
  );

  assert.equal(getComponentEntry(rootComponent!)?.componentType, "Stack");
  assert.equal(getComponentEntry(headerComponent!)?.componentType, "Panel");
  assert.equal(
    messages.find((message) => "beginRendering" in message)?.beginRendering.catalogId,
    exampleInlinePanelCatalog.catalogId,
  );
});

test("inline catalogs can extend a built-in catalog and override selected roles", () => {
  const inlineCatalog = {
    catalogId: "https://example.com/catalogs/reporting-card-override/v1/catalog.json",
    title: "Reporting Card Override",
    extendsCatalogId: REPORTING_CATALOG_ID,
    components: {
      Panel: {
        type: "object",
        "x-a2uiRole": "card" as const,
      },
    },
    styles: {},
  };
  const runtime = negotiateCatalog({
    supportedCatalogIds: [inlineCatalog.catalogId, REPORTING_CATALOG_ID],
    inlineCatalogs: [inlineCatalog],
  });
  const response = buildMockViewModel("Plan a production readiness review.");
  const messages = renderA2UIViewModel(response, runtime);
  const surfaceUpdate = messages.find((message) => "surfaceUpdate" in message);

  assert.ok(surfaceUpdate && "surfaceUpdate" in surfaceUpdate);
  const rootComponent = surfaceUpdate.surfaceUpdate.components.find(
    (component) => component.id === "root",
  );
  const headerComponent = surfaceUpdate.surfaceUpdate.components.find(
    (component) => component.id === "header-card",
  );

  assert.equal(runtime.roleComponents.column, "Column");
  assert.equal(runtime.roleComponents.card, "Panel");
  assert.equal(getComponentEntry(rootComponent!)?.componentType, "Column");
  assert.equal(getComponentEntry(headerComponent!)?.componentType, "Panel");
});

test("inline catalogs may use richer JSON Schema features in component definitions", () => {
  const inlineCatalog = {
    catalogId: "https://example.com/catalogs/reporting-rich-schema/v1/catalog.json",
    extendsCatalogId: REPORTING_CATALOG_ID,
    components: {
      Text: {
        type: "object",
        additionalProperties: false,
        required: ["text"],
        properties: {
          text: {
            $ref: "#/$defs/boundString",
          },
          variant: {
            type: "string",
            minLength: 1,
          },
        },
        $defs: {
          boundString: {
            type: "object",
            additionalProperties: false,
            minProperties: 1,
            maxProperties: 2,
            properties: {
              literalString: {
                type: "string",
                minLength: 1,
              },
              path: {
                type: "string",
                minLength: 1,
              },
            },
          },
        },
        "x-a2uiRole": "text" as const,
      },
    },
    styles: {},
  };

  const runtime = negotiateCatalog({
    supportedCatalogIds: [inlineCatalog.catalogId, REPORTING_CATALOG_ID],
    inlineCatalogs: [inlineCatalog],
  });

  assert.doesNotThrow(() =>
    renderA2UIViewModel(buildMockViewModel("Plan a production readiness review."), runtime),
  );
});

test("client capabilities require supportedCatalogIds", () => {
  assert.throws(
    () => parseClientCapabilities({ inlineCatalogs: [exampleInlinePanelCatalog] }),
    A2UIClientCapabilitiesError,
  );
});

test("inline catalogs may omit title but must include styles", () => {
  const capabilities = parseClientCapabilities({
    supportedCatalogIds: ["https://example.com/catalogs/no-title/v1/catalog.json"],
    inlineCatalogs: [
      {
        catalogId: "https://example.com/catalogs/no-title/v1/catalog.json",
        components: {
          Panel: {
            type: "object",
            properties: {
              child: { type: "string" },
            },
            required: ["child"],
            "x-a2uiRole": "card" as const,
          },
        },
        styles: {},
      },
    ],
  });

  assert.equal(capabilities?.inlineCatalogs?.[0]?.catalogId, "https://example.com/catalogs/no-title/v1/catalog.json");
  assert.equal(capabilities?.inlineCatalogs?.[0]?.title, undefined);
});

test("invalid inline catalogs are rejected instead of ignored", () => {
  assert.throws(
    () =>
      parseClientCapabilities({
        supportedCatalogIds: ["https://example.com/catalogs/bad/v1/catalog.json"],
        inlineCatalogs: [
          {
            catalogId: "https://example.com/catalogs/bad/v1/catalog.json",
            components: {},
          },
        ],
      }),
    A2UIClientCapabilitiesError,
  );
});

test("official A2UI processor accepts the reporting catalog stream", () => {
  const response = buildMockViewModel("Investigate a severe API latency incident.");
  const processor = new A2uiMessageProcessor();

  processor.processMessages(renderA2UIViewModel(response));
  const surface = processor.getSurfaces().get("main");

  assert.equal(surface?.rootComponentId, "root");
  assert.ok(surface?.componentTree);
  assert.equal(surface?.componentTree?.type, "Column");
});

test("official A2UI processor accepts renamed catalog component types", () => {
  const response = buildMockViewModel("Plan a production readiness review.");
  const runtime = negotiateCatalog({
    supportedCatalogIds: [PANEL_CATALOG_ID, REPORTING_CATALOG_ID],
  });
  const processor = new A2uiMessageProcessor();

  processor.processMessages(renderA2UIViewModel(response, runtime));
  const surface = processor.getSurfaces().get("main");

  assert.equal(surface?.componentTree?.type, "Stack");
  assert.equal(findNode(surface?.componentTree ?? null, "header-card")?.type, "Panel");
  assert.equal(findNode(surface?.componentTree ?? null, "page-title")?.type, "Copy");
});

test("replay planner appends only the unseen suffix", () => {
  const messages = renderA2UIViewModel(
    buildMockViewModel("Investigate a severe API latency incident."),
  );
  const previousMessages = messages.slice(0, 2);
  const replayPlan = planA2UIReplay(previousMessages, messages);

  assert.equal(replayPlan.reset, false);
  assert.deepEqual(replayPlan.messages, messages.slice(previousMessages.length));
});

test("replay planner resets when the next stream is shorter", () => {
  const messages = renderA2UIViewModel(
    buildMockViewModel("Investigate a severe API latency incident."),
  );
  const replayPlan = planA2UIReplay(messages, messages.slice(0, 1));

  assert.equal(replayPlan.reset, true);
  assert.deepEqual(replayPlan.messages, messages.slice(0, 1));
});

test("replay planner resets when an earlier message changes", () => {
  const messages = renderA2UIViewModel(
    buildMockViewModel("Investigate a severe API latency incident."),
  );
  const mutatedMessages = messages.map((message, index) =>
    index === 0 && message.surfaceUpdate
      ? {
          ...message,
          surfaceUpdate: {
            ...message.surfaceUpdate,
            surfaceId: "secondary",
          },
        }
      : message,
  );
  const replayPlan = planA2UIReplay(messages, mutatedMessages);

  assert.equal(replayPlan.reset, true);
  assert.deepEqual(replayPlan.messages, mutatedMessages);
});

test("grounded live failures render an explicit server failure surface", () => {
  const messages = renderA2UIViewModel(
    buildGroundedFailureViewModel(
      "list all OCI regions",
      new Error("oci-mcp unavailable"),
    ),
  );
  const surface = materializeA2UISurface(messages);

  assert.equal(surface.dataModel.meta?.source, "server");
  assert.equal(surface.dataModel.meta?.model, "grounded-failure");
  assert.equal(
    surface.dataModel.text?.["page-title"],
    "Grounded Content Unavailable",
  );
  assert.match(
    String(surface.dataModel.text?.["status-body"] ?? ""),
    /did not fall back to a model-only answer/i,
  );
  assert.match(
    String(surface.dataModel.meta?.fallbackReason ?? ""),
    /oci-mcp unavailable/i,
  );
});

test("renderA2UIViewModel renders a semantic selection as interactive A2UI", () => {
  const messages = renderA2UIViewModel({
    surfaceKind: "ops_console",
    title: "Change Current OCI Region",
    summary: "Select a grounded region from the live catalog.",
    status: undefined,
    metrics: [],
    checklistTitle: undefined,
    checklist: [],
    table: undefined,
    selection: {
      title: "Region selector",
      body: "Choose a region.",
      label: "OCI region",
      placeholder: "Choose a region",
      options: [
        { label: "us-ashburn-1 (IAD)", value: "IAD::us-ashburn-1" },
        { label: "us-phoenix-1 (PHX)", value: "PHX::us-phoenix-1" },
      ],
      submitLabel: "Apply region selection",
      actionName: "submitRegionSelection",
      actionEndpoint: "/api/actions/region-selector",
      actionContextKey: "regionValue",
      resultTitle: "Server result",
      resultMessage: "Waiting for a selection.",
      pagination: {
        pageIndex: 0,
        pageSize: 2,
        totalOptions: 4,
        actionName: REGION_SELECTOR_PAGINATE_ACTION_NAME,
        previousLabel: "Previous",
        nextLabel: "More regions",
        serverName: "oci_http",
      },
    },
    actionsTitle: undefined,
    actions: [],
    appendix: undefined,
    meta: {
      source: "server",
      model: "test",
      generatedAt: "2026-04-16T00:00:00.000Z",
    },
  });
  const surface = materializeA2UISurface(messages);

  assert.equal(
    getComponentEntry(surface.components["selection-input"])?.componentType,
    "SelectField",
  );
  assert.equal(
    getComponentEntry(surface.components["selection-submit-button"])?.componentType,
    "Button",
  );
  assert.equal(surface.dataModel.meta?.actionEndpoint, "/api/actions/region-selector");
  assert.equal(surface.dataModel.draft?.selectedOptionValue, "");
  assert.equal(surface.dataModel.result?.message, "Waiting for a selection.");
  assert.equal(surface.dataModel.paging?.currentPageIndex, "0");
  assert.equal(surface.dataModel.paging?.pageSize, "2");
  assert.equal(surface.dataModel.paging?.serverName, "oci_http");
  assert.ok(surface.components["selection-pagination-row"]);
  assert.ok(surface.components["selection-pagination-next-button"]);
});

test("region change prompts are recognized for the grounded selector flow", () => {
  assert.equal(isRegionChangePrompt("change my current region"), true);
  assert.equal(isRegionChangePrompt("switch region for this session"), true);
  assert.equal(isRegionChangePrompt("list all OCI regions"), false);
});

test("region tool output becomes a grounded selection model", () => {
  const toolExecution = {
    serverName: "oci_http",
    toolName: "invoke_oci_api",
    arguments: {
      client_fqn: "oci.identity.IdentityClient",
      operation: "list_regions",
      params: {},
    },
    resultText: JSON.stringify({
      client: "oci.identity.IdentityClient",
      operation: "list_regions",
      data: [
        { key: "IAD", name: "us-ashburn-1" },
        { key: "PHX", name: "us-phoenix-1" },
      ],
    }),
  };
  const selection = buildRegionSelection(toolExecution);
  const viewModel = buildRegionSelectionViewModel(toolExecution);

  assert.ok(selection);
  assert.equal(selection?.options.length, 2);
  assert.equal(selection?.options[0]?.value, "IAD::us-ashburn-1");
  assert.equal(selection?.actionEndpoint, "/api/actions/region-selector");
  assert.ok(viewModel);
  assert.equal(viewModel?.meta.source, "server");
  assert.equal(viewModel?.selection?.options.length, 2);
  assert.match(String(viewModel?.summary ?? ""), /live region catalog/i);
});

test("region selector action returns a same-surface data update", () => {
  const messages = buildRegionSelectorActionMessages({
    userAction: {
      name: "submitRegionSelection",
      surfaceId: "main",
      sourceComponentId: "submit-button",
      timestamp: "2026-04-15T14:00:00.000Z",
      context: {
        regionValue: "IAD::us-ashburn-1",
      },
    },
  });
  const surface = materializeA2UISurface(messages);

  assert.match(
    String(surface.dataModel.result?.message ?? ""),
    /us-ashburn-1/i,
  );
  assert.equal(surface.surfaceId, "main");
  assert.equal(surface.dataModel.result?.selectedRegionKey, "IAD");
  assert.equal(surface.dataModel.result?.submittedAt, "2026-04-15T14:00:00.000Z");
});

test("region selections can page through a larger grounded region catalog", () => {
  const toolExecution = {
    serverName: "oci_http",
    toolName: "invoke_oci_api",
    arguments: {
      client_fqn: "oci.identity.IdentityClient",
      operation: "list_regions",
      params: {},
    },
    resultText: JSON.stringify({
      data: [
        { key: "IAD", name: "us-ashburn-1" },
        { key: "PHX", name: "us-phoenix-1" },
        { key: "LHR", name: "uk-london-1" },
        { key: "FRA", name: "eu-frankfurt-1" },
        { key: "NRT", name: "ap-tokyo-1" },
      ],
    }),
  };

  const firstPage = buildRegionSelection(toolExecution, {
    pageIndex: 0,
    pageSize: 2,
  });
  const lastPage = buildRegionSelection(toolExecution, {
    pageIndex: 2,
    pageSize: 2,
  });

  assert.equal(firstPage?.options.length, 2);
  assert.equal(firstPage?.pagination?.totalOptions, 5);
  assert.equal(firstPage?.pagination?.pageIndex, 0);
  assert.equal(lastPage?.options.length, 1);
  assert.equal(lastPage?.options[0]?.value, "PHX::us-phoenix-1");
  assert.equal(lastPage?.pagination?.pageIndex, 2);
});

test("a later full same-surface selection stream can replace paged options", () => {
  const firstPageMessages = renderA2UIViewModel({
    surfaceKind: "ops_console",
    title: "Change Current OCI Region",
    summary: "Page one.",
    status: undefined,
    metrics: [],
    checklistTitle: undefined,
    checklist: [],
    table: undefined,
    selection: {
      title: "Region selector",
      body: "Choose a region.",
      label: "OCI region",
      options: [
        { label: "us-ashburn-1 (IAD)", value: "IAD::us-ashburn-1" },
        { label: "us-phoenix-1 (PHX)", value: "PHX::us-phoenix-1" },
      ],
      submitLabel: "Apply region selection",
      actionName: "submitRegionSelection",
      actionEndpoint: "/api/actions/region-selector",
      actionContextKey: "regionValue",
      pagination: {
        pageIndex: 0,
        pageSize: 2,
        totalOptions: 4,
        actionName: REGION_SELECTOR_PAGINATE_ACTION_NAME,
        serverName: "oci_http",
      },
    },
    actionsTitle: undefined,
    actions: [],
    appendix: undefined,
    meta: {
      source: "server",
      model: "test",
      generatedAt: "2026-04-17T00:00:00.000Z",
    },
  });
  const secondPageMessages = renderA2UIViewModel({
    surfaceKind: "ops_console",
    title: "Change Current OCI Region",
    summary: "Page two.",
    status: undefined,
    metrics: [],
    checklistTitle: undefined,
    checklist: [],
    table: undefined,
    selection: {
      title: "Region selector",
      body: "Choose a region.",
      label: "OCI region",
      options: [
        { label: "uk-london-1 (LHR)", value: "LHR::uk-london-1" },
        { label: "eu-frankfurt-1 (FRA)", value: "FRA::eu-frankfurt-1" },
      ],
      submitLabel: "Apply region selection",
      actionName: "submitRegionSelection",
      actionEndpoint: "/api/actions/region-selector",
      actionContextKey: "regionValue",
      pagination: {
        pageIndex: 1,
        pageSize: 2,
        totalOptions: 4,
        actionName: REGION_SELECTOR_PAGINATE_ACTION_NAME,
        serverName: "oci_http",
      },
    },
    actionsTitle: undefined,
    actions: [],
    appendix: undefined,
    meta: {
      source: "server",
      model: "test",
      generatedAt: "2026-04-17T00:00:01.000Z",
    },
  });
  const surface = materializeA2UISurface([
    ...firstPageMessages,
    ...secondPageMessages,
  ]);
  const selectionEntry = getComponentEntry(surface.components["selection-input"]);
  const options = Array.isArray(selectionEntry?.properties.options)
    ? selectionEntry?.properties.options
    : [];

  assert.equal(surface.dataModel.paging?.currentPageIndex, "1");
  assert.equal(options.length, 2);
  assert.equal(
    (options[0] as { label?: { literalString?: string } }).label?.literalString,
    "uk-london-1 (LHR)",
  );
});

function findNode(node: { id: string; properties?: Record<string, unknown> } | null, id: string) {
  if (!node) {
    return null;
  }

  if (node.id === id) {
    return node;
  }

  const props = node.properties ?? {};
  for (const key of ["children", "child"]) {
    const value = props[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (
          typeof child === "object" &&
          child !== null &&
          "id" in child &&
          typeof child.id === "string"
        ) {
          const match = findNode(child as { id: string; properties?: Record<string, unknown> }, id);
          if (match) {
            return match;
          }
        }
      }
      continue;
    }

    if (
      typeof value === "object" &&
      value !== null &&
      "id" in value &&
      typeof value.id === "string"
    ) {
      const match = findNode(value as { id: string; properties?: Record<string, unknown> }, id);
      if (match) {
        return match;
      }
    }
  }

  return null;
}
