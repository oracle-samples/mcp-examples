## IAM Domain Configuration Steps

### Make sure client access is enabled for JWK's URL

1. Login to OCI console (https://cloud.oracle.com for OCI commercial cloud).
2. From "Identity & Security" menu, open Domains page.
3. On the Domains list page, select the domain that you are using for MCP Authentication.
4. Open Settings tab. 
5. Click on "Edit Domain Settings" button.

![Edit IAM Domain Settings](./ocieditdomainsettingsbutton.png)

6. Enable "Configure client access" checkbox as show in the screenshot.

![IAM Domain Settings](./ocieditdomainsettings.png)

### Create OAuth client for MCP server authentication

1. Login to OCI console (https://cloud.oracle.com for OCI commercial cloud).
2. From "Identity & Security" menu, open Domains page.
3. On the Domains list page, select the domain in which you want to create MCP server OAuth client. If you need help finding the list page for the domain, see [Listing Identity Domains.](https://docs.oracle.com/en-us/iaas/Content/Identity/domains/to-view-identity-domains.htm#view-identity-domains).
4. On the details page, select Integrated applications. A list of applications in the domain is displayed.
5. Select Add application.
6. In the Add application window, select Confidential Application.
7. Select Launch workflow.
8. In the Add application details page, Enter name and description as shown below.

![Add Confidential Integrated Application](./ociaddapplication.png)

9. Once the Integrated Application is created, Click on "OAuth configuration" tab.
10. Click on "Edit OAuth configuration" button.
11. Configure the application as OAuth client by selecting "Configure this application as a client now" radio button.
12. Select "Authorization code" grant type. If you are planning to use the same OAuth client application for token exchange, select "Client credentials" grant type as well. In the sample, we will use the same client.
13. For Authorization grant type, select redirect URL. This is, in most cases, will be MCP server URL followed by "/oauth/callback".

![OAuth Configuration for an Integrated Application](./ocioauthconfiguration.png)

14. Click on "Submit" button to update OAuth configuration for the client application. 
**Note: You don't need to do any special configuration to support PKCE for the OAuth client.**
15. Make sure to Activate the client application.
16. Note down client ID and client secret for the application. Update .env file and replace IAM_CLIENT_ID and IAM_CLIENT_SECRET values. 
17. IAM_DOMAIN in the env file is the Identity domain URL that you chose for the MCP server.

### Token Exchange Setup (Only if MCP server needs to talk to OCI Control Plane)

Token exchange helps you exchange a logged-in user's OCI IAM token for an OCI control plane session token, also known as UPST (User Principal Session Token). To learn more about token exchange, refer to my [Workload Identity Federation Blog](https://www.ateam-oracle.com/post/workload-identity-federation)

For token exchange, we need to configure Identity propagation trust. The blog above discusses setting up the trust using REST APIs. However, you can also use OCI CLI. Before using the CLI command below, ensure that you have created a token exchange OAuth client. In most cases, you can use the same OAuth client that you created above. 

```bash
oci identity-domains identity-propagation-trust create \
--schemas '["urn:ietf:params:scim:schemas:oracle:idcs:IdentityPropagationTrust"]' \
--public-key-endpoint "https://${IDCS_DOMAIN}/admin/v1/SigningCert/jwk" \
--name "For Token Exchange" --type "JWT" \
--issuer "https://identity.oraclecloud.com/" --active true \
--endpoint "https://${IDCS_DOMAIN}" \
--subject-claim-name "sub" --allow-impersonation false \
--subject-mapping-attribute "username" \
--subject-type "User" --client-claim-name "iss" \
--client-claim-values '["https://identity.oraclecloud.com/"]' \
--oauth-clients '["{IDCS_CLIENT_ID}"]'
```