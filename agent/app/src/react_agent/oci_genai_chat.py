"""OCI GenAI ChatModel adapter.

This implements a minimal LangChain-compatible chat model that calls
OCI Generative AI Inference `chat` using the OCI Python SDK.

Notes:
- This adapter is intentionally minimal and only supports *chat*.
- Tool calling is not implemented here. If you enable tools in the graph and
  use an OCI model, your model may ignore tools or respond unpredictably.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_core.outputs import ChatGeneration, ChatResult
from react_agent.message_utils import get_message_text


def _to_genai_message(message: BaseMessage) -> Dict[str, Any]:
    """Convert LangChain messages into OCI GenericChatRequest message dicts."""
    content = get_message_text(message)
    if isinstance(message, SystemMessage):
        role = "SYSTEM"
    elif isinstance(message, HumanMessage):
        role = "USER"
    elif isinstance(message, ToolMessage):
        # Generic chat has no explicit "tool" role. Preserve provenance in the
        # text payload rather than making tool output look like fresh user input.
        role = "USER"
        content = f"Tool result:\n{content}"
    else:
        # AIMessage and everything else
        role = "ASSISTANT"

    return {
        "role": role,
        "content": [{"type": "TEXT", "text": content}],
    }


class OCIGenAIChatModel(BaseChatModel):
    """LangChain chat model wrapper over OCI Generative AI Inference."""

    # These are regular attributes (not pydantic) in current langchain-core.
    model_id: str
    compartment_id: str
    region: str
    profile: Optional[str]
    auth_type: str
    # Optional endpoint override, useful for private endpoints.
    endpoint: Optional[str]
    # Extra request params
    temperature: Optional[float]
    max_tokens: Optional[int]
    top_p: Optional[float]

    def __init__(
        self,
        *,
        model_id: str,
        compartment_id: str,
        region: str,
        profile: Optional[str] = None,
        auth_type: str = "api_key",
        endpoint: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        top_p: Optional[float] = None,
        **kwargs: Any,
    ):
        super().__init__(**kwargs)
        self.model_id = model_id
        self.compartment_id = compartment_id
        self.region = region
        self.profile = profile
        self.auth_type = auth_type
        self.endpoint = endpoint
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.top_p = top_p

    @property
    def _llm_type(self) -> str:
        return "oci_genai"

    @property
    def _identifying_params(self) -> Dict[str, Any]:
        return {
            "model_id": self.model_id,
            "region": self.region,
            "compartment_id": self.compartment_id,
            "profile": self.profile,
            "auth_type": self.auth_type,
            "endpoint": self.endpoint,
        }

    def _generate(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> ChatResult:
        # Import lazily so that users who don't need OCI GenAI don't need the SDK.
        import oci
        from oci.generative_ai_inference import GenerativeAiInferenceClient
        from oci.generative_ai_inference.models import (
            ChatDetails,
            GenericChatRequest,
            OnDemandServingMode,
        )

        config = oci.config.from_file(profile_name=self.profile) if self.profile else oci.config.from_file()
        config["region"] = self.region

        if self.auth_type == "instance_principal":
            signer = oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
        elif self.auth_type == "resource_principal":
            signer = oci.auth.signers.get_resource_principals_signer()
        else:
            signer = None

        client_kwargs: Dict[str, Any] = {}
        if self.endpoint:
            client_kwargs["service_endpoint"] = self.endpoint

        client = (
            GenerativeAiInferenceClient(config=config, signer=signer, **client_kwargs)
            if signer
            else GenerativeAiInferenceClient(config=config, **client_kwargs)
        )

        # Build GenericChatRequest from a python dict to avoid tight coupling
        # to SDK constructor signatures.
        request: Dict[str, Any] = {
            "api_format": "GENERIC",
            "messages": [_to_genai_message(m) for m in messages],
            "compartment_id": self.compartment_id,
            # Some models use/expect these fields; safe to omit when None.
        }
        if self.temperature is not None:
            request["temperature"] = self.temperature
        if self.max_tokens is not None:
            request["max_tokens"] = self.max_tokens
        if self.top_p is not None:
            request["top_p"] = self.top_p

        # Allow per-call overrides via kwargs
        for key in ("temperature", "max_tokens", "top_p"):
            if key in kwargs and kwargs[key] is not None:
                request[key] = kwargs[key]

        chat_details = ChatDetails(
            compartment_id=self.compartment_id,
            serving_mode=OnDemandServingMode(model_id=self.model_id),
            chat_request=GenericChatRequest(**request),
        )

        resp = client.chat(chat_details)
        data = resp.data

        # GenericChatResponse typically has: data.chat_response.choices[0].message.content[0].text
        text: str = ""
        try:
            choice0 = data.chat_response.choices[0]
            # content is list[ChatContent]
            text = "".join(
                getattr(c, "text", "") or "" for c in getattr(choice0.message, "content", [])
            ).strip()
        except Exception:
            # Fallback: stringify whole response
            text = str(data)

        ai_msg = AIMessage(content=text)
        return ChatResult(generations=[ChatGeneration(message=ai_msg)])
