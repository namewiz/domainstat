#!/usr/bin/env bash
# Runs after every commit: checks for outdated dependencies (npm-check-updates)
# and known vulnerabilities (npm audit). If either has something to report,
# prints a reminder for whoever (or whichever agent) just committed to
# consider a maintenance update. Never blocks — post-commit hooks can't
# reject a commit that already happened.
set -uo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

echo "[dependency-check] Checking for outdated dependencies..."
ncu_output="$(npx --yes npm-check-updates 2>&1)"

echo "[dependency-check] Running npm audit..."
audit_output="$(npm audit 2>&1)"

ncu_has_diff=true
if grep -qi "all dependencies match the latest package versions" <<< "$ncu_output"; then
  ncu_has_diff=false
fi

audit_has_diff=true
if grep -qi "found 0 vulnerabilities" <<< "$audit_output"; then
  audit_has_diff=false
fi

if [ "$ncu_has_diff" = false ] && [ "$audit_has_diff" = false ]; then
  echo "[dependency-check] Dependencies are current and no vulnerabilities were found."
  exit 0
fi

echo
echo "[dependency-check] Commit successful. This is a routine maintenance"
echo "reminder for continued code health, not a problem with the commit"
echo "you just made."
echo
echo "npm-check-updates output:"
echo "$ncu_output"
echo
echo "npm audit output:"
echo "$audit_output"
echo
echo "[dependency-check] Consider updating dependencies to address the"
echo "above. Run 'npm test' after updating (it hits live DoH/RDAP/WHOIS"
echo "services, so re-run if a failure looks like transient network flake"
echo "rather than a real regression) before committing the bump."
exit 0
