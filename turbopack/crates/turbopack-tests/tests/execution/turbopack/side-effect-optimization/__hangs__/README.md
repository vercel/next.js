# `__hangs__` — reproductions that deadlock the bundler

Fixtures in here reproduce bugs where turbopack **hangs** rather than failing.

They deliberately sit at a path that matches **neither** fixture glob in
`tests/execution.rs`:

- `tests/execution/*/*/*/input/index.js` (the normal suite, which also excludes `__skipped__`)
- `tests/execution/*/*/__skipped__/*/input/index.js` (`test_skipped_fails`, which still *executes*
  its fixtures under `#[should_panic]`)

so nothing runs them automatically. `__skipped__` is not usable for a hang: a fixture that never
returns hangs `test_skipped_fails` too, and would stall the whole `test cargo unit` job with no
useful output.

## Running one by hand

Move the fixture up one directory so it matches the normal glob, then run it with a timeout — it
will not terminate on its own:

```bash
cd turbopack/crates/turbopack-tests/tests/execution/turbopack/side-effect-optimization
mv __hangs__/reexport-cycle-async-deadlock .
cd -
timeout 120 cargo test -p turbopack-tests --test execution -- reexport_cycle_async_deadlock
# exit code 124 == still deadlocking
```

Remember to move it back.

## `reexport-cycle-async-deadlock`

An import cycle whose modules are split into facade + locals modules, containing an async module.

```
index -> A
         ^\
         | v
         C<-B -> asyncFn   (asyncFn has a top-level await)
```

`A`, `B` and `C` each carry `export { helper } from './helper'`. That single re-export is enough for
`EcmascriptExports::split_locals_and_reexports` to return true, so each is split into an
`EcmascriptModuleFacadeModule` + `EcmascriptModuleLocalsModule`. **No config option is required** —
this is default canary behaviour.

### Symptom

`cargo test` never finishes. The process sits at roughly 0.5% CPU with completely flat RSS, and no
Node process is ever spawned — so it is an await that never resolves on the Rust side, before any
generated code runs. Not a spin loop, and not unbounded graph growth.

For a real project this means `next build` hanging with no output and no error; in CI it surfaces
only as a job timeout.

### Where it stalls

Instrumented `eprintln!` tracing localizes it as follows:

1. The module-graph builder blocks in `primary_chunkable_referenced_modules` on
   `module.references().await` for the entry module — i.e. inside `analyze()`.
2. Resolving `import { A } from './A'` reaches `apply_reexport_tree_shaking`
   (`turbopack/src/lib.rs`), which calls `follow_reexports(A_facade, "A")`.
3. `follow_reexports` takes exactly two steps — `A (facade)` → `A <locals>` — and then never
   completes the iteration. (The facade's ident renders without a suffix, because
   `AssetIdent::to_string` deliberately omits `ModulePart::Facade`.)
4. The stall is inside the locals module's `get_exports()`, which awaits the *original* module's
   `analyze()` — already in flight further up the same import cycle. That closes a turbo-tasks
   await cycle.

Setting `followReexports: false` in an `options.json` makes it pass immediately, which pins the
stall to the `follow_reexports` path rather than to async-module handling in general.

Note the fixture's shape is deliberately close to `../../async-modules/cycle-2`, whose header
comment documents an earlier bug in `compute_async_module_info_single` for the same topology. This
is a *different* failure: `compute_async_module_info_single` is never reached here.

### Why it matters now

This is reachable on canary today with nothing but a re-export, an import cycle and a top-level
`await`. It was found while enabling export mangling by default in this suite (#97672/#97676/#97770)
— mangling makes it much easier to hit, because it splits every module with exports rather than only
re-exporting ones — but the bug itself is independent of mangling and predates that work.
