package mcp

test_tool_allowed if {
    allow with input as {"tool_name": "safe", "tool_args": []}

    allow with input as {
        "tool_name": "oci",
        "tool_args": ["compute", "instance", "create"]
    }
}

test_tool_denied if {
    not allow with input as {"tool_name": "terminate", "tool_args": []}
    not allow with input as {"tool_name": "terminate_instance", "tool_args": []}
    not allow with input as {"tool_name": "terminate something", "tool_args": []}
    not allow with input as {"tool_name": "instance_terminate", "tool_args": []}

    not allow with input as {"tool_name": "oci", "tool_args": ["compute", "instance", "terminate"]}
    not allow with input as {"tool_name": "oci", "tool_args": ["compute", "terminate_instance"]}
    not allow with input as {"tool_name": "oci", "tool_args": ["delete"]}
}
