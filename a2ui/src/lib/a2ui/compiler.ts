import {
  getDefaultCatalogRuntime,
  type A2UICatalogRuntime,
} from "./catalogs/index.ts";
import { validateA2UIMessageStream } from "./validate.ts";
import type {
  A2UIAction,
  A2UIAppendix,
  A2UIChecklistItem,
  A2UIMetric,
  A2UISelection,
  A2UISurfaceKind,
  A2UITable,
  A2UIViewModel,
} from "./types.ts";
import type {
  A2UIComponent,
  A2UIComponentProperties,
  A2UIDataEntry,
  A2UIMessage,
} from "./protocol.ts";

const surfaceId = "main";
const rootId = "root";

export function renderA2UIViewModel(
  viewModel: A2UIViewModel,
  catalogRuntime: A2UICatalogRuntime = getDefaultCatalogRuntime(),
): A2UIMessage[] {
  const components: A2UIComponent[] = [];
  const textMap: Record<string, string> = {};
  const rootChildren: string[] = [];
  const { roleComponents } = catalogRuntime;

  const addComponent = (
    id: string,
    role: keyof typeof roleComponents,
    properties: A2UIComponentProperties,
  ) => {
    const componentType = roleComponents[role];
    if (!componentType) {
      throw new Error(
        `Catalog "${catalogRuntime.catalog.catalogId}" cannot render the "${role}" role.`,
      );
    }

    components.push({
      id,
      component: {
        [componentType]: pruneUndefined(properties),
      },
    });
    return id;
  };

  const addText = (id: string, value: string, variant?: string) => {
    textMap[id] = value;
    return addComponent(id, "text", {
      text: { path: `/text/${id}` },
      variant,
    });
  };

  const addColumn = (id: string, children: string[], variant?: string) =>
    addComponent(id, "column", {
      children: { explicitList: children },
      variant,
    });

  const addRow = (id: string, children: string[], variant?: string) =>
    addComponent(id, "row", {
      children: { explicitList: children },
      variant,
    });

  const addCard = (id: string, child: string, variant = "block") =>
    addComponent(id, "card", {
      child,
      variant,
    });

  const addButton = (
    id: string,
    child: string,
    action: NonNullable<A2UIComponentProperties["action"]>,
    primary?: boolean,
  ) =>
    addComponent(id, "button", {
      child,
      action,
      primary,
    });

  const addSelect = (id: string, properties: A2UIComponentProperties) =>
    addComponent(id, "select", properties);

  const surfaceKind = selectSurfaceKind(viewModel);

  rootChildren.push(
    addCard(
      "header-card",
      addColumn("header-content", [
        addText("page-title", viewModel.title, "hero-title"),
        addText("page-summary", viewModel.summary, "hero-summary"),
      ]),
      "surface-summary",
    ),
  );

  if (viewModel.status) {
    rootChildren.push(renderStatus(viewModel, addText, addColumn, addCard));
  }

  if (viewModel.selection) {
    rootChildren.push(
      renderSelection(
        viewModel.selection,
        addComponent,
        addText,
        addColumn,
        addRow,
        addCard,
        addButton,
        addSelect,
      ),
    );
  }

  if (surfaceKind === "ops_console") {
    if (viewModel.metrics?.length) {
      rootChildren.push(renderMetrics(viewModel.metrics, addText, addColumn, addRow, addCard));
    }
    if (viewModel.table) {
      rootChildren.push(renderTable(viewModel.table, addText, addColumn, addRow, addCard));
    }
    if (viewModel.checklist?.length) {
      rootChildren.push(
        renderChecklist(
          viewModel.checklistTitle ?? "Checklist",
          viewModel.checklist,
          addText,
          addColumn,
          addCard,
        ),
      );
    }
  } else if (surfaceKind === "decision_report") {
    if (viewModel.metrics?.length) {
      rootChildren.push(renderMetrics(viewModel.metrics, addText, addColumn, addRow, addCard));
    }
    if (viewModel.checklist?.length) {
      rootChildren.push(
        renderChecklist(
          viewModel.checklistTitle ?? "Checklist",
          viewModel.checklist,
          addText,
          addColumn,
          addCard,
        ),
      );
    }
    if (viewModel.table) {
      rootChildren.push(renderTable(viewModel.table, addText, addColumn, addRow, addCard));
    }
  } else {
    if (viewModel.metrics?.length) {
      rootChildren.push(renderMetrics(viewModel.metrics, addText, addColumn, addRow, addCard));
    }
    if (viewModel.checklist?.length) {
      rootChildren.push(
        renderChecklist(
          viewModel.checklistTitle ?? "Checklist",
          viewModel.checklist,
          addText,
          addColumn,
          addCard,
        ),
      );
    }
    if (viewModel.actions?.length) {
      rootChildren.push(
        renderActions(
          viewModel.actionsTitle ?? "Actions",
          viewModel.actions,
          addText,
          addColumn,
          addCard,
        ),
      );
    }
    if (viewModel.table) {
      rootChildren.push(renderTable(viewModel.table, addText, addColumn, addRow, addCard));
    }
  }

  if (surfaceKind !== "briefing" && viewModel.actions?.length) {
    rootChildren.push(
      renderActions(
        viewModel.actionsTitle ?? "Actions",
        viewModel.actions,
        addText,
        addColumn,
        addCard,
      ),
    );
  }

  if (viewModel.appendix) {
    rootChildren.push(renderAppendix(viewModel.appendix, addText, addColumn, addCard));
  }

  if (viewModel.meta.fallbackReason) {
    rootChildren.push(
      addCard(
        "callout-warning-fallback-card",
        addColumn("callout-warning-fallback-content", [
          addText(
            "callout-warning-fallback-section-title",
            "Fallback path",
            "section-title",
          ),
          addText("callout-warning-fallback-body", viewModel.meta.fallbackReason),
        ]),
        "callout-warning",
      ),
    );
  }

  rootChildren.push(
    addRow(
      "meta-row",
      [
        addText("meta-source", `Source: ${viewModel.meta.source}`, "meta"),
        addText("meta-model", `Model: ${viewModel.meta.model}`, "meta"),
        addText(
          "meta-generated",
          `Generated: ${new Date(viewModel.meta.generatedAt).toLocaleString()}`,
          "meta",
        ),
      ],
      "metadata-row",
    ),
  );

  components.unshift({
    id: rootId,
    component: {
      [roleComponents.column!]: {
        children: { explicitList: rootChildren },
      },
    },
  });

  const messages: A2UIMessage[] = [
    {
      surfaceUpdate: {
        surfaceId,
        components,
      },
    },
    {
      dataModelUpdate: {
        surfaceId,
        contents: [
          {
            key: "text",
            valueMap: encodeStringMap(textMap),
          },
          ...(viewModel.selection
            ? [
                {
                  key: "draft",
                  valueMap: encodeStringMap({
                    selectedOptionValue: "",
                  }),
                },
                {
                  key: "result",
                  valueMap: encodeStringMap({
                    message:
                      viewModel.selection.resultMessage ??
                      "Waiting for a selection. Choose an option and submit it.",
                  }),
                },
                ...(viewModel.selection.pagination
                  ? [
                      {
                        key: "paging",
                        valueMap: encodeStringMap({
                          currentPageIndex: String(
                            viewModel.selection.pagination.pageIndex,
                          ),
                          pageSize: String(viewModel.selection.pagination.pageSize),
                          totalOptions: String(
                            viewModel.selection.pagination.totalOptions,
                          ),
                          serverName:
                            viewModel.selection.pagination.serverName ?? "",
                          status: formatSelectionPageStatus(
                            viewModel.selection.pagination.pageIndex,
                            viewModel.selection.pagination.pageSize,
                            viewModel.selection.pagination.totalOptions,
                          ),
                        }),
                      },
                    ]
                  : []),
              ]
            : []),
          {
            key: "meta",
            valueMap: encodeStringMap({
              source: viewModel.meta.source,
              model: viewModel.meta.model,
              generatedAt: viewModel.meta.generatedAt,
              fallbackReason: viewModel.meta.fallbackReason ?? "",
              surfaceKind,
              actionEndpoint: viewModel.selection?.actionEndpoint ?? "",
              catalogId: catalogRuntime.catalog.catalogId,
            }),
          },
        ],
      },
    },
    {
      beginRendering: {
        surfaceId,
        root: rootId,
        catalogId: catalogRuntime.catalog.catalogId,
      },
    },
  ];

  validateA2UIMessageStream(messages, catalogRuntime);
  return messages;
}

function renderStatus(
  viewModel: A2UIViewModel,
  addText: (id: string, value: string, variant?: string) => string,
  addColumn: (id: string, children: string[], variant?: string) => string,
  addCard: (id: string, child: string, variant?: string) => string,
) {
  const status = viewModel.status!;
  return addCard(
    `callout-${status.tone}-status-card`,
    addColumn(`callout-${status.tone}-status-content`, [
      addText("status-section-title", status.title, "section-title"),
      addText("status-body", status.body),
    ]),
    `callout-${status.tone}`,
  );
}

function renderMetrics(
  metrics: A2UIMetric[],
  addText: (id: string, value: string, variant?: string) => string,
  addColumn: (id: string, children: string[], variant?: string) => string,
  addRow: (id: string, children: string[], variant?: string) => string,
  addCard: (id: string, child: string, variant?: string) => string,
) {
  const metricCards = metrics.map((item, index) => {
    const children = [
      addText(`metric-${index}-label`, item.label, "metric-label"),
      addText(`metric-${index}-value`, item.value, "metric-value"),
    ];

    if (item.detail) {
      children.push(addText(`metric-${index}-detail`, item.detail, "metric-detail"));
    }

    return addCard(
      `metric-card-${index}`,
      addColumn(`metric-content-${index}`, children),
      "metric-card",
    );
  });

  return addCard(
    "metrics-card",
    addColumn("metrics-content", [
      addText("metrics-section-title", "Key metrics", "section-title"),
      addRow("metrics-grid", metricCards, "metric-grid"),
    ]),
  );
}

function renderChecklist(
  title: string,
  checklist: A2UIChecklistItem[],
  addText: (id: string, value: string, variant?: string) => string,
  addColumn: (id: string, children: string[], variant?: string) => string,
  addCard: (id: string, child: string, variant?: string) => string,
) {
  const cards = checklist.map((item, index) =>
    addCard(
      `step-card-${index}`,
      addColumn(`step-content-${index}`, [
        addText(`step-${index}-title`, item.title, "item-title"),
        addText(`step-${index}-detail`, item.detail),
      ]),
      "item-card",
    ),
  );

  return addCard(
    "checklist-card",
    addColumn("checklist-content", [
      addText("checklist-section-title", title, "section-title"),
      addColumn("steps-list", cards, "steps"),
    ]),
  );
}

function renderTable(
  table: A2UITable,
  addText: (id: string, value: string, variant?: string) => string,
  addColumn: (id: string, children: string[], variant?: string) => string,
  addRow: (id: string, children: string[], variant?: string) => string,
  addCard: (id: string, child: string, variant?: string) => string,
) {
  const headerRow = addRow(
    "table-header",
    table.columns.map((column, index) =>
      addText(`table-header-cell-${index}`, column, "table-header-cell"),
    ),
    "table-header-row",
  );

  const bodyRows = table.rows.map((row, rowIndex) =>
    addRow(
      `table-row-${rowIndex}`,
      row.map((cell, cellIndex) =>
        addText(`table-cell-${rowIndex}-${cellIndex}`, cell, "table-cell"),
      ),
      "table-row",
    ),
  );

  return addCard(
    "table-card",
    addColumn("table-content", [
      addText("table-section-title", table.title, "section-title"),
      addColumn("table-frame", [headerRow, ...bodyRows], "table"),
    ]),
  );
}

function renderActions(
  title: string,
  actions: A2UIAction[],
  addText: (id: string, value: string, variant?: string) => string,
  addColumn: (id: string, children: string[], variant?: string) => string,
  addCard: (id: string, child: string, variant?: string) => string,
) {
  const cards = actions.map((item, index) =>
    addCard(
      `action-card-${index}`,
      addColumn(`action-content-${index}`, [
        addText(`action-${index}-title`, item.label, "item-title"),
        addText(`action-${index}-detail`, item.description),
      ]),
      "action-row",
    ),
  );

  return addCard(
    "actions-card",
    addColumn("actions-content", [
      addText("actions-section-title", title, "section-title"),
      addColumn("actions-list", cards, "action-list"),
    ]),
  );
}

function renderSelection(
  selection: A2UISelection,
  addComponent: (
    id: string,
    role: keyof A2UICatalogRuntime["roleComponents"],
    properties: A2UIComponentProperties,
  ) => string,
  addText: (id: string, value: string, variant?: string) => string,
  addColumn: (id: string, children: string[], variant?: string) => string,
  addRow: (id: string, children: string[], variant?: string) => string,
  addCard: (id: string, child: string, variant?: string) => string,
  addButton: (
    id: string,
    child: string,
    action: NonNullable<A2UIComponentProperties["action"]>,
    primary?: boolean,
  ) => string,
  addSelect: (id: string, properties: A2UIComponentProperties) => string,
) {
  const selectId = addSelect("selection-input", {
    label: { literalString: selection.label },
    placeholder: selection.placeholder
      ? { literalString: selection.placeholder }
      : undefined,
    value: { path: "/draft/selectedOptionValue" },
    options: selection.options.map((option) => ({
      label: { literalString: option.label },
      value: option.value,
    })),
  });

  const submitButton = addButton(
    "selection-submit-button",
    addText("selection-submit-label", selection.submitLabel),
    {
      name: selection.actionName,
      context: [
        {
          key: selection.actionContextKey,
          value: { path: "/draft/selectedOptionValue" },
        },
      ],
    },
    true,
  );

  const pagingControls = renderSelectionPagination(
    selection,
    addText,
    addRow,
    addButton,
  );

  const selectionCard = addCard(
    "selection-card",
    addColumn("selection-content", [
      addText("selection-section-title", selection.title, "section-title"),
      addText("selection-body", selection.body),
      selectId,
      ...(pagingControls ? [pagingControls] : []),
      submitButton,
    ]),
  );

  const resultChildren = [
    addText(
      "selection-result-title",
      selection.resultTitle ?? "Server result",
      "section-title",
    ),
    addComponent("selection-result-body", "text", {
      text: { path: "/result/message" },
    }),
  ];

  const resultCard = addCard(
    "selection-result-card",
    addColumn("selection-result-content", resultChildren),
  );

  return addColumn("selection-stack", [selectionCard, resultCard], "selection-group");
}

function renderSelectionPagination(
  selection: A2UISelection,
  addText: (id: string, value: string, variant?: string) => string,
  addRow: (id: string, children: string[], variant?: string) => string,
  addButton: (
    id: string,
    child: string,
    action: NonNullable<A2UIComponentProperties["action"]>,
    primary?: boolean,
  ) => string,
) {
  const pagination = selection.pagination;

  if (!pagination || pagination.totalOptions <= pagination.pageSize) {
    return null;
  }

  const lastPageIndex = Math.max(
    0,
    Math.ceil(pagination.totalOptions / pagination.pageSize) - 1,
  );
  const children = [
    addText(
      "selection-pagination-status",
      formatSelectionPageStatus(
        pagination.pageIndex,
        pagination.pageSize,
        pagination.totalOptions,
      ),
      "meta",
    ),
  ];

  if (pagination.pageIndex > 0) {
    children.push(
      addButton(
        "selection-pagination-prev-button",
        addText(
          "selection-pagination-prev-label",
          pagination.previousLabel ?? "Previous page",
        ),
        {
          name: pagination.actionName,
          context: [
            {
              key: "direction",
              value: { literalString: "previous" },
            },
            {
              key: "currentPageIndex",
              value: { path: "/paging/currentPageIndex" },
            },
            {
              key: "pageSize",
              value: { path: "/paging/pageSize" },
            },
            {
              key: "serverName",
              value: { path: "/paging/serverName" },
            },
            {
              key: "catalogId",
              value: { path: "/meta/catalogId" },
            },
          ],
        },
      ),
    );
  }

  if (pagination.pageIndex < lastPageIndex) {
    children.push(
      addButton(
        "selection-pagination-next-button",
        addText(
          "selection-pagination-next-label",
          pagination.nextLabel ?? "Next page",
        ),
        {
          name: pagination.actionName,
          context: [
            {
              key: "direction",
              value: { literalString: "next" },
            },
            {
              key: "currentPageIndex",
              value: { path: "/paging/currentPageIndex" },
            },
            {
              key: "pageSize",
              value: { path: "/paging/pageSize" },
            },
            {
              key: "serverName",
              value: { path: "/paging/serverName" },
            },
            {
              key: "catalogId",
              value: { path: "/meta/catalogId" },
            },
          ],
        },
      ),
    );
  }

  return addRow("selection-pagination-row", children);
}

function renderAppendix(
  appendix: A2UIAppendix,
  addText: (id: string, value: string, variant?: string) => string,
  addColumn: (id: string, children: string[], variant?: string) => string,
  addCard: (id: string, child: string, variant?: string) => string,
) {
  return addCard(
    appendix.format === "pre" ? "code-card" : "appendix-card",
    addColumn(
      appendix.format === "pre" ? "code-content" : "appendix-content",
      [
        addText(
          appendix.format === "pre" ? "code-section-title" : "appendix-section-title",
          appendix.title,
          "section-title",
        ),
        addText(
          appendix.format === "pre" ? "appendix-code" : "appendix-body",
          appendix.body,
          appendix.format === "pre" ? "code" : undefined,
        ),
      ],
    ),
    appendix.format === "pre" ? "code-block" : "block",
  );
}

function selectSurfaceKind(viewModel: A2UIViewModel): A2UISurfaceKind {
  if (viewModel.surfaceKind) {
    return viewModel.surfaceKind;
  }

  if (viewModel.status?.tone === "warning") {
    return "ops_console";
  }

  if (viewModel.table && viewModel.actions?.length) {
    return "decision_report";
  }

  return "briefing";
}

function encodeStringMap(entries: Record<string, string>): A2UIDataEntry[] {
  return Object.entries(entries).map(([key, value]) => ({
    key,
    valueString: value,
  }));
}

function formatSelectionPageStatus(
  pageIndex: number,
  pageSize: number,
  totalOptions: number,
) {
  if (totalOptions <= 0) {
    return "No options available.";
  }

  const start = pageIndex * pageSize + 1;
  const end = Math.min(totalOptions, start + pageSize - 1);

  return `Showing ${start}-${end} of ${totalOptions}`;
}

function pruneUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}
