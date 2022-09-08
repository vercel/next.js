use anyhow::Result;
use swc_core::{
    common::DUMMY_SP,
    css::{
        ast::*,
        codegen::{writer::basic::BasicCssWriter, CodeGenerator, Emit},
    },
};
use turbo_tasks::{
    primitives::{BoolVc, StringVc},
    ValueToString,
};
use turbopack_core::{
    chunk::{ChunkableAssetReference, ChunkableAssetReferenceVc},
    context::AssetContextVc,
    reference::{AssetReference, AssetReferenceVc},
    resolve::{parse::RequestVc, ResolveResultVc},
};

use crate::references::{css_resolve, AstPathVc};

#[turbo_tasks::value(into = "new")]
pub struct ImportAttributes {
    #[turbo_tasks(trace_ignore)]
    pub layer_name: Option<LayerName>,
    #[turbo_tasks(trace_ignore)]
    pub supports: Option<SupportsCondition>,
    #[turbo_tasks(trace_ignore)]
    pub media: Option<Vec<MediaQuery>>,
}

impl ImportAttributes {
    pub fn new_from_prelude(prelude: &ImportPrelude) -> Self {
        let layer_name = prelude.layer_name.as_ref().map(|l| match l {
            ImportPreludeLayerName::Ident(_) => LayerName {
                span: DUMMY_SP,
                name: vec![],
            },
            ImportPreludeLayerName::Function(f) => {
                assert_eq!(f.value.len(), 1);
                assert!(matches!(&f.value[0], ComponentValue::LayerName(_)));
                if let ComponentValue::LayerName(layer_name) = &f.value[0] {
                    layer_name.clone()
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

    pub fn print_block(&self) -> Result<(String, usize, String)> {
        let token = |token| TokenAndSpan {
            span: DUMMY_SP,
            token,
        };

        // something random that's never gonna be in real css
        let mut rule = Rule::Invalid(Tokens {
            span: DUMMY_SP,
            tokens: vec![token(Token::String {
                value: Default::default(),
                raw: r#""""__turbopack_placeholder__""""#.into(),
            })],
        });
        let mut indent = 0;

        fn at_rule(name: &str, prelude: AtRulePrelude, inner_rule: Rule) -> Rule {
            Rule::AtRule(AtRule {
                span: DUMMY_SP,
                name: AtRuleName::Ident(Ident {
                    span: DUMMY_SP,
                    value: name.into(),
                    raw: None,
                }),
                prelude: Some(prelude),
                block: Some(SimpleBlock {
                    span: DUMMY_SP,
                    name: '{',
                    value: vec![ComponentValue::Rule(inner_rule)],
                }),
            })
        }

        if let Some(media) = &self.media {
            rule = at_rule(
                "media",
                AtRulePrelude::MediaPrelude(MediaQueryList {
                    span: DUMMY_SP,
                    queries: media.clone(),
                }),
                rule,
            );
            indent += 2;
        }
        if let Some(supports) = &self.supports {
            rule = at_rule(
                "supports",
                AtRulePrelude::SupportsPrelude(supports.clone()),
                rule,
            );
            indent += 2;
        }
        if let Some(layer_name) = &self.layer_name {
            rule = at_rule(
                "layer",
                AtRulePrelude::LayerPrelude(LayerPrelude::Name(layer_name.clone())),
                rule,
            );
            indent += 2;
        }

        let mut output = String::new();
        let mut code_gen = CodeGenerator::new(
            BasicCssWriter::new(&mut output, None, Default::default()),
            Default::default(),
        );
        code_gen.emit(&rule)?;

        let (open, close) = output
            .split_once(r#""""__turbopack_placeholder__""""#)
            .unwrap();

        Ok((open.trim().into(), indent, close.trim().into()))
    }
}

#[turbo_tasks::value]
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
