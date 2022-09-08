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

use super::{parse::WebpackRuntimeVc, WebpackChunkAssetReference};
use crate::{
    parse::{parse, Buffer, EcmascriptInputTransformsVc, ParseResult},
    ModuleAssetType,
};

#[turbo_tasks::function]
pub async fn module_references(
    source: AssetVc,
    runtime: WebpackRuntimeVc,
    transforms: EcmascriptInputTransformsVc,
) -> Result<AssetReferencesVc> {
    let parsed = parse(source, Value::new(ModuleAssetType::Ecmascript), transforms).await?;
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
