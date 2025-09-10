use std::{borrow::Cow, collections::HashSet};

use anyhow::Result;
use serde::{Deserialize, Serialize};
use swc_core::{
    common::DUMMY_SP,
    ecma::ast::{
        CallExpr, Callee, Expr, ExprOrSpread, KeyValueProp, Lit, ObjectLit, Prop, PropName,
        PropOrSpread,
    },
    quote, quote_expr,
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, NonLocalValue, ResolvedVc, TaskInput, TryJoinIterExt, Vc, debug::ValueDebugFormat,
    trace::TraceRawVcs,
};
use turbopack_core::{
    chunk::{ChunkableModule, ChunkingContext, ModuleChunkItemIdExt, ModuleId},
    issue::{
        IssueExt, IssueSeverity, StyledString, code_gen::CodeGenerationIssue,
        module::emit_unknown_module_type_error,
    },
    resolve::{
        ExternalType, ModuleResolveResult, ModuleResolveResultItem, origin::ResolveOrigin,
        parse::Request,
    },
};

use super::util::{request_to_string, throw_module_not_found_expr};
use crate::{
    references::util::throw_module_not_found_error_expr,
    runtime_functions::{
        TURBOPACK_ASYNC_LOADER, TURBOPACK_EXTERNAL_IMPORT, TURBOPACK_EXTERNAL_REQUIRE,
        TURBOPACK_IMPORT, TURBOPACK_MODULE_CONTEXT, TURBOPACK_REQUIRE,
    },
    utils::module_id_to_lit,
};

#[derive(PartialEq, Eq, ValueDebugFormat, TraceRawVcs, Serialize, Deserialize, NonLocalValue)]
pub(crate) enum SinglePatternMapping {
    /// Invalid request.
    Invalid,
    /// Unresolvable request.
    Unresolvable(String),
    /// Ignored request.
    Ignored,
    /// Constant request that always maps to the same module.
    ///
    /// ### Example
    /// ```js
    /// require("./module")
    /// ```
    Module(ModuleId),
    /// Constant request that always maps to the same module.
    /// This is used for dynamic imports.
    /// Module id points to a loader module.
    ///
    /// ### Example
    /// ```js
    /// import("./module")
    /// ```
    ModuleLoader(ModuleId),
    /// External reference with request and type
    External(RcStr, ExternalType),
}

/// A mapping from a request pattern (e.g. "./module", `./images/${name}.png`)
/// to corresponding module ids. The same pattern can map to multiple module ids
/// at runtime when using variable interpolation.
#[turbo_tasks::value]
pub(crate) enum PatternMapping {
    /// Constant request that always maps to the same module.
    ///
    /// ### Example
    /// ```js
    /// require("./module")
    /// ```
    Single(SinglePatternMapping),
    /// Variable request that can map to different modules at runtime.
    ///
    /// ### Example
    /// ```js
    /// require(`./images/${name}.png`)
    /// ```
    Map(FxIndexMap<String, SinglePatternMapping>),
}

#[derive(
    Copy,
    Clone,
    Debug,
    Eq,
    PartialEq,
    Hash,
    Serialize,
    Deserialize,
    TraceRawVcs,
    TaskInput,
    NonLocalValue,
)]
pub(crate) enum ResolveType {
    AsyncChunkLoader,
    ChunkItem,
}

impl SinglePatternMapping {
    pub fn create_id(&self, key_expr: Cow<'_, Expr>) -> Expr {
        match self {
            Self::Invalid => {
                quote!(
                    "(() => { throw new Error('could not resolve \"' + $arg + '\" into a module'); })()" as Expr,
                    arg: Expr = key_expr.into_owned()
                )
            }
            Self::Unresolvable(request) => throw_module_not_found_expr(request),
            Self::Ignored => {
                quote!("undefined" as Expr)
            }
            Self::Module(module_id) | Self::ModuleLoader(module_id) => module_id_to_lit(module_id),
            Self::External(s, _) => Expr::Lit(Lit::Str(s.as_str().into())),
        }
    }

    pub fn create_require(&self, key_expr: Cow<'_, Expr>) -> Expr {
        match self {
            Self::Invalid => self.create_id(key_expr),
            Self::Unresolvable(request) => throw_module_not_found_expr(request),
            Self::Ignored => quote!("{}" as Expr),
            Self::Module(_) | Self::ModuleLoader(_) => quote!(
                "$turbopack_require($arg)" as Expr,
                turbopack_require: Expr = TURBOPACK_REQUIRE.into(),
                arg: Expr = self.create_id(key_expr)
            ),
            Self::External(request, ExternalType::CommonJs) => quote!(
                "$turbopack_external_require($arg, () => require($arg))" as Expr,
                turbopack_external_require: Expr = TURBOPACK_EXTERNAL_REQUIRE.into(),
                arg: Expr = request.as_str().into()
            ),
            Self::External(request, ty) => throw_module_not_found_error_expr(
                request,
                &format!("Unsupported external type {ty:?} for commonjs reference"),
            ),
        }
    }

    pub fn create_import(&self, key_expr: Cow<'_, Expr>, import_externals: bool) -> Expr {
        match self {
            Self::Invalid => {
                let error = quote_expr!(
                    "() => { throw new Error('could not resolve \"' + $arg + '\" into a module'); }",
                    arg: Expr = key_expr.into_owned()
                );
                Expr::Call(CallExpr {
                    callee: Callee::Expr(quote_expr!("Promise.resolve().then")),
                    args: vec![ExprOrSpread {
                        spread: None,
                        expr: error,
                    }],
                    span: DUMMY_SP,
                    ..Default::default()
                })
            }
            Self::Unresolvable(_) => self.create_id(key_expr),
            Self::External(_, ExternalType::EcmaScriptModule) => {
                if import_externals {
                    Expr::Call(CallExpr {
                        callee: Callee::Expr(Box::new(TURBOPACK_EXTERNAL_IMPORT.into())),
                        args: vec![ExprOrSpread {
                            spread: None,
                            expr: Box::new(key_expr.into_owned()),
                        }],
                        span: DUMMY_SP,
                        ..Default::default()
                    })
                } else {
                    Expr::Call(CallExpr {
                        callee: Callee::Expr(quote_expr!("Promise.resolve().then")),
                        args: vec![ExprOrSpread {
                            spread: None,
                            expr: quote_expr!(
                                "() => $turbopack_external_require($arg, () => require($arg), true)",
                                turbopack_external_require: Expr = TURBOPACK_EXTERNAL_REQUIRE.into(),
                                arg: Expr = key_expr.into_owned()
                            ),
                        }],
                        span: DUMMY_SP,
                        ..Default::default()
                    })
                }
            }
            Self::External(_, ExternalType::CommonJs | ExternalType::Url) => Expr::Call(CallExpr {
                callee: Callee::Expr(quote_expr!("Promise.resolve().then")),
                args: vec![ExprOrSpread {
                    spread: None,
                    expr: quote_expr!(
                        "() => $turbopack_external_require($arg, () => require($arg), true)",
                        turbopack_external_require: Expr = TURBOPACK_EXTERNAL_REQUIRE.into(),
                        arg: Expr = key_expr.into_owned()
                    ),
                }],
                span: DUMMY_SP,
                ..Default::default()
            }),
            #[allow(unreachable_patterns)]
            Self::External(request, ty) => throw_module_not_found_error_expr(
                request,
                &format!("Unsupported external type {ty:?} for dynamic import reference"),
            ),
            Self::ModuleLoader(module_id) => {
                quote!("$turbopack_async_loader($id)" as Expr,
                    turbopack_async_loader: Expr = TURBOPACK_ASYNC_LOADER.into(),
                    id: Expr = module_id_to_lit(module_id)
                )
            }
            Self::Ignored => {
                quote!("Promise.resolve({})" as Expr)
            }
            Self::Module(_) => Expr::Call(CallExpr {
                callee: Callee::Expr(quote_expr!("Promise.resolve().then")),
                args: vec![ExprOrSpread {
                    spread: None,
                    expr: quote_expr!(
                        "() => $turbopack_import($arg)",
                        turbopack_import: Expr = TURBOPACK_IMPORT.into(),
                        arg: Expr = self.create_id(key_expr)
                    ),
                }],
                span: DUMMY_SP,
                ..Default::default()
            }),
        }
    }
}

enum ImportMode {
    Require,
    Import { import_externals: bool },
}

fn create_context_map(
    map: &FxIndexMap<String, SinglePatternMapping>,
    key_expr: &Expr,
    import_mode: ImportMode,
) -> Expr {
    let props = map
        .iter()
        .map(|(k, v)| {
            PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                key: PropName::Str(k.as_str().into()),
                value: quote_expr!(
                        "{ id: () => $id, module: () => $module }",
                        id: Expr = v.create_id(Cow::Borrowed(key_expr)),
                        module: Expr = match import_mode {
                            ImportMode::Require => v.create_require(Cow::Borrowed(key_expr)),
                            ImportMode::Import { import_externals } => v.create_import(Cow::Borrowed(key_expr), import_externals),
                        },
                    ),
            })))
        })
        .collect();

    Expr::Object(ObjectLit {
        span: DUMMY_SP,
        props,
    })
}

impl PatternMapping {
    pub fn create_id(&self, key_expr: Expr) -> Expr {
        match self {
            PatternMapping::Single(pm) => pm.create_id(Cow::Owned(key_expr)),
            PatternMapping::Map(map) => {
                let map = create_context_map(map, &key_expr, ImportMode::Require);

                quote!("$turbopack_module_context($map).resolve($key)" as Expr,
                    turbopack_module_context: Expr = TURBOPACK_MODULE_CONTEXT.into(),
                    map: Expr = map,
                    key: Expr = key_expr
                )
            }
        }
    }

    pub fn create_require(&self, key_expr: Expr) -> Expr {
        match self {
            PatternMapping::Single(pm) => pm.create_require(Cow::Owned(key_expr)),
            PatternMapping::Map(map) => {
                let map = create_context_map(map, &key_expr, ImportMode::Require);

                quote!("$turbopack_module_context($map)($key)" as Expr,
                    turbopack_module_context: Expr = TURBOPACK_MODULE_CONTEXT.into(),
                    map: Expr = map,
                    key: Expr = key_expr
                )
            }
        }
    }

    pub fn create_import(&self, key_expr: Expr, import_externals: bool) -> Expr {
        match self {
            PatternMapping::Single(pm) => pm.create_import(Cow::Owned(key_expr), import_externals),
            PatternMapping::Map(map) => {
                let map =
                    create_context_map(map, &key_expr, ImportMode::Import { import_externals });

                quote!("$turbopack_module_context($map).import($key)" as Expr,
                    turbopack_module_context: Expr = TURBOPACK_MODULE_CONTEXT.into(),
                    map: Expr = map,
                    key: Expr = key_expr
                )
            }
        }
    }
}

async fn to_single_pattern_mapping(
    origin: Vc<Box<dyn ResolveOrigin>>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    resolve_item: &ModuleResolveResultItem,
    resolve_type: ResolveType,
) -> Result<SinglePatternMapping> {
    let module = match resolve_item {
        ModuleResolveResultItem::Module(module) => *module,
        ModuleResolveResultItem::External { name: s, ty, .. } => {
            return Ok(SinglePatternMapping::External(s.clone(), *ty));
        }
        ModuleResolveResultItem::Ignore => return Ok(SinglePatternMapping::Ignored),
        ModuleResolveResultItem::Unknown(source) => {
            emit_unknown_module_type_error(**source).await?;
            return Ok(SinglePatternMapping::Unresolvable(
                "unknown module type".to_string(),
            ));
        }
        ModuleResolveResultItem::Error(str) => {
            return Ok(SinglePatternMapping::Unresolvable(str.await?.to_string()));
        }
        ModuleResolveResultItem::OutputAsset(_)
        | ModuleResolveResultItem::Empty
        | ModuleResolveResultItem::Custom(_) => {
            // TODO implement mapping
            CodeGenerationIssue {
                severity: IssueSeverity::Bug,
                title: StyledString::Text(rcstr!(
                    "pattern mapping is not implemented for this result"
                ))
                .resolved_cell(),
                message: StyledString::Text(
                    format!(
                        "the reference resolves to a non-trivial result, which is not supported \
                         yet: {resolve_item:?}"
                    )
                    .into(),
                )
                .resolved_cell(),
                path: origin.origin_path().owned().await?,
            }
            .resolved_cell()
            .emit();
            return Ok(SinglePatternMapping::Invalid);
        }
    };
    if let Some(chunkable) = ResolvedVc::try_downcast::<Box<dyn ChunkableModule>>(module) {
        match resolve_type {
            ResolveType::AsyncChunkLoader => {
                let loader_id = chunking_context.async_loader_chunk_item_id(*chunkable);
                return Ok(SinglePatternMapping::ModuleLoader(loader_id.owned().await?));
            }
            ResolveType::ChunkItem => {
                let item_id = chunkable.chunk_item_id(chunking_context);
                return Ok(SinglePatternMapping::Module(item_id.owned().await?));
            }
        }
    }
    CodeGenerationIssue {
        severity: IssueSeverity::Bug,
        title: StyledString::Text(rcstr!("non-ecmascript placeable asset")).resolved_cell(),
        message: StyledString::Text(rcstr!(
            "asset is not placeable in ESM chunks, so it doesn't have a module id"
        ))
        .resolved_cell(),
        path: origin.origin_path().owned().await?,
    }
    .resolved_cell()
    .emit();
    Ok(SinglePatternMapping::Invalid)
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
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        resolve_result: Vc<ModuleResolveResult>,
        resolve_type: ResolveType,
    ) -> Result<Vc<PatternMapping>> {
        let result = resolve_result.await?;
        match result.primary.len() {
            0 => Ok(PatternMapping::Single(SinglePatternMapping::Unresolvable(
                request_to_string(request).await?.to_string(),
            ))
            .cell()),
            1 if !request.request_pattern().await?.has_dynamic_parts() => {
                let resolve_item = &result.primary.first().unwrap().1;
                let single_pattern_mapping =
                    to_single_pattern_mapping(origin, chunking_context, resolve_item, resolve_type)
                        .await?;
                Ok(PatternMapping::Single(single_pattern_mapping).cell())
            }
            _ => {
                let mut set = HashSet::new();
                let map = result
                    .primary
                    .iter()
                    .filter_map(|(k, v)| {
                        let request = k.request.as_ref()?;
                        set.insert(request).then(|| (request.to_string(), v))
                    })
                    .map(|(k, v)| async move {
                        let single_pattern_mapping =
                            to_single_pattern_mapping(origin, chunking_context, v, resolve_type)
                                .await?;
                        Ok((k, single_pattern_mapping))
                    })
                    .try_join()
                    .await?
                    .into_iter()
                    .collect();
                Ok(PatternMapping::Map(map).cell())
            }
        }
    }
}
