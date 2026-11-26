#!/bin/bash
# Build, then run every test in parallel (each has its own port) and print a short summary.
# Usage: tests/run-all.sh [test names without .mjs ...]   (default: all except perf and _scratch files)
# A failed test is rerun once alone; only the second result counts.
cd "$(dirname "$0")/.."
LOG=${TMPDIR:-/tmp}/kristole-tests
rm -rf "$LOG"; mkdir -p "$LOG"
npm run -s build > "$LOG/_build.log" 2>&1 || { echo "BUILD FAILED"; tail -20 "$LOG/_build.log"; exit 1; }
if [ $# -gt 0 ]; then names=("$@"); else
  names=(); for f in tests/*.mjs; do n=$(basename "$f" .mjs); case "$n" in perf|_*) ;; *) names+=("$n");; esac; done
fi
# at most 3 at a time: more browsers at once overload the GPU and the games lag (flaky checks)
export LOG
printf '%s\n' "${names[@]}" | xargs -P 3 -I{} sh -c 'node "tests/{}.mjs" > "$LOG/{}.log" 2>&1; echo $? > "$LOG/{}.code"'
failed() { [ "$(grep -c 'FAIL' "$LOG/$1.log")" -gt 0 ] || [ "$(cat "$LOG/$1.code")" != 0 ] || grep -q '^ERRORS' "$LOG/$1.log"; }
# a failed test gets one more run, alone (timing checks are flaky under load); the second result counts
for n in "${names[@]}"; do
  if failed "$n"; then mv "$LOG/$n.log" "$LOG/$n.first.log"; node "tests/$n.mjs" > "$LOG/$n.log" 2>&1; echo $? > "$LOG/$n.code"; echo "↻ $n rerun alone"; fi
done
bad=0
for n in "${names[@]}"; do
  p=$(grep -c '^PASS' "$LOG/$n.log"); f=$(grep -c 'FAIL' "$LOG/$n.log")
  code=$(cat "$LOG/$n.code")
  # a test fails on a FAIL line, an ERRORS report (page errors) or a non-zero exit
  if failed "$n"; then bad=1; echo "✗ $n  pass=$p fail=$f"; grep -m5 'FAIL\|ERRORS\|Error' "$LOG/$n.log" | sed 's/^/    /'; else echo "✓ $n  pass=$p"; fi
done
echo "logs: $LOG"
[ $bad = 0 ] && echo "ALL GREEN" || echo "SOME FAILED"
exit $bad
