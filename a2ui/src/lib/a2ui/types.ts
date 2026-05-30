export type CalloutTone = "info" | "warning" | "success";

export type A2UIMetric = {
  label: string;
  value: string;
  detail?: string;
};

export type A2UIChecklistItem = {
  title: string;
  detail: string;
};

export type A2UITable = {
  title: string;
  columns: string[];
  rows: string[][];
};

export type A2UIAction = {
  label: string;
  description: string;
};

export type A2UISelectionOption = {
  label: string;
  value: string;
  detail?: string;
};

export type A2UISelectionPagination = {
  pageIndex: number;
  pageSize: number;
  totalOptions: number;
  actionName: string;
  previousLabel?: string;
  nextLabel?: string;
  serverName?: string;
};

export type A2UISelection = {
  title: string;
  body: string;
  label: string;
  placeholder?: string;
  options: A2UISelectionOption[];
  submitLabel: string;
  actionName: string;
  actionEndpoint: string;
  actionContextKey: string;
  resultTitle?: string;
  resultMessage?: string;
  pagination?: A2UISelectionPagination;
};

export type A2UIAppendix = {
  title: string;
  body: string;
  format: "text" | "pre";
};

export type A2UISurfaceKind =
  | "briefing"
  | "ops_console"
  | "decision_report";

export type A2UIViewModel = {
  surfaceKind?: A2UISurfaceKind;
  title: string;
  summary: string;
  status?: {
    tone: CalloutTone;
    title: string;
    body: string;
  };
  metrics?: A2UIMetric[];
  checklistTitle?: string;
  checklist?: A2UIChecklistItem[];
  table?: A2UITable;
  selection?: A2UISelection;
  actionsTitle?: string;
  actions?: A2UIAction[];
  appendix?: A2UIAppendix;
  meta: {
    source: "mock" | "openai" | "server";
    model: string;
    generatedAt: string;
    fallbackReason?: string;
  };
};
