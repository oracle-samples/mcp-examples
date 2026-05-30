import {
  builtInCatalogs,
  panelCatalog,
  PANEL_CATALOG_ID,
  reportingCatalog,
  REPORTING_CATALOG_ID,
} from "./builtins.ts";
import {
  type A2UICatalogDefinition,
  type A2UICatalogRuntime,
  type A2UIClientCapabilities,
  type A2UIRendererRole,
  type A2UICatalogSchema,
  A2UIClientCapabilitiesError,
  CatalogNegotiationError,
} from "./types.ts";

const builtInCatalogRegistry = new Map(
  builtInCatalogs.map((catalog) => [catalog.catalogId, catalog]),
);

const requiredRoles: A2UIRendererRole[] = ["column", "row", "card", "text"];

export function getDefaultCatalogDefinition() {
  return reportingCatalog;
}

export function getBuiltInCatalogs() {
  return builtInCatalogs;
}

export function getBuiltInCatalog(catalogId: string) {
  return builtInCatalogRegistry.get(catalogId);
}

export function getDefaultCatalogRuntime(): A2UICatalogRuntime {
  return buildCatalogRuntime(reportingCatalog);
}

export function parseClientCapabilities(value: unknown): A2UIClientCapabilities | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new A2UIClientCapabilitiesError(
      "a2uiClientCapabilities must be an object when provided.",
    );
  }

  const supportedCatalogIds = Array.isArray(value.supportedCatalogIds)
    ? value.supportedCatalogIds.flatMap((item) =>
        typeof item === "string" && item.trim() ? [item.trim()] : [],
      )
    : [];

  const inlineCatalogs = Array.isArray(value.inlineCatalogs)
    ? value.inlineCatalogs.map((item, index) => {
        const catalog = parseInlineCatalog(item);
        if (!catalog) {
          throw new A2UIClientCapabilitiesError(
            `a2uiClientCapabilities.inlineCatalogs[${index}] is not a valid A2UI catalog definition.`,
          );
        }
        return catalog;
      })
    : undefined;

  if (!supportedCatalogIds.length) {
    throw new A2UIClientCapabilitiesError(
      "a2uiClientCapabilities.supportedCatalogIds must contain at least one catalog ID.",
    );
  }

  return {
    supportedCatalogIds,
    inlineCatalogs,
  };
}

export function negotiateCatalog(
  capabilities?: A2UIClientCapabilities,
): A2UICatalogRuntime {
  if (!capabilities) {
    return getDefaultCatalogRuntime();
  }

  const inlineCatalogs = new Map(
    (capabilities.inlineCatalogs ?? []).map((catalog) => [catalog.catalogId, catalog]),
  );
  const supportedCatalogIds = capabilities.supportedCatalogIds ?? [];

  if (supportedCatalogIds.length > 0) {
    for (const catalogId of supportedCatalogIds) {
      const negotiated =
        inlineCatalogs.get(catalogId) ?? builtInCatalogRegistry.get(catalogId);
      if (negotiated) {
        return buildCatalogRuntime(negotiated, inlineCatalogs);
      }
    }

    throw new CatalogNegotiationError(
      `No compatible A2UI catalog was negotiated. Client supported: ${supportedCatalogIds.join(", ")}`,
    );
  }
  throw new CatalogNegotiationError(
    "No supportedCatalogIds were provided for A2UI catalog negotiation.",
  );
}

export function buildCatalogRuntime(
  catalog: A2UICatalogDefinition,
  inlineCatalogRegistry: Map<string, A2UICatalogDefinition> = new Map(),
): A2UICatalogRuntime {
  const resolvedCatalog = resolveCatalogDefinition(catalog, inlineCatalogRegistry);
  const roleComponents: Partial<Record<A2UIRendererRole, string>> = {};
  const componentRoles: Record<string, A2UIRendererRole> = {};

  for (const [componentName, schema] of Object.entries(resolvedCatalog.components)) {
    const role = schema["x-a2uiRole"];
    if (!role) {
      continue;
    }

    componentRoles[componentName] = role;
    roleComponents[role] = componentName;
  }

  for (const role of requiredRoles) {
    if (!roleComponents[role]) {
      throw new CatalogNegotiationError(
        `Catalog "${resolvedCatalog.catalogId}" does not define the required "${role}" role.`,
      );
    }
  }

  return {
    catalog: resolvedCatalog,
    roleComponents,
    componentRoles,
  };
}

export function getCatalogRuntime(
  catalogId?: string,
  inlineCatalogs: A2UICatalogDefinition[] = [],
): A2UICatalogRuntime {
  const inlineCatalogRegistry = new Map(
    inlineCatalogs.map((catalog) => [catalog.catalogId, catalog]),
  );

  if (!catalogId) {
    return getDefaultCatalogRuntime();
  }

  const inlineCatalog = inlineCatalogs.find((catalog) => catalog.catalogId === catalogId);
  if (inlineCatalog) {
    return buildCatalogRuntime(inlineCatalog, inlineCatalogRegistry);
  }

  const builtInCatalog = builtInCatalogRegistry.get(catalogId);
  if (builtInCatalog) {
    return buildCatalogRuntime(builtInCatalog, inlineCatalogRegistry);
  }

  throw new CatalogNegotiationError(
    `Catalog "${catalogId}" is not implemented by this renderer.`,
  );
}

export const exampleInlinePanelCatalog: A2UICatalogDefinition = {
  ...panelCatalog,
  catalogId: "https://example.com/catalogs/inline-panel/v1/catalog.json",
  title: "Inline Panel Catalog",
  styles: {},
};

export const availableCatalogChoices = [
  {
    id: REPORTING_CATALOG_ID,
    label: "Reporting Catalog",
    description: "Default built-in catalog used by the app.",
  },
  {
    id: PANEL_CATALOG_ID,
    label: "Panel Catalog",
    description: "Built-in custom catalog with renamed component types.",
  },
  {
    id: exampleInlinePanelCatalog.catalogId,
    label: "Inline Panel Catalog",
    description: "Client-provided inline catalog using the panel renderer profile.",
  },
];

function resolveCatalogDefinition(
  catalog: A2UICatalogDefinition,
  inlineCatalogRegistry: Map<string, A2UICatalogDefinition>,
  seenCatalogIds: Set<string> = new Set(),
): A2UICatalogDefinition {
  if (!catalog.extendsCatalogId) {
    return catalog;
  }

  if (seenCatalogIds.has(catalog.catalogId)) {
    throw new CatalogNegotiationError(
      `Catalog "${catalog.catalogId}" creates an inheritance cycle.`,
    );
  }

  const baseCatalog =
    inlineCatalogRegistry.get(catalog.extendsCatalogId) ??
    builtInCatalogRegistry.get(catalog.extendsCatalogId);
  if (!baseCatalog) {
    throw new CatalogNegotiationError(
      `Catalog "${catalog.catalogId}" extends unknown catalog "${catalog.extendsCatalogId}".`,
    );
  }

  const nextSeenCatalogIds = new Set(seenCatalogIds);
  nextSeenCatalogIds.add(catalog.catalogId);
  const resolvedBaseCatalog = resolveCatalogDefinition(
    baseCatalog,
    inlineCatalogRegistry,
    nextSeenCatalogIds,
  );

  return {
    catalogId: catalog.catalogId,
    title: catalog.title,
    description: catalog.description ?? resolvedBaseCatalog.description,
    extendsCatalogId: catalog.extendsCatalogId,
    components: {
      ...resolvedBaseCatalog.components,
      ...catalog.components,
    },
    styles: {
      ...(resolvedBaseCatalog.styles ?? {}),
      ...(catalog.styles ?? {}),
    },
  };
}

function parseInlineCatalog(value: unknown): A2UICatalogDefinition | null {
  if (!isRecord(value)) {
    return null;
  }

  const catalogId = typeof value.catalogId === "string" ? value.catalogId.trim() : "";
  const components = value.components;
  const styles = value.styles;

  if (!catalogId || !isRecord(components) || !isRecord(styles)) {
    return null;
  }

  const normalizedComponents: Record<string, A2UICatalogDefinition["components"][string]> = {};
  for (const [componentName, schema] of Object.entries(components)) {
    const normalizedSchema = parseCatalogSchema(schema);
    if (!normalizedSchema) {
      return null;
    }
    normalizedComponents[componentName] = normalizedSchema;
  }

  const normalizedStyles: Record<string, A2UICatalogSchema> = {};
  for (const [styleName, schema] of Object.entries(styles)) {
    const normalizedSchema = parseCatalogSchema(schema);
    if (!normalizedSchema) {
      return null;
    }
    normalizedStyles[styleName] = normalizedSchema;
  }

  return {
    catalogId,
    title: typeof value.title === "string" ? value.title.trim() : undefined,
    description:
      typeof value.description === "string" ? value.description : undefined,
    extendsCatalogId:
      typeof value.extendsCatalogId === "string"
        ? value.extendsCatalogId.trim() || undefined
        : undefined,
    components: normalizedComponents,
    styles: normalizedStyles,
  };
}

function parseCatalogSchema(value: unknown): A2UICatalogSchema | null {
  if (!isRecord(value)) {
    return null;
  }

  const role = value["x-a2uiRole"];
  if (
    role !== undefined &&
    role !== "column" &&
    role !== "row" &&
    role !== "card" &&
    role !== "text" &&
    role !== "button" &&
    role !== "divider"
  ) {
    return null;
  }

  return { ...value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export {
  panelCatalog,
  PANEL_CATALOG_ID,
  reportingCatalog,
  REPORTING_CATALOG_ID,
};

export type {
  A2UICatalogDefinition,
  A2UICatalogSchema,
  A2UICatalogRuntime,
  A2UIClientCapabilities,
};

export { A2UIClientCapabilitiesError, CatalogNegotiationError };
