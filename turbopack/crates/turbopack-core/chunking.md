Chunking is the process that decides which modules are placed into which bundles, and the relationship between these bundles.

For this process a few intermediate concepts are used:

- [`ChunkingContext`]: A context trait which controls the chunking process.
- [`ChunkItem`]: A derived object from a [`Module`] which combines the module with the [`ChunkingContext`] and [`ModuleGraph`].
- [`ChunkableModule`]: A trait which defines how a specific [`Module`] can be converted into a [`ChunkItem`].
- [`ModuleReference::chunking_type()`]: A method on the [`ModuleReference`] trait returning `Option<`[`ChunkingType`]`>`, which defines how a reference interacts with chunking. References returning `None` are not followed during the chunking graph walk.
- [`ChunkType`]: A trait which defines how to create a [`Chunk`] from [`ChunkItem`]s.
- [`Chunk`]: A trait which represents a bundle of [`ChunkItem`]s.

[`ChunkingContext`]: crate::chunk::ChunkingContext
[`ChunkItem`]: crate::chunk::ChunkItem
[`ChunkableModule`]: crate::chunk::ChunkableModule
[`ChunkType`]: crate::chunk::ChunkType
[`ChunkingType`]: crate::chunk::ChunkingType
[`Chunk`]: crate::chunk::Chunk
[`Module`]: crate::module::Module
[`ModuleReference`]: crate::reference::ModuleReference
[`ModuleReference::chunking_type()`]: crate::reference::ModuleReference::chunking_type
[`ModuleGraph`]: crate::module_graph::ModuleGraph
[`OutputAsset`]: crate::output::OutputAsset

<figure style="display: flex; flex-direction: column; justify-content: center;">
<img alt="A chart of the type hierarchy" width="800px" src="https://h8dxkfmaphn8o0p3.public.blob.vercel-storage.com/rustdoc-images/chunking.mermaid.png">
</figure>

<!-- Mermaid diagram (https://mermaid.ai/live/edit):

graph TB
    convert{{convert to chunk item}}
    ty{{get chunk type}}
    create{{create chunk}}

    EcmascriptModuleAsset -. has trait .-> Module
    CssModule -. has trait .-> Module
    Module -. has trait .-> ChunkableModule
    ChunkableModule === convert
    ChunkingContext --- convert
    ModuleGraph --- convert
    convert ==> ChunkItem
    ChunkItem ==== ty
    EcmascriptChunkType -. has trait ..-> ChunkType
    CssChunkType -. has trait ..-> ChunkType
    ty ==> ChunkType
    ChunkType ==== create
    create ==> Chunk
    EcmascriptChunk -. has trait ..-> Chunk
    CssChunk -. has trait ..-> Chunk

    BrowserChunkingContext -. has trait .-> ChunkingContext
    NodeJsChunkingContext -. has trait .-> ChunkingContext
-->

## Graph Walk

A [`Module`] must implement the [`ChunkableModule`] trait to be considered for chunking. References returned by a module that have a non-`None` [`chunking_type()`][`ModuleReference::chunking_type()`] are followed during the chunking graph walk. The [`ChunkingType`] enum controls how each reference is handled.

The chunking algorithm walks the module graph via a DFS traversal following these chunkable references to find all modules that should be bundled together.

## Module Batching

Before modules become chunk items, they may be grouped into **module batches** ([`ModuleBatch`]). This intermediate batching layer groups related modules together. Batches are organized into **batch groups** ([`ModuleBatchGroup`]) which are carried through the chunking process.

[`ModuleBatch`]: crate::module_graph::module_batch::ModuleBatch
[`ModuleBatchGroup`]: crate::module_graph::module_batch::ModuleBatchGroup

## Module Merging (Scope Hoisting)

Modules implementing the [`MergeableModule`] trait can be merged together (scope hoisting). When module merging is enabled on the [`ChunkingContext`], multiple modules may be combined into a single module before chunk item creation, reducing the number of individual chunk items and improving runtime performance.

[`MergeableModule`]: crate::chunk::MergeableModule

## Chunk Item Creation

Modules (or module batches) are converted into [`ChunkItem`]s via [`ChunkableModule::as_chunk_item()`].

[`ChunkableModule::as_chunk_item()`]: crate::chunk::ChunkableModule::as_chunk_item

## Chunk Splitting

A splitting algorithm decides which [`ChunkItem`]s are placed into which [`Chunk`]s. Only [`ChunkItem`]s with the same [`ChunkType`] can be placed into the same [`Chunk`]. Beyond that, the splitting strategy differs between development and production:

**Development mode** splits chunks using a hierarchical strategy:

1. App code vs. vendor code (based on `node_modules` path presence)
2. Package name within vendor code
3. Directory structure within app code
4. Size thresholds to avoid overly small or large chunks

**Production mode** splits chunks based on:

1. **Chunk group membership**: modules are grouped by which pages/entries they belong to, so modules shared by the same set of pages end up together.
2. **Size constraints**: [`ChunkingConfig`] controls merging of small chunks and splitting of large ones.

Once the [`ChunkItem`]s that should be placed together are determined, a [`Chunk`] is created for each group by calling [`ChunkType::chunk()`].

[`ChunkingConfig`]: crate::chunk::ChunkingConfig
[`ChunkType::chunk()`]: crate::chunk::ChunkType::chunk

## Output

An [`OutputAsset`] is generated for each [`Chunk`]. The [`ChunkingContext`] implementation decides how each [`Chunk`] is transformed into an [`OutputAsset`] (e.g. `BrowserChunkingContext` wraps `EcmascriptChunk`s in an `EcmascriptBrowserChunk` that adds runtime loading code). `CssChunk`s directly implement [`OutputAsset`]. These [`OutputAsset`]s that are loaded together form a **chunk group**.

## Available Modules

The chunking process tracks which modules are already available in parent chunk groups via [`AvailableModules`], to avoid duplication in nested chunk groups.

[`AvailableModules`]: crate::chunk::available_modules::AvailableModules
