import type { A2UIViewModel } from "./types.ts";

export function buildGroundedFailureViewModel(
  prompt: string,
  error: unknown,
): A2UIViewModel {
  const failureReason =
    error instanceof Error ? error.message : "Unknown grounded-content failure.";

  return {
    surfaceKind: "ops_console",
    title: "Grounded Content Unavailable",
    summary: `The request "${prompt}" requires grounded MCP-backed content, but the server could not complete the live retrieval path.`,
    status: {
      tone: "warning",
      title: "Live MCP request failed",
      body: "The app did not fall back to a model-only answer for this grounded request. Check the MCP sidecar, OCI credentials, and upstream connectivity, then retry.",
    },
    actionsTitle: "Operator checks",
    actions: [
      {
        label: "Check the MCP sidecar",
        description: "Confirm the oci-mcp service is healthy and reachable from the app container.",
      },
      {
        label: "Verify OCI configuration",
        description: "Inspect the mounted OCI config, key, and token paths used by the MCP server.",
      },
    ],
    appendix: {
      title: "Failure detail",
      format: "pre",
      body: failureReason,
    },
    meta: {
      source: "server",
      model: "grounded-failure",
      generatedAt: new Date().toISOString(),
      fallbackReason: failureReason,
    },
  };
}
