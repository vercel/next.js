use anyhow::{Result, bail};
use turbo_tasks::{ResolvedVc, Vc};
use turbopack::{ModuleAssetContext, transition::Transition};
use turbopack_core::{
    context::{AssetContext, ProcessResult},
    reference_type::ReferenceType,
    source::Source,
};
use turbopack_ecmascript::chunk::EcmascriptChunkPlaceable;

use super::server_component_module::NextServerComponentModule;

/// This transition wraps a module into a marker
/// [`Vc<NextServerComponentModule>`].
///
/// When walking the module graph to build the client reference manifest, this
/// is used to determine under which server component CSS client references are
/// required. Ultimately, this tells Next.js what CSS to inject into the page.
#[turbo_tasks::value(shared)]
pub struct NextServerComponentTransition {}

#[turbo_tasks::value_impl]
impl NextServerComponentTransition {
    /// Creates a new [`Vc<NextServerComponentTransition>`].
    #[turbo_tasks::function]
    pub fn new() -> Vc<Self> {
        NextServerComponentTransition {}.cell()
    }
}

#[turbo_tasks::value_impl]
impl Transition for NextServerComponentTransition {
    /// Override process to capture the original source path before transformation.
    /// This is important for MDX files where page.mdx becomes page.mdx.tsx after
    /// transformation, but we need the original path for manifest key generation.
    #[turbo_tasks::function]
    async fn process(
        self: Vc<Self>,
        source: Vc<Box<dyn Source>>,
        module_asset_context: Vc<ModuleAssetContext>,
        reference_type: ReferenceType,
    ) -> Result<Vc<ProcessResult>> {
        // Capture the original source path before any transformation
        let source_path = source.ident().path().await?.clone();

        // Apply context modifications but create a context without this transition
        // to avoid recursion when processing
        let processed_context = self.process_context(module_asset_context).await?;
        let context_without_transition = ModuleAssetContext::new(
            *processed_context.transitions,
            *processed_context.compile_time_info,
            *processed_context.module_options_context,
            *processed_context.resolve_options_context,
            processed_context.layer.clone(),
        );

        // Process the source through the context to get the transformed module
        let process_result = context_without_transition
            .process(source, reference_type)
            .await?;

        match &*process_result {
            ProcessResult::Module(module) => {
                let Some(ecma_module) =
                    Vc::try_resolve_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(**module).await?
                else {
                    bail!("not an ecmascript module");
                };

                // Create the server component module with the original source path
                let server_component =
                    NextServerComponentModule::new(ecma_module, (*source_path).clone());

                Ok(
                    ProcessResult::Module(ResolvedVc::upcast(
                        server_component.to_resolved().await?,
                    ))
                    .cell(),
                )
            }
            ProcessResult::Unknown(source) => Ok(ProcessResult::Unknown(*source).cell()),
            ProcessResult::Ignore => Ok(ProcessResult::Ignore.cell()),
        }
    }
}
