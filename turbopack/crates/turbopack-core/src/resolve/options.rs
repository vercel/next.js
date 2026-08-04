use std::collections::BTreeMap;
#[cfg(not(feature = "sync"))]
use std::{future::Future, pin::Pin};

use anyhow::{Result, bail};
use bincode::{Decode, Encode};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexSet, NonLocalValue, ResolvedVc, ValueToString, Vc, debug::ValueDebugFormat,
    trace::TraceRawVcs, turbofmt,
};
use turbo_tasks_fs::{FileSystemPath, glob::Glob};

use crate::{
    issue::Issue,
    resolve::{
        AliasPattern, ExternalTraced, ExternalType, ResolveResult, ResolveResultItem,
        alias_map::{AliasMap, AliasMatch, AliasTemplate},
        parse::Request,
        pattern::Pattern,
        plugin::{AfterResolvePlugin, BeforeResolvePlugin},
    },
};

#[turbo_tasks::value(transparent)]
#[derive(Debug)]
pub struct ExcludedExtensions(#[bincode(with = "turbo_bincode::indexset")] pub FxIndexSet<RcStr>);

/// A location where to resolve modules.
#[derive(
    TraceRawVcs, Hash, PartialEq, Eq, Clone, Debug, ValueDebugFormat, NonLocalValue, Encode, Decode,
)]
pub enum ResolveModules {
    /// when inside of path, use the list of directories to
    /// resolve inside these
    Nested(FileSystemPath, Vec<RcStr>),
    /// look into that directory, unless the request has an excluded extension
    Path {
        dir: FileSystemPath,
        excluded_extensions: ResolvedVc<ExcludedExtensions>,
    },
}

#[derive(
    TraceRawVcs, Hash, PartialEq, Eq, Clone, Copy, Debug, NonLocalValue, Encode, Decode, Default,
)]
pub enum ConditionValue {
    Set,
    #[default]
    Unset,
    Unknown,
}

impl From<bool> for ConditionValue {
    fn from(v: bool) -> Self {
        if v {
            ConditionValue::Set
        } else {
            ConditionValue::Unset
        }
    }
}

pub type ResolutionConditions = BTreeMap<RcStr, ConditionValue>;

/// The different ways to resolve a package, as described in package.json.
#[derive(TraceRawVcs, Hash, PartialEq, Eq, Clone, Debug, NonLocalValue, Encode, Decode)]
pub enum ResolveIntoPackage {
    /// Using the [exports] field.
    ///
    /// [exports]: https://nodejs.org/api/packages.html#exports
    ExportsField {
        conditions: ResolutionConditions,
        unspecified_conditions: ConditionValue,
    },
    /// Using a [main]-like field (e.g. [main], [module], [browser], etc.).
    ///
    /// [main]: https://nodejs.org/api/packages.html#main
    /// [module]: https://esbuild.github.io/api/#main-fields
    /// [browser]: https://esbuild.github.io/api/#main-fields
    MainField { field: RcStr },
}

// The different ways to resolve a request within a package
#[derive(TraceRawVcs, Hash, PartialEq, Eq, Clone, Debug, NonLocalValue, Encode, Decode)]
pub enum ResolveInPackage {
    /// Using a alias field which allows to map requests
    AliasField(RcStr),
    /// Using the [imports] field.
    ///
    /// [imports]: https://nodejs.org/api/packages.html#imports
    ImportsField {
        conditions: ResolutionConditions,
        unspecified_conditions: ConditionValue,
    },
}

#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub enum ImportMapping {
    /// If specified, the optional name overrides the request, importing that external instead.
    External(Option<RcStr>, ExternalType, ExternalTraced),
    /// Try to make the request external if it is is resolvable from the specified
    /// directory, and fall back to resolving the original request if it fails.
    ///
    /// If specified, the optional name overrides the request, importing that external instead.
    PrimaryAlternativeExternal {
        name: Option<RcStr>,
        ty: ExternalType,
        traced: ExternalTraced,
        lookup_dir: FileSystemPath,
    },
    /// An already resolved result that will be returned directly.
    Direct(ResolvedVc<ResolveResult>),
    /// A request alias that will be resolved first, and fall back to resolving
    /// the original request if it fails. Useful for the tsconfig.json
    /// `compilerOptions.paths` option and Next aliases.
    PrimaryAlternative(RcStr, Option<FileSystemPath>),
    /// See [`ResolveResultItem::Ignore`]
    Ignore,
    /// See [`ResolveResultItem::Empty`]
    Empty,
    /// See [`ResolveResultItem::Error`]
    Error(ResolvedVc<Box<dyn Issue>>),
    Alternatives(Vec<ResolvedVc<ImportMapping>>),
    Dynamic(ResolvedVc<Box<dyn ImportMappingReplacement>>),
}

/// An `ImportMapping` that was applied to a pattern. See `ImportMapping` for
/// more details on the variants.
#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub enum ReplacedImportMapping {
    External {
        name_override: Option<RcStr>,
        ty: ExternalType,
        traced: ExternalTraced,
        target: Option<FileSystemPath>,
    },
    PrimaryAlternativeExternal {
        name: Option<RcStr>,
        ty: ExternalType,
        traced: ExternalTraced,
        lookup_dir: FileSystemPath,
    },
    Direct(ResolvedVc<ResolveResult>),
    PrimaryAlternative(Pattern, Option<FileSystemPath>),
    Ignore,
    Empty,
    Alternatives(Vec<ResolvedVc<ReplacedImportMapping>>),
    Dynamic(ResolvedVc<Box<dyn ImportMappingReplacement>>),
    Error(ResolvedVc<Box<dyn Issue>>),
}

impl ImportMapping {
    pub fn primary_alternatives(
        list: Vec<RcStr>,
        lookup_path: Option<FileSystemPath>,
    ) -> ImportMapping {
        if list.is_empty() {
            ImportMapping::Ignore
        } else if list.len() == 1 {
            ImportMapping::PrimaryAlternative(list.into_iter().next().unwrap(), lookup_path)
        } else {
            ImportMapping::Alternatives(
                list.into_iter()
                    .map(|s| {
                        ImportMapping::PrimaryAlternative(s, lookup_path.clone()).resolved_cell()
                    })
                    .collect(),
            )
        }
    }
}

impl AliasTemplate for ResolvedVc<ImportMapping> {
    type Output<'a> = <Vc<ImportMapping> as AliasTemplate>::Output<'a>;

    fn convert(&self) -> Self::Output<'_> {
        (**self).convert()
    }

    fn replace<'a>(&'a self, capture: &Pattern) -> Self::Output<'a> {
        (**self).replace(capture)
    }
}

/// In the async build the [`AliasTemplate`] output is a boxed future; under `sync`
/// it is the computed result itself. Both delegate to the dual-mode
/// [`import_mapping_convert`]/[`import_mapping_replace`] helpers below.
#[cfg(not(feature = "sync"))]
impl AliasTemplate for Vc<ImportMapping> {
    type Output<'a> =
        Pin<Box<dyn Future<Output = Result<ResolvedVc<ReplacedImportMapping>>> + Send + 'a>>;

    fn convert(&self) -> Self::Output<'_> {
        Box::pin(import_mapping_convert(*self))
    }

    fn replace<'a>(&'a self, capture: &Pattern) -> Self::Output<'a> {
        Box::pin(import_mapping_replace(*self, capture.clone()))
    }
}

/// See the async impl above.
#[cfg(feature = "sync")]
impl AliasTemplate for Vc<ImportMapping> {
    type Output<'a> = Result<ResolvedVc<ReplacedImportMapping>>;

    fn convert(&self) -> Self::Output<'_> {
        import_mapping_convert(*self)
    }

    fn replace<'a>(&'a self, capture: &Pattern) -> Self::Output<'a> {
        import_mapping_replace(*self, capture.clone())
    }
}

turbo_tasks::dual_fn! {
/// Body of `<Vc<ImportMapping> as AliasTemplate>::convert`.
fn import_mapping_convert(mapping: Vc<ImportMapping>) -> Result<ResolvedVc<ReplacedImportMapping>> {
    let this = &*turbo_tasks::read!(mapping)?;
    Ok(match this {
        ImportMapping::External(name, ty, traced) => ReplacedImportMapping::External {
            name_override: name.clone(),
            ty: *ty,
            traced: *traced,
            // TODO
            target: None,
        },
        ImportMapping::PrimaryAlternativeExternal {
            name,
            ty,
            traced,
            lookup_dir,
        } => ReplacedImportMapping::PrimaryAlternativeExternal {
            name: name.clone(),
            ty: *ty,
            traced: *traced,
            lookup_dir: lookup_dir.clone(),
        },
        ImportMapping::PrimaryAlternative(name, lookup_dir) => {
            ReplacedImportMapping::PrimaryAlternative(
                (*name).clone().into(),
                lookup_dir.clone(),
            )
        }
        ImportMapping::Direct(v) => ReplacedImportMapping::Direct(*v),
        ImportMapping::Ignore => ReplacedImportMapping::Ignore,
        ImportMapping::Empty => ReplacedImportMapping::Empty,
        ImportMapping::Alternatives(alternatives) => ReplacedImportMapping::Alternatives({
            // Sequential in both modes: alternatives lists are small and the
            // `AliasTemplate` output cannot fan out through `parallel!` under sync.
            let mut converted = Vec::with_capacity(alternatives.len());
            for mapping in alternatives.iter() {
                converted.push(turbo_tasks::read!(mapping.convert())?);
            }
            converted
        }),
        ImportMapping::Dynamic(replacement) => ReplacedImportMapping::Dynamic(*replacement),
        ImportMapping::Error(issue) => ReplacedImportMapping::Error(*issue),
    }
    .resolved_cell())
}
}

turbo_tasks::dual_fn! {
/// Body of `<Vc<ImportMapping> as AliasTemplate>::replace`.
fn import_mapping_replace(
    mapping: Vc<ImportMapping>,
    capture: Pattern,
) -> Result<ResolvedVc<ReplacedImportMapping>> {
    let this = &*turbo_tasks::read!(mapping)?;
    Ok(match this {
        ImportMapping::External(name, ty, traced) => {
            if let Some(name) = name {
                ReplacedImportMapping::External {
                    name_override: capture
                        .spread_into_star(name)
                        .as_constant_string()
                        .cloned(),
                    ty: *ty,
                    traced: *traced,
                    target: None,
                }
            } else {
                ReplacedImportMapping::External {
                    name_override: None,
                    ty: *ty,
                    traced: *traced,
                    target: None,
                }
            }
        }
        ImportMapping::PrimaryAlternativeExternal {
            name,
            ty,
            traced,
            lookup_dir,
        } => {
            if let Some(name) = name {
                ReplacedImportMapping::PrimaryAlternativeExternal {
                    name: capture.spread_into_star(name).as_constant_string().cloned(),
                    ty: *ty,
                    traced: *traced,
                    lookup_dir: lookup_dir.clone(),
                }
            } else {
                ReplacedImportMapping::PrimaryAlternativeExternal {
                    name: None,
                    ty: *ty,
                    traced: *traced,
                    lookup_dir: lookup_dir.clone(),
                }
            }
        }
        ImportMapping::PrimaryAlternative(name, lookup_dir) => {
            ReplacedImportMapping::PrimaryAlternative(
                capture.spread_into_star(name),
                lookup_dir.clone(),
            )
        }
        ImportMapping::Direct(v) => ReplacedImportMapping::Direct(*v),
        ImportMapping::Ignore => ReplacedImportMapping::Ignore,
        ImportMapping::Empty => ReplacedImportMapping::Empty,
        ImportMapping::Alternatives(alternatives) => ReplacedImportMapping::Alternatives({
            // Sequential in both modes (see `import_mapping_convert`).
            let mut replaced = Vec::with_capacity(alternatives.len());
            for mapping in alternatives.iter() {
                replaced.push(turbo_tasks::read!(mapping.replace(&capture))?);
            }
            replaced
        }),
        ImportMapping::Dynamic(replacement) => {
            turbo_tasks::read!(replacement
                .replace(Pattern::new(capture.clone()))
                .owned())?
        }
        ImportMapping::Error(issue) => ReplacedImportMapping::Error(*issue),
    }
    .resolved_cell())
}
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Default)]
pub struct ImportMap {
    map: AliasMap<ResolvedVc<ImportMapping>>,
}

impl ImportMap {
    /// Creates a new import map.
    pub fn new(map: AliasMap<ResolvedVc<ImportMapping>>) -> ImportMap {
        Self { map }
    }

    /// Creates a new empty import map.
    pub fn empty() -> Self {
        Self::default()
    }

    /// Extends the import map with another import map.
    pub fn extend_ref(&mut self, other: &ImportMap) {
        let Self { map } = other.clone();
        self.map.extend(map);
    }

    /// Inserts an alias into the import map.
    pub fn insert_alias(&mut self, alias: AliasPattern, mapping: ResolvedVc<ImportMapping>) {
        self.map.insert(alias, mapping);
    }

    /// Inserts an exact alias into the import map.
    pub fn insert_exact_alias<'a>(
        &mut self,
        pattern: impl Into<RcStr> + 'a,
        mapping: ResolvedVc<ImportMapping>,
    ) {
        self.map.insert(AliasPattern::exact(pattern), mapping);
    }

    /// Inserts a wildcard alias into the import map.
    pub fn insert_wildcard_alias<'a>(
        &mut self,
        prefix: impl Into<RcStr> + 'a,
        mapping: ResolvedVc<ImportMapping>,
    ) {
        self.map
            .insert(AliasPattern::wildcard(prefix, rcstr!("")), mapping);
    }

    /// Inserts a wildcard alias with suffix into the import map.
    pub fn insert_wildcard_alias_with_suffix<'p, 's>(
        &mut self,
        prefix: impl Into<RcStr> + 'p,
        suffix: impl Into<RcStr> + 's,
        mapping: ResolvedVc<ImportMapping>,
    ) {
        self.map
            .insert(AliasPattern::wildcard(prefix, suffix), mapping);
    }

    /// Inserts an alias that resolves an prefix always from a certain location
    /// to create a singleton.
    pub fn insert_singleton_alias<'a>(
        &mut self,
        prefix: impl Into<RcStr> + 'a,
        context_path: FileSystemPath,
    ) {
        let prefix: RcStr = prefix.into();
        let wildcard_prefix: RcStr = (prefix.to_string() + "/").into();
        let wildcard_alias: RcStr = (prefix.to_string() + "/*").into();
        self.insert_exact_alias(
            prefix.clone(),
            ImportMapping::PrimaryAlternative(prefix.clone(), Some(context_path.clone()))
                .resolved_cell(),
        );
        self.insert_wildcard_alias(
            wildcard_prefix,
            ImportMapping::PrimaryAlternative(wildcard_alias, Some(context_path)).resolved_cell(),
        );
    }
}

#[turbo_tasks::value_impl]
impl ImportMap {
    /// Extends the underlying [ImportMap] with another [ImportMap].
    #[turbo_tasks::function]
    pub async fn extend(self: Vc<Self>, other: ResolvedVc<ImportMap>) -> Result<Vc<Self>> {
        let mut import_map = turbo_tasks::read!(self.owned())?;
        import_map.extend_ref(&*turbo_tasks::read!(other)?);
        Ok(import_map.cell())
    }
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Default)]
pub struct ResolvedMap {
    pub by_glob: Vec<(FileSystemPath, ResolvedVc<Glob>, ResolvedVc<ImportMapping>)>,
}

#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub enum ImportMapResult {
    Result(ResolvedVc<ResolveResult>),
    External {
        name: RcStr,
        ty: ExternalType,
        traced: ExternalTraced,
        target: Option<FileSystemPath>,
    },
    AliasExternal {
        name: RcStr,
        ty: ExternalType,
        traced: ExternalTraced,
        lookup_dir: FileSystemPath,
    },
    Alias(ResolvedVc<Request>, Option<FileSystemPath>),
    Alternatives(Vec<ImportMapResult>),
    NoEntry,
    Error(ResolvedVc<Box<dyn Issue>>),
}

turbo_tasks::dual_fn! {
fn import_mapping_to_result(
    mapping: Vc<ReplacedImportMapping>,
    lookup_path: FileSystemPath,
    request: Vc<Request>,
) -> Result<ImportMapResult> {
    Ok(match &*turbo_tasks::read!(mapping)? {
        ReplacedImportMapping::Direct(result) => ImportMapResult::Result(*result),
        ReplacedImportMapping::External {
            name_override,
            ty,
            traced,
            target,
        } => ImportMapResult::External {
            name: if let Some(name) = name_override {
                name.clone()
            } else if let Some(request) = turbo_tasks::read!(request)?.request() {
                request
            } else {
                bail!(
                    "Cannot resolve external reference with dynamic request {:?}",
                    turbo_tasks::read!(request.request_pattern())?.describe_as_string()
                )
            },
            ty: *ty,
            traced: *traced,
            target: target.clone(),
        },
        ReplacedImportMapping::PrimaryAlternativeExternal {
            name,
            ty,
            traced,
            lookup_dir,
        } => ImportMapResult::AliasExternal {
            name: if let Some(name) = name {
                name.clone()
            } else if let Some(request) = turbo_tasks::read!(request)?.request() {
                request
            } else {
                bail!(
                    "Cannot resolve external reference with dynamic request {:?}",
                    turbo_tasks::read!(request.request_pattern())?.describe_as_string()
                )
            },
            ty: *ty,
            traced: *traced,
            lookup_dir: lookup_dir.clone(),
        },
        ReplacedImportMapping::Ignore => ImportMapResult::Result(
            ResolveResult::primary(ResolveResultItem::Ignore).resolved_cell(),
        ),
        ReplacedImportMapping::Empty => ImportMapResult::Result(
            ResolveResult::primary(ResolveResultItem::Empty).resolved_cell(),
        ),
        ReplacedImportMapping::PrimaryAlternative(name, context) => {
            let request = turbo_tasks::read!(Request::parse(name.clone()).to_resolved())?;
            ImportMapResult::Alias(request, context.clone())
        }
        ReplacedImportMapping::Alternatives(list) => ImportMapResult::Alternatives({
            // Sequential in both modes: alternatives lists are small and the recursive
            // dual helper cannot fan out through `parallel!` under sync. The async
            // build must box the recursive call (async fns cannot recurse unboxed);
            // under `sync` it is a plain recursive call.
            let mut results = Vec::with_capacity(list.len());
            for mapping in list.iter() {
                #[cfg(not(feature = "sync"))]
                results.push(
                    Box::pin(import_mapping_to_result(
                        **mapping,
                        lookup_path.clone(),
                        request,
                    ))
                    .await?,
                );
                #[cfg(feature = "sync")]
                results.push(import_mapping_to_result(
                    **mapping,
                    lookup_path.clone(),
                    request,
                )?);
            }
            results
        }),
        ReplacedImportMapping::Dynamic(replacement) => {
            turbo_tasks::read!(replacement.result(lookup_path, request).owned())?
        }
        ReplacedImportMapping::Error(issue) => ImportMapResult::Error(*issue),
    })
}
}

#[turbo_tasks::value_impl]
impl ValueToString for ImportMapResult {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        match self {
            ImportMapResult::Result(_) => Ok(Vc::cell(rcstr!("Resolved by import map"))),
            ImportMapResult::External { .. } => Ok(Vc::cell(rcstr!("TODO external"))),
            ImportMapResult::AliasExternal { .. } => Ok(Vc::cell(rcstr!("TODO external"))),
            ImportMapResult::Alias(request, context) => {
                let s = if let Some(path) = context {
                    turbo_tasks::read!(turbofmt!("aliased to {} inside of {path}", *request))?
                } else {
                    turbo_tasks::read!(turbofmt!("aliased to {}", *request))?
                };
                Ok(Vc::cell(s))
            }
            ImportMapResult::Alternatives(alternatives) => {
                // The .cell() calls happen synchronously during iteration, before try_join()
                // runs the futures. This is safe because cells are created in deterministic
                // order (the order of alternatives in the Vec).
                let strings = turbo_tasks::parallel!(
                    alternatives
                        .iter()
                        .map(|alternative| alternative.clone().cell().to_string())
                )?;
                let strings = strings
                    .iter()
                    .map(|string| string.as_str())
                    .collect::<Vec<_>>();
                Ok(Vc::cell(strings.join(" | ").into()))
            }
            ImportMapResult::NoEntry => Ok(Vc::cell(rcstr!("No import map entry"))),
            ImportMapResult::Error(issue) => Ok(Vc::cell(
                format!(
                    "error: {}",
                    turbo_tasks::read!(turbo_tasks::read!(issue.into_trait_ref())?.title())?
                        .to_unstyled_string()
                )
                .into(),
            )),
        }
    }
}

turbo_tasks::dual_fn! {
/// Per-match step of [`ImportMap::lookup`]: applies the alias template output and
/// converts it into an [`ImportMapResult`].
fn import_map_result_from_lookup(
    result: Result<AliasMatch<'_, ResolvedVc<ImportMapping>>>,
    lookup_path: FileSystemPath,
    request: Vc<Request>,
) -> Result<ImportMapResult> {
    let mapping = turbo_tasks::read!(result?.output)?;
    turbo_tasks::read!(import_mapping_to_result(*mapping, lookup_path, request))
}
}

impl ImportMap {
    turbo_tasks::dual_fn! {
    // Not a turbo-tasks function: the map lookup should be cheaper than the cache
    // lookup
    pub fn lookup(
        &self,
        lookup_path: FileSystemPath,
        request: Vc<Request>,
    ) -> Result<ImportMapResult> {
        // relative requests must not match global wildcard aliases.

        let request_pattern = turbo_tasks::read!(request.request_pattern())?;
        if matches!(*request_pattern, Pattern::Dynamic | Pattern::DynamicNoSlash) {
            // You could probably conceive of cases where this isn't correct. But the dynamic will
            // just match every single entry in the import map, which is not what we want.
            return Ok(ImportMapResult::NoEntry);
        }

        let (req_rel, rest) = request_pattern.split_could_match("./");
        let (req_rel_parent, req_rest) =
            rest.map(|r| r.split_could_match("../")).unwrap_or_default();

        let lookup_rel = req_rel.as_ref().and_then(|req| {
            self.map
                .lookup_with_prefix_predicate(req, |prefix| prefix.starts_with("./"))
                .next()
        });
        let lookup_rel_parent = req_rel_parent.as_ref().and_then(|req| {
            self.map
                .lookup_with_prefix_predicate(req, |prefix| prefix.starts_with("../"))
                .next()
        });
        let lookup = req_rest
            .as_ref()
            .and_then(|req| self.map.lookup(req).next());

        // Sequential in both modes: at most three matches, and the per-match dual
        // helper cannot fan out through `parallel!` under sync.
        let mut results = Vec::new();
        for result in lookup_rel.into_iter().chain(lookup_rel_parent).chain(lookup) {
            results.push(turbo_tasks::read!(import_map_result_from_lookup(
                result,
                lookup_path.clone(),
                request
            ))?);
        }

        Ok(match results.len() {
            0 => ImportMapResult::NoEntry,
            1 => results.into_iter().next().unwrap(),
            2.. => ImportMapResult::Alternatives(results),
        })
    }
    }
}

#[turbo_tasks::value_impl]
impl ResolvedMap {
    #[turbo_tasks::function]
    pub async fn lookup(
        &self,
        resolved: FileSystemPath,
        lookup_path: FileSystemPath,
        request: Vc<Request>,
    ) -> Result<Vc<ImportMapResult>> {
        for (root, glob, mapping) in self.by_glob.iter() {
            if let Some(path) = root.get_path_to(&resolved)
                && turbo_tasks::read!(glob)?.matches(path)
            {
                return Ok(turbo_tasks::read!(import_mapping_to_result(
                    *turbo_tasks::read!(mapping.convert())?,
                    lookup_path,
                    request,
                ))?
                .cell());
            }
        }
        Ok(ImportMapResult::NoEntry.cell())
    }
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug, Default)]
pub struct ResolveOptions {
    /// When set, do not apply extensions and default_files for relative
    /// request. But they are still applied for resolving into packages.
    pub fully_specified: bool,
    /// When set, when resolving a module request, try to resolve it as relative
    /// request first.
    pub prefer_relative: bool,
    /// The extensions that should be added to a request when resolving.
    pub extensions: Vec<RcStr>,
    /// The locations where to resolve modules.
    pub modules: Vec<ResolveModules>,
    /// How to resolve packages.
    pub into_package: Vec<ResolveIntoPackage>,
    /// How to resolve in packages.
    pub in_package: Vec<ResolveInPackage>,
    /// The default files to resolve in a folder.
    pub default_files: Vec<RcStr>,
    /// An import map to use before resolving a request.
    pub import_map: Option<ResolvedVc<ImportMap>>,
    /// An import map to use when a request is otherwise unresolvable.
    pub fallback_import_map: Option<ResolvedVc<ImportMap>>,
    pub resolved_map: Option<ResolvedVc<ResolvedMap>>,
    pub before_resolve_plugins: Vec<ResolvedVc<Box<dyn BeforeResolvePlugin>>>,
    pub after_resolve_plugins: Vec<ResolvedVc<Box<dyn AfterResolvePlugin>>>,
    /// Support resolving *.js requests to *.ts files
    pub enable_typescript_with_output_extension: bool,
    /// Warn instead of error for resolve errors
    pub loose_errors: bool,
    /// Collect affecting sources for each resolve result.  Useful for tracing.
    pub collect_affecting_sources: bool,
    /// Whether to parse data URIs into modules (as opposed to keeping them as externals)
    pub parse_data_uris: bool,

    pub placeholder_for_future_extensions: (),
}

#[turbo_tasks::value_impl]
impl ResolveOptions {
    /// Returns a new `Vc<ResolveOptions>` with its import map extended to include the given import
    /// map.
    #[turbo_tasks::function]
    pub async fn with_extended_import_map(
        self: Vc<Self>,
        import_map: Vc<ImportMap>,
    ) -> Result<Vc<Self>> {
        let mut resolve_options = turbo_tasks::read!(self.owned())?;
        resolve_options.import_map = Some(turbo_tasks::read!(
            resolve_options
                .import_map
                .map(|current_import_map| current_import_map.extend(import_map))
                .unwrap_or(import_map)
                .to_resolved()
        )?);
        Ok(resolve_options.cell())
    }

    /// Returns a new `Vc<ResolveOptions>` with its fallback import map extended to include the
    /// given import map.
    #[turbo_tasks::function]
    pub async fn with_extended_fallback_import_map(
        self: Vc<Self>,
        extended_import_map: ResolvedVc<ImportMap>,
    ) -> Result<Vc<Self>> {
        let mut resolve_options = turbo_tasks::read!(self.owned())?;
        resolve_options.fallback_import_map =
            if let Some(current_fallback) = resolve_options.fallback_import_map {
                Some(turbo_tasks::read!(
                    current_fallback.extend(*extended_import_map).to_resolved()
                )?)
            } else {
                Some(extended_import_map)
            };
        Ok(resolve_options.cell())
    }

    /// Overrides the extensions used for resolving
    #[turbo_tasks::function]
    pub async fn with_extensions(self: Vc<Self>, extensions: Vec<RcStr>) -> Result<Vc<Self>> {
        let mut resolve_options = turbo_tasks::read!(self.owned())?;
        resolve_options.extensions = extensions;
        Ok(resolve_options.cell())
    }

    /// Overrides the fully_specified flag for resolving
    #[turbo_tasks::function]
    pub async fn with_fully_specified(self: Vc<Self>, fully_specified: bool) -> Result<Vc<Self>> {
        let mut resolve_options = turbo_tasks::read!(self.owned())?;
        if resolve_options.fully_specified == fully_specified {
            return Ok(self);
        }
        resolve_options.fully_specified = fully_specified;
        Ok(resolve_options.cell())
    }
}

#[turbo_tasks::value(shared)]
#[derive(Hash, Clone, Debug)]
pub struct ResolveModulesOptions {
    pub modules: Vec<ResolveModules>,
    pub extensions: Vec<RcStr>,
}

#[turbo_tasks::function]
pub async fn resolve_modules_options(
    options: Vc<ResolveOptions>,
) -> Result<Vc<ResolveModulesOptions>> {
    let options = turbo_tasks::read!(options)?;
    Ok(ResolveModulesOptions {
        modules: options.modules.clone(),
        extensions: options.extensions.clone(),
    }
    .cell())
}

#[turbo_tasks::value_trait]
pub trait ImportMappingReplacement {
    #[turbo_tasks::function]
    fn replace(self: Vc<Self>, capture: Vc<Pattern>) -> Vc<ReplacedImportMapping>;
    #[turbo_tasks::function]
    fn result(
        self: Vc<Self>,
        lookup_path: FileSystemPath,
        request: Vc<Request>,
    ) -> Vc<ImportMapResult>;
}
