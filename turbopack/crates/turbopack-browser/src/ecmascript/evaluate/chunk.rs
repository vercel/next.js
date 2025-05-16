use std::io::Write;

use anyhow::{Result, bail};
use either::Either;
use indoc::writedoc;
use serde::Serialize;
use turbo_rcstr::RcStr;
use turbo_tasks::{ReadRef, ResolvedVc, TryJoinIterExt, Value, ValueToString, Vc};
use turbo_tasks_fs::{File, FileSystemPath, rope::RopeBuilder};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        ChunkData, ChunkingContext, ChunksData, EvaluatableAssets, MinifyType,
        ModuleChunkItemIdExt, ModuleId,
    },
    code_builder::{Code, CodeBuilder},
    ident::AssetIdent,
    module::Module,
    module_graph::ModuleGraph,
    output::{OutputAsset, OutputAssets},
    source_map::{GenerateSourceMap, OptionStringifiedSourceMap, SourceMapAsset},
};
use turbopack_ecmascript::{
    chunk::{EcmascriptChunkData, EcmascriptChunkPlaceable},
    minify::minify,
    utils::StringifyJs,
};
use turbopack_ecmascript_runtime::RuntimeType;

use crate::{
    BrowserChunkingContext,
    chunking_context::{CURRENT_CHUNK_METHOD_DOCUMENT_CURRENT_SCRIPT_EXPR, CurrentChunkMethod},
};

/// An Ecmascript chunk that:
/// * Contains the Turbopack browser runtime code; and
/// * Evaluates a list of runtime entries.
#[turbo_tasks::value(shared)]
pub(crate) struct EcmascriptBrowserEvaluateChunk {
    chunking_context: ResolvedVc<BrowserChunkingContext>,
    ident: ResolvedVc<AssetIdent>,
    other_chunks: ResolvedVc<OutputAssets>,
    evaluatable_assets: ResolvedVc<EvaluatableAssets>,
    // TODO(sokra): It's weird to use ModuleGraph here, we should convert evaluatable_assets to a
    // list of chunk items before passing it to this struct
    module_graph: ResolvedVc<ModuleGraph>,
}

#[turbo_tasks::value_impl]
impl EcmascriptBrowserEvaluateChunk {
    /// Creates a new [`Vc<EcmascriptBrowserEvaluateChunk>`].
    #[turbo_tasks::function]
    pub fn new(
        chunking_context: ResolvedVc<BrowserChunkingContext>,
        ident: ResolvedVc<AssetIdent>,
        other_chunks: ResolvedVc<OutputAssets>,
        evaluatable_assets: ResolvedVc<EvaluatableAssets>,
        module_graph: ResolvedVc<ModuleGraph>,
    ) -> Vc<Self> {
        EcmascriptBrowserEvaluateChunk {
            chunking_context,
            ident,
            other_chunks,
            evaluatable_assets,
            module_graph,
        }
        .cell()
    }

    #[turbo_tasks::function]
    fn chunks_data(&self) -> Vc<ChunksData> {
        ChunkData::from_assets(self.chunking_context.output_root(), *self.other_chunks)
    }

    #[turbo_tasks::function]
    async fn code(self: Vc<Self>) -> Result<Vc<Code>> {
        let this = self.await?;
        let chunking_context = this.chunking_context.await?;
        let environment = this.chunking_context.environment();

        let output_root_to_root_path = this.chunking_context.output_root_to_root_path();
        let source_maps = *this
            .chunking_context
            .reference_chunk_source_maps(Vc::upcast(self))
            .await?;
        // Lifetime hack to pull out the var into this scope
        let chunk_path;
        let script_or_path = match *this.chunking_context.current_chunk_method().await? {
            CurrentChunkMethod::StringLiteral => {
                let output_root = this.chunking_context.output_root().await?;
                let chunk_path_vc = self.path();
                chunk_path = chunk_path_vc.await?;
                let chunk_server_path = if let Some(path) = output_root.get_path_to(&chunk_path) {
                    path
                } else {
                    bail!(
                        "chunk path {} is not in output root {}",
                        chunk_path.to_string(),
                        output_root.to_string()
                    );
                };
                Either::Left(StringifyJs(chunk_server_path))
            }
            CurrentChunkMethod::DocumentCurrentScript => {
                Either::Right(CURRENT_CHUNK_METHOD_DOCUMENT_CURRENT_SCRIPT_EXPR)
            }
        };

        let other_chunks_data = self.chunks_data().await?;
        let other_chunks_data = other_chunks_data.iter().try_join().await?;
        let other_chunks_data: Vec<_> = other_chunks_data
            .iter()
            .map(|chunk_data| EcmascriptChunkData::new(chunk_data))
            .collect();

        let runtime_module_ids = this
            .evaluatable_assets
            .await?
            .iter()
            .map({
                let chunking_context = this.chunking_context;
                move |entry| async move {
                    if let Some(placeable) =
                        ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(*entry)
                    {
                        Ok(Some(
                            placeable
                                .chunk_item_id(Vc::upcast(*chunking_context))
                                .await?,
                        ))
                    } else {
                        Ok(None)
                    }
                }
            })
            .try_join()
            .await?
            .into_iter()
            .flatten()
            .collect();

        let params = EcmascriptBrowserChunkRuntimeParams {
            other_chunks: &other_chunks_data,
            runtime_module_ids,
        };

        let mut code = CodeBuilder::new(source_maps);

        // We still use the `TURBOPACK` global variable to store the chunk here,
        // as there may be another runtime already loaded in the page.
        // This is the case in integration tests.
        writedoc!(
            code,
            r#"
                (globalThis.TURBOPACK = globalThis.TURBOPACK || []).push([
                    {script_or_path},
                    {{}},
                    {}
                ]);
            "#,
            StringifyJs(&params),
        )?;

        match chunking_context.runtime_type() {
            RuntimeType::Development => {
                let runtime_code = turbopack_ecmascript_runtime::get_browser_runtime_code(
                    environment,
                    chunking_context.chunk_base_path(),
                    chunking_context.chunk_suffix_path(),
                    Value::new(chunking_context.runtime_type()),
                    output_root_to_root_path,
                    source_maps,
                );
                code.push_code(&*runtime_code.await?);
            }
            RuntimeType::Production => {
                let runtime_code = turbopack_ecmascript_runtime::get_browser_runtime_code(
                    environment,
                    chunking_context.chunk_base_path(),
                    chunking_context.chunk_suffix_path(),
                    Value::new(chunking_context.runtime_type()),
                    output_root_to_root_path,
                    source_maps,
                );
                code.push_code(&*runtime_code.await?);
            }
            #[cfg(feature = "test")]
            RuntimeType::Dummy => {
                let runtime_code = turbopack_ecmascript_runtime::get_dummy_runtime_code();
                code.push_code(&runtime_code);
            }
        }

        let mut code = code.build();

        if let MinifyType::Minify { mangle } = this.chunking_context.await?.minify_type() {
            code = minify(&code, source_maps, mangle)?;
        }

        Ok(code.cell())
    }

    #[turbo_tasks::function]
    async fn ident_for_path(&self) -> Result<Vc<AssetIdent>> {
        let mut ident = self.ident.owned().await?;

        ident.add_modifier(modifier().to_resolved().await?);

        let evaluatable_assets = self.evaluatable_assets.await?;
        ident.modifiers.extend(
            evaluatable_assets
                .iter()
                .map(|entry| entry.ident().to_string().to_resolved())
                .try_join()
                .await?,
        );

        ident.modifiers.extend(
            self.other_chunks
                .await?
                .iter()
                .map(|chunk| chunk.path().to_string().to_resolved())
                .try_join()
                .await?,
        );

        Ok(AssetIdent::new(Value::new(ident)))
    }

    #[turbo_tasks::function]
    async fn source_map(self: Vc<Self>) -> Result<Vc<SourceMapAsset>> {
        let this = self.await?;
        Ok(SourceMapAsset::new(
            Vc::upcast(*this.chunking_context),
            self.ident_for_path(),
            Vc::upcast(self),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for EcmascriptBrowserEvaluateChunk {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell("Ecmascript Browser Evaluate Chunk".into())
    }
}

#[turbo_tasks::function]
fn modifier() -> Vc<RcStr> {
    Vc::cell("ecmascript browser evaluate chunk".into())
}

#[turbo_tasks::value_impl]
impl OutputAsset for EcmascriptBrowserEvaluateChunk {
    #[turbo_tasks::function]
    async fn path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        let this = self.await?;
        let ident = self.ident_for_path();
        Ok(this
            .chunking_context
            .chunk_path(Some(Vc::upcast(self)), ident, ".js".into()))
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;
        let mut references = Vec::new();

        let include_source_map = *this
            .chunking_context
            .reference_chunk_source_maps(Vc::upcast(self))
            .await?;

        if include_source_map {
            references.push(ResolvedVc::upcast(self.source_map().to_resolved().await?));
        }

        for chunk_data in &*self.chunks_data().await? {
            references.extend(chunk_data.references().await?.iter().copied());
        }

        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptBrowserEvaluateChunk {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let code = self.code().await?;

        let rope = if code.has_source_map() {
            let mut rope_builder = RopeBuilder::default();
            rope_builder.concat(code.source_code());
            let source_map_path = self.source_map().path().await?;
            write!(
                rope_builder,
                "\n\n//# sourceMappingURL={}",
                urlencoding::encode(source_map_path.file_name())
            )?;
            rope_builder.build()
        } else {
            code.source_code().clone()
        };

        Ok(AssetContent::file(File::from(rope).into()))
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for EcmascriptBrowserEvaluateChunk {
    #[turbo_tasks::function]
    fn generate_source_map(self: Vc<Self>) -> Vc<OptionStringifiedSourceMap> {
        self.code().generate_source_map()
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EcmascriptBrowserChunkRuntimeParams<'a, T> {
    /// Other chunks in the chunk group this chunk belongs to, if any. Does not
    /// include the chunk itself.
    ///
    /// These chunks must be loaed before the runtime modules can be
    /// instantiated.
    other_chunks: &'a [T],
    /// List of module IDs that this chunk should instantiate when executed.
    runtime_module_ids: Vec<ReadRef<ModuleId>>,
}
