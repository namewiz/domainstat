#!/usr/bin/env bash
# Reviews staged TypeScript/JS/package.json/README.md changes against
# .claude/review-guidelines.md using Claude Code.
# Exits 0 (pass, optionally with non-blocking notes) or 1 (block, with
# required fixes printed) so pre-commit can gate on it.
set -euo pipefail

reviewed_files="$(git diff --cached --name-only -- '*.ts' '*.tsx' '*.js' 'package.json' 'README.md')"
if [ -z "$reviewed_files" ]; then
  echo "[ai-review] No staged TypeScript/JS, package.json, or README.md changes; skipping."
  exit 0
fi

diff="$(git diff --cached -- '*.ts' '*.tsx' '*.js' 'package.json' 'README.md')"

prompt="Review the following staged git diff against the coding standard in
.claude/review-guidelines.md (read that file first). Only flag violations
of rules stated in that file — do not raise unrelated style opinions. The
diff may include package.json and README.md alongside TypeScript/JS files;
apply the 'General change-level guides' and public-API-stability rules to
those.

Output contract, followed exactly, with NOTHING before it (no preamble, no
explanation):
- Line 1 must be exactly 'REVIEW: PASS' or 'REVIEW: BLOCK', nothing else on
  it. This line alone is the gating decision and must be unambiguous.
- If BLOCK, follow with a short list of concrete fixes required before this
  commit can pass, one per line, each as
  'file:line - violated rule - fix to apply'.
- If PASS, optionally follow with a 'NOTES:' section listing anything worth
  the author's attention that does not block the commit — e.g. issues
  unrelated to this change, a README update worth considering, or a
  dependency worth reconsidering. One item per line, same
  'file:line - observation' format. Omit the NOTES section entirely if
  there's nothing to say.
- No other commentary, before or after."

timeout_cmd=""
if command -v timeout >/dev/null 2>&1; then
  timeout_cmd="timeout 180"
fi

output="$($timeout_cmd claude -p "$prompt" \
  --allowedTools "Read" \
  --permission-mode bypassPermissions \
  --model sonnet <<< "$diff")"

echo "$output"

if grep -qx "REVIEW: PASS" <<< "$output"; then
  exit 0
fi

echo
echo "[ai-review] Blocked. Apply the fixes above, then re-stage and commit."
exit 1
