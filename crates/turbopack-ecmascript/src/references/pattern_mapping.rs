use std::collections::HashMap;

use anyhow::Result;
use swc_ecma_ast::Expr;
use swc_ecma_quote::quote;
use turbo_tasks::ValueToString;
use turbopack_core::{
    chunk::ModuleId,
    context::AssetContextVc,
    resolve::{parse::RequestVc, ResolveResult},
};

use crate::{
    resolve::cjs_resolve, utils::module_id_to_lit, EcmascriptChunkContextVc,
    EcmascriptChunkPlaceableVc,
};

/// A mapping from a request pattern (e.g. "./module", `./images/${name}.png`)
/// to corresponding module ids. The same pattern can map to multiple module ids
/// at runtime when using variable interpolation.
#[turbo_tasks::value]
pub(crate) enum PatternMapping {
    /// Invalid request.
    Invalid,
    /// Constant request that always maps to the same module.
    ///
    /// ### Example
    /// ```js
    /// require("./module")
    /// ```
    Single(ModuleId),
    /// Variable request that can map to different modules at runtime.
    ///
    /// ### Example
    /// ```js
    /// require(`./images/${name}.png`)
    /// ```
    Map(HashMap<String, ModuleId>),
}

impl PatternMapping {
    pub fn create(&self) -> Expr {
        match self {
            PatternMapping::Invalid => {
                // TODO improve error message
                quote!("(() => {throw new Error(\"Invalid\")})()" as Expr)
            }
            PatternMapping::Single(module_id) => module_id_to_lit(module_id),
            PatternMapping::Map(_) => {
                todo!("emit an error for this case: Complex expression can't be transformed");
            }
        }
    }

    pub fn apply(&self, _key_expr: Expr) -> Expr {
        // TODO handle PatternMapping::Map
        self.create()
    }
}

#[turbo_tasks::value_impl]
impl PatternMappingVc {
    /// Resolves a request into a pattern mapping.
    // NOTE(alexkirsz) I would rather have used `resolve` here but it's already reserved by the Vc
    // impl.
    #[turbo_tasks::function]
    pub async fn resolve_request(
        request: RequestVc,
        context: AssetContextVc,
        chunk_context: EcmascriptChunkContextVc,
    ) -> Result<PatternMappingVc> {
        let resolve_result = cjs_resolve(request, context).await?;

        let asset = match &*resolve_result {
            ResolveResult::Alternatives(assets, _) => {
                if let Some(asset) = assets.first() {
                    asset
                } else {
                    return Ok(PatternMappingVc::cell(PatternMapping::Invalid));
                }
            }
            ResolveResult::Single(asset, _) => asset,
            _ => {
                // TODO implement mapping
                println!(
                    "the reference resolves to a non-trivial result, which is not supported yet: \
                     {:?}",
                    &*resolve_result
                );
                return Ok(PatternMappingVc::cell(PatternMapping::Invalid));
            }
        };

        if let Some(placeable) = EcmascriptChunkPlaceableVc::resolve_from(asset).await? {
            Ok(PatternMappingVc::cell(PatternMapping::Single(
                chunk_context.id(placeable).await?.clone(),
            )))
        } else {
            println!(
                "asset {} is not placeable in ESM chunks, so it doesn't have a module id",
                asset.path().to_string().await?
            );
            Ok(PatternMappingVc::cell(PatternMapping::Invalid))
        }
    }
}
