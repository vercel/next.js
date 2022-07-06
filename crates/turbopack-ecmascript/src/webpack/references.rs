use anyhow::Result;
use swc_common::errors::{Handler, HANDLER};
use swc_ecmascript::{
    ast::{CallExpr, Expr, ExprOrSpread},
    visit::{self, Visit, VisitWith},
};
use turbo_tasks::Value;
use turbopack_core::{
    asset::AssetVc,
    reference::{AssetReferenceVc, AssetReferencesVc},
};

use super::{parse::WebpackRuntimeVc, WebpackChunkAssetReference};
use crate::{
    parse::{parse, Buffer, ParseResult},
    ModuleAssetType,
};

#[turbo_tasks::function]
pub async fn module_references(
    source: AssetVc,
    runtime: WebpackRuntimeVc,
) -> Result<AssetReferencesVc> {
    let parsed = parse(source, Value::new(ModuleAssetType::Ecmascript)).await?;
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
            };
            let buf = Buffer::new();
            let handler =
                Handler::with_emitter_writer(Box::new(buf.clone()), Some(source_map.clone()));
            HANDLER.set(&handler, || {
                program.visit_with(&mut visitor);
            });
            if !buf.is_empty() {
                // TODO report them in a stream
                println!("{}", buf);
            }
            Ok(AssetReferencesVc::cell(references))
        }
        ParseResult::Unparseable | ParseResult::NotFound => Ok(AssetReferencesVc::cell(Vec::new())),
    }
}

struct AssetReferencesVisitor<'a> {
    runtime: WebpackRuntimeVc,
    references: &'a mut Vec<AssetReferenceVc>,
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
                                }
                                .into(),
                            );
                        }
                    }
                }
            }
        }
        visit::visit_call_expr(self, call);
    }
}
