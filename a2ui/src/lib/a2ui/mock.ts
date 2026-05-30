import type { A2UIViewModel } from "./types.ts";

export function buildMockViewModel(prompt: string): A2UIViewModel {
  const normalized = prompt.toLowerCase();

  if (
    normalized.includes("incident") ||
    normalized.includes("outage") ||
    normalized.includes("latency")
  ) {
    return incidentViewModel(prompt);
  }

  if (
    normalized.includes("cost") ||
    normalized.includes("budget") ||
    normalized.includes("spend")
  ) {
    return costViewModel(prompt);
  }

  return readinessViewModel(prompt);
}

function readinessViewModel(prompt: string): A2UIViewModel {
  return {
    surfaceKind: "decision_report",
    title: "Production Readiness Review",
    summary: `The prompt "${prompt}" maps to a launch-readiness briefing with key indicators, a concrete checklist, and the decisions that still need owners before release.`,
    status: {
      tone: "info",
      title: "Primary framing",
      body: "Treat the UI contract as server-owned. The model can help fill content, but template selection and protocol output stay in the agent layer.",
    },
    metrics: [
      {
        label: "Critical paths",
        value: "3",
        detail: "Auth, model invocation, and observability pipelines need explicit fallback behavior.",
      },
      {
        label: "Blocking risks",
        value: "2",
        detail: "Unbounded model output and missing rate limits remain the highest-impact gaps.",
      },
      {
        label: "Launch horizon",
        value: "10 days",
        detail: "Assumes operators can close instrumentation and incident runbook gaps this week.",
      },
    ],
    checklistTitle: "Execution plan",
    checklist: [
      {
        title: "Lock the response contract",
        detail: "Version the A2UI surface and reject responses that fail normalization.",
      },
      {
        title: "Instrument the server route",
        detail: "Capture latency, token usage, model errors, and fallback rate by request class.",
      },
      {
        title: "Separate UI from orchestration",
        detail: "Keep React components unaware of model-provider details so the transport can evolve safely.",
      },
    ],
    table: {
      title: "Review focus",
      columns: ["Area", "What matters", "Exit condition"],
      rows: [
        [
          "Interface contract",
          "Template ownership, message validation, downgrade path",
          "The server can evolve the UI without trusting raw model layout output",
        ],
        [
          "Observability",
          "Latency, errors, fallback rate, MCP call tracing",
          "Operators can explain and triage degraded responses quickly",
        ],
        [
          "Release safety",
          "Rollback flow, staged rollout, config changes",
          "The app can ship without locking itself to one model behavior",
        ],
      ],
    },
    actionsTitle: "Recommended next moves",
    actions: [
      {
        label: "Add schema versioning",
        description: "Version the semantic view model and A2UI surface separately.",
      },
      {
        label: "Define operator alerts",
        description: "Page on repeated normalization failures and severe latency regressions.",
      },
    ],
    appendix: {
      title: "Suggested server boundary",
      format: "pre",
      body: `type SemanticViewModel = {\n  title: string\n  summary: string\n  status?: { tone: "info" | "warning" | "success"; title: string; body: string }\n  metrics?: Array<{ label: string; value: string; detail?: string }>\n  checklist?: Array<{ title: string; detail: string }>\n  table?: { title: string; columns: string[]; rows: string[][] }\n  actions?: Array<{ label: string; description: string }>\n}`,
    },
    meta: {
      source: "mock",
      model: "mock-a2ui-planner",
      generatedAt: new Date().toISOString(),
    },
  };
}

function incidentViewModel(prompt: string): A2UIViewModel {
  return {
    surfaceKind: "ops_console",
    title: "Incident Triage Console",
    summary: `The prompt "${prompt}" is best represented as an operator console: current posture, first-pass checks, and immediate containment steps.`,
    status: {
      tone: "warning",
      title: "Operator note",
      body: "Bias the first response toward containment and signal quality. Root cause exploration should follow once customer impact is stable.",
    },
    metrics: [
      {
        label: "Impact",
        value: "SEV-2",
        detail: "Customer workflows are degraded but not fully unavailable.",
      },
      {
        label: "Error budget burn",
        value: "4.7x",
        detail: "The current request latency profile is consuming the weekly budget rapidly.",
      },
      {
        label: "Timebox",
        value: "15 min",
        detail: "Containment actions should complete inside the next operational checkpoint.",
      },
    ],
    table: {
      title: "First-pass checks",
      columns: ["Check", "Owner", "Reason"],
      rows: [
        ["Upstream dependency health", "Platform", "Validate the issue is not inherited from a provider outage."],
        ["Recent deploy delta", "Application", "Correlate symptoms with the last known config or release change."],
        ["Rate-limit posture", "API", "Prevent cascading retries from amplifying the event."],
      ],
    },
    checklistTitle: "Immediate flow",
    checklist: [
      {
        title: "Confirm external symptoms",
        detail: "Use golden path checks to measure real user impact before changing capacity or traffic policy.",
      },
      {
        title: "Stabilize throughput",
        detail: "Shed non-critical load and disable expensive background work while service recovers.",
      },
      {
        title: "Escalate with a crisp state update",
        detail: "Communicate impact, suspected blast radius, and the next operator checkpoint.",
      },
    ],
    actionsTitle: "Escalations",
    actions: [
      {
        label: "Page platform owner",
        description: "Bring in the team that can validate upstream degradation or quota exhaustion.",
      },
      {
        label: "Prepare rollback",
        description: "Have the last known good deployment and config diff ready before the next checkpoint.",
      },
    ],
    meta: {
      source: "mock",
      model: "mock-a2ui-incident",
      generatedAt: new Date().toISOString(),
    },
  };
}

function costViewModel(prompt: string): A2UIViewModel {
  return {
    surfaceKind: "briefing",
    title: "Cost Review Dashboard",
    summary: `The prompt "${prompt}" should surface spend concentration, likely waste, and the smallest set of actions that can change next month's bill.`,
    status: {
      tone: "success",
      title: "Optimization posture",
      body: "Start with high-confidence waste before moving into architecture changes. The goal is to create visible savings without destabilizing delivery.",
    },
    metrics: [
      {
        label: "Monthly spend",
        value: "$184k",
        detail: "Compute and storage remain the main cost centers.",
      },
      {
        label: "Idle capacity",
        value: "19%",
        detail: "Non-production clusters and oversized batch nodes drive most waste.",
      },
      {
        label: "Potential savings",
        value: "$27k",
        detail: "Reachable within one billing cycle through rightsizing and schedule controls.",
      },
    ],
    actionsTitle: "High-confidence actions",
    actions: [
      {
        label: "Schedule lower environments",
        description: "Power down dev and staging outside business hours unless a release window is active.",
      },
      {
        label: "Rightsize bursty services",
        description: "Move low-utilization services onto smaller baseline instances and monitor p95 latency.",
      },
      {
        label: "Archive stale storage",
        description: "Shift infrequently accessed snapshots into lower-cost archival tiers.",
      },
    ],
    meta: {
      source: "mock",
      model: "mock-a2ui-cost",
      generatedAt: new Date().toISOString(),
    },
  };
}
