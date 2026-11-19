use std::{fmt::Write, sync::Arc};

use anyhow::{Context, Result, bail};
use lightningcss::css_modules::CssModuleReference;
use swc_core::common::{BytePos, FileName, LineCol, SourceMap};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{OrderedAutoMap, ResolvedVc, Vc, turbofmt};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    chunk::{AsyncModuleInfo, ChunkableModule, ChunkingContext},
    context::{AssetContext, ProcessResult},
    ident::AssetIdent,
    module::{Module, ModuleSideEffects},
    module_graph::ModuleGraph,
    reference::ModuleReferences,
    reference_type::{CssReferenceSubType, ReferenceType},
    resolve::{origin::ResolveOrigin, parse::Request},
    source::{OptionSource, Source},
    source_map::{SourceMapGenerationOptions, SourceMaps, structured::StructuredSourceMap},
};
use turbopack_ecmascript::{
    chunk::{
        EcmascriptChunkItemContent, EcmascriptChunkItemOptions, EcmascriptChunkPlaceable,
        EcmascriptExports, ecmascript_chunk_item,
    },
    parse::generate_js_source_map,
    references::esm::{EsmExport, EsmExports, Liveness, generated_export_key},
    runtime_functions::TURBOPACK_ESM,
    utils::StringifyJs,
};

use crate::{
    module_composes::css_modules_composes,
    process::{CssWithPlaceholderResult, ProcessCss},
    references::{compose::CssModuleComposeReference, internal::InternalCssAssetReference},
};

/// A [CSS Module, as in `.module.css`][spec]. For a global CSS module, see [`CssModule`].
///
/// [spec]: https://github.com/css-modules/css-modules
/// [`CssModule`]: crate::CssModule
#[turbo_tasks::value]
#[derive(Clone)]
pub struct EcmascriptCssModule {
    pub source: ResolvedVc<Box<dyn Source>>,
    pub asset_context: ResolvedVc<Box<dyn AssetContext>>,
    /// The path of `source`, precomputed so that `ResolveOrigin::origin_path` is synchronous.
    origin_path: FileSystemPath,
    source_map_generation_options: SourceMapGenerationOptions,
    /// Whether the keys the exports are emitted under may be shortened, see
    /// [`EsmExports::mangle_export_names`].
    mangle_export_names: bool,
}

#[turbo_tasks::value_impl]
impl EcmascriptCssModule {
    #[turbo_tasks::function]
    pub async fn new(
        source: ResolvedVc<Box<dyn Source>>,
        asset_context: ResolvedVc<Box<dyn AssetContext>>,
        source_map_generation_options: SourceMapGenerationOptions,
        mangle_export_names: bool,
    ) -> Result<Vc<Self>> {
        Ok(Self::cell(EcmascriptCssModule {
            origin_path: source.ident().await?.path.clone(),
            source,
            asset_context,
            source_map_generation_options,
            mangle_export_names,
        }))
    }
}

/// Whether the class `name` is also exported as a named export. Every class is a key of the default
/// export object, but `default` is that object itself and `__esModule` is defined by the runtime.
fn is_named_export(name: &str) -> bool {
    name != "default" && name != "__esModule"
}

#[turbo_tasks::value_impl]
impl Module for EcmascriptCssModule {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        Ok(self
            .source
            .ident()
            .owned()
            .await?
            .with_modifier(rcstr!("css module"))
            .with_layer(self.asset_context.into_trait_ref().await?.layer())
            .into_vc())
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionSource> {
        Vc::cell(Some(self.source))
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
            .chain(
                match *self
                    .inner(ReferenceType::Css(CssReferenceSubType::Inner))
                    .try_into_module()
                    .await?
                {
                    Some(inner) => Some(
                        InternalCssAssetReference::new(*inner)
                            .to_resolved()
                            .await
                            .map(ResolvedVc::upcast)?,
                    ),
                    None => None,
                },
            )
            .collect();

        Ok(Vc::cell(references))
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        // modules can still effect global styles using `:root` selectors and other similar features
        // We could do better with some static analysis if we want
        ModuleSideEffects::SideEffectful.cell()
    }
}

/// A CSS class that is exported from a CSS module.
///
/// See [`ModuleCssClasses`] for more information.
#[turbo_tasks::value]
#[derive(Debug, Clone)]
pub(crate) enum ModuleCssClass {
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
///
/// The first entry of every export is its own class name, the following entries are the classes it
/// composes directly. They are expanded transitively by [`css_modules_composes`].
///
/// [`css_modules_composes`]: crate::module_composes::css_modules_composes
#[turbo_tasks::value(transparent)]
#[derive(Debug, Clone)]
pub(crate) struct ModuleCssClasses(OrderedAutoMap<String, Vec<ModuleCssClass>>);

#[turbo_tasks::value_impl]
impl EcmascriptCssModule {
    #[turbo_tasks::function]
    pub fn inner(&self, ty: ReferenceType) -> Vc<ProcessResult> {
        self.asset_context.process(*self.source, ty)
    }

    #[turbo_tasks::function]
    pub(crate) async fn classes(self: Vc<Self>) -> Result<Vc<ModuleCssClasses>> {
        let inner = self
            .inner(ReferenceType::Css(CssReferenceSubType::Analyze))
            .module();

        let inner = ResolvedVc::try_sidecast::<Box<dyn ProcessCss>>(inner.to_resolved().await?)
            .context("inner asset should be CSS processable")?;

        let result = inner.get_css_with_placeholder().await?;
        let mut classes = OrderedAutoMap::default();

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
                                    Request::parse(RcStr::from(specifier.clone()).into()),
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
impl ChunkableModule for EcmascriptCssModule {
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
impl EcmascriptChunkPlaceable for EcmascriptCssModule {
    /// The default export is the object of all class names, and every class is also a named
    /// export (see [`is_named_export`]), including names that aren't identifiers, like `foo-bar`.
    #[turbo_tasks::function]
    async fn get_exports(self: Vc<Self>) -> Result<Vc<EcmascriptExports>> {
        let classes = self.classes().await?;
        let exports = std::iter::once(rcstr!("default"))
            .chain(
                classes
                    .keys()
                    .filter(|name| is_named_export(name))
                    .map(|name| RcStr::from(name.as_str())),
            )
            .map(|name| {
                (
                    name.clone(),
                    EsmExport::LocalBinding(name, Liveness::Constant),
                )
            })
            .collect();
        Ok(EcmascriptExports::EsmExports(
            EsmExports {
                exports,
                star_exports: vec![],
                mangle_export_names: self.await?.mangle_export_names,
            }
            .resolved_cell(),
        )
        .cell())
    }

    #[turbo_tasks::function]
    async fn chunk_item_content(
        self: ResolvedVc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        module_graph: Vc<ModuleGraph>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        _estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        // `composes` are flattened across the whole module graph, so the exports are plain
        // strings and don't need to import other CSS modules at runtime.
        let Some(classes) = css_modules_composes(module_graph).get(&self).await? else {
            // The map is computed from the same module graph this module is chunked in, so a
            // missing entry can only be a transient, eventually consistent read while the graph is
            // being recomputed.
            bail!(
                "CSS module {} is missing from the module graph",
                turbofmt!("{}", self.ident()).await?
            );
        };

        // Like other ESM modules, only the used exports are emitted, under the keys their
        // importers read (which are shortened when the exports are mangled). The generated code
        // doesn't import anything at runtime (the `composes` references only order stylesheets),
        // so it can't be part of an import cycle and its exports can be plain values.
        let module = ResolvedVc::upcast::<Box<dyn EcmascriptChunkPlaceable>>(self);
        let export_usage = chunking_context
            .module_export_usage(*ResolvedVc::upcast(self))
            .await?
            .export_usage
            .await?;
        let mut code = format!("{TURBOPACK_ESM}([\n");
        let default = rcstr!("default");
        if export_usage.is_export_used(&default) {
            let key = generated_export_key(module, chunking_context, &default).await?;
            writeln!(code, "  {}, 0, {{", StringifyJs(&key))?;
            for (export_name, class_names) in &classes.0 {
                writeln!(
                    code,
                    "    {}: {},",
                    StringifyJs(export_name),
                    StringifyJs(&class_names.join(" "))
                )?;
            }
            code += "  },\n";
        }
        for (export_name, class_names) in &classes.0 {
            let export_name = RcStr::from(export_name.as_str());
            if !is_named_export(&export_name) || !export_usage.is_export_used(&export_name) {
                continue;
            }
            let key = generated_export_key(module, chunking_context, &export_name).await?;
            writeln!(
                code,
                "  {}, 0, {},",
                StringifyJs(&key),
                StringifyJs(&class_names.join(" "))
            )?;
        }
        code += "]);\n";
        let generation = self.await?.source_map_generation_options;
        let map = if generation.should_generate_any_source_maps() {
            Some(generate_minimal_source_map(
                turbofmt!("{}", self.ident()).await?.to_string(),
                code.clone(),
                generation.full || generation.shallow_sources_content,
            )?)
        } else {
            None
        };
        Ok(EcmascriptChunkItemContent {
            inner_code: code.into(),
            source_maps: match (generation.full, generation.shallow, map) {
                (true, true, Some(map)) if generation.shallow_sources_content => {
                    SourceMaps::Shared(map)
                }
                (true, true, Some(map)) => {
                    SourceMaps::new(Some(map.clone()), Some(map.without_sources_content()))
                }
                (true, false, Some(map)) => SourceMaps::Full(map),
                (false, true, Some(map)) => SourceMaps::Shallow(map),
                _ => SourceMaps::None,
            },
            options: EcmascriptChunkItemOptions {
                supports_arrow_functions: *chunking_context
                    .environment()
                    .runtime_versions()
                    .supports_arrow_functions()
                    .await?,
                ..Default::default()
            },
            ..Default::default()
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl ResolveOrigin for EcmascriptCssModule {
    fn origin_path(&self) -> FileSystemPath {
        self.origin_path.clone()
    }

    fn asset_context(&self) -> ResolvedVc<Box<dyn AssetContext>> {
        self.asset_context
    }
}

fn generate_minimal_source_map(
    filename: String,
    source: String,
    inline_sources_content: bool,
) -> Result<StructuredSourceMap> {
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
    let map = generate_js_source_map(
        &*sm,
        &mappings,
        None,
        true,
        inline_sources_content,
        &Default::default(),
    )?;
    Ok(map)
}
