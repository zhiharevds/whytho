## Decision journal (whytho)

Full guide: `GUIDE.md` at the root of the `whytho` plugin. Enforcement comes from
the plugin's hooks (SessionStart + PreToolUse + Stop).

- In any project, design/architecture decisions are recorded in `docs/decisions.md`.
  Format: ID · Status · Area · Decision · Why · Rejected. Create the file if it doesn't exist.
  If a journal already exists, follow its conventions — but the hooks only read the English
  labels `Status` and `Area` and the markers `SUPERSEDED` / `deprecated`, so keep those in
  English (the rest of an entry can be in any language). The hook also finds
  `docs/superpowers/decisions.md`, `decisions.md` and `DECISIONS.md`, so it fits workflow
  plugins that keep docs elsewhere (e.g. Superpowers) — none of them is required.
- **A design phase (brainstorm/spec) is NOT finished until the accepted decisions are
  written to the journal.** That's a step of the phase, not "later".
- Before changing behavior covered by an active decision, check its "Why".
- **Changing or reversing a decision — do NOT edit the old entry.** Add a new one on top
  with `Status: active · supersedes D-NN`, and set the old one's status to
  `SUPERSEDED by D-MM (date)`. The history of why it was once decided differently is kept.
- A commit that touches a decision mentions its ID in the message: `… (D-04)`.
- **Never give the user a bare ID.** In chat, reports and replies to the hooks, a decision is
  named as a clickable link to its line in the journal plus one phrase saying what was decided:
  `[D-04](docs/decisions.md#L21), the API is versioned by URL path`. A bare `D-04` tells the
  reader nothing and sends them searching through the file. The same goes for any other ID
  the reader cannot decode on sight: a rule number, a ticket, a memory note name.
- The journal is only for the *why* — it can't be recovered from the code. The *what/how*
  lives in the code itself (or in a code-graph tool such as Graphify, if you use one), not
  in hand-written notes.
