use std::{fmt::Write, iter::once, sync::Arc};

use anyhow::{bail, Result};
use indexmap::IndexMap;
use indoc::formatdoc;
use swc_core::{
    common::{BytePos, FileName, LineCol, SourceMap},
    css::modules::CssClassName,
};
use turbo_tasks::{Value, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        availability_info::AvailabilityInfo, Chunk, ChunkItem, ChunkableModule, ChunkingContext,
    },
    context::AssetContext,
    ident::AssetIdent,
    issue::{Issue, IssueExt, IssueSeverity},
    module::Module,
    reference::{ModuleReference, ModuleReferences},
    reference_type::{CssReferenceSubType, ReferenceType},
    resolve::{origin::ResolveOrigin, parse::Request},
    source::Source,
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunk, EcmascriptChunkItem, EcmascriptChunkItemContent, EcmascriptChunkItemExt,
        EcmascriptChunkPlaceable, EcmascriptChunkingContext, EcmascriptExports,
    },
    utils::StringifyJs,
    ParseResultSourceMap,
};

use crate::{
    parse::{ParseCss, ParseCssResult},
    references::{compose::CssModuleComposeReference, internal::InternalCssAssetReference},
};

#[turbo_tasks::function]
fn modifier() -> Vc<String> {
    Vc::cell("css module".to_string())
}

#[turbo_tasks::value]
#[derive(Clone)]
pub struct ModuleCssAsset {
    pub source: Vc<Box<dyn Source>>,
    pub context: Vc<Box<dyn AssetContext>>,
}

#[turbo_tasks::value_impl]
impl ModuleCssAsset {
    #[turbo_tasks::function]
    pub async fn new(
        source: Vc<Box<dyn Source>>,
        context: Vc<Box<dyn AssetContext>>,
    ) -> Result<Vc<Self>> {
        Ok(Self::cell(ModuleCssAsset { source, context }))
    }
}

#[turbo_tasks::value_impl]
impl Module for ModuleCssAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source.ident().with_modifier(modifier())
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        // The inner reference must come first so it is processed before other potential
        // references inside of the CSS, like `@import` and `composes:`.
        // This affects the order in which the resulting CSS chunks will be loaded:
        // later references are processed first in the post-order traversal of the
        // reference tree, and as such they will be loaded first in the resulting HTML.
        let references = once(Vc::upcast(InternalCssAssetReference::new(self.inner())))
            .chain(self.module_references().await?.iter().copied())
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
        from: Vc<CssModuleComposeReference>,
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
impl ModuleCssAsset {
    #[turbo_tasks::function]
    async fn inner(self: Vc<Self>) -> Result<Vc<Box<dyn Module>>> {
        let this = self.await?;
        Ok(this.context.process(
            this.source,
            Value::new(ReferenceType::Css(CssReferenceSubType::Internal)),
        ))
    }

    #[turbo_tasks::function]
    async fn classes(self: Vc<Self>) -> Result<Vc<ModuleCssClasses>> {
        let inner = self.inner();

        let Some(inner) = Vc::try_resolve_sidecast::<Box<dyn ParseCss>>(inner).await? else {
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
                            from: CssModuleComposeReference::new(
                                Vc::upcast(self),
                                Request::parse(Value::new(from.to_string().into())),
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

        Ok(Vc::cell(classes))
    }

    #[turbo_tasks::function]
    async fn module_references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        let mut references = vec![];

        for (_, class_names) in &*self.classes().await? {
            for class_name in class_names {
                match class_name {
                    ModuleCssClass::Import { from, .. } => {
                        references.push(Vc::upcast(*from));
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
    fn as_chunk(
        self: Vc<Self>,
        context: Vc<Box<dyn ChunkingContext>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<Box<dyn Chunk>> {
        Vc::upcast(EcmascriptChunk::new(
            context,
            Vc::upcast(self),
            availability_info,
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for ModuleCssAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: Vc<Self>,
        context: Vc<Box<dyn EcmascriptChunkingContext>>,
    ) -> Vc<Box<dyn EcmascriptChunkItem>> {
        Vc::upcast(
            ModuleChunkItem {
                context,
                module: self,
            }
            .cell(),
        )
    }

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
    fn context(&self) -> Vc<Box<dyn AssetContext>> {
        self.context
    }
}

#[turbo_tasks::value]
struct ModuleChunkItem {
    module: Vc<ModuleCssAsset>,
    context: Vc<Box<dyn EcmascriptChunkingContext>>,
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
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn EcmascriptChunkingContext>> {
        self.context
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
                                severity: IssueSeverity::Error.cell(),
                                source: self.module.ident(),
                                message: Vc::cell(formatdoc! {
                                    r#"
                                        Module {from} referenced in `composes: ... from {from};` can't be resolved.
                                    "#,
                                    from = &*from.await?.request.to_string().await?
                                }),
                            }.cell().emit();
                            continue;
                        };

                        let Some(css_module) =
                            Vc::try_resolve_downcast_type::<ModuleCssAsset>(*resolved_module)
                                .await?
                        else {
                            CssModuleComposesIssue {
                                severity: IssueSeverity::Error.cell(),
                                source: self.module.ident(),
                                message: Vc::cell(formatdoc! {
                                    r#"
                                        Module {from} referenced in `composes: ... from {from};` is not a CSS module.
                                    "#,
                                    from = &*from.await?.request.to_string().await?
                                }),
                            }.cell().emit();
                            continue;
                        };

                        // TODO(alexkirsz) We should also warn if `original_name` can't be found in
                        // the target module.

                        let placeable: Vc<Box<dyn EcmascriptChunkPlaceable>> =
                            Vc::upcast(css_module);

                        let module_id = placeable.as_chunk_item(self.context).id().await?;
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
            source_map: Some(generate_minimal_source_map(
                self.module.ident().to_string().await?.to_string(),
                code,
            )),
            ..Default::default()
        }
        .cell())
    }
}

fn generate_minimal_source_map(filename: String, source: String) -> Vc<ParseResultSourceMap> {
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
    severity: Vc<IssueSeverity>,
    source: Vc<AssetIdent>,
    message: Vc<String>,
}

#[turbo_tasks::value_impl]
impl Issue for CssModuleComposesIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        self.severity
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<String>> {
        Ok(Vc::cell(
            "An issue occurred while resolving a CSS module `composes:` rule".to_string(),
        ))
    }

    #[turbo_tasks::function]
    fn category(&self) -> Vc<String> {
        Vc::cell("css".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> Vc<FileSystemPath> {
        self.source.path()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<String> {
        self.message
    }
}
