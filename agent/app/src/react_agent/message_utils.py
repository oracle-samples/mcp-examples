"""Helpers for working with LangChain message content."""

from __future__ import annotations

from typing import Any

from langchain_core.messages import BaseMessage


def get_message_text(msg: BaseMessage) -> str:
    """Extract readable text from common LangChain message payload shapes."""
    return content_to_text(msg.content)


def content_to_text(content: Any) -> str:
    """Flatten common message content block shapes into plain text."""
    if isinstance(content, str):
        return content
    if isinstance(content, dict):
        return content.get("text", "")

    parts: list[str] = []
    for item in content:
        if isinstance(item, str):
            parts.append(item)
            continue
        if isinstance(item, dict):
            text = item.get("text")
            if text:
                parts.append(text)
    return "".join(parts).strip()
