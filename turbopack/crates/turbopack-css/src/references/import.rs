use anyhow::Result;
use lightningcss::{
    media_query::MediaList,
    rules::{import::ImportRule, layer::LayerName, supports::SupportsCondition},
    traits::ToCss,
};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbopack_core::{
    chunk::{ChunkableModuleReference, ChunkingContext},
    issue::IssueSource,
    reference::ModuleReference,
    reference_type::{CssReferenceSubType, ImportContext},
    resolve::{ModuleResolveResult, origin::ResolveOrigin, parse::Request},
};

use crate::{
    chunk::CssImport,
    code_gen::{CodeGenerateable, CodeGeneration},
    references::css_resolve,
};

#[turbo_tasks::value(into = "new", eq = "manual", serialization = "none")]
pub enum ImportAttributes {
    LightningCss {
        #[turbo_tasks(trace_ignore)]
        layer_name: Option<LayerName<'static>>,
        #[turbo_tasks(trace_ignore)]
        supports: Option<SupportsCondition<'static>>,
        #[turbo_tasks(trace_ignore)]
        media: MediaList<'static>,
    },
}

impl PartialEq for ImportAttributes {
    fn eq(&self, _: &Self) -> bool {
        false
    }
}

impl ImportAttributes {
    pub fn new_from_lightningcss(prelude: &ImportRule<'static>) -> Self {
        let layer_name = prelude.layer.clone().flatten();

        let supports = prelude.supports.clone();

        let media = prelude.media.clone();

        Self::LightningCss {
            layer_name,
            supports,
            media,
        }
    }

    fn as_reference_import_attributes(&self) -> turbopack_core::reference_type::ImportAttributes {
        match self {
            ImportAttributes::LightningCss {
                layer_name,
                supports,
                media,
            } => turbopack_core::reference_type::ImportAttributes {
                layer: layer_name
                    .as_ref()
                    .map(|l| l.to_css_string(Default::default()).unwrap())
                    .map(From::from),
                supports: supports
                    .as_ref()
                    .map(|s| s.to_css_string(Default::default()).unwrap())
                    .map(From::from),
                media: {
                    if media.always_matches() {
                        None
                    } else {
                        Some(media.to_css_string(Default::default()).unwrap().into())
                    }
                },
            },
        }
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct ImportAssetReference {
    pub origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    pub request: ResolvedVc<Request>,
    pub attributes: ResolvedVc<ImportAttributes>,
    pub import_context: Option<ResolvedVc<ImportContext>>,
    pub issue_source: IssueSource,
}

#[turbo_tasks::value_impl]
impl ImportAssetReference {
    #[turbo_tasks::function]
    pub fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: ResolvedVc<Request>,
        attributes: ResolvedVc<ImportAttributes>,
        import_context: Option<ResolvedVc<ImportContext>>,
        issue_source: IssueSource,
    ) -> Vc<Self> {
        Self::cell(ImportAssetReference {
            origin,
            request,
            attributes,
            import_context,
            issue_source,
        })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for ImportAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let own_attrs = self.attributes.await?.as_reference_import_attributes();
        let import_context = match (&self.import_context, own_attrs.is_empty()) {
            (Some(import_context), true) => Some(*import_context),
            (None, false) => Some(
                ImportContext::new(
                    own_attrs.layer.iter().cloned().collect(),
                    own_attrs.media.iter().cloned().collect(),
                    own_attrs.supports.iter().cloned().collect(),
                )
                .to_resolved()
                .await?,
            ),
            (Some(import_context), false) => Some(
                import_context
                    .add_attributes(own_attrs.layer, own_attrs.media, own_attrs.supports)
                    .to_resolved()
                    .await?,
            ),
            (None, true) => None,
        };

        Ok(css_resolve(
            *self.origin,
            *self.request,
            CssReferenceSubType::AtImport(import_context),
            Some(self.issue_source),
        ))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ImportAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("import(url) {}", self.request.to_string().await?,).into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl CodeGenerateable for ImportAssetReference {
    #[turbo_tasks::function]
    async fn code_generation(
        self: Vc<Self>,
        _context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<CodeGeneration>> {
        let this = &*self.await?;
        let mut imports = vec![];
        if let Request::Uri {
            protocol,
            remainder,
            ..
        } = &*this.request.await?
        {
            imports.push(CssImport::External(ResolvedVc::cell(
                format!("{protocol}{remainder}").into(),
            )))
        }

        Ok(CodeGeneration { imports }.into())
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for ImportAssetReference {}
