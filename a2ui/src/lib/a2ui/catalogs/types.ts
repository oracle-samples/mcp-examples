export type A2UIRendererRole =
  | "column"
  | "row"
  | "card"
  | "text"
  | "button"
  | "select"
  | "divider";

export type A2UICatalogSchema = Record<string, unknown> & {
  "x-a2uiRole"?: A2UIRendererRole;
};

export type A2UICatalogDefinition = {
  catalogId: string;
  title?: string;
  description?: string;
  extendsCatalogId?: string;
  components: Record<string, A2UICatalogSchema>;
  styles: Record<string, A2UICatalogSchema>;
};

export type A2UIClientCapabilities = {
  supportedCatalogIds: string[];
  inlineCatalogs?: A2UICatalogDefinition[];
};

export type A2UICatalogRuntime = {
  catalog: A2UICatalogDefinition;
  roleComponents: Partial<Record<A2UIRendererRole, string>>;
  componentRoles: Record<string, A2UIRendererRole>;
};

export class CatalogNegotiationError extends Error {}

export class A2UIClientCapabilitiesError extends Error {}
