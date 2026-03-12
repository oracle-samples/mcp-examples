"""Utility & helper functions."""

from typing import Any, Dict, Tuple

from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel

from react_agent.message_utils import get_message_text
from react_agent.oci_genai_chat import OCIGenAIChatModel


def parse_model_spec(fully_specified_name: str) -> Tuple[str, str]:
    """Split a model reference into provider and model name."""
    if ":" not in fully_specified_name:
        raise ValueError("Model must be in the format 'provider:model-name'")

    return fully_specified_name.split(":", maxsplit=1)


def model_supports_tools(fully_specified_name: str) -> bool:
    """Return whether the configured model path supports this agent's tool loop."""
    provider, _ = parse_model_spec(fully_specified_name)
    return provider not in {"oci", "oci_genai", "oci-genai"}


def validate_model_capabilities(fully_specified_name: str, enable_tools: bool) -> None:
    """Fail early when the requested model and graph mode are incompatible."""
    if enable_tools and not model_supports_tools(fully_specified_name):
        raise ValueError(
            "OCI GenAI chat models do not support this agent's tool-calling loop. "
            "Set context.enable_tools=false or use a model provider with tool support."
        )


def load_chat_model(
    fully_specified_name: str, model_args: Dict[str, Any], base_url: str
) -> BaseChatModel:
    """Load a chat model from a fully specified name.

    Supported formats:
    - "provider:model" -> delegates to `langchain.chat_models.init_chat_model`
      Examples:
        - "ollama:gpt-oss"
        - "openai:gpt-4o-mini"
        - "anthropic:claude-3-5-sonnet-20240620"

    - "oci_genai:model-id" -> uses OCI Generative AI Inference via the OCI Python SDK.
      Required model_args keys for OCI:
        - compartment_id
        - region
      Optional:
        - profile (OCI config profile name)
        - auth_type: api_key | instance_principal | resource_principal
        - endpoint (override service endpoint)
        - temperature, max_tokens, top_p
    """

    provider, model = parse_model_spec(fully_specified_name)

    if provider in {"oci", "oci_genai", "oci-genai"}:
        # Note: base_url is unused for OCI.
        compartment_id = model_args.get("compartment_id")
        region = model_args.get("region")
        if not compartment_id or not region:
            raise ValueError(
                "OCI GenAI requires model_args.compartment_id and model_args.region"
            )

        return OCIGenAIChatModel(
            model_id=model,
            compartment_id=compartment_id,
            region=region,
            profile=model_args.get("profile"),
            auth_type=model_args.get("auth_type", "api_key"),
            endpoint=model_args.get("endpoint"),
            temperature=model_args.get("temperature"),
            max_tokens=model_args.get("max_tokens"),
            top_p=model_args.get("top_p"),
        )

    return init_chat_model(model, model_provider=provider, base_url=base_url, **model_args)
