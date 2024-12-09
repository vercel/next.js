use std::{collections::BTreeMap, future::Future, pin::Pin};

use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, FxIndexSet, ResolvedVc, TryJoinIterExt, Value,
    ValueToString, Vc,
};
use turbo_tasks_fs::{glob::Glob, FileSystemPath};

use super::{
    alias_map::{AliasMap, AliasTemplate},
    pattern::Pattern,
    plugin::BeforeResolvePlugin,
    AliasPattern, ExternalType, ResolveResult, ResolveResultItem,
};
use crate::resolve::{parse::Request, plugin::AfterResolvePlugin, ExternalTraced};

#[turbo_tasks::value(shared)]
#[derive(Hash, Debug)]
pub struct LockedVersions {}

#[turbo_tasks::value(transparent)]
#[derive(Debug)]
pub struct ExcludedExtensions(pub FxIndexSet<RcStr>);

/// A location where to resolve modules.
#[derive(
    TraceRawVcs, Hash, PartialEq, Eq, Clone, Debug, Serialize, Deserialize, ValueDebugFormat,
)]
pub enum ResolveModules {
    /// when inside of path, use the list of directories to
    /// resolve inside these
    Nested(ResolvedVc<FileSystemPath>, Vec<RcStr>),
    /// look into that directory, unless the request has an excluded extension
    Path {
        dir: ResolvedVc<FileSystemPath>,
        excluded_extensions: ResolvedVc<ExcludedExtensions>,
    },
}

#[derive(TraceRawVcs, Hash, PartialEq, Eq, Clone, Copy, Debug, Serialize, Deserialize)]
pub enum ConditionValue {
    Set,
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
#[derive(TraceRawVcs, Hash, PartialEq, Eq, Clone, Debug, Serialize, Deserialize)]
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

// The different ways to resolve a request withing a package
#[derive(TraceRawVcs, Hash, PartialEq, Eq, Clone, Debug, Serialize, Deserialize)]
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
        lookup_dir: ResolvedVc<FileSystemPath>,
    },
    /// An already resolved result that will be returned directly.
    Direct(ResolvedVc<ResolveResult>),
    /// A request alias that will be resolved first, and fall back to resolving
    /// the original request if it fails. Useful for the tsconfig.json
    /// `compilerOptions.paths` option and Next aliases.
    PrimaryAlternative(RcStr, Option<ResolvedVc<FileSystemPath>>),
    Ignore,
    Empty,
    Alternatives(Vec<ResolvedVc<ImportMapping>>),
    Dynamic(ResolvedVc<Box<dyn ImportMappingReplacement>>),
}

/// An `ImportMapping` that was applied to a pattern. See `ImportMapping` for
/// more details on the variants.
#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub enum ReplacedImportMapping {
    External(Option<RcStr>, ExternalType, ExternalTraced),
    PrimaryAlternativeExternal {
        name: Option<RcStr>,
        ty: ExternalType,
        traced: ExternalTraced,
        lookup_dir: ResolvedVc<FileSystemPath>,
    },
    Direct(ResolvedVc<ResolveResult>),
    PrimaryAlternative(Pattern, Option<ResolvedVc<FileSystemPath>>),
    Ignore,
    Empty,
    Alternatives(Vec<ResolvedVc<ReplacedImportMapping>>),
    Dynamic(ResolvedVc<Box<dyn ImportMappingReplacement>>),
}

impl ImportMapping {
    pub fn primary_alternatives(
        list: Vec<RcStr>,
        lookup_path: Option<ResolvedVc<FileSystemPath>>,
    ) -> ImportMapping {
        if list.is_empty() {
            ImportMapping::Ignore
        } else if list.len() == 1 {
            ImportMapping::PrimaryAlternative(list.into_iter().next().unwrap(), lookup_path)
        } else {
            ImportMapping::Alternatives(
                list.into_iter()
                    .map(|s| ImportMapping::PrimaryAlternative(s, lookup_path).resolved_cell())
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

impl AliasTemplate for Vc<ImportMapping> {
    type Output<'a> =
        Pin<Box<dyn Future<Output = Result<ResolvedVc<ReplacedImportMapping>>> + Send + 'a>>;

    fn convert(&self) -> Self::Output<'_> {
        Box::pin(async move {
            let this = &*self.await?;
            Ok(match this {
                ImportMapping::External(name, ty, traced) => {
                    ReplacedImportMapping::External(name.clone(), *ty, *traced)
                }
                ImportMapping::PrimaryAlternativeExternal {
                    name,
                    ty,
                    traced,
                    lookup_dir,
                } => ReplacedImportMapping::PrimaryAlternativeExternal {
                    name: name.clone(),
                    ty: *ty,
                    traced: *traced,
                    lookup_dir: *lookup_dir,
                },
                ImportMapping::PrimaryAlternative(name, lookup_dir) => {
                    ReplacedImportMapping::PrimaryAlternative((*name).clone().into(), *lookup_dir)
                }
                ImportMapping::Direct(v) => ReplacedImportMapping::Direct(*v),
                ImportMapping::Ignore => ReplacedImportMapping::Ignore,
                ImportMapping::Empty => ReplacedImportMapping::Empty,
                ImportMapping::Alternatives(alternatives) => ReplacedImportMapping::Alternatives(
                    alternatives
                        .iter()
                        .map(|mapping| mapping.convert())
                        .try_join()
                        .await?,
                ),
                ImportMapping::Dynamic(replacement) => ReplacedImportMapping::Dynamic(*replacement),
            }
            .resolved_cell())
        })
    }

    fn replace<'a>(&'a self, capture: &Pattern) -> Self::Output<'a> {
        let capture = capture.clone();
        Box::pin(async move {
            let this = &*self.await?;
            Ok(match this {
                ImportMapping::External(name, ty, traced) => {
                    if let Some(name) = name {
                        ReplacedImportMapping::External(
                            capture.spread_into_star(name).as_string().map(|s| s.into()),
                            *ty,
                            *traced,
                        )
                    } else {
                        ReplacedImportMapping::External(None, *ty, *traced)
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
                            name: capture.spread_into_star(name).as_string().map(|s| s.into()),
                            ty: *ty,
                            traced: *traced,
                            lookup_dir: *lookup_dir,
                        }
                    } else {
                        ReplacedImportMapping::PrimaryAlternativeExternal {
                            name: None,
                            ty: *ty,
                            traced: *traced,
                            lookup_dir: *lookup_dir,
                        }
                    }
                }
                ImportMapping::PrimaryAlternative(name, lookup_dir) => {
                    ReplacedImportMapping::PrimaryAlternative(
                        capture.spread_into_star(name),
                        *lookup_dir,
                    )
                }
                ImportMapping::Direct(v) => ReplacedImportMapping::Direct(*v),
                ImportMapping::Ignore => ReplacedImportMapping::Ignore,
                ImportMapping::Empty => ReplacedImportMapping::Empty,
                ImportMapping::Alternatives(alternatives) => ReplacedImportMapping::Alternatives(
                    alternatives
                        .iter()
                        .map(|mapping| mapping.replace(&capture))
                        .try_join()
                        .await?,
                ),
                ImportMapping::Dynamic(replacement) => {
                    (*replacement.replace(capture.clone().cell()).await?).clone()
                }
            }
            .resolved_cell())
        })
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
        self.map.insert(AliasPattern::wildcard(prefix, ""), mapping);
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
        context_path: ResolvedVc<FileSystemPath>,
    ) {
        let prefix: RcStr = prefix.into();
        let wildcard_prefix: RcStr = (prefix.to_string() + "/").into();
        let wildcard_alias: RcStr = (prefix.to_string() + "/*").into();
        self.insert_exact_alias(
            prefix.clone(),
            ImportMapping::PrimaryAlternative(prefix.clone(), Some(context_path)).resolved_cell(),
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
        let mut import_map = self.await?.clone_value();
        import_map.extend_ref(&*other.await?);
        Ok(import_map.cell())
    }
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Default)]
pub struct ResolvedMap {
    pub by_glob: Vec<(
        ResolvedVc<FileSystemPath>,
        ResolvedVc<Glob>,
        ResolvedVc<ImportMapping>,
    )>,
}

#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub enum ImportMapResult {
    Result(ResolvedVc<ResolveResult>),
    External(RcStr, ExternalType, ExternalTraced),
    AliasExternal {
        name: RcStr,
        ty: ExternalType,
        traced: ExternalTraced,
        lookup_dir: ResolvedVc<FileSystemPath>,
    },
    Alias(ResolvedVc<Request>, Option<ResolvedVc<FileSystemPath>>),
    Alternatives(Vec<ImportMapResult>),
    NoEntry,
}

async fn import_mapping_to_result(
    mapping: Vc<ReplacedImportMapping>,
    lookup_path: Vc<FileSystemPath>,
    request: Vc<Request>,
) -> Result<ImportMapResult> {
    Ok(match &*mapping.await? {
        ReplacedImportMapping::Direct(result) => ImportMapResult::Result(*result),
        ReplacedImportMapping::External(name, ty, traced) => ImportMapResult::External(
            if let Some(name) = name {
                name.clone()
            } else if let Some(request) = request.await?.request() {
                request
            } else {
                bail!("Cannot resolve external reference without request")
            },
            *ty,
            *traced,
        ),
        ReplacedImportMapping::PrimaryAlternativeExternal {
            name,
            ty,
            traced,
            lookup_dir,
        } => ImportMapResult::AliasExternal {
            name: if let Some(name) = name {
                name.clone()
            } else if let Some(request) = request.await?.request() {
                request
            } else {
                bail!("Cannot resolve external reference without request")
            },
            ty: *ty,
            traced: *traced,
            lookup_dir: *lookup_dir,
        },
        ReplacedImportMapping::Ignore => ImportMapResult::Result(
            ResolveResult::primary(ResolveResultItem::Ignore).resolved_cell(),
        ),
        ReplacedImportMapping::Empty => ImportMapResult::Result(
            ResolveResult::primary(ResolveResultItem::Empty).resolved_cell(),
        ),
        ReplacedImportMapping::PrimaryAlternative(name, context) => {
            let request = Request::parse(Value::new(name.clone()))
                .to_resolved()
                .await?;
            ImportMapResult::Alias(request, *context)
        }
        ReplacedImportMapping::Alternatives(list) => ImportMapResult::Alternatives(
            list.iter()
                .map(|mapping| Box::pin(import_mapping_to_result(**mapping, lookup_path, request)))
                .try_join()
                .await?,
        ),
        ReplacedImportMapping::Dynamic(replacement) => replacement
            .result(lookup_path, request)
            .await?
            .clone_value(),
    })
}

#[turbo_tasks::value_impl]
impl ValueToString for ImportMapResult {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        match self {
            ImportMapResult::Result(_) => Ok(Vc::cell("Resolved by import map".into())),
            ImportMapResult::External(_, _, _) => Ok(Vc::cell("TODO external".into())),
            ImportMapResult::AliasExternal { .. } => Ok(Vc::cell("TODO external".into())),
            ImportMapResult::Alias(request, context) => {
                let s = if let Some(path) = context {
                    let path = path.to_string().await?;
                    format!(
                        "aliased to {} inside of {}",
                        request.to_string().await?,
                        path
                    )
                } else {
                    format!("aliased to {}", request.to_string().await?)
                };
                Ok(Vc::cell(s.into()))
            }
            ImportMapResult::Alternatives(alternatives) => {
                let strings = alternatives
                    .iter()
                    .map(|alternative| alternative.clone().cell().to_string())
                    .try_join()
                    .await?;
                let strings = strings
                    .iter()
                    .map(|string| string.as_str())
                    .collect::<Vec<_>>();
                Ok(Vc::cell(strings.join(" | ").into()))
            }
            ImportMapResult::NoEntry => Ok(Vc::cell("No import map entry".into())),
        }
    }
}

impl ImportMap {
    // Not a turbo-tasks function: the map lookup should be cheaper than the cache
    // lookup
    pub async fn lookup(
        &self,
        lookup_path: Vc<FileSystemPath>,
        request: Vc<Request>,
    ) -> Result<ImportMapResult> {
        // relative requests must not match global wildcard aliases.

        let request_pattern = request.request_pattern().await?;
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

        let results = lookup_rel
            .into_iter()
            .chain(lookup_rel_parent.into_iter())
            .chain(lookup.into_iter())
            .map(async |result| {
                import_mapping_to_result(*result.try_join_into_self().await?, lookup_path, request)
                    .await
            })
            .try_join()
            .await?;

        Ok(match results.len() {
            0 => ImportMapResult::NoEntry,
            1 => results.into_iter().next().unwrap(),
            2.. => ImportMapResult::Alternatives(results),
        })
    }
}

#[turbo_tasks::value_impl]
impl ResolvedMap {
    #[turbo_tasks::function]
    pub async fn lookup(
        &self,
        resolved: Vc<FileSystemPath>,
        lookup_path: Vc<FileSystemPath>,
        request: Vc<Request>,
    ) -> Result<Vc<ImportMapResult>> {
        let resolved = resolved.await?;
        for (root, glob, mapping) in self.by_glob.iter() {
            let root = root.await?;
            if let Some(path) = root.get_path_to(&resolved) {
                if glob.await?.execute(path) {
                    return Ok(import_mapping_to_result(
                        *mapping.convert().await?,
                        lookup_path,
                        request,
                    )
                    .await?
                    .into());
                }
            }
        }
        Ok(ImportMapResult::NoEntry.into())
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
    pub plugins: Vec<ResolvedVc<Box<dyn AfterResolvePlugin>>>,
    /// Support resolving *.js requests to *.ts files
    pub enable_typescript_with_output_extension: bool,
    /// Warn instead of error for resolve errors
    pub loose_errors: bool,

    pub placeholder_for_future_extensions: (),
}

#[turbo_tasks::value_impl]
impl ResolveOptions {
    /// Returns a new [Vc<ResolveOptions>] with its import map extended to
    /// include the given import map.
    #[turbo_tasks::function]
    pub async fn with_extended_import_map(
        self: Vc<Self>,
        import_map: Vc<ImportMap>,
    ) -> Result<Vc<Self>> {
        let mut resolve_options = self.await?.clone_value();
        resolve_options.import_map = Some(
            resolve_options
                .import_map
                .map(|current_import_map| current_import_map.extend(import_map))
                .unwrap_or(import_map)
                .to_resolved()
                .await?,
        );
        Ok(resolve_options.into())
    }

    /// Returns a new [Vc<ResolveOptions>] with its fallback import map extended
    /// to include the given import map.
    #[turbo_tasks::function]
    pub async fn with_extended_fallback_import_map(
        self: Vc<Self>,
        extended_import_map: ResolvedVc<ImportMap>,
    ) -> Result<Vc<Self>> {
        let mut resolve_options = self.await?.clone_value();
        resolve_options.fallback_import_map =
            if let Some(current_fallback) = resolve_options.fallback_import_map {
                Some(
                    current_fallback
                        .extend(*extended_import_map)
                        .to_resolved()
                        .await?,
                )
            } else {
                Some(extended_import_map)
            };
        Ok(resolve_options.into())
    }

    /// Overrides the extensions used for resolving
    #[turbo_tasks::function]
    pub async fn with_extensions(self: Vc<Self>, extensions: Vec<RcStr>) -> Result<Vc<Self>> {
        let mut resolve_options = self.await?.clone_value();
        resolve_options.extensions = extensions;
        Ok(resolve_options.into())
    }

    /// Overrides the fully_specified flag for resolving
    #[turbo_tasks::function]
    pub async fn with_fully_specified(self: Vc<Self>, fully_specified: bool) -> Result<Vc<Self>> {
        let resolve_options = self.await?;
        if resolve_options.fully_specified == fully_specified {
            return Ok(self);
        }
        let mut resolve_options = resolve_options.clone_value();
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
    let options = options.await?;
    Ok(ResolveModulesOptions {
        modules: options.modules.clone(),
        extensions: options.extensions.clone(),
    }
    .into())
}

#[turbo_tasks::value_trait]
pub trait ImportMappingReplacement {
    fn replace(self: Vc<Self>, capture: Vc<Pattern>) -> Vc<ReplacedImportMapping>;
    fn result(
        self: Vc<Self>,
        lookup_path: Vc<FileSystemPath>,
        request: Vc<Request>,
    ) -> Vc<ImportMapResult>;
}
