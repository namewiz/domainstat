#!/usr/bin/env bash
# Blocks the commit when staged code-logic changes have no matching test file
# in the same commit. Silence per-commit with a `NO_TEST=<reason>` line in the
# commit message body.
set -euo pipefail

commit_msg_file="$1"

if grep -qE '^NO_TEST=.+' "$commit_msg_file"; then
  exit 0
fi

is_test_file() {
  [[ "$1" == tests/* || "$1" == *.test.* || "$1" == *.spec.* ]]
}

is_code_file() {
  [[ "$1" == *.ts || "$1" == *.tsx || "$1" == *.js || "$1" == *.jsx || "$1" == *.mjs || "$1" == *.cjs ]]
}

# Heuristic: a diff line counts as "logic" unless it's blank or a comment line.
has_logic_change() {
  git diff --cached -U0 -- "$1" \
    | grep -E '^[+-][^+-]' \
    | sed -E 's/^[+-]//' \
    | grep -vE '^\s*$|^\s*(//|/\*|\*/|\*)' \
    | grep -q .
}

staged_files=$(git diff --cached --name-only --diff-filter=ACMR)

has_test_file=false
has_logic_code_change=false
while IFS= read -r file; do
  [ -z "$file" ] && continue
  if is_test_file "$file"; then
    has_test_file=true
  elif is_code_file "$file" && has_logic_change "$file"; then
    has_logic_code_change=true
  fi
done <<< "$staged_files"

if [ "$has_logic_code_change" = true ] && [ "$has_test_file" = false ]; then
  echo
  echo "[test-reminder] Blocked: this commit changes code logic but no test file is staged."
  echo "  Add or update the applicable test file, or bypass by adding a line"
  echo "  'NO_TEST=<reason>' to the commit message body."
  exit 1
fi

exit 0
