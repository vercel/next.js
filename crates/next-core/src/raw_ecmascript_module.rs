use std::{io::Write, sync::LazyLock};

use anyhow::{Result, bail};
use regex::Regex;
use smallvec::smallvec;
use tracing::Instrument;
use turbo_rcstr::rcstr;
use turbo_tasks::{FxIndexMap, FxIndexSet, JoinIterExt, ResolvedVc, ValueToString, Vc};
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
    source_map::{GenerateSourceMap, SourceMapType, structured::StructuredSourceMap},
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
        Ok(self
            .source
            .ident()
            .owned()
            .await?
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
        EcmascriptExports::CommonJs(None).cell()
    }

    #[turbo_tasks::function]
    async fn chunk_item_content(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        _estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let span = tracing::info_span!(
            "code generation raw module",
            name = display(self.ident().to_string().await?)
        );

        async {
            let module = self.await?;
            let source = module.source;
            let content = source.content().file_content().await?;
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

            let generation = *chunking_context.source_map_generation().await?;
            let mut code = CodeBuilder::new(generation, false);
            if !env_vars.is_empty() {
                let replacements = module.compile_time_info.await?.free_var_references;
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
                                    if let Some(value) = replacements
                                        .get(&DefinableNameSegmentRefs(smallvec![
                                            DefinableNameSegmentRef::Name("process"),
                                            DefinableNameSegmentRef::Name("env"),
                                            DefinableNameSegmentRef::Name(name),
                                        ]))
                                        .await?
                                    {
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
                            .join()
                            .await
                            .into_iter()
                            .collect::<Result<FxIndexMap<_, _>>>()?
                    )
                )?;
                code += "};\n";
            }

            code += "(function(){\n";
            let source_mapping_url = extract_source_mapping_url_from_content(&content_str);
            let source_map = if generation.full {
                if let Some((source_map, _)) =
                    parse_source_map_comment(source, source_mapping_url, &self.ident().await?.path)
                        .await?
                {
                    let source_map = source_map
                        .generate_source_map(SourceMapType::Full.cell())
                        .await?;
                    source_map.as_content().map(|f| f.content().clone())
                } else {
                    None
                }
            } else {
                None
            };
            let partial_source_map = if generation.partial {
                let mut map = swc_sourcemap::SourceMapBuilder::new(None);
                let source_id = map.add_source(self.ident().to_string().await?.to_string().into());
                map.set_source_contents(source_id, Some(content_str.clone().into_owned().into()));
                for (line, _) in content_str.split_inclusive('\n').enumerate() {
                    map.add_raw(line as u32, 0, line as u32, 0, Some(source_id), None, false);
                }
                let mut bytes = Vec::new();
                map.into_sourcemap().to_writer(&mut bytes)?;
                Some(Rope::from(bytes))
            } else {
                None
            };
            code.push_source(content, source_map, partial_source_map);

            // Add newline in case the raw code had a comment as the last line and no final newline.
            code += "\n})();\n";

            let code = code.build();
            let generate_map = |ty| -> Result<Option<StructuredSourceMap>> {
                let source_map = if code.has_source_map_for(ty) {
                    let source_map = code.generate_source_map_ref(None, ty);

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
                            // without flattening the index map, we would get nested index source
                            // maps in the output chunks, which are
                            // apparently not supported
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

                source_map
                    .map(|map| StructuredSourceMap::from_json(&map))
                    .transpose()
            };
            let source_map = generate_map(SourceMapType::Full)?;
            let partial_source_map = generate_map(SourceMapType::Partial)?;
            Ok(EcmascriptChunkItemContent {
                source_map,
                partial_source_map,
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
        .await
    }
}

#[cfg(test)]
mod tests {
    use anyhow::Result;
    use base64::{Engine, engine::general_purpose::STANDARD};
    use turbo_rcstr::rcstr;
    use turbo_tasks::{TurboTasks, ValueToString, Vc};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
    use turbo_tasks_fs::{File, FileContent, FileSystem, VirtualFileSystem};
    use turbopack_browser::BrowserChunkingContext;
    use turbopack_core::{
        asset::AssetContent,
        chunk::ChunkingContext,
        compile_time_info::CompileTimeInfo,
        environment::{Environment, ExecutionEnvironment},
        module::Module,
        module_graph::ModuleGraph,
        source_map::{SourceMapGeneration, SourceMapType},
        virtual_source::VirtualSource,
    };
    use turbopack_ecmascript::chunk::EcmascriptChunkPlaceable;
    use turbopack_ecmascript_runtime::RuntimeType;
    use turbopack_nodejs::NodeJsChunkingContext;

    use crate::raw_ecmascript_module::RawEcmascriptModule;

    #[turbo_tasks::function(operation, root)]
    async fn source_map_builder_order_operation() -> Result<()> {
        let root = VirtualFileSystem::new().root().owned().await?;
        let environment = Environment::new(ExecutionEnvironment::Custom(0))
            .to_resolved()
            .await?;
        let browser = || {
            BrowserChunkingContext::builder(
                root.clone(),
                root.clone(),
                rcstr!("."),
                root.clone(),
                root.clone(),
                root.clone(),
                environment,
                RuntimeType::Production,
            )
        };
        let node = || {
            NodeJsChunkingContext::builder(
                root.clone(),
                root.clone(),
                rcstr!("."),
                root.clone(),
                root.clone(),
                root.clone(),
                environment,
                RuntimeType::Production,
            )
        };

        for emitted in [
            None,
            Some(SourceMapType::Full),
            Some(SourceMapType::Partial),
        ] {
            for full in [false, true] {
                for partial in [false, true] {
                    let generation = SourceMapGeneration { full, partial };
                    let chunking_contexts: [Vc<Box<dyn ChunkingContext>>; 4] = [
                        Vc::upcast(
                            browser()
                                .source_maps(emitted)
                                .source_map_generation(generation)
                                .build(),
                        ),
                        Vc::upcast(
                            browser()
                                .source_map_generation(generation)
                                .source_maps(emitted)
                                .build(),
                        ),
                        Vc::upcast(
                            node()
                                .source_maps(emitted)
                                .source_map_generation(generation)
                                .build(),
                        ),
                        Vc::upcast(
                            node()
                                .source_map_generation(generation)
                                .source_maps(emitted)
                                .build(),
                        ),
                    ];
                    for chunking_context in chunking_contexts {
                        let actual = chunking_context.source_map_generation().await?;
                        assert_eq!(actual.full, full || emitted == Some(SourceMapType::Full));
                        assert_eq!(
                            actual.partial,
                            partial || emitted == Some(SourceMapType::Partial)
                        );
                        assert_eq!(*chunking_context.emitted_source_map_type().await?, emitted);
                    }
                }
            }
            let chunking_contexts: [Vc<Box<dyn ChunkingContext>>; 2] = [
                Vc::upcast(browser().source_maps(emitted).build()),
                Vc::upcast(node().source_maps(emitted).build()),
            ];
            for chunking_context in chunking_contexts {
                let actual = chunking_context.source_map_generation().await?;
                assert_eq!(actual.full, emitted == Some(SourceMapType::Full));
                assert_eq!(actual.partial, emitted == Some(SourceMapType::Partial));
            }
        }
        let defaults: [Vc<Box<dyn ChunkingContext>>; 2] =
            [Vc::upcast(browser().build()), Vc::upcast(node().build())];
        for chunking_context in defaults {
            let actual = chunking_context.source_map_generation().await?;
            assert!(actual.full);
            assert!(!actual.partial);
        }
        Ok(())
    }

    #[turbo_tasks::function(operation, root)]
    async fn raw_module_source_maps_operation() -> Result<()> {
        let root = VirtualFileSystem::new().root().owned().await?;
        let environment = Environment::new(ExecutionEnvironment::Custom(0))
            .to_resolved()
            .await?;
        let input_map = STANDARD.encode(serde_json::to_vec(&serde_json::json!({
            "version": 3,
            "sources": ["original-raw.ts"],
            "sourcesContent": ["const original = 1;\nexport { original };"],
            "names": [],
            "mappings": "AAAA;AACA",
        }))?);
        let source_code = format!(
            "globalThis.raw = 1;\nglobalThis.raw += 2;\n//# \
             sourceMappingURL=data:application/json;base64,{input_map}"
        );
        let source = VirtualSource::new(
            root.join("raw.js")?,
            AssetContent::file(FileContent::Content(File::from(source_code.clone())).cell()),
        );
        let module =
            RawEcmascriptModule::new(Vc::upcast(source), CompileTimeInfo::new(*environment));
        let ident = module.ident().to_string().await?;
        let graph = ModuleGraph::from_graphs(vec![], None).connect();
        let mut results = Vec::new();
        for generation in [
            SourceMapGeneration::NONE,
            SourceMapGeneration {
                full: true,
                partial: false,
            },
            SourceMapGeneration {
                full: false,
                partial: true,
            },
            SourceMapGeneration {
                full: true,
                partial: true,
            },
        ] {
            let chunking_context = NodeJsChunkingContext::builder(
                root.clone(),
                root.clone(),
                rcstr!("."),
                root.clone(),
                root.clone(),
                root.clone(),
                environment,
                RuntimeType::Production,
            )
            .source_map_generation(generation)
            .source_maps(None)
            .build();
            let content = module
                .chunk_item_content(Vc::upcast(chunking_context), graph, None, false)
                .await?;
            assert_eq!(
                content.inner_code.to_str()?,
                format!("(function(){{\n{source_code}\n}})();\n")
            );
            assert_eq!(content.source_map.is_some(), generation.full);
            assert_eq!(content.partial_source_map.is_some(), generation.partial);
            if let Some(map) = &content.partial_source_map {
                let map = swc_sourcemap::SourceMap::from_slice(&map.to_rope().to_bytes())?;
                assert_eq!(
                    map.get_source_contents(0).map(|source| source.as_str()),
                    Some(source_code.as_str())
                );
                for line in 0..3 {
                    let token = map.lookup_token(line + 1, 0).unwrap();
                    assert_eq!(
                        token.get_source().map(|source| source.as_str()),
                        Some(ident.as_str())
                    );
                    assert_eq!(token.get_src_line(), line);
                    assert_eq!(token.get_src_col(), 0);
                }
                assert!(
                    map.lookup_token(0, 0)
                        .and_then(|token| token.get_source())
                        .is_none()
                );
            }
            if let Some(map) = &content.source_map {
                let map = swc_sourcemap::SourceMap::from_slice(&map.to_rope().to_bytes())?;
                assert!(
                    map.lookup_token(1, 0)
                        .unwrap()
                        .get_source()
                        .unwrap()
                        .ends_with("original-raw.ts")
                );
            }
            results.push((
                content.source_map.clone(),
                content.partial_source_map.clone(),
            ));
        }
        assert_eq!(results[1].0, results[3].0);
        assert_eq!(results[2].1, results[3].1);
        Ok(())
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn source_map_builders_and_raw_module_maps() {
        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async {
            source_map_builder_order_operation()
                .read_strongly_consistent()
                .await?;
            raw_module_source_maps_operation()
                .read_strongly_consistent()
                .await?;
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }
}
