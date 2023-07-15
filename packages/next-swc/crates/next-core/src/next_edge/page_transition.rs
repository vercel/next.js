use anyhow::{bail, Result};
use indexmap::indexmap;
use turbo_tasks::{Value, Vc};
use turbopack_binding::{
    turbo::tasks_fs::FileSystemPath,
    turbopack::{
        core::{
            chunk::{ChunkableModule, ChunkingContext},
            compile_time_info::CompileTimeInfo,
            context::AssetContext,
            file_source::FileSource,
            module::Module,
            reference_type::{EcmaScriptModulesReferenceSubType, InnerAssets, ReferenceType},
            source::Source,
        },
        ecmascript::chunk_group_files_asset::ChunkGroupFilesAsset,
        turbopack::{
            module_options::ModuleOptionsContext, resolve_options_context::ResolveOptionsContext,
            transition::Transition, ModuleAssetContext,
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
    pub edge_compile_time_info: Vc<CompileTimeInfo>,
    pub edge_chunking_context: Vc<Box<dyn ChunkingContext>>,
    pub edge_module_options_context: Option<Vc<ModuleOptionsContext>>,
    pub edge_resolve_options_context: Vc<ResolveOptionsContext>,
    pub output_path: Vc<FileSystemPath>,
    pub bootstrap_asset: Vc<Box<dyn Source>>,
}

#[turbo_tasks::value_impl]
impl Transition for NextEdgePageTransition {
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
        let module = context.process(
            self.bootstrap_asset,
            Value::new(ReferenceType::Internal(Vc::cell(indexmap! {
                "APP_ENTRY".to_string() => asset.into(),
                "APP_BOOTSTRAP".to_string() => context.with_transition("next-client").process(
                    FileSource::new(next_js_file_path("entry/app/hydrate.tsx")).into(),
                    Value::new(ReferenceType::EcmaScriptModules(
                        EcmaScriptModulesReferenceSubType::Undefined,
                    )),
                ).into(),
            }))),
        );

        let Some(module) = Vc::try_resolve_sidecast::<Box<dyn ChunkableModule>>(module).await? else {
            bail!("Internal module is not chunkable");
        };

        let asset = ChunkGroupFilesAsset {
            module,
            client_root: self.output_path,
            chunking_context: self.edge_chunking_context,
            runtime_entries: None,
        };

        Ok(asset.cell().into())
    }
}
