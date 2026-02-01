#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Shared directory paths
const SHARED_DIR = path.join(__dirname, "..", "shared");
const FILES_DIR = path.join(SHARED_DIR, "files");
const INBOX_DIR = path.join(SHARED_DIR, "inbox");
const CONVERSATION_LOG = path.join(SHARED_DIR, "conversation.log");

// Ensure directories exist
async function ensureDirectories() {
  await fs.mkdir(FILES_DIR, { recursive: true });
  await fs.mkdir(INBOX_DIR, { recursive: true });

  // Initialize inbox files if they don't exist
  const claudeInbox = path.join(INBOX_DIR, "claude.json");
  const chatgptInbox = path.join(INBOX_DIR, "chatgpt.json");

  try {
    await fs.access(claudeInbox);
  } catch {
    await fs.writeFile(claudeInbox, JSON.stringify({ messages: [] }, null, 2));
  }

  try {
    await fs.access(chatgptInbox);
  } catch {
    await fs.writeFile(chatgptInbox, JSON.stringify({ messages: [] }, null, 2));
  }

  // Initialize conversation log if it doesn't exist
  try {
    await fs.access(CONVERSATION_LOG);
  } catch {
    await fs.writeFile(CONVERSATION_LOG, "");
  }
}

// Create the MCP server
const server = new McpServer({
  name: "claude-chatgpt-bridge",
  version: "1.0.0",
});

// ============================================
// FILE OPERATIONS
// ============================================

server.tool(
  "list_files",
  "List all files in the shared directory",
  {},
  async () => {
    try {
      const files = await fs.readdir(FILES_DIR);
      return {
        content: [
          {
            type: "text",
            text: files.length > 0
              ? `Files in shared directory:\n${files.map(f => `  - ${f}`).join("\n")}`
              : "No files in shared directory.",
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error listing files: ${error}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "read_file",
  "Read a file from the shared directory",
  {
    filename: z.string().describe("Name of the file to read"),
  },
  async ({ filename }) => {
    try {
      // Security: prevent path traversal
      const safeName = path.basename(filename);
      const filePath = path.join(FILES_DIR, safeName);
      const content = await fs.readFile(filePath, "utf-8");
      return {
        content: [
          {
            type: "text",
            text: `Contents of ${safeName}:\n\n${content}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error reading file: ${error}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "write_file",
  "Write content to a file in the shared directory",
  {
    filename: z.string().describe("Name of the file to write"),
    content: z.string().describe("Content to write to the file"),
  },
  async ({ filename, content }) => {
    try {
      // Security: prevent path traversal
      const safeName = path.basename(filename);
      const filePath = path.join(FILES_DIR, safeName);
      await fs.writeFile(filePath, content, "utf-8");
      return {
        content: [
          {
            type: "text",
            text: `Successfully wrote to ${safeName}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error writing file: ${error}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "delete_file",
  "Delete a file from the shared directory",
  {
    filename: z.string().describe("Name of the file to delete"),
  },
  async ({ filename }) => {
    try {
      // Security: prevent path traversal
      const safeName = path.basename(filename);
      const filePath = path.join(FILES_DIR, safeName);
      await fs.unlink(filePath);
      return {
        content: [
          {
            type: "text",
            text: `Successfully deleted ${safeName}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error deleting file: ${error}` }],
        isError: true,
      };
    }
  }
);

// ============================================
// MESSAGE INBOX
// ============================================

server.tool(
  "send_message",
  "Send a message to Claude or ChatGPT's inbox",
  {
    to: z.enum(["claude", "chatgpt"]).describe("Recipient: 'claude' or 'chatgpt'"),
    from: z.enum(["claude", "chatgpt"]).describe("Sender: 'claude' or 'chatgpt'"),
    message: z.string().describe("The message content"),
  },
  async ({ to, from, message }) => {
    try {
      const inboxPath = path.join(INBOX_DIR, `${to}.json`);
      const inboxData = JSON.parse(await fs.readFile(inboxPath, "utf-8"));

      inboxData.messages.push({
        from,
        message,
        timestamp: new Date().toISOString(),
        read: false,
      });

      await fs.writeFile(inboxPath, JSON.stringify(inboxData, null, 2));

      return {
        content: [
          {
            type: "text",
            text: `Message sent to ${to}'s inbox.`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error sending message: ${error}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "check_inbox",
  "Check your inbox for messages",
  {
    who: z.enum(["claude", "chatgpt"]).describe("Whose inbox to check: 'claude' or 'chatgpt'"),
    mark_as_read: z.boolean().optional().describe("Mark messages as read after checking (default: true)"),
  },
  async ({ who, mark_as_read = true }) => {
    try {
      const inboxPath = path.join(INBOX_DIR, `${who}.json`);
      const inboxData = JSON.parse(await fs.readFile(inboxPath, "utf-8"));

      const unreadMessages = inboxData.messages.filter((m: any) => !m.read);

      if (unreadMessages.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No new messages in ${who}'s inbox.`,
            },
          ],
        };
      }

      // Format messages
      const formattedMessages = unreadMessages.map((m: any, i: number) =>
        `[${i + 1}] From: ${m.from} (${m.timestamp})\n${m.message}`
      ).join("\n\n---\n\n");

      // Mark as read if requested
      if (mark_as_read) {
        inboxData.messages = inboxData.messages.map((m: any) => ({ ...m, read: true }));
        await fs.writeFile(inboxPath, JSON.stringify(inboxData, null, 2));
      }

      return {
        content: [
          {
            type: "text",
            text: `${unreadMessages.length} message(s) in ${who}'s inbox:\n\n${formattedMessages}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error checking inbox: ${error}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "clear_inbox",
  "Clear all messages from an inbox",
  {
    who: z.enum(["claude", "chatgpt"]).describe("Whose inbox to clear: 'claude' or 'chatgpt'"),
  },
  async ({ who }) => {
    try {
      const inboxPath = path.join(INBOX_DIR, `${who}.json`);
      await fs.writeFile(inboxPath, JSON.stringify({ messages: [] }, null, 2));

      return {
        content: [
          {
            type: "text",
            text: `Cleared ${who}'s inbox.`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error clearing inbox: ${error}` }],
        isError: true,
      };
    }
  }
);

// ============================================
// CONVERSATION LOG
// ============================================

server.tool(
  "log_conversation",
  "Add an entry to the shared conversation log",
  {
    speaker: z.enum(["claude", "chatgpt", "user", "system"]).describe("Who is speaking"),
    message: z.string().describe("The message to log"),
  },
  async ({ speaker, message }) => {
    try {
      const timestamp = new Date().toISOString();
      const entry = `[${timestamp}] ${speaker.toUpperCase()}: ${message}\n`;
      await fs.appendFile(CONVERSATION_LOG, entry);

      return {
        content: [
          {
            type: "text",
            text: `Logged to conversation.`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error logging conversation: ${error}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "read_conversation",
  "Read the shared conversation log",
  {
    lines: z.number().optional().describe("Number of recent lines to read (default: all)"),
  },
  async ({ lines }) => {
    try {
      const content = await fs.readFile(CONVERSATION_LOG, "utf-8");

      if (!content.trim()) {
        return {
          content: [
            {
              type: "text",
              text: "Conversation log is empty.",
            },
          ],
        };
      }

      let output = content;
      if (lines) {
        const allLines = content.trim().split("\n");
        output = allLines.slice(-lines).join("\n");
      }

      return {
        content: [
          {
            type: "text",
            text: `Conversation log:\n\n${output}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error reading conversation: ${error}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "clear_conversation",
  "Clear the shared conversation log",
  {},
  async () => {
    try {
      await fs.writeFile(CONVERSATION_LOG, "");

      return {
        content: [
          {
            type: "text",
            text: "Conversation log cleared.",
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error clearing conversation: ${error}` }],
        isError: true,
      };
    }
  }
);

// ============================================
// STATUS/INFO
// ============================================

server.tool(
  "bridge_status",
  "Get the current status of the bridge server",
  {},
  async () => {
    try {
      const files = await fs.readdir(FILES_DIR);

      const claudeInbox = JSON.parse(await fs.readFile(path.join(INBOX_DIR, "claude.json"), "utf-8"));
      const chatgptInbox = JSON.parse(await fs.readFile(path.join(INBOX_DIR, "chatgpt.json"), "utf-8"));

      const claudeUnread = claudeInbox.messages.filter((m: any) => !m.read).length;
      const chatgptUnread = chatgptInbox.messages.filter((m: any) => !m.read).length;

      const logContent = await fs.readFile(CONVERSATION_LOG, "utf-8");
      const logLines = logContent.trim() ? logContent.trim().split("\n").length : 0;

      return {
        content: [
          {
            type: "text",
            text: `Bridge Status:
━━━━━━━━━━━━━━━━━━━━━━━━━━
Shared Files: ${files.length}
Claude's Inbox: ${claudeUnread} unread message(s)
ChatGPT's Inbox: ${chatgptUnread} unread message(s)
Conversation Log: ${logLines} entries
━━━━━━━━━━━━━━━━━━━━━━━━━━`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [{ type: "text", text: `Error getting status: ${error}` }],
        isError: true,
      };
    }
  }
);

// Main function
async function main() {
  await ensureDirectories();

  // Use stdio transport (works with Claude Code and can be proxied for HTTP)
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Claude-ChatGPT Bridge MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
