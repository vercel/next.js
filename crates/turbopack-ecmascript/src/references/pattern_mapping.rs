use anyhow::Result;
use indexmap::IndexMap;
use swc_core::{
    ecma::ast::{Expr, Lit},
    quote,
};
use turbo_tasks::{debug::ValueDebug, Value, Vc};
use turbopack_core::{
    chunk::{
        availability_info::AvailabilityInfo, ChunkableModule, ChunkingContext, FromChunkableModule,
        ModuleId,
    },
    issue::{code_gen::CodeGenerationIssue, IssueExt, IssueSeverity},
    resolve::{origin::ResolveOrigin, parse::Request, PrimaryResolveResult, ResolveResult},
};

use super::util::{request_to_string, throw_module_not_found_expr};
use crate::{
    chunk::{item::EcmascriptChunkItemExt, EcmascriptChunkItem},
    utils::module_id_to_lit,
};

/// A mapping from a request pattern (e.g. "./module", `./images/${name}.png`)
/// to corresponding module ids. The same pattern can map to multiple module ids
/// at runtime when using variable interpolation.
#[turbo_tasks::value]
pub(crate) enum PatternMapping {
    /// Invalid request.
    Invalid,
    /// Unresolveable request.
    Unresolveable(String),
    /// Ignored request.
    Ignored,
    /// Constant request that always maps to the same module.
    ///
    /// ### Example
    /// ```js
    /// require("./module")
    /// ```
    Single(ModuleId),
    /// Constant request that always maps to the same module.
    /// This is used for dynamic imports.
    /// Module id points to a loader module.
    ///
    /// ### Example
    /// ```js
    /// import("./module")
    /// ```
    SingleLoader(ModuleId),
    /// Variable request that can map to different modules at runtime.
    ///
    /// ### Example
    /// ```js
    /// require(`./images/${name}.png`)
    /// ```
    Map(IndexMap<String, ModuleId>),
    /// Original reference
    OriginalReferenceExternal,
    /// Original reference with different request
    OriginalReferenceTypeExternal(String),
}

#[derive(PartialOrd, Ord, Hash, Debug, Copy, Clone)]
#[turbo_tasks::value(serialization = "auto_for_input")]
pub(crate) enum ResolveType {
    EsmAsync(AvailabilityInfo),
    Cjs,
}

impl PatternMapping {
    pub fn is_internal_import(&self) -> bool {
        match self {
            PatternMapping::Invalid
            | PatternMapping::Unresolveable(_)
            | PatternMapping::Ignored
            | PatternMapping::Single(_)
            | PatternMapping::SingleLoader(_)
            | PatternMapping::Map(_) => true,
            PatternMapping::OriginalReferenceExternal
            | PatternMapping::OriginalReferenceTypeExternal(_) => false,
        }
    }

    pub fn create(&self) -> Expr {
        match self {
            PatternMapping::Invalid => {
                // TODO improve error message
                quote!("(() => {throw new Error(\"Invalid\")})()" as Expr)
            }
            PatternMapping::Unresolveable(request) => throw_module_not_found_expr(request),
            PatternMapping::Ignored => {
                quote!("undefined" as Expr)
            }
            PatternMapping::Single(module_id) | PatternMapping::SingleLoader(module_id) => {
                module_id_to_lit(module_id)
            }
            PatternMapping::Map(_) => {
                todo!("emit an error for this case: Complex expression can't be transformed");
            }
            PatternMapping::OriginalReferenceExternal => {
                todo!("emit an error for this case: apply need to be used");
            }
            PatternMapping::OriginalReferenceTypeExternal(s) => {
                Expr::Lit(Lit::Str(s.as_str().into()))
            }
        }
    }

    pub fn apply(&self, key_expr: Expr) -> Expr {
        match self {
            PatternMapping::OriginalReferenceExternal => key_expr,
            _ => self.create(),
        }
        // TODO handle PatternMapping::Map
    }
}

#[turbo_tasks::value_impl]
impl PatternMapping {
    /// Resolves a request into a pattern mapping.
    // NOTE(alexkirsz) I would rather have used `resolve` here but it's already reserved by the Vc
    // impl.
    #[turbo_tasks::function]
    pub async fn resolve_request(
        request: Vc<Request>,
        origin: Vc<Box<dyn ResolveOrigin>>,
        context: Vc<Box<dyn ChunkingContext>>,
        resolve_result: Vc<ResolveResult>,
        resolve_type: Value<ResolveType>,
    ) -> Result<Vc<PatternMapping>> {
        let result = resolve_result.await?;
        let asset = match result.primary.first() {
            None => {
                return Ok(PatternMapping::Unresolveable(
                    request_to_string(request).await?.to_string(),
                )
                .cell())
            }
            Some(PrimaryResolveResult::Asset(asset)) => *asset,
            Some(PrimaryResolveResult::OriginalReferenceExternal) => {
                return Ok(PatternMapping::OriginalReferenceExternal.cell())
            }
            Some(PrimaryResolveResult::OriginalReferenceTypeExternal(s)) => {
                return Ok(PatternMapping::OriginalReferenceTypeExternal(s.clone()).cell())
            }
            Some(PrimaryResolveResult::Ignore) => return Ok(PatternMapping::Ignored.cell()),
            _ => {
                // TODO implement mapping
                CodeGenerationIssue {
                    severity: IssueSeverity::Bug.into(),
                    title: Vc::cell(
                        "pattern mapping is not implemented for this result".to_string(),
                    ),
                    message: Vc::cell(format!(
                        "the reference resolves to a non-trivial result, which is not supported \
                         yet: {:?}",
                        resolve_result.dbg().await?
                    )),
                    path: origin.origin_path(),
                }
                .cell()
                .emit();
                return Ok(PatternMapping::cell(PatternMapping::Invalid));
            }
        };

        if let Some(chunkable) = Vc::try_resolve_sidecast::<Box<dyn ChunkableModule>>(asset).await?
        {
            if let ResolveType::EsmAsync(availability_info) = *resolve_type {
                let available = if let Some(available_assets) = availability_info.available_assets()
                {
                    *available_assets.includes(Vc::upcast(chunkable)).await?
                } else {
                    false
                };
                if !available {
                    if let Some(loader) = <Box<dyn EcmascriptChunkItem>>::from_async_asset(
                        context,
                        chunkable,
                        Value::new(availability_info),
                    )
                    .await?
                    {
                        return Ok(PatternMapping::cell(PatternMapping::SingleLoader(
                            loader.id().await?.clone_value(),
                        )));
                    }
                }
            }
            if let Some(chunk_item) =
                <Box<dyn EcmascriptChunkItem>>::from_asset(context, Vc::upcast(chunkable)).await?
            {
                return Ok(PatternMapping::cell(PatternMapping::Single(
                    chunk_item.id().await?.clone_value(),
                )));
            }
        }
        CodeGenerationIssue {
            severity: IssueSeverity::Bug.into(),
            title: Vc::cell("non-ecmascript placeable asset".to_string()),
            message: Vc::cell(
                "asset is not placeable in ESM chunks, so it doesn't have a module id".to_string(),
            ),
            path: origin.origin_path(),
        }
        .cell()
        .emit();
        Ok(PatternMapping::cell(PatternMapping::Invalid))
    }
}
