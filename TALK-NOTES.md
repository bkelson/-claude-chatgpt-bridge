# Building a Bridge Between AI Models: A Journey Through OAuth, Debugging, and Humility

**Talk for Claude Code Meetup**
*A story about what happens when ambition meets reality (and why that's a good thing)*

---

## Opening: The Idea That Seemed Simple

You know that feeling when you have what seems like a straightforward idea? "I'll just connect Claude and ChatGPT so they can talk to each other. How hard could it be?"

That was me, two days ago.

I had built an MCP server that worked beautifully locally. The tools were solid. The architecture made sense. All I needed to do was add OAuth authentication so ChatGPT could securely access it over the internet.

Narrator voice: *It was not simple.*

What followed was a masterclass in why production software is different from working software, why security is hard, and why the willingness to fail publicly is actually a superpower.

---

## What I Was Trying to Build

The vision was clean:
- An MCP server exposing tools for Claude-ChatGPT communication
- Shared message queues (inboxes for each model)
- File sharing capabilities
- Conversation logging

Protected by OAuth 2.0 because, you know, security matters when you're exposing your local machine to the internet.

I had done OAuth integrations before. I understood the flow. I had the documentation open. This should have taken maybe an hour.

**It took two full days.**

And honestly? I'm glad it did.

---

## The First Wall: "This Worked Yesterday"

My initial MCP server worked perfectly when ChatGPT connected directly via localhost. Clean, fast, simple.

Then I added OAuth. And suddenly... nothing worked.

**The symptom:** ChatGPT would hit the server, get a 401, and just... give up. No OAuth prompt. No error message. Just silent failure.

**My first thought:** "I must have misconfigured something obvious."

**Reality:** I had misconfigured *everything*, but none of it was obvious.

This is where Claude Code became less of a tool and more of a thinking partner. Instead of me staring at error logs alone, we started methodically working through the stack.

---

## Lesson 1: The OAuth Metadata Rabbit Hole

Here's what I learned the hard way: OAuth isn't just about "add a login screen."

It's a negotiation between three parties:
1. ChatGPT (the client)
2. Auth0 (the authorization server)
3. My MCP server (the resource server)

And they all need to agree on a *lot* of things:
- Who's allowed to request tokens?
- What resources are they requesting access to?
- Which scopes/permissions are valid?
- Where should callbacks go?

I had configured each piece independently, and they were all *technically* correct. But they weren't correct *together*.

**The specific issue:**
My OAuth metadata endpoint was telling ChatGPT: "Request access to `https://my-ngrok-url.com`"

But Auth0 was configured to issue tokens for: `https://claude-chatgpt-bridge`

ChatGPT would send the request with the ngrok URL as the resource identifier, and Auth0 would respond: "I don't know what that is. Request denied."

**The fix:** One line of code. Change the resource field from the dynamic tunnel URL to the stable API identifier.

**The lesson:** OAuth is a protocol built on *exact agreement*. Off by one character? Failure. Wrong URL scheme? Failure. Cached metadata? Failure.

---

## Lesson 2: Authorization vs Authentication (They're Not The Same)

At one point, everything *looked* configured correctly. The OAuth flow would complete. ChatGPT would get a token. But then:

```
Error: Client "abc123" is not authorized to access resource server "https://claude-chatgpt-bridge"
```

Wait, what?

Turns out, in Auth0, you have to explicitly authorize an application to access an API. And not just once - you have to authorize it for *both* user access AND client access. With the correct scopes. For each.

I had checked one box and thought I was done.

**The realization:** Authentication proves *who you are*. Authorization proves *what you're allowed to do*. OAuth handles both, but in different places, at different times, with different configurations.

This is the kind of thing that seems obvious in retrospect, but when you're three hours into debugging and your sixth attempt just failed with the exact same error message... it's not obvious at all.

---

## Lesson 3: Token Validation is a Spectrum

My first implementation used Auth0's `/userinfo` endpoint to validate tokens. The docs said it worked. My tests passed locally. Ship it, right?

Except Auth0 was returning JWT access tokens, not the opaque tokens I expected. And `/userinfo` doesn't validate access tokens - it validates ID tokens.

Every single request from ChatGPT was getting rejected with a cryptic 401 error.

**The debugging process:**
1. Add logging to see the token
2. Decode the JWT manually to see the claims
3. Realize the token structure was different than expected
4. Research how to validate JWT access tokens properly
5. Implement claim-based validation (issuer, audience, expiration)
6. Test again
7. Success!

**The lesson:** There isn't one "right" way to validate tokens. The approach depends on *what kind of token you're getting*. And that depends on how you configured OAuth, which depends on which grant type is being used, which depends on...

It's turtles all the way down.

---

## Lesson 4: Free Tiers Have Hidden Costs

I started with ngrok's free tier. It worked great in testing. But when ChatGPT tried to use it in production, it hit ngrok's interstitial warning page:

> "You are about to visit [URL]. This tunnel serves content from a ngrok user. Click 'Visit Site' to continue."

Great for security. Terrible for automated OAuth flows.

ChatGPT couldn't click the button. The OAuth flow would fail. I'd get no error message, just... nothing.

**The fix:** Switch to Cloudflare Tunnel, which doesn't have an interstitial page.

**The lesson:** Free tiers are amazing for learning and testing. But in production (even "production" on your laptop), you need to understand what compromises you're making. Sometimes the compromise is an interstitial page. Sometimes it's rate limits. Sometimes it's URLs that change on every restart.

All of these are solvable problems - *if you know they exist*.

---

## What Actually Worked (The Successes)

Not everything was a struggle. Some things worked beautifully:

**1. Claude Code as a debugging partner**
Instead of me searching docs and Stack Overflow alone, Claude Code would:
- Read error logs and suggest hypotheses
- Check configuration files against documentation
- Spot inconsistencies I'd missed (like http vs https)
- Propose fixes and explain why they should work

This wasn't magic - it was collaboration. But having a tireless partner who could read 50 lines of Auth0 documentation while I tested a theory? Invaluable.

**2. Systematic debugging over random fixes**
Every time we hit a wall, Claude Code pushed for:
- "Let's check the logs first"
- "Let's verify each endpoint manually"
- "Let's confirm the token format before implementing validation"

This slowed me down initially. But it meant when we found the issue, we *understood* it. No cargo-cult fixes. No "it works but I don't know why."

**3. Documentation as we went**
Claude Code insisted on documenting each fix. At the time, it felt like overhead. But when I hit the *next* issue, having clean notes on what we'd already tried was a lifesaver.

And now? I have a complete setup guide that someone else can follow without experiencing any of my pain. That's a win.

---

## The Moment It Worked

After two days of OAuth errors, token validation failures, and mysterious 401s, I finally got this message in ChatGPT:

```
✅ Bridge status received successfully.

Shared Files: 1
Claude's Inbox: 1 unread message(s)
ChatGPT's Inbox: 1 unread message(s)
Conversation Log: 1 entries
```

That dopamine hit was *real*.

But more importantly: I understood *why* it worked. Every fix we had made. Every configuration change. I could explain each one.

That understanding is worth more than the working code.

---

## What I'd Do Differently

**Start with security, not add it later**
I built the MCP server first, then tried to add OAuth. This meant retrofitting security instead of designing for it. Next time: security architecture first, features second.

**Use Auth0's logs from day one**
I spent hours guessing what was wrong before I realized Auth0 logs showed me *exact* error messages. "Client not authorized to access resource server" was right there, with timestamps and request details. I just had to look.

**Test the OAuth flow independently**
I kept testing through ChatGPT, which made debugging slow (reconnect, wait, check logs, repeat). I should have tested the OAuth flow with curl first. Get it working in isolation, *then* integrate with ChatGPT.

**Accept that free tiers have constraints**
I burned half a day fighting ngrok's behavior before switching to Cloudflare Tunnel. I should have recognized the interstitial page as a dealbreaker earlier and moved on.

---

## The Meta-Lesson: Embrace Public Failure

Here's the thing: I could have built this in private, figured it out through trial and error, and presented only the polished final result.

But that would rob you of the most valuable part: the *process*.

The mistakes I made? You'll probably make similar ones. The dead ends I hit? You'll hit them too. The "obvious in retrospect" realizations? They're only obvious *after* you've lived through the confusion.

By sharing the messy middle - the wrong turns, the frustrations, the "wait, I need to authorize BOTH user access AND client access?" moments - I'm giving you a map of the terrain I already explored.

You don't need to step in every pothole I did.

**And here's what makes this possible:** Working with Claude Code, everything was logged. Every hypothesis, every test, every fix. I'm not trying to remember what I did three days ago - I have a complete transcript.

That makes failure less scary. Because failure becomes *documented learning*.

---

## Practical Takeaways

If you're building something with OAuth, MCP, or really any complex integration:

**1. Trust the logs more than your assumptions**
Your mental model is probably wrong. The logs know what actually happened.

**2. Build incrementally and test constantly**
Get OAuth working without MCP. Get MCP working without OAuth. Then combine them.

**3. Document as you go, not at the end**
Future you will thank present you. And your team/community will thank you even more.

**4. Use AI tools as thinking partners, not magic boxes**
Claude Code didn't solve my problems for me. It helped me think through them systematically. That's more valuable.

**5. Share your failures, not just your successes**
The community learns more from "here's what I tried that didn't work" than "here's my finished product."

---

## The Bigger Picture

I set out to build a bridge between AI models. What I actually built was:
- A deeper understanding of OAuth 2.0
- Appreciation for the subtlety of security protocols
- A reusable pattern for OAuth-protected MCP servers
- Complete documentation that others can learn from
- A story about the value of persistent debugging

The bridge works now. ChatGPT and Claude can exchange messages, share files, collaborate on tasks.

But the real value isn't the code. It's the *knowledge* of how to debug complex integrations, how to read error messages as puzzles rather than roadblocks, and how to build incrementally even when you're tempted to skip steps.

---

## Closing: The Invitation

I'm sharing all of this - the code, the mistakes, the lessons - because I believe we learn faster together.

My GitHub repo has three documents:
1. **SETUP-GUIDE.md** - The clean path (30-45 minutes to working system)
2. **RESUME-SESSION.md** - The technical reference
3. **This talk** - The messy journey

Use whichever serves you best.

And if you build something similar and hit walls I didn't document? Please, share those too. The next person will thank you.

Because that's how we all get better: not by hiding our struggles, but by turning them into stepping stones for others.

---

## Q&A Preparation

**Expected questions:**

**Q: "Would you recommend Auth0 for this use case?"**
A: Yes, but understand it's enterprise-grade OAuth with all the complexity that implies. For learning, it's great because you see the full OAuth protocol. For production, it's robust but requires careful configuration.

**Q: "Why not use a simpler auth approach?"**
A: I wanted to learn OAuth properly, and ChatGPT specifically requires OAuth for MCP servers. This was driven by the platform requirements, but it ended up being a great learning experience.

**Q: "How long did this actually take?"**
A: About 12-15 hours total over two days. If I did it again with current knowledge? Maybe 1-2 hours. That's the value of documented learning.

**Q: "What would you build next?"**
A: Role-based tools (Claude as "red team", ChatGPT as "synthesizer"), structured debate protocols, confidence scoring. The bridge is built - now comes the interesting orchestration layer.

**Q: "Is this production-ready?"**
A: For personal/learning use, absolutely. For business-critical use, you'd want: permanent URLs, JWT signature verification, rate limiting, monitoring, and proper secrets management. But it's a solid foundation.

---

**Final thought:**

Building in public means admitting you don't know everything. That's uncomfortable.

But it also means you learn faster, help others avoid your mistakes, and build credibility through authenticity rather than perfection.

I'll take that trade every time.

---

*Thank you.*

**Resources:**
- GitHub: [claude-chatgpt-bridge](https://github.com/bkelson/-claude-chatgpt-bridge)
- [SETUP-GUIDE.md](https://github.com/bkelson/-claude-chatgpt-bridge/blob/main/SETUP-GUIDE.md) - The clean path to a working system
- [RESUME-SESSION.md](https://github.com/bkelson/-claude-chatgpt-bridge/blob/main/RESUME-SESSION.md) - Technical reference
- [TALK-NOTES.md](https://github.com/bkelson/-claude-chatgpt-bridge/blob/main/TALK-NOTES.md) - This talk
- Happy to connect: [Contact info]
