use anyhow::Result;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Vc, fxindexmap};
use turbo_tasks_fs::FileSystem;
use turbopack_core::{
    context::AssetContext, environment::ChunkLoading, file_source::FileSource, module::Module,
    reference_type::ReferenceType, source::Source,
};

use crate::{
    embed,
    loader::{compiling_loader_source, instantiating_loader_source},
    raw::RawWebAssemblyModuleAsset,
    source::WebAssemblySource,
};

/// The module for a WebAssembly source: a generated ES module that loads the WebAssembly file
/// and instantiates it, re-exporting its exports, or with a `?module` query only compiles it and
/// exports the `WebAssembly.Module`. It is processed like any other ES module.
#[turbo_tasks::function]
pub async fn wasm_module(
    source: ResolvedVc<WebAssemblySource>,
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
) -> Result<Vc<Box<dyn Module>>> {
    let query = &source.ident().await?.query;

    let chunk_loading = asset_context
        .compile_time_info()
        .environment()
        .chunk_loading()
        .await?;

    let is_edge = matches!(*chunk_loading, ChunkLoading::Edge);

    let loader_source = if query == "?module" {
        compiling_loader_source(*source, is_edge)
    } else {
        instantiating_loader_source(*source, is_edge)
    };

    let helper_path = match *chunk_loading {
        ChunkLoading::Edge => rcstr!("edge/loadWasm.ts"),
        ChunkLoading::NodeJs => rcstr!("node/loadWasm.ts"),
        ChunkLoading::Dom => rcstr!("browser/loadWasm.ts"),
        ChunkLoading::SingleChunk => unreachable!(
            "Environment::chunk_loading never returns SingleChunk; single-chunk WASM is rejected \
             in RawWebAssemblyModuleAsset::chunk_item_content"
        ),
    };

    let helper = asset_context
        .process(
            Vc::upcast(FileSource::new(
                embed::embed_fs().root().await?.join(&helper_path)?,
            )),
            /*
               TODO (@sampoder): ideally, we would have some sort of hint
               here that suggests whether we are using `compileModule()` or
               `instantiate()` to avoid loading the other unused function.
            */
            ReferenceType::Runtime,
        )
        .module()
        .to_resolved()
        .await?;

    Ok(asset_context
        .process(
            loader_source,
            ReferenceType::Internal(ResolvedVc::cell(fxindexmap! {
                rcstr!("WASM_PATH") => ResolvedVc::upcast(
                    RawWebAssemblyModuleAsset::new(*source, *asset_context).to_resolved().await?
                ),
                rcstr!("WASM_HELPER") => helper,
            })),
        )
        .module())
}
