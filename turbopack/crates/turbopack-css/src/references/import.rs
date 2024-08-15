use anyhow::Result;
use lightningcss::{
    media_query::MediaList,
    rules::{import::ImportRule, layer::LayerName, supports::SupportsCondition},
    traits::ToCss,
};
use swc_core::{
    common::{Spanned, DUMMY_SP},
    css::codegen::{
        writer::basic::{BasicCssWriter, BasicCssWriterConfig},
        CodeGenerator, CodegenConfig, Emit,
    },
};
use turbo_tasks::{RcStr, Value, ValueToString, Vc};
use turbopack_core::{
    chunk::{ChunkableModuleReference, ChunkingContext},
    issue::IssueSource,
    reference::ModuleReference,
    reference_type::{CssReferenceSubType, ImportContext},
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
            ImportAttributes::Swc {
                layer_name,
                supports,
                media,
            } => turbopack_core::reference_type::ImportAttributes {
                layer: layer_name.as_ref().map(gen_swc_node).map(From::from),
                supports: supports.as_ref().map(gen_swc_node).map(From::from),
                media: media
                    .as_ref()
                    .map(|queries| queries.iter().map(gen_swc_node).collect::<String>().into()),
            },
        }
    }
}

fn gen_swc_node<N>(node: N) -> String
where
    N: Spanned,
    for<'a> CodeGenerator<BasicCssWriter<'a, &'a mut String>>: Emit<N>,
{
    let mut code = String::new();
    {
        let wr = BasicCssWriter::new(&mut code, None, BasicCssWriterConfig::default());
        let mut gen = CodeGenerator::new(wr, CodegenConfig { minify: true });

        gen.emit(&node).unwrap();
    }
    code
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct ImportAssetReference {
    pub origin: Vc<Box<dyn ResolveOrigin>>,
    pub request: Vc<Request>,
    pub attributes: Vc<ImportAttributes>,
    pub import_context: Vc<ImportContext>,
    pub issue_source: Vc<IssueSource>,
}

#[turbo_tasks::value_impl]
impl ImportAssetReference {
    #[turbo_tasks::function]
    pub fn new(
        origin: Vc<Box<dyn ResolveOrigin>>,
        request: Vc<Request>,
        attributes: Vc<ImportAttributes>,
        import_context: Vc<ImportContext>,
        issue_source: Vc<IssueSource>,
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
        let import_context = {
            let own_attrs = (*self.attributes.await?).as_reference_import_attributes();
            self.import_context
                .add_attributes(own_attrs.layer, own_attrs.media, own_attrs.supports)
        };

        Ok(css_resolve(
            self.origin,
            self.request,
            Value::new(CssReferenceSubType::AtImport(Some(import_context))),
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
            imports.push(CssImport::External(Vc::cell(
                format!("{}{}", protocol, remainder).into(),
            )))
        }

        Ok(CodeGeneration { imports }.into())
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for ImportAssetReference {}
