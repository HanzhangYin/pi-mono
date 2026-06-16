# Co-Math Background Activity — Design Note

> Status: design note only. Not implemented. Captures the better long-term direction for showing
> background work in the TUI so the current co-math footer bridge can be migrated later.

## Current behavior (normal agent turns)

`AgentSession.isStreaming` drives the standard TUI loader. While the agent is producing a turn, the
interactive footer shows the working/loader indicator. When the turn ends, `isStreaming` is false and
the loader clears.

## Co-math behavior (background research runs)

A co-math research run (`continue path N`) does **not** fit that model. The harness starts the run as
a background promise and returns from the prompt immediately so the user can keep typing. The work
(coordinator → specialist → computation → critic → synthesizer) then continues **after** the normal
agent turn has ended, i.e. while `isStreaming` is already false. The standard loader therefore shows
nothing, even though Pi is still working.

## Current workaround (the co-math bridge)

To still show a persistent indicator, co-math threads per-run activity callbacks up to the host:

```
CoMathHarness  --(onResearchWorkstreamActivityStart/Update/End)-->  main.ts bridge
main.ts bridge --(setCoMathActivityStatus)-->  InteractiveMode.setExtensionStatus("co-math", …)
InteractiveMode --> footer extension status, e.g.  co-math: Path 1 running · computation
```

- `comath-harness.ts` fires the callbacks per stage (start, each stage update, end / stale / fail).
- `main.ts` `createCoMathInteractiveActivityBridge` keeps the latest status per run id (so concurrent
  runs do not clobber each other) and renders the most recent one.
- `interactive-mode.ts` `setCoMathActivityStatus` forwards to the generic extension-status footer slot.

This works but is co-math-specific UI plumbing living in `main.ts`/`interactive-mode.ts`.

## Why not fake `isStreaming`

`isStreaming` means "the agent is generating a turn right now." Background research runs are not agent
turns: the input loop must stay interactive, cancellation/escape semantics differ, and other code
keys off `isStreaming` (loaders, input gating, accounting). Forcing it true for background work would
mislead all of those consumers and risk wedging the editor. The footer extension status is the honest
representation: "a background task is running," distinct from "the agent is streaming."

## Proposed future API

A small, generic background-activity surface on `ctx.ui`, usable by any extension (not just co-math):

```ts
ctx.ui.startBackgroundActivity({
  key: "co-math",          // stable namespace; multiple keys may be active at once
  label: "Path 1",          // short human label
  detail: "running computation",
  indicator: "spinner",     // "spinner" | "none"
});

ctx.ui.updateBackgroundActivity("co-math", {
  detail: "reviewing limits",
});

ctx.ui.endBackgroundActivity("co-math");
```

Notes:
- Multiple concurrent activities keyed independently; the footer renders one or rolls them up.
- Independent of `isStreaming`; never blocks the input loop.
- The host owns rendering (footer/loader), so extensions stay UI-agnostic.

## Migration path from the co-math bridge

1. Add `startBackgroundActivity`/`updateBackgroundActivity`/`endBackgroundActivity` to the extension
   `ctx.ui` types and implement them in `InteractiveMode` (reusing the existing extension-status slot).
2. Have the co-math harness call the generic API directly (via the extension context) instead of the
   bespoke `onResearchWorkstreamActivity*` callbacks.
3. Delete `createCoMathInteractiveActivityBridge` and `setCoMathActivityStatus` from `main.ts` /
   `interactive-mode.ts`; the wiring becomes generic.
4. Keep the same rendered string (`co-math: Path 1 running · <stage>`) so the beginner smoke is
   unchanged.

This is a note, not an implementation spec; shapes above are illustrative.
