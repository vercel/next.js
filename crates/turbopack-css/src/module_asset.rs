use std::{fmt::Write, sync::Arc};

use anyhow::Result;
use indexmap::IndexMap;
use indoc::formatdoc;
use swc_core::{
    common::{BytePos, FileName, LineCol, SourceMap},
    css::modules::CssClassName,
};
use turbo_tasks::{primitives::StringVc, Value, ValueToString, ValueToStringVc};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    chunk::{
        ChunkItem, ChunkItemVc, ChunkVc, ChunkableAsset, ChunkableAssetReference,
        ChunkableAssetReferenceVc, ChunkableAssetVc, ChunkingContextVc, ChunkingType,
        ChunkingTypeOptionVc,
    },
    context::AssetContextVc,
    issue::{Issue, IssueSeverity, IssueSeverityVc, IssueVc},
    reference::{AssetReference, AssetReferenceVc, AssetReferencesVc},
    resolve::{
        origin::{ResolveOrigin, ResolveOriginVc},
        parse::RequestVc,
        ResolveResult, ResolveResultVc,
    },
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemContentVc,
        EcmascriptChunkItemVc, EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc,
        EcmascriptChunkVc, EcmascriptExports, EcmascriptExportsVc,
    },
    utils::stringify_js,
    ParseResultSourceMap, ParseResultSourceMapVc,
};

use crate::{
    chunk::{
        CssChunkItem, CssChunkItemContentVc, CssChunkItemVc, CssChunkPlaceable,
        CssChunkPlaceableVc, CssChunkVc,
    },
    parse::ParseResult,
    references::compose::CssModuleComposeReferenceVc,
    transform::CssInputTransformsVc,
    CssModuleAssetVc,
};

#[turbo_tasks::value]
#[derive(Clone)]
pub struct ModuleCssModuleAsset {
    pub inner: CssModuleAssetVc,
}

#[turbo_tasks::value_impl]
impl ModuleCssModuleAssetVc {
    #[turbo_tasks::function]
    pub fn new(source: AssetVc, context: AssetContextVc, transforms: CssInputTransformsVc) -> Self {
        Self::cell(ModuleCssModuleAsset {
            inner: CssModuleAssetVc::new_module(source, context, transforms),
        })
    }
}

#[turbo_tasks::value_impl]
impl Asset for ModuleCssModuleAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.inner.path()
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        self.inner.content()
    }

    #[turbo_tasks::function]
    async fn references(self_vc: ModuleCssModuleAssetVc) -> Result<AssetReferencesVc> {
        let references = self_vc.await?.inner.references().await?;
        let module_references = self_vc.module_references().await?;

        let references: Vec<_> = references
            .iter()
            .copied()
            .chain(module_references.iter().copied())
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
impl ModuleCssModuleAssetVc {
    #[turbo_tasks::function]
    async fn classes(self) -> Result<ModuleCssClassesVc> {
        let inner = self.await?.inner;
        let parse_result = inner.parse().await?;
        let mut classes = IndexMap::default();

        // TODO(alexkirsz) Should we report an error on parse error here?
        if let ParseResult::Ok { exports, .. } = &*parse_result {
            for (class_name, export_class_names) in exports {
                let mut export = Vec::default();

                for export_class_name in export_class_names {
                    export.push(match export_class_name {
                        CssClassName::Import { from, name } => ModuleCssClass::Import {
                            original: name.to_string(),
                            from: CssModuleComposeReferenceVc::new(
                                self.as_resolve_origin(),
                                RequestVc::parse(Value::new(from.to_string().into())),
                            ),
                        },
                        CssClassName::Local { name } => ModuleCssClass::Local {
                            name: name.to_string(),
                        },
                        CssClassName::Global { name } => ModuleCssClass::Global {
                            name: name.to_string(),
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
impl ChunkableAsset for ModuleCssModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk(self_vc: ModuleCssModuleAssetVc, context: ChunkingContextVc) -> ChunkVc {
        EcmascriptChunkVc::new(context, self_vc.into()).into()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for ModuleCssModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self_vc: ModuleCssModuleAssetVc,
        context: ChunkingContextVc,
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
impl ResolveOrigin for ModuleCssModuleAsset {
    #[turbo_tasks::function]
    fn origin_path(&self) -> FileSystemPathVc {
        self.inner.path()
    }

    #[turbo_tasks::function]
    fn context(&self) -> AssetContextVc {
        self.inner.context()
    }
}

#[turbo_tasks::value]
struct ModuleChunkItem {
    module: ModuleCssModuleAssetVc,
    context: ChunkingContextVc,
}

#[turbo_tasks::value_impl]
impl ValueToString for ModuleChunkItem {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "{} (css module)",
            self.module.path().to_string().await?
        )))
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        // The proxy reference must come first so it is processed before other potential
        // references inside of the CSS, like `@import` and `composes:`.
        // This affects the order in which the resulting CSS chunks will be loaded:
        // later references are processed first in the post-order traversal of the
        // reference tree, and as such they will be loaded first in the resulting HTML.
        let mut references = vec![CssProxyToCssAssetReference {
            module: self.module,
        }
        .cell()
        .into()];

        references.extend(self.module.references().await?.iter().copied());

        Ok(AssetReferencesVc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> ChunkingContextVc {
        self.context
    }

    #[turbo_tasks::function]
    fn related_path(&self) -> FileSystemPathVc {
        self.module.path()
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
                                path: self.module.path(),
                                message: StringVc::cell(formatdoc! {
                                    r#"
                                        Module {from} referenced in `composes: ... from {from};` can't be resolved.
                                    "#,
                                    from = &*from.await?.request.to_string().await?
                                }),
                            }.cell().as_issue().emit();
                            continue;
                        };

                        let Some(css_module) = ModuleCssModuleAssetVc::resolve_from(resolved_module).await? else {
                            CssModuleComposesIssue {
                                severity: IssueSeverity::Error.cell(),
                                path: self.module.path(),
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

                        let Some(placeable) = EcmascriptChunkPlaceableVc::resolve_from(css_module).await? else {
                            unreachable!("ModuleCssModuleAsset implements EcmascriptChunkPlaceableVc");
                        };

                        let module_id =
                            stringify_js(&*placeable.as_chunk_item(self.context).id().await?);
                        let original_name = stringify_js(original_name);
                        exported_class_names.push(format! {
                            "__turbopack_import__({module_id})[{original_name}]"
                        });
                    }
                    ModuleCssClass::Local { name: class_name }
                    | ModuleCssClass::Global { name: class_name } => {
                        exported_class_names.push(stringify_js(class_name));
                    }
                }
            }

            writeln!(
                code,
                "  {}: {},",
                stringify_js(export_name),
                exported_class_names.join(" + \" \" + ")
            )?;
        }
        code += "});\n";
        Ok(EcmascriptChunkItemContent {
            inner_code: code.clone().into(),
            // We generate a minimal map for runtime code so that the filename is
            // displayed in dev tools.
            source_map: Some(generate_minimal_source_map(
                format!("{}.js", self.module.path().await?.path),
                code,
            )),
            ..Default::default()
        }
        .cell())
    }
}

#[turbo_tasks::value]
struct CssProxyToCssAssetReference {
    module: ModuleCssModuleAssetVc,
}

#[turbo_tasks::value_impl]
impl ValueToString for CssProxyToCssAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "proxy(css) {}",
            self.module.path().to_string().await?,
        )))
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for CssProxyToCssAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        ResolveResult::asset(
            CssProxyModuleAsset {
                module: self.module,
            }
            .cell()
            .into(),
        )
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAssetReference for CssProxyToCssAssetReference {
    #[turbo_tasks::function]
    fn chunking_type(&self, _context: ChunkingContextVc) -> ChunkingTypeOptionVc {
        ChunkingTypeOptionVc::cell(Some(ChunkingType::Parallel))
    }
}

/// This structure exists solely in order to extend the `references` returned by
/// a standard [`CssModuleAsset`] with CSS modules' `composes:` references.
#[turbo_tasks::value]
#[derive(Clone)]
struct CssProxyModuleAsset {
    module: ModuleCssModuleAssetVc,
}

#[turbo_tasks::value_impl]
impl Asset for CssProxyModuleAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.module.path()
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        self.module.content()
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        // The original references must come first so they're processed before other
        // potential references inside of the CSS, like `@import` and `composes:`. This
        // affects the order in which the resulting CSS chunks will be loaded:
        // later references are processed first in the post-order traversal of
        // the reference tree, and as such they will be loaded first in the
        // resulting HTML.
        let mut references = self.module.await?.inner.references().await?.clone_value();

        references.extend(self.module.module_references().await?.iter().copied());

        Ok(AssetReferencesVc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAsset for CssProxyModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk(self_vc: CssProxyModuleAssetVc, context: ChunkingContextVc) -> ChunkVc {
        CssChunkVc::new(context, self_vc.into()).into()
    }
}

#[turbo_tasks::value_impl]
impl CssChunkPlaceable for CssProxyModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(&self, context: ChunkingContextVc) -> CssChunkItemVc {
        CssProxyModuleChunkItemVc::cell(CssProxyModuleChunkItem {
            module: self.module,
            context,
        })
        .into()
    }
}

#[turbo_tasks::value_impl]
impl ResolveOrigin for CssProxyModuleAsset {
    #[turbo_tasks::function]
    fn origin_path(&self) -> FileSystemPathVc {
        self.module.path()
    }

    #[turbo_tasks::function]
    fn context(&self) -> AssetContextVc {
        self.module.context()
    }
}

#[turbo_tasks::value]
struct CssProxyModuleChunkItem {
    module: ModuleCssModuleAssetVc,
    context: ChunkingContextVc,
}

#[turbo_tasks::value_impl]
impl ValueToString for CssProxyModuleChunkItem {
    #[turbo_tasks::function]
    fn to_string(&self) -> StringVc {
        self.module.as_chunk_item(self.context).to_string()
    }
}

#[turbo_tasks::value_impl]
impl ChunkItem for CssProxyModuleChunkItem {
    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        self.module.references()
    }
}

#[turbo_tasks::value_impl]
impl CssChunkItem for CssProxyModuleChunkItem {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<CssChunkItemContentVc> {
        Ok(self
            .module
            .await?
            .inner
            .as_chunk_item(self.context)
            .content())
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> ChunkingContextVc {
        self.context
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
    path: FileSystemPathVc,
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
        self.path
    }

    #[turbo_tasks::function]
    fn description(&self) -> StringVc {
        self.message
    }
}
