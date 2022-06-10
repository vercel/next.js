use anyhow::Result;
use swc_ecmascript::ast::Lit;
use turbo_tasks::Vc;
use turbo_tasks_fs::{FileContentVc, FileSystemPathVc};

use turbopack_core::{
    asset::{Asset, AssetVc},
    context::AssetContextVc,
    reference::{AssetReference, AssetReferenceVc},
    resolve::{parse::RequestVc, resolve, ResolveResult, ResolveResultVc},
    source_asset::SourceAssetVc,
};

use self::{
    parse::{WebpackRuntime, WebpackRuntimeVc},
    references::module_references,
};

use super::resolve::apply_cjs_specific_options;

pub mod parse;
pub(crate) mod references;

#[turbo_tasks::value(Asset)]
#[derive(PartialEq, Eq)]
pub struct ModuleAsset {
    pub source: AssetVc,
    pub runtime: WebpackRuntimeVc,
}

#[turbo_tasks::value_impl]
impl ModuleAssetVc {
    #[turbo_tasks::function]
    pub fn new(source: AssetVc, runtime: WebpackRuntimeVc) -> Self {
        Self::slot(ModuleAsset { source, runtime })
    }
}

#[turbo_tasks::value_impl]
impl Asset for ModuleAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.source.path()
    }
    #[turbo_tasks::function]
    fn content(&self) -> FileContentVc {
        self.source.content()
    }
    #[turbo_tasks::function]
    async fn references(&self) -> Vc<Vec<AssetReferenceVc>> {
        module_references(self.source, self.runtime)
    }
}

#[turbo_tasks::value(shared, AssetReference)]
#[derive(PartialEq, Eq)]
pub struct WebpackChunkAssetReference {
    #[trace_ignore]
    pub chunk_id: Lit,
    pub runtime: WebpackRuntimeVc,
}

#[turbo_tasks::value_impl]
impl AssetReference for WebpackChunkAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<ResolveResultVc> {
        let runtime = self.runtime.await?;
        Ok(match &*runtime {
            WebpackRuntime::Webpack5 {
                chunk_request_expr: _,
                context_path,
            } => {
                // TODO determine filename from chunk_request_expr
                let chunk_id = match &self.chunk_id {
                    Lit::Str(str) => str.value.to_string(),
                    Lit::Num(num) => format!("{num}"),
                    _ => todo!(),
                };
                let filename = format!("./chunks/{}.js", chunk_id);
                let source = SourceAssetVc::new(context_path.join(&filename)).into();

                ResolveResult::Single(ModuleAssetVc::new(source, self.runtime).into(), Vec::new())
                    .into()
            }
            WebpackRuntime::None => ResolveResult::unresolveable().into(),
        })
    }
}

#[turbo_tasks::value(shared, AssetReference)]
#[derive(PartialEq, Eq)]
pub struct WebpackEntryAssetReference {
    pub source: AssetVc,
    pub runtime: WebpackRuntimeVc,
}

#[turbo_tasks::value_impl]
impl AssetReference for WebpackEntryAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        ResolveResult::Single(
            ModuleAssetVc::new(self.source, self.runtime).into(),
            Vec::new(),
        )
        .into()
    }
}

#[turbo_tasks::value(shared, AssetReference)]
#[derive(PartialEq, Eq)]
pub struct WebpackRuntimeAssetReference {
    pub context: AssetContextVc,
    pub request: RequestVc,
    pub runtime: WebpackRuntimeVc,
}

#[turbo_tasks::value_impl]
impl AssetReference for WebpackRuntimeAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<ResolveResultVc> {
        let options = self.context.resolve_options();

        let options = apply_cjs_specific_options(options);

        let resolved = resolve(self.context.context_path(), self.request, options);

        if let ResolveResult::Single(source, ref refs) = *resolved.await? {
            return Ok(ResolveResult::Single(
                ModuleAssetVc::new(source, self.runtime).into(),
                refs.clone(),
            )
            .into());
        }

        Ok(ResolveResult::unresolveable().into())
    }
}
