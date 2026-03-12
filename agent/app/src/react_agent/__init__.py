"""React Agent package.

Keep package import side effects minimal so utility modules can be imported in
tests/environments without requiring the full LangGraph runtime dependencies.
"""

__all__ = ["graph"]


def __getattr__(name: str):
    if name == "graph":
        from react_agent.graph import graph

        return graph
    raise AttributeError(name)
