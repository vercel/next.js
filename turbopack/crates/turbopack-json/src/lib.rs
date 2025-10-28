//! JSON asset support for turbopack.
//!
//! JSON assets are parsed to ensure they contain valid JSON.
//!
//! When imported from ES modules, they produce a module that exports the
//! JSON value as an object.

#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use std::fmt::Write;

use anyhow::{Error, Result, bail};
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::{FileContent, FileJsonContent, glob::Glob};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkItem, ChunkType, ChunkableModule, ChunkingContext},
    code_builder::CodeBuilder,
    ident::AssetIdent,
    module::Module,
    module_graph::ModuleGraph,
    source::Source,
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkPlaceable,
        EcmascriptChunkType, EcmascriptExports,
    },
    runtime_functions::TURBOPACK_EXPORT_VALUE,
};

#[turbo_tasks::value]
pub struct JsonModuleAsset {
    source: ResolvedVc<Box<dyn Source>>,
}

#[turbo_tasks::value_impl]
impl JsonModuleAsset {
    #[turbo_tasks::function]
    pub fn new(source: ResolvedVc<Box<dyn Source>>) -> Vc<Self> {
        Self::cell(JsonModuleAsset { source })
    }
}

#[turbo_tasks::value_impl]
impl Module for JsonModuleAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source.ident().with_modifier(rcstr!("json"))
    }
}

#[turbo_tasks::value_impl]
impl Asset for JsonModuleAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for JsonModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        _module_graph: Vc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        Vc::upcast(JsonChunkItem::cell(JsonChunkItem {
            module: self,
            chunking_context,
        }))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for JsonModuleAsset {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.cell()
    }

    #[turbo_tasks::function]
    fn is_marked_as_side_effect_free(&self, _side_effect_free_packages: Vc<Glob>) -> Vc<bool> {
        Vc::cell(true)
    }
}

#[turbo_tasks::value]
struct JsonChunkItem {
    module: ResolvedVc<JsonModuleAsset>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl ChunkItem for JsonChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }

    #[turbo_tasks::function]
    async fn ty(&self) -> Result<Vc<Box<dyn ChunkType>>> {
        Ok(Vc::upcast(
            Vc::<EcmascriptChunkType>::default().resolve().await?,
        ))
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        Vc::upcast(*self.module)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for JsonChunkItem {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<EcmascriptChunkItemContent>> {
        // We parse to JSON and then stringify again to ensure that the
        // JSON is valid.
        let content = self.module.content().file_content();
        let data = content.parse_json().await?;
        match &*data {
            FileJsonContent::Content(data) => {
                let data_str = data.to_string();

                let mut code = CodeBuilder::default();

                let source_code = if data_str.len() > 10_000 {
                    // Only use JSON.parse if the content is larger than 10kb
                    // https://v8.dev/blog/cost-of-javascript-2019#json
                    let js_str_content = serde_json::to_string(&data_str)?;
                    format!("{TURBOPACK_EXPORT_VALUE}(JSON.parse({js_str_content}));")
                } else {
                    format!("{TURBOPACK_EXPORT_VALUE}({data_str});")
                };

                let source_code = source_code.into();
                let source_map = serde_json::json!({
                    "version": 3,
                    // TODO: Encode using `urlencoding`, so that these
                    // are valid URLs. However, `project_trace_source_operation` (and
                    // `uri_from_file`) need to handle percent encoding correctly first.
                    //
                    // See turbopack/crates/turbopack-core/src/source_map/utils.rs as well
                    "sources": [format!("turbopack:///{}", self.module.ident().path().to_string().await?)],
                    "sourcesContent": [&data_str],
                    "names": [],
                    // Maps 0:0 in the output code to 0:0 in the `source_code`. Sufficient for
                    // bundle analyzers to attribute the bytes in the output chunks
                    "mappings": "AAAA",
                })
                .to_string()
                .into();
                code.push_source(&source_code, Some(source_map));

                let code = code.build();
                Ok(EcmascriptChunkItemContent {
                    source_map: Some(code.generate_source_map_ref(None)),
                    inner_code: code.into_source_code(),
                    ..Default::default()
                }
                .into())
            }
            FileJsonContent::Unparsable(e) => {
                let mut message = "Unable to make a module from invalid JSON: ".to_string();
                if let FileContent::Content(content) = &*content.await? {
                    let text = content.content().to_str()?;
                    e.write_with_content(&mut message, text.as_ref())?;
                } else {
                    write!(message, "{e}")?;
                }

                Err(Error::msg(message))
            }
            FileJsonContent::NotFound => {
                bail!(
                    "JSON file not found: {}",
                    self.module.ident().to_string().await?
                );
            }
        }
    }
}
