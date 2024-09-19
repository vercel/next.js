use std::fmt::Write;

use anyhow::Result;
use indexmap::IndexMap;
use turbo_tasks::{RcStr, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack::{transition::Transition, ModuleAssetContext};
use turbopack_core::module::Module;

use crate::{
    app_structure::FileSystemPathVec,
    base_loader_tree::{AppDirModuleType, BaseLoaderTreeBuilder},
};

pub struct AppRouteLoaderTreeBuilder {
    base: BaseLoaderTreeBuilder,
    interceptors_code: String,
}

impl AppRouteLoaderTreeBuilder {
    fn new(
        module_asset_context: Vc<ModuleAssetContext>,
        server_component_transition: Vc<Box<dyn Transition>>,
        project_root: Vc<FileSystemPath>,
    ) -> Self {
        AppRouteLoaderTreeBuilder {
            base: BaseLoaderTreeBuilder::new(
                module_asset_context,
                server_component_transition,
                project_root,
            ),
            interceptors_code: String::new(),
        }
    }

    async fn write_interceptors(&mut self, interceptors: Vc<FileSystemPathVec>) -> Result<()> {
        writeln!(self.interceptors_code, "[")?;

        for interceptor in interceptors.await?.iter() {
            let tuple_code = self
                .base
                .create_module_tuple_code(AppDirModuleType::Interceptor, **interceptor)
                .await?;

            writeln!(self.interceptors_code, "{},", tuple_code)?;
        }

        write!(self.interceptors_code, "]")?;
        Ok(())
    }

    async fn build(
        mut self,
        interceptors: Vc<FileSystemPathVec>,
    ) -> Result<AppRouteLoaderTreeModule> {
        self.write_interceptors(interceptors).await?;

        Ok(AppRouteLoaderTreeModule {
            imports: self.base.imports,
            interceptors_code: self.interceptors_code.into(),
            inner_assets: self.base.inner_assets,
        })
    }
}

pub struct AppRouteLoaderTreeModule {
    pub imports: Vec<RcStr>,
    pub interceptors_code: RcStr,
    pub inner_assets: IndexMap<RcStr, Vc<Box<dyn Module>>>,
}

impl AppRouteLoaderTreeModule {
    pub async fn build(
        interceptors: Vc<FileSystemPathVec>,
        module_asset_context: Vc<ModuleAssetContext>,
        server_component_transition: Vc<Box<dyn Transition>>,
        project_root: Vc<FileSystemPath>,
    ) -> Result<Self> {
        AppRouteLoaderTreeBuilder::new(
            module_asset_context,
            server_component_transition,
            project_root,
        )
        .build(interceptors)
        .await
    }
}
