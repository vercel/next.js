/// Utilities shared by our chunking context implementations
use anyhow::Result;
use tracing::Instrument;
use turbo_tasks::{ResolvedVc, TryJoinIterExt, UpcastStrict, ValueToString, Vc};
use turbopack_core::{
    chunk::{
        ChunkGroupResult, ChunkableModule, ChunkingContext, EvaluatableAsset, EvaluatableAssets,
        availability_info::AvailabilityInfo,
        chunk_group::{MakeChunkGroupResult, make_chunk_group},
    },
    ident::AssetIdent,
    module_graph::{ModuleGraph, chunk_group_info::ChunkGroup},
    output::{OutputAsset, OutputAssets},
    reference::ModuleReference,
};

use super::EcmascriptChunk;

/// Trait for chunking contexts that can generate ecmascript-based evaluated chunk groups.
/// This trait provides the factory methods needed to customize chunk generation.
pub trait EcmascriptChunkingContextExt:
    ChunkingContext + UpcastStrict<Box<dyn ChunkingContext>>
{
    /// Convert an EcmascriptChunk to a concrete output asset (e.g., EcmascriptBuildNodeChunk)
    fn generate_chunk_from_ecmascript_chunk(
        self: Vc<Self>,
        chunk: ResolvedVc<EcmascriptChunk>,
    ) -> Vc<Box<dyn OutputAsset>>;

    /// Generate an evaluate chunk (entry point for isolated contexts like workers)
    fn generate_evaluate_chunk(
        self: Vc<Self>,
        ident: Vc<AssetIdent>,
        other_chunks: Vc<OutputAssets>,
        evaluatable_assets: Vc<EvaluatableAssets>,
        module_graph: Vc<ModuleGraph>,
    ) -> Vc<Box<dyn OutputAsset>>;

    /// Generate additional assets for the evaluated chunk group (e.g., HMR chunks)
    fn generate_evaluated_chunk_group_extra_assets(
        self: Vc<Self>,
        _ident: Vc<AssetIdent>,
        _entries: Vc<EvaluatableAssets>,
        _other_assets: Vc<OutputAssets>,
        _input_availability_info: AvailabilityInfo,
    ) -> impl std::future::Future<Output = Result<Vec<ResolvedVc<Box<dyn OutputAsset>>>>> + Send
    {
        async move { Ok(vec![]) }
    }

    /// Generate additional assets for a regular chunk group (e.g., HMR registration chunks)
    fn generate_chunk_group_extra_assets(
        self: Vc<Self>,
        _ident: Vc<AssetIdent>,
        _other_assets: Vc<OutputAssets>,
        _input_availability_info: AvailabilityInfo,
    ) -> impl std::future::Future<Output = Result<Vec<ResolvedVc<Box<dyn OutputAsset>>>>> + Send
    {
        async move { Ok(vec![]) }
    }
}

/// Helper to generate an output asset from any chunk (used in chunk_group and entry_chunk_group).
/// This implements the common pattern of:
/// - Try to downcast to EcmascriptChunk and use the trait's factory method
/// - Fall back to sidecasting to OutputAsset
/// - Bail if neither works
pub async fn generate_chunk<CC>(
    chunking_context: Vc<CC>,
    chunk: ResolvedVc<Box<dyn turbopack_core::chunk::Chunk>>,
) -> Result<ResolvedVc<Box<dyn OutputAsset>>>
where
    CC: EcmascriptChunkingContextExt,
{
    if let Some(ecmascript_chunk) = ResolvedVc::try_downcast_type::<EcmascriptChunk>(chunk) {
        chunking_context
            .generate_chunk_from_ecmascript_chunk(ecmascript_chunk)
            .to_resolved()
            .await
    } else if let Some(output_asset) = ResolvedVc::try_sidecast::<Box<dyn OutputAsset>>(chunk) {
        Ok(output_asset)
    } else {
        anyhow::bail!("Unable to generate output asset for chunk")
    }
}

/// Default implementation of `evaluated_chunk_group` for chunking contexts that implement
/// `EcmascriptChunkingContextExt`.
///
/// This implementation:
/// 1. Creates chunks for all modules in the chunk group
/// 2. Generates output assets from those chunks using `generate_chunk_from_ecmascript_chunk`
/// 3. Adds extra assets via `generate_evaluated_chunk_group_extra_assets` (e.g., HMR chunks)
/// 4. Creates an evaluate chunk via `generate_evaluate_chunk` that bootstraps the worker/isolated
///    context
pub async fn evaluated_chunk_group_impl<CC>(
    chunking_context: Vc<CC>,
    ident: Vc<AssetIdent>,
    chunk_group: ChunkGroup,
    module_graph: Vc<ModuleGraph>,
    input_availability_info: AvailabilityInfo,
) -> Result<Vc<ChunkGroupResult>>
where
    CC: EcmascriptChunkingContextExt,
{
    let ident_str = ident.to_string().await?;
    let span = tracing::info_span!(
        "chunking",
        name = display(&*ident_str),
        chunking_type = "evaluated",
    );
    async move {
        let self_resolved = Vc::upcast::<Box<dyn ChunkingContext>>(chunking_context)
            .to_resolved()
            .await?;
        let entries = chunk_group.entries();
        let MakeChunkGroupResult {
            chunks,
            referenced_output_assets,
            references,
            availability_info,
        } = make_chunk_group(
            entries,
            module_graph,
            self_resolved,
            input_availability_info,
        )
        .await?;

        // Generate output assets from chunks
        let mut assets: Vec<ResolvedVc<Box<dyn OutputAsset>>> = chunks
            .iter()
            .map(|chunk| generate_chunk(chunking_context, *chunk))
            .try_join()
            .await?;

        let other_assets = Vc::cell(assets.clone());

        // Convert chunk group entries to evaluatable assets
        let entries = Vc::cell(
            chunk_group
                .entries()
                .map(|m| {
                    ResolvedVc::try_downcast::<Box<dyn EvaluatableAsset>>(m).ok_or_else(|| {
                        anyhow::anyhow!("evaluated_chunk_group entries must be evaluatable assets")
                    })
                })
                .collect::<Result<Vec<_>>>()?,
        );

        // Add any extra assets (e.g., HMR registration chunks)
        let extra_assets = chunking_context
            .generate_evaluated_chunk_group_extra_assets(
                ident,
                entries,
                other_assets,
                input_availability_info,
            )
            .await?;
        assets.extend(extra_assets);

        // Generate the evaluate chunk (entry point)
        assets.push(
            chunking_context
                .generate_evaluate_chunk(ident, other_assets, entries, module_graph)
                .to_resolved()
                .await?,
        );

        Ok(ChunkGroupResult {
            assets: ResolvedVc::cell(assets),
            referenced_assets: ResolvedVc::cell(referenced_output_assets),
            references: ResolvedVc::cell(references),
            availability_info,
        }
        .cell())
    }
    .instrument(span)
    .await
}

/// Default implementation of `chunk_group` for chunking contexts that implement
/// `EcmascriptChunkingContextExt`.
///
/// This implementation:
/// 1. Creates chunks for all modules in the chunk group
/// 2. Generates output assets from those chunks using `generate_chunk`
/// 3. Adds extra assets via `generate_chunk_group_extra_assets` (e.g., HMR registration)
/// 4. Returns the chunk group result
pub async fn chunk_group_impl<CC>(
    chunking_context: Vc<CC>,
    ident: Vc<AssetIdent>,
    chunk_group: ChunkGroup,
    module_graph: Vc<ModuleGraph>,
    input_availability_info: AvailabilityInfo,
) -> Result<Vc<ChunkGroupResult>>
where
    CC: EcmascriptChunkingContextExt,
{
    let ident_str = ident.to_string().await?;
    let span = tracing::info_span!("chunking", name = display(&*ident_str));
    async move {
        let self_resolved = Vc::upcast::<Box<dyn ChunkingContext>>(chunking_context)
            .to_resolved()
            .await?;
        let entries = chunk_group.entries();
        let MakeChunkGroupResult {
            chunks,
            referenced_output_assets,
            references,
            availability_info,
        } = make_chunk_group(
            entries,
            module_graph,
            self_resolved,
            input_availability_info,
        )
        .await?;

        // Generate output assets from chunks
        let mut assets: Vec<ResolvedVc<Box<dyn OutputAsset>>> = chunks
            .iter()
            .map(|chunk| generate_chunk(chunking_context, *chunk))
            .try_join()
            .await?;

        let other_assets = Vc::cell(assets.clone());

        // Add any extra assets (e.g., HMR registration chunks)
        let extra_assets = chunking_context
            .generate_chunk_group_extra_assets(ident, other_assets, input_availability_info)
            .await?;
        assets.extend(extra_assets);

        Ok(ChunkGroupResult {
            assets: ResolvedVc::cell(assets),
            referenced_assets: ResolvedVc::cell(referenced_output_assets),
            references: ResolvedVc::cell(references),
            availability_info,
        }
        .cell())
    }
    .instrument(span)
    .await
}

/// Helper for `asset_path` implementation - generates a content-hashed path for an asset.
/// Both NodeJs and Browser chunking contexts use identical logic.
pub fn asset_path_impl(
    content_hash: &str,
    original_asset_ident: &turbo_tasks_fs::FileSystemPath,
    tag: Option<&str>,
    asset_root_paths: &turbo_tasks::FxIndexMap<turbo_rcstr::RcStr, turbo_tasks_fs::FileSystemPath>,
    default_asset_root_path: &turbo_tasks_fs::FileSystemPath,
) -> Result<turbo_tasks_fs::FileSystemPath> {
    let basename = original_asset_ident.file_name();
    let asset_path = match original_asset_ident.extension_ref() {
        Some(ext) => format!(
            "{basename}.{content_hash}.{ext}",
            basename = &basename[..basename.len() - ext.len() - 1],
            content_hash = &content_hash[..8]
        ),
        None => format!(
            "{basename}.{content_hash}",
            content_hash = &content_hash[..8]
        ),
    };

    let asset_root_path = tag
        .and_then(|tag| asset_root_paths.get(tag))
        .unwrap_or(default_asset_root_path);

    asset_root_path.join(&asset_path)
}

/// Helper for `async_loader_chunk_item` implementation.
/// Both NodeJs and Browser chunking contexts use identical logic.
pub async fn async_loader_chunk_item_impl(
    manifest_chunks: bool,
    module: Vc<Box<dyn turbopack_core::chunk::ChunkableModule>>,
    module_graph: Vc<ModuleGraph>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    availability_info: AvailabilityInfo,
) -> Result<Vc<Box<dyn turbopack_core::chunk::ChunkItem>>> {
    use crate::{
        async_chunk::module::AsyncLoaderModule,
        manifest::{chunk_asset::ManifestAsyncModule, loader_item::ManifestLoaderChunkItem},
    };

    Ok(if manifest_chunks {
        let manifest_asset =
            ManifestAsyncModule::new(module, module_graph, chunking_context, availability_info);
        Vc::upcast(ManifestLoaderChunkItem::new(
            manifest_asset,
            module_graph,
            chunking_context,
        ))
    } else {
        let module = AsyncLoaderModule::new(module, chunking_context, availability_info);
        module.as_chunk_item(module_graph, chunking_context)
    })
}

/// Helper for `async_loader_chunk_item_id` implementation.
/// Both NodeJs and Browser chunking contexts use identical logic.
pub fn async_loader_chunk_item_id_impl<CC>(
    manifest_chunks: bool,
    module: Vc<Box<dyn turbopack_core::chunk::ChunkableModule>>,
    chunking_context: Vc<CC>,
) -> Vc<turbopack_core::chunk::ModuleId>
where
    CC: ChunkingContext,
{
    use crate::{
        async_chunk::module::AsyncLoaderModule, manifest::loader_item::ManifestLoaderChunkItem,
    };

    if manifest_chunks {
        chunking_context.chunk_item_id_from_ident(ManifestLoaderChunkItem::asset_ident_for(module))
    } else {
        chunking_context.chunk_item_id_from_ident(AsyncLoaderModule::asset_ident_for(module))
    }
}

/// Helper for `module_export_usage` implementation.
/// Both NodeJs and Browser chunking contexts use identical logic.
pub async fn module_export_usage_impl(
    export_usage: Option<
        ResolvedVc<turbopack_core::module_graph::binding_usage_info::BindingUsageInfo>,
    >,
    module: ResolvedVc<Box<dyn turbopack_core::module::Module>>,
) -> Result<Vc<turbopack_core::module_graph::binding_usage_info::ModuleExportUsage>> {
    use turbopack_core::module_graph::binding_usage_info::ModuleExportUsage;

    if let Some(export_usage) = export_usage {
        Ok(export_usage.await?.used_exports(module).await?)
    } else {
        Ok(ModuleExportUsage::all())
    }
}

/// Helper for `is_reference_unused` implementation.
/// Both NodeJs and Browser chunking contexts use identical logic.
pub async fn is_reference_unused_impl(
    unused_references: Option<
        ResolvedVc<turbopack_core::module_graph::binding_usage_info::BindingUsageInfo>,
    >,
    reference: ResolvedVc<Box<dyn ModuleReference>>,
) -> Result<Vc<bool>> {
    if let Some(unused_references) = unused_references {
        Ok(Vc::cell(
            unused_references.await?.is_reference_unused(&reference),
        ))
    } else {
        Ok(Vc::cell(false))
    }
}
