use std::{
    fmt::Write,
    mem::{replace, take},
};

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
    turbopack::{transition::Transition, ModuleAssetContext},
};

use crate::{
    app_structure::{
        get_metadata_route_name, Components, GlobalMetadata, LoaderTree, Metadata, MetadataItem,
        MetadataWithAltItem,
    },
    mode::NextMode,
    next_app::{
        metadata::{get_content_type, image::dynamic_image_metadata_source},
        AppPage,
    },
    next_image::module::{BlurPlaceholderMode, StructuredImageModuleType},
};

pub struct LoaderTreeBuilder {
    inner_assets: IndexMap<String, Vc<Box<dyn Module>>>,
    counter: usize,
    imports: Vec<String>,
    loader_tree_code: String,
    context: Vc<ModuleAssetContext>,
    mode: NextMode,
    server_component_transition: Vc<Box<dyn Transition>>,
    pages: Vec<Vc<FileSystemPath>>,
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
        server_component_transition: Vc<Box<dyn Transition>>,
        mode: NextMode,
    ) -> Self {
        LoaderTreeBuilder {
            inner_assets: IndexMap::new(),
            counter: 0,
            imports: Vec::new(),
            loader_tree_code: String::new(),
            context,
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
        if let Some(component) = component {
            if matches!(ty, ComponentType::Page) {
                self.pages.push(component);
            }

            let name = ty.name();
            let i = self.unique_number();
            let identifier = magic_identifier::mangle(&format!("{name} #{i}"));

            let source = Vc::upcast(FileSource::new(component));
            let reference_ty = Value::new(ReferenceType::EcmaScriptModules(
                EcmaScriptModulesReferenceSubType::Undefined,
            ));
            let module = self
                .server_component_transition
                .process(source, self.context, reference_ty)
                .module();

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
                        path = StringifyJs(&module.ident().path().to_string().await?)
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

            self.inner_assets.insert(format!("COMPONENT_{i}"), module);
        }
        Ok(())
    }

    async fn write_metadata(
        &mut self,
        app_page: &AppPage,
        metadata: &Metadata,
        global_metadata: Option<&GlobalMetadata>,
    ) -> Result<()> {
        if metadata.is_empty() {
            return Ok(());
        }
        let Metadata {
            icon,
            apple,
            twitter,
            open_graph,
            sitemap: _,
            base_page,
        } = metadata;
        let app_page = base_page.as_ref().unwrap_or(app_page);
        self.loader_tree_code += "  metadata: {";

        // naively convert metadataitem -> metadatawithaltitem to iterate along with
        // other icon items
        let icon = if let Some(favicon) = global_metadata.and_then(|m| m.favicon) {
            let item = match favicon {
                MetadataItem::Static { path } => MetadataWithAltItem::Static {
                    path,
                    alt_path: None,
                },
                MetadataItem::Dynamic { path } => MetadataWithAltItem::Dynamic { path },
            };
            let mut item = vec![item];
            item.extend(icon.iter());
            item
        } else {
            icon.clone()
        };

        self.write_metadata_items(app_page, "icon", icon.iter())
            .await?;
        self.write_metadata_items(app_page, "apple", apple.iter())
            .await?;
        self.write_metadata_items(app_page, "twitter", twitter.iter())
            .await?;
        self.write_metadata_items(app_page, "openGraph", open_graph.iter())
            .await?;

        if let Some(global_metadata) = global_metadata {
            self.write_metadata_manifest(global_metadata.manifest)
                .await?;
        }
        self.loader_tree_code += "  },";
        Ok(())
    }

    async fn write_metadata_manifest(&mut self, manifest: Option<MetadataItem>) -> Result<()> {
        let Some(manifest) = manifest else {
            return Ok(());
        };

        let manifest_route = &format!("/{}", get_metadata_route_name(manifest).await?);
        writeln!(
            self.loader_tree_code,
            "    manifest: {},",
            StringifyJs(manifest_route)
        )?;

        Ok(())
    }

    async fn write_metadata_items<'a>(
        &mut self,
        app_page: &AppPage,
        name: &str,
        it: impl Iterator<Item = &'a MetadataWithAltItem>,
    ) -> Result<()> {
        let mut it = it.peekable();
        if it.peek().is_none() {
            return Ok(());
        }
        writeln!(self.loader_tree_code, "    {name}: [")?;
        for item in it {
            self.write_metadata_item(app_page, name, item).await?;
        }
        writeln!(self.loader_tree_code, "    ],")?;
        Ok(())
    }

    async fn write_metadata_item(
        &mut self,
        app_page: &AppPage,
        name: &str,
        item: &MetadataWithAltItem,
    ) -> Result<()> {
        match item {
            MetadataWithAltItem::Static { path, alt_path } => {
                self.write_static_metadata_item(app_page, name, item, *path, *alt_path)
                    .await?;
            }
            MetadataWithAltItem::Dynamic { path, .. } => {
                let i = self.unique_number();
                let identifier = magic_identifier::mangle(&format!("{name} #{i}"));
                let inner_module_id = format!("METADATA_{i}");

                self.imports
                    .push(format!("import {identifier} from \"{inner_module_id}\";"));

                let source = dynamic_image_metadata_source(
                    Vc::upcast(self.context),
                    *path,
                    name.to_string(),
                    app_page.clone(),
                );

                let module = self
                    .context
                    .process(
                        source,
                        Value::new(ReferenceType::EcmaScriptModules(
                            EcmaScriptModulesReferenceSubType::Undefined,
                        )),
                    )
                    .module();
                self.inner_assets.insert(inner_module_id, module);

                let s = "      ";
                writeln!(self.loader_tree_code, "{s}{identifier},")?;
            }
        }
        Ok(())
    }

    async fn write_static_metadata_item(
        &mut self,
        app_page: &AppPage,
        name: &str,
        item: &MetadataWithAltItem,
        path: Vc<FileSystemPath>,
        alt_path: Option<Vc<FileSystemPath>>,
    ) -> Result<()> {
        let i = self.unique_number();
        let identifier = magic_identifier::mangle(&format!("{name} #{i}"));
        let inner_module_id = format!("METADATA_{i}");
        let helper_import = "import { fillMetadataSegment } from \
                             \"next/dist/lib/metadata/get-metadata-route\""
            .to_string();

        if !self.imports.contains(&helper_import) {
            self.imports.push(helper_import);
        }

        self.imports
            .push(format!("import {identifier} from \"{inner_module_id}\";"));
        self.inner_assets.insert(
            inner_module_id,
            Vc::upcast(StructuredImageModuleType::create_module(
                Vc::upcast(FileSource::new(path)),
                BlurPlaceholderMode::None,
                self.context,
            )),
        );

        let s = "      ";
        writeln!(self.loader_tree_code, "{s}(async (props) => [{{")?;

        let metadata_route = &*get_metadata_route_name((*item).into()).await?;
        writeln!(
            self.loader_tree_code,
            "{s}  url: fillMetadataSegment({}, props.params, {}) + \
             `?${{{identifier}.src.split(\"/\").splice(-1)[0]}}`,",
            StringifyJs(&app_page.to_string()),
            StringifyJs(metadata_route),
        )?;

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

        let content_type = get_content_type(path).await?;
        writeln!(self.loader_tree_code, "{s}  type: `{content_type}`,")?;

        if let Some(alt_path) = alt_path {
            let identifier = magic_identifier::mangle(&format!("{name} alt text #{i}"));
            let inner_module_id = format!("METADATA_ALT_{i}");
            self.imports
                .push(format!("import {identifier} from \"{inner_module_id}\";"));
            let module = self
                .context
                .process(
                    Vc::upcast(TextContentFileSource::new(Vc::upcast(FileSource::new(
                        alt_path,
                    )))),
                    Value::new(ReferenceType::Internal(InnerAssets::empty())),
                )
                .module();
            self.inner_assets.insert(inner_module_id, module);

            writeln!(self.loader_tree_code, "{s}  alt: {identifier},")?;
        }

        writeln!(self.loader_tree_code, "{s}}}]),")?;

        Ok(())
    }

    #[async_recursion]
    async fn walk_tree(&mut self, loader_tree: Vc<LoaderTree>, root: bool) -> Result<()> {
        use std::fmt::Write;

        let LoaderTree {
            page: app_page,
            segment,
            parallel_routes,
            components,
            global_metadata,
        } = &*loader_tree.await?;

        writeln!(
            self.loader_tree_code,
            "[{segment}, {{",
            segment = StringifyJs(segment)
        )?;

        // Components need to be referenced first
        let temp_loader_tree_code = take(&mut self.loader_tree_code);
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
        self.write_component(ComponentType::Layout, *layout).await?;
        self.write_component(ComponentType::Page, *page).await?;
        self.write_component(ComponentType::DefaultPage, *default)
            .await?;
        self.write_component(ComponentType::Error, *error).await?;
        self.write_component(ComponentType::Loading, *loading)
            .await?;
        self.write_component(ComponentType::Template, *template)
            .await?;
        self.write_component(ComponentType::NotFound, *not_found)
            .await?;
        let components_code = replace(&mut self.loader_tree_code, temp_loader_tree_code);

        // add parallel_routes
        for (key, &parallel_route) in parallel_routes.iter() {
            write!(self.loader_tree_code, "{key}: ", key = StringifyJs(key))?;
            self.walk_tree(parallel_route, false).await?;
            writeln!(self.loader_tree_code, ",")?;
        }
        writeln!(self.loader_tree_code, "}}, {{")?;

        self.loader_tree_code += &components_code;

        // Ensure global metadata being written only once at the root level
        // Otherwise child pages will have redundant metadata
        let global_metadata = &*global_metadata.await?;
        self.write_metadata(
            app_page,
            metadata,
            if root { Some(global_metadata) } else { None },
        )
        .await?;

        write!(self.loader_tree_code, "}}]")?;
        Ok(())
    }

    async fn build(mut self, loader_tree: Vc<LoaderTree>) -> Result<LoaderTreeModule> {
        self.walk_tree(loader_tree, true).await?;
        Ok(LoaderTreeModule {
            imports: self.imports,
            loader_tree_code: self.loader_tree_code,
            inner_assets: self.inner_assets,
            pages: self.pages,
        })
    }
}

pub struct LoaderTreeModule {
    pub imports: Vec<String>,
    pub loader_tree_code: String,
    pub inner_assets: IndexMap<String, Vc<Box<dyn Module>>>,
    pub pages: Vec<Vc<FileSystemPath>>,
}

impl LoaderTreeModule {
    pub async fn build(
        loader_tree: Vc<LoaderTree>,
        context: Vc<ModuleAssetContext>,
        server_component_transition: Vc<Box<dyn Transition>>,
        mode: NextMode,
    ) -> Result<Self> {
        LoaderTreeBuilder::new(context, server_component_transition, mode)
            .build(loader_tree)
            .await
    }
}
