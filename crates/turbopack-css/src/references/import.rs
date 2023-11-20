use anyhow::Result;
use lightningcss::{
    media_query::MediaList,
    printer::Printer,
    properties::custom::TokenList,
    rules::{
        import::ImportRule,
        layer::{LayerBlockRule, LayerName},
        media::MediaRule,
        supports::{SupportsCondition, SupportsRule},
        unknown::UnknownAtRule,
        CssRule, CssRuleList, Location,
    },
    stylesheet::PrinterOptions,
    traits::ToCss,
};
use swc_core::{
    common::DUMMY_SP,
    css::codegen::{
        writer::basic::{BasicCssWriter, BasicCssWriterConfig},
        CodeGenerator, Emit,
    },
};
use turbo_tasks::{Value, ValueToString, Vc};
use turbopack_core::{
    chunk::{ChunkableModuleReference, ChunkingContext},
    issue::IssueSource,
    reference::ModuleReference,
    reference_type::CssReferenceSubType,
    resolve::{origin::ResolveOrigin, parse::Request, ModuleResolveResult},
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
    Swc {
        #[turbo_tasks(trace_ignore)]
        layer_name: Option<swc_core::css::ast::LayerName>,
        #[turbo_tasks(trace_ignore)]
        supports: Option<swc_core::css::ast::SupportsCondition>,
        #[turbo_tasks(trace_ignore)]
        media: Option<Vec<swc_core::css::ast::MediaQuery>>,
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

    pub fn new_from_swc(prelude: &swc_core::css::ast::ImportPrelude) -> Self {
        let layer_name = prelude.layer_name.as_ref().map(|l| match l {
            box swc_core::css::ast::ImportLayerName::Ident(_) => swc_core::css::ast::LayerName {
                span: DUMMY_SP,
                name: vec![],
            },
            box swc_core::css::ast::ImportLayerName::Function(f) => {
                assert_eq!(f.value.len(), 1);
                assert!(matches!(
                    &f.value[0],
                    swc_core::css::ast::ComponentValue::LayerName(_)
                ));
                if let swc_core::css::ast::ComponentValue::LayerName(layer_name) = &f.value[0] {
                    *layer_name.clone()
                } else {
                    unreachable!()
                }
            }
        });

        let (supports, media) = prelude
            .import_conditions
            .as_ref()
            .map(|c| {
                let supports = if let Some(supports) = &c.supports {
                    let v = supports.value.iter().find(|v| {
                        matches!(
                            v,
                            swc_core::css::ast::ComponentValue::SupportsCondition(..)
                                | swc_core::css::ast::ComponentValue::Declaration(..)
                        )
                    });

                    if let Some(supports) = v {
                        match &supports {
                            swc_core::css::ast::ComponentValue::SupportsCondition(s) => {
                                Some(*s.clone())
                            }
                            swc_core::css::ast::ComponentValue::Declaration(d) => {
                                Some(swc_core::css::ast::SupportsCondition {
                                    span: DUMMY_SP,
                                    conditions: vec![
                                        swc_core::css::ast::SupportsConditionType::SupportsInParens(
                                            swc_core::css::ast::SupportsInParens::Feature(
                                                swc_core::css::ast::SupportsFeature::Declaration(
                                                    d.clone(),
                                                ),
                                            ),
                                        ),
                                    ],
                                })
                            }
                            _ => None,
                        }
                    } else {
                        None
                    }
                } else {
                    None
                };

                let media = c.media.as_ref().map(|m| m.queries.clone());

                (supports, media)
            })
            .unwrap_or_else(|| (None, None));

        Self::Swc {
            layer_name,
            supports,
            media,
        }
    }

    pub fn print_block(&self) -> Result<(String, String)> {
        match self {
            ImportAttributes::LightningCss {
                layer_name,
                supports,
                media,
            } => {
                // something random that's never gonna be in real css
                // Box::new(ListOfComponentValues {
                //     span: DUMMY_SP,
                //     children: vec![ComponentValue::PreservedToken(Box::new(token(
                //         Token::String {
                //             value: Default::default(),
                //             raw: r#""""__turbopack_placeholder__""""#.into(),
                //         },
                //     )))],
                // })

                let default_loc = Location {
                    source_index: 0,
                    line: 0,
                    column: 0,
                };

                let mut rule: CssRule = CssRule::Unknown(UnknownAtRule {
                    name: r#""""__turbopack_placeholder__""""#.into(),
                    prelude: TokenList(vec![]),
                    block: None,
                    loc: default_loc,
                });

                if !media.media_queries.is_empty() {
                    rule = CssRule::Media(MediaRule {
                        query: media.clone(),
                        rules: CssRuleList(vec![rule]),
                        loc: default_loc,
                    })
                }

                if let Some(supports) = &supports {
                    rule = CssRule::Supports(SupportsRule {
                        condition: supports.clone(),
                        rules: CssRuleList(vec![rule]),
                        loc: default_loc,
                    })
                }
                if let Some(layer_name) = &layer_name {
                    rule = CssRule::LayerBlock(LayerBlockRule {
                        loc: default_loc,
                        name: Some(layer_name.clone()),
                        rules: CssRuleList(vec![rule]),
                    });
                }

                let mut output = String::new();
                let mut printer = Printer::new(&mut output, PrinterOptions::default());
                rule.to_css(&mut printer)?;

                let (open, close) = output
                    .split_once(r#"@"""__turbopack_placeholder__""""#)
                    .unwrap();

                Ok((open.trim().into(), close.trim().into()))
            }
            ImportAttributes::Swc {
                layer_name,
                supports,
                media,
            } => {
                fn token(token: swc_core::css::ast::Token) -> swc_core::css::ast::TokenAndSpan {
                    swc_core::css::ast::TokenAndSpan {
                        span: DUMMY_SP,
                        token,
                    }
                }

                // something random that's never gonna be in real css
                let mut rule = swc_core::css::ast::Rule::ListOfComponentValues(Box::new(
                    swc_core::css::ast::ListOfComponentValues {
                        span: DUMMY_SP,
                        children: vec![swc_core::css::ast::ComponentValue::PreservedToken(
                            Box::new(token(swc_core::css::ast::Token::String {
                                value: Default::default(),
                                raw: r#""""__turbopack_placeholder__""""#.into(),
                            })),
                        )],
                    },
                ));

                fn at_rule(
                    name: &str,
                    prelude: swc_core::css::ast::AtRulePrelude,
                    inner_rule: swc_core::css::ast::Rule,
                ) -> swc_core::css::ast::Rule {
                    swc_core::css::ast::Rule::AtRule(Box::new(swc_core::css::ast::AtRule {
                        span: DUMMY_SP,
                        name: swc_core::css::ast::AtRuleName::Ident(swc_core::css::ast::Ident {
                            span: DUMMY_SP,
                            value: name.into(),
                            raw: None,
                        }),
                        prelude: Some(Box::new(prelude)),
                        block: Some(swc_core::css::ast::SimpleBlock {
                            span: DUMMY_SP,
                            name: token(swc_core::css::ast::Token::LBrace),
                            value: vec![swc_core::css::ast::ComponentValue::from(inner_rule)],
                        }),
                    }))
                }

                if let Some(media) = &media {
                    rule = at_rule(
                        "media",
                        swc_core::css::ast::AtRulePrelude::MediaPrelude(
                            swc_core::css::ast::MediaQueryList {
                                span: DUMMY_SP,
                                queries: media.clone(),
                            },
                        ),
                        rule,
                    );
                }
                if let Some(supports) = &supports {
                    rule = at_rule(
                        "supports",
                        swc_core::css::ast::AtRulePrelude::SupportsPrelude(supports.clone()),
                        rule,
                    );
                }
                if let Some(layer_name) = &layer_name {
                    rule = at_rule(
                        "layer",
                        swc_core::css::ast::AtRulePrelude::LayerPrelude(
                            swc_core::css::ast::LayerPrelude::Name(layer_name.clone()),
                        ),
                        rule,
                    );
                }

                let mut output = String::new();
                let mut code_gen = CodeGenerator::new(
                    BasicCssWriter::new(
                        &mut output,
                        None,
                        BasicCssWriterConfig {
                            indent_width: 0,
                            ..Default::default()
                        },
                    ),
                    Default::default(),
                );
                code_gen.emit(&rule)?;

                let (open, close) = output
                    .split_once(r#""""__turbopack_placeholder__""""#)
                    .unwrap();

                Ok((open.trim().into(), close.trim().into()))
            }
        }
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct ImportAssetReference {
    pub origin: Vc<Box<dyn ResolveOrigin>>,
    pub request: Vc<Request>,
    pub attributes: Vc<ImportAttributes>,
    pub issue_source: Vc<IssueSource>,
}

#[turbo_tasks::value_impl]
impl ImportAssetReference {
    #[turbo_tasks::function]
    pub fn new(
        origin: Vc<Box<dyn ResolveOrigin>>,
        request: Vc<Request>,
        attributes: Vc<ImportAttributes>,
        issue_source: Vc<IssueSource>,
    ) -> Vc<Self> {
        Self::cell(ImportAssetReference {
            origin,
            request,
            attributes,
            issue_source,
        })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for ImportAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        css_resolve(
            self.origin,
            self.request,
            Value::new(CssReferenceSubType::AtImport),
            Some(self.issue_source),
        )
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ImportAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<String>> {
        Ok(Vc::cell(format!(
            "import(url) {}",
            self.request.to_string().await?,
        )))
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
        } = &*this.request.await?
        {
            imports.push(CssImport::External(Vc::cell(format!(
                "{}{}",
                protocol, remainder
            ))))
        }

        Ok(CodeGeneration { imports }.into())
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for ImportAssetReference {}
