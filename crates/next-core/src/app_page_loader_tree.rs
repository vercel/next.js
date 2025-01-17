use std::{
    fmt::Write,
    mem::{replace, take},
};

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack::{transition::Transition, ModuleAssetContext};
use turbopack_core::{file_source::FileSource, module::Module};
use turbopack_ecmascript::{magic_identifier, text::TextContentFileSource, utils::StringifyJs};

use crate::{
    app_structure::{
        get_metadata_route_name, AppDirModules, AppPageLoaderTree, GlobalMetadata, Metadata,
        MetadataItem, MetadataWithAltItem,
    },
    base_loader_tree::{AppDirModuleType, BaseLoaderTreeBuilder},
    next_app::{
        metadata::{get_content_type, image::dynamic_image_metadata_source},
        AppPage,
    },
    next_image::module::{BlurPlaceholderMode, StructuredImageModuleType},
};

pub struct AppPageLoaderTreeBuilder {
    base: BaseLoaderTreeBuilder,
    loader_tree_code: String,
    pages: Vec<ResolvedVc<FileSystemPath>>,
    /// next.config.js' basePath option to construct og metadata.
    base_path: Option<RcStr>,
}

impl AppPageLoaderTreeBuilder {
    fn new(
        module_asset_context: Vc<ModuleAssetContext>,
        server_component_transition: Vc<Box<dyn Transition>>,
        base_path: Option<RcStr>,
    ) -> Self {
        AppPageLoaderTreeBuilder {
            base: BaseLoaderTreeBuilder::new(module_asset_context, server_component_transition),
            loader_tree_code: String::new(),
            pages: Vec::new(),
            base_path,
        }
    }

    async fn write_modules_entry(
        &mut self,
        module_type: AppDirModuleType,
        path: Option<ResolvedVc<FileSystemPath>>,
    ) -> Result<()> {
        if let Some(path) = path {
            if matches!(module_type, AppDirModuleType::Page) {
                self.pages.push(path);
            }

            let tuple_code = self
                .base
                .create_module_tuple_code(module_type, path)
                .await?;

            writeln!(
                self.loader_tree_code,
                "  {name}: {tuple_code},",
                name = StringifyJs(module_type.name())
            )?;
        }
        Ok(())
    }

    async fn write_metadata(
        &mut self,
        app_page: &AppPage,
        metadata: &Metadata,
        global_metadata: Option<&GlobalMetadata>,
    ) -> Result<()> {
        if metadata.is_empty()
            && global_metadata
                .map(|global| global.is_empty())
                .unwrap_or_default()
        {
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
                self.write_static_metadata_item(
                    app_page,
                    name,
                    item,
                    **path,
                    alt_path.as_deref().copied(),
                )
                .await?;
            }
            MetadataWithAltItem::Dynamic { path, .. } => {
                let i = self.base.unique_number();
                let identifier = magic_identifier::mangle(&format!("{name} #{i}"));
                let inner_module_id = format!("METADATA_{i}");

                self.base
                    .imports
                    .push(format!("import {identifier} from \"{inner_module_id}\";").into());

                let source = dynamic_image_metadata_source(
                    Vc::upcast(self.base.module_asset_context),
                    **path,
                    name.into(),
                    app_page.clone(),
                );

                let module = self.base.process_source(source).to_resolved().await?;
                self.base
                    .inner_assets
                    .insert(inner_module_id.into(), module);

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
        let i = self.base.unique_number();

        let identifier = magic_identifier::mangle(&format!("{name} #{i}"));
        let inner_module_id = format!("METADATA_{i}");
        let helper_import: RcStr = "import { fillMetadataSegment } from \
                                    'next/dist/lib/metadata/get-metadata-route' with { \
                                    'turbopack-transition': 'next-server-utility' }"
            .into();

        if !self.base.imports.contains(&helper_import) {
            self.base.imports.push(helper_import);
        }

        self.base
            .imports
            .push(format!("import {identifier} from \"{inner_module_id}\";").into());
        let module = Vc::upcast(StructuredImageModuleType::create_module(
            Vc::upcast(FileSource::new(path)),
            BlurPlaceholderMode::None,
            self.base.module_asset_context,
        ));
        let module = self.base.process_module(module).to_resolved().await?;
        self.base
            .inner_assets
            .insert(inner_module_id.into(), module);

        let s = "      ";
        writeln!(self.loader_tree_code, "{s}(async (props) => [{{")?;
        let pathname_prefix = if let Some(base_path) = &self.base_path {
            format!("{}/{}", base_path, app_page)
        } else {
            app_page.to_string()
        };
        let metadata_route = &*get_metadata_route_name((*item).into()).await?;
        writeln!(
            self.loader_tree_code,
            "{s}  url: fillMetadataSegment({}, await props.params, {}) + \
             `?${{{identifier}.src.split(\"/\").splice(-1)[0]}}`,",
            StringifyJs(&pathname_prefix),
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

            self.base
                .imports
                .push(format!("import {identifier} from \"{inner_module_id}\";").into());

            let module = self
                .base
                .process_source(Vc::upcast(TextContentFileSource::new(Vc::upcast(
                    FileSource::new(alt_path),
                ))))
                .to_resolved()
                .await?;

            self.base
                .inner_assets
                .insert(inner_module_id.into(), module);

            writeln!(self.loader_tree_code, "{s}  alt: {identifier},")?;
        }

        writeln!(self.loader_tree_code, "{s}}}]),")?;

        Ok(())
    }

    async fn walk_tree(&mut self, loader_tree: &AppPageLoaderTree, root: bool) -> Result<()> {
        use std::fmt::Write;

        let AppPageLoaderTree {
            page: app_page,
            segment,
            parallel_routes,
            modules,
            global_metadata,
        } = loader_tree;

        writeln!(
            self.loader_tree_code,
            "[{segment}, {{",
            segment = StringifyJs(segment)
        )?;

        let temp_loader_tree_code = take(&mut self.loader_tree_code);

        let AppDirModules {
            page,
            default,
            error,
            global_error,
            layout,
            loading,
            template,
            not_found,
            metadata,
            forbidden,
            unauthorized,
            route: _,
        } = &modules;

        // Ensure global metadata being written only once at the root level
        // Otherwise child pages will have redundant metadata
        let global_metadata = &*global_metadata.await?;
        self.write_metadata(
            app_page,
            metadata,
            if root { Some(global_metadata) } else { None },
        )
        .await?;

        self.write_modules_entry(AppDirModuleType::Layout, *layout)
            .await?;
        self.write_modules_entry(AppDirModuleType::Error, *error)
            .await?;
        self.write_modules_entry(AppDirModuleType::Loading, *loading)
            .await?;
        self.write_modules_entry(AppDirModuleType::Template, *template)
            .await?;
        self.write_modules_entry(AppDirModuleType::NotFound, *not_found)
            .await?;
        self.write_modules_entry(AppDirModuleType::Forbidden, *forbidden)
            .await?;
        self.write_modules_entry(AppDirModuleType::Unauthorized, *unauthorized)
            .await?;
        self.write_modules_entry(AppDirModuleType::Page, *page)
            .await?;
        self.write_modules_entry(AppDirModuleType::DefaultPage, *default)
            .await?;
        self.write_modules_entry(AppDirModuleType::GlobalError, *global_error)
            .await?;

        let modules_code = replace(&mut self.loader_tree_code, temp_loader_tree_code);

        // add parallel_routes
        for (key, parallel_route) in parallel_routes.iter() {
            write!(self.loader_tree_code, "{key}: ", key = StringifyJs(key))?;
            Box::pin(self.walk_tree(parallel_route, false)).await?;
            writeln!(self.loader_tree_code, ",")?;
        }
        writeln!(self.loader_tree_code, "}}, {{")?;

        self.loader_tree_code += &modules_code;

        write!(self.loader_tree_code, "}}]")?;
        Ok(())
    }

    async fn build(
        mut self,
        loader_tree: Vc<AppPageLoaderTree>,
    ) -> Result<AppPageLoaderTreeModule> {
        let loader_tree = &*loader_tree.await?;

        let modules = &loader_tree.modules;
        if let Some(global_error) = modules.global_error {
            let module = self
                .base
                .process_source(Vc::upcast(FileSource::new(*global_error)))
                .to_resolved()
                .await?;
            self.base.inner_assets.insert(GLOBAL_ERROR.into(), module);
        };

        self.walk_tree(loader_tree, true).await?;
        Ok(AppPageLoaderTreeModule {
            imports: self.base.imports,
            loader_tree_code: self.loader_tree_code.into(),
            inner_assets: self.base.inner_assets,
            pages: self.pages,
        })
    }
}

pub struct AppPageLoaderTreeModule {
    pub imports: Vec<RcStr>,
    pub loader_tree_code: RcStr,
    pub inner_assets: FxIndexMap<RcStr, ResolvedVc<Box<dyn Module>>>,
    pub pages: Vec<ResolvedVc<FileSystemPath>>,
}

impl AppPageLoaderTreeModule {
    pub async fn build(
        loader_tree: Vc<AppPageLoaderTree>,
        module_asset_context: Vc<ModuleAssetContext>,
        server_component_transition: Vc<Box<dyn Transition>>,
        base_path: Option<RcStr>,
    ) -> Result<Self> {
        AppPageLoaderTreeBuilder::new(module_asset_context, server_component_transition, base_path)
            .build(loader_tree)
            .await
    }
}

pub const GLOBAL_ERROR: &str = "GLOBAL_ERROR_MODULE";
