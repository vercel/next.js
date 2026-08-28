use std::{borrow::Cow, sync::Arc};

use anyhow::{Context as _, Result, bail};
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
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, NonLocalValue, ResolvedVc, TryJoinIterExt, ValueToString, Vc,
    debug::ValueDebugFormat, trace::TraceRawVcs,
};
use turbo_tasks_fs::{
    DirectoryEntry, FileSystemPath, ReadGlobResult,
    glob::{Glob, GlobOptions, relativize_glob},
};
use turbopack_core::{
    chunk::{
        AsyncModuleInfo, ChunkableModule, ChunkingContext, ChunkingType, MinifyType,
        ModuleChunkItemIdExt,
    },
    ident::AssetIdent,
    issue::{IssueExt, IssueSeverity, IssueSource, StyledString, code_gen::CodeGenerationIssue},
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
    /// Whether glob matching is case-sensitive.
    pub case_sensitive: bool,
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
    args: &[JsValue<'_>],
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
    let mut case_sensitive = true;

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
                            Some("caseSensitive") => {
                                if let Some(b) = val.as_bool() {
                                    case_sensitive = b;
                                } else {
                                    handler.span_warn_with_code(
                                        span,
                                        "import.meta.glob() 'caseSensitive' option must be a \
                                         constant boolean (true or false), defaulting to true",
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
                                         Supported options are: eager, import, query, base, \
                                         caseSensitive"
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
        case_sensitive,
    })
}

// ---------------------------------------------------------------------------
// Pattern normalization
// ---------------------------------------------------------------------------

/// Where a single Vite-style glob pattern is rooted.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PatternRoot {
    /// The pattern is absolute from the project root (it started with `/`).
    ProjectRoot,
    /// The pattern is relative to the importing file.
    Relative,
}

/// Split a Vite-style glob pattern into the directory it is rooted in and the
/// remaining glob, which only traverses down from there.
///
/// Vite's rule: a pattern is either relative to the importing file (`./`, `../`)
/// or absolute from the project root (`/`).
/// <https://vite.dev/guide/features.html#glob-import-caveats>
///
/// The leading `/` is the part specific to `import.meta.glob`; resolving `./` and
/// `../` against a directory is the general filesystem operation shared with
/// other glob options, so that part is delegated to [`relativize_glob`].
///
/// `root` is the directory a `/`-rooted pattern resolves from, the same one a
/// `/`-rooted request resolves from. It is [`None`] when such requests aren't
/// supported, in which case callers must have rejected `/`-rooted patterns
/// before getting here.
///
/// Returns [`None`] if the pattern walks above `root`.
fn split_pattern<'a>(
    pattern: &'a str,
    base_dir: &FileSystemPath,
    root: Option<&FileSystemPath>,
) -> Option<(PatternRoot, &'a str, FileSystemPath)> {
    if let Some(rest) = pattern.strip_prefix('/') {
        return Some((PatternRoot::ProjectRoot, rest, root?.clone()));
    }
    let (rest, dir) = relativize_glob(pattern, base_dir)?;
    Some((PatternRoot::Relative, rest, dir))
}

/// Strip the `!` prefix that marks a negative (exclusion) pattern.
fn strip_negation(pattern: &str) -> &str {
    pattern.strip_prefix('!').unwrap_or(pattern)
}

/// A glob pattern rewritten to be relative to the common scan directory.
struct NormalizedPattern {
    /// Where the original pattern was rooted.
    root: PatternRoot,
    /// The pattern, relative to the scan directory.
    relative_to_scan_dir: RcStr,
}

// ---------------------------------------------------------------------------
// Helpers for collecting files from ReadGlobResult
// ---------------------------------------------------------------------------

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
    /// resolution.
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
    /// `scan_dir` is the directory to scan. `positive_glob` is a `Glob` matching
    /// the wanted files (relative to `scan_dir`). `negative_glob` optionally
    /// excludes files. Both globs operate on paths *relative to `scan_dir`*.
    ///
    /// The keys of the returned map are the user-visible keys of the generated
    /// object:
    /// - relative to `key_base` (with a `./` or `../` prefix) when the `base` option was used,
    /// - absolute from the project root (with a `/` prefix) for files matched by a
    ///   project-root-absolute pattern (`root_absolute_glob`),
    /// - relative to the importing file otherwise.
    ///
    /// `root` is the directory a `/`-rooted pattern resolves from, and that its keys are relative
    /// to. It is always set when `root_absolute_glob` is.
    #[turbo_tasks::function]
    pub(crate) async fn generate(
        origin: Vc<Box<dyn ResolveOrigin>>,
        scan_dir: FileSystemPath,
        positive_glob: Vc<Glob>,
        negative_glob: Option<Vc<Glob>>,
        root_absolute_glob: Option<Vc<Glob>>,
        root: Option<FileSystemPath>,
        key_base: Option<FileSystemPath>,
        query: Option<RcStr>,
        eager: bool,
        issue_source: Option<IssueSource>,
        error_mode: ResolveErrorMode,
    ) -> Result<Vc<Self>> {
        let origin_path = origin.into_trait_ref().await?.origin_path().parent();

        // Use read_glob for efficient directory-pruning file discovery.
        let glob_result = scan_dir.read_glob(positive_glob).await?;
        let files = flatten_read_glob(&glob_result).await?;

        // Pre-resolve the globs that are matched per file (if any) once, outside the loop.
        let negative = if let Some(neg) = negative_glob {
            Some(neg.await?)
        } else {
            None
        };
        let root_absolute = if let Some(glob) = root_absolute_glob {
            Some(glob.await?)
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
            .filter(|(scan_relative, _)| {
                // Apply negative pattern filtering on the scan-dir-relative path.
                if let Some(ref neg) = negative {
                    !neg.matches(scan_relative)
                } else {
                    true
                }
            })
            .map(|(scan_relative, _logical_path)| {
                let origin_path = &origin_path;
                let scan_dir = &scan_dir;
                let query = &query;
                let reference_sub_type = &reference_sub_type;
                let key_base = &key_base;
                let root_absolute = &root_absolute;
                let root = &root;
                async move {
                    // ReadGlobResult paths are logical too, but reconstruct from its keys here so
                    // matching and user-visible specifiers have one explicit source of truth. The
                    // module resolver resolves this logical request and tracks its symlink chain.
                    let logical_path = scan_dir.join(scan_relative)?;
                    let Some(origin_relative) = origin_path.get_relative_path_to(&logical_path)
                    else {
                        bail!(
                            "import.meta.glob: failed to compute relative path from origin to \
                             matched file"
                        );
                    };

                    // Compute the user-visible key of this entry.
                    let key: RcStr = if let Some(key_base) = key_base {
                        // Vite keys the result relative to `base` when it is provided.
                        // https://vite.dev/guide/features.html#base-path
                        let Some(key) = key_base.get_relative_path_to(&logical_path) else {
                            bail!(
                                "import.meta.glob: failed to compute relative path from base to \
                                 matched file"
                            );
                        };
                        key
                    } else if root_absolute
                        .as_ref()
                        .is_some_and(|glob| glob.matches(scan_relative))
                    {
                        // Matched by a pattern that is absolute from the root of the project, so
                        // the key is absolute from that same root.
                        let root = root
                            .as_ref()
                            .context("a project-root-absolute pattern requires a root")?;
                        let Some(relative) = root.get_relative_path_to(&logical_path) else {
                            bail!(
                                "import.meta.glob: failed to compute relative path from the root \
                                 of the project to matched file"
                            );
                        };
                        format!("/{}", relative.strip_prefix("./").unwrap_or(&relative)).into()
                    } else {
                        origin_relative.clone()
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
                        key,
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
    case_sensitive: bool,
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
    if !case_sensitive {
        s.push_str(" case-insensitive");
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
    pub case_sensitive: bool,
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
        let origin_dir = origin.into_trait_ref().await?.origin_path().parent();

        // Compute the base directory patterns are resolved against.
        // With `base`, patterns are resolved relative to origin + base.
        let base_dir = if let Some(ref b) = self.base {
            match origin_dir.try_join(b) {
                Some(base_dir) => base_dir,
                None => {
                    emit_escapes_root_issue(self, &origin_dir, &format!("the 'base' option {b:?}"))
                        .await?;
                    return Ok(Vc::cell(Default::default()));
                }
            }
        } else {
            origin_dir.clone()
        };
        // A `/`-rooted pattern resolves from the same directory a `/`-rooted request
        // resolves from, so that a pattern and a plain import agree on what `/`
        // means. That directory is not necessarily the root of the filesystem.
        let root = self
            .origin
            .into_trait_ref()
            .await?
            .resolve_options()
            .await?
            .server_relative_root
            .clone();

        // Separate positive (matching) and negative (exclusion) patterns.
        // Negative patterns start with `!`; the `!` prefix is stripped.
        let (positive_raw, negative_raw): (Vec<_>, Vec<_>) =
            self.patterns.iter().partition(|p| !p.starts_with('!'));
        let negative_raw = negative_raw
            .iter()
            .map(|p| strip_negation(p))
            .collect::<Vec<_>>();

        // Without a directory to resolve them from, `/`-rooted patterns aren't
        // supported. Falling back to the root of the filesystem would match files
        // outside of the project.
        if root.is_none()
            && let Some(pattern) = self
                .patterns
                .iter()
                .find(|p| strip_negation(p).starts_with('/'))
        {
            emit_absolute_unsupported_issue(self, &format!("the pattern {pattern:?}")).await?;
            return Ok(Vc::cell(Default::default()));
        }

        // No pattern may point outside of the project, not even a negative one:
        // silently ignoring it would include files the user asked to exclude.
        // Report the pattern as it was written, so it can be found in the source.
        for pattern in &self.patterns {
            if split_pattern(strip_negation(pattern), &base_dir, root.as_ref()).is_none() {
                emit_escapes_root_issue(self, &origin_dir, &format!("the pattern {pattern:?}"))
                    .await?;
                return Ok(Vc::cell(Default::default()));
            }
        }

        // Pick a single directory to scan that contains every pattern root, so
        // that one `read_glob` call covers all of them and each pattern can be
        // rewritten relative to it. A negative pattern can't add files, but it
        // can be rooted above the positive patterns (e.g. `['../dir/*.js',
        // '!/dir/skip.js']`) and still has to be expressible relative to
        // `scan_dir`, so both are considered here.
        let mut scan_dir = base_dir.clone();
        for pattern in positive_raw
            .iter()
            .map(|p| p.as_str())
            .chain(negative_raw.iter().copied())
        {
            let (_, _, root_dir) = split_pattern(pattern, &base_dir, root.as_ref())
                .context("every pattern was checked above")?;
            // Every root is an ancestor of `base_dir` (or the project root), so
            // the shortest path is an ancestor of all of them.
            if root_dir.path.len() < scan_dir.path.len() {
                scan_dir = root_dir;
            }
        }

        let glob_options = GlobOptions {
            case_insensitive: !self.case_sensitive,
            ..Default::default()
        };

        // Rewrite a pattern to be relative to `scan_dir`.
        let normalize = |pattern: &str| -> Result<NormalizedPattern> {
            let (pattern_root, rest, root_dir) = split_pattern(pattern, &base_dir, root.as_ref())
                .context("every pattern was checked above")?;
            let prefix = if root_dir == scan_dir {
                ""
            } else {
                scan_dir
                    .get_path_to(&root_dir)
                    .context("the scanned directory must contain every pattern root")?
            };
            Ok(NormalizedPattern {
                root: pattern_root,
                relative_to_scan_dir: if prefix.is_empty() {
                    rest.into()
                } else {
                    format!("{prefix}/{rest}").into()
                },
            })
        };

        let mut positive_globs: Vec<Vc<Glob>> = Vec::with_capacity(positive_raw.len());
        let mut root_absolute_globs: Vec<Vc<Glob>> = Vec::new();
        for pattern in &positive_raw {
            let normalized = normalize(pattern)?;
            let glob = Glob::new(normalized.relative_to_scan_dir.clone(), glob_options);
            if normalized.root == PatternRoot::ProjectRoot {
                root_absolute_globs.push(glob);
            }
            positive_globs.push(glob);
        }

        let positive_glob = if positive_globs.len() == 1 {
            positive_globs.into_iter().next().unwrap()
        } else {
            Glob::alternatives(positive_globs)
        };

        // Build the negative Glob (if any). Negative patterns are normalized the
        // same way and combined into a single alternation glob.
        let mut negative_globs: Vec<Vc<Glob>> = Vec::with_capacity(negative_raw.len());
        for pattern in &negative_raw {
            let normalized = normalize(pattern)?;
            negative_globs.push(Glob::new(
                normalized.relative_to_scan_dir.clone(),
                glob_options,
            ));
        }
        let negative_glob = if negative_globs.is_empty() {
            None
        } else if negative_globs.len() == 1 {
            Some(negative_globs.into_iter().next().unwrap())
        } else {
            Some(Glob::alternatives(negative_globs))
        };

        let root_absolute_glob = if root_absolute_globs.is_empty() {
            None
        } else if root_absolute_globs.len() == 1 {
            Some(root_absolute_globs.into_iter().next().unwrap())
        } else {
            Some(Glob::alternatives(root_absolute_globs))
        };

        Ok(ImportMetaGlobMap::generate(
            origin,
            scan_dir,
            positive_glob,
            negative_glob,
            root_absolute_glob,
            root,
            // Vite keys the result relative to `base` when it is provided.
            self.base.is_some().then_some(base_dir),
            self.query.clone(),
            self.eager,
            self.issue_source,
            self.error_mode,
        ))
    }
}

/// A `/`-rooted pattern needs a directory to resolve from, and there is none.
async fn emit_absolute_unsupported_issue(asset: &ImportMetaGlobAsset, what: &str) -> Result<()> {
    CodeGenerationIssue {
        severity: IssueSeverity::Error,
        title: StyledString::Text(rcstr!(
            "import.meta.glob() does not support patterns absolute from the root of the project \
             here"
        ))
        .resolved_cell(),
        message: StyledString::Text(
            format!(
                "{what} of import.meta.glob({}) starts with `/`, but there is no directory to \
                 resolve it from. Use a pattern relative to the importing file instead.",
                asset
                    .patterns
                    .iter()
                    .map(|p| format!("{p:?}"))
                    .collect::<Vec<_>>()
                    .join(", "),
            )
            .into(),
        )
        .resolved_cell(),
        path: asset.origin.into_trait_ref().await?.origin_path(),
        source: asset.issue_source,
    }
    .resolved_cell()
    .emit();
    Ok(())
}

/// Report a `base` or pattern of an `import.meta.glob()` call that walks above
/// the project root.
async fn emit_escapes_root_issue(
    asset: &ImportMetaGlobAsset,
    origin_dir: &FileSystemPath,
    what: &str,
) -> Result<()> {
    CodeGenerationIssue {
        severity: IssueSeverity::Error,
        title: StyledString::Text(rcstr!(
            "import.meta.glob() cannot look outside of the project root"
        ))
        .resolved_cell(),
        message: StyledString::Text(
            format!(
                "{what} of import.meta.glob({}) resolves to a directory above the project root, \
                 relative to {}. Patterns are relative to the importing file, or absolute from \
                 the project root when they start with `/`.",
                asset
                    .patterns
                    .iter()
                    .map(|p| format!("{p:?}"))
                    .collect::<Vec<_>>()
                    .join(", "),
                origin_dir.path
            )
            .into(),
        )
        .resolved_cell(),
        path: asset.origin.into_trait_ref().await?.origin_path(),
        source: asset.issue_source,
    }
    .resolved_cell()
    .emit();
    Ok(())
}

#[turbo_tasks::value_impl]
impl Module for ImportMetaGlobAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let origin = self.origin.into_trait_ref().await?;
        let origin_path = origin.origin_path();
        // The layer is part of the ident so that this virtual module is distinct
        // per layer (the same file can be processed in multiple layers), and so
        // that import traces can collapse it into the importing module.
        Ok(AssetIdent::from_path(origin_path)
            .with_layer(origin.asset_context().into_trait_ref().await?.layer())
            .with_modifier(modifier(
                &self.patterns,
                self.eager,
                &self.import,
                &self.query,
                &self.base,
                self.case_sensitive,
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

        // A matched file that has no module type is reported against the file
        // itself, which is not part of the module graph and therefore has no
        // import trace. Point at the call site as well, otherwise there is
        // nothing connecting the error to a request the user never wrote.
        for (key, entry) in map.iter() {
            if entry.result.await?.primary.iter().any(|(_, item)| {
                matches!(
                    item,
                    turbopack_core::resolve::ModuleResolveResultItem::Unknown(_)
                )
            }) {
                CodeGenerationIssue {
                    severity: IssueSeverity::Error,
                    title: StyledString::Text(rcstr!(
                        "import.meta.glob() matched a file that has no module type"
                    ))
                    .resolved_cell(),
                    message: StyledString::Text(
                        format!(
                            "import.meta.glob({}) matched {key}, which doesn't have an associated \
                             module type. Narrow the pattern, exclude the file with a negative \
                             pattern (\"!...\"), or register a loader or module type for its file \
                             extension.",
                            this.patterns
                                .iter()
                                .map(|p| format!("{p:?}"))
                                .collect::<Vec<_>>()
                                .join(", ")
                        )
                        .into(),
                    )
                    .resolved_cell(),
                    path: this.origin.into_trait_ref().await?.origin_path(),
                    source: this.issue_source,
                }
                .resolved_cell()
                .emit();
            }
        }

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
                None,
            )
            .await?;

            let PatternMapping::Single(pm) = &*pm else {
                continue;
            };

            let key_expr = Expr::Lit(Lit::Str(entry.origin_relative.as_str().into()));

            // Generate the value expression based on eager/lazy and import options
            let value_expr = if this.eager {
                // Eager: synchronously evaluate the module and use its ESM namespace,
                // matching what a static `import * as ns from "..."` would produce.
                let module_expr = pm.create_esm_require(Cow::Borrowed(&key_expr));
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
        case_sensitive: bool,
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
            case_sensitive,
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
