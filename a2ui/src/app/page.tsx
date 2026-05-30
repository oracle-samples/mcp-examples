import { A2UIWorkbench } from "@/components/a2ui-workbench";

const starterPrompts = [
  "change my current region",
  "list all OCI regions",
  "Plan a production readiness review for a new MCP-backed application.",
  "Summarize an incident triage flow for an API latency spike.",
];

export default function HomePage() {
  return <A2UIWorkbench starterPrompts={starterPrompts} />;
}
