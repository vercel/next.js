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
        let source_path = source.ident().path().owned().await?;

        let source = self.process_source(source);
        let module_asset_context = self.process_context(module_asset_context);

        Ok(
            match &*module_asset_context.process(source, reference_type).await? {
                ProcessResult::Module(module) => {
                    let Some(module) =
                        ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(*module)
                    else {
                        bail!("not an ecmascript module");
                    };

                    // Create the server component module with the original source path
                    let server_component = NextServerComponentModule::new(*module, source_path);

                    ProcessResult::Module(ResolvedVc::upcast(server_component.to_resolved().await?))
                        .cell()
                }
                ProcessResult::Unknown(source) => ProcessResult::Unknown(*source).cell(),
                ProcessResult::Ignore => ProcessResult::Ignore.cell(),
            },
        )
    }
}
