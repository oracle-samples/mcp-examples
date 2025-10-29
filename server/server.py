import base64
import json
import os
import subprocess
import tempfile
from typing import Annotated

import jwt
import oci
import requests
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastmcp import Context, FastMCP
from fastmcp.server.auth.oidc_proxy import OIDCProxy
from fastmcp.server.dependencies import get_access_token
from oci.config import validate_config

IDCS_DOMAIN = os.getenv("IDCS_DOMAIN")
IDCS_CLIENT_ID = os.getenv("IDCS_CLIENT_ID")
IDCS_CLIENT_SECRET = os.getenv("IDCS_CLIENT_SECRET")

# Key generation

PRIVATE_KEY = rsa.generate_private_key(
    public_exponent=65537,
    key_size=2048,
    backend=default_backend(),
)

PUBLIC_KEY = PRIVATE_KEY.public_key()

PUBLIC_KEY_DER = PUBLIC_KEY.public_bytes(
    encoding=serialization.Encoding.DER,
    format=serialization.PublicFormat.SubjectPublicKeyInfo,
)

PUBLIC_KEY_DER_B64 = base64.b64encode(PUBLIC_KEY_DER).decode("utf-8")


def get_token_endpoint(domain: str) -> str:
    config_url = f"https://{domain}/.well-known/openid-configuration"
    response = requests.get(config_url)
    response.raise_for_status()
    return response.json()["token_endpoint"]


def generate_config(upst: bytes, private_key: rsa.RSAPrivateKey, region: str) -> dict:
    public_key = private_key.public_key()
    private_key_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    private_key_pem_b64 = base64.b64encode(private_key_pem).decode("utf-8")

    public_key_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    # TODO: ⚠️ FIX VERIFICATION, this should not be disabled
    decoded_upst = jwt.decode(
        upst, public_key_pem, algorithms=["RS256"], options={"verify_signature": False}
    )

    digest = hashes.Hash(hashes.MD5())
    digest.update(private_key_pem)
    fingerprint = digest.finalize()
    fingerprint_hex = ":".join(f"{b:02x}" for b in fingerprint)

    config = {
        "user": decoded_upst["sub"],
        "key_content": private_key_pem_b64,
        "fingerprint": fingerprint_hex,
        "tenancy": decoded_upst["tenant"],
        "region": region,
    }
    validate_config(config)
    return config


def get_identity_client(token, private_key):
    # TODO: fix hard-coded region here
    # the region can be pulled from the decoded JWT (not the UPST),
    # field "domain_home"
    config = generate_config(token, private_key, "us-sanjose-1")
    signer = oci.auth.signers.SecurityTokenSigner(token, private_key)
    return oci.identity.IdentityClient(config, signer=signer)


def exchange_token(client_id, client_secret, public_key, jwt):
    """Exchange a JWT for a UPST"""
    creds = f"{client_id}:{client_secret}".encode("utf-8")
    encoded_creds = base64.b64encode(creds).decode("utf-8")

    payload = {
        "grant_type": "urn:ietf:params:oauth:grant-type:token-exchange",
        "requested_token_type": "urn:oci:token-type:oci-upst",
        "public_key": public_key,
        "subject_token": jwt,
        "subject_token_type": "jwt",
    }

    token_endpoint = get_token_endpoint(IDCS_DOMAIN)

    response = requests.post(
        token_endpoint,
        data=payload,
        headers={
            "Authorization": f"Basic {encoded_creds}",
            "Content-Type": "application/x-www-form-urlencoded",
        },
    )

    return response.json()


auth = OIDCProxy(
    config_url=f"https://{IDCS_DOMAIN}/.well-known/openid-configuration",
    client_id=IDCS_CLIENT_ID,
    client_secret=IDCS_CLIENT_SECRET,
    # FastMCP endpoint
    base_url="http://localhost:5000",
    # audience=IDCS_CLIENT_ID,
    required_scopes=["openid"],
    # redirect_path="/custom/callback",
)

mcp = FastMCP(name="My Server", auth=auth)


@mcp.tool
def get_oci_command_help(command: str) -> str:
    """Returns helpful instructions for running an OCI CLI command.
    Only provide the command after 'oci', do not include the string 'oci'
    in your command.

    Never use this information returned by this tool to tell a user what
    to do, only use it to help you determine which command to run yourself
    using the run_oci_command tool.

    CLI commands are structured as <service> <resource> <action>; you can get
    help at the service level, resource level or action level, respectively:
        1. compute
        2. compute instance
        3. compute instance list

    If your request for help for a specific command
    returns an error, make your requests successively less specific;
    example:
        1. compute instance list
        2. compute instance
        3. compute
    """
    try:
        # Run OCI CLI command using subprocess
        result = subprocess.run(
            ["oci"] + command.split() + ["--help"],
            capture_output=True,
            text=True,
            check=True,
            shell=False,
        )
        return result.stdout
    except subprocess.CalledProcessError as e:
        return f"Error: {e.stderr}"


@mcp.tool()
def run_oci_command(
    command: Annotated[
        str,
        "The OCI CLI command to run. Do not include 'oci' in your command",
    ],
) -> dict:
    """Runs an OCI CLI command.
    This tool allows you to run OCI CLI commands on the user's behalf.

    Only provide the command after 'oci', do not include the string 'oci'
    in your command.

    Never tell the user which command to run, only run it for them using
    this tool.
    """

    token = get_access_token()

    print("session token:")
    print(token.token)

    upst = exchange_token(
        IDCS_CLIENT_ID, IDCS_CLIENT_SECRET, PUBLIC_KEY_DER_B64, token.token
    )["token"]

    config = generate_config(upst, PRIVATE_KEY, "us-sanjose-1")

    # write security token to a file
    # using temporary files until
    # https://github.com/oracle/oci-cli/pull/993
    with tempfile.NamedTemporaryFile(mode="wb") as temp_file:
        with tempfile.NamedTemporaryFile(mode="wb") as key_temp_file:
            temp_file.write(upst.encode("utf-8"))
            temp_file.seek(0)

            decoded_key = base64.b64decode(config["key_content"])
            print(f"decoded key: {decoded_key}")
            key_temp_file.write(decoded_key)
            key_temp_file.seek(0)

            # build environment for OCI CLI invocation
            env = os.environ.copy()
            env.update(
                {
                    "OCI_CLI_USER": config["user"],
                    "OCI_CLI_TENANCY": config["tenancy"],
                    "OCI_CLI_FINGERPRINT": config["fingerprint"],
                    "OCI_CLI_AUTH": "security_token",
                    # this won't work without an update to oci-cli
                    # see: https://github.com/oracle/oci-cli/pull/993
                    # "OCI_CLI_KEY_CONTENT": config["key_content"],
                    "OCI_CLI_KEY_FILE": key_temp_file.name,
                    "OCI_CLI_SECURITY_TOKEN_FILE": temp_file.name,
                }
            )
            # profile = os.getenv("OCI_CONFIG_PROFILE", oci.config.DEFAULT_PROFILE)

            # Run OCI CLI command using subprocess
            try:
                result = subprocess.run(
                    ["oci"] + command.split(),
                    env=env,
                    capture_output=True,
                    text=True,
                    check=True,
                    shell=False,
                )
                if result.stdout:
                    return json.loads(result.stdout)
                else:
                    return {
                        "error": result.stderr,
                    }
            except subprocess.CalledProcessError as e:
                return {
                    "error": e.stderr,
                    "output": e.stdout,
                }


@mcp.tool
def list_regions(ctx: Context):
    token = get_access_token()

    print("session token:")
    print(token.token)

    upst = exchange_token(
        IDCS_CLIENT_ID, IDCS_CLIENT_SECRET, PUBLIC_KEY_DER_B64, token.token
    )["token"]
    client = get_identity_client(upst, PRIVATE_KEY)

    return client.list_regions().data


mcp.run(transport="http", host="localhost", port=5000)
