export type MCPTransportKind = "stdio" | "http";

export type MCPServerDefinition = {
  name: string;
  transport: MCPTransportKind;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  toolAllowlist?: string[];
};

export type MCPToolDefinition = {
  serverName: string;
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

export type MCPToolExecution = {
  serverName: string;
  toolName: string;
  arguments: Record<string, unknown>;
  resultText: string;
};

export type MCPToolPlan = {
  useMcp: boolean;
  rationale: string;
  serverName?: string;
  toolName?: string;
  arguments?: Record<string, unknown>;
};

export type MCPPlanningAttempt = {
  plan: MCPToolPlan;
  outcome: "succeeded" | "failed";
  resultPreview?: string;
  errorMessage?: string;
};
