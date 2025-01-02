use anyhow::Result;
use swc_core::{
    common::errors::{Handler, HANDLER},
    ecma::{
        ast::{CallExpr, Expr, ExprOrSpread},
        visit::{Visit, VisitWith},
    },
};
use turbo_tasks::{ResolvedVc, Value, Vc};
use turbopack_core::{
    reference::{ModuleReference, ModuleReferences},
    source::Source,
};
use turbopack_swc_utils::emitter::IssueEmitter;

use super::{parse::WebpackRuntime, WebpackChunkAssetReference};
use crate::{
    parse::{parse, ParseResult},
    EcmascriptInputTransforms, EcmascriptModuleAssetType,
};

#[turbo_tasks::function]
pub async fn module_references(
    source: ResolvedVc<Box<dyn Source>>,
    runtime: ResolvedVc<WebpackRuntime>,
    transforms: ResolvedVc<EcmascriptInputTransforms>,
) -> Result<Vc<ModuleReferences>> {
    let parsed = parse(
        *source,
        Value::new(EcmascriptModuleAssetType::Ecmascript),
        *transforms,
    )
    .await?;
    match &*parsed {
        ParseResult::Ok {
            program,
            source_map,
            ..
        } => {
            let mut references = Vec::new();
            let mut visitor = ModuleReferencesVisitor {
                references: &mut references,
                runtime,
                transforms,
            };
            let (emitter, collector) = IssueEmitter::new(
                source,
                source_map.clone(),
                Some("Parsing webpack bundle failed".into()),
            );
            let handler = Handler::with_emitter(true, false, Box::new(emitter));
            HANDLER.set(&handler, || {
                program.visit_with(&mut visitor);
            });
            collector.emit().await?;
            Ok(Vc::cell(references))
        }
        ParseResult::Unparseable { .. } | ParseResult::NotFound => Ok(Vc::cell(Vec::new())),
    }
}

struct ModuleReferencesVisitor<'a> {
    runtime: ResolvedVc<WebpackRuntime>,
    references: &'a mut Vec<ResolvedVc<Box<dyn ModuleReference>>>,
    transforms: ResolvedVc<EcmascriptInputTransforms>,
}

impl Visit for ModuleReferencesVisitor<'_> {
    fn visit_call_expr(&mut self, call: &CallExpr) {
        if let Some(member) = call.callee.as_expr().and_then(|e| e.as_member()) {
            if let (Some(obj), Some(prop)) = (member.obj.as_ident(), member.prop.as_ident()) {
                if &*obj.sym == "__webpack_require__" && &*prop.sym == "e" {
                    if let [ExprOrSpread { spread: None, expr }] = &call.args[..] {
                        if let Expr::Lit(lit) = &**expr {
                            self.references.push(ResolvedVc::upcast(
                                WebpackChunkAssetReference {
                                    chunk_id: lit.clone(),
                                    runtime: self.runtime,
                                    transforms: self.transforms,
                                }
                                .resolved_cell(),
                            ));
                        }
                    }
                }
            }
        }
        call.visit_children_with(self);
    }
}
