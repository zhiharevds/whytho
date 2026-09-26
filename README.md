# whytho

> *but why, though?*

A Claude Code plugin that makes the agent keep a journal of architecture decisions and
enforces it with hooks. It catches the two ways decisions quietly die between the design
phase and acceptance testing:

- **silent revert**: a deliberate decision gets undone because nobody checked why it was made;
- **silent non-recording**: a new decision gets made and is never written down.

The journal holds only the *why*. The *what/how* is already in the code. The reasoning
isn't, and it's the most expensive thing to lose.

Full guide and rationale: [GUIDE.md](GUIDE.md).

## What's inside

| Layer | File | What it does |
| --- | --- | --- |
| Rule in context | `hooks/inject-rule.cjs` + `rule.md` | SessionStart injects the journal rule into every session (including after `/clear` and compaction) |
| Revert guard | `hooks/decisions-guard.cjs` (PreToolUse) | you edit a file under an active decision → it injects that decision's "why" |
| Forget guard | `hooks/decisions-guard.cjs` (Stop) | code under a decision changed but the journal wasn't touched → the turn can't end (blocks once) |

The hooks **stay silent** in projects without a journal, so the plugin is safe to enable
everywhere. Hook paths go through `${CLAUDE_PLUGIN_ROOT}`, with no machine-specific paths.

## Install

```text
/plugin marketplace add zhiharevds/whytho
/plugin install whytho@whytho
```

Requirements: Node.js (the hooks are plain `.cjs` scripts, no dependencies) and git (the
Stop hook reads `git status`).

## Record format

The journal is `docs/decisions.md`. `docs/superpowers/decisions.md`, `decisions.md` and
`DECISIONS.md` are found too, searching upward from the working directory. Newest entries
go on top:

```text
## D-NN · Short decision title
- Status: active | SUPERSEDED by D-MM (date) | deprecated
- Area: path/to/file.py, other/dir/        ← the hooks key off this
- Decision: what was decided (1–3 lines).
- Why: the reason. It can't be recovered from the code, which is why it's written down.
- Rejected: which alternatives were considered and why they lost.
```

- **Area** paths are relative to the repo root. A file is covered if it equals an area or
  lies inside it: `scripts/` covers `scripts/build.py`, but not `.claude/scripts/tool.py`.
- **Never edit an old entry.** To change or reverse a decision, add a new entry on top with
  `Status: active · supersedes D-NN`, and change only the old entry's status to
  `SUPERSEDED by D-MM (date)`.
- A commit that touches a decision mentions its ID, as in `… (D-04)`, so
  `git log --grep D-04` collects its history.
- The hooks read only the English labels (`Status`, `Area`) and status markers. The text of
  an entry can be in any language.

## Limits

- Only decisions with an **Area** are guarded. No area means no protection.
- PreToolUse can't tell a refactor from a revert. It only puts the decision in front of
  the agent.
- A decision that never became a file is covered by the rule alone, not by the hooks.

## Self-test

```text
node hooks/_selftest.cjs
```

Builds throwaway git repos, runs the guard through its scenarios and prints PASS/FAIL.

## License

[MIT](LICENSE) © zhiharevds
