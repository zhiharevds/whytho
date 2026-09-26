'use strict';
// Self-test for decisions-guard.cjs. Builds throwaway repos+journals, runs the
// scenarios, prints PASS/FAIL. Deletes its temp dirs. Run: node hooks/_selftest.cjs
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GUARD = path.join(__dirname, 'decisions-guard.cjs');
const tmpdirs = [];

// Builds a git repo with a journal and the given files, all committed (tracked).
// files: { 'rel/path': 'content' }. Untracked stuff is added by the caller AFTER.
function mkrepo(journal, files) {
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'djtest-'));
  tmpdirs.push(T);
  const put = (rel, body) => {
    const p = path.join(T, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  };
  put('docs/decisions.md', journal);
  for (const [rel, body] of Object.entries(files)) put(rel, body);
  const git = (a) => cp.execSync('git ' + a, { cwd: T, stdio: 'ignore' });
  git('init -q'); git('add -A'); git('-c user.email=t@t -c user.name=t commit -qm init');
  return T;
}

const run = (inp) => {
  try {
    const o = cp.execSync('node "' + GUARD + '"', { input: JSON.stringify(inp), encoding: 'utf8' }).trim();
    if (!o) return { kind: 'silent' };
    const j = JSON.parse(o);
    if (j.decision === 'block') return { kind: 'block', reason: j.reason };
    if (j.hookSpecificOutput) return { kind: 'inject', ctx: j.hookSpecificOutput.additionalContext };
    return { kind: 'other', raw: o };
  } catch (e) { return { kind: 'error', msg: (e.stderr || e.message || '').toString() }; }
};

const results = [];
// wantIn (optional): substring the block reason / injected context must contain — otherwise
// a "block happened" test also passes on a block caused by a NEIGHBORING file, checking nothing.
const check = (name, got, wantKind, wantIn) => {
  const body = got.reason || got.ctx || '';
  const ok = got.kind === wantKind && (!wantIn || body.includes(wantIn));
  results.push(ok);
  const why = got.kind === 'error' ? ' ' + got.msg.slice(0, 60)
    : (!ok && wantIn ? ` want "${wantIn}" in: ${body.slice(0, 80)}` : '');
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (got: ${got.kind}${why})`);
};

// --- Repo A: basic inject/block scenarios ---------------------------------------
// rounding.py must be TRACKED before we modify it — else git porcelain collapses a
// brand-new file into its untracked parent dir ("billing/") and area-matching misses.
const A = mkrepo(
  '## D-01 · Invoice rounding\n- Status: active\n- Area: billing/rounding.py\n' +
  '- Decision: round half-to-even.\n- Why: totals must match the bank settlement.\n',
  { 'billing/rounding.py': 'orig\n' });
const rounding = path.join(A, 'billing', 'rounding.py');
const other = path.join(A, 'billing', 'other.py');

check('T1 PreToolUse file UNDER decision -> inject', run({ hook_event_name: 'PreToolUse', cwd: A, tool_input: { file_path: rounding } }), 'inject');
check('T2 PreToolUse unrelated file      -> silent', run({ hook_event_name: 'PreToolUse', cwd: A, tool_input: { file_path: other } }), 'silent');

fs.writeFileSync(rounding, 'x=1\n'); // change file under decision, journal untouched
check('T3 Stop, journal untouched        -> block ', run({ hook_event_name: 'Stop', cwd: A }), 'block');
check('T4 Stop, stop_hook_active         -> silent', run({ hook_event_name: 'Stop', cwd: A, stop_hook_active: true }), 'silent');

fs.appendFileSync(path.join(A, 'docs', 'decisions.md'), '\n## D-02 · note\n'); // touch journal too
check('T5 Stop, journal also changed     -> silent', run({ hook_event_name: 'Stop', cwd: A }), 'silent');

// --- Repo B: anchored at the repo root ------------------------------------------
// Area "scripts/" is a path FROM THE ROOT. An untracked tooling dir `.claude/scripts/`
// (not under any decision) must not fall under it.
// `.claude/` is kept tracked, otherwise porcelain would collapse the whole dir into ".claude/"
// and there would be no substring overlap with "scripts/" at all — the test would be empty.
const B = mkrepo(
  '## D-10 · Release checks\n- Status: active\n- Area: `scripts/`, `scripts/check-release.py`\n' +
  '- Decision: release checks are scripted.\n- Why: manual checks are not reproducible.\n',
  { 'scripts/check-build.py': 'orig\n', '.claude/settings.json': '{}\n' });
const svc = path.join(B, 'scripts', 'check-build.py');
const tool = path.join(B, '.claude', 'scripts', 'tool.py');

fs.mkdirSync(path.dirname(tool), { recursive: true });
fs.writeFileSync(tool, 'tool\n'); // untracked -> porcelain reports "?? .claude/scripts/"
check('T6 Stop, untracked .claude/scripts/ vs area scripts/ -> silent', run({ hook_event_name: 'Stop', cwd: B }), 'silent');

fs.writeFileSync(svc, 'x=1\n'); // tracked file genuinely inside area scripts/
check('T7 Stop, scripts/check-build.py changed             -> block ', run({ hook_event_name: 'Stop', cwd: B }), 'block', 'scripts/check-build.py');

check('T8 PreToolUse inside area scripts/                  -> inject', run({ hook_event_name: 'PreToolUse', cwd: B, tool_input: { file_path: svc } }), 'inject');
check('T9 PreToolUse on .claude/scripts/ (outside area)    -> silent', run({ hook_event_name: 'PreToolUse', cwd: B, tool_input: { file_path: tool } }), 'silent');

// --- Repos C/E: renames across an "Area" ----------------------------------------
// Plain porcelain puts a rename on ONE line "R  old -> new", so the matcher gets a
// concatenation instead of a path. It caught a move OUT of an area by accident (the
// concatenation STARTS with the old path, so the anchor fired) and missed a move INTO an
// area entirely. With -z both paths arrive as separate fields, so both directions are
// tested. T10/T11 expect a CLEAN path in the text ("(path)"), otherwise the test would
// also pass on the arrow concatenation.
const RENAME_JOURNAL = '## D-10 · Release checks\n- Status: active\n- Area: `scripts/`\n' +
  '- Decision: release checks are scripted.\n- Why: manual checks are not reproducible.\n';
const C = mkrepo(RENAME_JOURNAL, { 'scripts/check-build.py': 'orig\n', 'tools/keep.txt': 'keep\n' });
cp.execSync('git mv scripts/check-build.py tools/check.py', { cwd: C, stdio: 'ignore' });
check('T10 Stop, file renamed OUT of the area          -> block ',
  run({ hook_event_name: 'Stop', cwd: C }), 'block', '(scripts/check-build.py)');

const E = mkrepo(RENAME_JOURNAL, { 'scripts/keep.py': 'keep\n', 'tools/helper.py': 'orig\n' });
cp.execSync('git mv tools/helper.py scripts/helper.py', { cwd: E, stdio: 'ignore' });
check('T11 Stop, file renamed INTO the area            -> block ',
  run({ hook_event_name: 'Stop', cwd: E }), 'block', '(scripts/helper.py)');

// --- Repo D: non-ASCII path -----------------------------------------------------
// Plain porcelain would return such a path quoted and escaped ('"docs/R\303\251sum\303\251/"')
// and the anchored matcher would miss it; -z returns the bytes as-is. The accented name is
// deliberate: without a non-ASCII character this test would check nothing.
const D = mkrepo(
  '## D-11 · Docs layout\n- Status: active\n- Area: `docs/`\n' +
  '- Decision: document versions live in docs/.\n- Why: next to the text they describe.\n',
  { 'docs/readme.md': 'ok\n' });
fs.mkdirSync(path.join(D, 'docs', 'Résumé'), { recursive: true });
fs.writeFileSync(path.join(D, 'docs', 'Résumé', 'v1.md'), 'v1\n'); // untracked, non-ASCII
check('T12 Stop, non-ASCII path under the area         -> block ',
  run({ hook_event_name: 'Stop', cwd: D }), 'block', 'Résumé');

// --- Repo F: status markers -----------------------------------------------------
// Only the LEADING status marker retires an entry: "active · supersedes D-20" stays active,
// while "SUPERSEDED by …" and "deprecated" are skipped.
const F = mkrepo(
  '## D-21 · Retries: exponential backoff\n- Status: active · supersedes D-20\n- Area: net/client.py\n' +
  '- Decision: exponential backoff.\n- Why: a fixed delay hammered the API during outages.\n\n' +
  '## D-20 · Retries: fixed delay\n- Status: SUPERSEDED by D-21 (2026-01-10)\n- Area: net/retry.py\n' +
  '- Decision: retry every 2s.\n- Why: simplest option.\n\n' +
  '## D-19 · Legacy transport\n- Status: deprecated\n- Area: net/legacy.py\n' +
  '- Decision: keep the old socket client.\n- Why: migration pending.\n',
  { 'net/client.py': 'c\n', 'net/retry.py': 'r\n', 'net/legacy.py': 'l\n' });
const pre = (rel) => run({ hook_event_name: 'PreToolUse', cwd: F, tool_input: { file_path: path.join(F, rel) } });
check('T13 PreToolUse, "active · supersedes" entry     -> inject', pre('net/client.py'), 'inject', 'D-21');
check('T14 PreToolUse, "SUPERSEDED by" entry           -> silent', pre('net/retry.py'), 'silent');
check('T15 PreToolUse, "deprecated" entry              -> silent', pre('net/legacy.py'), 'silent');

for (const d of tmpdirs) fs.rmSync(d, { recursive: true, force: true });
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
