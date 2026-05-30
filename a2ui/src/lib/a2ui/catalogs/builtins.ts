import type { A2UICatalogDefinition, A2UICatalogSchema } from "./types.ts";

export const REPORTING_CATALOG_ID =
  "https://rigebha.dev/catalogs/a2ui-reporting/v1/catalog.json";

export const PANEL_CATALOG_ID =
  "https://rigebha.dev/catalogs/a2ui-panel/v1/catalog.json";

const TEXT_USAGE_HINT_ENUM = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "caption",
  "body",
] as const;

const BOUND_STRING_SCHEMA: A2UICatalogSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    literalString: {
      type: "string",
    },
    path: {
      type: "string",
    },
  },
  minProperties: 1,
  maxProperties: 2,
};

const CHILDREN_SCHEMA: A2UICatalogSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    explicitList: {
      type: "array",
      items: {
        type: "string",
      },
    },
    template: {
      type: "object",
      additionalProperties: false,
      properties: {
        componentId: {
          type: "string",
        },
        dataBinding: {
          type: "string",
        },
      },
      required: ["componentId", "dataBinding"],
    },
  },
  minProperties: 1,
  maxProperties: 1,
};

const ACTION_VALUE_SCHEMA: A2UICatalogSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    path: {
      type: "string",
    },
    literalString: {
      type: "string",
    },
    literalNumber: {
      type: "number",
    },
    literalBoolean: {
      type: "boolean",
    },
  },
  minProperties: 1,
  maxProperties: 1,
};

const ACTION_SCHEMA: A2UICatalogSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: {
      type: "string",
    },
    context: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          key: {
            type: "string",
          },
          value: ACTION_VALUE_SCHEMA,
        },
        required: ["key", "value"],
      },
    },
  },
  required: ["name"],
};

const STRING_VARIANT_SCHEMA: A2UICatalogSchema = {
  type: "string",
};

const STYLE_SCHEMAS = {
  font: {
    type: "string",
  },
  primaryColor: {
    type: "string",
    pattern: "^#[0-9a-fA-F]{6}$",
  },
} satisfies Record<string, A2UICatalogSchema>;

const baseTextSchema: A2UICatalogSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    text: BOUND_STRING_SCHEMA,
    usageHint: {
      type: "string",
      enum: [...TEXT_USAGE_HINT_ENUM],
    },
  },
  required: ["text"],
  "x-a2uiRole": "text",
};

const baseRowSchema: A2UICatalogSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    children: CHILDREN_SCHEMA,
    distribution: {
      type: "string",
      enum: [
        "center",
        "end",
        "spaceAround",
        "spaceBetween",
        "spaceEvenly",
        "start",
      ],
    },
    alignment: {
      type: "string",
      enum: ["start", "center", "end", "stretch"],
    },
  },
  required: ["children"],
  "x-a2uiRole": "row",
};

const baseColumnSchema: A2UICatalogSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    children: CHILDREN_SCHEMA,
    distribution: {
      type: "string",
      enum: [
        "start",
        "center",
        "end",
        "spaceBetween",
        "spaceAround",
        "spaceEvenly",
      ],
    },
    alignment: {
      type: "string",
      enum: ["center", "end", "start", "stretch"],
    },
  },
  required: ["children"],
  "x-a2uiRole": "column",
};

const baseCardSchema: A2UICatalogSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    child: {
      type: "string",
    },
  },
  required: ["child"],
  "x-a2uiRole": "card",
};

const baseButtonSchema: A2UICatalogSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    child: {
      type: "string",
    },
    primary: {
      type: "boolean",
    },
    action: ACTION_SCHEMA,
  },
  required: ["child", "action"],
  "x-a2uiRole": "button",
};

const baseSelectSchema: A2UICatalogSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    label: BOUND_STRING_SCHEMA,
    value: BOUND_STRING_SCHEMA,
    placeholder: BOUND_STRING_SCHEMA,
    options: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: BOUND_STRING_SCHEMA,
          value: {
            type: "string",
          },
        },
        required: ["label", "value"],
      },
    },
  },
  required: ["label", "value", "options"],
  "x-a2uiRole": "select",
};

const baseDividerSchema: A2UICatalogSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    axis: {
      type: "string",
      enum: ["horizontal", "vertical"],
    },
  },
  "x-a2uiRole": "divider",
};

function withVariant(schema: A2UICatalogSchema): A2UICatalogSchema {
  const properties =
    typeof schema.properties === "object" &&
    schema.properties !== null &&
    !Array.isArray(schema.properties)
      ? (schema.properties as Record<string, unknown>)
      : {};

  return {
    ...schema,
    properties: {
      ...properties,
      variant: STRING_VARIANT_SCHEMA,
    },
  };
}

export const reportingCatalog: A2UICatalogDefinition = {
  catalogId: REPORTING_CATALOG_ID,
  title: "Reporting Catalog",
  description: "The repo's default report-oriented A2UI component catalog.",
  components: {
    Column: withVariant(baseColumnSchema),
    Row: withVariant(baseRowSchema),
    Card: withVariant(baseCardSchema),
    Text: withVariant(baseTextSchema),
    Button: baseButtonSchema,
    SelectField: baseSelectSchema,
    Divider: baseDividerSchema,
  },
  styles: STYLE_SCHEMAS,
};

export const panelCatalog: A2UICatalogDefinition = {
  catalogId: PANEL_CATALOG_ID,
  title: "Panel Catalog",
  description:
    "A custom catalog that renames the built-in component family to align with a panel-style design system.",
  extendsCatalogId: REPORTING_CATALOG_ID,
  components: {
    Stack: withVariant({
      ...baseColumnSchema,
      "x-a2uiRole": "column",
    }),
    Inline: withVariant({
      ...baseRowSchema,
      "x-a2uiRole": "row",
    }),
    Panel: withVariant({
      ...baseCardSchema,
      "x-a2uiRole": "card",
    }),
    Copy: withVariant({
      ...baseTextSchema,
      "x-a2uiRole": "text",
    }),
    ActionButton: {
      ...baseButtonSchema,
      "x-a2uiRole": "button",
    },
    ChoiceSelect: {
      ...baseSelectSchema,
      "x-a2uiRole": "select",
    },
    Rule: {
      ...baseDividerSchema,
      "x-a2uiRole": "divider",
    },
  },
  styles: STYLE_SCHEMAS,
};

export const builtInCatalogs = [reportingCatalog, panelCatalog];
