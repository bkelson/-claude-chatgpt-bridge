# Claude-ChatGPT Bridge Setup Guide

## Quick Start

```bash
cd /Users/briankelson/claude_sandbox/claude-chatgpt-bridge

# Build (only needed once or after changes)
npm run build
```

## Connecting Claude Code

**Already configured!** I've added the MCP server to `~/.claude/settings.json`.

Restart Claude Code to load the bridge. You can then use tools like:
- `bridge_status` - Check the bridge status
- `send_message` - Send a message to ChatGPT
- `check_inbox` - Check for messages from ChatGPT

## Connecting ChatGPT

ChatGPT needs an HTTP endpoint. Run the bridge in HTTP mode:

```bash
# Start the HTTP server (default port 3000)
./start-http.sh

# Or specify a custom port
./start-http.sh 8080
```

Then configure ChatGPT:
1. Open ChatGPT desktop app or web
2. Go to **Settings → Developer Mode** (enable if not already)
3. Add MCP Server with URL: `http://localhost:3000/sse`

To stop: Press `Ctrl+C` in the terminal

## Available Tools

| Tool | Description |
|------|-------------|
| `list_files` | List files in shared directory |
| `read_file` | Read a shared file |
| `write_file` | Write to a shared file |
| `delete_file` | Delete a shared file |
| `send_message` | Send message to Claude or ChatGPT inbox |
| `check_inbox` | Check your inbox for messages |
| `clear_inbox` | Clear all messages from inbox |
| `log_conversation` | Add entry to shared conversation log |
| `read_conversation` | Read shared conversation log |
| `clear_conversation` | Clear the conversation log |
| `bridge_status` | Get current bridge status |

## Shared Data Location

All shared data is stored in:
```
/Users/briankelson/claude_sandbox/claude-chatgpt-bridge/shared/
├── files/              # Shared files
├── inbox/
│   ├── claude.json     # Messages for Claude
│   └── chatgpt.json    # Messages for ChatGPT
└── conversation.log    # Shared conversation history
```

## Example Workflow

**1. Claude sends a message to ChatGPT:**
```
Claude uses: send_message(to="chatgpt", from="claude", message="Hey ChatGPT, can you review the code in shared files?")
```

**2. ChatGPT checks inbox and responds:**
```
ChatGPT uses: check_inbox(who="chatgpt")
ChatGPT uses: send_message(to="claude", from="chatgpt", message="Sure! I see the code. Here's my feedback...")
```

**3. Sharing files:**
```
write_file(filename="project-notes.txt", content="Notes about our collaboration...")
list_files()
read_file(filename="project-notes.txt")
```

**4. Shared conversation log:**
```
log_conversation(speaker="claude", message="Starting code review session")
log_conversation(speaker="chatgpt", message="Acknowledged, reviewing now")
read_conversation()
```

## Troubleshooting

**Claude Code doesn't see the bridge:**
- Restart Claude Code after adding settings
- Check `~/.claude/settings.json` has the correct config

**ChatGPT can't connect:**
- Make sure `./start-http.sh` is running
- Verify the URL includes `/sse` suffix
- Check firewall isn't blocking port 3000

**Messages not appearing:**
- Use `bridge_status` to check inbox counts
- Make sure you're checking the right inbox (`claude` vs `chatgpt`)
