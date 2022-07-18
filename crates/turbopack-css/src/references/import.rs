use anyhow::Result;
use swc_common::DUMMY_SP;
use swc_css_ast::{
    ComponentValue, Ident, ImportPrelude, ImportPreludeLayerName, ImportPreludeSupportsType,
    MediaQuery, SupportsCondition, SupportsConditionType, SupportsFeature, SupportsInParens,
};
use turbo_tasks::primitives::{BoolVc, StringVc};
use turbopack_core::{
    chunk::{ChunkableAssetReference, ChunkableAssetReferenceVc},
    context::AssetContextVc,
    reference::{AssetReference, AssetReferenceVc},
    resolve::{parse::RequestVc, ResolveResultVc},
};

use crate::references::{css_resolve, AstPathVc};

#[turbo_tasks::value(into: new)]
pub struct ImportAttributes {
    #[trace_ignore]
    pub layer_name: Option<Option<Vec<Ident>>>,
    #[trace_ignore]
    pub supports: Option<SupportsCondition>,
    #[trace_ignore]
    pub media: Option<Vec<MediaQuery>>,
}

impl ImportAttributes {
    pub fn new_from_prelude(prelude: &ImportPrelude) -> Self {
        let layer_name = prelude.layer_name.as_ref().map(|l| match l {
            ImportPreludeLayerName::Ident(_) => None,
            ImportPreludeLayerName::Function(f) => {
                assert_eq!(f.value.len(), 1);
                assert!(matches!(&f.value[0], ComponentValue::Ident(_)));
                if let ComponentValue::Ident(ident) = &f.value[0] {
                    Some(vec![ident.clone()])
                } else {
                    unreachable!()
                }
            }
        });

        let supports = prelude.supports.as_ref().map(|s| match s {
            ImportPreludeSupportsType::SupportsCondition(s) => s.clone(),
            ImportPreludeSupportsType::Declaration(d) => SupportsCondition {
                span: DUMMY_SP,
                conditions: vec![SupportsConditionType::SupportsInParens(
                    SupportsInParens::Feature(SupportsFeature::Declaration(d.clone())),
                )],
            },
        });

        let media = prelude.media.as_ref().map(|m| m.queries.clone());

        Self {
            layer_name,
            supports,
            media,
        }
    }
}

#[turbo_tasks::value(AssetReference, ChunkableAssetReference)]
#[derive(Hash, Debug)]
pub struct ImportAssetReference {
    pub context: AssetContextVc,
    pub request: RequestVc,
    pub path: AstPathVc,
    pub attributes: ImportAttributesVc,
}

#[turbo_tasks::value_impl]
impl ImportAssetReferenceVc {
    #[turbo_tasks::function]
    pub fn new(
        context: AssetContextVc,
        request: RequestVc,
        path: AstPathVc,
        attributes: ImportAttributesVc,
    ) -> Self {
        Self::cell(ImportAssetReference {
            context,
            request,
            path,
            attributes,
        })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for ImportAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        css_resolve(self.request, self.context)
    }

    #[turbo_tasks::function]
    async fn description(&self) -> anyhow::Result<StringVc> {
        Ok(StringVc::cell(format!(
            "import(url) {}",
            self.request.to_string().await?,
        )))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAssetReference for ImportAssetReference {
    #[turbo_tasks::function]
    fn is_chunkable(&self) -> BoolVc {
        BoolVc::cell(true)
    }
}
