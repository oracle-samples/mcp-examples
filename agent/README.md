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


### Start LangGraph API server
```bash
cd agent/app
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
