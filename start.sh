#!/bin/bash

# Claude-ChatGPT Bridge Startup Script
# This script starts the Cloudflare Tunnel and OAuth-protected MCP server

set -e  # Exit on error

echo "🚀 Starting Claude-ChatGPT Bridge..."
echo ""

# Configuration
AUTH0_DOMAIN="YOUR_AUTH0_DOMAIN"
AUTH0_AUDIENCE="https://claude-chatgpt-bridge"
PORT=3000
PROJECT_DIR="$HOME/claude_sandbox/claude-chatgpt-bridge"

# Check if cloudflared is installed
if [ ! -f "$HOME/bin/cloudflared" ]; then
    echo "❌ Error: cloudflared not found at ~/bin/cloudflared"
    echo "Please install it first. See SETUP-GUIDE.md for instructions."
    exit 1
fi

# Check if project is built
if [ ! -f "$PROJECT_DIR/dist/oauth-server.js" ]; then
    echo "❌ Error: Project not built. Running npm build..."
    cd "$PROJECT_DIR"
    npm run build
fi

# Stop any existing instances
echo "🧹 Cleaning up existing processes..."
pkill -f "cloudflared" 2>/dev/null || true
pkill -f "oauth-server" 2>/dev/null || true
sleep 2

# Start Cloudflare Tunnel
echo "🌐 Starting Cloudflare Tunnel..."
$HOME/bin/cloudflared tunnel --url http://localhost:$PORT > /tmp/cloudflared.log 2>&1 &
CLOUDFLARED_PID=$!

# Wait for tunnel to be ready
echo "⏳ Waiting for tunnel to initialize..."
sleep 5

# Extract tunnel URL
TUNNEL_URL=$(cat /tmp/cloudflared.log | grep -o 'https://[^[:space:]]*trycloudflare.com' | head -1)

if [ -z "$TUNNEL_URL" ]; then
    echo "❌ Error: Could not get tunnel URL"
    echo "Check /tmp/cloudflared.log for details"
    exit 1
fi

echo "✅ Tunnel URL: $TUNNEL_URL"
echo ""

# Start OAuth-protected MCP Server
echo "🔐 Starting OAuth-protected MCP server..."
cd "$PROJECT_DIR"

AUTH0_DOMAIN="$AUTH0_DOMAIN" \
AUTH0_AUDIENCE="$AUTH0_AUDIENCE" \
PUBLIC_URL="$TUNNEL_URL" \
PORT=$PORT \
node dist/oauth-server.js > /tmp/oauth-server.log 2>&1 &
MCP_PID=$!

# Wait for server to start
sleep 3

# Verify server is running
if ! ps -p $MCP_PID > /dev/null; then
    echo "❌ Error: OAuth server failed to start"
    echo "Check /tmp/oauth-server.log for details"
    exit 1
fi

echo "✅ OAuth server started (PID: $MCP_PID)"
echo ""

# Test the server
echo "🔍 Testing server..."
RESPONSE=$(curl -s "$TUNNEL_URL/.well-known/oauth-protected-resource" 2>/dev/null || echo "")

if echo "$RESPONSE" | grep -q "claude-chatgpt-bridge"; then
    echo "✅ Server is responding correctly"
else
    echo "⚠️  Warning: Server may not be configured correctly"
    echo "Response: $RESPONSE"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Claude-ChatGPT Bridge is running!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📍 Tunnel URL: $TUNNEL_URL"
echo "🔐 Auth0 Domain: $AUTH0_DOMAIN"
echo "🔧 Port: $PORT"
echo ""
echo "Process IDs:"
echo "  - Cloudflared: $CLOUDFLARED_PID"
echo "  - OAuth Server: $MCP_PID"
echo ""
echo "Logs:"
echo "  - Tunnel: /tmp/cloudflared.log"
echo "  - Server: /tmp/oauth-server.log"
echo ""
echo "Next steps:"
echo "  1. Update your ChatGPT MCP server configuration with:"
echo "     Server URL: $TUNNEL_URL"
echo "  2. Use existing OAuth Client ID and Secret"
echo "  3. Test by calling bridge_status in ChatGPT"
echo ""
echo "To stop: ./stop.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Save tunnel URL for reference
echo "$TUNNEL_URL" > /tmp/current-tunnel-url.txt
