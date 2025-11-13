import os
from dotenv import load_dotenv

import oci

from fastmcp import Context, FastMCP
from fastmcp.server.auth.oidc_proxy import OIDCProxy
from fastmcp.server.dependencies import get_access_token
from oci.auth.signers import TokenExchangeSigner

from starlette.responses import PlainTextResponse
from starlette.requests import Request

# Load Environment variables from .env file
load_dotenv()
# Create .env file with IDCS_DOMAIN, IDCS_CLIENT_ID, IDCS_CLIENT_SECRET variables.
# IDCS_CLIENT_ID and IDCS_CLIENT_SECRET are from the IAM Domain OAuth2 client credentials.
# IDCS_DOMAIN is the domain name of the created IAM Domain.
IDCS_DOMAIN = os.getenv("IDCS_DOMAIN")
IDCS_CLIENT_ID = os.getenv("IDCS_CLIENT_ID")
IDCS_CLIENT_SECRET = os.getenv("IDCS_CLIENT_SECRET")

# Simple in-memory global cache for signers
# In production, consider using a more robust caching mechanism
_global_token_cache = {}

# Get an instance of OCI Token Exchange Signer
def get_oci_signer() -> TokenExchangeSigner:
    """Create an OCI TokenExchangeSigner using the provided token."""
    
    mcp_token = get_access_token()
    tokenID = mcp_token.claims.get("jti")
    token = mcp_token.token 
    
    cached_signer = _global_token_cache.get(tokenID)
    print(f"Global cached signer: {cached_signer}")
    if cached_signer:
        print(f"Using globally cached signer for token ID: {tokenID}")
        return cached_signer
    print(f"Creating new signer for token ID: {tokenID}")
    signer = TokenExchangeSigner(
        jwt_or_func=token,
        oci_domain_id=IDCS_DOMAIN.split(".")[0],
        client_id=IDCS_CLIENT_ID,
        client_secret=IDCS_CLIENT_SECRET,
    )
    _global_token_cache[tokenID] = signer
    print(f"Signer cached globally for token ID: {tokenID}")
    return signer

auth = OIDCProxy(
    config_url=f"https://{IDCS_DOMAIN}/.well-known/openid-configuration",
    client_id=IDCS_CLIENT_ID,
    client_secret=IDCS_CLIENT_SECRET,
    # FastMCP endpoint
    base_url="http://localhost:5000",
    # audience=IDCS_CLIENT_ID,
    required_scopes=["openid", "profile", "email"],
    # redirect_path="/custom/callback",
)

mcp = FastMCP(name="My Server", auth=auth)

@mcp.tool
async def list_regions(region: str, ctx: Context) -> str:
    """List all OCI regions available for the tenancy
    Input: region (str)
    Output: regions (str)
    """
    
    """Create OCI Object storage client using token exchange signer. 
    We will exchange IAM domain JWT token for OCI UPST token and use the UPST token to create signer object.
    """
    signer = get_oci_signer()
    iam_client = oci.identity.IdentityClient(config={'region': region}, signer=signer)

    # Get the regions from the identity client
    regions = iam_client.list_regions().data
    print(f"Regions are {regions}")
    return regions.__str__()

@mcp.tool
async def get_os_namespace(region: str, ctx: Context) -> str:
    """Get OCI Object Storage namespace for the tenancy
    Input: region (str)
    Output: namespace (str)
    """
    
    """Create OCI Object storage client using token exchange signer. 
    We will exchange IAM domain JWT token for OCI UPST token and use the UPST token to create signer object.
    """
    
    signer = get_oci_signer()
    object_storage_client = oci.object_storage.ObjectStorageClient(config={'region': region}, signer=signer)

    # Get the namespace
    namespace_response = object_storage_client.get_namespace()
    namespace_name = namespace_response.data
    return namespace_name

@mcp.tool
def whoami(ctx: Context) -> str:
    """The whoami tool is to test MCP server without requiring token exchange.
    This tool can be used to test successful authentication against OCI IAM.
    It will return logged in user's subject (username from IAM domain)."""
    
    token = get_access_token()
    user = token.claims.get("sub")
    return f"You are User: {user}"

@mcp.tool
async def get_token() -> str:
    """This tool can be used to get logged in user's IAM domain access token."""
    
    token = get_access_token()
    return token.token

@mcp.tool
async def get_access_token_claims() -> dict:
    """This tool can be used to get the authenticated user's access token claims."""
    
    token = get_access_token()
    return {
        "sub": token.claims.get("sub"),
        "uid": token.claims.get("uid"),
        "aud": token.claims.get("aud"),
        "iss": token.claims.get("iss"),
        "jti": token.claims.get("jti")
    }

if __name__ == "__main__":
    mcp.run(transport="http", port=5000)

@mcp.custom_route("/health", methods=["GET"])
async def health_check(request: Request) -> PlainTextResponse:
    return PlainTextResponse("OK")
