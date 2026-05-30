export const A2UI_SCHEMA_NAME = "a2ui_view_model";

export const A2UI_SCHEMA_DESCRIPTION = `
Return valid JSON only.
Shape the response as a semantic view model with:
- surfaceKind: optional string enum "briefing" | "ops_console" | "decision_report"
- title: short string
- summary: concise overview
- status?: { tone, title, body }
- metrics?: array of { label, value, detail? }
- checklistTitle?: string
- checklist?: array of { title, detail }
- table?: { title, columns[string], rows[string[]] }
- selection?: { title, body, label, placeholder?, options[{ label, value, detail? }], submitLabel, actionName, actionEndpoint, actionContextKey, resultTitle?, resultMessage?, pagination? }
- actionsTitle?: string
- actions?: array of { label, description }
- appendix?: { title, body, format }

For list, compare, enumerate, catalog, or inventory requests, use a non-null table whenever the result contains repeated records or rows.
When live MCP tool output contains OCI resource lists, region lists, inventory, or lookup rows, treat table output as the default semantic representation.
Use metrics, status, actions, and appendix as supporting context around the table instead of replacing it.
For prompts that ask the user to choose, switch, change, or set a region or other live grounded target from repeated options, prefer a non-null selection section in addition to any supporting table.
If an optional section does not apply, use null instead of omitting the key.

Do not choose raw UI components. The server owns template selection and A2UI protocol generation.
Do not include markdown fences. Do not include prose outside the JSON object.
`;

const STRING_SCHEMA = { type: "string" } as const;

function nullable(schema: Record<string, unknown>) {
  return {
    anyOf: [schema, { type: "null" }],
  };
}

function strictObject(properties: Record<string, unknown>) {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  };
}

const STATUS_SCHEMA = strictObject({
  tone: {
    type: "string",
    enum: ["info", "warning", "success"],
  },
  title: STRING_SCHEMA,
  body: STRING_SCHEMA,
});

const METRIC_SCHEMA = strictObject({
  label: STRING_SCHEMA,
  value: STRING_SCHEMA,
  detail: nullable(STRING_SCHEMA),
});

const CHECKLIST_ITEM_SCHEMA = strictObject({
  title: STRING_SCHEMA,
  detail: STRING_SCHEMA,
});

const TABLE_SCHEMA = strictObject({
  title: STRING_SCHEMA,
  columns: {
    type: "array",
    items: STRING_SCHEMA,
  },
  rows: {
    type: "array",
    items: {
      type: "array",
      items: STRING_SCHEMA,
    },
  },
});

const ACTION_SCHEMA = strictObject({
  label: STRING_SCHEMA,
  description: STRING_SCHEMA,
});

const SELECTION_OPTION_SCHEMA = strictObject({
  label: STRING_SCHEMA,
  value: STRING_SCHEMA,
  detail: nullable(STRING_SCHEMA),
});

const SELECTION_PAGINATION_SCHEMA = strictObject({
  pageIndex: {
    type: "integer",
    minimum: 0,
  },
  pageSize: {
    type: "integer",
    minimum: 1,
  },
  totalOptions: {
    type: "integer",
    minimum: 0,
  },
  actionName: STRING_SCHEMA,
  previousLabel: nullable(STRING_SCHEMA),
  nextLabel: nullable(STRING_SCHEMA),
  serverName: nullable(STRING_SCHEMA),
});

const SELECTION_SCHEMA = strictObject({
  title: STRING_SCHEMA,
  body: STRING_SCHEMA,
  label: STRING_SCHEMA,
  placeholder: nullable(STRING_SCHEMA),
  options: {
    type: "array",
    items: SELECTION_OPTION_SCHEMA,
  },
  submitLabel: STRING_SCHEMA,
  actionName: STRING_SCHEMA,
  actionEndpoint: STRING_SCHEMA,
  actionContextKey: STRING_SCHEMA,
  resultTitle: nullable(STRING_SCHEMA),
  resultMessage: nullable(STRING_SCHEMA),
  pagination: nullable(SELECTION_PAGINATION_SCHEMA),
});

const APPENDIX_SCHEMA = strictObject({
  title: STRING_SCHEMA,
  body: STRING_SCHEMA,
  format: {
    type: "string",
    enum: ["text", "pre"],
  },
});

export const A2UI_VIEW_MODEL_SCHEMA = strictObject({
  surfaceKind: nullable({
    type: "string",
    enum: ["briefing", "ops_console", "decision_report"],
  }),
  title: STRING_SCHEMA,
  summary: STRING_SCHEMA,
  status: nullable(STATUS_SCHEMA),
  metrics: nullable({
    type: "array",
    items: METRIC_SCHEMA,
  }),
  checklistTitle: nullable(STRING_SCHEMA),
  checklist: nullable({
    type: "array",
    items: CHECKLIST_ITEM_SCHEMA,
  }),
  table: nullable(TABLE_SCHEMA),
  selection: nullable(SELECTION_SCHEMA),
  actionsTitle: nullable(STRING_SCHEMA),
  actions: nullable({
    type: "array",
    items: ACTION_SCHEMA,
  }),
  appendix: nullable(APPENDIX_SCHEMA),
});
