import type { A2UIClientEventMessage } from "@a2ui/react";
import type { AppConfig } from "../config/types.ts";
import { negotiateCatalog } from "./catalogs/index.ts";
import {
  callMcpTool,
  listAvailableTools,
  withMcpClient,
} from "../mcp/client.ts";
import type { MCPToolExecution } from "../mcp/types.ts";
import { renderA2UIViewModel } from "./compiler.ts";
import { buildGroundedFailureViewModel } from "./grounded-failure.ts";
import type { A2UISelection, A2UIViewModel } from "./types.ts";
import type { A2UIMessage } from "./protocol.ts";

export const REGION_SELECTOR_ACTION_ENDPOINT = "/api/actions/region-selector";
export const REGION_SELECTOR_ACTION_NAME = "submitRegionSelection";
export const REGION_SELECTOR_PAGINATE_ACTION_NAME = "paginateRegionSelection";

const MAIN_SURFACE_ID = "main";
const DEFAULT_REGION_PAGE_SIZE = 20;
const REGION_LIST_TOOL_NAME = "invoke_oci_api";
const REGION_LIST_TOOL_ARGS = {
  client_fqn: "oci.identity.IdentityClient",
  operation: "list_regions",
  params: {},
} satisfies Record<string, unknown>;

type OciRegion = {
  key: string;
  name: string;
};

type RegionSelectionOptions = {
  pageIndex?: number;
  pageSize?: number;
  serverName?: string;
};

export function isRegionChangePrompt(prompt: string) {
  const normalized = prompt.trim().toLowerCase();

  return (
    /(?:change|switch|set|update|select).*(?:current )?region/.test(normalized) ||
    /(?:current )?region.*(?:change|switch|set|update|select)/.test(normalized)
  );
}

export function buildRegionSelection(
  toolExecution: MCPToolExecution | undefined,
  options: RegionSelectionOptions = {},
): A2UISelection | undefined {
  if (!toolExecution) {
    return undefined;
  }

  const regions = extractRegions(toolExecution.resultText);
  if (regions.length === 0) {
    return undefined;
  }

  const pageSize = clampPageSize(options.pageSize);
  const lastPageIndex = Math.max(0, Math.ceil(regions.length / pageSize) - 1);
  const pageIndex = clampPageIndex(options.pageIndex ?? 0, lastPageIndex);
  const pagedRegions = regions.slice(
    pageIndex * pageSize,
    pageIndex * pageSize + pageSize,
  );

  return {
    title: "Region selector",
    body:
      regions.length > pageSize
        ? "Choose a region from the current page, or use the paging controls to load more grounded OCI regions."
        : "Choose one region from the grounded OCI region catalog returned by MCP, then submit it back to the server.",
    label: "OCI region",
    placeholder: "Choose a region",
    options: pagedRegions.map((region) => ({
      label: `${region.name} (${region.key})`,
      value: encodeRegionValue(region),
    })),
    submitLabel: "Apply region selection",
    actionName: REGION_SELECTOR_ACTION_NAME,
    actionEndpoint: REGION_SELECTOR_ACTION_ENDPOINT,
    actionContextKey: "regionValue",
    resultTitle: "Server result",
    resultMessage:
      "Waiting for a region selection. Pick a region from the dropdown and submit it.",
    pagination:
      regions.length > pageSize
        ? {
            pageIndex,
            pageSize,
            totalOptions: regions.length,
            actionName: REGION_SELECTOR_PAGINATE_ACTION_NAME,
            previousLabel: "Previous",
            nextLabel: "More regions",
            serverName: options.serverName ?? toolExecution.serverName,
          }
        : undefined,
  };
}

export function buildRegionSelectionViewModel(
  toolExecution: MCPToolExecution | undefined,
  options: RegionSelectionOptions = {},
): A2UIViewModel | undefined {
  const selection = buildRegionSelection(toolExecution, options);

  if (!selection) {
    return undefined;
  }

  return {
    surfaceKind: "ops_console",
    title: "Change Current OCI Region",
    summary:
      "Select a grounded OCI region from the live region catalog returned through the MCP-backed server path.",
    status: {
      tone: "info",
      title: "Grounded region catalog ready",
      body:
        "The server retrieved live OCI regions through MCP. Choose a region and submit it to continue the same-surface A2UI interaction loop.",
    },
    metrics: [
      {
        label: "Regions",
        value: selection.pagination
          ? String(selection.pagination.totalOptions)
          : String(selection.options.length),
        detail: selection.pagination
          ? "Live OCI regions returned by the grounded MCP request, with paging controls for the selector."
          : "Live OCI regions returned by the grounded MCP request.",
      },
      {
        label: "Source",
        value: "OCI MCP",
        detail: `${toolExecution?.serverName ?? "unknown server"}.${toolExecution?.toolName ?? "unknown tool"}`,
      },
      {
        label: "Interaction",
        value: "userAction",
        detail:
          "Submitting the selector posts the chosen value back to the server, and paging controls can load more grounded options.",
      },
    ],
    selection,
    actionsTitle: "How this works",
    actions: [
      {
        label: "Grounded initial load",
        description:
          "The agent planned an MCP call, fetched the live OCI region catalog, and the server shaped the selector from that grounded result.",
      },
      {
        label: "Interactive follow-up",
        description:
          "The dropdown selection is sent back as an A2UI userAction, and paging controls can request more grounded region options on the same surface.",
      },
    ],
    appendix: {
      title: "Grounding detail",
      format: "text",
      body: `Grounded via ${toolExecution?.serverName ?? "unknown server"}.${toolExecution?.toolName ?? "unknown tool"} using live OCI region data.`,
    },
    meta: {
      source: "server",
      model: "grounded-region-selector",
      generatedAt: new Date().toISOString(),
    },
  };
}

export function buildRegionSelectorActionMessages(
  message: A2UIClientEventMessage,
): A2UIMessage[] {
  const userAction = message.userAction;
  if (!userAction) {
    throw new Error("Region selector actions must include userAction.");
  }

  if (userAction.name !== REGION_SELECTOR_ACTION_NAME) {
    throw new Error(`Unsupported region selector action "${userAction.name}".`);
  }

  const encodedRegion =
    typeof userAction.context?.regionValue === "string"
      ? userAction.context.regionValue.trim()
      : "";
  const { key: regionKey, name: regionName } = decodeRegionValue(encodedRegion);

  const summary = regionName
    ? `Selected ${regionName}${regionKey ? ` (${regionKey})` : ""}. This grounded request fetched the region catalog through MCP and returned the choice through an A2UI userAction round trip.`
    : "No region was selected. Choose a region from the dropdown, then submit again.";

  return [
    {
      dataModelUpdate: {
        surfaceId: MAIN_SURFACE_ID,
        path: "/result",
        contents: [
          { key: "message", valueString: summary },
          { key: "submittedAt", valueString: userAction.timestamp },
          { key: "selectedRegionName", valueString: regionName },
          { key: "selectedRegionKey", valueString: regionKey },
        ],
      },
    },
  ];
}

export async function buildRegionSelectorPaginationMessages(
  message: A2UIClientEventMessage,
  appConfig: AppConfig,
): Promise<A2UIMessage[]> {
  const userAction = message.userAction;
  if (!userAction) {
    throw new Error("Region selector paging must include userAction.");
  }

  if (userAction.name !== REGION_SELECTOR_PAGINATE_ACTION_NAME) {
    throw new Error(`Unsupported region selector action "${userAction.name}".`);
  }

  const direction =
    userAction.context?.direction === "previous" ? "previous" : "next";
  const currentPageIndex = parseInteger(userAction.context?.currentPageIndex, 0);
  const pageSize = clampPageSize(
    parseInteger(userAction.context?.pageSize, DEFAULT_REGION_PAGE_SIZE),
  );
  const preferredServerName =
    typeof userAction.context?.serverName === "string" &&
    userAction.context.serverName.trim()
      ? userAction.context.serverName.trim()
      : undefined;
  const catalogId =
    typeof userAction.context?.catalogId === "string" &&
    userAction.context.catalogId.trim()
      ? userAction.context.catalogId.trim()
      : undefined;
  const nextPageIndex =
    direction === "previous" ? currentPageIndex - 1 : currentPageIndex + 1;
  const toolExecution = await loadGroundedRegionToolExecution(
    appConfig,
    preferredServerName,
  );
  const nextViewModel = buildRegionSelectionViewModel(toolExecution, {
    pageIndex: nextPageIndex,
    pageSize,
    serverName: toolExecution.serverName,
  });

  if (!nextViewModel) {
    return renderA2UIViewModel(
      buildGroundedFailureViewModel(
        "change my current region",
        buildRegionSelectionFailure(toolExecution),
      ),
      resolveRegionPaginationCatalogRuntime(catalogId),
    );
  }

  return renderA2UIViewModel(
    nextViewModel,
    resolveRegionPaginationCatalogRuntime(catalogId),
  );
}

export function buildRegionSelectionFailure(
  toolExecution: MCPToolExecution | undefined,
): Error {
  if (!toolExecution) {
    return new Error(
      "No grounded MCP tool result was available for the region-selection request.",
    );
  }

  const toolError = extractToolError(toolExecution.resultText);
  if (toolError) {
    return new Error(toolError);
  }

  return new Error(
    `The grounded tool result from ${toolExecution.serverName}.${toolExecution.toolName} did not contain OCI region rows.`,
  );
}

export async function loadGroundedRegionToolExecution(
  appConfig: AppConfig,
  preferredServerName?: string,
): Promise<MCPToolExecution> {
  const serverDefinitions = resolveActiveRegionServers(appConfig, preferredServerName);
  const failures: string[] = [];

  for (const definition of serverDefinitions) {
    try {
      const resultText = await withMcpClient(definition, async (client) => {
        const tools = await listAvailableTools(
          client,
          definition.name,
          definition.toolAllowlist,
        );

        if (!tools.some((tool) => tool.name === REGION_LIST_TOOL_NAME)) {
          throw new Error(
            `no ${REGION_LIST_TOOL_NAME} tool available on ${definition.name}`,
          );
        }

        return callMcpTool(client, REGION_LIST_TOOL_NAME, REGION_LIST_TOOL_ARGS);
      });

      return {
        serverName: definition.name,
        toolName: REGION_LIST_TOOL_NAME,
        arguments: REGION_LIST_TOOL_ARGS,
        resultText,
      };
    } catch (error) {
      failures.push(
        `${definition.name}: ${
          error instanceof Error ? error.message : "unknown region lookup error"
        }`,
      );
    }
  }

  throw new Error(
    `Unable to load OCI regions from MCP. ${
      failures.length ? failures.join("; ") : "No region-capable MCP server is configured."
    }`,
  );
}

function extractRegions(resultText: string): OciRegion[] {
  const parsed = safeParseJson(resultText);
  const candidates = collectRegionCandidates(parsed ?? resultText);
  const deduped = new Map<string, OciRegion>();

  for (const candidate of candidates) {
    const key = candidate.key.trim();
    const name = candidate.name.trim();
    if (!key || !name) {
      continue;
    }
    deduped.set(`${key}:${name}`, { key, name });
  }

  return [...deduped.values()].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

function extractToolError(resultText: string) {
  const parsed = safeParseJson(resultText);

  if (isRecord(parsed) && typeof parsed.error === "string" && parsed.error.trim()) {
    return parsed.error.trim();
  }

  return undefined;
}

function encodeRegionValue(region: OciRegion) {
  return `${region.key}::${region.name}`;
}

function decodeRegionValue(value: string) {
  const [key = "", ...nameParts] = value.split("::");
  return {
    key: key.trim(),
    name: nameParts.join("::").trim(),
  };
}

function clampPageIndex(pageIndex: number, lastPageIndex: number) {
  if (!Number.isFinite(pageIndex)) {
    return 0;
  }

  return Math.max(0, Math.min(lastPageIndex, Math.trunc(pageIndex)));
}

function clampPageSize(pageSize: number | undefined) {
  if (!pageSize || !Number.isFinite(pageSize) || pageSize <= 0) {
    return DEFAULT_REGION_PAGE_SIZE;
  }

  return Math.trunc(pageSize);
}

function parseInteger(value: unknown, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function collectRegionCandidates(value: unknown): OciRegion[] {
  const matches: OciRegion[] = [];

  walk(value, (entry) => {
    if (!isRecord(entry)) {
      return;
    }

    const key = firstString(
      entry.key,
      entry.regionKey,
      entry.region_key,
      entry.code,
    );
    const name = firstString(entry.name, entry.regionName, entry.region_name);

    if (key && name) {
      matches.push({ key, name });
    }
  });

  return matches;
}

function walk(value: unknown, visit: (value: unknown) => void) {
  visit(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      walk(item, visit);
    }
    return;
  }

  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      walk(item, visit);
    }
  }
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function resolveActiveRegionServers(
  appConfig: AppConfig,
  preferredServerName?: string,
) {
  const configuredServers = appConfig.mcp.servers;
  const activeServerNames = appConfig.mcp.activeServers?.length
    ? appConfig.mcp.activeServers
    : Object.keys(configuredServers);

  const prioritizedNames = preferredServerName
    ? [preferredServerName, ...activeServerNames.filter((name) => name !== preferredServerName)]
    : activeServerNames;

  return prioritizedNames
    .map((serverName) => configuredServers[serverName])
    .filter(Boolean);
}

function resolveRegionPaginationCatalogRuntime(catalogId?: string) {
  if (!catalogId) {
    return undefined;
  }

  try {
    return negotiateCatalog({
      supportedCatalogIds: [catalogId],
    });
  } catch {
    return undefined;
  }
}
