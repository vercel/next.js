use std::{io::Write, sync::LazyLock};

use anyhow::{Result, bail};
use regex::Regex;
use smallvec::smallvec;
use tracing::Instrument;
use turbo_rcstr::rcstr;
use turbo_tasks::{FxIndexMap, FxIndexSet, ResolvedVc, TryJoinIterExt, ValueToString, Vc};
use turbo_tasks_fs::{FileContent, rope::Rope};
use turbopack::{ModuleAssetContext, module_options::CustomModuleType};
use turbopack_core::{
    asset::Asset,
    chunk::{AsyncModuleInfo, ChunkableModule, ChunkingContext},
    code_builder::CodeBuilder,
    compile_time_info::{
        CompileTimeDefineValue, CompileTimeInfo, DefinableNameSegmentRef, DefinableNameSegmentRefs,
        FreeVarReference,
    },
    context::AssetContext,
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    module_graph::ModuleGraph,
    reference_type::ReferenceType,
    source::{OptionSource, Source},
    source_map::GenerateSourceMap,
};
use turbopack_ecmascript::{
    EcmascriptInputTransforms,
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkItemOptions, EcmascriptChunkPlaceable,
        EcmascriptExports, ecmascript_chunk_item,
    },
    source_map::{extract_source_mapping_url_from_content, parse_source_map_comment},
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
        _reference_type: ReferenceType,
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
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(turbo_tasks::read!(self.source.ident().owned())?
            .with_modifier(rcstr!("raw"))
            .into_vc())
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionSource> {
        Vc::cell(Some(self.source))
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        ModuleSideEffects::SideEffectful.cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for RawEcmascriptModule {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        ecmascript_chunk_item(ResolvedVc::upcast(self), module_graph, chunking_context)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for RawEcmascriptModule {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::CommonJs.cell()
    }

    #[turbo_tasks::function]
    async fn chunk_item_content(
        self: Vc<Self>,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        _estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let span = tracing::info_span!(
            "code generation raw module",
            name = display(turbo_tasks::read!(self.ident().to_string())?)
        );

        #[cfg(not(feature = "sync"))]
        {
            turbo_tasks::read!(
                async {
                    let module = turbo_tasks::read!(self)?;
                    let source = module.source;
                    let content = turbo_tasks::read!(source.content().file_content())?;
                    let content = match &*content {
                        FileContent::Content(file) => file.content(),
                        FileContent::NotFound => bail!("RawEcmascriptModule content not found"),
                    };

                    static ENV_REGEX: LazyLock<Regex> =
                        LazyLock::new(|| Regex::new(r"process\.env\.([a-zA-Z0-9_]+)").unwrap());

                    let content_str = content.to_str()?;

                    let mut env_vars = FxIndexSet::default();
                    for (_, [name]) in ENV_REGEX.captures_iter(&content_str).map(|c| c.extract()) {
                        env_vars.insert(name);
                    }

                    let mut code = CodeBuilder::default();
                    if !env_vars.is_empty() {
                        let replacements =
                            turbo_tasks::read!(module.compile_time_info)?.free_var_references;
                        code += "var process = {env:\n";
                        writeln!(
                            code,
                            "{}",
                            StringifyJs(
                                &turbo_tasks::read!(
                                    env_vars
                                        .into_iter()
                                        .map(async |name| {
                                            Ok((
                                                name,
                                                if let Some(value) =
                                                    turbo_tasks::read!(replacements.get(
                                                        &DefinableNameSegmentRefs(smallvec![
                                                            DefinableNameSegmentRef::Name(
                                                                "process"
                                                            ),
                                                            DefinableNameSegmentRef::Name("env"),
                                                            DefinableNameSegmentRef::Name(name),
                                                        ])
                                                    ))?
                                                {
                                                    let value = match &*value {
                                                        FreeVarReference::Value(
                                                            CompileTimeDefineValue::String(value),
                                                        ) => serde_json::Value::String(
                                                            value.to_string(),
                                                        ),
                                                        FreeVarReference::Value(
                                                            CompileTimeDefineValue::Bool(value),
                                                        ) => serde_json::Value::Bool(*value),
                                                        _ => {
                                                            bail!(
                                                                "Unexpected replacement for \
                                                                 process.env.{name} in \
                                                                 RawEcmascriptModule: {value:?}"
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
                                )?
                                .into_iter()
                                .collect::<FxIndexMap<_, _>>()
                            )
                        )?;
                        code += "};\n";
                    }

                    code += "(function(){\n";
                    let source_mapping_url = extract_source_mapping_url_from_content(&content_str);
                    let source_map = if let Some((source_map, _)) =
                        turbo_tasks::read!(parse_source_map_comment(
                            source,
                            source_mapping_url,
                            &turbo_tasks::read!(self.ident())?.path
                        ))? {
                        let source_map = turbo_tasks::read!(source_map.generate_source_map())?;
                        source_map.as_content().map(|f| f.content().clone())
                    } else {
                        None
                    };
                    code.push_source(content, source_map);

                    // Add newline in case the raw code had a comment as the last line and no final
                    // newline.
                    code += "\n})();\n";

                    let code = code.build();
                    let source_map = if code.has_source_map() {
                        let source_map = code.generate_source_map_ref(None);

                        static SECTIONS_REGEX: LazyLock<Regex> =
                            LazyLock::new(|| Regex::new(r#"sections"[\s\n]*:"#).unwrap());
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
                                // without flattening the index map, we would get nested index
                                // source maps in the output chunks,
                                // which are apparently not
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
                    .cell())
                }
                .instrument(span)
            )
        }
        #[cfg(feature = "sync")]
        {
            let _guard = span.entered();
            let module = turbo_tasks::read!(self)?;
            let source = module.source;
            let content = turbo_tasks::read!(source.content().file_content())?;
            let content = match &*content {
                FileContent::Content(file) => file.content(),
                FileContent::NotFound => bail!("RawEcmascriptModule content not found"),
            };

            static ENV_REGEX: LazyLock<Regex> =
                LazyLock::new(|| Regex::new(r"process\.env\.([a-zA-Z0-9_]+)").unwrap());

            let content_str = content.to_str()?;

            let mut env_vars = FxIndexSet::default();
            for (_, [name]) in ENV_REGEX.captures_iter(&content_str).map(|c| c.extract()) {
                env_vars.insert(name);
            }

            let mut code = CodeBuilder::default();
            if !env_vars.is_empty() {
                let replacements =
                    turbo_tasks::read!(module.compile_time_info)?.free_var_references;
                code += "var process = {env:\n";
                let mut env_pairs = Vec::new();
                for name in env_vars.into_iter() {
                    env_pairs.push((
                        name,
                        if let Some(value) = turbo_tasks::read!(replacements.get(
                            &DefinableNameSegmentRefs(smallvec![
                                DefinableNameSegmentRef::Name("process"),
                                DefinableNameSegmentRef::Name("env"),
                                DefinableNameSegmentRef::Name(name),
                            ])
                        ))? {
                            let value = match &*value {
                                FreeVarReference::Value(CompileTimeDefineValue::String(value)) => {
                                    serde_json::Value::String(value.to_string())
                                }
                                FreeVarReference::Value(CompileTimeDefineValue::Bool(value)) => {
                                    serde_json::Value::Bool(*value)
                                }
                                _ => {
                                    bail!(
                                        "Unexpected replacement for process.env.{name} in \
                                         RawEcmascriptModule: {value:?}"
                                    );
                                }
                            };
                            Some(value)
                        } else {
                            None
                        },
                    ));
                }
                writeln!(
                    code,
                    "{}",
                    StringifyJs(&env_pairs.into_iter().collect::<FxIndexMap<_, _>>())
                )?;
                code += "};\n";
            }

            code += "(function(){\n";
            let source_mapping_url = extract_source_mapping_url_from_content(&content_str);
            let source_map = if let Some((source_map, _)) =
                turbo_tasks::read!(parse_source_map_comment(
                    source,
                    source_mapping_url,
                    &turbo_tasks::read!(self.ident())?.path
                ))? {
                let source_map = turbo_tasks::read!(source_map.generate_source_map())?;
                source_map.as_content().map(|f| f.content().clone())
            } else {
                None
            };
            code.push_source(content, source_map);

            // Add newline in case the raw code had a comment as the last line and no final newline.
            code += "\n})();\n";

            let code = code.build();
            let source_map = if code.has_source_map() {
                let source_map = code.generate_source_map_ref(None);

                static SECTIONS_REGEX: LazyLock<Regex> =
                    LazyLock::new(|| Regex::new(r#"sections"[\s\n]*:"#).unwrap());
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
            .cell())
        }
    }
}
