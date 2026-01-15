use anyhow::Result;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::ChunkingContext,
    code_builder::Code,
    ident::AssetIdent,
    output::{OutputAsset, OutputAssets, OutputAssetsReference, OutputAssetsWithReferenced},
    source_map::{GenerateSourceMap, SourceMapAsset},
};

use crate::{asset_context::get_runtime_asset_context, embed_js::embed_static_code};

/// Returns the worker entrypoint asset(s) for the given chunking context.
/// Cached via Vc, safe to call multiple times.
#[turbo_tasks::function]
pub async fn get_worker_entrypoint(
    chunking_context: Vc<Box<dyn ChunkingContext>>,
) -> Result<Vc<OutputAssetsWithReferenced>> {
    let entrypoint = WorkerEntrypoint::new(chunking_context);
    let entrypoint_resolved = entrypoint.to_resolved().await?;
    let entrypoint_refs = entrypoint.references().await?;
    Ok(OutputAssetsWithReferenced {
        assets: Vc::<OutputAssets>::cell(vec![ResolvedVc::upcast(entrypoint_resolved)])
            .to_resolved()
            .await?,
        referenced_assets: entrypoint_refs.referenced_assets,
        references: entrypoint_refs.references,
    }
    .cell())
}

/// Worker entrypoint that bootstraps workers by reading config from URL params.
#[turbo_tasks::value(shared)]
pub struct WorkerEntrypoint {
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl WorkerEntrypoint {
    #[turbo_tasks::function]
    async fn new(chunking_context: Vc<Box<dyn ChunkingContext>>) -> Result<Vc<Self>> {
        Ok(WorkerEntrypoint {
            chunking_context: chunking_context.to_resolved().await?,
        }
        .cell())
    }

    #[turbo_tasks::function]
    async fn code(self: Vc<Self>) -> Result<Vc<Code>> {
        let this = self.await?;
        let environment = this.chunking_context.environment();

        let source_maps = *this
            .chunking_context
            .reference_chunk_source_maps(Vc::upcast(self))
            .await?;

        let asset_context = get_runtime_asset_context(environment).resolve().await?;
        Ok(embed_static_code(
            asset_context,
            rcstr!("browser/runtime/base/worker-entrypoint.ts"),
            source_maps,
        ))
    }

    #[turbo_tasks::function]
    async fn ident_for_path(&self) -> Result<Vc<AssetIdent>> {
        let chunk_root_path = self.chunking_context.chunk_root_path().owned().await?;
        Ok(AssetIdent::from_path(chunk_root_path).with_modifier(rcstr!("worker entrypoint")))
    }

    #[turbo_tasks::function]
    async fn source_map(self: Vc<Self>) -> Result<Vc<SourceMapAsset>> {
        let this = self.await?;
        Ok(SourceMapAsset::new(
            *this.chunking_context,
            self.ident_for_path(),
            Vc::upcast(self),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for WorkerEntrypoint {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<turbo_rcstr::RcStr> {
        Vc::cell(rcstr!("Worker Entrypoint"))
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for WorkerEntrypoint {
    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssetsWithReferenced>> {
        let this = self.await?;
        let mut references = Vec::new();

        let include_source_map = *this
            .chunking_context
            .reference_chunk_source_maps(Vc::upcast(self))
            .await?;

        if include_source_map {
            references.push(ResolvedVc::upcast(self.source_map().to_resolved().await?));
        }

        Ok(OutputAssetsWithReferenced::from_assets(Vc::cell(
            references,
        )))
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for WorkerEntrypoint {
    #[turbo_tasks::function]
    async fn path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        Ok(this.chunking_context.chunk_path(
            Some(Vc::upcast(self)),
            self.ident_for_path(),
            Some(rcstr!("worker")),
            rcstr!(".js"),
        ))
    }
}

#[turbo_tasks::value_impl]
impl Asset for WorkerEntrypoint {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        Ok(AssetContent::file(
            FileContent::Content(File::from(
                self.code()
                    .to_rope_with_magic_comments(|| self.source_map())
                    .await?,
            ))
            .cell(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for WorkerEntrypoint {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<FileContent> {
        self.code().generate_source_map()
    }
}
