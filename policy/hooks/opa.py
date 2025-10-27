import json
import sys

from opa_client.opa import OpaClient

# Initialize the OPA client
client = OpaClient(host="localhost", port=8181)

# Evaluate a policy
input_data = json.load(sys.stdin)
result = client.query_rule(input_data=input_data, package_path="mcp", rule_name="allow")
print(input_data)

print(result)

# Print the decision
if result.get("result"):
    print("Access granted.")
    sys.exit(0)
else:
    print("Access denied.")
    sys.exit(2)
