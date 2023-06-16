use anyhow::{bail, Result};
use indexmap::indexmap;
use turbo_tasks::Value;
use turbopack_binding::{
    turbo::tasks_fs::FileSystemPathVc,
    turbopack::{
        core::{
            asset::AssetVc,
            chunk::{ChunkableAssetVc, ChunkingContextVc},
            compile_time_info::CompileTimeInfoVc,
            context::AssetContext,
            reference_type::{EcmaScriptModulesReferenceSubType, InnerAssetsVc, ReferenceType},
            source_asset::SourceAssetVc,
        },
        ecmascript::chunk_group_files_asset::ChunkGroupFilesAsset,
        turbopack::{
            module_options::ModuleOptionsContextVc,
            resolve_options_context::ResolveOptionsContextVc,
            transition::{Transition, TransitionVc},
            ModuleAssetContextVc,
        },
    },
};

use crate::embed_js::next_js_file_path;

/// Transition into edge environment to render an app directory page.
///
/// It changes the environment to the provided edge environment, and wraps the
/// process asset with the provided bootstrap_asset returning the chunks of all
/// that for running them in the edge sandbox.
#[turbo_tasks::value(shared)]
pub struct NextEdgePageTransition {
    pub edge_compile_time_info: CompileTimeInfoVc,
    pub edge_chunking_context: ChunkingContextVc,
    pub edge_module_options_context: Option<ModuleOptionsContextVc>,
    pub edge_resolve_options_context: ResolveOptionsContextVc,
    pub output_path: FileSystemPathVc,
    pub bootstrap_asset: AssetVc,
}

#[turbo_tasks::value_impl]
impl Transition for NextEdgePageTransition {
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
        let asset = context.process(
            self.bootstrap_asset,
            Value::new(ReferenceType::Internal(InnerAssetsVc::cell(indexmap! {
                "APP_ENTRY".to_string() => asset,
                "APP_BOOTSTRAP".to_string() => context.with_transition("next-client").process(
                    SourceAssetVc::new(next_js_file_path("entry/app/hydrate.tsx")).into(),
                    Value::new(ReferenceType::EcmaScriptModules(
                        EcmaScriptModulesReferenceSubType::Undefined,
                    )),
                ),
            }))),
        );

        let Some(asset) = ChunkableAssetVc::resolve_from(asset).await? else {
            bail!("Internal module is not evaluatable");
        };

        let asset = ChunkGroupFilesAsset {
            asset,
            client_root: self.output_path,
            chunking_context: self.edge_chunking_context,
            runtime_entries: None,
        };

        Ok(asset.cell().into())
    }
}
