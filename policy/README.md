# Policy

Demonstration of out-of-band policy enforcement for MCP servers/tools

## Getting started

### Install dependencies
```bash
brew install ollama python3 uv go opa podman podman-compose
```

### Create container VM for running containers via podman
```bash
podman machine init
podman machine start
```

### Build policies
```
make build
```

### Install Ollama and fetch model

Where `$MODEL` is the name of the model you prefer (ex: `gpt-oss`)

```bash
ollama pull $MODEL
```

### Install mcphost
```bash
go install github.com/mark3labs/mcphost@latest
export PATH=$PATH:~/.go/bin
```

### Authenticate

```bash
oci session authenticate --profile-name <profile name, ex: DEFAULT> --region <region name: us-sanjose-1>
```

### Start external policy engine (Open Policy Agent)
```bash
podman compose up -d
```

### Run mcphost

Where `$MODEL` is the name of the model you prefer (ex: `gpt-oss`)

```bash
OCI_CONFIG_PROFILE=<profile name, ex: DEFAULT> mcphost -m ollama:$MODEL --config ./mcp.json
```

You can now interact with the servers via the mcphost prompt:

```
what tools are available to you?
```
or
```
list my instances
```

## Testing

```bash
make test
```
