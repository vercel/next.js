use std::io::Write;

use anyhow::{Result, bail};
use either::Either;
use once_cell::sync::Lazy;
use regex::Regex;
use tracing::Instrument;
use turbo_rcstr::rcstr;
use turbo_tasks::{FxIndexMap, FxIndexSet, ResolvedVc, TryJoinIterExt, ValueToString, Vc};
use turbo_tasks_fs::{FileContent, glob::Glob, rope::Rope};
use turbopack::{ModuleAssetContext, module_options::CustomModuleType};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkItem, ChunkType, ChunkableModule, ChunkingContext},
    code_builder::CodeBuilder,
    compile_time_info::{
        CompileTimeDefineValue, CompileTimeInfo, DefinableNameSegment, FreeVarReference,
    },
    context::AssetContext,
    ident::AssetIdent,
    module::Module,
    module_graph::ModuleGraph,
    resolve::ModulePart,
    source::Source,
    source_map::GenerateSourceMap,
};
use turbopack_ecmascript::{
    EcmascriptInputTransforms,
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemOptions,
        EcmascriptChunkPlaceable, EcmascriptChunkType, EcmascriptExports,
    },
    source_map::parse_source_map_comment,
    utils::StringifyJs,
};

#[turbo_tasks::value(shared)]
pub struct RawEcmascriptModuleType {}

#[turbo_tasks::value_impl]
impl CustomModuleType for RawEcmascriptModuleType {
    #[turbo_tasks::function]
    fn create_module(
        &self,
        source: Vc<Box<dyn Source>>,
        module_asset_context: Vc<ModuleAssetContext>,
        _part: Option<ModulePart>,
    ) -> Vc<Box<dyn Module>> {
        Vc::upcast(RawEcmascriptModule::new(
            source,
            module_asset_context.compile_time_info(),
        ))
    }

    #[turbo_tasks::function]
    fn extend_ecmascript_transforms(
        self: Vc<Self>,
        _preprocess: Vc<EcmascriptInputTransforms>,
        _main: Vc<EcmascriptInputTransforms>,
        _postprocess: Vc<EcmascriptInputTransforms>,
    ) -> Vc<Box<dyn CustomModuleType>> {
        // Just ignore them
        Vc::upcast(self)
    }
}

#[turbo_tasks::value]
pub struct RawEcmascriptModule {
    source: ResolvedVc<Box<dyn Source>>,
    compile_time_info: ResolvedVc<CompileTimeInfo>,
}

#[turbo_tasks::value_impl]
impl RawEcmascriptModule {
    #[turbo_tasks::function]
    pub fn new(
        source: ResolvedVc<Box<dyn Source>>,
        compile_time_info: ResolvedVc<CompileTimeInfo>,
    ) -> Vc<Self> {
        RawEcmascriptModule {
            source,
            compile_time_info,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl Module for RawEcmascriptModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source.ident().with_modifier(rcstr!("raw"))
    }
}

#[turbo_tasks::value_impl]
impl Asset for RawEcmascriptModule {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for RawEcmascriptModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        _module_graph: Vc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        Vc::upcast(
            RawEcmascriptChunkItem {
                module: self,
                chunking_context,
            }
            .cell(),
        )
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for RawEcmascriptModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::CommonJs.cell()
    }

    #[turbo_tasks::function]
    fn is_marked_as_side_effect_free(&self, _side_effect_free_packages: Vc<Glob>) -> Vc<bool> {
        Vc::cell(false)
    }
}

#[turbo_tasks::value]
struct RawEcmascriptChunkItem {
    module: ResolvedVc<RawEcmascriptModule>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl ChunkItem for RawEcmascriptChunkItem {
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
impl EcmascriptChunkItem for RawEcmascriptChunkItem {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<EcmascriptChunkItemContent>> {
        let span = tracing::info_span!(
            "code generation raw module",
            name = display(self.module.ident().to_string().await?)
        );

        async {
            let module = self.module.await?;
            let source = module.source;
            let content = source.content().file_content().await?;
            let content = match &*content {
                FileContent::Content(file) => file.content(),
                FileContent::NotFound => bail!("RawEcmascriptModule content not found"),
            };

            static ENV_REGEX: Lazy<Regex> =
                Lazy::new(|| Regex::new(r"process\.env\.([a-zA-Z0-9_]+)").unwrap());

            let content_str = content.to_str()?;

            let mut env_vars = FxIndexSet::default();
            for (_, [name]) in ENV_REGEX.captures_iter(&content_str).map(|c| c.extract()) {
                env_vars.insert(name);
            }

            let mut code = CodeBuilder::default();
            if !env_vars.is_empty() {
                let replacements = module
                    .compile_time_info
                    .await?
                    .free_var_references
                    .individual()
                    .await?;
                code += "var process = {env:\n";
                writeln!(
                    code,
                    "{}",
                    StringifyJs(
                        &env_vars
                            .into_iter()
                            .map(async |name| {
                                Ok((
                                    name,
                                    if let Some(value) =
                                        replacements.get(&DefinableNameSegment::Name(name.into()))
                                        && let Some((_, value)) = value.iter().find(|(path, _)| {
                                            matches!(
                                                path.as_slice(),
                                                [
                                                    DefinableNameSegment::Name(a),
                                                    DefinableNameSegment::Name(b)
                                                ] if a == "process" && b == "env"
                                            )
                                        })
                                    {
                                        let value = value.await?;
                                        let value = match &*value {
                                            FreeVarReference::Value(
                                                CompileTimeDefineValue::String(value),
                                            ) => serde_json::Value::String(value.to_string()),
                                            FreeVarReference::Value(
                                                CompileTimeDefineValue::Bool(value),
                                            ) => serde_json::Value::Bool(*value),
                                            _ => {
                                                bail!(
                                                    "Unexpected replacement for \
                                                     process.env.{name} in RawEcmascriptModule: \
                                                     {value:?}"
                                                );
                                            }
                                        };
                                        Some(value)
                                    } else {
                                        None
                                    },
                                ))
                            })
                            .try_join()
                            .await?
                            .into_iter()
                            .collect::<FxIndexMap<_, _>>()
                    )
                )?;
                code += "};\n";
            }

            code += "(function(){\n";
            let source_map = if let Some((source_map, _)) = parse_source_map_comment(
                source,
                Either::Right(&content_str),
                &*self.module.ident().path().await?,
            )
            .await?
            {
                source_map.generate_source_map().owned().await?
            } else {
                None
            };
            code.push_source(content, source_map);

            // Add newline in case the raw code had a comment as the last line and no final newline.
            code += "\n})();\n";

            let code = code.build();
            let source_map = if code.has_source_map() {
                let source_map = code.generate_source_map_ref(None);

                static SECTIONS_REGEX: Lazy<Regex> =
                    Lazy::new(|| Regex::new(r#"sections"[\s\n]*:"#).unwrap());
                Some(if !SECTIONS_REGEX.is_match(&source_map.to_str()?) {
                    // This is definitely not an index source map
                    source_map
                } else {
                    let _span = tracing::span!(
                        tracing::Level::WARN,
                        "flattening index source map in RawEcmascriptModule"
                    )
                    .entered();
                    match swc_sourcemap::lazy::decode(&source_map.to_bytes())? {
                        swc_sourcemap::lazy::DecodedMap::Regular(_) => source_map,
                        // without flattening the index map, we would get nested index source maps
                        // in the output chunks, which are apparently not
                        // supported
                        swc_sourcemap::lazy::DecodedMap::Index(source_map) => {
                            let source_map = source_map.flatten()?.into_raw_sourcemap();
                            let result = serde_json::to_vec(&source_map)?;
                            Rope::from(result)
                        }
                    }
                })
            } else {
                None
            };

            Ok(EcmascriptChunkItemContent {
                source_map,
                inner_code: code.into_source_code(),
                options: EcmascriptChunkItemOptions {
                    module_and_exports: true,
                    ..Default::default()
                },
                ..Default::default()
            }
            .into())
        }
        .instrument(span)
        .await
    }
}
