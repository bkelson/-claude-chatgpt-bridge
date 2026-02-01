#!/bin/bash

# Start the Claude-ChatGPT Bridge with HTTP/SSE support for ChatGPT
# Usage: ./start-http.sh [port]

PORT=${1:-3000}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Starting Claude-ChatGPT Bridge on http://localhost:$PORT"
echo "Press Ctrl+C to stop"
echo ""

npx -y supergateway \
  --stdio "node $SCRIPT_DIR/dist/index.js" \
  --port $PORT \
  --baseUrl "http://localhost:$PORT"
