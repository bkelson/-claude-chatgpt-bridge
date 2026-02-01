#!/bin/bash

# Start the Claude-ChatGPT Bridge with OAuth/Auth0 support
#
# Usage:
#   ./start-oauth.sh <auth0-domain> <auth0-audience> [port]
#
# Example:
#   ./start-oauth.sh mycompany.auth0.com https://claude-chatgpt-bridge 3000

if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Usage: ./start-oauth.sh <auth0-domain> <auth0-audience> [port]"
    echo ""
    echo "Example:"
    echo "  ./start-oauth.sh mycompany.auth0.com https://claude-chatgpt-bridge 3000"
    echo ""
    echo "Arguments:"
    echo "  auth0-domain   - Your Auth0 domain (e.g., mycompany.auth0.com)"
    echo "  auth0-audience - Your Auth0 API identifier (e.g., https://claude-chatgpt-bridge)"
    echo "  port           - Port to run on (default: 3000)"
    exit 1
fi

AUTH0_DOMAIN="$1"
AUTH0_AUDIENCE="$2"
PORT="${3:-3000}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting Claude-ChatGPT Bridge with OAuth"
echo "==========================================="
echo "Auth0 Domain:   $AUTH0_DOMAIN"
echo "Auth0 Audience: $AUTH0_AUDIENCE"
echo "Port:           $PORT"
echo ""
echo "Press Ctrl+C to stop"
echo ""

AUTH0_DOMAIN="$AUTH0_DOMAIN" \
AUTH0_AUDIENCE="$AUTH0_AUDIENCE" \
PORT="$PORT" \
node "$SCRIPT_DIR/dist/oauth-server.js"
