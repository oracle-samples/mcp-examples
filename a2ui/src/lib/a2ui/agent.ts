import type { AppConfig } from "@/lib/config/types";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  callMcpTool,
  listAvailableTools,
  closeMcpClient,
  createMcpClient,
} from "@/lib/mcp/client";
import type {
  MCPPlanningAttempt,
  MCPServerDefinition,
  MCPToolDefinition,
  MCPToolExecution,
  MCPToolPlan,
} from "@/lib/mcp/types";
import {
  buildSemanticRetryFeedback,
  shouldRetrySemanticViewModel,
} from "./semantic-guard";
import {
  requestA2UIViewModel,
  requestMcpToolPlan,
} from "./openai";

const DEFAULT_MAX_TOOL_CALLS = 4;
const DEFAULT_MAX_VIEW_MODEL_ATTEMPTS = 3;

type AgentGroundingContext = {
  hasActiveServers: boolean;
  availableTools: MCPToolDefinition[];
  serverInstructions: string;
  toolExecution?: MCPToolExecution;
};

export async function collectGroundedAgentContext(
  prompt: string,
  appConfig: AppConfig,
): Promise<AgentGroundingContext> {
  const serverDefinitions = resolveActiveServers(appConfig);

  if (serverDefinitions.length === 0) {
    return {
      hasActiveServers: false,
      availableTools: [],
      serverInstructions: "",
      toolExecution: undefined,
    };
  }

  const { sessions, availabilityNotes } = await openServerSessions(serverDefinitions);

  try {
    const discovery = await discoverTools(sessions, availabilityNotes);
    const planningAttempts: MCPPlanningAttempt[] = [];
    let toolExecution: MCPToolExecution | undefined;
    const serverInstructions = discovery.instructions.join("\n\n");

    for (let attempt = 0; attempt < DEFAULT_MAX_TOOL_CALLS; attempt += 1) {
      const plan = await requestMcpToolPlan(
        prompt,
        discovery.tools,
        {
          serverInstructions,
          previousAttempts: planningAttempts,
          maxToolCalls: DEFAULT_MAX_TOOL_CALLS,
        },
        appConfig,
      );

      if (!shouldUseTool(plan, discovery.tools)) {
        break;
      }

      try {
        toolExecution = await executePlannedTool(plan, sessions);
        planningAttempts.push({
          plan,
          outcome: "succeeded",
          resultPreview: summarizeToolResult(toolExecution.resultText),
        });
      } catch (error) {
        planningAttempts.push({
          plan,
          outcome: "failed",
          errorMessage:
            error instanceof Error ? error.message : "Unknown MCP tool failure.",
        });
      }
    }

    return {
      hasActiveServers: true,
      availableTools: discovery.tools,
      serverInstructions,
      toolExecution,
    };
  } finally {
    await Promise.all(
      sessions.map((session) => closeMcpClient(session.client, session.transport)),
    );
  }
}

export async function generateAgentA2UIViewModel(
  prompt: string,
  appConfig: AppConfig,
) {
  const groundedContext = await collectGroundedAgentContext(prompt, appConfig);

  if (!groundedContext.hasActiveServers) {
    const result = await requestA2UIViewModel(prompt, undefined, appConfig);
    return {
      ...result,
      toolExecution: undefined,
    };
  }

  const retryFeedback = buildSemanticRetryFeedback(
    prompt,
    groundedContext.toolExecution,
  );
  let lastResult:
    | Awaited<ReturnType<typeof requestA2UIViewModel>>
    | undefined;

  for (
    let attempt = 0;
    attempt < DEFAULT_MAX_VIEW_MODEL_ATTEMPTS;
    attempt += 1
  ) {
    const result = await requestA2UIViewModel(
      prompt,
      {
        serverInstructions:
          attempt > 0 && retryFeedback
            ? [groundedContext.serverInstructions, retryFeedback]
                .filter(Boolean)
                .join("\n\n")
            : groundedContext.serverInstructions,
        toolExecution: groundedContext.toolExecution,
        availableTools: groundedContext.availableTools,
      },
      appConfig,
    );

    lastResult = result;

    if (
      !shouldRetrySemanticViewModel(
        prompt,
        groundedContext.toolExecution,
        result.data,
        result.model,
      )
    ) {
      break;
    }
  }

  if (!lastResult) {
    throw new Error("The server could not produce a semantic view model.");
  }

  return {
    ...lastResult,
    toolExecution: groundedContext.toolExecution,
  };
}

async function executePlannedTool(
  plan: MCPToolPlan,
  sessions: ServerSession[],
): Promise<MCPToolExecution> {
  const targetSession = sessions.find(
    (session) => session.definition.name === plan.serverName,
  );

  if (!targetSession || !plan.toolName) {
    throw new Error(
      `Planned MCP server "${plan.serverName}" is not configured.`,
    );
  }

  const resultText = await callMcpTool(
    targetSession.client,
    plan.toolName,
    plan.arguments ?? {},
  );

  return {
    serverName: targetSession.definition.name,
    toolName: plan.toolName,
    arguments: plan.arguments ?? {},
    resultText,
  };
}

function shouldUseTool(
  plan: MCPToolPlan,
  availableTools: MCPToolDefinition[],
): boolean {
  if (!plan.useMcp || !plan.serverName || !plan.toolName) {
    return false;
  }

  return availableTools.some(
    (tool) => tool.serverName === plan.serverName && tool.name === plan.toolName,
  );
}

type ServerSession = {
  definition: MCPServerDefinition;
  client: Client;
  transport: Awaited<ReturnType<typeof createMcpClient>>["transport"];
};

type OpenServerSessionsResult = {
  sessions: ServerSession[];
  availabilityNotes: string[];
};

async function discoverTools(
  sessions: ServerSession[],
  availabilityNotes: string[] = [],
) {
  const tools: MCPToolDefinition[] = [];
  const instructions: string[] = [...availabilityNotes];

  for (const session of sessions) {
    try {
      const result = {
        instructions: session.client.getInstructions(),
        tools: await listAvailableTools(
          session.client,
          session.definition.name,
          session.definition.toolAllowlist,
        ),
      };

      if (result.instructions) {
        instructions.push(`${session.definition.name}: ${result.instructions}`);
      }

      tools.push(...result.tools);
    } catch (error) {
      instructions.push(
        `${session.definition.name}: unavailable (${
          error instanceof Error ? error.message : "unknown error"
        })`,
      );
    }
  }

  return { tools, instructions };
}

async function openServerSessions(
  serverDefinitions: AppConfig["mcp"]["servers"][string][],
): Promise<OpenServerSessionsResult> {
  const results = await Promise.all(
    serverDefinitions.map(async (definition) => {
      try {
        return {
          kind: "connected" as const,
          session: {
            definition,
            ...(await createMcpClient(definition)),
          },
        };
      } catch (error) {
        return {
          kind: "failed" as const,
          definition,
          message:
            error instanceof Error ? error.message : "unknown connection error",
        };
      }
    }),
  );

  return {
    sessions: results.flatMap((result) =>
      result.kind === "connected" ? [result.session] : [],
    ),
    availabilityNotes: results.flatMap((result) =>
      result.kind === "failed"
        ? [`${result.definition.name}: unavailable (${result.message})`]
        : [],
    ),
  };
}

function resolveActiveServers(appConfig: AppConfig) {
  const configuredServers = appConfig.mcp.servers;
  const activeServerNames = appConfig.mcp.activeServers;

  if (!activeServerNames?.length) {
    return Object.values(configuredServers);
  }

  return activeServerNames
    .map((serverName) => configuredServers[serverName])
    .filter(Boolean);
}

function summarizeToolResult(resultText: string) {
  const compact = resultText.replace(/\s+/g, " ").trim();
  return compact.length > 1200
    ? `${compact.slice(0, 1197)}...`
    : compact;
}
