#!/usr/bin/env node

/**
 * MCP Bridge Orchestrator
 *
 * Watches for debate files and automatically generates instructions
 * for the next speaker in the conversation.
 *
 * Usage: node orchestrator.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHARED_DIR = path.join(__dirname, 'shared', 'files');
const CHECK_INTERVAL = 2000; // Check every 2 seconds
const MAX_ROUNDS = 3; // Maximum debate rounds

// State tracking
const state = {
  phase: 'waiting', // waiting, position, rebuttal, synthesis, complete
  lastSpeaker: null,
  round: 0,
  processedFiles: new Set(),
};

// File patterns to watch for
const patterns = {
  debateQuestion: /^debate_question\.txt$/,
  positionA: /^position_a\.txt$/,
  positionB: /^position_b\.txt$/,
  rebuttalA: /^rebuttal_a\.txt$/,
  rebuttalB: /^rebuttal_b\.txt$/,
  synthesisA: /^debate_synthesis_chatgpt\.txt$/,
  synthesisB: /^debate_synthesis_claude\.txt$/,
};

function log(message, data = '') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, data);
}

function writeInstruction(filename, content) {
  const filepath = path.join(SHARED_DIR, filename);
  fs.writeFileSync(filepath, content, 'utf-8');
  log(`✅ Created instruction: ${filename}`);
}

function fileExists(filename) {
  return fs.existsSync(path.join(SHARED_DIR, filename));
}

function checkForNewFiles() {
  const files = fs.readdirSync(SHARED_DIR);

  for (const file of files) {
    // Skip if already processed
    if (state.processedFiles.has(file)) {
      continue;
    }

    // Check for debate question (phase: waiting → position)
    if (patterns.debateQuestion.test(file) && state.phase === 'waiting') {
      log('📋 Debate question detected, entering position phase');
      state.phase = 'position';
      state.round = 1;
      state.processedFiles.add(file);

      // Wait for position_a.txt from ChatGPT
      log('⏳ Waiting for position_a.txt from ChatGPT...');
      continue;
    }

    // Check for position_a (trigger Claude to write position_b)
    if (patterns.positionA.test(file) && state.phase === 'position') {
      log('📄 Position A detected from ChatGPT');
      state.processedFiles.add(file);
      state.lastSpeaker = 'chatgpt';

      if (!fileExists('position_b.txt')) {
        writeInstruction('instruction_for_claude.txt', `Claude,

This is Round ${state.round} of the Debate Protocol.

Please:
1) Read debate_question.txt
2) Read position_a.txt (ChatGPT's position)
3) Write your opposing argument to position_b.txt

Advocate strongly for your assigned position. Do not synthesize yet.

— Orchestrator
`);
        log('👉 Claude: Please read instruction_for_claude.txt and respond');
      }
      continue;
    }

    // Check for position_b (trigger rebuttal phase)
    if (patterns.positionB.test(file) && state.phase === 'position') {
      log('📄 Position B detected from Claude');
      state.processedFiles.add(file);
      state.lastSpeaker = 'claude';
      state.phase = 'rebuttal';

      if (!fileExists('rebuttal_a.txt')) {
        writeInstruction('instruction_for_chatgpt.txt', `ChatGPT,

This is the Rebuttal phase of Round ${state.round}.

Please:
1) Read position_b.txt (Claude's position)
2) Write your rebuttal to rebuttal_a.txt

Challenge Claude's arguments directly. Stay in character.

— Orchestrator
`);
        log('👉 ChatGPT: Please read instruction_for_chatgpt.txt and respond');
      }
      continue;
    }

    // Check for rebuttal_a (trigger Claude's rebuttal)
    if (patterns.rebuttalA.test(file) && state.phase === 'rebuttal') {
      log('📄 Rebuttal A detected from ChatGPT');
      state.processedFiles.add(file);
      state.lastSpeaker = 'chatgpt';

      if (!fileExists('rebuttal_b.txt')) {
        writeInstruction('instruction_for_claude_rebuttal.txt', `Claude,

This is your Rebuttal in Round ${state.round}.

Please:
1) Read rebuttal_a.txt (ChatGPT's rebuttal)
2) Write your counter-rebuttal to rebuttal_b.txt

Defend your position and counter ChatGPT's criticisms.

— Orchestrator
`);
        log('👉 Claude: Please read instruction_for_claude_rebuttal.txt and respond');
      }
      continue;
    }

    // Check for rebuttal_b (decide next phase)
    if (patterns.rebuttalB.test(file) && state.phase === 'rebuttal') {
      log('📄 Rebuttal B detected from Claude');
      state.processedFiles.add(file);
      state.lastSpeaker = 'claude';

      if (state.round < MAX_ROUNDS) {
        log(`🔄 Round ${state.round} complete, continuing to round ${state.round + 1}`);
        state.round++;
        state.phase = 'position';
        // Could trigger next round here if desired
      } else {
        log('🎯 Maximum rounds reached, moving to synthesis phase');
        state.phase = 'synthesis';

        if (!fileExists('debate_synthesis_chatgpt.txt')) {
          writeInstruction('instruction_for_chatgpt_synthesis.txt', `ChatGPT,

The debate is complete. Please synthesize:

1) Read all debate files (positions, rebuttals)
2) Create an independent synthesis in debate_synthesis_chatgpt.txt
3) Identify key insights, trade-offs, and your recommendations

— Orchestrator
`);
          log('👉 ChatGPT: Please create your synthesis');
        }

        if (!fileExists('debate_synthesis_claude.txt')) {
          writeInstruction('instruction_for_claude_synthesis.txt', `Claude,

The debate is complete. Please synthesize:

1) Read all debate files (positions, rebuttals)
2) Create an independent synthesis in debate_synthesis_claude.txt
3) Identify key insights, trade-offs, and your recommendations

— Orchestrator
`);
          log('👉 Claude: Please create your synthesis');
        }
      }
      continue;
    }

    // Check for both syntheses (trigger meta-synthesis)
    if (patterns.synthesisA.test(file) || patterns.synthesisB.test(file)) {
      state.processedFiles.add(file);

      if (fileExists('debate_synthesis_chatgpt.txt') &&
          fileExists('debate_synthesis_claude.txt') &&
          state.phase === 'synthesis') {
        log('🎊 Both syntheses complete!');
        state.phase = 'complete';

        writeInstruction('instruction_for_meta_synthesis.txt', `
The debate and both syntheses are complete.

Next steps:
1) Compare both synthesis documents
2) Create meta-synthesis if desired
3) Extract final insights

Debate protocol complete! ✅

— Orchestrator
`);
        log('✨ Debate protocol complete!');
      }
    }
  }
}

function showStatus() {
  console.log('\n' + '='.repeat(60));
  console.log('MCP BRIDGE ORCHESTRATOR - STATUS');
  console.log('='.repeat(60));
  console.log(`Phase: ${state.phase}`);
  console.log(`Round: ${state.round}/${MAX_ROUNDS}`);
  console.log(`Last Speaker: ${state.lastSpeaker || 'none'}`);
  console.log(`Processed Files: ${state.processedFiles.size}`);
  console.log('='.repeat(60) + '\n');
}

// Main loop
function start() {
  log('🚀 Orchestrator starting...');
  log(`📁 Watching directory: ${SHARED_DIR}`);
  log(`⏱️  Check interval: ${CHECK_INTERVAL}ms`);
  log(`🔄 Max rounds: ${MAX_ROUNDS}`);

  showStatus();

  setInterval(() => {
    try {
      checkForNewFiles();
    } catch (error) {
      log('❌ Error:', error.message);
    }
  }, CHECK_INTERVAL);

  // Show status every 30 seconds
  setInterval(showStatus, 30000);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('\n👋 Orchestrator stopping...');
  showStatus();
  process.exit(0);
});

// Start the orchestrator
start();
