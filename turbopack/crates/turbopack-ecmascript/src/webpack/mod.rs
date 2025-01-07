use anyhow::Result;
use swc_core::ecma::ast::Lit;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Value, ValueToString, Vc};
use turbopack_core::{
    asset::{Asset, AssetContent},
    file_source::FileSource,
    ident::AssetIdent,
    module::Module,
    reference::{ModuleReference, ModuleReferences},
    reference_type::{CommonJsReferenceSubType, ReferenceType},
    resolve::{
        origin::{ResolveOrigin, ResolveOriginExt},
        parse::Request,
        resolve, ModuleResolveResult, ModuleResolveResultItem,
    },
    source::Source,
};
use turbopack_resolve::ecmascript::apply_cjs_specific_options;

use self::{parse::WebpackRuntime, references::module_references};
use crate::EcmascriptInputTransforms;

pub mod parse;
pub(crate) mod references;

#[turbo_tasks::function]
fn modifier() -> Vc<RcStr> {
    Vc::cell("webpack".into())
}

#[turbo_tasks::value]
pub struct WebpackModuleAsset {
    pub source: ResolvedVc<Box<dyn Source>>,
    pub runtime: ResolvedVc<WebpackRuntime>,
    pub transforms: ResolvedVc<EcmascriptInputTransforms>,
}

#[turbo_tasks::value_impl]
impl WebpackModuleAsset {
    #[turbo_tasks::function]
    pub fn new(
        source: ResolvedVc<Box<dyn Source>>,
        runtime: ResolvedVc<WebpackRuntime>,
        transforms: ResolvedVc<EcmascriptInputTransforms>,
    ) -> Vc<Self> {
        Self::cell(WebpackModuleAsset {
            source,
            runtime,
            transforms,
        })
    }
}

#[turbo_tasks::value_impl]
impl Module for WebpackModuleAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source.ident().with_modifier(modifier())
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<ModuleReferences> {
        module_references(*self.source, *self.runtime, *self.transforms)
    }
}

#[turbo_tasks::value_impl]
impl Asset for WebpackModuleAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}

#[turbo_tasks::value(shared)]
pub struct WebpackChunkAssetReference {
    #[turbo_tasks(trace_ignore)]
    pub chunk_id: Lit,
    pub runtime: ResolvedVc<WebpackRuntime>,
    pub transforms: ResolvedVc<EcmascriptInputTransforms>,
}

#[turbo_tasks::value_impl]
impl ModuleReference for WebpackChunkAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
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
                let filename = format!("./chunks/{}.js", chunk_id).into();
                let source = Vc::upcast(FileSource::new(context_path.join(filename)));

                ModuleResolveResult::module(ResolvedVc::upcast(
                    WebpackModuleAsset::new(source, *self.runtime, *self.transforms)
                        .to_resolved()
                        .await?,
                ))
                .cell()
            }
            WebpackRuntime::None => ModuleResolveResult::unresolvable().cell(),
        })
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for WebpackChunkAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Vc<RcStr> {
        let chunk_id = match &self.chunk_id {
            Lit::Str(str) => str.value.to_string(),
            Lit::Num(num) => format!("{num}"),
            _ => todo!(),
        };
        Vc::cell(format!("webpack chunk {}", chunk_id).into())
    }
}

#[turbo_tasks::value(shared)]
pub struct WebpackEntryAssetReference {
    pub source: ResolvedVc<Box<dyn Source>>,
    pub runtime: ResolvedVc<WebpackRuntime>,
    pub transforms: ResolvedVc<EcmascriptInputTransforms>,
}

#[turbo_tasks::value_impl]
impl ModuleReference for WebpackEntryAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        Ok(ModuleResolveResult::module(ResolvedVc::upcast(
            WebpackModuleAsset::new(*self.source, *self.runtime, *self.transforms)
                .to_resolved()
                .await?,
        ))
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for WebpackEntryAssetReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell("webpack entry".into())
    }
}

#[turbo_tasks::value(shared)]
pub struct WebpackRuntimeAssetReference {
    pub origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    pub request: ResolvedVc<Request>,
    pub runtime: ResolvedVc<WebpackRuntime>,
    pub transforms: ResolvedVc<EcmascriptInputTransforms>,
}

#[turbo_tasks::value_impl]
impl ModuleReference for WebpackRuntimeAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let ty = Value::new(ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined));
        let options = self.origin.resolve_options(ty.clone());

        let options = apply_cjs_specific_options(options);

        let resolved = resolve(
            self.origin.origin_path().parent().resolve().await?,
            Value::new(ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined)),
            *self.request,
            options,
        );

        Ok(resolved
            .await?
            .map_module(|source| async move {
                Ok(ModuleResolveResultItem::Module(ResolvedVc::upcast(
                    WebpackModuleAsset::new(*source, *self.runtime, *self.transforms)
                        .to_resolved()
                        .await?,
                )))
            })
            .await?
            .cell())
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for WebpackRuntimeAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("webpack {}", self.request.to_string().await?,).into(),
        ))
    }
}
