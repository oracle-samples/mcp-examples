import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSemanticRetryFeedback,
  shouldRetrySemanticViewModel,
} from "../src/lib/a2ui/semantic-guard.ts";

const toolExecution = {
  serverName: "oci_http",
  toolName: "invoke_oci_api",
  arguments: {
    client_fqn: "oci.identity.IdentityClient",
    operation: "list_regions",
  },
  resultText: "Region data",
};

test("retries grounded inventory responses that omit a table", () => {
  const shouldRetry = shouldRetrySemanticViewModel(
    "list all OCI regions",
    toolExecution,
    {
      title: "OCI Regions",
      summary: "Live OCI region inventory from Identity service.",
      status: null,
      metrics: null,
      checklistTitle: null,
      checklist: null,
      table: null,
      actionsTitle: null,
      actions: null,
      appendix: null,
    },
    "gpt-5.4",
  );

  assert.equal(shouldRetry, true);
});

test("does not retry grounded inventory responses that already include a table", () => {
  const shouldRetry = shouldRetrySemanticViewModel(
    "list all OCI regions",
    toolExecution,
    {
      title: "OCI Regions",
      summary: "Live OCI region inventory from Identity service.",
      status: null,
      metrics: null,
      checklistTitle: null,
      checklist: null,
      table: {
        title: "OCI Region Directory",
        columns: ["Region Key", "Region Name"],
        rows: [["IAD", "us-ashburn-1"]],
      },
      actionsTitle: null,
      actions: null,
      appendix: null,
    },
    "gpt-5.4",
  );

  assert.equal(shouldRetry, false);
});

test("builds retry feedback only for grounded inventory prompts", () => {
  assert.match(
    buildSemanticRetryFeedback("list all OCI regions", toolExecution) ?? "",
    /non-null table/,
  );
  assert.equal(
    buildSemanticRetryFeedback("summarize OCI regions", toolExecution),
    undefined,
  );
});
