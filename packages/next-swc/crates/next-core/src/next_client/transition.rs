use anyhow::{bail, Result};
use indexmap::indexmap;
use turbo_binding::turbopack::{
    core::{
        asset::AssetVc,
        chunk::{ChunkingContext, ChunkingContextVc},
        compile_time_info::CompileTimeInfoVc,
        context::AssetContext,
    },
    ecmascript::{
        chunk::EcmascriptChunkPlaceableVc, EcmascriptInputTransform, EcmascriptInputTransformsVc,
        EcmascriptModuleAssetType, EcmascriptModuleAssetVc, InnerAssetsVc,
    },
    turbopack::{
        ecmascript::chunk_group_files_asset::ChunkGroupFilesAsset,
        module_options::ModuleOptionsContextVc,
        resolve_options_context::ResolveOptionsContextVc,
        transition::{Transition, TransitionVc},
        ModuleAssetContextVc,
    },
};
use turbo_tasks::{primitives::OptionStringVc, Value};

use super::runtime_entry::RuntimeEntriesVc;
use crate::embed_js::next_asset;

/// Makes a transition into a next.js client context.
///
/// It wraps the target asset with client bootstrapping hydration. It changes
/// the environment to be inside of the browser. It offers a module to the
/// importer that exports an array of chunk urls.
#[turbo_tasks::value(shared)]
pub struct NextClientTransition {
    pub is_app: bool,
    pub client_compile_time_info: CompileTimeInfoVc,
    pub client_module_options_context: ModuleOptionsContextVc,
    pub client_resolve_options_context: ResolveOptionsContextVc,
    pub client_chunking_context: ChunkingContextVc,
    pub runtime_entries: RuntimeEntriesVc,
}

#[turbo_tasks::value_impl]
impl Transition for NextClientTransition {
    #[turbo_tasks::function]
    fn process_compile_time_info(
        &self,
        _compile_time_info: CompileTimeInfoVc,
    ) -> CompileTimeInfoVc {
        self.client_compile_time_info
    }

    #[turbo_tasks::function]
    fn process_module_options_context(
        &self,
        _context: ModuleOptionsContextVc,
    ) -> ModuleOptionsContextVc {
        self.client_module_options_context
    }

    #[turbo_tasks::function]
    fn process_resolve_options_context(
        &self,
        _context: ResolveOptionsContextVc,
    ) -> ResolveOptionsContextVc {
        self.client_resolve_options_context
    }

    #[turbo_tasks::function]
    async fn process_module(
        &self,
        asset: AssetVc,
        context: ModuleAssetContextVc,
    ) -> Result<AssetVc> {
        let asset = if !self.is_app {
            let internal_asset = next_asset("entry/next-hydrate.tsx");

            EcmascriptModuleAssetVc::new_with_inner_assets(
                internal_asset,
                context.into(),
                Value::new(EcmascriptModuleAssetType::Typescript),
                EcmascriptInputTransformsVc::cell(vec![
                    EcmascriptInputTransform::TypeScript {
                        use_define_for_class_fields: false,
                    },
                    EcmascriptInputTransform::React {
                        development: true,
                        refresh: false,
                        import_source: OptionStringVc::cell(None),
                        runtime: OptionStringVc::cell(None),
                    },
                ]),
                Default::default(),
                context.compile_time_info(),
                InnerAssetsVc::cell(indexmap! {
                    "PAGE".to_string() => asset
                }),
            )
            .into()
        } else {
            let Some(asset) = EcmascriptChunkPlaceableVc::resolve_from(asset).await? else {
                bail!("Not an ecmascript module");
            };
            asset
        };

        let runtime_entries = self.runtime_entries.resolve_entries(context.into());

        let asset = ChunkGroupFilesAsset {
            asset: asset.into(),
            // This ensures that the chunk group files asset will strip out the _next prefix from
            // all chunk paths, which is what the Next.js renderer code expects.
            client_root: self.client_chunking_context.output_root().join("_next"),
            chunking_context: self.client_chunking_context,
            runtime_entries: Some(runtime_entries),
        };

        Ok(asset.cell().into())
    }
}
