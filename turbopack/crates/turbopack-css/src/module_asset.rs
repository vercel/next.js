use std::{fmt::Write, sync::Arc};

use anyhow::{bail, Context, Result};
use indoc::formatdoc;
use lightningcss::css_modules::CssModuleReference;
use swc_core::common::{BytePos, FileName, LineCol, SourceMap};
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, ResolvedVc, Value, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{ChunkItem, ChunkItemExt, ChunkType, ChunkableModule, ChunkingContext},
    context::{AssetContext, ProcessResult},
    ident::AssetIdent,
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString},
    module::Module,
    reference::{ModuleReference, ModuleReferences},
    reference_type::{CssReferenceSubType, ReferenceType},
    resolve::{origin::ResolveOrigin, parse::Request},
    source::Source,
    source_map::OptionSourceMap,
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkPlaceable,
        EcmascriptChunkType, EcmascriptExports,
    },
    utils::StringifyJs,
    ParseResultSourceMap,
};

use crate::{
    process::{CssWithPlaceholderResult, ProcessCss},
    references::{compose::CssModuleComposeReference, internal::InternalCssAssetReference},
};

#[turbo_tasks::function]
fn modifier() -> Vc<RcStr> {
    Vc::cell("css module".into())
}

#[turbo_tasks::value]
#[derive(Clone)]
pub struct ModuleCssAsset {
    pub source: ResolvedVc<Box<dyn Source>>,
    pub asset_context: ResolvedVc<Box<dyn AssetContext>>,
}

#[turbo_tasks::value_impl]
impl ModuleCssAsset {
    #[turbo_tasks::function]
    pub fn new(
        source: ResolvedVc<Box<dyn Source>>,
        asset_context: ResolvedVc<Box<dyn AssetContext>>,
    ) -> Vc<Self> {
        Self::cell(ModuleCssAsset {
            source,
            asset_context,
        })
    }
}

#[turbo_tasks::value_impl]
impl Module for ModuleCssAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source
            .ident()
            .with_modifier(modifier())
            .with_layer(self.asset_context.layer())
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        // The inner reference must come last so it is loaded as the last in the
        // resulting css. @import or composes references must be loaded first so
        // that the css style rules in them are overridable from the local css.

        // This affects the order in which the resulting CSS chunks will be loaded:
        // 1. @import or composes references are loaded first
        // 2. The local CSS is loaded last

        let references = self
            .module_references()
            .await?
            .iter()
            .copied()
            .chain(match *self.inner().try_into_module().await? {
                Some(inner) => Some(
                    InternalCssAssetReference::new(*inner)
                        .to_resolved()
                        .await
                        .map(ResolvedVc::upcast)?,
                ),
                None => None,
            })
            .collect();

        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Asset for ModuleCssAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Result<Vc<AssetContent>> {
        bail!("CSS module asset has no contents")
    }
}

/// A CSS class that is exported from a CSS module.
///
/// See [`ModuleCssClasses`] for more information.
#[turbo_tasks::value]
#[derive(Debug, Clone)]
enum ModuleCssClass {
    Local {
        name: String,
    },
    Global {
        name: String,
    },
    Import {
        original: String,
        from: ResolvedVc<CssModuleComposeReference>,
    },
}

/// A map of CSS classes exported from a CSS module.
///
/// ## Example
///
/// ```css
/// :global(.class1) {
///    color: red;
/// }
///
/// .class2 {
///   color: blue;
/// }
///
/// .class3 {
///   composes: class4 from "./other.module.css";
/// }
/// ```
///
/// The above CSS module would have the following exports:
/// 1. class1: [Global("exported_class1")]
/// 2. class2: [Local("exported_class2")]
/// 3. class3: [Local("exported_class3), Import("class4", "./other.module.css")]
#[turbo_tasks::value(transparent)]
#[derive(Debug, Clone)]
struct ModuleCssClasses(FxIndexMap<String, Vec<ModuleCssClass>>);

#[turbo_tasks::value_impl]
impl ModuleCssAsset {
    #[turbo_tasks::function]
    fn inner(&self) -> Vc<ProcessResult> {
        self.asset_context.process(
            *self.source,
            Value::new(ReferenceType::Css(CssReferenceSubType::Internal)),
        )
    }

    #[turbo_tasks::function]
    async fn classes(self: Vc<Self>) -> Result<Vc<ModuleCssClasses>> {
        let inner = self.inner().module();

        let inner = Vc::try_resolve_sidecast::<Box<dyn ProcessCss>>(inner)
            .await?
            .context("inner asset should be CSS processable")?;

        let result = inner.get_css_with_placeholder().await?;
        let mut classes = FxIndexMap::default();

        // TODO(alexkirsz) Should we report an error on parse error here?
        if let CssWithPlaceholderResult::Ok {
            exports: Some(exports),
            ..
        } = &*result
        {
            for (class_name, export_class_names) in exports {
                let mut export = Vec::default();

                export.push(ModuleCssClass::Local {
                    name: export_class_names.name.clone(),
                });

                for export_class_name in &export_class_names.composes {
                    export.push(match export_class_name {
                        CssModuleReference::Dependency { specifier, name } => {
                            ModuleCssClass::Import {
                                original: name.to_string(),
                                from: CssModuleComposeReference::new(
                                    Vc::upcast(self),
                                    Request::parse(Value::new(
                                        RcStr::from(specifier.clone()).into(),
                                    )),
                                )
                                .to_resolved()
                                .await?,
                            }
                        }
                        CssModuleReference::Local { name } => ModuleCssClass::Local {
                            name: name.to_string(),
                        },
                        CssModuleReference::Global { name } => ModuleCssClass::Global {
                            name: name.to_string(),
                        },
                    })
                }

                classes.insert(class_name.to_string(), export);
            }
        }

        Ok(Vc::cell(classes))
    }

    #[turbo_tasks::function]
    async fn module_references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        let mut references = vec![];

        for (_, class_names) in &*self.classes().await? {
            for class_name in class_names {
                match class_name {
                    ModuleCssClass::Import { from, .. } => {
                        references.push(ResolvedVc::upcast(*from));
                    }
                    ModuleCssClass::Local { .. } | ModuleCssClass::Global { .. } => {}
                }
            }
        }

        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for ModuleCssAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        Vc::upcast(
            ModuleChunkItem {
                chunking_context,
                module: self,
            }
            .cell(),
        )
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for ModuleCssAsset {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.cell()
    }
}

#[turbo_tasks::value_impl]
impl ResolveOrigin for ModuleCssAsset {
    #[turbo_tasks::function]
    fn origin_path(&self) -> Vc<FileSystemPath> {
        self.source.ident().path()
    }

    #[turbo_tasks::function]
    fn asset_context(&self) -> Vc<Box<dyn AssetContext>> {
        *self.asset_context
    }
}

#[turbo_tasks::value]
struct ModuleChunkItem {
    module: ResolvedVc<ModuleCssAsset>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl ChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<ModuleReferences> {
        self.module.references()
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        Vc::upcast(*self.chunking_context)
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
impl EcmascriptChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<EcmascriptChunkItemContent>> {
        let classes = self.module.classes().await?;

        let mut code = "__turbopack_export_value__({\n".to_string();
        for (export_name, class_names) in &*classes {
            let mut exported_class_names = Vec::with_capacity(class_names.len());

            for class_name in class_names {
                match class_name {
                    ModuleCssClass::Import {
                        original: original_name,
                        from,
                    } => {
                        let resolved_module = from.resolve_reference().first_module().await?;

                        let Some(resolved_module) = &*resolved_module else {
                            CssModuleComposesIssue {
                                severity: IssueSeverity::Error.resolved_cell(),
                                source: self.module.ident().to_resolved().await?,
                                message: formatdoc! {
                                    r#"
                                        Module {from} referenced in `composes: ... from {from};` can't be resolved.
                                    "#,
                                    from = &*from.await?.request.to_string().await?
                                }.into(),
                            }.cell().emit();
                            continue;
                        };

                        let Some(css_module) =
                            ResolvedVc::try_downcast_type::<ModuleCssAsset>(*resolved_module)
                                .await?
                        else {
                            CssModuleComposesIssue {
                                severity: IssueSeverity::Error.resolved_cell(),
                                    source: self.module.ident().to_resolved().await?,
                                message: formatdoc! {
                                    r#"
                                        Module {from} referenced in `composes: ... from {from};` is not a CSS module.
                                    "#,
                                    from = &*from.await?.request.to_string().await?
                                }.into(),
                            }.cell().emit();
                            continue;
                        };

                        // TODO(alexkirsz) We should also warn if `original_name` can't be found in
                        // the target module.

                        let placeable: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>> =
                            ResolvedVc::upcast(css_module);

                        let module_id = placeable
                            .as_chunk_item(Vc::upcast(*self.chunking_context))
                            .id()
                            .await?;
                        let module_id = StringifyJs(&*module_id);
                        let original_name = StringifyJs(&original_name);
                        exported_class_names.push(format! {
                            "__turbopack_import__({module_id})[{original_name}]"
                        });
                    }
                    ModuleCssClass::Local { name: class_name }
                    | ModuleCssClass::Global { name: class_name } => {
                        exported_class_names.push(StringifyJs(&class_name).to_string());
                    }
                }
            }

            writeln!(
                code,
                "  {}: {},",
                StringifyJs(export_name),
                exported_class_names.join(" + \" \" + ")
            )?;
        }
        code += "});\n";
        Ok(EcmascriptChunkItemContent {
            inner_code: code.clone().into(),
            // We generate a minimal map for runtime code so that the filename is
            // displayed in dev tools.
            source_map: Some(ResolvedVc::upcast(
                generate_minimal_source_map(
                    self.module.ident().to_string().await?.to_string(),
                    code,
                )
                .await?,
            )),
            ..Default::default()
        }
        .cell())
    }
}

async fn generate_minimal_source_map(
    filename: String,
    source: String,
) -> Result<ResolvedVc<ParseResultSourceMap>> {
    let mut mappings = vec![];
    // Start from 1 because 0 is reserved for dummy spans in SWC.
    let mut pos = 1;
    for (index, line) in source.split_inclusive('\n').enumerate() {
        mappings.push((
            BytePos(pos),
            LineCol {
                line: index as u32,
                col: 0,
            },
        ));
        pos += line.len() as u32;
    }
    let sm: Arc<SourceMap> = Default::default();
    sm.new_source_file(FileName::Custom(filename).into(), source);
    let map = ParseResultSourceMap::new(sm, mappings, OptionSourceMap::none().to_resolved().await?);
    Ok(map.resolved_cell())
}

#[turbo_tasks::value(shared)]
struct CssModuleComposesIssue {
    severity: ResolvedVc<IssueSeverity>,
    source: ResolvedVc<AssetIdent>,
    message: RcStr,
}

#[turbo_tasks::value_impl]
impl Issue for CssModuleComposesIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        *self.severity
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text("An issue occurred while resolving a CSS module `composes:` rule".into())
            .cell()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::CodeGen.cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.source.path()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(
            StyledString::Text(self.message.clone()).resolved_cell(),
        ))
    }
}
