use anyhow::Result;
use indexmap::indexmap;
use turbo_tasks::Vc;
use turbopack_binding::{
    turbo::tasks_fs::FileSystemPath,
    turbopack::{
        core::{
            chunk::ChunkingContext, compile_time_info::CompileTimeInfo, module::Module,
            source::Source,
        },
        ecmascript::chunk_group_files_asset::ChunkGroupFilesAsset,
        turbopack::{
            module_options::ModuleOptionsContext, resolve_options_context::ResolveOptionsContext,
            transition::Transition, ModuleAssetContext,
        },
    },
};

use crate::bootstrap::route_bootstrap;

#[turbo_tasks::value(shared)]
pub struct NextEdgeRouteTransition {
    pub edge_compile_time_info: Vc<CompileTimeInfo>,
    pub edge_chunking_context: Vc<Box<dyn ChunkingContext>>,
    pub edge_module_options_context: Option<Vc<ModuleOptionsContext>>,
    pub edge_resolve_options_context: Vc<ResolveOptionsContext>,
    pub output_path: Vc<FileSystemPath>,
    pub base_path: Vc<FileSystemPath>,
    pub bootstrap_asset: Vc<Box<dyn Source>>,
    pub entry_name: String,
}

#[turbo_tasks::value_impl]
impl Transition for NextEdgeRouteTransition {
    #[turbo_tasks::function]
    fn process_compile_time_info(
        &self,
        _compile_time_info: Vc<CompileTimeInfo>,
    ) -> Vc<CompileTimeInfo> {
        self.edge_compile_time_info
    }

    #[turbo_tasks::function]
    fn process_module_options_context(
        &self,
        context: Vc<ModuleOptionsContext>,
    ) -> Vc<ModuleOptionsContext> {
        self.edge_module_options_context.unwrap_or(context)
    }

    #[turbo_tasks::function]
    fn process_resolve_options_context(
        &self,
        _context: Vc<ResolveOptionsContext>,
    ) -> Vc<ResolveOptionsContext> {
        self.edge_resolve_options_context
    }

    #[turbo_tasks::function]
    async fn process_module(
        &self,
        asset: Vc<Box<dyn Module>>,
        context: Vc<ModuleAssetContext>,
    ) -> Result<Vc<Box<dyn Module>>> {
        let new_asset = route_bootstrap(
            asset,
            Vc::upcast(context),
            self.base_path,
            self.bootstrap_asset,
            Vc::cell(indexmap! {
                "NAME".to_string() => self.entry_name.clone(),
            }),
        );

        let asset = ChunkGroupFilesAsset {
            module: Vc::upcast(new_asset),
            client_root: self.output_path,
            chunking_context: self.edge_chunking_context,
            runtime_entries: None,
        };

        Ok(Vc::upcast(asset.cell()))
    }
}
