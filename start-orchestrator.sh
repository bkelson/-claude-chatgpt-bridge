#!/bin/bash

# Start the MCP Bridge Orchestrator
# This watches for debate files and automatically generates instructions

cd ~/claude_sandbox/claude-chatgpt-bridge

echo "🎭 Starting Debate Orchestrator..."
echo ""
echo "This will watch for debate files and automatically coordinate turns."
echo "Press Ctrl+C to stop."
echo ""

node orchestrator.js
