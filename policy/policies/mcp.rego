package mcp

default allow := false

allow if {
    not contains(input.tool_name, "terminate")
    every arg in input.tool_args {
        not contains(arg, "terminate")
        not contains(arg, "delete")
    }
}
