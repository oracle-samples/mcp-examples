import os
from dotenv import load_dotenv
from typing import Annotated

import oci

from fastmcp import Context, FastMCP
from fastmcp.server.auth.oidc_proxy import OIDCProxy
from fastmcp.server.dependencies import get_access_token
from oci.auth.signers import TokenExchangeSigner

from starlette.responses import PlainTextResponse
from starlette.requests import Request

load_dotenv()

IDCS_DOMAIN = os.getenv("IDCS_DOMAIN")
IDCS_CLIENT_ID = os.getenv("IDCS_CLIENT_ID")
IDCS_CLIENT_SECRET = os.getenv("IDCS_CLIENT_SECRET")
_global_token_cache = {}

# Get an instance of signer

def get_oci_signer(token: str, tokenID: str) -> TokenExchangeSigner:
    """Create an OCI TokenExchangeSigner using the provided token."""
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
    print(f"Signer created: {signer}")
    _global_token_cache[tokenID] = signer
    print(f"Signer cached globally for token ID: {tokenID}")
    #ctx.set_state('signer', signer)
    #token_storage.set(tokenID, signer, ctx)
    return signer

def get_identity_client() -> oci.identity.IdentityClient:
    # TODO: fix hard-coded region here
    # the region can be pulled from the decoded JWT (not the UPST),
    # field "domain_home"
    mcp_token = get_access_token()
    tokenID = mcp_token.claims.get("jti")
    token = mcp_token.token 
    #config = generate_config(token, private_key, "us-sanjose-1")
    #signer = oci.auth.signers.SecurityTokenSigner(token, private_key)
    signer = get_oci_signer(token, tokenID)
    return oci.identity.IdentityClient(config={'region': 'us-sanjose-1'}, signer=signer)


auth = OIDCProxy(
    config_url=f"https://{IDCS_DOMAIN}/.well-known/openid-configuration",
    client_id=IDCS_CLIENT_ID,
    client_secret=IDCS_CLIENT_SECRET,
    # FastMCP endpoint
    base_url="http://localhost:5000",
    # audience=IDCS_CLIENT_ID,
    required_scopes=["openid", "profile", "email"],
    require_authorization_consent=False,
    # redirect_path="/custom/callback",
)

mcp = FastMCP(name="My Server", auth=auth)

@mcp.tool
async def list_regions(ctx: Context) -> str:

    iam_client = get_identity_client()
    print(f"Regions are {iam_client.list_regions().data}")
    return iam_client.list_regions().data.__str__()

@mcp.tool
async def get_os_namespace(ctx: Context) -> str:
    
    token = get_access_token()
    tokenID = token.claims.get("jti")
    ac_token = token.token
    signer = get_oci_signer(ac_token, tokenID)
    region = "us-sanjose-1"
    object_storage_client = oci.object_storage.ObjectStorageClient(config={'region': region}, signer=signer)

    # Get the namespace
    namespace_response = object_storage_client.get_namespace()
    namespace_name = namespace_response.data
    return namespace_name

if __name__ == "__main__":
    mcp.run(transport="http", port=5000)

@mcp.custom_route("/health", methods=["GET"])
async def health_check(request: Request) -> PlainTextResponse:
    return PlainTextResponse("OK")
