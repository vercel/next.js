**Value cells** represent the pending result of a computation, similar to a cell in a spreadsheet. When a `Vc`'s contents change, the change is propagated by invalidating dependent tasks.

In order to get a reference to the pointed value, you need to `.await` the [`Vc<T>`] to get a [`ReadRef<T>`][`ReadRef`]:

```
let some_vc: Vc<T>;
let some_ref: ReadRef<T> = some_vc.await?;
some_ref.some_method_on_t();
```

The returned [`ReadRef<T>`][`ReadRef`] represents a [reference-counted][triomphe::Arc] snapshot of a cell's value at a given point in time.

## Understanding Cells

A **cell** is a storage location for data associated with a task. Cells provide:

- **Immutability**: Once a value is stored in a cell, it becomes immutable until that task is re-executed.
- **Recomputability**: If invalidated or cache evicted, a cell's contents can be re-computed by re-executing its associated task.
- **Dependency Tracking**: When a cell's contents are read (with `.await`), the reading task is marked as dependent on the cell.
- **Persistence**: Cells owned by persisted tasks are serializable using the [`bincode`] crate.

Cells are stored in arrays associated with the task that constructed them. A `Vc` can either point to a specific cell (this is a *"resolved"* cell), or the return value of a function (this is an *"unresolved"* cell).

<figure style="display: flex; flex-direction: column; justify-content: center;">
<img alt="A diagram showing where cells are stored in tasks" width="850px" src="https://h8dxkfmaphn8o0p3.public.blob.vercel-storage.com/rustdoc-images/RawVc.excalidraw.png">
<figcaption style="font-style: italic; font-size: 80%;">
<tt>TaskOutput</tt>s point to a specific task, and refer to the output cell for that task. <tt>TaskCell</tt>s point to a specific cell within a task. Task cells are stored in a table (conceptually a <tt>Map&lt;ValueTypeId, Vec&lt;SharedReference&gt;&gt</tt>) and are referenced by a pair of a type id and a sequentially allocated index.
</figcaption>
<!-- https://excalidraw.com/#json=Dfb59fd_4hUjwNkoSrL4y,PQ1myzskgKE3IKyESoiYPg -->
</figure>

## Constructing a Cell

Most types using the [`#[turbo_tasks::value]` macro][value-macro] are given a `.cell()` method. This method returns a `Vc` of the type.

Transparent wrapper types that use [`#[turbo_tasks::value(transparent)]`][value-macro] cannot define methods on their wrapped type, so instead the [`Vc::cell`] function can be used to construct these types.

[`Vc::cell`]: /rustdoc/turbo_tasks/struct.Vc.html#method.cell

## Updating a Cell

Every time a task runs, its cells are re-constructed.

When `.cell()` or `Vc::cell` is called, the cell counter for the `ValueTypeId` is incremented, and the value is compared to the previous execution's using `PartialEq`. If the value with that index differs, the cell is updated, and all dependent tasks are invalidated.

The compare-then-update behavior [can be overridden to always update and invalidate using the `cell = "new"` argument][value-macro].

Because cells are keyed by a combination of their type and construction order, **task functions should have a deterministic execution order**. A function with inconsistent ordering may result in wasted work by invalidating additional cells, though it will still give correct results:

- You should use types with deterministic behavior. If you plan to iterate over a collection, use [`IndexMap`], [`BTreeMap`], or [`FrozenMap`] in place of types like [`HashMap`] (which gives randomized iteration order).
- If you perform work in parallel within a single turbo-task, be careful not to construct cells inside the parts of your function that are executed across multiple threads. That can lead to accidentally non-deterministic behavior. Instead, collect results in parallel, and construct cells in the main thread after sorting the results.

[value-macro]: macro@crate::value
[`IndexMap`]: indexmap::IndexMap
[`BTreeMap`]: std::collections::BTreeMap
[`FrozenMap`]: turbo_frozenmap::FrozenMap
[`HashMap`]: std::collections::HashMap

## Reading `Vc`s

`Vc`s implement [`IntoFuture`] and can be `await`ed, but there are few key differences compared to a normal [`Future`]:

- The value pointed to by a `Vc` can be invalidated by changing dependencies or cache evicted, meaning that `await`ing a `Vc` multiple times can give different results. A [`ReadRef`] is snapshot of the underlying cell at a point in time.

- Reading (`await`ing) `Vc`s causes the current task to be tracked a dependent of the `Vc`'s task or task cell. When the read task or task cell changes, the current task may be re-executed.

- `Vc` types are always [`Copy`]. Most [`Future`]s are not. This works because `Vc`s are represented as a few ids or indices into data structures managed by the `turbo-tasks` framework. `Vc` types are not reference counted, but do support [tracing] for a hypothetical (unimplemented) garbage collector.

- An uncached [`turbo_tasks::function`] that returns a `Vc` [begins after being called, even if the `Vc` is not `await`ed](#execution-model).

[`IntoFuture`]: std::future::IntoFuture
[`Future`]: std::future::Future
[`ReadRef`]: crate::ReadRef
[`turbo_tasks::function`]: crate::function

## Subtypes

There are a couple of explicit "subtypes" of `Vc`. These can both be cheaply converted back into a `Vc`.

- **[`ResolvedVc`]:** *(aka [`RawVcUnpacked::TaskCell`])* A reference to a cell constructed within a task, as part of a [`Vc::cell`] or `value_type.cell()` constructor. As the cell has been constructed at least once, the concrete type of the cell is known (allowing [downcasting][ResolvedVc::try_downcast]). This is stored as a combination of a task id, a type id, and a cell id.

- **[`OperationVc`]:** *(aka [`RawVcUnpacked::TaskOutput`])* The synchronous return value of a [`turbo_tasks::function`]. Internally, this is stored using a task id. [`OperationVc`]s must first be [`connect`][crate::OperationVc::connect]ed before being read.

[`ResolvedVc`] is almost always preferred over the more awkward [`OperationVc`] API, but [`OperationVc`] can be useful when dealing with [collectibles], when you need to [read the result of a function with strong consistency][crate::OperationVc::read_strongly_consistent], or with [`State`].

These many representations are stored internally using a type-erased [`RawVc`]. Type erasure reduces the [monomorphization] (and therefore binary size and compilation time) required to support `Vc` and its subtypes.

This means that `Vc` often uses the same in-memory representation as a `ResolvedVc` or an `OperationVc`, but it does not expose the same methods (e.g. downcasting) because the exact memory representation is not statically defined.

|                 | Representation                     | Equality        | Downcasting                | Strong Consistency     | Collectibles      | [Non-Local]  |
|-----------------|------------------------------------|-----------------|----------------------------|------------------------|-------------------|--------------|
| [`Vc`]          | [One of many][RawVc]               | ❌ [Broken][eq] | ⚠️  After resolution        | ❌ Eventual            | ❌ No             | ❌ [No][loc] |
| [`ResolvedVc`]  | [Task Id + Type Id + Cell Id][rtc] | ✅ Yes\*        | ✅ [Yes, cheaply][resolve] | ❌ Eventual            | ❌ No             | ✅ Yes       |
| [`OperationVc`] | [Task Id][rto]                     | ✅ Yes\*        | ⚠️  After resolution        | ✅ [Supported][strong] | ✅ [Yes][collect] | ✅ Yes       |

*\* see the type's documentation for details*

[`ResolvedVc`]: crate::ResolvedVc
[`OperationVc`]: crate::OperationVc
[`turbo_tasks::function`]: crate::function
[`State`]: crate::State
[Non-Local]: crate::NonLocalValue
[rtc]: crate::RawVcUnpacked::TaskCell
[rto]: crate::RawVcUnpacked::TaskOutput
[loc]: #optimization-local-outputs
[eq]: #equality--hashing
[resolve]: crate::ResolvedVc::try_downcast
[strong]: crate::OperationVc::read_strongly_consistent
[collect]: crate::CollectiblesSource


## Equality & Hashing

Because `Vc`s can be equivalent but have different representation, it's not recommended to compare `Vc`s by equality. Instead, you should convert a `Vc` to an explicit subtype first (likely [`ResolvedVc`]). Future versions of `Vc` may not implement [`Eq`], [`PartialEq`], or [`Hash`].


## Execution Model

While task functions are expected to be side-effect free, their execution behavior is still important for performance reasons, or to code using [collectibles] to represent issues or side-effects.

Even if not awaited, uncached function calls are guaranteed to execute (potentially emitting collectibles) before the root task finishes or before the completion of any strongly consistent read containing their call. However, the exact point when that execution begins is an implementation detail. Functions may execute more than once if one of their dependencies is invalidated.

## Eventual Consistency

Because `turbo_tasks` is [eventually consistent], two adjacent `.await`s of the same `Vc<T>` may return different values. If this happens, the task will eventually be invalidated and re-executed by [a strongly consistent root task][crate::OperationVc::read_strongly_consistent]. Top-level tasks will panic if they attempt to perform an eventually consistent read of a `Vc`.

Tasks affected by a read inconsistency can return errors. These errors will be discarded by the strongly consistent root task. Tasks should never panic due to a potentially-inconsistent value stored in a `Vc`.

Currently, all inconsistent tasks are polled to completion. Future versions of the `turbo_tasks` library may drop tasks that have been identified as inconsistent after some time. As non-root tasks should not perform side-effects, this should be safe, though it may introduce some issues with cross-process resource management.

[eventually consistent]: https://en.wikipedia.org/wiki/Eventual_consistency


## Optimization: Local Outputs

In addition to the potentially-explicit "resolved" and "operation" representations of a `Vc`, there's another internal representation of a `Vc`, known as a "Local `Vc`", or [`RawVcUnpacked::LocalOutput`].

This is a special case of the synchronous return value of a [`turbo_tasks::function`] when some of its arguments have not yet been resolved. These are stored in task-local state that is freed after their parent non-local task exits.

We prevent potentially-local `Vc`s from escaping the lifetime of a function using the [`NonLocalValue`] marker trait alongside some fallback runtime checks. We do this to avoid some ergonomic challenges that would come from using lifetime annotations with `Vc`.


[tracing]: crate::trace::TraceRawVcs
[`ReadRef`]: crate::ReadRef
[`turbo_tasks::function`]: crate::function
[monomorphization]: https://doc.rust-lang.org/book/ch10-01-syntax.html#performance-of-code-using-generics
[`State`]: crate::State
[book-cells]: https://turbopack-rust-docs.vercel.sh/turbo-engine/cells.html
[collectibles]: crate::CollectiblesSource
