use std::{borrow::Cow, sync::Arc};

use anyhow::{Result, bail};
use bincode::{Decode, Encode};
use swc_core::{
    common::{
        DUMMY_SP, Span,
        errors::{DiagnosticId, Handler},
    },
    ecma::{
        ast::{
            Expr, ExprStmt, KeyValueProp, Lit, ModuleItem, ObjectLit, Prop, PropName, PropOrSpread,
            Stmt, {self},
        },
        codegen::{Emitter, text_writer::JsWriter},
    },
    quote, quote_expr,
};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexMap, NonLocalValue, ResolvedVc, TryJoinIterExt, ValueToString, Vc,
    debug::ValueDebugFormat, trace::TraceRawVcs,
};
use turbo_tasks_fs::{
    DirectoryEntry, FileSystemPath, ReadGlobResult,
    glob::{Glob, GlobOptions},
};
use turbopack_core::{
    chunk::{
        AsyncModuleInfo, ChunkableModule, ChunkingContext, ChunkingType, MinifyType,
        ModuleChunkItemIdExt,
    },
    ident::AssetIdent,
    issue::IssueSource,
    module::{Module, ModuleSideEffects},
    module_graph::ModuleGraph,
    reference::{ModuleReference, ModuleReferences},
    reference_type::EcmaScriptModulesReferenceSubType,
    resolve::{
        BindingUsage, ExportUsage, ModuleResolveResult, ResolveErrorMode, origin::ResolveOrigin,
        parse::Request,
    },
};
use turbopack_resolve::ecmascript::esm_resolve;

use crate::{
    EcmascriptChunkPlaceable,
    analyzer::JsValue,
    chunk::{EcmascriptChunkItemContent, EcmascriptExports, ecmascript_chunk_item},
    code_gen::{CodeGen, CodeGeneration, IntoCodeGenReference},
    create_visitor,
    references::{
        AstPath,
        pattern_mapping::{PatternMapping, ResolveType},
    },
    runtime_functions::{TURBOPACK_EXPORT_VALUE, TURBOPACK_REQUIRE},
    utils::module_id_to_lit,
};

// ---------------------------------------------------------------------------
// Options parsing
// ---------------------------------------------------------------------------

/// Parsed options from an `import.meta.glob(patterns, options?)` call.
#[derive(Debug, Clone)]
pub struct ImportMetaGlobOptions {
    /// One or more glob patterns (first argument).
    pub patterns: Vec<RcStr>,
    /// When `true`, modules are loaded synchronously (eager mode).
    pub eager: bool,
    /// Named export to select (e.g., `"default"`, `"setup"`).
    pub import: Option<RcStr>,
    /// Query string to append to every import request (e.g., `"?raw"`).
    pub query: Option<RcStr>,
    /// Base path for resolving and keying modules.
    pub base: Option<RcStr>,
}

/// Parse the arguments of an `import.meta.glob(patterns, options?)` call.
///
/// `args[0]` must be a string literal or an array of string literals.
/// `args[1]` (optional) must be an object literal with known keys.
///
/// ## Unsupported Vite features
///
/// - **`import.meta.globEager()`** (removed in Vite 3) is not recognized. Users should migrate to
///   `import.meta.glob('...', { eager: true })`.
/// - **`as` option** (deprecated in Vite 5 in favor of `query`) is not supported. Use `query:
///   '?raw'` or `query: '?url'` instead.
pub fn parse_import_meta_glob(
    args: &[JsValue],
    handler: &Handler,
    span: Span,
    diagnostic_id: DiagnosticId,
) -> Option<ImportMetaGlobOptions> {
    if args.is_empty() || args.len() > 2 {
        handler.span_warn_with_code(
            span,
            "import.meta.glob() requires 1 or 2 arguments",
            diagnostic_id,
        );
        return None;
    }

    // --- Parse patterns (first argument) ---
    let patterns = {
        let mut pats = Vec::new();
        match &args[0] {
            JsValue::Array { items, .. } => {
                for item in items {
                    if let Some(s) = item.as_str() {
                        pats.push(s.into());
                    } else {
                        handler.span_warn_with_code(
                            span,
                            "import.meta.glob() pattern array elements must be constant strings",
                            diagnostic_id,
                        );
                        return None;
                    }
                }
                if pats.is_empty() {
                    handler.span_warn_with_code(
                        span,
                        "import.meta.glob() requires at least one pattern",
                        diagnostic_id,
                    );
                    return None;
                }
            }
            _ => {
                if let Some(s) = args[0].as_str() {
                    pats.push(s.into());
                } else {
                    handler.span_warn_with_code(
                        span,
                        "import.meta.glob() first argument must be a string literal or array of \
                         string literals",
                        diagnostic_id,
                    );
                    return None;
                }
            }
        }
        pats
    };

    // --- Parse options (second argument, optional) ---
    let mut eager = false;
    let mut import = None;
    let mut query = None;
    let mut base = None;

    if let Some(opts) = args.get(1) {
        match opts {
            JsValue::Object { parts, .. } => {
                use crate::analyzer::ObjectPart;
                for part in parts {
                    if let ObjectPart::KeyValue(key, val) = part {
                        match key.as_str() {
                            Some("eager") => {
                                if let Some(b) = val.as_bool() {
                                    eager = b;
                                } else {
                                    handler.span_warn_with_code(
                                        span,
                                        "import.meta.glob() 'eager' option must be a constant \
                                         boolean (true or false), defaulting to false",
                                        diagnostic_id.clone(),
                                    );
                                }
                            }
                            Some("import") => {
                                if let Some(s) = val.as_str() {
                                    // `import: '*'` means namespace import (whole module),
                                    // which is the default behavior — no need to store it.
                                    if s != "*" {
                                        import = Some(s.into());
                                    }
                                } else {
                                    handler.span_warn_with_code(
                                        span,
                                        "import.meta.glob() 'import' option must be a constant \
                                         string, ignoring",
                                        diagnostic_id.clone(),
                                    );
                                }
                            }
                            Some("query") => {
                                if let Some(s) = val.as_str() {
                                    // Ensure query starts with '?'
                                    let q: RcStr = if s.starts_with('?') {
                                        s.into()
                                    } else {
                                        format!("?{s}").into()
                                    };
                                    query = Some(q);
                                } else if let JsValue::Object { parts, .. } = val {
                                    // Support object form: { query: { bar: 'foo', raw: true } }
                                    // Serializes to "?bar=foo&raw=true" with URL-encoding.
                                    use crate::analyzer::ObjectPart;
                                    let mut pairs: Vec<String> = Vec::new();
                                    for part in parts {
                                        if let ObjectPart::KeyValue(k, v) = part {
                                            if let Some(k_str) = k.as_str() {
                                                let enc_key = urlencoding::encode(k_str);
                                                if let Some(v_str) = v.as_str() {
                                                    let enc_val = urlencoding::encode(v_str);
                                                    pairs.push(format!("{enc_key}={enc_val}"));
                                                } else if let Some(v_bool) = v.as_bool() {
                                                    pairs.push(format!("{enc_key}={v_bool}"));
                                                } else {
                                                    handler.span_warn_with_code(
                                                        span,
                                                        &format!(
                                                            "import.meta.glob() 'query' object \
                                                             value for key '{k_str}' must be a \
                                                             constant string or boolean, ignoring"
                                                        ),
                                                        diagnostic_id.clone(),
                                                    );
                                                }
                                            } else {
                                                handler.span_warn_with_code(
                                                    span,
                                                    "import.meta.glob() 'query' object keys must \
                                                     be constant strings",
                                                    diagnostic_id.clone(),
                                                );
                                            }
                                        } else {
                                            handler.span_warn_with_code(
                                                span,
                                                "import.meta.glob() 'query' object must only \
                                                 contain constant key-value pairs",
                                                diagnostic_id.clone(),
                                            );
                                        }
                                    }
                                    if !pairs.is_empty() {
                                        query = Some(format!("?{}", pairs.join("&")).into());
                                    }
                                } else {
                                    handler.span_warn_with_code(
                                        span,
                                        "import.meta.glob() 'query' option must be a constant \
                                         string, ignoring",
                                        diagnostic_id.clone(),
                                    );
                                }
                            }
                            Some("base") => {
                                if let Some(s) = val.as_str() {
                                    base = Some(s.into());
                                } else {
                                    handler.span_warn_with_code(
                                        span,
                                        "import.meta.glob() 'base' option must be a constant \
                                         string, ignoring",
                                        diagnostic_id.clone(),
                                    );
                                }
                            }
                            // The `as` option was deprecated in Vite 5 in favor of `query`.
                            // We don't support it; users should use `query` instead.
                            Some("as") => {
                                handler.span_warn_with_code(
                                    span,
                                    "import.meta.glob() 'as' option is not supported. Use 'query' \
                                     instead (e.g. { query: '?raw' })",
                                    diagnostic_id.clone(),
                                );
                            }
                            Some(other) => {
                                handler.span_warn_with_code(
                                    span,
                                    &format!(
                                        "import.meta.glob() unsupported option '{other}'. \
                                         Supported options are: eager, import, query, base"
                                    ),
                                    diagnostic_id.clone(),
                                );
                            }
                            None => {
                                handler.span_warn_with_code(
                                    span,
                                    "import.meta.glob() option keys must be constant strings",
                                    diagnostic_id.clone(),
                                );
                            }
                        }
                    }
                }
            }
            _ => {
                handler.span_err_with_code(
                    span,
                    "import.meta.glob() second argument must be an object literal",
                    diagnostic_id.clone(),
                );
                return None;
            }
        }
    }

    Some(ImportMetaGlobOptions {
        patterns,
        eager,
        import,
        query,
        base,
    })
}

// ---------------------------------------------------------------------------
// Helpers for collecting files from ReadGlobResult
// ---------------------------------------------------------------------------

/// Strip the `./` prefix from a Vite-style glob pattern to produce a pattern
/// compatible with Turbopack's `Glob` (which operates relative to the scan
/// directory, without a leading `./`).
fn strip_relative_prefix(pattern: &str) -> &str {
    pattern.strip_prefix("./").unwrap_or(pattern)
}

/// Flatten a nested `ReadGlobResult` into a sorted list of
/// `(base_relative_path, FileSystemPath)` pairs.
///
/// `ReadGlobResult` stores results in a tree of `HashMap`s keyed by path
/// segment. This function walks the tree and collects all file entries with
/// their full relative paths (relative to the directory `read_glob` was called
/// on).
async fn flatten_read_glob(result: &ReadGlobResult) -> Result<Vec<(RcStr, FileSystemPath)>> {
    let mut files = Vec::new();

    // Collect file entries from the current node.
    fn collect_files(
        node: &ReadGlobResult,
        prefix: &str,
        files: &mut Vec<(RcStr, FileSystemPath)>,
    ) {
        for (segment, entry) in &node.results {
            let full_path = if prefix.is_empty() {
                segment.to_string()
            } else {
                format!("{prefix}/{segment}")
            };
            if let DirectoryEntry::File(path) = entry {
                files.push((full_path.into(), path.clone()));
            }
        }
    }

    // Walk the tree level by level, resolving Vc references as we go.
    let mut pending: Vec<(String, turbo_tasks::ReadRef<ReadGlobResult>)> = Vec::new();
    collect_files(result, "", &mut files);

    // Resolve child directories (skip dot-directories like .git, .next, etc.)
    for (segment, inner_vc) in &result.inner {
        let child_prefix = segment.to_string();
        let inner = inner_vc.await?;
        pending.push((child_prefix, inner));
    }

    while let Some((prefix, node)) = pending.pop() {
        collect_files(&node, &prefix, &mut files);
        for (segment, inner_vc) in &node.inner {
            let child_prefix = format!("{prefix}/{segment}");
            let inner = inner_vc.await?;
            pending.push((child_prefix, inner));
        }
    }

    files.sort_by(|a: &(RcStr, _), b: &(RcStr, _)| a.0.cmp(&b.0));
    Ok(files)
}

// ---------------------------------------------------------------------------
// ImportMetaGlobMap — the resolved file map
// ---------------------------------------------------------------------------

#[turbo_tasks::value]
#[derive(Debug)]
pub struct ImportMetaGlobMapEntry {
    /// Path relative to origin (the calling file's directory), used for import
    /// resolution and as the key in the generated JS object.
    pub origin_relative: RcStr,
    pub request: ResolvedVc<Request>,
    pub result: ResolvedVc<ModuleResolveResult>,
}

#[turbo_tasks::value(transparent)]
pub struct ImportMetaGlobMap(
    #[bincode(with = "turbo_bincode::indexmap")] FxIndexMap<RcStr, ImportMetaGlobMapEntry>,
);

#[turbo_tasks::value_impl]
impl ImportMetaGlobMap {
    /// Discover files matching glob patterns and resolve them as ESM imports.
    ///
    /// `base_dir` is the directory to scan (origin dir, or origin + base).
    /// `positive_glob` is a `Glob` matching the wanted files (relative to
    /// base_dir). `negative_glob` optionally excludes files. Both globs
    /// operate on paths *relative to base_dir*.
    #[turbo_tasks::function]
    pub(crate) async fn generate(
        origin: Vc<Box<dyn ResolveOrigin>>,
        base_dir: FileSystemPath,
        positive_glob: Vc<Glob>,
        negative_glob: Option<Vc<Glob>>,
        query: Option<RcStr>,
        eager: bool,
        issue_source: Option<IssueSource>,
        error_mode: ResolveErrorMode,
    ) -> Result<Vc<Self>> {
        let origin_path = origin.origin_path().await?.parent();

        // Use read_glob for efficient directory-pruning file discovery.
        let glob_result = base_dir.read_glob(positive_glob).await?;
        let files = flatten_read_glob(&glob_result).await?;

        // Pre-resolve the negative glob (if any) once, outside the loop.
        let negative = if let Some(neg) = negative_glob {
            Some(neg.await?)
        } else {
            None
        };

        let reference_sub_type = if eager {
            EcmaScriptModulesReferenceSubType::Import
        } else {
            EcmaScriptModulesReferenceSubType::DynamicImport
        };

        // Resolve all matched files in parallel.
        let entries: Vec<_> = files
            .iter()
            .filter(|(base_relative, _)| {
                // Apply negative pattern filtering on the base-relative path.
                if let Some(ref neg) = negative {
                    !neg.matches(base_relative)
                } else {
                    true
                }
            })
            .map(|(_base_relative, path)| {
                let origin_path = &origin_path;
                let query = &query;
                let reference_sub_type = &reference_sub_type;
                async move {
                    // Compute the origin-relative path for import resolution and as the
                    // user-visible key in the result object.
                    let Some(origin_relative) = origin_path.get_relative_path_to(path) else {
                        bail!(
                            "import.meta.glob: failed to compute relative path from origin to \
                             matched file"
                        );
                    };

                    // Append query string if specified (e.g., `?raw`).
                    let request_str: RcStr = if let Some(q) = query {
                        format!("{origin_relative}{q}").into()
                    } else {
                        origin_relative.clone()
                    };

                    let request = Request::parse_string(request_str).to_resolved().await?;

                    let result = esm_resolve(
                        origin,
                        *request,
                        reference_sub_type.clone(),
                        error_mode,
                        issue_source,
                    )
                    .await?
                    .to_resolved()
                    .await?;

                    Ok((
                        origin_relative.clone(),
                        ImportMetaGlobMapEntry {
                            origin_relative,
                            request,
                            result,
                        },
                    ))
                }
            })
            .try_join()
            .await?;

        let mut map: FxIndexMap<RcStr, ImportMetaGlobMapEntry> = entries.into_iter().collect();

        map.sort_keys();

        Ok(Vc::cell(map))
    }
}

// ---------------------------------------------------------------------------
// ImportMetaGlobModuleReference — per-file reference from the virtual module
// ---------------------------------------------------------------------------

/// A reference from the `ImportMetaGlobAsset` virtual module to one of the
/// glob-matched modules. Carries `ExportUsage` so that tree shaking can
/// narrow the used exports when the `import` option is set (e.g. `{ import:
/// 'default' }` means only the `default` export is needed).
#[turbo_tasks::value]
#[derive(ValueToString)]
#[value_to_string("import.meta.glob resolved reference")]
pub struct ImportMetaGlobModuleReference {
    result: ResolvedVc<ModuleResolveResult>,
    export: ExportUsage,
}

#[turbo_tasks::value_impl]
impl ModuleReference for ImportMetaGlobModuleReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        *self.result
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::Parallel {
            inherit_async: false,
            hoisted: false,
        })
    }

    fn binding_usage(&self) -> BindingUsage {
        BindingUsage {
            import: Default::default(),
            export: self.export.clone(),
        }
    }
}

// ---------------------------------------------------------------------------
// ImportMetaGlobAsset — the virtual module
// ---------------------------------------------------------------------------

/// Build the unique modifier string for an `ImportMetaGlobAsset` ident.
///
/// Every option that affects the generated module content must be included so
/// that two `import.meta.glob()` calls with different options get different
/// module idents (and therefore different entries in the module graph).
fn modifier(
    patterns: &[RcStr],
    eager: bool,
    import: &Option<RcStr>,
    query: &Option<RcStr>,
    base: &Option<RcStr>,
) -> RcStr {
    let mut s = format!("import.meta.glob {}", patterns.join(", "));
    if eager {
        s.push_str(" eager");
    }
    if let Some(named) = import {
        s.push_str(" import=");
        s.push_str(named);
    }
    if let Some(q) = query {
        s.push_str(" query=");
        s.push_str(q);
    }
    if let Some(b) = base {
        s.push_str(" base=");
        s.push_str(b);
    }
    s.into()
}

#[turbo_tasks::value]
pub struct ImportMetaGlobAsset {
    pub origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    pub patterns: Vec<RcStr>,
    pub eager: bool,
    pub import: Option<RcStr>,
    pub query: Option<RcStr>,
    pub base: Option<RcStr>,
    pub issue_source: Option<IssueSource>,
    pub error_mode: ResolveErrorMode,
}

#[turbo_tasks::value_impl]
impl ImportMetaGlobAsset {
    /// Compute and cache the resolved file map for this glob.
    ///
    /// Builds the positive and negative `Glob` matchers from `self.patterns`,
    /// scans the filesystem via `read_glob`, and resolves each matched file as
    /// an ESM import.  Being a `#[turbo_tasks::function]`, the result is
    /// memoised — repeated calls with the same inputs return the cached map.
    #[turbo_tasks::function]
    pub async fn map(&self) -> Result<Vc<ImportMetaGlobMap>> {
        let origin = *self.origin;
        let origin_dir = origin.origin_path().await?.parent();

        // Compute the base directory for glob scanning.
        // With `base`, patterns are resolved relative to origin + base.
        let base_dir = if let Some(ref b) = self.base {
            origin_dir.join(b)?
        } else {
            origin_dir
        };

        // Separate positive (matching) and negative (exclusion) patterns.
        // Negative patterns start with `!`; the `!` prefix is stripped.
        let (positive_raw, negative_raw): (Vec<_>, Vec<_>) =
            self.patterns.iter().partition(|p| !p.starts_with('!'));

        // Build the positive Glob. Turbopack's Glob operates on paths relative
        // to the scan directory (no leading `./`), so strip that prefix. For
        // multiple patterns, use `Glob::alternatives` to combine them.
        let positive_globs: Vec<Vc<Glob>> = positive_raw
            .iter()
            .map(|p| Glob::new(strip_relative_prefix(p).into(), GlobOptions::default()))
            .collect();

        let positive_glob = if positive_globs.len() == 1 {
            positive_globs.into_iter().next().unwrap()
        } else {
            Glob::alternatives(positive_globs)
        };

        // Build the negative Glob (if any). Negative patterns also need `./`
        // stripped and are combined into a single alternation glob.
        let negative_glob = if !negative_raw.is_empty() {
            let neg_globs: Vec<Vc<Glob>> = negative_raw
                .iter()
                .map(|p| {
                    let stripped = p.strip_prefix('!').unwrap_or(p);
                    let stripped = strip_relative_prefix(stripped);
                    Glob::new(stripped.into(), GlobOptions::default())
                })
                .collect();

            let neg = if neg_globs.len() == 1 {
                neg_globs.into_iter().next().unwrap()
            } else {
                Glob::alternatives(neg_globs)
            };
            Some(neg)
        } else {
            None
        };

        Ok(ImportMetaGlobMap::generate(
            origin,
            base_dir,
            positive_glob,
            negative_glob,
            self.query.clone(),
            self.eager,
            self.issue_source,
            self.error_mode,
        ))
    }
}

#[turbo_tasks::value_impl]
impl Module for ImportMetaGlobAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let origin_path = self.origin.origin_path().owned().await?;
        Ok(AssetIdent::from_path(origin_path)
            .with_modifier(modifier(
                &self.patterns,
                self.eager,
                &self.import,
                &self.query,
                &self.base,
            ))
            .into_vc())
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<turbopack_core::source::OptionSource> {
        Vc::cell(None)
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        let this = self.await?;
        let map = &*self.map().await?;

        let export = match &this.import {
            Some(name) => ExportUsage::Named(name.clone()),
            None => ExportUsage::All,
        };

        Ok(Vc::cell(
            map.iter()
                .map(|(_, entry)| {
                    ResolvedVc::upcast(
                        ImportMetaGlobModuleReference {
                            result: entry.result,
                            export: export.clone(),
                        }
                        .resolved_cell(),
                    )
                })
                .collect(),
        ))
    }

    #[turbo_tasks::function]
    fn side_effects(&self) -> Vc<ModuleSideEffects> {
        if self.eager {
            // In eager mode the module's imports are evaluated synchronously, so
            // the module evaluation itself is side-effect-free but its imports
            // are not necessarily.
            ModuleSideEffects::ModuleEvaluationIsSideEffectFree.cell()
        } else {
            // In lazy mode the virtual module only exports thunks; no imports
            // are evaluated, so it is fully side-effect-free.
            ModuleSideEffects::SideEffectFree.cell()
        }
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for ImportMetaGlobAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn turbopack_core::chunk::ChunkItem>> {
        ecmascript_chunk_item(ResolvedVc::upcast(self), module_graph, chunking_context)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for ImportMetaGlobAsset {
    #[turbo_tasks::function]
    fn get_exports(&self) -> Vc<EcmascriptExports> {
        EcmascriptExports::Value.cell()
    }

    #[turbo_tasks::function]
    async fn chunk_item_content(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        _estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let this = self.await?;
        let map = &*self.map().await?;
        let minify = chunking_context.minify_type().await?;

        let mut glob_map = ObjectLit {
            span: DUMMY_SP,
            props: vec![],
        };

        for (key, entry) in map {
            let pm = PatternMapping::resolve_request(
                *entry.request,
                *this.origin,
                chunking_context,
                *entry.result,
                ResolveType::ChunkItem,
            )
            .await?;

            let PatternMapping::Single(pm) = &*pm else {
                continue;
            };

            let key_expr = Expr::Lit(Lit::Str(entry.origin_relative.as_str().into()));

            // Generate the value expression based on eager/lazy and import options
            let value_expr = if this.eager {
                // Eager: direct synchronous require
                let module_expr = pm.create_require(Cow::Borrowed(&key_expr));
                // If `import` option is set, access the named export
                if let Some(named) = &this.import {
                    quote!(
                        "$module[$named]" as Expr,
                        module: Expr = module_expr,
                        named: Expr = Expr::Lit(Lit::Str(named.as_str().into()))
                    )
                } else {
                    module_expr
                }
            } else {
                // Lazy: thunk returning a Promise
                let import_expr = pm.create_import(Cow::Borrowed(&key_expr), false);
                if let Some(named) = &this.import {
                    // Wrap the promise with .then(m => m[named])
                    quote!(
                        "() => $promise.then((m) => m[$named])" as Expr,
                        promise: Expr = import_expr,
                        named: Expr = Expr::Lit(Lit::Str(named.as_str().into()))
                    )
                } else {
                    quote!(
                        "() => $promise" as Expr,
                        promise: Expr = import_expr
                    )
                }
            };

            // Use the origin-relative path as the key — this is what Vite does
            // and what the user sees in `Object.keys(modules)`.
            let prop = KeyValueProp {
                key: PropName::Str(key.as_str().into()),
                value: Box::new(value_expr),
            };

            glob_map
                .props
                .push(PropOrSpread::Prop(Box::new(Prop::KeyValue(prop))));
        }

        let expr = quote_expr!(
            "$turbopack_export_value($obj);",
            turbopack_export_value: Expr = TURBOPACK_EXPORT_VALUE.into(),
            obj: Expr = Expr::Object(glob_map),
        );

        let module = ast::Module {
            span: DUMMY_SP,
            body: vec![ModuleItem::Stmt(Stmt::Expr(ExprStmt {
                span: DUMMY_SP,
                expr,
            }))],
            shebang: None,
        };

        let source_map: Arc<swc_core::common::SourceMap> = Default::default();

        let mut bytes: Vec<u8> = vec![];
        let mut wr: JsWriter<'_, &mut Vec<u8>> =
            JsWriter::new(source_map.clone(), "\n", &mut bytes, None);
        if matches!(*minify, MinifyType::Minify { .. }) {
            wr.set_indent_str("");
        }

        let mut emitter = Emitter {
            cfg: swc_core::ecma::codegen::Config::default(),
            cm: source_map.clone(),
            comments: None,
            wr,
        };

        emitter.emit_module(&module)?;

        Ok(EcmascriptChunkItemContent {
            inner_code: bytes.into(),
            ..Default::default()
        }
        .cell())
    }
}

// ---------------------------------------------------------------------------
// ImportMetaGlobAssetReference — the call-site reference
// ---------------------------------------------------------------------------

#[turbo_tasks::value]
#[derive(Hash, Debug, ValueToString)]
pub struct ImportMetaGlobAssetReference {
    pub inner: ResolvedVc<ImportMetaGlobAsset>,
    pub patterns: Vec<RcStr>,
}

impl std::fmt::Display for ImportMetaGlobAssetReference {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "import.meta.glob {}", self.patterns.join(", "))
    }
}

impl ImportMetaGlobAssetReference {
    pub fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        patterns: Vec<RcStr>,
        eager: bool,
        import: Option<RcStr>,
        query: Option<RcStr>,
        base: Option<RcStr>,
        issue_source: Option<IssueSource>,
        error_mode: ResolveErrorMode,
    ) -> Self {
        let inner = ImportMetaGlobAsset {
            origin,
            patterns: patterns.clone(),
            eager,
            import,
            query,
            base,
            issue_source,
            error_mode,
        }
        .resolved_cell();

        ImportMetaGlobAssetReference { inner, patterns }
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for ImportMetaGlobAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        *ModuleResolveResult::module(ResolvedVc::upcast(self.inner))
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::Parallel {
            inherit_async: false,
            hoisted: false,
        })
    }
}

impl IntoCodeGenReference for ImportMetaGlobAssetReference {
    fn into_code_gen_reference(
        self,
        path: AstPath,
    ) -> (ResolvedVc<Box<dyn ModuleReference>>, CodeGen) {
        let reference = self.resolved_cell();
        (
            ResolvedVc::upcast(reference),
            CodeGen::ImportMetaGlobAssetReferenceCodeGen(ImportMetaGlobAssetReferenceCodeGen {
                reference,
                path,
            }),
        )
    }
}

// ---------------------------------------------------------------------------
// ImportMetaGlobAssetReferenceCodeGen — AST rewriting
// ---------------------------------------------------------------------------

#[derive(
    PartialEq, Eq, TraceRawVcs, ValueDebugFormat, NonLocalValue, Hash, Debug, Encode, Decode,
)]
pub struct ImportMetaGlobAssetReferenceCodeGen {
    path: AstPath,
    reference: ResolvedVc<ImportMetaGlobAssetReference>,
}

impl ImportMetaGlobAssetReferenceCodeGen {
    pub async fn code_generation(
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let module_id = self
            .reference
            .await?
            .inner
            .chunk_item_id(chunking_context)
            .await?;

        let mut visitors = Vec::new();
        visitors.push(create_visitor!(
            self.path,
            visit_mut_expr,
            |expr: &mut Expr| {
                if let Expr::Call(_) = expr {
                    // Replace import.meta.glob(...) with __turbopack_require__(<virtual_module_id>)
                    *expr = quote!(
                        "$turbopack_require($id)" as Expr,
                        turbopack_require: Expr = TURBOPACK_REQUIRE.into(),
                        id: Expr = module_id_to_lit(&module_id)
                    );
                }
            }
        ));
        Ok(CodeGeneration::visitors(visitors))
    }
}
