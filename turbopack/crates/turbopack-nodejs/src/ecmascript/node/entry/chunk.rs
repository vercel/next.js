use std::io::Write;

use anyhow::{bail, Result};
use indoc::writedoc;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::{File, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkItemExt, ChunkableModule, ChunkingContext, EvaluatableAssets},
    code_builder::{Code, CodeBuilder},
    module_graph::ModuleGraph,
    output::{OutputAsset, OutputAssets},
    source_map::{GenerateSourceMap, OptionStringifiedSourceMap, SourceMapAsset},
};
use turbopack_ecmascript::{chunk::EcmascriptChunkPlaceable, utils::StringifyJs};

use super::runtime::EcmascriptBuildNodeRuntimeChunk;
use crate::NodeJsChunkingContext;

/// An Ecmascript chunk that loads a list of parallel chunks, then instantiates
/// runtime entries.
#[turbo_tasks::value(shared)]
pub(crate) struct EcmascriptBuildNodeEntryChunk {
    path: ResolvedVc<FileSystemPath>,
    other_chunks: ResolvedVc<OutputAssets>,
    evaluatable_assets: ResolvedVc<EvaluatableAssets>,
    exported_module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    module_graph: ResolvedVc<ModuleGraph>,
    chunking_context: ResolvedVc<NodeJsChunkingContext>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBuildNodeEntryChunk {
    /// Creates a new [`Vc<EcmascriptBuildNodeEntryChunk>`].
    #[turbo_tasks::function]
    pub fn new(
        path: ResolvedVc<FileSystemPath>,
        other_chunks: ResolvedVc<OutputAssets>,
        evaluatable_assets: ResolvedVc<EvaluatableAssets>,
        exported_module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<NodeJsChunkingContext>,
    ) -> Vc<Self> {
        EcmascriptBuildNodeEntryChunk {
            path,
            other_chunks,
            evaluatable_assets,
            exported_module,
            module_graph,
            chunking_context,
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn code(self: Vc<Self>) -> Result<Vc<Code>> {
        let this = self.await?;

        let output_root = this.chunking_context.output_root().await?;
        let chunk_path = self.path().await?;
        let chunk_directory = self.path().parent().await?;
        let runtime_path = self.runtime_chunk().path().await?;
        let runtime_relative_path =
            if let Some(path) = chunk_directory.get_relative_path_to(&runtime_path) {
                path
            } else {
                bail!(
                    "cannot find a relative path from the chunk ({}) to the runtime chunk ({})",
                    chunk_path.to_string(),
                    runtime_path.to_string(),
                );
            };
        let chunk_public_path = if let Some(path) = output_root.get_path_to(&chunk_path) {
            path
        } else {
            bail!(
                "chunk path ({}) is not in output root ({})",
                chunk_path.to_string(),
                output_root.to_string()
            );
        };

        let mut code = CodeBuilder::default();

        writedoc!(
            code,
            r#"
                const CHUNK_PUBLIC_PATH = {};
                const runtime = require({});
            "#,
            StringifyJs(chunk_public_path),
            StringifyJs(&*runtime_relative_path)
        )?;

        let other_chunks = this.other_chunks.await?;
        for other_chunk in &*other_chunks {
            let other_chunk_path = &*other_chunk.path().await?;
            if let Some(other_chunk_public_path) = output_root.get_path_to(other_chunk_path) {
                writedoc!(
                    code,
                    // TODO(WEB-1112) This should call `require()` directly, perhaps as an argument
                    // to `loadChunk`.
                    r#"
                        runtime.loadChunk({});
                    "#,
                    StringifyJs(&other_chunk_public_path)
                )?;
            }
        }

        let evaluatable_assets = this.evaluatable_assets.await?;
        for evaluatable_asset in &*evaluatable_assets {
            if let Some(placeable) =
                ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(*evaluatable_asset)
            {
                let runtime_module_id = placeable
                    .as_chunk_item(*this.module_graph, Vc::upcast(*this.chunking_context))
                    .id()
                    .await?;

                writedoc!(
                    code,
                    r#"
                        runtime.getOrInstantiateRuntimeModule({}, CHUNK_PUBLIC_PATH);
                    "#,
                    StringifyJs(&*runtime_module_id),
                )?;
            }
        }

        let runtime_module_id = this
            .exported_module
            .as_chunk_item(*this.module_graph, Vc::upcast(*this.chunking_context))
            .id()
            .await?;

        writedoc!(
            code,
            r#"
                    module.exports = runtime.getOrInstantiateRuntimeModule({}, CHUNK_PUBLIC_PATH).exports;
                "#,
            StringifyJs(&*runtime_module_id),
        )?;

        Ok(Code::cell(code.build()))
    }

    #[turbo_tasks::function]
    fn runtime_chunk(&self) -> Vc<EcmascriptBuildNodeRuntimeChunk> {
        EcmascriptBuildNodeRuntimeChunk::new(*self.chunking_context)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptBuildNodeEntryChunk {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell("Ecmascript Build Node Evaluate Chunk".into())
    }
}

#[turbo_tasks::function]
fn modifier() -> Vc<RcStr> {
    Vc::cell("ecmascript build node evaluate chunk".into())
}

#[turbo_tasks::function]
fn chunk_reference_description() -> Vc<RcStr> {
    Vc::cell("chunk".into())
}

#[turbo_tasks::value_impl]
impl OutputAsset for EcmascriptBuildNodeEntryChunk {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        *self.path
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        let mut references = vec![ResolvedVc::upcast(
            self.runtime_chunk().to_resolved().await?,
        )];

        if *this
            .chunking_context
            .reference_chunk_source_maps(Vc::upcast(self))
            .await?
        {
            references.push(ResolvedVc::upcast(
                SourceMapAsset::new(Vc::upcast(self)).to_resolved().await?,
            ))
        }

        let other_chunks = this.other_chunks.await?;
        for &other_chunk in &*other_chunks {
            references.push(ResolvedVc::upcast(other_chunk));
        }

        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptBuildNodeEntryChunk {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let code = self.code().await?;
        Ok(AssetContent::file(
            File::from(code.source_code().clone()).into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for EcmascriptBuildNodeEntryChunk {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<OptionStringifiedSourceMap> {
        self.code().generate_source_map()
    }
}
