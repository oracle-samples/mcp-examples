from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage

from react_agent.oci_genai_chat import _to_genai_message
from react_agent.utils import load_chat_model, validate_model_capabilities


def test_load_chat_model_oci_genai_requires_region_and_compartment_id():
    try:
        load_chat_model(
            "oci_genai:ocid1.generativeaimodel.oc1..example",
            model_args={},
            base_url="",
        )
        assert False, "Expected ValueError"
    except ValueError as e:
        assert "compartment_id" in str(e)
        assert "region" in str(e)


def test_to_genai_message_maps_roles_and_content():
    system = _to_genai_message(SystemMessage(content="sys"))
    human = _to_genai_message(HumanMessage(content="hi"))
    tool = _to_genai_message(ToolMessage(content="tool output", tool_call_id="tc_1"))

    assert system["role"] == "SYSTEM"
    assert human["role"] == "USER"
    assert tool["role"] == "USER"
    assert system["content"][0]["text"] == "sys"
    assert tool["content"][0]["text"] == "Tool result:\ntool output"


def test_to_genai_message_flattens_structured_content():
    human = _to_genai_message(
        HumanMessage(
            content=[
                {"type": "text", "text": "hello "},
                {"type": "image_url", "image_url": "ignored"},
                {"type": "text", "text": "world"},
            ]
        )
    )

    assert human["content"][0]["text"] == "hello world"


def test_load_chat_model_rejects_non_colon_model_spec():
    try:
        load_chat_model(
            "anthropic/claude-3-5-sonnet-20240620",
            model_args={},
            base_url="",
        )
        assert False, "Expected ValueError"
    except ValueError as e:
        assert "provider:model-name" in str(e)


def test_validate_model_capabilities_rejects_tools_for_oci():
    try:
        validate_model_capabilities(
            "oci_genai:ocid1.generativeaimodel.oc1..example",
            enable_tools=True,
        )
        assert False, "Expected ValueError"
    except ValueError as e:
        assert "enable_tools=false" in str(e)


def test_validate_model_capabilities_allows_tools_for_non_oci():
    validate_model_capabilities(
        "anthropic:claude-3-5-sonnet-20240620",
        enable_tools=True,
    )
