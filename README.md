# Claude-ChatGPT Bridge Setup Guide

Complete guide to set up an OAuth-authenticated MCP server that enables Claude and ChatGPT to communicate.

## Overview

This guide will help you:
- Set up Auth0 OAuth authentication
- Deploy an MCP server with Cloudflare Tunnel
- Connect ChatGPT to the bridge
- Enable bidirectional communication between Claude and ChatGPT

**Estimated time:** 30-45 minutes

---

## Prerequisites

- Node.js and npm installed
- A free Auth0 account
- ChatGPT Plus or Team subscription (for MCP support)
- Terminal access

---

## Step 1: Auth0 Setup

### 1.1 Create Auth0 Account
1. Go to https://auth0.com/ and sign up for a free account
2. Complete account verification
3. Note your Auth0 domain (e.g., `dev-xyz123.us.auth0.com`)

### 1.2 Create API
1. In Auth0 Dashboard, go to **Applications** → **APIs**
2. Click **Create API**
3. Configure:
   - **Name**: `Claude ChatGPT Bridge`
   - **Identifier**: `https://claude-chatgpt-bridge` (must be exactly this)
   - **Signing Algorithm**: RS256
4. Click **Create**

### 1.3 Add API Permissions
1. In your new API, go to the **Permissions** tab
2. Add these two permissions:
   - **Permission**: `read:tools` | **Description**: `Read available tools`
   - **Permission**: `execute:tools` | **Description**: `Execute tools`
3. Click **Add** for each

### 1.4 Configure API Settings
1. Go to the **Settings** tab
2. Enable these options:
   - ✅ **Allow Offline Access**: ON
   - ✅ **Allow Skipping User Consent**: ON
3. Scroll to **RBAC Settings**:
   - ✅ **Enable RBAC**: ON
   - ✅ **Add Permissions in the Access Token**: ON
4. Click **Save**

### 1.5 Create Application
1. Go to **Applications** → **Applications**
2. Click **Create Application**
3. Configure:
   - **Name**: `ChatGPT MCP Client`
   - **Type**: Regular Web Application
4. Click **Create**

### 1.6 Configure Application
1. In the **Settings** tab, scroll to **Application URIs**
2. Set **Allowed Callback URLs**:
   ```
   https://chatgpt.com/connector_platform_oauth_redirect
   ```
3. Scroll to **Advanced Settings** → **Grant Types**
4. Ensure these are checked:
   - ✅ Authorization Code
   - ✅ Client Credentials
5. Click **Save Changes**

### 1.7 Note Your Credentials
Copy these values (you'll need them later):
- **Domain**: `dev-xyz123.us.auth0.com`
- **Client ID**: (from application settings)
- **Client Secret**: (click "Show" to reveal)

### 1.8 Authorize Application to Access API
1. Go to **Applications** → **APIs** → **`https://claude-chatgpt-bridge`**
2. Click the **Application Access** tab
3. Find **ChatGPT MCP Client** in the list
4. Click **Edit**
5. On the **User Access** tab:
   - Set to **Authorized**
   - Check: ✅ `read:tools` and ✅ `execute:tools`
   - Click **Save**
6. On the **Client Access** tab:
   - Set to **Authorized**
   - Check: ✅ `read:tools` and ✅ `execute:tools`
   - Click **Save**

**CRITICAL:** You must authorize BOTH user access AND client access with both scopes.

---

## Step 2: Install and Build the MCP Server

### 2.1 Clone or Navigate to Project
```bash
cd ~/claude_sandbox/claude-chatgpt-bridge
```

### 2.2 Install Dependencies
```bash
npm install
```

### 2.3 Build the Project
```bash
npm run build
```

---

## Step 3: Set Up Cloudflare Tunnel

### 3.1 Install Cloudflared
```bash
# Download the binary
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz -o /tmp/cf.tgz

# Extract to ~/bin
tar -xzf /tmp/cf.tgz -C ~/bin/

# Make executable
chmod +x ~/bin/cloudflared

# Verify installation
~/bin/cloudflared version
```

### 3.2 Start the Tunnel
```bash
~/bin/cloudflared tunnel --url http://localhost:3000 > /tmp/cloudflared.log 2>&1 &
```

### 3.3 Get the Tunnel URL
```bash
sleep 5
cat /tmp/cloudflared.log | grep -o 'https://[^[:space:]]*trycloudflare.com'
```

Save this URL - you'll need it for the next step.

**Note:** Free Cloudflare tunnels get a random URL each time. For a permanent URL, create a Cloudflare account and set up a named tunnel, or use ngrok's paid tier.

---

## Step 4: Start the OAuth-Protected MCP Server

### 4.1 Set Environment Variables and Start Server
```bash
AUTH0_DOMAIN="dev-xyz123.us.auth0.com" \
AUTH0_AUDIENCE="https://claude-chatgpt-bridge" \
PUBLIC_URL="https://your-tunnel-url.trycloudflare.com" \
PORT=3000 \
node dist/oauth-server.js > /tmp/oauth-server.log 2>&1 &
```

**Replace:**
- `dev-xyz123.us.auth0.com` with your Auth0 domain
- `https://your-tunnel-url.trycloudflare.com` with your Cloudflare tunnel URL

### 4.2 Verify Server is Running
```bash
# Check OAuth metadata endpoint
curl -s https://your-tunnel-url.trycloudflare.com/.well-known/oauth-protected-resource | python3 -m json.tool
```

You should see:
```json
{
    "resource": "https://claude-chatgpt-bridge",
    "authorization_servers": ["https://dev-xyz123.us.auth0.com/"],
    "bearer_methods_supported": ["header"],
    "scopes_supported": ["read:tools", "execute:tools"]
}
```

---

## Step 5: Connect ChatGPT to the MCP Server

### 5.1 Add MCP Server in ChatGPT
1. Go to ChatGPT web interface (https://chatgpt.com)
2. Click **Settings** (bottom left)
3. Go to **Apps** → **Advanced Settings**
4. Click **Create App**

### 5.2 Configure the MCP Server
Fill in the form:
- **Name**: `Hope_This_Works` (or any name you prefer)
- **Description**: `Claude-ChatGPT Bridge for cross-model communication`
- **MCP Server URL**: `https://your-tunnel-url.trycloudflare.com`
- **Authentication**: Select `OAuth`
- **OAuth Client ID**: (paste from Auth0 application settings)
- **OAuth Client Secret**: (paste from Auth0 application settings)
- Check the disclaimer checkbox
- Click **Save** or **Connect**

### 5.3 Complete OAuth Flow
1. You'll be redirected to Auth0 login page
2. Log in with your Auth0 credentials (or sign up if prompted)
3. You should see a success message and be redirected back to ChatGPT
4. The MCP server should now show as "Connected" with a green indicator

### 5.4 Verify Tools are Available
1. In the MCP server settings, click **Refresh**
2. You should see 11 tools listed:
   - `bridge_status` - Check server status
   - `send_message` - Send messages to Claude or ChatGPT
   - `check_inbox` - Check for messages
   - `list_files` - List shared files
   - `read_file` - Read shared files
   - `write_file` - Write shared files
   - `delete_file` - Delete shared files
   - `log_conversation` - Log conversation entries
   - `read_conversation` - Read conversation log
   - `clear_conversation` - Clear conversation log
   - `clear_inbox` - Clear inbox messages

---

## Step 6: Test the Bridge

### 6.1 Enable the Bridge in a Conversation
1. Start a new ChatGPT conversation
2. Click the **+** icon to add apps
3. Select **Hope_This_Works** (or whatever you named it)

### 6.2 Test Bridge Status
In ChatGPT, type:
```
Use the bridge_status tool
```

You should get a response showing:
- Shared files count
- Claude's inbox message count
- ChatGPT's inbox message count
- Conversation log entries

### 6.3 Test Message Sending
```
Send a message to Claude saying "Hello from ChatGPT!"
```

This will place a message in Claude's inbox that you can read from Claude's interface.

---

## Troubleshooting

### Issue: "Something went wrong with setting up the connection"

**Check:**
1. Auth0 callback URL is exactly: `https://chatgpt.com/connector_platform_oauth_redirect`
2. Both user access AND client access are authorized in Auth0
3. Both scopes (`read:tools`, `execute:tools`) are granted for both access types
4. The OAuth metadata resource is `https://claude-chatgpt-bridge` (not the tunnel URL)

### Issue: "Client is not authorized to access resource server"

**Fix:**
1. Go to Auth0 → Applications → APIs → `https://claude-chatgpt-bridge` → Application Access
2. Click **Edit** on your ChatGPT MCP Client
3. Authorize **both** User Access and Client Access
4. Grant **both** scopes to **both** access types
5. Click **Save**

### Issue: Tools visible but not callable

**Fix:**
1. Delete and re-add the MCP server in ChatGPT settings
2. Make sure to click the **+** icon in a conversation to enable the app
3. Check server logs: `tail -20 /tmp/oauth-server.log`

### Issue: Tunnel URL changes on restart

**Solutions:**
- **Free option**: Use Cloudflare named tunnels (requires Cloudflare account)
- **Paid option**: Use ngrok paid tier ($8/month) for permanent URLs
- **When URL changes**: Update the `PUBLIC_URL` env var and restart the server

---

## Starting and Stopping

### Start Everything
```bash
# Start Cloudflare Tunnel
~/bin/cloudflared tunnel --url http://localhost:3000 > /tmp/cloudflared.log 2>&1 &

# Get tunnel URL (wait 5 seconds first)
sleep 5
TUNNEL_URL=$(cat /tmp/cloudflared.log | grep -o 'https://[^[:space:]]*trycloudflare.com')
echo "Tunnel URL: $TUNNEL_URL"

# Start MCP Server
AUTH0_DOMAIN="your-domain.auth0.com" \
AUTH0_AUDIENCE="https://claude-chatgpt-bridge" \
PUBLIC_URL="$TUNNEL_URL" \
PORT=3000 \
node dist/oauth-server.js > /tmp/oauth-server.log 2>&1 &
```

### Stop Everything
```bash
pkill -f "cloudflared"
pkill -f "oauth-server"
```

### Check Status
```bash
# Check if processes are running
ps aux | grep -E "(cloudflared|oauth-server)" | grep -v grep

# View server logs
tail -20 /tmp/oauth-server.log

# View tunnel logs
tail -20 /tmp/cloudflared.log
```

---

## Security Notes

1. **Tunnel Security**: Cloudflare Tunnel exposes your local server to the internet. Only run it when needed.

2. **OAuth Tokens**: Tokens are validated via JWT verification. Ensure your Auth0 domain and audience match exactly.

3. **Shared Directory**: The bridge only exposes files in `~/claude_sandbox/claude-chatgpt-bridge/shared/` - nothing else on your system.

4. **Access Control**: Only users who can log in via Auth0 can access the bridge.

5. **Production Use**: For production:
   - Use a named Cloudflare Tunnel or proper hosting
   - Implement JWT signature verification using Auth0's JWKS
   - Add rate limiting
   - Enable audit logging

---

## Architecture Overview

```
ChatGPT (Web)
    ↓ OAuth
    ↓ HTTPS
Cloudflare Tunnel
    ↓
OAuth Server (Node.js + Express)
    ↓ validates JWT
    ↓ forwards JSON-RPC
MCP Server (Node.js)
    ↓
Shared Directory
    - Files
    - Inboxes (Claude ↔ ChatGPT)
    - Conversation Logs
```

---

## Next Steps

1. **Explore the tools**: Try sending messages, sharing files, logging conversations
2. **Optimize for your use case**: Implement advanced orchestration patterns
3. **Make it permanent**: Set up a named Cloudflare tunnel or cloud hosting
4. **Extend functionality**: Add custom tools for your specific needs

---

## Support

For issues or questions:
- Check the troubleshooting section above
- Review Auth0 logs: Auth0 Dashboard → Monitoring → Logs
- Review server logs: `tail -50 /tmp/oauth-server.log`
- Review tunnel logs: `tail -50 /tmp/cloudflared.log`

---

**You now have a working Claude-ChatGPT bridge! 🎉**
