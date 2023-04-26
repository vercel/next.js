use anyhow::Result;
use swc_core::{
    common::errors::{Handler, HANDLER},
    ecma::{
        ast::{CallExpr, Expr, ExprOrSpread},
        visit::{Visit, VisitWith},
    },
};
use turbo_tasks::Value;
use turbopack_core::{
    asset::AssetVc,
    reference::{AssetReferenceVc, AssetReferencesVc},
};
use turbopack_swc_utils::emitter::IssueEmitter;

use super::{parse::WebpackRuntimeVc, WebpackChunkAssetReference};
use crate::{
    parse::{parse, ParseResult},
    EcmascriptInputTransformsVc, EcmascriptModuleAssetType,
};

#[turbo_tasks::function]
pub async fn module_references(
    source: AssetVc,
    runtime: WebpackRuntimeVc,
    transforms: EcmascriptInputTransformsVc,
) -> Result<AssetReferencesVc> {
    let parsed = parse(
        source,
        Value::new(EcmascriptModuleAssetType::Ecmascript),
        transforms,
    )
    .await?;
    match &*parsed {
        ParseResult::Ok {
            program,
            source_map,
            ..
        } => {
            let mut references = Vec::new();
            let mut visitor = AssetReferencesVisitor {
                references: &mut references,
                runtime,
                transforms,
            };
            let handler = Handler::with_emitter(
                true,
                false,
                Box::new(IssueEmitter {
                    source,
                    source_map: source_map.clone(),
                    title: Some("Parsing webpack bundle failed".to_string()),
                }),
            );
            HANDLER.set(&handler, || {
                program.visit_with(&mut visitor);
            });
            Ok(AssetReferencesVc::cell(references))
        }
        ParseResult::Unparseable | ParseResult::NotFound => Ok(AssetReferencesVc::cell(Vec::new())),
    }
}

struct AssetReferencesVisitor<'a> {
    runtime: WebpackRuntimeVc,
    references: &'a mut Vec<AssetReferenceVc>,
    transforms: EcmascriptInputTransformsVc,
}

impl<'a> Visit for AssetReferencesVisitor<'a> {
    fn visit_call_expr(&mut self, call: &CallExpr) {
        if let Some(member) = call.callee.as_expr().and_then(|e| e.as_member()) {
            if let (Some(obj), Some(prop)) = (member.obj.as_ident(), member.prop.as_ident()) {
                if &*obj.sym == "__webpack_require__" && &*prop.sym == "e" {
                    if let [ExprOrSpread { spread: None, expr }] = &call.args[..] {
                        if let Expr::Lit(lit) = &**expr {
                            self.references.push(
                                WebpackChunkAssetReference {
                                    chunk_id: lit.clone(),
                                    runtime: self.runtime,
                                    transforms: self.transforms,
                                }
                                .cell()
                                .into(),
                            );
                        }
                    }
                }
            }
        }
        call.visit_children_with(self);
    }
}
