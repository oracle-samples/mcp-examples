import type { MCPServerDefinition } from "@/lib/mcp/types";

export type AppConfig = {
  openai: {
    model?: string;
    baseUrl?: string;
  };
  mcp: {
    activeServers?: string[];
    servers: Record<string, MCPServerDefinition>;
  };
};
