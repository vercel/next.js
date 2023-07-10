use std::io::Write;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::{primitives::StringVc, trace::TraceRawVcs, Value, ValueToString};
use turbo_tasks_fs::rope::Rope;
use turbopack_core::{
    asset::AssetVc,
    chunk::{
        availability_info::AvailabilityInfo, available_assets::AvailableAssetsVc, ChunkItem,
        ChunkItemVc, ChunkableModuleVc, ChunkingContext, ChunkingContextVc, FromChunkableModule,
        ModuleIdVc,
    },
    code_builder::{CodeBuilder, CodeVc},
    error::PrettyPrintError,
    issue::{code_gen::CodeGenerationIssue, IssueSeverity},
};

use super::{
    context::EcmascriptChunkingContextVc, placeable::EcmascriptChunkPlaceableVc,
    EcmascriptChunkPlaceable, EcmascriptChunkingContext,
};
use crate::{
    manifest::{chunk_asset::ManifestChunkAssetVc, loader_item::ManifestLoaderItemVc},
    utils::FormatIter,
    EcmascriptModuleContentVc, ParseResultSourceMapVc,
};

#[turbo_tasks::value(shared)]
#[derive(Default)]
pub struct EcmascriptChunkItemContent {
    pub inner_code: Rope,
    pub source_map: Option<ParseResultSourceMapVc>,
    pub options: EcmascriptChunkItemOptions,
    pub placeholder_for_future_extensions: (),
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItemContentVc {
    #[turbo_tasks::function]
    pub async fn new(
        content: EcmascriptModuleContentVc,
        context: EcmascriptChunkingContextVc,
    ) -> Result<Self> {
        let refresh = *context.has_react_refresh().await?;
        let externals = *context.environment().node_externals().await?;

        let content = content.await?;
        Ok(EcmascriptChunkItemContent {
            inner_code: content.inner_code.clone(),
            source_map: content.source_map,
            options: if content.is_esm {
                EcmascriptChunkItemOptions {
                    refresh,
                    externals,
                    ..Default::default()
                }
            } else {
                EcmascriptChunkItemOptions {
                    refresh,
                    externals,
                    // These things are not available in ESM
                    module: true,
                    exports: true,
                    this: true,
                    ..Default::default()
                }
            },
            ..Default::default()
        }
        .into())
    }

    #[turbo_tasks::function]
    pub async fn module_factory(self) -> Result<CodeVc> {
        let this = self.await?;
        let mut args = vec![
            "r: __turbopack_require__",
            "f: __turbopack_require_context__",
            "i: __turbopack_import__",
            "s: __turbopack_esm__",
            "v: __turbopack_export_value__",
            "n: __turbopack_export_namespace__",
            "c: __turbopack_cache__",
            "l: __turbopack_load__",
            "j: __turbopack_dynamic__",
            "g: global",
            // HACK
            "__dirname",
        ];
        if this.options.externals {
            args.push("x: __turbopack_external_require__");
        }
        if this.options.refresh {
            args.push("k: __turbopack_refresh__");
        }
        if this.options.module {
            args.push("m: module");
        }
        if this.options.exports {
            args.push("e: exports");
        }
        let mut code = CodeBuilder::default();
        let args = FormatIter(|| args.iter().copied().intersperse(", "));
        if this.options.this {
            write!(code, "(function({{ {} }}) {{ !function() {{\n\n", args,)?;
        } else {
            write!(code, "(({{ {} }}) => (() => {{\n\n", args,)?;
        }

        let source_map = this.source_map.map(|sm| sm.as_generate_source_map());
        code.push_source(&this.inner_code, source_map);
        if this.options.this {
            code += "\n}.call(this) })";
        } else {
            code += "\n})())";
        }
        Ok(code.build().cell())
    }
}

#[derive(PartialEq, Eq, Default, Debug, Clone, Serialize, Deserialize, TraceRawVcs)]
pub struct EcmascriptChunkItemOptions {
    /// Whether this chunk item's module factory should include a
    /// `__turbopack_refresh__` argument.
    pub refresh: bool,
    /// Whether this chunk item's module factory should include a `module`
    /// argument.
    pub module: bool,
    /// Whether this chunk item's module factory should include an `exports`
    /// argument.
    pub exports: bool,
    /// Whether this chunk item's module factory should include a
    /// `__turbopack_external_require__` argument.
    pub externals: bool,
    pub this: bool,
    pub placeholder_for_future_extensions: (),
}

#[turbo_tasks::value_trait]
pub trait EcmascriptChunkItem: ChunkItem {
    fn content(&self) -> EcmascriptChunkItemContentVc;
    fn content_with_availability_info(
        &self,
        _availability_info: Value<AvailabilityInfo>,
    ) -> EcmascriptChunkItemContentVc {
        self.content()
    }
    fn chunking_context(&self) -> EcmascriptChunkingContextVc;
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItemVc {
    /// Returns the module id of this chunk item.
    #[turbo_tasks::function]
    pub fn id(self) -> ModuleIdVc {
        self.chunking_context().chunk_item_id(self)
    }

    /// Generates the module factory for this chunk item.
    #[turbo_tasks::function]
    pub async fn code(self, availability_info: Value<AvailabilityInfo>) -> Result<CodeVc> {
        Ok(
            match self
                .content_with_availability_info(availability_info)
                .module_factory()
                .resolve()
                .await
            {
                Ok(factory) => factory,
                Err(error) => {
                    let id = self.id().to_string().await;
                    let id = id.as_ref().map_or_else(|_| "unknown", |id| &**id);
                    let error = error.context(format!(
                        "An error occurred while generating the chunk item {}",
                        id
                    ));
                    let error_message = format!("{}", PrettyPrintError(&error));
                    let js_error_message = serde_json::to_string(&error_message)?;
                    let issue = CodeGenerationIssue {
                        severity: IssueSeverity::Error.cell(),
                        path: self.asset_ident().path(),
                        title: StringVc::cell("Code generation for chunk item errored".to_string()),
                        message: StringVc::cell(error_message),
                    }
                    .cell();
                    issue.as_issue().emit();
                    let mut code = CodeBuilder::default();
                    code += "(() => {{\n\n";
                    writeln!(code, "throw new Error({error});", error = &js_error_message)?;
                    code += "\n}})";
                    code.build().cell()
                }
            },
        )
    }
}

#[async_trait::async_trait]
impl FromChunkableModule for EcmascriptChunkItemVc {
    async fn from_asset(context: ChunkingContextVc, asset: AssetVc) -> Result<Option<Self>> {
        let Some(placeable) = EcmascriptChunkPlaceableVc::resolve_from(asset).await? else {
            return Ok(None);
        };

        let Some(context) = EcmascriptChunkingContextVc::resolve_from(context).await? else {
            return Ok(None);
        };

        Ok(Some(placeable.as_chunk_item(context)))
    }

    async fn from_async_asset(
        context: ChunkingContextVc,
        asset: ChunkableModuleVc,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<Option<Self>> {
        let Some(context) = EcmascriptChunkingContextVc::resolve_from(context).await? else {
            return Ok(None);
        };

        let next_availability_info = match availability_info.into_value() {
            AvailabilityInfo::Untracked => AvailabilityInfo::Untracked,
            AvailabilityInfo::Root {
                current_availability_root,
            } => AvailabilityInfo::Inner {
                available_assets: AvailableAssetsVc::new(vec![current_availability_root]),
                current_availability_root: asset.as_asset(),
            },
            AvailabilityInfo::Inner {
                available_assets,
                current_availability_root,
            } => AvailabilityInfo::Inner {
                available_assets: available_assets.with_roots(vec![current_availability_root]),
                current_availability_root: asset.as_asset(),
            },
        };

        let manifest_asset =
            ManifestChunkAssetVc::new(asset, context, Value::new(next_availability_info));
        Ok(Some(ManifestLoaderItemVc::new(manifest_asset).into()))
    }
}

#[turbo_tasks::value(transparent)]
pub struct EcmascriptChunkItemsChunk(Vec<EcmascriptChunkItemVc>);

#[turbo_tasks::value(transparent)]
pub struct EcmascriptChunkItems(pub(super) Vec<EcmascriptChunkItemVc>);
