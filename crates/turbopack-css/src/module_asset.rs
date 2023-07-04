use std::{fmt::Write, iter::once, sync::Arc};

use anyhow::{bail, Result};
use indexmap::IndexMap;
use indoc::formatdoc;
use swc_core::{
    common::{BytePos, FileName, LineCol, SourceMap},
    css::modules::CssClassName,
};
use turbo_tasks::{primitives::StringVc, Value, ValueToString};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{
        availability_info::AvailabilityInfo, ChunkItem, ChunkItemVc, ChunkVc, ChunkableAsset,
        ChunkableAssetVc, ChunkingContextVc,
    },
    context::{AssetContext, AssetContextVc},
    ident::AssetIdentVc,
    issue::{Issue, IssueSeverity, IssueSeverityVc, IssueVc},
    reference::{AssetReference, AssetReferencesVc},
    reference_type::{CssReferenceSubType, ReferenceType},
    resolve::{
        origin::{ResolveOrigin, ResolveOriginVc},
        parse::RequestVc,
    },
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemContentVc,
        EcmascriptChunkItemVc, EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc,
        EcmascriptChunkVc, EcmascriptChunkingContextVc, EcmascriptExports, EcmascriptExportsVc,
    },
    utils::StringifyJs,
    ParseResultSourceMap, ParseResultSourceMapVc,
};

use crate::{
    parse::{ParseCss, ParseCssResult, ParseCssVc},
    references::{compose::CssModuleComposeReferenceVc, internal::InternalCssAssetReferenceVc},
};

#[turbo_tasks::function]
fn modifier() -> StringVc {
    StringVc::cell("css module".to_string())
}

#[turbo_tasks::value]
#[derive(Clone)]
pub struct ModuleCssAsset {
    pub source: AssetVc,
    pub context: AssetContextVc,
}

#[turbo_tasks::value_impl]
impl ModuleCssAssetVc {
    #[turbo_tasks::function]
    pub async fn new(source: AssetVc, context: AssetContextVc) -> Result<Self> {
        Ok(Self::cell(ModuleCssAsset { source, context }))
    }
}

#[turbo_tasks::value_impl]
impl Asset for ModuleCssAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> AssetIdentVc {
        self.source.ident().with_modifier(modifier())
    }

    #[turbo_tasks::function]
    fn content(&self) -> Result<AssetContentVc> {
        bail!("CSS module asset has no contents")
    }

    #[turbo_tasks::function]
    async fn references(self_vc: ModuleCssAssetVc) -> Result<AssetReferencesVc> {
        // The inner reference must come first so it is processed before other potential
        // references inside of the CSS, like `@import` and `composes:`.
        // This affects the order in which the resulting CSS chunks will be loaded:
        // later references are processed first in the post-order traversal of the
        // reference tree, and as such they will be loaded first in the resulting HTML.
        let references = once(InternalCssAssetReferenceVc::new(self_vc.inner()).into())
            .chain(self_vc.module_references().await?.iter().copied())
            .collect();

        Ok(AssetReferencesVc::cell(references))
    }
}

/// A CSS class that is exported from a CSS module.
///
/// See [`ModuleCssClasses`] for more information.
#[turbo_tasks::value(transparent)]
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
        from: CssModuleComposeReferenceVc,
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
struct ModuleCssClasses(IndexMap<String, Vec<ModuleCssClass>>);

#[turbo_tasks::value_impl]
impl ModuleCssAssetVc {
    #[turbo_tasks::function]
    async fn inner(self) -> Result<AssetVc> {
        let this = self.await?;
        Ok(this.context.process(
            this.source,
            Value::new(ReferenceType::Css(CssReferenceSubType::Internal)),
        ))
    }

    #[turbo_tasks::function]
    async fn classes(self) -> Result<ModuleCssClassesVc> {
        let inner = self.inner();

        let Some(inner) = ParseCssVc::resolve_from(inner).await? else {
            bail!("inner asset should be CSS parseable");
        };

        let parse_result = inner.parse_css().await?;
        let mut classes = IndexMap::default();

        // TODO(alexkirsz) Should we report an error on parse error here?
        if let ParseCssResult::Ok { exports, .. } = &*parse_result {
            for (class_name, export_class_names) in exports {
                let mut export = Vec::default();

                for export_class_name in export_class_names {
                    export.push(match export_class_name {
                        CssClassName::Import { from, name } => ModuleCssClass::Import {
                            original: name.value.to_string(),
                            from: CssModuleComposeReferenceVc::new(
                                self.as_resolve_origin(),
                                RequestVc::parse(Value::new(from.to_string().into())),
                            ),
                        },
                        CssClassName::Local { name } => ModuleCssClass::Local {
                            name: name.value.to_string(),
                        },
                        CssClassName::Global { name } => ModuleCssClass::Global {
                            name: name.value.to_string(),
                        },
                    })
                }

                classes.insert(class_name.to_string(), export);
            }
        }

        Ok(ModuleCssClassesVc::cell(classes))
    }

    #[turbo_tasks::function]
    async fn module_references(self) -> Result<AssetReferencesVc> {
        let mut references = vec![];

        for (_, class_names) in &*self.classes().await? {
            for class_name in class_names {
                match class_name {
                    ModuleCssClass::Import { from, .. } => {
                        references.push((*from).into());
                    }
                    ModuleCssClass::Local { .. } | ModuleCssClass::Global { .. } => {}
                }
            }
        }

        Ok(AssetReferencesVc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAsset for ModuleCssAsset {
    #[turbo_tasks::function]
    fn as_chunk(
        self_vc: ModuleCssAssetVc,
        context: ChunkingContextVc,
        availability_info: Value<AvailabilityInfo>,
    ) -> ChunkVc {
        EcmascriptChunkVc::new(context, self_vc.into(), availability_info).into()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for ModuleCssAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self_vc: ModuleCssAssetVc,
        context: EcmascriptChunkingContextVc,
    ) -> EcmascriptChunkItemVc {
        ModuleChunkItem {
            context,
            module: self_vc,
        }
        .cell()
        .into()
    }

    #[turbo_tasks::function]
    fn get_exports(&self) -> EcmascriptExportsVc {
        EcmascriptExports::Value.cell()
    }
}

#[turbo_tasks::value_impl]
impl ResolveOrigin for ModuleCssAsset {
    #[turbo_tasks::function]
    fn origin_path(&self) -> FileSystemPathVc {
        self.source.ident().path()
    }

    #[turbo_tasks::function]
    fn context(&self) -> AssetContextVc {
        self.context
    }
}

#[turbo_tasks::value]
struct ModuleChunkItem {
    module: ModuleCssAssetVc,
    context: EcmascriptChunkingContextVc,
}

#[turbo_tasks::value_impl]
impl ChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> AssetIdentVc {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        self.module.references()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> EcmascriptChunkingContextVc {
        self.context
    }

    #[turbo_tasks::function]
    async fn content(&self) -> Result<EcmascriptChunkItemContentVc> {
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
                        let resolved_module = from.resolve_reference().first_asset().await?;

                        let Some(resolved_module) = &*resolved_module else {
                            CssModuleComposesIssue {
                                severity: IssueSeverity::Error.cell(),
                                source: self.module.ident(),
                                message: StringVc::cell(formatdoc! {
                                    r#"
                                        Module {from} referenced in `composes: ... from {from};` can't be resolved.
                                    "#,
                                    from = &*from.await?.request.to_string().await?
                                }),
                            }.cell().as_issue().emit();
                            continue;
                        };

                        let Some(css_module) = ModuleCssAssetVc::resolve_from(resolved_module).await? else {
                            CssModuleComposesIssue {
                                severity: IssueSeverity::Error.cell(),
                                source: self.module.ident(),
                                message: StringVc::cell(formatdoc! {
                                    r#"
                                        Module {from} referenced in `composes: ... from {from};` is not a CSS module.
                                    "#,
                                    from = &*from.await?.request.to_string().await?
                                }),
                            }.cell().as_issue().emit();
                            continue;
                        };

                        // TODO(alexkirsz) We should also warn if `original_name` can't be found in
                        // the target module.

                        let placeable = css_module.as_ecmascript_chunk_placeable();

                        let module_id = placeable.as_chunk_item(self.context).id().await?;
                        let module_id = StringifyJs(&*module_id);
                        let original_name = StringifyJs(original_name);
                        exported_class_names.push(format! {
                            "__turbopack_import__({module_id})[{original_name}]"
                        });
                    }
                    ModuleCssClass::Local { name: class_name }
                    | ModuleCssClass::Global { name: class_name } => {
                        exported_class_names.push(StringifyJs(class_name).to_string());
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
            source_map: Some(generate_minimal_source_map(
                self.module.ident().to_string().await?.to_string(),
                code,
            )),
            ..Default::default()
        }
        .cell())
    }
}

fn generate_minimal_source_map(filename: String, source: String) -> ParseResultSourceMapVc {
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
    sm.new_source_file(FileName::Custom(filename), source);
    let map = ParseResultSourceMap::new(sm, mappings);
    map.cell()
}

#[turbo_tasks::value(shared)]
struct CssModuleComposesIssue {
    severity: IssueSeverityVc,
    source: AssetIdentVc,
    message: StringVc,
}

#[turbo_tasks::value_impl]
impl Issue for CssModuleComposesIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> IssueSeverityVc {
        self.severity
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<StringVc> {
        Ok(StringVc::cell(
            "An issue occurred while resolving a CSS module `composes:` rule".to_string(),
        ))
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("css".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.source.path()
    }

    #[turbo_tasks::function]
    fn description(&self) -> StringVc {
        self.message
    }
}
