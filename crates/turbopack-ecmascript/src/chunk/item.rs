use std::io::Write;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::{trace::TraceRawVcs, Upcast, Value, ValueToString, Vc};
use turbo_tasks_fs::rope::Rope;
use turbopack_core::{
    chunk::{
        availability_info::AvailabilityInfo, available_assets::AvailableAssets, ChunkItem,
        ChunkableModule, ChunkingContext, FromChunkableModule, ModuleId,
    },
    code_builder::{Code, CodeBuilder},
    error::PrettyPrintError,
    issue::{code_gen::CodeGenerationIssue, IssueExt, IssueSeverity},
    module::Module,
};

use super::{EcmascriptChunkPlaceable, EcmascriptChunkingContext};
use crate::{
    manifest::{chunk_asset::ManifestChunkAsset, loader_item::ManifestLoaderItem},
    utils::FormatIter,
    EcmascriptModuleContent, ParseResultSourceMap,
};

#[turbo_tasks::value(shared)]
#[derive(Default)]
pub struct EcmascriptChunkItemContent {
    pub inner_code: Rope,
    pub source_map: Option<Vc<ParseResultSourceMap>>,
    pub options: EcmascriptChunkItemOptions,
    pub placeholder_for_future_extensions: (),
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItemContent {
    #[turbo_tasks::function]
    pub async fn new(
        content: Vc<EcmascriptModuleContent>,
        context: Vc<Box<dyn EcmascriptChunkingContext>>,
    ) -> Result<Vc<Self>> {
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
    pub async fn module_factory(self: Vc<Self>) -> Result<Vc<Code>> {
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

        let source_map = this.source_map.map(Vc::upcast);
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
    fn content(self: Vc<Self>) -> Vc<EcmascriptChunkItemContent>;
    fn content_with_availability_info(
        self: Vc<Self>,
        _availability_info: Value<AvailabilityInfo>,
    ) -> Vc<EcmascriptChunkItemContent> {
        self.content()
    }
    fn chunking_context(self: Vc<Self>) -> Vc<Box<dyn EcmascriptChunkingContext>>;
}

pub trait EcmascriptChunkItemExt {
    /// Returns the module id of this chunk item.
    fn id(self: Vc<Self>) -> Vc<ModuleId>;

    /// Generates the module factory for this chunk item.
    fn code(self: Vc<Self>, availability_info: Value<AvailabilityInfo>) -> Vc<Code>;
}

impl<T> EcmascriptChunkItemExt for T
where
    T: Upcast<Box<dyn EcmascriptChunkItem>>,
{
    /// Returns the module id of this chunk item.
    fn id(self: Vc<Self>) -> Vc<ModuleId> {
        let chunk_item = Vc::upcast(self);
        chunk_item.chunking_context().chunk_item_id(chunk_item)
    }

    /// Generates the module factory for this chunk item.
    fn code(self: Vc<Self>, availability_info: Value<AvailabilityInfo>) -> Vc<Code> {
        module_factory_with_code_generation_issue(Vc::upcast(self), availability_info)
    }
}

#[turbo_tasks::function]
async fn module_factory_with_code_generation_issue(
    chunk_item: Vc<Box<dyn EcmascriptChunkItem>>,
    availability_info: Value<AvailabilityInfo>,
) -> Result<Vc<Code>> {
    Ok(
        match chunk_item
            .content_with_availability_info(availability_info)
            .module_factory()
            .resolve()
            .await
        {
            Ok(factory) => factory,
            Err(error) => {
                let id = chunk_item.id().to_string().await;
                let id = id.as_ref().map_or_else(|_| "unknown", |id| &**id);
                let error = error.context(format!(
                    "An error occurred while generating the chunk item {}",
                    id
                ));
                let error_message = format!("{}", PrettyPrintError(&error));
                let js_error_message = serde_json::to_string(&error_message)?;
                CodeGenerationIssue {
                    severity: IssueSeverity::Error.cell(),
                    path: chunk_item.asset_ident().path(),
                    title: Vc::cell("Code generation for chunk item errored".to_string()),
                    message: Vc::cell(error_message),
                }
                .cell()
                .emit();
                let mut code = CodeBuilder::default();
                code += "(() => {{\n\n";
                writeln!(code, "throw new Error({error});", error = &js_error_message)?;
                code += "\n}})";
                code.build().cell()
            }
        },
    )
}

#[async_trait::async_trait]
impl FromChunkableModule for Box<dyn EcmascriptChunkItem> {
    async fn from_asset(
        context: Vc<Box<dyn ChunkingContext>>,
        module: Vc<Box<dyn Module>>,
    ) -> Result<Option<Vc<Self>>> {
        let Some(placeable) =
            Vc::try_resolve_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(module).await?
        else {
            return Ok(None);
        };

        let Some(context) =
            Vc::try_resolve_sidecast::<Box<dyn EcmascriptChunkingContext>>(context).await?
        else {
            return Ok(None);
        };

        Ok(Some(placeable.as_chunk_item(context)))
    }

    async fn from_async_asset(
        context: Vc<Box<dyn ChunkingContext>>,
        module: Vc<Box<dyn ChunkableModule>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<Option<Vc<Self>>> {
        let Some(context) =
            Vc::try_resolve_sidecast::<Box<dyn EcmascriptChunkingContext>>(context).await?
        else {
            return Ok(None);
        };

        let next_availability_info = match availability_info.into_value() {
            AvailabilityInfo::Untracked => AvailabilityInfo::Untracked,
            AvailabilityInfo::Root {
                current_availability_root,
            } => AvailabilityInfo::Inner {
                available_assets: AvailableAssets::new(vec![current_availability_root]),
                current_availability_root: Vc::upcast(module),
            },
            AvailabilityInfo::Inner {
                available_assets,
                current_availability_root,
            } => AvailabilityInfo::Inner {
                available_assets: available_assets.with_roots(vec![current_availability_root]),
                current_availability_root: Vc::upcast(module),
            },
        };

        let manifest_asset =
            ManifestChunkAsset::new(module, context, Value::new(next_availability_info));
        Ok(Some(Vc::upcast(ManifestLoaderItem::new(manifest_asset))))
    }
}

#[turbo_tasks::value(transparent)]
pub struct EcmascriptChunkItemsChunk(Vec<Vc<Box<dyn EcmascriptChunkItem>>>);

#[turbo_tasks::value(transparent)]
pub struct EcmascriptChunkItems(pub(super) Vec<Vc<Box<dyn EcmascriptChunkItem>>>);
