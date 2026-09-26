#!/usr/bin/env node
/*
 * whytho — SessionStart hook.
 * Injects the decision journal rule into the model's context every session (startup|resume|
 * clear|compact) by emitting hookSpecificOutput.additionalContext. The rule text lives in
 * rule.md at the plugin root — you edit markdown, not code.
 * Fail-safe: any error -> silent exit 0 (nothing injected, the session is not affected).
 */
'use strict';
const fs = require('fs');
const path = require('path');

try {
  const rulePath = path.join(__dirname, '..', 'rule.md');
  const rule = fs.readFileSync(rulePath, 'utf8').trim();
  if (rule) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: rule,
      },
    }));
  }
} catch (e) { /* fail-safe: no context */ }
process.exit(0);
