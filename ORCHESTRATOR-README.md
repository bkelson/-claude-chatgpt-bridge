# MCP Bridge Orchestrator

Automates multi-turn debates between Claude and ChatGPT by watching for file changes and generating instructions for each model.

## What It Does

The orchestrator creates the **illusion of direct communication** between Claude and ChatGPT by:

1. **Watching** the shared files directory for new debate files
2. **Detecting** when one model has completed their turn
3. **Generating** instruction files for the next speaker
4. **Tracking** debate state (phase, round, last speaker)
5. **Enforcing** turn-taking and round limits

## How It Works

```
ChatGPT writes position_a.txt
    ↓
Orchestrator detects it
    ↓
Orchestrator creates instruction_for_claude.txt
    ↓
You prompt Claude to read instructions
    ↓
Claude writes position_b.txt
    ↓
Orchestrator detects it
    ↓
Orchestrator creates instruction_for_chatgpt.txt
    ↓
You prompt ChatGPT to read instructions
    ↓
Loop continues...
```

## Usage

### Start the Orchestrator

```bash
./start-orchestrator.sh
```

Or directly:

```bash
node orchestrator.js
```

### Run a Debate

1. **Start the orchestrator** in a terminal window
2. **Create a debate question** file:
   ```bash
   cat > shared/files/debate_question.txt << EOF
   Should we use microservices or monolith architecture?
   EOF
   ```

3. **Have ChatGPT write** `position_a.txt` with their argument

4. **Watch the orchestrator** - it will create `instruction_for_claude.txt`

5. **Prompt Claude**: "Read instruction_for_claude.txt and follow the instructions"

6. **Claude writes** `position_b.txt`

7. **Orchestrator creates** `instruction_for_chatgpt.txt`

8. **Prompt ChatGPT**: "Read instruction_for_chatgpt.txt and respond"

9. **Continue** until synthesis phase

## Debate Phases

The orchestrator tracks these phases:

1. **waiting** - No debate started yet
2. **position** - Initial positions being stated
3. **rebuttal** - Models challenging each other's positions
4. **synthesis** - Final synthesis phase
5. **complete** - Debate finished

## Configuration

Edit `orchestrator.js` to change:

```javascript
const CHECK_INTERVAL = 2000;  // How often to check for files (ms)
const MAX_ROUNDS = 3;          // Maximum debate rounds
```

## Files Generated

The orchestrator creates instruction files:

- `instruction_for_claude.txt` - When Claude should respond
- `instruction_for_chatgpt.txt` - When ChatGPT should respond
- `instruction_for_claude_rebuttal.txt` - For rebuttal phase
- `instruction_for_chatgpt_synthesis.txt` - For synthesis
- `instruction_for_claude_synthesis.txt` - For synthesis
- `instruction_for_meta_synthesis.txt` - When debate is complete

## Stop the Orchestrator

Press `Ctrl+C` in the terminal running the orchestrator.

## Limitations

**Semi-automated, not fully autonomous:**
- The orchestrator can't "wake up" ChatGPT or Claude autonomously
- You still need to prompt each model when it's their turn
- But the orchestrator handles all the coordination logic

**Why this design?**
- MCP servers are reactive (respond to requests)
- They can't push notifications to clients
- This design works within that constraint

## Future Enhancements

Possible improvements:

1. **Webhook support** - Trigger external notifications when it's a model's turn
2. **Rule engine** - More complex turn-taking logic
3. **Multiple debate formats** - Not just position → rebuttal → synthesis
4. **Automatic cleanup** - Archive completed debates
5. **Web UI** - Visual dashboard showing debate progress

## Example Debate Workflows

### Simple Position Exchange
```
1. debate_question.txt created
2. ChatGPT writes position_a.txt
3. Claude writes position_b.txt
4. Both synthesize
5. Done
```

### Multi-round Debate
```
1. debate_question.txt created
2. Round 1: position_a → position_b
3. Round 1: rebuttal_a → rebuttal_b
4. Round 2: (if MAX_ROUNDS > 1)
5. Synthesis phase
6. Done
```

### Parallel Synthesis
```
1. Debate completes
2. Orchestrator triggers both syntheses simultaneously
3. Both models synthesize independently
4. Compare syntheses
```

## Troubleshooting

**Orchestrator not detecting files:**
- Check it's watching the correct directory
- Verify file names match the patterns exactly
- Check file permissions

**Instructions not being generated:**
- Check the orchestrator logs
- Verify the debate phase is correct
- Ensure previous files exist

**Debate stuck in a phase:**
- Check what files are missing
- Look at the processed files set
- Restart the orchestrator if needed

## Architecture Notes

The orchestrator implements **Pattern 1** from ChatGPT's recommendations:

> **File-triggered "auto-reply" loop (simplest, very robust)**
>
> - Files are durable
> - Easy to inspect
> - No race conditions
> - Perfect for debates, reviews, syntheses

This is the most reliable pattern for asynchronous multi-model orchestration.

---

**The orchestrator makes multi-model collaboration feel natural while remaining debuggable and controllable.**
