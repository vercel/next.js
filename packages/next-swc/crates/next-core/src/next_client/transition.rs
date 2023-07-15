use anyhow::{bail, Result};
use indexmap::indexmap;
use turbo_tasks::{Value, Vc};
use turbopack_binding::turbopack::{
    core::{
        chunk::ChunkingContext,
        compile_time_info::CompileTimeInfo,
        context::AssetContext,
        module::Module,
        reference_type::{InnerAssets, ReferenceType},
    },
    ecmascript::chunk::EcmascriptChunkPlaceable,
    turbopack::{
        ecmascript::chunk_group_files_asset::ChunkGroupFilesAsset,
        module_options::ModuleOptionsContext, resolve_options_context::ResolveOptionsContext,
        transition::Transition, ModuleAssetContext,
    },
};

use super::runtime_entry::RuntimeEntries;
use crate::embed_js::next_asset;

/// Makes a transition into a next.js client context.
///
/// It wraps the target asset with client bootstrapping hydration. It changes
/// the environment to be inside of the browser. It offers a module to the
/// importer that exports an array of chunk urls.
#[turbo_tasks::value(shared)]
pub struct NextClientTransition {
    pub is_app: bool,
    pub client_compile_time_info: Vc<CompileTimeInfo>,
    pub client_module_options_context: Vc<ModuleOptionsContext>,
    pub client_resolve_options_context: Vc<ResolveOptionsContext>,
    pub client_chunking_context: Vc<Box<dyn ChunkingContext>>,
    pub runtime_entries: Vc<RuntimeEntries>,
}

#[turbo_tasks::value_impl]
impl Transition for NextClientTransition {
    #[turbo_tasks::function]
    fn process_compile_time_info(
        &self,
        _compile_time_info: Vc<CompileTimeInfo>,
    ) -> Vc<CompileTimeInfo> {
        self.client_compile_time_info
    }

    #[turbo_tasks::function]
    fn process_module_options_context(
        &self,
        _context: Vc<ModuleOptionsContext>,
    ) -> Vc<ModuleOptionsContext> {
        self.client_module_options_context
    }

    #[turbo_tasks::function]
    fn process_resolve_options_context(
        &self,
        _context: Vc<ResolveOptionsContext>,
    ) -> Vc<ResolveOptionsContext> {
        self.client_resolve_options_context
    }

    #[turbo_tasks::function]
    async fn process_module(
        &self,
        asset: Vc<Box<dyn Module>>,
        context: Vc<ModuleAssetContext>,
    ) -> Result<Vc<Box<dyn Module>>> {
        let asset = if !self.is_app {
            let internal_asset = next_asset("entry/next-hydrate.tsx");

            context.process(
                internal_asset,
                Value::new(ReferenceType::Internal(Vc::cell(indexmap! {
                    "PAGE".to_string() => asset.into()
                }))),
            )
        } else {
            asset
        };
        let Some(asset) = Vc::try_resolve_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(asset).await? else {
            bail!("not an ecmascript placeable module");
        };

        let runtime_entries = self.runtime_entries.resolve_entries(context.into());

        let asset = ChunkGroupFilesAsset {
            module: asset.into(),
            // This ensures that the chunk group files asset will strip out the _next prefix from
            // all chunk paths, which is what the Next.js renderer code expects.
            client_root: self.client_chunking_context.output_root().join("_next"),
            chunking_context: self.client_chunking_context,
            runtime_entries: Some(runtime_entries),
        };

        Ok(asset.cell().into())
    }
}
