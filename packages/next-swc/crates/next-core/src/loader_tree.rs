use anyhow::Result;
use async_recursion::async_recursion;
use indexmap::IndexMap;
use indoc::formatdoc;
use turbo_tasks::{Value, ValueToString};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_binding::turbopack::{
    core::{
        asset::AssetVc,
        context::AssetContext,
        file_source::FileSourceVc,
        reference_type::{EcmaScriptModulesReferenceSubType, InnerAssetsVc, ReferenceType},
    },
    ecmascript::{magic_identifier, text::TextContentFileSourceVc, utils::StringifyJs},
    r#static::StaticModuleAssetVc,
    turbopack::{
        transition::{Transition, TransitionVc},
        ModuleAssetContextVc,
    },
};

use crate::{
    app_structure::{
        Components, LoaderTree, LoaderTreeVc, Metadata, MetadataItem, MetadataWithAltItem,
    },
    mode::NextMode,
    next_image::module::{BlurPlaceholderMode, StructuredImageModuleType},
};

pub struct LoaderTreeBuilder {
    inner_assets: IndexMap<String, AssetVc>,
    counter: usize,
    imports: Vec<String>,
    loader_tree_code: String,
    context: ModuleAssetContextVc,
    unsupported_metadata: Vec<FileSystemPathVc>,
    mode: NextMode,
    server_component_transition: ServerComponentTransition,
    pages: Vec<FileSystemPathVc>,
}

#[derive(Clone, Debug)]
pub enum ServerComponentTransition {
    Transition(TransitionVc),
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
        context: ModuleAssetContextVc,
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
        component: Option<FileSystemPathVc>,
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
                NextMode::Development => {
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

            let source = FileSourceVc::new(component).into();
            let reference_ty = Value::new(ReferenceType::EcmaScriptModules(
                EcmaScriptModulesReferenceSubType::Undefined,
            ));

            let module = match &self.server_component_transition {
                ServerComponentTransition::Transition(transition) => {
                    transition.process(source, self.context, reference_ty)
                }
                ServerComponentTransition::TransitionName(transition_name) => self
                    .context
                    .with_transition(transition_name.as_str())
                    .process(source, reference_ty),
            };

            self.inner_assets
                .insert(format!("COMPONENT_{i}"), module.into());
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
                    StaticModuleAssetVc::new(FileSourceVc::new(path).into(), self.context.into())
                        .into(),
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
                    StructuredImageModuleType::create_module(
                        FileSourceVc::new(*path).into(),
                        BlurPlaceholderMode::None,
                        self.context,
                    )
                    .into(),
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
                        self.context
                            .process(
                                TextContentFileSourceVc::new(FileSourceVc::new(*alt_path).into())
                                    .into(),
                                Value::new(ReferenceType::Internal(InnerAssetsVc::empty())),
                            )
                            .into(),
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
    async fn walk_tree(&mut self, loader_tree: LoaderTreeVc) -> Result<()> {
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

    async fn build(mut self, loader_tree: LoaderTreeVc) -> Result<LoaderTreeModule> {
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
    pub inner_assets: IndexMap<String, AssetVc>,
    pub unsupported_metadata: Vec<FileSystemPathVc>,
    pub pages: Vec<FileSystemPathVc>,
}

impl LoaderTreeModule {
    pub async fn build(
        loader_tree: LoaderTreeVc,
        context: ModuleAssetContextVc,
        server_component_transition: ServerComponentTransition,
        mode: NextMode,
    ) -> Result<Self> {
        LoaderTreeBuilder::new(context, server_component_transition, mode)
            .build(loader_tree)
            .await
    }
}
