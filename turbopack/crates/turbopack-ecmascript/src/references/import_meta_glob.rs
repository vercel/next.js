use std::fmt::Write;

use anyhow::{Context as _, Result, bail};
use swc_core::common::{
    Span,
    errors::{DiagnosticId, Handler},
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ReadRef, ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::{
    DirectoryEntry, File, FileContent, FileSystemPath, ReadGlobResult,
    glob::{Glob, GlobOptions, relativize_glob},
};
use turbopack_core::{
    asset::{Asset, AssetContent},
    context::AssetContext,
    ident::AssetIdent,
    issue::{IssueExt, IssueSeverity, IssueSource, StyledString, code_gen::CodeGenerationIssue},
    reference_type::{InnerAssets, ReferenceType},
    resolve::{ImportUsage, ModulePart, origin::ResolveOrigin},
    source::Source,
    source_map::GenerateSourceMap,
};

use crate::{
    EcmascriptModuleAsset,
    analyzer::JsValue,
    references::{
        esm::{EsmAssetReference, EsmAssetReferenceOptions},
        synthetic_source::call_site_source_map,
    },
    utils::StringifyJs,
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

impl ImportMetaGlobOptions {
    /// Identifies the synthetic module of the call. Calls with the same key share
    /// one synthetic module, and one import of it.
    pub fn key(&self) -> RcStr {
        modifier(
            &self.patterns,
            self.eager,
            &self.import,
            &self.query,
            &self.base,
            self.case_sensitive,
        )
    }
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

/// A pattern of an `import.meta.glob()` call, split into where it is rooted and
/// the glob relative to that root. Splitting happens once per pattern, up front,
/// so the rest of the code can work from the result.
struct SplitPattern<'a> {
    /// Negative (exclusion) patterns start with `!` and only remove matches.
    negative: bool,
    /// Where the pattern is rooted.
    root: PatternRoot,
    /// The pattern, relative to `root_dir`.
    rest: &'a str,
    /// The directory the pattern is rooted in.
    root_dir: FileSystemPath,
}

// ---------------------------------------------------------------------------
// Helpers for collecting files from ReadGlobResult
// ---------------------------------------------------------------------------

/// Flatten a nested `ReadGlobResult` into a list of the paths of its files, in no
/// particular order.
///
/// `ReadGlobResult` stores results in a tree of `HashMap`s keyed by path
/// segment. This function walks the tree and collects all file entries with
/// their full relative paths (relative to the directory `read_glob` was called
/// on).
async fn flatten_read_glob(result: ReadRef<ReadGlobResult>) -> Result<Vec<RcStr>> {
    fn join(prefix: &str, segment: &str) -> String {
        if prefix.is_empty() {
            segment.to_string()
        } else {
            format!("{prefix}/{segment}")
        }
    }

    let mut files = Vec::new();

    // Walk the tree, resolving Vc references as we go.
    let mut pending = vec![(String::new(), result)];
    while let Some((prefix, node)) = pending.pop() {
        for (segment, entry) in &node.results {
            if let DirectoryEntry::File(_) = entry {
                files.push(join(&prefix, segment).into());
            }
        }
        for (segment, inner_vc) in &node.inner {
            pending.push((join(&prefix, segment), inner_vc.await?));
        }
    }

    Ok(files)
}

// ---------------------------------------------------------------------------
// ImportMetaGlobMap — the matched file map
// ---------------------------------------------------------------------------

/// The files matched by an `import.meta.glob()` call, sorted by the user-visible key
/// of each in the generated object, with the request that imports it from the
/// calling module.
#[turbo_tasks::value(transparent)]
pub struct ImportMetaGlobMap(Vec<(RcStr, RcStr)>);

#[turbo_tasks::value_impl]
impl ImportMetaGlobMap {
    /// Discover files matching glob patterns.
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
    /// The values are requests relative to `origin_dir`, the directory of the
    /// importing file, with `query` appended.
    ///
    /// `root` is the directory a `/`-rooted pattern resolves from, and that its keys are relative
    /// to. It is always set when `root_absolute_glob` is.
    #[turbo_tasks::function]
    pub(crate) async fn generate(
        origin_dir: FileSystemPath,
        scan_dir: FileSystemPath,
        positive_glob: Vc<Glob>,
        negative_glob: Option<Vc<Glob>>,
        root_absolute_glob: Option<Vc<Glob>>,
        root: Option<FileSystemPath>,
        key_base: Option<FileSystemPath>,
        query: Option<RcStr>,
    ) -> Result<Vc<Self>> {
        // Use read_glob for efficient directory-pruning file discovery.
        let files = flatten_read_glob(scan_dir.read_glob(positive_glob).await?).await?;

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

        let mut map = Vec::with_capacity(files.len());
        for scan_relative in &files {
            // Apply negative pattern filtering on the scan-dir-relative path.
            if negative
                .as_ref()
                .is_some_and(|neg| neg.matches(scan_relative))
            {
                continue;
            }

            // ReadGlobResult paths are logical too, but reconstruct from its keys here so
            // matching and user-visible specifiers have one explicit source of truth. The
            // module resolver resolves this logical request and tracks its symlink chain.
            let logical_path = scan_dir.join(scan_relative)?;
            let Some(origin_relative) = origin_dir.get_relative_request_to(&logical_path) else {
                bail!(
                    "import.meta.glob: failed to compute relative path from origin to matched file"
                );
            };

            // Compute the user-visible key of this entry.
            let key: RcStr = if let Some(key_base) = &key_base {
                // Vite keys the result relative to `base` when it is provided, and its
                // keys are `./`-prefixed like the origin-relative ones below.
                // https://vite.dev/guide/features.html#base-path
                let Some(key) = key_base.get_relative_request_to(&logical_path) else {
                    bail!(
                        "import.meta.glob: failed to compute relative path from base to matched \
                         file"
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
                        "import.meta.glob: failed to compute relative path from the root of the \
                         project to matched file"
                    );
                };
                format!("/{relative}").into()
            } else {
                origin_relative.clone()
            };

            // Append query string if specified (e.g., `?raw`).
            let request: RcStr = if let Some(q) = &query {
                format!("{origin_relative}{q}").into()
            } else {
                origin_relative
            };

            map.push((key, request));
        }

        // Every file is matched once, and gets a key of its own.
        map.sort_unstable_by(|(a, _), (b, _)| a.cmp(b));

        Ok(Vc::cell(map))
    }
}

// ---------------------------------------------------------------------------
// ImportMetaGlobSource — the virtual module
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

/// The source of the synthetic module that an `import.meta.glob()` call is
/// replaced with. It imports every matched file and default-exports the object
/// of them, so that normal module handling applies to the matches: lazy matches
/// are dynamic `import()`s and eager matches are static imports.
#[turbo_tasks::value]
pub struct ImportMetaGlobSource {
    pub origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    pub patterns: Vec<RcStr>,
    pub eager: bool,
    pub import: Option<RcStr>,
    pub query: Option<RcStr>,
    pub base: Option<RcStr>,
    pub case_sensitive: bool,
    /// The `import.meta.glob()` call. The source map of the synthetic module maps
    /// all of it to the call, so issues in it are reported there.
    pub issue_source: IssueSource,
}

#[turbo_tasks::value_impl]
impl ImportMetaGlobSource {
    /// Compute and cache the matched file map for this glob.
    ///
    /// Builds the positive and negative `Glob` matchers from `self.patterns`
    /// and scans the filesystem via `read_glob`.  Being a
    /// `#[turbo_tasks::function]`, the result is memoised — repeated calls with
    /// the same inputs return the cached map.
    #[turbo_tasks::function]
    pub async fn map(&self) -> Result<Vc<ImportMetaGlobMap>> {
        let origin_dir = self.origin.into_trait_ref().await?.origin_path().parent();

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

        // Split every pattern once: this both validates it and produces everything
        // the globs below are built from.
        //
        // An invalid pattern is always reported. A positive one is then skipped, so
        // that the patterns around it still resolve — being left with fewer matches
        // is easier to work with while editing than an empty object. A negative one
        // can't be skipped: dropping an exclusion would include files the user
        // asked to leave out, so nothing is matched at all instead.
        //
        // A `/`-rooted pattern with no directory to resolve it from is reported
        // separately from one that walks above that directory.
        let mut patterns = Vec::with_capacity(self.patterns.len());
        for written in &self.patterns {
            let negative = written.starts_with('!');
            let stripped = strip_negation(written);
            let Some((pattern_root, rest, root_dir)) =
                split_pattern(stripped, &base_dir, root.as_ref())
            else {
                if root.is_none() && stripped.starts_with('/') {
                    emit_absolute_unsupported_issue(self, &format!("the pattern {written:?}"))
                        .await?;
                } else {
                    emit_escapes_root_issue(self, &origin_dir, &format!("the pattern {written:?}"))
                        .await?;
                }
                if negative {
                    return Ok(Vc::cell(Default::default()));
                }
                continue;
            };
            patterns.push(SplitPattern {
                negative,
                root: pattern_root,
                rest,
                root_dir,
            });
        }

        // Pick a single directory to scan that contains every pattern root, so
        // that one `read_glob` call covers all of them and each pattern can be
        // rewritten relative to it. A negative pattern can't add files, but it
        // can be rooted above the positive patterns (e.g. `['../dir/*.js',
        // '!/dir/skip.js']`) and still has to be expressible relative to
        // `scan_dir`, so both are considered here.
        let mut scan_dir = base_dir.clone();
        for pattern in &patterns {
            // Every root is an ancestor of `base_dir` (or of the root a `/`-rooted
            // pattern resolves from), so the shortest path is an ancestor of all.
            if pattern.root_dir.path.len() < scan_dir.path.len() {
                scan_dir = pattern.root_dir.clone();
            }
        }

        let glob_options = GlobOptions {
            case_insensitive: !self.case_sensitive,
            ..Default::default()
        };

        // Rewrite a pattern to be relative to `scan_dir`.
        let relative_to_scan_dir = |pattern: &SplitPattern<'_>| -> Result<RcStr> {
            let prefix = if pattern.root_dir == scan_dir {
                ""
            } else {
                scan_dir
                    .get_path_to(&pattern.root_dir)
                    .context("the scanned directory must contain every pattern root")?
            };
            Ok(if prefix.is_empty() {
                pattern.rest.into()
            } else {
                format!("{prefix}/{}", pattern.rest).into()
            })
        };

        let mut positive_globs: Vec<Vc<Glob>> = Vec::new();
        let mut negative_globs: Vec<Vc<Glob>> = Vec::new();
        // The patterns that are absolute from the root of the project, so that the
        // files they match can be keyed the same way. Only positive patterns are
        // collected: a negative pattern removes matches instead of producing them,
        // so it never determines how a key is spelled.
        let mut root_absolute_globs: Vec<Vc<Glob>> = Vec::new();
        for pattern in &patterns {
            let glob = Glob::new(relative_to_scan_dir(pattern)?, glob_options);
            if pattern.negative {
                negative_globs.push(glob);
            } else {
                if pattern.root == PatternRoot::ProjectRoot {
                    root_absolute_globs.push(glob);
                }
                positive_globs.push(glob);
            }
        }

        let positive_glob = if positive_globs.len() == 1 {
            positive_globs.into_iter().next().unwrap()
        } else {
            Glob::alternatives(positive_globs)
        };

        // Negative patterns are combined into a single alternation glob.
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
            origin_dir,
            scan_dir,
            positive_glob,
            negative_glob,
            root_absolute_glob,
            root,
            // Vite keys the result relative to `base` when it is provided.
            self.base.is_some().then_some(base_dir),
            self.query.clone(),
        ))
    }
}

/// A `/`-rooted pattern needs a directory to resolve from, and there is none.
async fn emit_absolute_unsupported_issue(asset: &ImportMetaGlobSource, what: &str) -> Result<()> {
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
        source: Some(asset.issue_source),
    }
    .resolved_cell()
    .emit();
    Ok(())
}

/// Report a `base` or pattern of an `import.meta.glob()` call that walks above
/// the project root.
async fn emit_escapes_root_issue(
    asset: &ImportMetaGlobSource,
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
        source: Some(asset.issue_source),
    }
    .resolved_cell()
    .emit();
    Ok(())
}

#[turbo_tasks::value_impl]
impl Source for ImportMetaGlobSource {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let origin_path = self.origin.into_trait_ref().await?.origin_path();
        // A sibling of the importing file, so that the requests resolve exactly as they
        // would from the importing file itself. It also shows up in import traces, which
        // tells which glob pulled a matched file in.
        Ok(
            AssetIdent::from_path(origin_path.append(".import-meta-glob.mjs")?)
                .with_modifier(modifier(
                    &self.patterns,
                    self.eager,
                    &self.import,
                    &self.query,
                    &self.base,
                    self.case_sensitive,
                ))
                .into_vc(),
        )
    }

    #[turbo_tasks::function]
    async fn description(self: Vc<Self>) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("synthetic module for {}", self.ident().to_string().await?).into(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl Asset for ImportMetaGlobSource {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        Ok(AssetContent::file(
            FileContent::Content(File::from(code(self).await?)).cell(),
        ))
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for ImportMetaGlobSource {
    #[turbo_tasks::function]
    async fn generate_source_map(self: Vc<Self>) -> Result<Vc<FileContent>> {
        let issue_source = self.await?.issue_source;
        call_site_source_map(issue_source, &code(self).await?).await
    }
}

/// The code of the synthetic module. Not a turbo task, since it only formats the map.
async fn code(source: Vc<ImportMetaGlobSource>) -> Result<String> {
    let this = source.await?;
    let map = &*source.map().await?;

    // Eager matches are static imports, so that they are evaluated before the
    // importing module, and lazy matches are dynamic `import()`s. With the `import`
    // option only that export is used, which a named import or a `turbopackExports`
    // comment tells tree shaking about.
    let mut imports = String::new();
    let mut entries = String::new();
    for (index, (key, request)) in map.iter().enumerate() {
        let key = StringifyJs(key);
        let request = StringifyJs(request);
        let import = this.import.as_ref().map(StringifyJs);
        let value = match (this.eager, import) {
            (true, None) => {
                writeln!(imports, "import * as m{index} from {request};")?;
                format!("m{index}")
            }
            (true, Some(import)) => {
                writeln!(imports, "import {{ {import} as m{index} }} from {request};")?;
                format!("m{index}")
            }
            (false, None) => format!("() => import({request})"),
            (false, Some(import)) => format!(
                "() => import(/* turbopackExports: {import} */ {request}).then((m) => m[{import}])"
            ),
        };
        writeln!(entries, "  {key}: {value},")?;
    }

    Ok(format!("{imports}export default {{\n{entries}}};\n"))
}

/// Creates the reference that an `import.meta.glob()` call is replaced with: an
/// import of the default export of its synthetic module. Like a static import it
/// is hoisted, so the importing module becomes async when an eager match is,
/// and scope hoisting can merge the synthetic module into it.
pub async fn import_meta_glob_reference(
    module: ResolvedVc<EcmascriptModuleAsset>,
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    options: ImportMetaGlobOptions,
    issue_source: IssueSource,
    import_externals: bool,
    module_fragments_enabled: bool,
) -> Result<EsmAssetReference> {
    let key = options.key();
    let ImportMetaGlobOptions {
        patterns,
        eager,
        import,
        query,
        base,
        case_sensitive,
    } = options;
    let source = ImportMetaGlobSource {
        origin,
        patterns,
        eager,
        import,
        query,
        base,
        case_sensitive,
        issue_source,
    }
    .resolved_cell();
    let asset_context = *origin.into_trait_ref().await?.asset_context();
    let synthetic_module = asset_context
        .process(
            Vc::upcast(*source),
            ReferenceType::Internal(InnerAssets::empty().to_resolved().await?),
        )
        .module()
        .to_resolved()
        .await?;
    EsmAssetReference::new(
        module,
        origin,
        key,
        EsmAssetReferenceOptions {
            issue_source,
            annotations: None,
            export_name: Some(ModulePart::export(rcstr!("default"))),
            import_usage: ImportUsage::TopLevel,
            import_externals,
            module_fragments_enabled,
            export_usage_passthrough: None,
            resolve_override: Some(synthetic_module),
        },
    )
    .await
}
