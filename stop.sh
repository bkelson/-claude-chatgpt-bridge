#!/bin/bash

# Claude-ChatGPT Bridge Shutdown Script
# This script stops the Cloudflare Tunnel and OAuth-protected MCP server

echo "🛑 Stopping Claude-ChatGPT Bridge..."
echo ""

# Stop cloudflared
echo "🌐 Stopping Cloudflare Tunnel..."
if pkill -f "cloudflared"; then
    echo "✅ Cloudflare Tunnel stopped"
else
    echo "ℹ️  No Cloudflare Tunnel process found"
fi

# Stop OAuth server
echo "🔐 Stopping OAuth server..."
if pkill -f "oauth-server"; then
    echo "✅ OAuth server stopped"
else
    echo "ℹ️  No OAuth server process found"
fi

# Wait for processes to terminate
sleep 2

# Verify processes are stopped
CLOUDFLARED_RUNNING=$(ps aux | grep -v grep | grep "cloudflared" || echo "")
OAUTH_RUNNING=$(ps aux | grep -v grep | grep "oauth-server" || echo "")

if [ -n "$CLOUDFLARED_RUNNING" ] || [ -n "$OAUTH_RUNNING" ]; then
    echo ""
    echo "⚠️  Warning: Some processes may still be running"
    echo "Use 'ps aux | grep -E \"(cloudflared|oauth-server)\"' to check"
else
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✅ All processes stopped successfully"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Logs are still available at:"
    echo "  - /tmp/cloudflared.log"
    echo "  - /tmp/oauth-server.log"
    echo ""
    echo "To start again: ./start.sh"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
fi

echo ""
