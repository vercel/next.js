use anyhow::Result;
use async_recursion::async_recursion;
use indexmap::IndexMap;
use indoc::formatdoc;
use turbo_tasks::{Value, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_binding::turbopack::{
    core::{
        context::AssetContext,
        file_source::FileSource,
        module::Module,
        reference_type::{EcmaScriptModulesReferenceSubType, InnerAssets, ReferenceType},
    },
    ecmascript::{magic_identifier, text::TextContentFileSource, utils::StringifyJs},
    r#static::StaticModuleAsset,
    turbopack::{transition::Transition, ModuleAssetContext},
};

use crate::{
    app_structure::{Components, LoaderTree, Metadata, MetadataItem, MetadataWithAltItem},
    mode::NextMode,
    next_image::module::{BlurPlaceholderMode, StructuredImageModuleType},
};

pub struct LoaderTreeBuilder {
    inner_assets: IndexMap<String, Vc<Box<dyn Module>>>,
    counter: usize,
    imports: Vec<String>,
    loader_tree_code: String,
    context: Vc<ModuleAssetContext>,
    unsupported_metadata: Vec<Vc<FileSystemPath>>,
    mode: NextMode,
    server_component_transition: ServerComponentTransition,
    pages: Vec<Vc<FileSystemPath>>,
}

#[derive(Clone, Debug)]
pub enum ServerComponentTransition {
    Transition(Vc<Box<dyn Transition>>),
    TransitionName(String),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ComponentType {
    Page,
    DefaultPage,
    Error,
    Layout,
    Loading,
    Template,
    NotFound,
}

impl ComponentType {
    fn name(&self) -> &'static str {
        match self {
            ComponentType::Page => "page",
            ComponentType::DefaultPage => "defaultPage",
            ComponentType::Error => "error",
            ComponentType::Layout => "layout",
            ComponentType::Loading => "loading",
            ComponentType::Template => "template",
            ComponentType::NotFound => "not-found",
        }
    }
}

impl LoaderTreeBuilder {
    fn new(
        context: Vc<ModuleAssetContext>,
        server_component_transition: ServerComponentTransition,
        mode: NextMode,
    ) -> Self {
        LoaderTreeBuilder {
            inner_assets: IndexMap::new(),
            counter: 0,
            imports: Vec::new(),
            loader_tree_code: String::new(),
            context,
            unsupported_metadata: Vec::new(),
            server_component_transition,
            mode,
            pages: Vec::new(),
        }
    }

    fn unique_number(&mut self) -> usize {
        let i = self.counter;
        self.counter += 1;
        i
    }

    async fn write_component(
        &mut self,
        ty: ComponentType,
        component: Option<Vc<FileSystemPath>>,
    ) -> Result<()> {
        use std::fmt::Write;

        if let Some(component) = component {
            if matches!(ty, ComponentType::Page) {
                self.pages.push(component);
            }

            let name = ty.name();
            let i = self.unique_number();
            let identifier = magic_identifier::mangle(&format!("{name} #{i}"));

            match self.mode {
                NextMode::Development | NextMode::DevServer => {
                    let chunks_identifier =
                        magic_identifier::mangle(&format!("chunks of {name} #{i}"));
                    writeln!(
                        self.loader_tree_code,
                        "  {name}: [() => {identifier}, JSON.stringify({chunks_identifier}) + \
                         '.js'],",
                        name = StringifyJs(name)
                    )?;
                    self.imports.push(formatdoc!(
                        r#"
                            ("TURBOPACK {{ chunking-type: isolatedParallel }}");
                            import {}, {{ chunks as {} }} from "COMPONENT_{}";
                        "#,
                        identifier,
                        chunks_identifier,
                        i
                    ));
                }
                NextMode::Build => {
                    writeln!(
                        self.loader_tree_code,
                        "  {name}: [() => {identifier}, {path}],",
                        name = StringifyJs(name),
                        path = StringifyJs(&component.to_string().await?)
                    )?;

                    self.imports.push(formatdoc!(
                        r#"
                        import {} from "COMPONENT_{}";
                        "#,
                        identifier,
                        i
                    ));
                }
            }

            let source = Vc::upcast(FileSource::new(component));
            let reference_ty = Value::new(ReferenceType::EcmaScriptModules(
                EcmaScriptModulesReferenceSubType::Undefined,
            ));

            let module = match &self.server_component_transition {
                ServerComponentTransition::Transition(transition) => {
                    transition.process(source, self.context, reference_ty)
                }
                ServerComponentTransition::TransitionName(transition_name) => self
                    .context
                    .with_transition(transition_name.clone())
                    .process(source, reference_ty),
            };

            self.inner_assets.insert(format!("COMPONENT_{i}"), module);
        }
        Ok(())
    }

    fn write_metadata(&mut self, metadata: &Metadata) -> Result<()> {
        if metadata.is_empty() {
            return Ok(());
        }
        let Metadata {
            icon,
            apple,
            twitter,
            open_graph,
            favicon,
            manifest,
        } = metadata;
        self.loader_tree_code += "  metadata: {";
        self.write_metadata_items("icon", favicon.iter().chain(icon.iter()))?;
        self.write_metadata_items("apple", apple.iter())?;
        self.write_metadata_items("twitter", twitter.iter())?;
        self.write_metadata_items("openGraph", open_graph.iter())?;
        self.write_metadata_manifest(*manifest)?;
        self.loader_tree_code += "  },";
        Ok(())
    }

    fn write_metadata_manifest(&mut self, manifest: Option<MetadataItem>) -> Result<()> {
        let Some(manifest) = manifest else {
            return Ok(());
        };
        match manifest {
            MetadataItem::Static { path } => {
                use std::fmt::Write;
                let i = self.unique_number();
                let identifier = magic_identifier::mangle(&format!("manifest #{i}"));
                let inner_module_id = format!("METADATA_{i}");
                self.imports
                    .push(format!("import {identifier} from \"{inner_module_id}\";"));
                self.inner_assets.insert(
                    inner_module_id,
                    Vc::upcast(StaticModuleAsset::new(
                        Vc::upcast(FileSource::new(path)),
                        Vc::upcast(self.context),
                    )),
                );
                writeln!(self.loader_tree_code, "    manifest: {identifier},")?;
            }
            MetadataItem::Dynamic { path } => {
                self.unsupported_metadata.push(path);
            }
        }

        Ok(())
    }

    fn write_metadata_items<'a>(
        &mut self,
        name: &str,
        it: impl Iterator<Item = &'a MetadataWithAltItem>,
    ) -> Result<()> {
        use std::fmt::Write;
        let mut it = it.peekable();
        if it.peek().is_none() {
            return Ok(());
        }
        writeln!(self.loader_tree_code, "    {name}: [")?;
        for item in it {
            self.write_metadata_item(name, item)?;
        }
        writeln!(self.loader_tree_code, "    ],")?;
        Ok(())
    }

    fn write_metadata_item(&mut self, name: &str, item: &MetadataWithAltItem) -> Result<()> {
        use std::fmt::Write;
        let i = self.unique_number();
        let identifier = magic_identifier::mangle(&format!("{name} #{i}"));
        let inner_module_id = format!("METADATA_{i}");
        self.imports
            .push(format!("import {identifier} from \"{inner_module_id}\";"));
        let s = "      ";
        match item {
            MetadataWithAltItem::Static { path, alt_path } => {
                self.inner_assets.insert(
                    inner_module_id,
                    Vc::upcast(StructuredImageModuleType::create_module(
                        Vc::upcast(FileSource::new(*path)),
                        BlurPlaceholderMode::None,
                        self.context,
                    )),
                );
                writeln!(self.loader_tree_code, "{s}(async (props) => [{{")?;
                writeln!(self.loader_tree_code, "{s}  url: {identifier}.src,")?;
                let numeric_sizes = name == "twitter" || name == "openGraph";
                if numeric_sizes {
                    writeln!(self.loader_tree_code, "{s}  width: {identifier}.width,")?;
                    writeln!(self.loader_tree_code, "{s}  height: {identifier}.height,")?;
                } else {
                    writeln!(
                        self.loader_tree_code,
                        "{s}  sizes: `${{{identifier}.width}}x${{{identifier}.height}}`,"
                    )?;
                }
                if let Some(alt_path) = alt_path {
                    let identifier = magic_identifier::mangle(&format!("{name} alt text #{i}"));
                    let inner_module_id = format!("METADATA_ALT_{i}");
                    self.imports
                        .push(format!("import {identifier} from \"{inner_module_id}\";"));
                    self.inner_assets.insert(
                        inner_module_id,
                        self.context.process(
                            Vc::upcast(TextContentFileSource::new(Vc::upcast(FileSource::new(
                                *alt_path,
                            )))),
                            Value::new(ReferenceType::Internal(InnerAssets::empty())),
                        ),
                    );
                    writeln!(self.loader_tree_code, "{s}  alt: {identifier},")?;
                }
                writeln!(self.loader_tree_code, "{s}}}]),")?;
            }
            MetadataWithAltItem::Dynamic { path, .. } => {
                self.unsupported_metadata.push(*path);
            }
        }
        Ok(())
    }

    #[async_recursion]
    async fn walk_tree(&mut self, loader_tree: Vc<LoaderTree>) -> Result<()> {
        use std::fmt::Write;

        let LoaderTree {
            segment,
            parallel_routes,
            components,
        } = &*loader_tree.await?;

        writeln!(
            self.loader_tree_code,
            "[{segment}, {{",
            segment = StringifyJs(segment)
        )?;
        // add parallel_routes
        for (key, &parallel_route) in parallel_routes.iter() {
            write!(self.loader_tree_code, "{key}: ", key = StringifyJs(key))?;
            self.walk_tree(parallel_route).await?;
            writeln!(self.loader_tree_code, ",")?;
        }
        writeln!(self.loader_tree_code, "}}, {{")?;
        // add components
        let Components {
            page,
            default,
            error,
            layout,
            loading,
            template,
            not_found,
            metadata,
            route: _,
        } = &*components.await?;
        self.write_component(ComponentType::Page, *page).await?;
        self.write_component(ComponentType::DefaultPage, *default)
            .await?;
        self.write_component(ComponentType::Error, *error).await?;
        self.write_component(ComponentType::Layout, *layout).await?;
        self.write_component(ComponentType::Loading, *loading)
            .await?;
        self.write_component(ComponentType::Template, *template)
            .await?;
        self.write_component(ComponentType::NotFound, *not_found)
            .await?;
        self.write_metadata(metadata)?;
        write!(self.loader_tree_code, "}}]")?;
        Ok(())
    }

    async fn build(mut self, loader_tree: Vc<LoaderTree>) -> Result<LoaderTreeModule> {
        self.walk_tree(loader_tree).await?;
        Ok(LoaderTreeModule {
            imports: self.imports,
            loader_tree_code: self.loader_tree_code,
            inner_assets: self.inner_assets,
            unsupported_metadata: self.unsupported_metadata,
            pages: self.pages,
        })
    }
}

pub struct LoaderTreeModule {
    pub imports: Vec<String>,
    pub loader_tree_code: String,
    pub inner_assets: IndexMap<String, Vc<Box<dyn Module>>>,
    pub unsupported_metadata: Vec<Vc<FileSystemPath>>,
    pub pages: Vec<Vc<FileSystemPath>>,
}

impl LoaderTreeModule {
    pub async fn build(
        loader_tree: Vc<LoaderTree>,
        context: Vc<ModuleAssetContext>,
        server_component_transition: ServerComponentTransition,
        mode: NextMode,
    ) -> Result<Self> {
        LoaderTreeBuilder::new(context, server_component_transition, mode)
            .build(loader_tree)
            .await
    }
}
