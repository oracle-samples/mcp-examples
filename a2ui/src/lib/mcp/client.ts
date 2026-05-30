import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { MCPServerDefinition, MCPToolDefinition } from "./types";

const CLIENT_INFO = {
  name: "a2ui-agent",
  version: "0.1.0",
};
const DEFAULT_MCP_TIMEOUT_MS = 15_000;

export async function withMcpClient<T>(
  definition: MCPServerDefinition,
  operation: (client: Client) => Promise<T>,
): Promise<T> {
  const { client, transport } = await createMcpClient(definition);

  try {
    return await operation(client);
  } finally {
    await closeMcpClient(client, transport);
  }
}

export async function createMcpClient(definition: MCPServerDefinition) {
  const client = new Client(CLIENT_INFO);
  const transport = createTransport(definition);

  await runWithTimeout(
    `connect to MCP server "${definition.name}"`,
    () => client.connect(transport),
    {
      onTimeout: async () => {
        await closeMcpClient(client, transport);
      },
    },
  );

  return { client, transport };
}

export async function closeMcpClient(
  client: Client,
  transport: ReturnType<typeof createTransport>,
) {
  if (transport instanceof StreamableHTTPClientTransport) {
    await transport.terminateSession().catch(() => undefined);
  }
  await client.close().catch(() => undefined);
}

export async function listAvailableTools(
  client: Client,
  serverName: string,
  toolAllowlist?: string[],
): Promise<MCPToolDefinition[]> {
  const tools: MCPToolDefinition[] = [];
  let cursor: string | undefined;

  do {
    const result = await runWithTimeout(
      `list tools from MCP server "${serverName}"`,
      (signal) => client.listTools({ cursor }, { signal }),
    );
    tools.push(
      ...result.tools
        .filter((tool) =>
          toolAllowlist?.length ? toolAllowlist.includes(tool.name) : true,
        )
        .map((tool) => ({
          serverName,
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
    );
    cursor = result.nextCursor;
  } while (cursor);

  return tools;
}

export async function callMcpTool(
  client: Client,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const result = await runWithTimeout(`call MCP tool "${toolName}"`, (signal) =>
    client.callTool(
      {
        name: toolName,
        arguments: args,
      },
      undefined,
      { signal },
    ),
  );

  return normalizeToolResult(result);
}

function createTransport(definition: MCPServerDefinition) {
  if (definition.transport === "stdio") {
    return new StdioClientTransport({
      command: definition.command!,
      args: definition.args,
      cwd: definition.cwd,
      env: definition.env,
      stderr: "inherit",
    });
  }

  return new StreamableHTTPClientTransport(new URL(definition.url!), {
    requestInit: definition.headers
      ? {
          headers: definition.headers,
        }
      : undefined,
  });
}

function normalizeToolResult(result: unknown): string {
  if (!isRecord(result)) {
    return safeJson(result);
  }

  if ("structuredContent" in result && result.structuredContent !== undefined) {
    return safeJson(result.structuredContent);
  }

  if (Array.isArray(result.content) && result.content.length > 0) {
    const parts = result.content.map((item) => {
      if (isRecord(item) && typeof item.text === "string") {
        return item.text;
      }
      return safeJson(item);
    });
    return parts.join("\n");
  }

  if ("toolResult" in result && result.toolResult !== undefined) {
    return safeJson(result.toolResult);
  }

  return safeJson(result);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function runWithTimeout<T>(
  label: string,
  operation: (signal: AbortSignal) => Promise<T>,
  options?: {
    onTimeout?: () => Promise<void> | void;
  },
): Promise<T> {
  const timeoutMs = resolveTimeoutMs(
    process.env.A2UI_MCP_TIMEOUT_MS,
    DEFAULT_MCP_TIMEOUT_MS,
  );
  const controller = new AbortController();

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let didTimeout = false;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          didTimeout = true;
          controller.abort(new Error(`${label} timed out after ${timeoutMs}ms.`));
          reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (didTimeout) {
      await options?.onTimeout?.();
    }
  }
}

function resolveTimeoutMs(rawValue: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(rawValue ?? "", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
