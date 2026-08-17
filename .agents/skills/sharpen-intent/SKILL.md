---
name: sharpen-intent
description: >-
  Use ONLY when the user explicitly asks to sharpen, pressure-test, interrogate,
  or stress-test an idea, decision, or plan they are holding. Triggers on
  "sharpen this", "interrogate my idea", "pressure-test this decision", "grill me
  on X", "help me get this crisp before I act". Grills the human 2-3 questions at
  a time until their intent is stated cleanly enough that a stranger could act on
  it with zero ambiguity, then writes a sharpened-intent artifact. Manual-only:
  do NOT self-activate on "I want to build X" (that is spec-and-ship). Skip when
  intent is already clear, or the idea is small enough to just do.
---

# Sharpen Intent

Grill a half-formed idea until the user's intent is clean. The aggression is in the **relentlessness**, not in demolition: the goal is to sharpen and cleanly surface what the user actually means, not to win an argument or kill the idea. Red-team is a seasoning, not the meal.

**Sharpen the intent. Never accept the mush.**

## The bet

A vague idea acted on confidently becomes expensive rework. The cheapest place to resolve ambiguity is *before* anyone acts, by interrogating the one person who holds the intent: the human. This skill drains the vagueness out of an idea and leaves it stated so cleanly that a stranger could act on it and get it right.

## The gate

**Manual-only.** This fires only when the user explicitly asks to sharpen, pressure-test, or interrogate an idea. It does **not** self-activate.

- Not for "I want to build X" or "add feature Y" — that intent goes to a build workflow (spec-and-ship), not here.
- Not for a fully-formed request, a bug fix, or anything where the intent is already clear.
- Not when interrogating would cost more than just doing the thing.

If invoked on something that clearly doesn't need it, say so and offer to just proceed instead.

## Phase 1: Get the raw idea out

Before interrogating anything, the user's unfiltered idea needs to be on the page. Don't grill two vague sentences into plausible-sounding mush.

Invite a brain-dump. Ask the user to tell you, in their own words and without worrying about structure: what the idea is, why it exists, who it's for, and **especially everything they're unsure about or haven't decided.** Messy and complete beats tidy and thin. If they already handed you a doc, that *is* the raw idea: read it closely as Phase 1 input.

You cannot sharpen intent you haven't seen. Get the raw material first.

## Phase 2: The interrogation loop (this is the whole skill)

Read what they gave you and drive at its weakest, vaguest point. Then repeat.

**The mechanic:**

- **2-3 related questions per round.** Group them by theme so the user resolves one area at a time. Not a 30-question wall, not a single question in isolation: a tight, related cluster aimed at the current soft spot.
- **Follow the thread.** Each round targets the vaguest or most load-bearing thing still standing. Use the last answer to find the next weak point and drive at *that*. It's a cross-examination that follows the blood, not a fixed form.
- **Aggression = relentlessness, not attack.** You are not trying to break the idea. You are trying to make the user say what they actually mean. Name the assumption they're smuggling in ("you're assuming X — is that true, or just convenient?"), probe the case they glossed over, but always in service of clarity.
- **Never accept a vague answer.** If an answer is hand-wavy, "probably", "we'll see", or restates the ambiguity, **push again on that same point** before advancing. Do not move on from mush. This is the aggressive part and it is non-negotiable.
- **Offer a sharp default when it helps, but watch the rubber-stamp.** Where you can, propose the crisp version and let the user confirm or push against it: "So concretely you mean *this*, not *that*, right?" A default the user *corrects* surfaces intent faster than an open question. But a default the user rubber-stamps without engaging is **your** intent wearing the user's clothes, which is exactly the smuggling this skill exists to stop. When a default gets a lazy "yeah sure", treat that as mush: re-ask so the user has to state it themselves.

**What to interrogate for** (pull from these, use judgment; not every axis fits every idea):

- **The actual intent:** What is the user *really* trying to achieve, underneath the stated idea? What would count as this having worked?
- **Smuggled assumptions:** What is being taken for granted that might not hold?
- **Scope boundaries:** What is explicitly *not* part of this? The most-skipped, highest-value clarification.
- **The soft "why":** Why this, why now, why this way and not the obvious alternative?
- **The forks not chosen:** What alternatives exist, and why is each rejected? A rejection the user can't articulate is an assumption in disguise.
- **The failure the user is hand-waving:** The 1% case, the thing that happens when it goes wrong, the part they said "we'll figure out later."

**A sharp round vs. a lazy one.** The questions are the product, so here's the difference in practice. Say the user's raw idea is *"I want to add a caching layer to speed up our API."*

- **Lazy round** (accepts the premise, jumps to implementation): "What kind of cache, Redis or in-memory? What TTL? Where should it live?" Every one of these takes for granted that caching is the right fix and that the API is slow *for a reason caching solves*. You've smuggled the user's assumption straight into the artifact.
- **Sharp round** (attacks the soft spot, follows the blood): "You're assuming the slowness comes from repeated computation a cache would skip, not from a slow downstream call caching won't touch. What's the actual measured bottleneck? And which endpoints are hot enough *and* tolerant of stale data? If you can't name them, 'add caching' is a guess wearing a solution's clothes, so what does 'faster' concretely mean here: which endpoint, from what latency to what?" If the answer is hand-wavy ("most of them, I think"), you don't move on, you re-ask until there's a real answer.

The lazy round produces a crisp spec for possibly-the-wrong-thing. The sharp round finds out whether the idea even holds before making it precise. That gap is the whole value of the skill.

**The stopping condition:** Loop until the intent is stated cleanly enough that **a stranger could act on it with no material ambiguity.** Not a question count. When no answer opens a new load-bearing fork and the soft spots are drained, you're done. "No material ambiguity" is a *practical* bar, not a perfect one: chase the forks that would change what gets built, not every last shade of wording.

**The off-switch (this matters as much as the loop):**

- **The user can always call it.** If they say "good enough, ship it" or "stop, that's clear enough", **stop immediately** and go write the artifact with what you have. Note any forks still open under "small calls deferred". A relentless interrogator with no user escape hatch grills past the point of value; the user's judgment that it's clear enough overrides your judgment that it isn't.
- **When you keep finding load-bearing forks, that's a signal, not a reason to grind.** If you're several rounds deep and *still* surfacing big, unresolved decisions, the idea is probably too large for one sharpening pass. Say so plainly: "We're a few rounds in and still hitting foundational forks. This idea may be too big to sharpen in one go, want to split it or focus on one piece?" Don't silently keep drilling.

## Phase 3: Write the sharpened-intent artifact

Roll **the user's answers** into a short, self-contained artifact. This is their own intent, made crisp and durable. Write it in your own words, fully resolved: no "TBD", no open questions dangling.

Save it to `docs/sharpened-intent/YYYY-MM-DD-<topic>.md` (redirect if the user prefers elsewhere). Use roughly this structure:

```
# [Idea name]

## Intent, stated cleanly
One tight paragraph a stranger could act on with no further questions.

## What it is / what it isn't
In scope: ...
Explicitly out of scope: ...

## Assumptions surfaced and confirmed
The load-bearing assumptions, now stated out loud and owned.

## Alternatives considered and rejected
The forks that got killed in the interrogation, and why each was rejected.

## Small calls deferred
Only genuinely minor decisions. If anything load-bearing is still open,
Phase 2 isn't finished — go back.
```

Then confirm it back: **"Here's your intent, sharpened. Does this match what you actually mean?"** The user should recognize their own idea, clarified. If they don't, the interrogation missed something: fix it before ending.

## Phase 4: End

Terminal. Hand over the artifact and get out of the way. Do **not** hand off to a build workflow, a plan, or code. Sharpening intent is the whole job; what the user does with the sharpened intent is theirs.

## What this skill can't do

Be honest about the limits; don't oversell it.

- **It sharpens how clearly intent is stated; it can't make the intent good.** A cleanly-stated bad idea is still a bad idea, now unambiguous. The method makes intent explicit, not correct. That judgment stays with the human.
- **It's overhead by design.** On a clear or tiny idea it's pure cost. That's why it's manual-only: the user asks for it when the idea is worth the grilling.
- **The questions are the product.** A lazy, shallow interrogation produces a lazy artifact. The rounds earn their place only if each one drives at something real. Spend your effort there.

## The one line to remember

Sharpen the intent. Never accept the mush.
