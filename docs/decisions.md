# Decision journal — whytho

> *but why, though?* — a Claude Code plugin that makes the agent record **why** each
> decision was made, and won't let a design turn close until it does.

Record format: **ID · Status · Area · Decision · Why · Rejected**.
Never edit an old entry — add a new one on top marked "supersedes D-NN" and mark the old
one "SUPERSEDED".

---

## D-01 · active · Scope
**Decision:** The journal records ONLY the *why* behind decisions. The *what/how* of the code is documented elsewhere (e.g. a code graph), not here.
**Why:** Rationale cannot be recovered from the code later; mixing "what happened" with "why" bloats the log and buries the part that matters.
**Rejected:** General session/activity logs that record what the agent did.

## D-02 · active · Enforcement (the whole point)
**Decision:** A `Stop` hook gates turn completion — if code under a decision changed but the journal wasn't touched, the turn is blocked until a record is added.
**Why:** A design phase isn't finished until the accepted decisions are written down; voluntary logging gets skipped.
**Rejected:** Advisory-only reminders; templates the human maintains by hand.

## D-03 · active · Keeping the "why" in front of the agent
**Decision:** A `PreToolUse` hook injects a decision's "why" when a file under its area is edited; a `SessionStart` hook injects the ruleset each session.
**Why:** The rationale must be present at the moment the agent touches the affected code, not buried in a doc it won't open.
**Rejected:** —

## D-04 · active · Supersede discipline
**Decision:** Old records are never edited. Changing or reversing a decision means a NEW entry on top ("supersedes D-NN"); the old one is marked "SUPERSEDED", not deleted.
**Why:** Preserve the history of *why we once decided differently* — that context is the most expensive thing to lose.
**Rejected:** Editing records in place (destroys history).

## D-05 · active · Commit ↔ decision link
**Decision:** A commit that touches a decision must mention its ID in the message.
**Why:** Ties the code history back to the rationale that drove it.
**Rejected:** —

## D-06 · SUPERSEDED by D-10 (2026-09-26) · Bilingual parser
**Decision:** The guard parses both English and non-English field labels and supersede markers.
**Why:** Journals written in another language keep working unchanged after adopting the English release — no forced mass migration of existing records.
**Rejected:** Single-language parser (would force everyone to rewrite existing journals).

## D-07 · active · License
**Decision:** MIT.
**Why:** Matches the ecosystem norm; permissive, no friction for adopters.
**Rejected:** —

## D-08 · active · English status vocabulary
**Decision:** English entries use `active`, `SUPERSEDED by D-MM (date)` and `deprecated` as status markers; a superseding entry is `active · supersedes D-NN`.
**Why:** These are exactly the markers the guard's retirement check already recognizes, so the English docs work without touching the parser (D-06 stays intact). Covered by self-test T13–T15.
**Rejected:** `revoked` / `cancelled`: natural wording, but the guard would keep treating such entries as active unless the parser changed.

## D-09 · active · Distribution
**Decision:** The repo ships its own `marketplace.json` (marketplace `whytho`, owner `zhiharevds`). Install: `/plugin marketplace add zhiharevds/whytho` + `/plugin install whytho@whytho`. No listing in third-party marketplaces.
**Why:** A GitHub-hosted plugin needs a marketplace manifest to be installable at all; naming the marketplace after the plugin keeps the install command self-explanatory. Minimal release: repo + README.
**Rejected:** Keeping the original private marketplace/author handles (personal, meaningless to others).

## D-10 · active · supersedes D-06 · English-only parser
**Decision:** The guard reads only English labels (`Status`, `Area`/`Areas`/`Files`) and status markers (`SUPERSEDED`, `deprecated`). Existing non-English journals are migrated once by rewriting just those labels and markers; entry text and IDs stay as they are.
**Why:** The public code should carry no locale-specific leftovers. Before the first release nobody depends on a second vocabulary, so a one-time mechanical migration is cheaper than carrying it forever.
**Rejected:** Keeping the bilingual parser (D-06); moving extra labels into a user-level config file (more code and a config surface for one migration).
