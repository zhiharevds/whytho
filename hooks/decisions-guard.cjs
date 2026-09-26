#!/usr/bin/env node
/*
 * whytho guard — Claude Code hook (PreToolUse + Stop).
 * Guide: GUIDE.md at the root of this plugin.
 *
 * PreToolUse (Edit|Write|MultiEdit): if the file being edited is in the "Area" of an
 *   active decision — injects the decision as additionalContext (does not block).
 * Stop: if a file in a decision's "Area" changed in the working tree but the decision
 *   journal was NOT touched — blocks completion once (guarded by stop_hook_active).
 *
 * The journal is looked up as docs/decisions.md | docs/superpowers/decisions.md |
 * decisions.md | DECISIONS.md (walking up the tree). Fail-safe: any error -> exit 0 (allow).
 * Silent when there is no journal. Leaves other hooks alone.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const JOURNAL_CANDIDATES = [
  'docs/decisions.md', 'docs/superpowers/decisions.md', 'decisions.md', 'DECISIONS.md',
];

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch (e) { return ''; }
}
function norm(p) { return String(p).replace(/\\/g, '/').toLowerCase(); }

function findUp(startDir, rel) {
  let dir = startDir;
  for (let i = 0; i < 50; i++) {
    try { if (fs.existsSync(path.join(dir, rel))) return path.join(dir, rel); } catch (e) {}
    const parent = path.dirname(dir);
    if (!parent || parent === dir) break;
    dir = parent;
  }
  return null;
}
function findJournal(startDir) {
  for (const rel of JOURNAL_CANDIDATES) {
    const p = findUp(startDir, rel);
    if (p) return p;
  }
  return null;
}
function repoRoot(fromDir) {
  try {
    return execSync('git rev-parse --show-toplevel', { cwd: fromDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (e) { return null; }
}

// Extracts the value of a "- Label: value" field from a journal line. Labels are often
// written with markdown emphasis ("**Status:**", "**Status**:", "__Area__:"), so emphasis
// (* _) and backticks are stripped ONLY in the part before the colon (the label itself).
// The value is not touched character by character: paths and function names may contain
// _ and *. names — accepted label names, lowercase. Returns the value as a string, or null
// if the line is not such a field.
function fieldValue(line, names) {
  const t = line.replace(/^\s*[-*+]\s+/, ''); // strip the list marker ("- ", "* ", "+ ")
  const colon = t.indexOf(':');
  if (colon < 0) return null;
  const label = t.slice(0, colon).replace(/[*_`\s]/g, '').toLowerCase();
  if (!names.includes(label)) return null;
  return t.slice(colon + 1).replace(/^[*_\s]+/, '').replace(/[*_\s]+$/, '');
}

// journal -> [{title, status, areas:[...]}]
function parseDecisions(text) {
  const out = [];
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^##\s+(.+?)\s*$/);
    if (h) { if (cur) out.push(cur); cur = { title: h[1].trim(), status: '', areas: [] }; continue; }
    if (!cur) continue;
    const st = fieldValue(line, ['status']);
    if (st !== null) cur.status = st.trim();
    const ar = fieldValue(line, ['area', 'areas', 'files']);
    if (ar !== null) cur.areas = ar.split(/[,;]/).map(x => x.trim().replace(/`/g, '')).filter(Boolean);
  }
  if (cur) out.push(cur);
  return out;
}
function isActive(status) {
  // Activity is decided by the LEADING status marker (before the first "·"), not by any
  // mention of "supersede/revoke" in the line. Otherwise an active entry that says
  // "supersedes D-NN" (it replaces an older one but is itself in force) would be misread
  // as inactive and lose its teeth. An entry is inactive only if its status STARTS with a
  // retirement marker.
  const head = String(status || '').split('·')[0].replace(/^[\s*_]+/, '');
  return !/^(?:superseded|deprecated)/i.test(head);
}
// From an "Area" token keep only the path: everything before the first space or "(".
// Drops function lists and notes like "file.py (func1, func2 - ...)".
function areaToken(a) {
  return norm(String(a).split(/[\s(]/)[0]).replace(/\/+$/, '');
}

// Primary matcher: the file path is REPO-RELATIVE and "Area" is written from the repo root
// too, so matching is ANCHORED AT THE ROOT: the file either is the area or lies inside it.
// There are deliberately NO substring ("/scripts/" anywhere in the path), suffix or basename
// heuristics here: they caused false positives on same-named nested directories — an
// untracked tooling directory `.claude/scripts/` matched area `scripts/` and blocked every turn.
function matchAreaRel(relFile, areas) {
  const f = norm(relFile).replace(/^\.\//, '').replace(/\/+$/, '');
  if (!f || f === '..' || f.startsWith('../')) return false; // outside the repo — not ours
  return areas.some(a => {
    const an = areaToken(a);
    if (!an) return false;
    return f === an || f.startsWith(an + '/');
  });
}

// Fallback matcher: only when there is no git root and a repo-relative path can't be built.
// Lenient (as before the anchoring rule) — better to show the "why" once too often than to
// stay silent.
function matchAreaLoose(file, areas) {
  const f = norm(file);
  return areas.some(a => {
    const an = areaToken(a);
    if (!an) return false;
    return f === an                            // exact path match
      || f.endsWith('/' + an)                  // an is the tail of the path (a specific file)
      || f.includes('/' + an + '/')            // an is an area directory, the file lies inside
      || path.basename(f) === path.basename(an); // same file name
  });
}

// Parses `git status --porcelain -z` -> flat list of repo-relative paths.
// -z specifically, not plain porcelain: (1) plain format reports a rename as a single line
// "R  old -> new", which the anchored matcher can't parse — renaming a file in an "Area"
// went through unnoticed; with -z the original path comes as a SEPARATE field right after
// the new one. (2) Plain porcelain quotes and escapes non-ASCII paths (`"docs/\320\222..."`),
// so paths with non-Latin letters slipped past the matcher too; -z returns them as-is.
// BOTH paths of a rename count: moving a file out of an "Area" is as much a change under
// the decision as moving one in.
function parsePorcelainZ(out) {
  const parts = String(out).split('\0');
  const files = [];
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (!e) continue;
    const xy = e.slice(0, 2);
    const p = e.slice(3);
    if (p) files.push(p);
    if (/[RC]/.test(xy)) {                     // an R/C entry is followed by the original path
      const orig = parts[++i];
      if (orig) files.push(orig);
    }
  }
  return files;
}

function activeDecisions(journalPath) {
  return parseDecisions(fs.readFileSync(journalPath, 'utf8')).filter(d => isActive(d.status));
}

function main() {
  let input = {};
  try { input = JSON.parse(readStdin()); } catch (e) {}
  const event = input.hook_event_name || '';
  const cwd = input.cwd || process.cwd();

  if (event === 'PreToolUse') {
    const ti = input.tool_input || {};
    const fp = ti.file_path || ti.path;
    if (!fp) return;
    const abs = path.resolve(cwd, fp);
    const dj = findJournal(path.dirname(abs)) || findJournal(cwd);
    if (!dj) return;
    // The tool_input path is absolute — convert it to repo-relative and match with the same
    // anchored rule as Stop. Without a git root, the lenient fallback matcher is used.
    const root = repoRoot(path.dirname(dj));
    const hits = activeDecisions(dj).filter(d => root
      ? matchAreaRel(path.relative(root, abs), d.areas)
      : matchAreaLoose(fp, d.areas));
    if (!hits.length) return;
    const rel = norm(path.relative(cwd, dj)) || norm(dj);
    const list = hits.map(d => `• ${d.title}`).join('\n');
    const ctx = `⚠ Decision journal: this file is under an active decision:\n${list}\n` +
      `Check the "why" in ${rel}. If you are CHANGING behavior under this decision, add a new ` +
      `entry that supersedes the old one (don't edit the old one) and mention its ID in the commit.`;
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: ctx }
    }));
    return;
  }

  if (event === 'Stop') {
    if (input.stop_hook_active) return;        // continuing after a block — don't loop
    const dj = findJournal(cwd);
    if (!dj) return;
    const root = repoRoot(path.dirname(dj));
    if (!root) return;
    let changed = [];
    try {
      const out = execSync('git status --porcelain -z', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      changed = parsePorcelainZ(out);
    } catch (e) { return; }
    if (!changed.length) return;
    const djNorm = norm(dj);
    if (changed.some(f => norm(path.resolve(root, f)) === djNorm)) return; // journal touched — ok
    const decisions = activeDecisions(dj);
    // Paths from git status --porcelain are already repo-relative — match with the anchored rule.
    const hit = changed.find(f => decisions.some(d => matchAreaRel(f, d.areas)));
    if (!hit) return;
    const reason = `A file under an active decision changed (${hit}), but the decision journal ` +
      `was not updated. If a decision was made, changed or revoked — add a journal entry ` +
      `(a new one, or one that supersedes the old entry and links back to it). If no decision ` +
      `changed — say so explicitly in one sentence and finish.`;
    process.stdout.write(JSON.stringify({ decision: 'block', reason }));
    return;
  }
}

try { main(); } catch (e) { /* fail-safe: allow */ }
process.exit(0);
