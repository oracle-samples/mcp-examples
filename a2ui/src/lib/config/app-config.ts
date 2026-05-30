import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "smol-toml";
import type { AppConfig } from "./types";
import type { MCPServerDefinition, MCPTransportKind } from "@/lib/mcp/types";

export const APP_CONFIG_PATH = path.join(
  process.cwd(),
  "config",
  "app-config.toml",
);

const emptyConfig: AppConfig = {
  openai: {},
  mcp: {
    servers: {},
  },
};

export async function loadAppConfig(): Promise<AppConfig> {
  try {
    const raw = await readFile(APP_CONFIG_PATH, "utf-8");
    return parseAppConfigToml(raw);
  } catch (error) {
    if (isMissingFile(error)) {
      return emptyConfig;
    }
    if (isDirectory(error)) {
      throw new Error(
        `Expected ${APP_CONFIG_PATH} to be a TOML file, but found a directory. Replace it with a file, for example by copying config/app-config.template.toml.`,
      );
    }
    throw error;
  }
}

export function parseAppConfigToml(rawToml: string): AppConfig {
  return normalizeAppConfig(parse(rawToml));
}

function normalizeAppConfig(value: unknown): AppConfig {
  const record = isRecord(value) ? value : {};
  const openai = isRecord(record.openai) ? record.openai : {};
  const mcp = isRecord(record.mcp) ? record.mcp : {};
  const serversRecord = isRecord(mcp.servers) ? mcp.servers : {};

  const servers = Object.fromEntries(
    Object.entries(serversRecord).map(([serverName, serverValue]) => [
      serverName,
      normalizeServerDefinition(serverName, serverValue),
    ]),
  );

  return {
    openai: {
      model: asOptionalString(openai.model),
      baseUrl: asOptionalString(openai.base_url),
    },
    mcp: {
      activeServers: asOptionalStringArray(mcp.active_servers),
      servers,
    },
  };
}

function normalizeServerDefinition(
  name: string,
  value: unknown,
): MCPServerDefinition {
  const record = isRecord(value) ? value : {};
  const transport =
    record.transport === "http" || record.transport === "stdio"
      ? (record.transport as MCPTransportKind)
      : null;

  if (!transport) {
    throw new Error(
      `MCP server "${name}" must set transport to "stdio" or "http".`,
    );
  }

  const definition: MCPServerDefinition = {
    name,
    transport,
    command: asOptionalString(record.command),
    args: asOptionalStringArray(record.args),
    cwd: asOptionalString(record.cwd),
    env: asOptionalStringRecord(record.env),
    url: asOptionalString(record.url),
    headers: asOptionalStringRecord(record.headers),
    toolAllowlist: asOptionalStringArray(record.tool_allowlist),
  };

  if (definition.transport === "stdio" && !definition.command) {
    throw new Error(`MCP server "${name}" uses stdio but has no command.`);
  }

  if (definition.transport === "http" && !definition.url) {
    throw new Error(`MCP server "${name}" uses http but has no url.`);
  }

  return definition;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.filter((item): item is string => typeof item === "string");
  return items.length ? items : undefined;
}

function asOptionalStringRecord(
  value: unknown,
): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );

  return entries.length ? Object.fromEntries(entries) : undefined;
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function isDirectory(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "EISDIR"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
