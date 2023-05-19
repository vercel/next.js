use anyhow::Result;
use indexmap::indexmap;
use turbopack_binding::{
    turbo::tasks_fs::FileSystemPathVc,
    turbopack::{
        core::{asset::AssetVc, chunk::ChunkingContextVc, compile_time_info::CompileTimeInfoVc},
        ecmascript::chunk_group_files_asset::ChunkGroupFilesAsset,
        turbopack::{
            module_options::ModuleOptionsContextVc,
            resolve_options_context::ResolveOptionsContextVc,
            transition::{Transition, TransitionVc},
            ModuleAssetContextVc,
        },
    },
};

use crate::bootstrap::{route_bootstrap, BootstrapConfigVc};

#[turbo_tasks::value(shared)]
pub struct NextEdgeTransition {
    pub edge_compile_time_info: CompileTimeInfoVc,
    pub edge_chunking_context: ChunkingContextVc,
    pub edge_module_options_context: Option<ModuleOptionsContextVc>,
    pub edge_resolve_options_context: ResolveOptionsContextVc,
    pub output_path: FileSystemPathVc,
    pub base_path: FileSystemPathVc,
    pub bootstrap_asset: AssetVc,
    pub entry_name: String,
}

#[turbo_tasks::value_impl]
impl Transition for NextEdgeTransition {
    #[turbo_tasks::function]
    fn process_compile_time_info(
        &self,
        _compile_time_info: CompileTimeInfoVc,
    ) -> CompileTimeInfoVc {
        self.edge_compile_time_info
    }

    #[turbo_tasks::function]
    fn process_module_options_context(
        &self,
        context: ModuleOptionsContextVc,
    ) -> ModuleOptionsContextVc {
        self.edge_module_options_context.unwrap_or(context)
    }

    #[turbo_tasks::function]
    fn process_resolve_options_context(
        &self,
        _context: ResolveOptionsContextVc,
    ) -> ResolveOptionsContextVc {
        self.edge_resolve_options_context
    }

    #[turbo_tasks::function]
    async fn process_module(
        &self,
        asset: AssetVc,
        context: ModuleAssetContextVc,
    ) -> Result<AssetVc> {
        let new_asset = route_bootstrap(
            asset,
            context.into(),
            self.base_path,
            self.bootstrap_asset,
            BootstrapConfigVc::cell(indexmap! {
                "NAME".to_string() => self.entry_name.clone(),
            }),
        );

        let asset = ChunkGroupFilesAsset {
            asset: new_asset.into(),
            client_root: self.output_path,
            chunking_context: self.edge_chunking_context,
            runtime_entries: None,
        };

        Ok(asset.cell().into())
    }
}
