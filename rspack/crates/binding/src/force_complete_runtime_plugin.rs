use rspack_core::{
    ApplyContext, ChunkUkey, Compilation, CompilationAdditionalTreeRuntimeRequirements, Plugin,
    RuntimeGlobals, RuntimeModule,
};
use rspack_error::Result;
use rspack_hook::{plugin, plugin_hook};

#[derive(Debug)]
#[plugin]
pub struct ForceCompleteRuntimePlugin;

impl ForceCompleteRuntimePlugin {
    pub fn new() -> Self {
        Self::new_inner()
    }
}

#[plugin_hook(
    CompilationAdditionalTreeRuntimeRequirements for ForceCompleteRuntimePlugin,
    tracing = false
)]
async fn additional_tree_runtime_requirements(
    &self,
    _compilation: &Compilation,
    _chunk_ukey: &ChunkUkey,
    runtime_requirements: &mut RuntimeGlobals,
    _runtime_modules: &mut Vec<Box<dyn RuntimeModule>>,
) -> Result<()> {
    runtime_requirements.insert(RuntimeGlobals::COMPAT_GET_DEFAULT_EXPORT);

    Ok(())
}

impl Plugin for ForceCompleteRuntimePlugin {
    fn name(&self) -> &'static str {
        "ForceCompleteRuntimePlugin"
    }

    fn apply(&self, ctx: &mut ApplyContext<'_>) -> Result<()> {
        ctx.compilation_hooks
            .additional_tree_runtime_requirements
            .tap(additional_tree_runtime_requirements::new(self));

        Ok(())
    }
}
