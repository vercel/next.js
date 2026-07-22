/**
 * The stages of a staged server render (see
 * `server/app-render/staged-rendering.ts`). Content that isn't allowed to
 * render in the current stage is deferred until the render advances to a
 * later one.
 *
 * Note on terminology: the response model is a nesting of shell ⊂ prefetch ⊂
 * navigation, but there is no `RenderStage.Navigation` — the conceptual
 * "navigation stage" (content deferred by `unstable_navigation()`, filled in
 * during the actual navigation) corresponds to `RenderStage.Dynamic`.
 *
 * The numbering is deliberate: the tens digit groups the stages (1x static,
 * 2x runtime, 3x dynamic, 4x abandoned), a shell sub-stage sorts before its
 * full stage within a group, and the gaps leave room to insert new stages
 * without renumbering. Renumbering is a wire-format change: these values
 * travel in runtime prefetch responses (the `n` field of
 * `NavigationFlightResponse` reports the earliest render stage whose content
 * was deferred).
 *
 * This lives in `shared/lib` (rather than with the staged rendering
 * controller on the server) because the client also needs the enum values:
 * the segment cache uses the `n` field to record an entry's effective fetch
 * strategy.
 */
export enum RenderStage {
  Before = 1,
  //
  ShellStatic = 11,
  Static = 13,
  //
  ShellRuntime = 21,
  Runtime = 23,
  //
  Dynamic = 30,
  //
  Abandoned = 40,
}
