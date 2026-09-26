# Decision journal — guide

This is the guide to **whytho**, a Claude Code plugin. If you're coming back to it after a
while and don't remember what it's for, start with "Why this exists". The plugin ships this
guide and the hooks, and its SessionStart hook injects the rule (`rule.md`) into context.
The only per-project file is the journal itself, `docs/decisions.md`.

---

## 1. Why this exists

**The problem.** Development follows a process: brainstorm → spec → plan → implementation →
automated tests → live acceptance testing. But the logic or design often changes during live
acceptance, and nobody updates the spec and plan afterwards. The documentation falls behind
the code, and decisions made during the brainstorm are **silently forgotten or reverted**.

**A typical case.** During design, the team decides that invoice totals are rounded
half-to-even, because that's how the bank settles payments and totals must match to the
cent. Weeks later, during acceptance, one total looks a cent off against a hand
calculation, and the agent "fixes" it by switching to half-up, **without checking the
original decision and its reason**. That's the disease: a symptom gets treated by reverting
a deliberate decision.

**Why not just keep the spec up to date.** Keeping the whole spec current through every
change is a losing battle. It has too much friction and is the first thing dropped under
deadline. The part that actually gets lost is small: the *reason* behind each decision.
That's the only thing this plugin asks you to write down, and it makes sure you do.

## 2. The key idea: separate "what" from "why"

| Question | Where it lives | Who maintains it |
| --- | --- | --- |
| **What is in the code / how it works** | the code itself (or a code-graph tool such as Graphify, if you use one) | derived from the code |
| **Why it was decided this way** | `docs/decisions.md` | written by hand, a few lines per decision |

The *what/how* can be read from the code by tools and can't go stale. The *why* **can't**
be read from the code, so it's the only thing that has to be kept by hand. That's why the
journal stays small: decisions with their reasons, not a retelling of the code.

## 3. How it works: three layers of enforcement

1. **The rule, injected by the plugin's SessionStart hook.** `inject-rule.cjs` emits
   `rule.md` as `additionalContext` every session, including after `/clear` and
   compaction. The rule says a design phase ends by recording its decisions in
   `docs/decisions.md`, and a decision's ID goes into the commit message.
2. **PreToolUse hook** (`decisions-guard.cjs`). You edit a file in the "Area" of an active
   decision → the hook injects the decision and its "why". It fires at the moment of the
   edit and catches a silent **revert**.
3. **Stop hook** (`decisions-guard.cjs`). A file in an "Area" changed, but
   `docs/decisions.md` wasn't touched → the turn can't end. It blocks once, guarded by
   `stop_hook_active`. This catches silent **non-recording**.

The hooks are **silent** if the project has no journal (they exit immediately), so it's
safe to keep them enabled in every project.

## 4. Record format

The file is `docs/decisions.md`. The hook also finds `docs/superpowers/decisions.md`,
`decisions.md` and `DECISIONS.md`, walking up from the working directory. Newest entries go
on top. Each entry:

```text
## D-NN · Short decision title
- Status: active | SUPERSEDED by D-MM (date) | deprecated
- Area: path/to/file.py, other/file.py        ← the hooks key off this
- Decision: what exactly was decided (1–3 lines).
- Why: the reason. It can't be recovered from the code, which is why it's written down.
- Rejected: which alternatives were considered and why they lost.
```

**"Area" is written as paths from the repo root.** The hook anchors the match at the root:
a file is under an area only if it equals the area or lies **inside** it (`scripts/` covers
`scripts/verify.py`, but not `.claude/scripts/tool.py`). There's no substring or file-name
matching, because a same-named nested directory would cause false blocks. `Areas:` and
`Files:` are accepted as labels too, and labels may be wrapped in markdown emphasis
(`**Status:**`). Labels and status markers are read in English only; the rest of an entry
can be written in any language.

**The supersede rule (the most important one):** an old entry is **never edited or
deleted**. Add a new entry on top with `Status: active · supersedes D-NN`, and change only
the old one's status to `SUPERSEDED by D-MM (date)`. That way you can always see both what
changed and why it was once decided differently.

A decision dropped without a replacement gets `Status: deprecated`. Only a status that
*starts* with `SUPERSEDED` or `deprecated` retires an entry. Anything else counts as active,
so `active · supersedes D-NN` stays in force.

**ID in the commit:** a commit that touches a decision mentions its ID in the message, as in
`… (D-04)`. Then `git log --grep D-04` collects every commit for that decision, and there's
no need to keep hashes in the journal.

## 5. When to add an entry

- **A new decision** comes out of a brainstorm or spec. It goes into the journal as a step
  of that phase (the rule from `rule.md`), and the brainstorm isn't finished until the
  decision is recorded.
- **A change or revert** comes out of live acceptance. It becomes a new entry that
  supersedes the old one, and the Stop hook won't let you forget if a file in the "Area"
  was touched.

## 6. Limits, so there's no false sense of safety

- The hooks only see decisions that have an **"Area"**. The format is the foundation and
  the hooks are the teeth on top. No "Area" means no protection.
- The PreToolUse hook **can't tell** a refactor from a revert. It only **shows** the
  decision, and acting on it deliberately is up to the agent.
- A **purely verbal** decision that never became a spec or code can't be caught by the
  hooks. The rule in `rule.md` covers it, and it's enforced hard only once it becomes a
  file.
- The Stop hook strictly guards **changed code in an "Area"**, which is a precise signal
  with few false positives. New decisions rely on the rule rather than on blocking over
  spec/plan files, so it doesn't nag about every uncommitted note in `plans/`.
- The Stop hook needs a git repository because it reads `git status`. Without git it stays
  silent. PreToolUse still works there, with looser path matching.

## 7. New project

**Nothing to do.** Once the plugin is installed, the rule and the hooks work everywhere.
The first decision in a brainstorm creates `docs/decisions.md`, and from then on the hooks
guard it. To retrofit an existing project, create `docs/decisions.md` in this format once.

## 8. Installing the plugin

```text
/plugin marketplace add zhiharevds/whytho
/plugin install whytho@whytho
```

The hooks are picked up automatically from `hooks/hooks.json`. Their paths go through
`${CLAUDE_PLUGIN_ROOT}`, so they don't depend on the machine.
