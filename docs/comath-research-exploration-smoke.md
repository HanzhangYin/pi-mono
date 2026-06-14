# Co-Math Research Exploration Smoke

Run from a clean folder:

```bash
rm -rf /tmp/comath-research-demo
mkdir -p /tmp/comath-research-demo
cd /tmp/comath-research-demo
/home/hermes/developer/pi-mono-comath/pi-test.sh comath --approve
```

Then enter:

```text
Explore this problem:
Are there infinitely many primes of the form n^2 + 1?
```

Then:

```text
summarize current state
```

```text
focus on counterexamples
```

```text
drop the direct proof path
```

```text
try a weaker theorem
```

```text
continue
```

Success criteria:

```text
[ ] Pi creates multiple research paths.
[ ] User input is visible in the main Pi interface.
[ ] Product copy says path/research, not role-run/workstream/queue.
[ ] User can focus on counterexamples.
[ ] User can abandon a path.
[ ] User can ask for a summary.
[ ] Existing validation flow still works in a separate clean folder.
```

## Research path execution smoke

From the same clean folder, enter:

```text
Explore this problem: Are there infinitely many primes of the form n^2 + 1?
```

Then:

```text
continue path 1
```

```text
summarize current state
```

```text
continue path 2
```

```text
continue path 99
```

Good signs:

```text
[ ] Path 1 reports concrete n^2 + 1 examples.
[ ] Output says Research round completed.
[ ] Output includes Findings, Uncertainty, Next, and Working paper updated.
[ ] Summary includes compact latest findings.
[ ] Path 2 reports direct-proof attempt content, not path 1 examples.
[ ] Path 99 warns and does not update another path.
[ ] Product copy avoids role-run/workstream/queue/schema/artifact.
```
