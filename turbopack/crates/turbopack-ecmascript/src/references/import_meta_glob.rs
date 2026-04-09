use std::{borrow::Cow, sync::Arc};

use anyhow::{Result, bail};
use bincode::{Decode, Encode};
use swc_core::{
    common::DUMMY_SP,
    ecma::{
        ast::{
            Expr, ExprStmt, KeyValueProp, Lit, ModuleItem, ObjectLit, Prop, PropName, PropOrSpread,
            Stmt, {self},
        },
        codegen::{Emitter, text_writer::JsWriter},
    },
    quote, quote_expr,
};
use turbo_esregex::EsRegex;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexMap, NonLocalValue, ResolvedVc, ValueToString, Vc, debug::ValueDebugFormat,
    trace::TraceRawVcs,
};
use turbo_tasks_fs::FileSystemPath;
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
    resolve::{ModuleResolveResult, ResolveErrorMode, origin::ResolveOrigin, parse::Request},
    source::Source,
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
        require_context::{FlatDirList, ResolvedModuleReference},
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
pub fn parse_import_meta_glob(args: &[JsValue]) -> Result<ImportMetaGlobOptions> {
    if args.is_empty() || args.len() > 2 {
        bail!("import.meta.glob() requires 1 or 2 arguments");
    }

    // --- Parse patterns (first argument) ---
    let patterns = match &args[0] {
        JsValue::Constant(crate::analyzer::ConstantValue::Str(s)) => {
            vec![s.as_str().into()]
        }
        JsValue::Array { items, .. } => {
            let mut pats = Vec::with_capacity(items.len());
            for item in items {
                if let Some(s) = item.as_str() {
                    pats.push(s.into());
                } else {
                    bail!("import.meta.glob() pattern array elements must be constant strings");
                }
            }
            if pats.is_empty() {
                bail!("import.meta.glob() requires at least one pattern");
            }
            pats
        }
        _ => {
            bail!(
                "import.meta.glob() first argument must be a string literal or array of string \
                 literals"
            );
        }
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
                                eager = val.as_bool().unwrap_or(false);
                            }
                            Some("import") => {
                                if let Some(s) = val.as_str() {
                                    import = Some(s.into());
                                } else {
                                    bail!(
                                        "import.meta.glob() 'import' option must be a constant \
                                         string"
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
                                } else {
                                    bail!(
                                        "import.meta.glob() 'query' option must be a constant \
                                         string"
                                    );
                                }
                            }
                            Some("base") => {
                                if let Some(s) = val.as_str() {
                                    base = Some(s.into());
                                } else {
                                    bail!(
                                        "import.meta.glob() 'base' option must be a constant \
                                         string"
                                    );
                                }
                            }
                            _ => {
                                // Ignore unknown options for forward compatibility
                            }
                        }
                    }
                }
            }
            _ => {
                bail!("import.meta.glob() second argument must be an object literal");
            }
        }
    }

    Ok(ImportMetaGlobOptions {
        patterns,
        eager,
        import,
        query,
        base,
    })
}

// ---------------------------------------------------------------------------
// Glob pattern → regex conversion
// ---------------------------------------------------------------------------

/// Convert a glob pattern to a regex string.
///
/// Supports: `*`, `**`, `?`, `{a,b}` alternation.
/// Patterns like `./dir/*.js` are converted to `^\./dir/[^/]*\.js$`.
fn glob_to_regex_str(glob: &str) -> String {
    let mut out = String::from("^");
    let chars: Vec<char> = glob.chars().collect();
    let len = chars.len();
    let mut i = 0;
    let mut brace_depth = 0u32;

    while i < len {
        let c = chars[i];
        match c {
            '*' if i + 1 < len && chars[i + 1] == '*' => {
                i += 2;
                // `**/` matches zero or more path segments
                if i < len && chars[i] == '/' {
                    i += 1;
                    out.push_str("(.+/)?");
                } else {
                    // `**` at end matches anything
                    out.push_str(".*");
                }
                continue;
            }
            '*' => out.push_str("[^/]*"),
            '?' => out.push_str("[^/]"),
            '{' => {
                brace_depth += 1;
                out.push('(');
            }
            '}' => {
                brace_depth = brace_depth.saturating_sub(1);
                out.push(')');
            }
            ',' if brace_depth > 0 => out.push('|'),
            '.' | '+' | '^' | '$' | '|' | '(' | ')' | '[' | ']' | '\\' => {
                out.push('\\');
                out.push(c);
            }
            _ => out.push(c),
        }
        i += 1;
    }
    out.push('$');
    out
}

/// Combine multiple positive glob patterns into a single regex string (union).
fn globs_to_regex(patterns: &[RcStr]) -> Result<EsRegex> {
    if patterns.is_empty() {
        bail!("import.meta.glob() requires at least one positive pattern");
    }
    if patterns.len() == 1 {
        return EsRegex::new(&glob_to_regex_str(&patterns[0]), "");
    }
    let parts: Vec<String> = patterns.iter().map(|p| glob_to_regex_str(p)).collect();
    let combined = parts.join("|");
    EsRegex::new(&combined, "")
}

/// Check if a path matches any negative (exclusion) pattern.
fn matches_negative_pattern(path: &str, negative_patterns: &[RcStr]) -> bool {
    for neg in negative_patterns {
        let regex_str = glob_to_regex_str(neg);
        // We need to test the filename or the full path against the pattern.
        // Negative patterns in Vite can be like `!**/bar.js` which should match
        // against the full relative path.
        if let Ok(re) = EsRegex::new(&regex_str, "")
            && re.is_match(path)
        {
            return true;
        }
    }
    false
}

// ---------------------------------------------------------------------------
// ImportMetaGlobMap — the resolved file map
// ---------------------------------------------------------------------------

#[turbo_tasks::value]
#[derive(Debug)]
pub struct ImportMetaGlobMapEntry {
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
    #[turbo_tasks::function]
    pub(crate) async fn generate(
        origin: Vc<Box<dyn ResolveOrigin>>,
        base_dir: FileSystemPath,
        positive_patterns: Vec<RcStr>,
        negative_patterns: Vec<RcStr>,
        query: Option<RcStr>,
        issue_source: Option<IssueSource>,
        error_mode: ResolveErrorMode,
    ) -> Result<Vc<Self>> {
        let origin_path = origin.origin_path().await?.parent();

        // Build a regex that matches any of the positive patterns
        let filter = globs_to_regex(&positive_patterns)?;

        // Read files matching the positive patterns
        let list = &*FlatDirList::read(base_dir.clone(), true, filter.cell()).await?;

        let mut map = FxIndexMap::default();

        for (context_relative, path) in list {
            // Apply negative pattern filtering
            if matches_negative_pattern(context_relative, &negative_patterns) {
                continue;
            }

            // Compute the origin-relative path for import resolution
            let Some(origin_relative) = origin_path.get_relative_path_to(path) else {
                bail!(
                    "import.meta.glob: failed to compute relative path from origin to matched file"
                );
            };

            // Append query string if specified
            let request_str: RcStr = if let Some(q) = &query {
                format!("{origin_relative}{q}").into()
            } else {
                origin_relative.clone()
            };

            let request = Request::parse_string(request_str).to_resolved().await?;

            let result = esm_resolve(
                origin,
                *request,
                EcmaScriptModulesReferenceSubType::DynamicImport,
                error_mode,
                issue_source,
            )
            .await?
            .to_resolved()
            .await?;

            map.insert(
                context_relative.clone(),
                ImportMetaGlobMapEntry {
                    origin_relative,
                    request,
                    result,
                },
            );
        }

        map.sort_keys();

        Ok(Vc::cell(map))
    }
}

// ---------------------------------------------------------------------------
// ImportMetaGlobAsset — the virtual module
// ---------------------------------------------------------------------------

fn modifier(patterns: &[RcStr], eager: bool, import: &Option<RcStr>) -> RcStr {
    let mut s = format!("import.meta.glob {}", patterns.join(", "));
    if eager {
        s.push_str(" eager");
    }
    if let Some(named) = import {
        s.push_str(" import=");
        s.push_str(named);
    }
    s.into()
}

#[turbo_tasks::value]
pub struct ImportMetaGlobAsset {
    source: ResolvedVc<Box<dyn Source>>,
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    map: ResolvedVc<ImportMetaGlobMap>,
    patterns: Vec<RcStr>,
    eager: bool,
    import: Option<RcStr>,
}

#[turbo_tasks::value_impl]
impl Module for ImportMetaGlobAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source
            .ident()
            .with_modifier(modifier(&self.patterns, self.eager, &self.import))
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<turbopack_core::source::OptionSource> {
        Vc::cell(Some(self.source))
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        let map = &*self.map.await?;

        Ok(Vc::cell(
            map.iter()
                .map(|(_, entry)| {
                    ResolvedVc::upcast(ResolvedVc::<ResolvedModuleReference>::cell(entry.result))
                })
                .collect(),
        ))
    }

    #[turbo_tasks::function]
    fn side_effects(self: Vc<Self>) -> Vc<ModuleSideEffects> {
        ModuleSideEffects::SideEffectFree.cell()
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
        &self,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        _module_graph: Vc<ModuleGraph>,
        _async_module_info: Option<Vc<AsyncModuleInfo>>,
        _estimated: bool,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let map = &*self.map.await?;
        let minify = chunking_context.minify_type().await?;

        let mut glob_map = ObjectLit {
            span: DUMMY_SP,
            props: vec![],
        };

        for (key, entry) in map {
            let pm = PatternMapping::resolve_request(
                *entry.request,
                *self.origin,
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
            let value_expr = if self.eager {
                // Eager: direct synchronous require
                let module_expr = pm.create_require(Cow::Borrowed(&key_expr));
                // If `import` option is set, access the named export
                if let Some(named) = &self.import {
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
                if let Some(named) = &self.import {
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
#[derive(Hash, Debug)]
pub struct ImportMetaGlobAssetReference {
    pub inner: ResolvedVc<ImportMetaGlobAsset>,
    pub patterns: Vec<RcStr>,
    pub issue_source: Option<IssueSource>,
    pub error_mode: ResolveErrorMode,
}

impl ImportMetaGlobAssetReference {
    pub async fn new(
        source: ResolvedVc<Box<dyn Source>>,
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        patterns: Vec<RcStr>,
        eager: bool,
        import: Option<RcStr>,
        query: Option<RcStr>,
        base: Option<RcStr>,
        issue_source: Option<IssueSource>,
        error_mode: ResolveErrorMode,
    ) -> Result<Self> {
        // Compute the base directory for glob scanning
        let origin_dir = origin.origin_path().await?.parent();
        let base_dir = if let Some(ref b) = base {
            origin_dir.join(b)?
        } else {
            origin_dir
        };

        // Separate positive and negative patterns
        let (positive_patterns, negative_raw): (Vec<_>, Vec<_>) =
            patterns.iter().partition(|p| !p.starts_with('!'));
        let negative_patterns: Vec<RcStr> = negative_raw
            .into_iter()
            .map(|p| p.strip_prefix('!').unwrap_or(p).into())
            .collect();
        let positive_patterns: Vec<RcStr> = positive_patterns.into_iter().cloned().collect();

        let map = ImportMetaGlobMap::generate(
            *origin,
            base_dir,
            positive_patterns,
            negative_patterns,
            query,
            issue_source,
            error_mode,
        )
        .to_resolved()
        .await?;

        let inner = ImportMetaGlobAsset {
            source,
            origin,
            map,
            patterns: patterns.clone(),
            eager,
            import,
        }
        .resolved_cell();

        Ok(ImportMetaGlobAssetReference {
            inner,
            patterns,
            issue_source,
            error_mode,
        })
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for ImportMetaGlobAssetReference {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(format!("import.meta.glob {}", self.patterns.join(", ")).into())
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
