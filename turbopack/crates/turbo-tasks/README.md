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
- **[`StateSlot`]s and [`TurboTasksState`]s:** Registered, typed mutable sources whose canonical values live in the backend, independently of any task's value cell. One slot produces one state per task owner or explicitly rooted named owner; tracked synchronous reads invalidate their consumers on updates.

There are a few design patterns that are commonly used with Turbo Tasks:
- **[Singleton Pattern][crate::_singleton_pattern]:** Use a private constructor function to ensure a 1:1 mapping between values and value cells.

[blog-post]: https://nextjs.org/blog/turbopack-incremental-computation
[cell id equality]: crate::ResolvedVc#equality--hashing
[`Vc`]: crate::Vc

## Backend-owned state

`#[turbo_tasks::state] static SLOT: StateSlot<T> = StateSlot::new()` declares a
registered codec and a distinct factory identity, even when another slot has the
same Rust value type. Creating a slot for the current task, or for an explicitly
pinned `StateOwnerRoot::named(...)`, resolves the backend's `(owner, slot)` lookup
without resetting an existing value.

`TurboTasksState<T>` is a **Copy** reference containing only a factory ID and an
allocated instance ID. Owner names and mutable values stay in the backend, not in
task-input keys. Collected IDs are never recycled; an old handle returns a missing
state error even if the same logical owner/slot is created again. Named owners are
persistent; transient task owners produce transient references.

Reads are synchronous snapshots. `get` tracks a dependency and `get_untracked`
does not. Changed writes dirty current readers before publishing the value;
no-op writes do not invalidate them. State locks precede task locks. A contended
getter releases its operation guard before waiting, then retries acquisition.
Initializers/serialization under the state lock must not re-enter turbo-tasks.
Values containing operations still require their usual call-graph connections.

Persistence writes only dirty state rows and collected-ID tombstones, atomically
with affected task data and allocator progress. A fixed-bucket multi-value index
tracks live IDs through individual insertions/deletions, without rewriting an
entire value store or scanning holes in the allocated ID range on restart. Task
GC collects task-owned states; named roots pin their namespace, and normal GC
aging applies after the last root drops.

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
