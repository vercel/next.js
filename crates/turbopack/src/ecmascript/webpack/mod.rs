use anyhow::Result;
use swc_ecmascript::ast::Lit;
use turbo_tasks::Vc;
use turbo_tasks_fs::{FileContentVc, FileSystemPathVc};

use crate::{
    asset::{Asset, AssetVc},
    reference::{AssetReference, AssetReferenceVc},
    resolve::{parse::RequestVc, resolve, resolve_options, ResolveResult, ResolveResultVc},
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
    fn path(&self) -> FileSystemPathVc {
        self.source.path()
    }
    fn content(&self) -> FileContentVc {
        self.source.content()
    }
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
    pub source: AssetVc,
    pub request: RequestVc,
    pub runtime: WebpackRuntimeVc,
}

#[turbo_tasks::value_impl]
impl AssetReference for WebpackRuntimeAssetReference {
    async fn resolve_reference(&self) -> Result<ResolveResultVc> {
        let context = self.source.path().parent();

        let options = resolve_options(context);

        let options = apply_cjs_specific_options(options);

        let resolved = resolve(context, self.request, options);

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
