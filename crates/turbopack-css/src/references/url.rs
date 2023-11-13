use anyhow::{bail, Result};
use swc_core::{
    common::DUMMY_SP,
    css::ast::{Str, UrlValue},
};
use turbo_tasks::{debug::ValueDebug, Value, ValueToString, Vc};
use turbopack_core::{
    chunk::{
        ChunkableModule, ChunkableModuleReference, ChunkingContext, ChunkingType,
        ChunkingTypeOption,
    },
    ident::AssetIdent,
    issue::{IssueSeverity, IssueSource},
    output::OutputAsset,
    reference::ModuleReference,
    reference_type::UrlReferenceSubType,
    resolve::{origin::ResolveOrigin, parse::Request, ModuleResolveResult},
};
use turbopack_ecmascript::resolve::url_resolve;

use crate::{
    code_gen::{CodeGenerateable, CodeGeneration},
    create_visitor,
    embed::CssEmbed,
    references::AstPath,
};

#[turbo_tasks::value(into = "new")]
pub enum ReferencedAsset {
    Some(Vc<Box<dyn OutputAsset>>),
    None,
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct UrlAssetReference {
    pub origin: Vc<Box<dyn ResolveOrigin>>,
    pub request: Vc<Request>,
    pub path: Vc<AstPath>,
    pub issue_source: Vc<IssueSource>,
}

#[turbo_tasks::value_impl]
impl UrlAssetReference {
    #[turbo_tasks::function]
    pub fn new(
        origin: Vc<Box<dyn ResolveOrigin>>,
        request: Vc<Request>,
        path: Vc<AstPath>,
        issue_source: Vc<IssueSource>,
    ) -> Vc<Self> {
        Self::cell(UrlAssetReference {
            origin,
            request,
            path,
            issue_source,
        })
    }

    #[turbo_tasks::function]
    async fn get_referenced_asset(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<ReferencedAsset>> {
        if let Some(module) = *self.resolve_reference().first_module().await? {
            if let Some(chunkable) =
                Vc::try_resolve_downcast::<Box<dyn ChunkableModule>>(module).await?
            {
                let chunk_item = chunkable.as_chunk_item(chunking_context);
                if let Some(embeddable) =
                    Vc::try_resolve_downcast::<Box<dyn CssEmbed>>(chunk_item).await?
                {
                    return Ok(ReferencedAsset::Some(embeddable.embedded_asset()).into());
                }
            }
            bail!(
                "A module referenced by a url() reference must be chunkable and the chunk item \
                 must be css embeddable\nreferenced module: {:?}",
                module.dbg_depth(1).await?
            )
        }
        Ok(ReferencedAsset::cell(ReferencedAsset::None))
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for UrlAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        url_resolve(
            self.origin,
            self.request,
            Value::new(UrlReferenceSubType::CssUrl),
            self.issue_source,
            IssueSeverity::Error.cell(),
        )
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for UrlAssetReference {
    #[turbo_tasks::function]
    fn chunking_type(self: Vc<Self>) -> Vc<ChunkingTypeOption> {
        // Since this chunk item is embedded, we don't want to put it in the chunk group
        Vc::cell(Some(ChunkingType::Passthrough))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for UrlAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<String>> {
        Ok(Vc::cell(
            format!("url {}", self.request.to_string().await?,),
        ))
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for UrlAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
        let this = self.await?;
        // TODO(WEB-662) This is not the correct way to get the current chunk path. It
        // currently works as all chunks are in the same directory.
        let chunk_path = chunking_context.chunk_path(
            AssetIdent::from_path(this.origin.origin_path()),
            ".css".to_string(),
        );
        let context_path = chunk_path.parent().await?;

        let mut visitors = Vec::new();

        if let ReferencedAsset::Some(asset) = &*self.get_referenced_asset(chunking_context).await? {
            let path = asset.ident().path().await?;
            let relative_path = context_path
                .get_relative_path_to(&path)
                .unwrap_or_else(|| format!("/{}", path.path));

            visitors.push(
                create_visitor!((&this.path.await?), visit_mut_url(u: &mut Url) {
                    u.value = Some(Box::new(UrlValue::Str(Str {
                        span: DUMMY_SP,
                        value: relative_path.as_str().into(),
                        raw: None,
                    })))
                }),
            );
        }

        Ok(CodeGeneration {
            visitors,
            imports: vec![],
        }
        .into())
    }
}
