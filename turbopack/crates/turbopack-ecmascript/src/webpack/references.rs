use anyhow::Result;
use swc_core::{
    common::errors::{HANDLER, Handler},
    ecma::{
        ast::{CallExpr, Expr, ExprOrSpread},
        visit::{Visit, VisitWith},
    },
};
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, Vc};
use turbopack_core::{
    reference::{ModuleReference, ModuleReferences},
    source::Source,
};
use turbopack_swc_utils::emitter::IssueEmitter;

use super::{WebpackChunkAssetReference, parse::WebpackRuntime};
use crate::{
    EcmascriptInputTransforms, EcmascriptModuleAssetType,
    parse::{ParseResult, parse},
};

#[turbo_tasks::function]
pub async fn module_references(
    source: ResolvedVc<Box<dyn Source>>,
    runtime: ResolvedVc<WebpackRuntime>,
    transforms: ResolvedVc<EcmascriptInputTransforms>,
) -> Result<Vc<ModuleReferences>> {
    let parsed = parse(
        *source,
        EcmascriptModuleAssetType::Ecmascript,
        *transforms,
        false,
        false,
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
                Some(rcstr!("Parsing webpack bundle failed")),
            );
            let handler = Handler::with_emitter(true, false, Box::new(emitter));
            HANDLER.set(&handler, || {
                program.visit_with(&mut visitor);
            });
            collector.emit(false).await?;
            Ok(Vc::cell(references))
        }
        ParseResult::Unparsable { .. } | ParseResult::NotFound => Ok(Vc::cell(Vec::new())),
    }
}

struct ModuleReferencesVisitor<'a> {
    runtime: ResolvedVc<WebpackRuntime>,
    references: &'a mut Vec<ResolvedVc<Box<dyn ModuleReference>>>,
    transforms: ResolvedVc<EcmascriptInputTransforms>,
}

impl Visit for ModuleReferencesVisitor<'_> {
    fn visit_call_expr(&mut self, call: &CallExpr) {
        if let Some(member) = call.callee.as_expr().and_then(|e| e.as_member())
            && let (Some(obj), Some(prop)) = (member.obj.as_ident(), member.prop.as_ident())
            && &*obj.sym == "__webpack_require__"
            && &*prop.sym == "e"
            && let [ExprOrSpread { spread: None, expr }] = &call.args[..]
            && let Expr::Lit(lit) = &**expr
        {
            self.references.push(ResolvedVc::upcast(
                WebpackChunkAssetReference {
                    chunk_id: lit.clone(),
                    runtime: self.runtime,
                    transforms: self.transforms,
                }
                .resolved_cell(),
            ));
        }
        call.visit_children_with(self);
    }
}
