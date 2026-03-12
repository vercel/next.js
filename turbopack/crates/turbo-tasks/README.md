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
