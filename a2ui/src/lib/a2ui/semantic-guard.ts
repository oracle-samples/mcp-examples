import { normalizeA2UIViewModel } from "./normalize.ts";
import type { MCPToolExecution } from "@/lib/mcp/types";

export function shouldRetrySemanticViewModel(
  prompt: string,
  toolExecution: MCPToolExecution | undefined,
  value: unknown,
  model: string,
) {
  if (!toolExecution || !isInventoryLikePrompt(prompt)) {
    return false;
  }

  const normalized = normalizeA2UIViewModel(value, "openai", model);
  return !normalized.table ||
    normalized.table.columns.length === 0 ||
    normalized.table.rows.length === 0;
}

export function buildSemanticRetryFeedback(
  prompt: string,
  toolExecution: MCPToolExecution | undefined,
) {
  if (!toolExecution || !isInventoryLikePrompt(prompt)) {
    return undefined;
  }

  return [
    "The previous semantic response was incomplete for this grounded live inventory request.",
    "Return a non-null table populated from the live MCP result.",
    "Keep the table as the primary representation of the repeated records.",
    "Use summary, status, metrics, actions, and appendix only as supporting context around the table.",
  ].join("\n");
}

function isInventoryLikePrompt(prompt: string) {
  const normalized = prompt.trim().toLowerCase();

  return /\b(list|show|enumerate|catalog|inventory|lookup|display)\b/.test(
    normalized,
  );
}
