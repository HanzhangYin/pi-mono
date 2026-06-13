# Co-Math Pi-Native Manual Smoke Test

This checks that `pi comath <source>` reads as a Pi-native assistant mode: clean product
copy, no extension/backend vocabulary in the normal path, and natural steering.

`/comath` remains an advanced/debug fallback. It still works, but it must not be
advertised in normal product output.

## Start

```bash
tmpdir=$(mktemp -d /tmp/comath-pi-native.XXXXXX)
cd "$tmpdir"
/home/hermes/developer/pi-mono-comath/pi-test.sh \
  comath /home/hermes/developer/pi-mono-comath/docs/2605.06651v2.pdf \
  --approve
```

Expected startup (Pi-native, no `Co-math research mode`):

```text
Pi is ready to help validate mathematical work.
Source: 2605.06651v2.pdf

Describe the problem you want to investigate.
```

## Interactive steps

Type these in order:

```text
help
Validate Question 3.
show progress
focus on the support indexing gap
show report
show uncertainty
```

## Expected checks

- `help` shows "Pi math validation help" and does **not** create
  `.pi/co-math/state.json`.
- Startup and help use Pi-native wording; no `/comath` advertising.
- Typing the problem prints the product plan and setup steps:
  - `I’ll set up a source-backed validation run for: Validate Question 3.`
  - `✓ Validation workspace prepared`
  - `✓ Source pinned: 2605.06651v2.pdf`
  - `✓ Validation plan created`
  - `✓ Definition and assumption audit prepared`
  - `✓ Support/indexing gap audit prepared`
  - `→ Running source audit in the background`
- Normal setup output does **not** include backend/internal phrases:
  - `Added co-math goal`
  - `Added co-math workstream`
  - `Initialized co-math project state`
  - `Queued co-math workstream`
  - `Started co-math role run`
  - `/comath`
- `show progress` prints a `Current progress` summary (transcript paths may appear;
  they are allowed as secondary detail).
- `focus on ...` answers `Focus noted: ...`.
- `show report` prints `Latest report` with status/summary/blockers in product wording.
- `show debug state` is the escape hatch: it may show run/report IDs and raw details.
- The source is structurally recorded in state (`artifacts` entry with
  `kind: "source"` and a `sourcePath`).
- 3 goals and 3 workstreams exist in state; the first audit run starts in background
  and a transcript file is created under `.pi/co-math/transcripts/`.
- A blocked result is acceptable when the source lacks the exact target statement;
  it should surface as a product-level event (e.g. `Source audit blocked.`), not as
  raw role-run output.

## State inspection

```bash
python3 - "$tmpdir" <<'EOF'
import json, pathlib, sys
p = pathlib.Path(sys.argv[1]) / ".pi/co-math/state.json"
s = json.loads(p.read_text())
print("goals", len(s.get("approvedGoals", [])))
print("workstreams", len(s.get("workstreams", [])))
print("roleRuns", [(r.get("id"), r.get("status"), r.get("reportId")) for r in s.get("roleRuns", [])])
print("sources", [(a.get("id"), a.get("sourcePathKind"), a.get("sourcePath"))
                  for a in s.get("artifacts", []) if a.get("kind") == "source"])
EOF
```

## Debug fallback

Direct `/comath` commands (e.g. `/comath status`, `/comath runs`,
`/comath run-status latest`) must keep printing the detailed backend output with IDs.
