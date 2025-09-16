use std::io::Write;

use anyhow::{Result, bail};
use once_cell::sync::Lazy;
use regex::Regex;
use turbo_rcstr::rcstr;
use turbo_tasks::{FxIndexMap, FxIndexSet, ResolvedVc, TryJoinIterExt, Vc};
use turbo_tasks_fs::{FileContent, glob::Glob, rope::RopeBuilder};
use turbopack::{ModuleAssetContext, module_options::CustomModuleType};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkItem, ChunkType, ChunkableModule, ChunkingContext},
    compile_time_info::{
        CompileTimeDefineValue, CompileTimeInfo, DefinableNameSegment, FreeVarReference,
    },
    context::AssetContext,
    ident::AssetIdent,
    module::Module,
    module_graph::ModuleGraph,
    resolve::ModulePart,
    source::Source,
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemOptions,
        EcmascriptChunkPlaceable, EcmascriptChunkType, EcmascriptExports,
    },
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
        Vc::upcast(RawEcmascriptChunkItem::cell(RawEcmascriptChunkItem {
            module: self,
            chunking_context,
        }))
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
        let content = self.module.content().file_content().await?;
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

        let mut inner_code = RopeBuilder::default();
        if !env_vars.is_empty() {
            let replacements = self
                .module
                .await?
                .compile_time_info
                .await?
                .free_var_references
                .individual()
                .await?;
            inner_code += "var process = {env:\n";
            writeln!(
                inner_code,
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
                                        FreeVarReference::Value(CompileTimeDefineValue::Bool(
                                            value,
                                        )) => serde_json::Value::Bool(*value),
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
                            ))
                        })
                        .try_join()
                        .await?
                        .into_iter()
                        .collect::<FxIndexMap<_, _>>()
                )
            )?;
            inner_code += "};\n";
        }
        inner_code += "{\n";
        inner_code.concat(content);
        // Add newline in case the raw code had a comment as the last line and no final newline.
        inner_code += "\n}\n";
        Ok(EcmascriptChunkItemContent {
            inner_code: inner_code.build(),
            options: EcmascriptChunkItemOptions {
                module_and_exports: true,
                ..Default::default()
            },
            ..Default::default()
        }
        .into())
    }
}
