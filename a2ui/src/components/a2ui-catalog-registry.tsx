"use client";

import {
  createContext,
  memo,
  useContext,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ComponentNode,
  ComponentRegistry,
  registerDefaultCatalog,
  useA2UIComponent,
  type A2UIComponentProps,
  type Action,
  type AnyComponentNode,
  type StringValue,
} from "@a2ui/react";
import {
  buildCatalogRuntime,
  getBuiltInCatalogs,
  type A2UICatalogDefinition,
} from "@/lib/a2ui/catalogs";
import type { A2UIRendererRole } from "@/lib/a2ui/catalogs/types";

const CatalogRegistryContext = createContext<ComponentRegistry | null>(null);

export function CatalogRegistryProvider({
  registry,
  children,
}: {
  registry: ComponentRegistry;
  children: ReactNode;
}) {
  return (
    <CatalogRegistryContext.Provider value={registry}>
      {children}
    </CatalogRegistryContext.Provider>
  );
}

export function createA2UIRegistry(
  inlineCatalogs: A2UICatalogDefinition[] = [],
) {
  const registry = new ComponentRegistry();
  const inlineCatalogRegistry = new Map(
    inlineCatalogs.map((catalog) => [catalog.catalogId, catalog]),
  );

  registerDefaultCatalog(registry);

  for (const catalog of [...getBuiltInCatalogs(), ...inlineCatalogs]) {
    const runtime = buildCatalogRuntime(catalog, inlineCatalogRegistry);
    for (const [role, componentType] of Object.entries(runtime.roleComponents)) {
      const renderer = roleRenderers[role as A2UIRendererRole];
      if (renderer && componentType) {
        registry.register(componentType, { component: renderer });
      }
    }
  }

  return registry;
}

const roleRenderers: Record<
  A2UIRendererRole,
  ComponentType<A2UIComponentProps<AnyComponentNode>>
> = {
  column: memo(function CatalogColumn({
    node,
    surfaceId,
  }: A2UIComponentProps<AnyComponentNode>) {
    const registry = useCatalogRegistry();
    const props = readProperties(node);
    const variant = readString(props.variant);

    return (
      <div className={columnClassName(node.id, variant)} style={hostStyle(node)}>
        {readChildren(props.children).map((child) => (
          <ComponentNode
            key={child.id}
            node={child}
            surfaceId={surfaceId}
            registry={registry}
          />
        ))}
      </div>
    );
  }),
  row: memo(function CatalogRow({
    node,
    surfaceId,
  }: A2UIComponentProps<AnyComponentNode>) {
    const registry = useCatalogRegistry();
    const props = readProperties(node);
    const variant = readString(props.variant);
    const children = readChildren(props.children);
    const tableStyle =
      variant === "table-header-row" ||
      variant === "table-header" ||
      variant === "table-row"
        ? { gridTemplateColumns: `repeat(${children.length}, minmax(0, 1fr))` }
        : undefined;

    return (
      <div
        className={rowClassName(node.id, variant)}
        style={{ ...hostStyle(node), ...tableStyle }}
      >
        {children.map((child) => (
          <ComponentNode
            key={child.id}
            node={child}
            surfaceId={surfaceId}
            registry={registry}
          />
        ))}
      </div>
    );
  }),
  card: memo(function CatalogCard({
    node,
    surfaceId,
  }: A2UIComponentProps<AnyComponentNode>) {
    const registry = useCatalogRegistry();
    const props = readProperties(node);
    const variant = readString(props.variant);
    const child = readChild(props.child);

    if (!child) {
      return null;
    }

    return (
      <section className={cardClassName(node.id, variant)} style={hostStyle(node)}>
        <ComponentNode node={child} surfaceId={surfaceId} registry={registry} />
      </section>
    );
  }),
  text: memo(function CatalogText({
    node,
    surfaceId,
  }: A2UIComponentProps<AnyComponentNode>) {
    const { resolveString } = useA2UIComponent(node, surfaceId);
    const props = readProperties(node);
    const text = resolveBoundText(props.text, resolveString);
    const variant = readString(props.variant);

    if (!text) {
      return null;
    }

    return renderText(node.id, text, variant);
  }),
  button: memo(function CatalogButton({
    node,
    surfaceId,
  }: A2UIComponentProps<AnyComponentNode>) {
    const { sendAction } = useA2UIComponent(node, surfaceId);
    const registry = useCatalogRegistry();
    const props = readProperties(node);
    const child = readChild(props.child);
    const action = readAction(props.action);

    if (!child) {
      return null;
    }

    return (
      <button
        type="button"
        className={readBoolean(props.primary) ? "primary-button" : "secondary-button"}
        style={hostStyle(node)}
        onClick={() => {
          if (action) {
            sendAction(action);
          }
        }}
      >
        <ComponentNode node={child} surfaceId={surfaceId} registry={registry} />
      </button>
    );
  }),
  select: memo(function CatalogSelect({
    node,
    surfaceId,
  }: A2UIComponentProps<AnyComponentNode>) {
    const { getUniqueId, getValue, resolveString, setValue } = useA2UIComponent(
      node,
      surfaceId,
    );
    const props = readProperties(node);
    const label = resolveBoundText(props.label, resolveString);
    const placeholder = resolveBoundText(props.placeholder, resolveString);
    const valuePath = readBoundPath(props.value);
    const boundValue = valuePath ? getValue(valuePath) : null;
    const currentValue =
      typeof boundValue === "string"
        ? boundValue
        : resolveBoundText(props.value, resolveString) ?? "";
    const options = readSelectOptions(props.options, resolveString);
    const selectId = getUniqueId(node.id);

    return (
      <label className="a2ui-select-field" htmlFor={selectId} style={hostStyle(node)}>
        {label ? <span className="a2ui-select-label">{label}</span> : null}
        <select
          id={selectId}
          className="a2ui-select-input"
          value={currentValue}
          onChange={(event) => {
            if (valuePath) {
              setValue(valuePath, event.target.value);
            }
          }}
        >
          <option value="">{placeholder ?? "Select an option"}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }),
  divider: memo(function CatalogDivider({
    node,
  }: A2UIComponentProps<AnyComponentNode>) {
    return <hr className="a2ui-divider" style={hostStyle(node)} />;
  }),
};

function useCatalogRegistry() {
  const registry = useContext(CatalogRegistryContext);
  if (!registry) {
    throw new Error("Catalog registry is not available.");
  }

  return registry;
}

function readProperties(node: AnyComponentNode) {
  return node.properties as Record<string, unknown>;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

function readAction(value: unknown): Action | undefined {
  if (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string"
  ) {
    return value as Action;
  }

  return undefined;
}

function readBoundPath(value: unknown) {
  if (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    typeof value.path === "string"
  ) {
    return value.path;
  }

  return undefined;
}

function readSelectOptions(
  value: unknown,
  resolveString: (value: StringValue | null | undefined) => string | null,
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("value" in entry) ||
      typeof entry.value !== "string" ||
      !("label" in entry)
    ) {
      return [];
    }

    const label = resolveBoundText(entry.label, resolveString);
    if (!label) {
      return [];
    }

    return [{ label, value: entry.value }];
  });
}

function readChildren(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isNode);
}

function readChild(value: unknown) {
  return isNode(value) ? value : null;
}

function resolveBoundText(
  value: unknown,
  resolveString: (value: StringValue | null | undefined) => string | null,
) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && value !== null) {
    return resolveString(value as StringValue);
  }

  return null;
}

function isNode(value: unknown): value is AnyComponentNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "type" in value &&
    typeof value.type === "string"
  );
}

function hostStyle(node: AnyComponentNode) {
  if (node.weight === undefined) {
    return undefined;
  }

  return { "--weight": node.weight } as CSSProperties;
}

function renderText(componentId: string, value: string, variant?: string) {
  if (variant === "hero-title" || variant === "page-title" || componentId === "page-title") {
    return <strong>{value}</strong>;
  }

  if (
    variant === "section-title" ||
    componentId.endsWith("-section-title")
  ) {
    return <h3>{value}</h3>;
  }

  if (variant === "metric-label") {
    return <span className="metric-label">{value}</span>;
  }

  if (variant === "metric-value") {
    return <span className="metric-value">{value}</span>;
  }

  if (variant === "metric-detail") {
    return <span className="metric-detail">{value}</span>;
  }

  if (variant === "item-title") {
    return <strong>{value}</strong>;
  }

  if (variant === "table-header-cell") {
    return <span className="a2ui-table-header-cell">{value}</span>;
  }

  if (variant === "table-cell") {
    return <span className="a2ui-table-cell">{value}</span>;
  }

  if (variant === "meta") {
    return <span>{value}</span>;
  }

  if (variant === "code") {
    return <pre className="a2ui-code">{value}</pre>;
  }

  return (
    <p
      className="section-copy"
      style={
        variant === "hero-summary" ||
        variant === "page-summary" ||
        componentId === "page-summary"
          ? { marginTop: 8 }
          : undefined
      }
    >
      {value}
    </p>
  );
}

function columnClassName(componentId: string, variant?: string) {
  if (variant === "steps" || componentId === "steps-list" || componentId.startsWith("steps-list-")) {
    return "steps";
  }

  if (
    variant === "action-list" ||
    componentId === "actions-list" ||
    componentId.startsWith("actions-list-")
  ) {
    return "action-list";
  }

  if (
    variant === "table" ||
    componentId === "table-frame" ||
    componentId.startsWith("table-frame-")
  ) {
    return "a2ui-table";
  }

  return "a2ui-column";
}

function rowClassName(componentId: string, variant?: string) {
  if (
    variant === "metric-grid" ||
    componentId === "metrics-grid" ||
    componentId.startsWith("metrics-grid-")
  ) {
    return "metric-grid";
  }

  if (
    variant === "table-header-row" ||
    variant === "table-header" ||
    componentId === "table-header" ||
    componentId.startsWith("table-header-")
  ) {
    return "a2ui-table-row a2ui-table-row-header";
  }

  if (variant === "table-row" || componentId.startsWith("table-row-")) {
    return "a2ui-table-row";
  }

  if (
    variant === "metadata-row" ||
    variant === "meta-row" ||
    componentId === "meta-row"
  ) {
    return "meta-row";
  }

  return "a2ui-row";
}

function cardClassName(componentId: string, variant?: string) {
  if (variant === "surface-summary" || componentId === "header-card") {
    return "surface-summary";
  }

  if (variant === "callout-info" || componentId.startsWith("callout-info-")) {
    return "block callout-info";
  }

  if (variant === "callout-warning" || componentId.startsWith("callout-warning-")) {
    return "block callout-warning";
  }

  if (variant === "callout-success" || componentId.startsWith("callout-success-")) {
    return "block callout-success";
  }

  if (variant === "metric-card" || componentId.startsWith("metric-card-")) {
    return "metric-card";
  }

  if (variant === "item-card" || componentId.startsWith("step-card-")) {
    return "a2ui-item-card";
  }

  if (variant === "action-row" || componentId.startsWith("action-card-")) {
    return "action-row";
  }

  if (variant === "code-block" || componentId.startsWith("code-")) {
    return "block code-block";
  }

  return "block";
}
