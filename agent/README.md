# Agent

An example agent and tool developed using LangGraph and the OCI Python SDK.

## Getting started

### Start Ollama and pull model
```bash
brew services start ollama
ollama pull gpt-oss
```

### Install MCP servers

### Authenticate
```bash
oci session authenticate --profile-name <profile name> --region <region name: us-sanjose-1>
```

### Setup project
```bash
cd agent/app
uv venv -p 3.13
source .venv/bin/activate
uv pip install -e .
```


### Start LangGraph API server
```bash
uv run langgraph dev --no-browser --allow-blocking
```

### Interact with the server using the client or API endpoint
Client:
```bash
cd ..
uv run client.py
```

cURL payload.json:
```json
{
  "assistant_id": "agent",
  "input": {
    "messages": [
      {
        "role": "human",
        "content": "What is LangGraph?"
      }
    ]
  },
  "context": {
    "model": "ollama:gpt-oss",
    "base_url": "http://localhost:11434"
  },
  "stream_mode": "messages-tuple"
}
```

```bash
curl -s --request POST \
    --url "http://localhost:2024/runs/stream" \
    --header 'Content-Type: application/json' \
    --data @payload.json
```

## Using OCI GenAI hosted models

This agent can also use models hosted by the **OCI Generative AI** service.

### Prerequisites

- OCI CLI configured (or instance/resource principal auth available)
- Access to OCI Generative AI service + a model you can call
- Set your compartment OCID and region

### Example request payload

Provide the model as `oci_genai:<model_ocid>` and pass required OCI parameters in `model_args`.
Tool-calling is disabled in this mode (the agent will still run, but won’t attempt tool calls).

```json
{
  "assistant_id": "agent",
  "input": {
    "messages": [
      {
        "role": "human",
        "content": "Summarize what LangGraph is in 2 sentences."
      }
    ]
  },
  "context": {
    "model": "oci_genai:ocid1.generativeaimodel.oc1..exampleuniqueID",
    "enable_tools": false,
    "model_args": {
      "compartment_id": "ocid1.compartment.oc1..exampleuniqueID",
      "region": "us-chicago-1",
      "profile": "DEFAULT",
      "auth_type": "api_key",
      "temperature": 0.2,
      "max_tokens": 512
    }
  },
  "stream_mode": "messages-tuple"
}
```

`auth_type` can be one of:
- `api_key` (default; uses your OCI config file)
- `instance_principal`
- `resource_principal`

## License
Copyright (c) 2025 Oracle and/or its affiliates.
 
Released under the Universal Permissive License v1.0 as shown at  
<https://oss.oracle.com/licenses/upl/>.

## Third-Party APIs

Developers choosing to distribute a binary implementation of this project are responsible for obtaining and providing all required licenses and copyright notices for the third-party code used in order to ensure compliance with their respective open source licenses.

## Disclaimer

Users are responsible for their local environment and credential safety. Different language model selections
may yield different results and performance.

All actions are performed with the permissions of the configured OCI CLI profile. We advise least-privilege
IAM setup, secure credential management, safe network practices, secure logging, and warn against exposing secrets.
