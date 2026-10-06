# Turbo Tasks

An incremental computation system that uses macros and types to automate the caching process.

For a high-level overview, start by reading [*Inside Turbopack: Building Faster by Building Less*][blog-post].

Turbo Tasks defines 4 primitives:
- **[Functions][macro@crate::function]:** Units of execution, invalidation, and reexecution.
- **[Values][macro@crate::value]:** Data created, stored, and returned by functions.
- **[Traits][macro@crate::value_trait]:** Traits that define a set of functions on values.
- **[Collectibles][crate::TurboTasks::emit_collectible]:** Values emitted in functions that bubble up the call graph and can be collected in parent functions. Collectibles are deduplicated by [cell id equality].

It defines some derived elements from that:
- **Tasks:** An instance of a function together with its arguments.
- **[`Vc`s ("Value Cells")][`Vc`]:** References to locations associated with tasks where values are stored. The contents of a cell can change after the reexecution of a function due to invalidation. A [`Vc`] can be read to get [a read-only reference][crate::ReadRef] to the stored data, representing a snapshot of that cell at that point in time.

There are a few design patterns that are commonly used with Turbo Tasks:
- **[Singleton Pattern][crate::_singleton_pattern]:** Use a private constructor function to ensure a 1:1 mapping between values and value cells.

[blog-post]: https://nextjs.org/blog/turbopack-incremental-computation
[cell id equality]: crate::ResolvedVc#equality--hashing
[`Vc`]: crate::Vc

## Functions and Tasks

<figure style="display: flex; flex-direction: column; justify-content: center;">
<img alt="An example turbo-task function" width="800px" src="https://h8dxkfmaphn8o0p3.public.blob.vercel-storage.com/static/blog/turbopack-incremental-computation/turbopack_value-cells--light.png">
<!-- https://excalidraw.com/#json=0ea-5XgdFmHZYb3f1HDYg,jTRHUkp7H3As-dJst1SW0A -->
</figure>

[`#[turbo_tasks::function]`][crate::function]s are memoized functions within the build process. An instance of a function with arguments is called a **task**. They are responsible for:

- **Tracking Dependencies**: Each task keeps track of its dependencies to determine when a recomputation is necessary. Dependencies are tracked when a [`Vc<T>`][crate::Vc] (Value Cell) is awaited.
- **Recomputing Changes**: When a dependency changes, the affected tasks are automatically recomputed.
- **Parallel Execution**: Every task is spawned as a [Tokio task], which uses Tokio's multithreaded work-stealing executor.

[Tokio task]: https://tokio.rs/tokio/tutorial/spawning#tasks

## Experimental Stateful Cells

`#[turbo_tasks::value(cell = "stateful", operation)]` opts a persistable,
non-transparent `Clone + OperationValue` payload into task-owned mutable storage.
The generated `value.stateful_cell()` returns a [`StateCell<T>`][crate::StateCell],
not a `Vc<T>`; ordinary `.cell()` and `.resolved_cell()` constructors are unavailable
for this mode. Existing values and `State<T>` users are unchanged.

- `get()` returns an immutable `ReadRef<T>` snapshot and tracks a normal cell dependency;
  `get_untracked()` returns the same snapshot without an edge.
- `set(value)` replaces canonical backend content. `update(|value| ...)` serializes
  writers, edits a private clone, and publishes only if the closure returns normally.
  Every commit invalidates readers, even when the new value is equal.
- Construction is first-value-wins, including after eviction and persistence restore.
  One persistent creator task owns the cell; transient/Once Tasks cannot own it.
  Sharing handles never transfers ownership. Keep a
  fixed allocation layout. Successful omission retires a slot; index reuse is unsupported.
- Handles do not root their creator. Keep escaped handles connected to an explicit
  root or GC pin. Access after collection or retirement returns an error; reacquire
  handles through the creator after reopening a backend.
- Methods are synchronous and require a turbo-tasks context and a multi-threaded
  Tokio runtime. The executing owner cannot call `set` or `update` on its own cell.
  Update closures must be short, synchronous, and must not call turbo-tasks, nest
  cell access, or spawn/wait for task work. Reentrant calls panic even in release
  builds. Old read snapshots remain unchanged after publication.

This is a bounded prototype, not a named state registry, schema-migration API,
mutable read guard, or multi-cell transaction facility.

## Task Graph

<figure style="display: flex; flex-direction: column; justify-content: center;">
<img alt="An example of a task graph" width="850px" src="https://h8dxkfmaphn8o0p3.public.blob.vercel-storage.com/static/blog/turbopack-incremental-computation/example_value_cell_operations--light.png">
<figcaption style="font-style: italic; font-size: 80%;">
These example call trees represent an initial (cold) execution, the “mark dirty” operation when a file has been changed, and the propagation from the leaf up to the root.
</figcaption>
</figure>

All tasks and their dependencies form a **task graph**.

This graph is crucial for **invalidation propagation**. When a task is invalidated, the changes propagate through the graph, triggering rebuilds where necessary.

## Incremental Builds

Upon execution of functions, `turbo-tasks` will track which [`Vc`]s are read. Once any of these change, `turbo-tasks` will invalidate the task created from the function's execution and it will eventually be scheduled and reexecuted.

After initial execution, turbo-tasks employs a **bottom-up** approach for incremental rebuilds.

By rebuilding invalidated tasks, only the parts of the graph affected by changes are rebuilt, leaving untouched parts intact. No work is done for unchanged parts.
