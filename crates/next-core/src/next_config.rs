use anyhow::{Context, Result, bail};
use either::Either;
use rustc_hash::FxHashSet;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value as JsonValue;
use turbo_esregex::EsRegex;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, NonLocalValue, OperationValue, ResolvedVc, TaskInput, Vc, debug::ValueDebugFormat,
    trace::TraceRawVcs,
};
use turbo_tasks_env::{EnvMap, ProcessEnv};
use turbo_tasks_fetch::FetchClientConfig;
use turbo_tasks_fs::FileSystemPath;
use turbopack::module_options::{
    ConditionItem, ConditionPath, LoaderRuleItem, WebpackRules,
    module_options_context::MdxTransformOptions,
};
use turbopack_core::{
    issue::{Issue, IssueExt, IssueStage, OptionStyledString, StyledString},
    resolve::ResolveAliasMap,
};
use turbopack_ecmascript::{OptionTreeShaking, TreeShakingMode};
use turbopack_ecmascript_plugins::transform::{
    emotion::EmotionTransformConfig, relay::RelayConfig,
    styled_components::StyledComponentsTransformConfig,
};
use turbopack_node::transforms::webpack::{WebpackLoaderItem, WebpackLoaderItems};

use crate::{
    app_structure::FileSystemPathVec,
    mode::NextMode,
    next_import_map::mdx_import_source_file,
    next_shared::{
        transforms::ModularizeImportPackageConfig, webpack_rules::WebpackLoaderBuiltinCondition,
    },
};

#[turbo_tasks::value]
struct NextConfigAndCustomRoutes {
    config: ResolvedVc<NextConfig>,
    custom_routes: ResolvedVc<CustomRoutes>,
}

#[turbo_tasks::value]
struct CustomRoutes {
    rewrites: ResolvedVc<Rewrites>,
}

#[turbo_tasks::value(transparent)]
pub struct ModularizeImports(FxIndexMap<String, ModularizeImportPackageConfig>);

#[turbo_tasks::value(transparent)]
#[derive(Clone, Debug)]
pub struct CacheKinds(FxHashSet<RcStr>);

impl CacheKinds {
    pub fn extend<I: IntoIterator<Item = RcStr>>(&mut self, iter: I) {
        self.0.extend(iter);
    }
}

impl Default for CacheKinds {
    fn default() -> Self {
        CacheKinds(
            ["default", "remote", "private"]
                .iter()
                .map(|&s| s.into())
                .collect(),
        )
    }
}

#[turbo_tasks::value(eq = "manual")]
#[derive(Clone, Debug, Default, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct NextConfig {
    // IMPORTANT: all fields should be private and access should be wrapped within a turbo-tasks
    // function. Otherwise changing NextConfig will lead to invalidating all tasks accessing it.
    config_file: Option<RcStr>,
    config_file_name: RcStr,

    /// In-memory cache size in bytes.
    ///
    /// If `cache_max_memory_size: 0` disables in-memory caching.
    cache_max_memory_size: Option<f64>,
    /// custom path to a cache handler to use
    cache_handler: Option<RcStr>,

    env: FxIndexMap<String, JsonValue>,
    experimental: ExperimentalConfig,
    images: ImageConfig,
    page_extensions: Vec<RcStr>,
    react_compiler: Option<ReactCompilerOptionsOrBoolean>,
    react_production_profiling: Option<bool>,
    react_strict_mode: Option<bool>,
    transpile_packages: Option<Vec<RcStr>>,
    modularize_imports: Option<FxIndexMap<String, ModularizeImportPackageConfig>>,
    dist_dir: RcStr,
    dist_dir_root: RcStr,
    deployment_id: Option<RcStr>,
    sass_options: Option<serde_json::Value>,
    trailing_slash: Option<bool>,
    asset_prefix: Option<RcStr>,
    base_path: Option<RcStr>,
    skip_proxy_url_normalize: Option<bool>,
    skip_trailing_slash_redirect: Option<bool>,
    i18n: Option<I18NConfig>,
    cross_origin: Option<CrossOriginConfig>,
    dev_indicators: Option<DevIndicatorsConfig>,
    output: Option<OutputType>,
    turbopack: Option<TurbopackConfig>,
    production_browser_source_maps: bool,
    output_file_tracing_includes: Option<serde_json::Value>,
    output_file_tracing_excludes: Option<serde_json::Value>,
    // TODO: This option is not respected, it uses Turbopack's root instead.
    output_file_tracing_root: Option<RcStr>,

    /// Enables the bundling of node_modules packages (externals) for pages
    /// server-side bundles.
    ///
    /// [API Reference](https://nextjs.org/docs/pages/api-reference/next-config-js/bundlePagesRouterDependencies)
    bundle_pages_router_dependencies: Option<bool>,

    /// A list of packages that should be treated as external on the server
    /// build.
    ///
    /// [API Reference](https://nextjs.org/docs/app/api-reference/next-config-js/serverExternalPackages)
    server_external_packages: Option<Vec<RcStr>>,

    #[serde(rename = "_originalRedirects")]
    original_redirects: Option<Vec<Redirect>>,

    // Partially supported
    compiler: Option<CompilerConfig>,

    optimize_fonts: Option<bool>,

    clean_dist_dir: bool,
    compress: bool,
    eslint: EslintConfig,
    exclude_default_moment_locales: bool,
    // this can be a function in js land
    export_path_map: Option<serde_json::Value>,
    // this is a function in js land
    generate_build_id: Option<serde_json::Value>,
    generate_etags: bool,
    http_agent_options: HttpAgentConfig,
    on_demand_entries: OnDemandEntriesConfig,
    powered_by_header: bool,
    public_runtime_config: FxIndexMap<String, serde_json::Value>,
    server_runtime_config: FxIndexMap<String, serde_json::Value>,
    static_page_generation_timeout: f64,
    target: Option<String>,
    typescript: TypeScriptConfig,
    use_file_system_public_routes: bool,
    cache_components: Option<bool>,
    webpack: Option<serde_json::Value>,
}

#[derive(
    Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(rename_all = "kebab-case")]
pub enum CrossOriginConfig {
    Anonymous,
    UseCredentials,
}

#[turbo_tasks::value(transparent)]
pub struct OptionCrossOriginConfig(Option<CrossOriginConfig>);

#[derive(
    Clone,
    Debug,
    Default,
    PartialEq,
    Serialize,
    Deserialize,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(rename_all = "camelCase")]
struct EslintConfig {
    dirs: Option<Vec<String>>,
    ignore_during_builds: Option<bool>,
}

#[derive(
    Clone,
    Debug,
    Default,
    PartialEq,
    Serialize,
    Deserialize,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(rename_all = "kebab-case")]
pub enum BuildActivityPositions {
    #[default]
    BottomRight,
    BottomLeft,
    TopRight,
    TopLeft,
}

#[derive(
    Clone,
    Debug,
    Default,
    PartialEq,
    Serialize,
    Deserialize,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(rename_all = "camelCase")]
pub struct DevIndicatorsOptions {
    pub build_activity_position: Option<BuildActivityPositions>,
    pub position: Option<BuildActivityPositions>,
}

#[derive(
    Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(untagged)]
pub enum DevIndicatorsConfig {
    WithOptions(DevIndicatorsOptions),
    Boolean(bool),
}

#[derive(
    Clone,
    Debug,
    Default,
    PartialEq,
    Serialize,
    Deserialize,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(rename_all = "camelCase")]
struct OnDemandEntriesConfig {
    max_inactive_age: f64,
    pages_buffer_length: f64,
}

#[derive(
    Clone,
    Debug,
    Default,
    PartialEq,
    Serialize,
    Deserialize,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(rename_all = "camelCase")]
struct HttpAgentConfig {
    keep_alive: bool,
}

#[derive(
    Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(rename_all = "camelCase")]
pub struct DomainLocale {
    pub default_locale: String,
    pub domain: String,
    pub http: Option<bool>,
    pub locales: Option<Vec<String>>,
}

#[derive(
    Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(rename_all = "camelCase")]
pub struct I18NConfig {
    pub default_locale: String,
    pub domains: Option<Vec<DomainLocale>>,
    pub locale_detection: Option<bool>,
    pub locales: Vec<String>,
}

#[turbo_tasks::value(transparent)]
pub struct OptionI18NConfig(Option<I18NConfig>);

#[derive(
    Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(rename_all = "kebab-case")]
pub enum OutputType {
    Standalone,
    Export,
}

#[turbo_tasks::value(transparent)]
pub struct OptionOutputType(Option<OutputType>);

#[derive(
    Debug,
    Clone,
    Hash,
    Eq,
    PartialEq,
    Ord,
    PartialOrd,
    TaskInput,
    TraceRawVcs,
    Serialize,
    Deserialize,
    NonLocalValue,
    OperationValue,
)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum RouteHas {
    Header {
        key: RcStr,
        #[serde(skip_serializing_if = "Option::is_none")]
        value: Option<RcStr>,
    },
    Cookie {
        key: RcStr,
        #[serde(skip_serializing_if = "Option::is_none")]
        value: Option<RcStr>,
    },
    Query {
        key: RcStr,
        #[serde(skip_serializing_if = "Option::is_none")]
        value: Option<RcStr>,
    },
    Host {
        value: RcStr,
    },
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue)]
#[serde(rename_all = "camelCase")]
pub struct HeaderValue {
    pub key: RcStr,
    pub value: RcStr,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue)]
#[serde(rename_all = "camelCase")]
pub struct Header {
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_path: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub locale: Option<bool>,
    pub headers: Vec<HeaderValue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has: Option<Vec<RouteHas>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub missing: Option<Vec<RouteHas>>,
}

#[derive(
    Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(rename_all = "camelCase")]
pub enum RedirectStatus {
    StatusCode(f64),
    Permanent(bool),
}

#[derive(
    Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(rename_all = "camelCase")]
pub struct Redirect {
    pub source: String,
    pub destination: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_path: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub locale: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has: Option<Vec<RouteHas>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub missing: Option<Vec<RouteHas>>,

    #[serde(flatten)]
    pub status: RedirectStatus,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue)]
#[serde(rename_all = "camelCase")]
pub struct Rewrite {
    pub source: String,
    pub destination: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_path: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub locale: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has: Option<Vec<RouteHas>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub missing: Option<Vec<RouteHas>>,
}

#[turbo_tasks::value(eq = "manual")]
#[derive(Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Rewrites {
    pub before_files: Vec<Rewrite>,
    pub after_files: Vec<Rewrite>,
    pub fallback: Vec<Rewrite>,
}

#[derive(
    Clone,
    Debug,
    Default,
    PartialEq,
    Serialize,
    Deserialize,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(rename_all = "camelCase")]
pub struct TypeScriptConfig {
    pub ignore_build_errors: Option<bool>,
    pub tsconfig_path: Option<String>,
}

#[turbo_tasks::value(eq = "manual", operation)]
#[derive(Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImageConfig {
    pub device_sizes: Vec<u16>,
    pub image_sizes: Vec<u16>,
    pub path: String,
    pub loader: ImageLoader,
    #[serde(deserialize_with = "empty_string_is_none")]
    pub loader_file: Option<String>,
    pub domains: Vec<String>,
    pub disable_static_images: bool,
    #[serde(rename = "minimumCacheTTL")]
    pub minimum_cache_ttl: u64,
    pub formats: Vec<ImageFormat>,
    #[serde(rename = "dangerouslyAllowSVG")]
    pub dangerously_allow_svg: bool,
    pub content_security_policy: String,
    pub remote_patterns: Vec<RemotePattern>,
    pub unoptimized: bool,
}

fn empty_string_is_none<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let o = Option::<String>::deserialize(deserializer)?;
    Ok(o.filter(|s| !s.is_empty()))
}

impl Default for ImageConfig {
    fn default() -> Self {
        // https://github.com/vercel/next.js/blob/327634eb/packages/next/shared/lib/image-config.ts#L100-L114
        Self {
            device_sizes: vec![640, 750, 828, 1080, 1200, 1920, 2048, 3840],
            image_sizes: vec![32, 48, 64, 96, 128, 256, 384],
            path: "/_next/image".to_string(),
            loader: ImageLoader::Default,
            loader_file: None,
            domains: vec![],
            disable_static_images: false,
            minimum_cache_ttl: 60,
            formats: vec![ImageFormat::Webp],
            dangerously_allow_svg: false,
            content_security_policy: "".to_string(),
            remote_patterns: vec![],
            unoptimized: false,
        }
    }
}

#[derive(
    Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(rename_all = "kebab-case")]
pub enum ImageLoader {
    Default,
    Imgix,
    Cloudinary,
    Akamai,
    Custom,
}

#[derive(
    Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
pub enum ImageFormat {
    #[serde(rename = "image/webp")]
    Webp,
    #[serde(rename = "image/avif")]
    Avif,
}

#[derive(
    Clone,
    Debug,
    Default,
    PartialEq,
    Serialize,
    Deserialize,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(rename_all = "camelCase")]
pub struct RemotePattern {
    pub hostname: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub protocol: Option<RemotePatternProtocol>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub port: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pathname: Option<String>,
}

#[derive(
    Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(rename_all = "kebab-case")]
pub enum RemotePatternProtocol {
    Http,
    Https,
}

#[derive(
    Clone,
    Debug,
    Default,
    PartialEq,
    Serialize,
    Deserialize,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(rename_all = "camelCase")]
pub struct TurbopackConfig {
    /// This option has been replaced by `rules`.
    pub loaders: Option<JsonValue>,
    pub rules: Option<FxIndexMap<RcStr, RuleConfigCollection>>,
    pub resolve_alias: Option<FxIndexMap<RcStr, JsonValue>>,
    pub resolve_extensions: Option<Vec<RcStr>>,
    pub debug_ids: Option<bool>,
}

#[derive(
    Serialize, Deserialize, Clone, PartialEq, Eq, Debug, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(deny_unknown_fields)]
pub struct RegexComponents {
    source: RcStr,
    flags: RcStr,
}

/// This type should not be hand-written, but instead `packages/next/src/build/swc/index.ts` will
/// transform a JS `RegExp` to a `RegexComponents` or a string to a `Glob` before passing it to us.
///
/// This is needed because `RegExp` objects are not otherwise serializable.
#[derive(
    Clone, PartialEq, Eq, Debug, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(
    tag = "type",
    content = "value",
    rename_all = "camelCase",
    deny_unknown_fields
)]
pub enum ConfigConditionPath {
    Glob(RcStr),
    Regex(RegexComponents),
}

impl TryFrom<ConfigConditionPath> for ConditionPath {
    type Error = anyhow::Error;

    fn try_from(config: ConfigConditionPath) -> Result<ConditionPath> {
        Ok(match config {
            ConfigConditionPath::Glob(path) => ConditionPath::Glob(path),
            ConfigConditionPath::Regex(path) => {
                ConditionPath::Regex(EsRegex::try_from(path)?.resolved_cell())
            }
        })
    }
}

impl TryFrom<RegexComponents> for EsRegex {
    type Error = anyhow::Error;

    fn try_from(components: RegexComponents) -> Result<EsRegex> {
        EsRegex::new(&components.source, &components.flags)
    }
}

#[derive(
    Serialize, Deserialize, Clone, PartialEq, Eq, Debug, TraceRawVcs, NonLocalValue, OperationValue,
)]
// We can end up with confusing behaviors if we silently ignore extra properties, since `Base` will
// match nearly every object, since it has no required field.
#[serde(deny_unknown_fields)]
pub enum ConfigConditionItem {
    #[serde(rename = "all")]
    All(Box<[ConfigConditionItem]>),
    #[serde(rename = "any")]
    Any(Box<[ConfigConditionItem]>),
    #[serde(rename = "not")]
    Not(Box<ConfigConditionItem>),
    #[serde(untagged)]
    Builtin(WebpackLoaderBuiltinCondition),
    #[serde(untagged)]
    Base {
        #[serde(default)]
        path: Option<ConfigConditionPath>,
        #[serde(default)]
        content: Option<RegexComponents>,
    },
}

impl TryFrom<ConfigConditionItem> for ConditionItem {
    type Error = anyhow::Error;

    fn try_from(config: ConfigConditionItem) -> Result<Self> {
        let try_from_vec = |conds: Box<[_]>| {
            conds
                .into_iter()
                .map(ConditionItem::try_from)
                .collect::<Result<_>>()
        };
        Ok(match config {
            ConfigConditionItem::All(conds) => ConditionItem::All(try_from_vec(conds)?),
            ConfigConditionItem::Any(conds) => ConditionItem::Any(try_from_vec(conds)?),
            ConfigConditionItem::Not(cond) => ConditionItem::Not(Box::new((*cond).try_into()?)),
            ConfigConditionItem::Builtin(cond) => {
                ConditionItem::Builtin(RcStr::from(cond.as_str()))
            }
            ConfigConditionItem::Base { path, content } => ConditionItem::Base {
                path: path.map(ConditionPath::try_from).transpose()?,
                content: content
                    .map(EsRegex::try_from)
                    .transpose()?
                    .map(EsRegex::resolved_cell),
            },
        })
    }
}

#[derive(
    Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(rename_all = "camelCase")]
pub struct RuleConfigItem {
    pub loaders: Vec<LoaderItem>,
    #[serde(default, alias = "as")]
    pub rename_as: Option<RcStr>,
    #[serde(default)]
    pub condition: Option<ConfigConditionItem>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, TraceRawVcs, NonLocalValue, OperationValue)]
#[serde(transparent)]
pub struct RuleConfigCollection(Vec<RuleConfigCollectionItem>);

impl<'de> Deserialize<'de> for RuleConfigCollection {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        match either::serde_untagged::deserialize::<Vec<RuleConfigCollectionItem>, RuleConfigItem, D>(
            deserializer,
        )? {
            Either::Left(collection) => Ok(RuleConfigCollection(collection)),
            Either::Right(item) => Ok(RuleConfigCollection(vec![RuleConfigCollectionItem::Full(
                item,
            )])),
        }
    }
}

#[derive(
    Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(untagged)]
pub enum RuleConfigCollectionItem {
    Shorthand(LoaderItem),
    Full(RuleConfigItem),
}

#[derive(
    Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(untagged)]
pub enum LoaderItem {
    LoaderName(RcStr),
    LoaderOptions(WebpackLoaderItem),
}

#[turbo_tasks::value(operation)]
#[derive(Copy, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub enum ModuleIds {
    Named,
    Deterministic,
}

#[turbo_tasks::value(transparent)]
pub struct OptionModuleIds(pub Option<ModuleIds>);

#[derive(
    Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(untagged)]
pub enum MdxRsOptions {
    Boolean(bool),
    Option(MdxTransformOptions),
}

#[turbo_tasks::value(shared, operation)]
#[derive(Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub enum ReactCompilerCompilationMode {
    #[default]
    Infer,
    Annotation,
    All,
}

#[turbo_tasks::value(shared, operation)]
#[derive(Clone, Debug, Default)]
#[serde(rename_all = "snake_case")]
pub enum ReactCompilerPanicThreshold {
    #[default]
    None,
    CriticalErrors,
    AllErrors,
}

/// Subset of react compiler options
#[turbo_tasks::value(shared, operation)]
#[derive(Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReactCompilerOptions {
    #[serde(default)]
    pub compilation_mode: ReactCompilerCompilationMode,
    #[serde(default)]
    pub panic_threshold: ReactCompilerPanicThreshold,
}

#[derive(
    Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(untagged)]
pub enum ReactCompilerOptionsOrBoolean {
    Boolean(bool),
    Option(ReactCompilerOptions),
}

#[turbo_tasks::value(transparent)]
pub struct OptionalReactCompilerOptions(Option<ResolvedVc<ReactCompilerOptions>>);

#[derive(
    Clone,
    Debug,
    Default,
    PartialEq,
    Serialize,
    Deserialize,
    TraceRawVcs,
    ValueDebugFormat,
    NonLocalValue,
    OperationValue,
)]
#[serde(rename_all = "camelCase")]
pub struct ExperimentalConfig {
    // all fields should be private and access should be wrapped within a turbo-tasks function
    // Otherwise changing ExperimentalConfig will lead to invalidating all tasks accessing it.
    allowed_revalidate_header_keys: Option<Vec<RcStr>>,
    client_router_filter: Option<bool>,
    /// decimal for percent for possible false positives e.g. 0.01 for 10%
    /// potential false matches lower percent increases size of the filter
    client_router_filter_allowed_rate: Option<f64>,
    client_router_filter_redirects: Option<bool>,
    fetch_cache_key_prefix: Option<RcStr>,
    isr_flush_to_disk: Option<bool>,
    /// For use with `@next/mdx`. Compile MDX files using the new Rust compiler.
    /// @see [api reference](https://nextjs.org/docs/app/api-reference/next-config-js/mdxRs)
    mdx_rs: Option<MdxRsOptions>,
    strict_next_head: Option<bool>,
    swc_plugins: Option<Vec<(RcStr, serde_json::Value)>>,
    external_middleware_rewrites_resolve: Option<bool>,
    scroll_restoration: Option<bool>,
    manual_client_base_path: Option<bool>,
    optimistic_client_cache: Option<bool>,
    middleware_prefetch: Option<MiddlewarePrefetchType>,
    /// optimizeCss can be boolean or critters' option object
    /// Use Record<string, unknown> as critters doesn't export its Option type ([link](https://github.com/GoogleChromeLabs/critters/blob/a590c05f9197b656d2aeaae9369df2483c26b072/packages/critters/src/index.d.ts))
    optimize_css: Option<serde_json::Value>,
    next_script_workers: Option<bool>,
    web_vitals_attribution: Option<Vec<RcStr>>,
    server_actions: Option<ServerActionsOrLegacyBool>,
    sri: Option<SubResourceIntegrity>,
    /// @deprecated - use top-level cache_components instead.
    /// This field is kept for backwards compatibility during migration.
    cache_components: Option<bool>,
    use_cache: Option<bool>,
    root_params: Option<bool>,
    // ---
    // UNSUPPORTED
    // ---
    adjust_font_fallbacks: Option<bool>,
    adjust_font_fallbacks_with_size_adjust: Option<bool>,
    after: Option<bool>,
    app_document_preloading: Option<bool>,
    cache_handlers: Option<FxIndexMap<RcStr, RcStr>>,
    cache_life: Option<FxIndexMap<String, CacheLifeProfile>>,
    case_sensitive_routes: Option<bool>,
    cpus: Option<f64>,
    cra_compat: Option<bool>,
    disable_optimized_loading: Option<bool>,
    disable_postcss_preset_env: Option<bool>,
    esm_externals: Option<EsmExternals>,
    extension_alias: Option<serde_json::Value>,
    external_dir: Option<bool>,
    /// If set to `false`, webpack won't fall back to polyfill Node.js modules
    /// in the browser Full list of old polyfills is accessible here:
    /// [webpack/webpack#Module_notound_error.js#L13-L42](https://github.com/webpack/webpack/blob/2a0536cf510768111a3a6dceeb14cb79b9f59273/lib/Module_not_found_error.js#L13-L42)
    fallback_node_polyfills: Option<bool>, // false
    force_swc_transforms: Option<bool>,
    fully_specified: Option<bool>,
    gzip_size: Option<bool>,

    pub inline_css: Option<bool>,
    instrumentation_hook: Option<bool>,
    client_trace_metadata: Option<Vec<String>>,
    large_page_data_bytes: Option<f64>,
    logging: Option<serde_json::Value>,
    memory_based_workers_count: Option<bool>,
    /// Optimize React APIs for server builds.
    optimize_server_react: Option<bool>,
    /// Automatically apply the "modularize_imports" optimization to imports of
    /// the specified packages.
    optimize_package_imports: Option<Vec<RcStr>>,
    /// Using this feature will enable the `react@experimental` for the `app`
    /// directory.
    ppr: Option<ExperimentalPartialPrerendering>,
    taint: Option<bool>,
    proxy_timeout: Option<f64>,
    /// enables the minification of server code.
    server_minification: Option<bool>,
    /// Enables source maps generation for the server production bundle.
    server_source_maps: Option<bool>,
    swc_trace_profiling: Option<bool>,
    /// @internal Used by the Next.js internals only.
    trust_host_header: Option<bool>,

    url_imports: Option<serde_json::Value>,
    /// This option is to enable running the Webpack build in a worker thread
    /// (doesn't apply to Turbopack).
    webpack_build_worker: Option<bool>,
    worker_threads: Option<bool>,

    turbopack_minify: Option<bool>,
    turbopack_module_ids: Option<ModuleIds>,
    turbopack_persistent_caching: Option<bool>,
    turbopack_source_maps: Option<bool>,
    turbopack_tree_shaking: Option<bool>,
    turbopack_scope_hoisting: Option<bool>,
    turbopack_import_type_bytes: Option<bool>,
    turbopack_use_system_tls_certs: Option<bool>,
    /// Disable automatic configuration of the sass loader.
    #[serde(default)]
    turbopack_use_builtin_sass: Option<bool>,
    /// Disable automatic configuration of the babel loader when a babel configuration file is
    /// present.
    #[serde(default)]
    turbopack_use_builtin_babel: Option<bool>,
    // Whether to enable the global-not-found convention
    global_not_found: Option<bool>,
    /// Defaults to false in development mode, true in production mode.
    turbopack_remove_unused_exports: Option<bool>,
    /// Devtool option for the segment explorer.
    devtool_segment_explorer: Option<bool>,
}

#[derive(
    Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(rename_all = "camelCase")]
pub struct CacheLifeProfile {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stale: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub revalidate: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expire: Option<u32>,
}

#[test]
fn test_cache_life_profiles() {
    let json = serde_json::json!({
        "cacheLife": {
            "frequent": {
                "stale": 19,
                "revalidate": 100,
            },
        }
    });

    let config: ExperimentalConfig = serde_json::from_value(json).unwrap();
    let mut expected_cache_life = FxIndexMap::default();

    expected_cache_life.insert(
        "frequent".to_string(),
        CacheLifeProfile {
            stale: Some(19),
            revalidate: Some(100),
            expire: None,
        },
    );

    assert_eq!(config.cache_life, Some(expected_cache_life));
}

#[test]
fn test_cache_life_profiles_invalid() {
    let json = serde_json::json!({
        "cacheLife": {
            "invalid": {
                "stale": "invalid_value",
            },
        }
    });

    let result: Result<ExperimentalConfig, _> = serde_json::from_value(json);

    assert!(
        result.is_err(),
        "Deserialization should fail due to invalid 'stale' value type"
    );
}

#[derive(
    Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(rename_all = "lowercase")]
pub enum ExperimentalPartialPrerenderingIncrementalValue {
    Incremental,
}

#[derive(
    Clone, Debug, PartialEq, Deserialize, Serialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(untagged)]
pub enum ExperimentalPartialPrerendering {
    Boolean(bool),
    Incremental(ExperimentalPartialPrerenderingIncrementalValue),
}

#[test]
fn test_parse_experimental_partial_prerendering() {
    let json = serde_json::json!({
        "ppr": "incremental"
    });
    let config: ExperimentalConfig = serde_json::from_value(json).unwrap();
    assert_eq!(
        config.ppr,
        Some(ExperimentalPartialPrerendering::Incremental(
            ExperimentalPartialPrerenderingIncrementalValue::Incremental
        ))
    );

    let json = serde_json::json!({
        "ppr": true
    });
    let config: ExperimentalConfig = serde_json::from_value(json).unwrap();
    assert_eq!(
        config.ppr,
        Some(ExperimentalPartialPrerendering::Boolean(true))
    );

    // Expect if we provide a random string, it will fail.
    let json = serde_json::json!({
        "ppr": "random"
    });
    let config = serde_json::from_value::<ExperimentalConfig>(json);
    assert!(config.is_err());
}

#[derive(
    Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(rename_all = "camelCase")]
pub struct SubResourceIntegrity {
    pub algorithm: Option<RcStr>,
}

#[derive(
    Clone, Debug, PartialEq, Deserialize, Serialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(untagged)]
pub enum ServerActionsOrLegacyBool {
    /// The current way to configure server actions sub behaviors.
    ServerActionsConfig(ServerActions),

    /// The legacy way to disable server actions. This is no longer used, server
    /// actions is always enabled.
    LegacyBool(bool),
}

#[derive(
    Clone, Debug, PartialEq, Deserialize, Serialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(rename_all = "kebab-case")]
pub enum EsmExternalsValue {
    Loose,
}

#[derive(
    Clone, Debug, PartialEq, Deserialize, Serialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(untagged)]
pub enum EsmExternals {
    Loose(EsmExternalsValue),
    Bool(bool),
}

// Test for esm externals deserialization.
#[test]
fn test_esm_externals_deserialization() {
    let json = serde_json::json!({
        "esmExternals": true
    });
    let config: ExperimentalConfig = serde_json::from_value(json).unwrap();
    assert_eq!(config.esm_externals, Some(EsmExternals::Bool(true)));

    let json = serde_json::json!({
        "esmExternals": "loose"
    });
    let config: ExperimentalConfig = serde_json::from_value(json).unwrap();
    assert_eq!(
        config.esm_externals,
        Some(EsmExternals::Loose(EsmExternalsValue::Loose))
    );
}

#[derive(
    Clone,
    Debug,
    Default,
    PartialEq,
    Eq,
    Deserialize,
    Serialize,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(rename_all = "camelCase")]
pub struct ServerActions {
    /// Allows adjusting body parser size limit for server actions.
    pub body_size_limit: Option<SizeLimit>,
}

#[derive(Clone, Debug, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue)]
#[serde(untagged)]
pub enum SizeLimit {
    Number(f64),
    WithUnit(String),
}

// Manual implementation of PartialEq and Eq for SizeLimit because f64 doesn't
// implement Eq.
impl PartialEq for SizeLimit {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (SizeLimit::Number(a), SizeLimit::Number(b)) => a.to_bits() == b.to_bits(),
            (SizeLimit::WithUnit(a), SizeLimit::WithUnit(b)) => a == b,
            _ => false,
        }
    }
}

impl Eq for SizeLimit {}

#[derive(
    Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(rename_all = "kebab-case")]
pub enum MiddlewarePrefetchType {
    Strict,
    Flexible,
}

#[derive(
    Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(untagged)]
pub enum EmotionTransformOptionsOrBoolean {
    Boolean(bool),
    Options(EmotionTransformConfig),
}

impl EmotionTransformOptionsOrBoolean {
    pub fn is_enabled(&self) -> bool {
        match self {
            Self::Boolean(enabled) => *enabled,
            _ => true,
        }
    }
}

#[derive(
    Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(untagged)]
pub enum StyledComponentsTransformOptionsOrBoolean {
    Boolean(bool),
    Options(StyledComponentsTransformConfig),
}

impl StyledComponentsTransformOptionsOrBoolean {
    pub fn is_enabled(&self) -> bool {
        match self {
            Self::Boolean(enabled) => *enabled,
            _ => true,
        }
    }
}

#[turbo_tasks::value(eq = "manual")]
#[derive(Clone, Debug, PartialEq, Default, OperationValue)]
#[serde(rename_all = "camelCase")]
pub struct CompilerConfig {
    pub react_remove_properties: Option<ReactRemoveProperties>,
    pub relay: Option<RelayConfig>,
    pub emotion: Option<EmotionTransformOptionsOrBoolean>,
    pub remove_console: Option<RemoveConsoleConfig>,
    pub styled_components: Option<StyledComponentsTransformOptionsOrBoolean>,
}

#[derive(
    Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(untagged, rename_all = "camelCase")]
pub enum ReactRemoveProperties {
    Boolean(bool),
    Config { properties: Option<Vec<String>> },
}

impl ReactRemoveProperties {
    pub fn is_enabled(&self) -> bool {
        match self {
            Self::Boolean(enabled) => *enabled,
            _ => true,
        }
    }
}

#[derive(
    Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(untagged)]
pub enum RemoveConsoleConfig {
    Boolean(bool),
    Config { exclude: Option<Vec<String>> },
}

impl RemoveConsoleConfig {
    pub fn is_enabled(&self) -> bool {
        match self {
            Self::Boolean(enabled) => *enabled,
            _ => true,
        }
    }
}

#[turbo_tasks::value(transparent)]
pub struct ResolveExtensions(Option<Vec<RcStr>>);

#[turbo_tasks::value(transparent)]
pub struct SwcPlugins(Vec<(RcStr, serde_json::Value)>);

#[turbo_tasks::value(transparent)]
pub struct OptionalMdxTransformOptions(Option<ResolvedVc<MdxTransformOptions>>);

#[turbo_tasks::value(transparent)]

pub struct OptionSubResourceIntegrity(Option<SubResourceIntegrity>);

#[turbo_tasks::value(transparent)]
pub struct OptionFileSystemPath(Option<FileSystemPath>);

#[turbo_tasks::value(transparent)]
pub struct OptionServerActions(Option<ServerActions>);

#[turbo_tasks::value(transparent)]
pub struct OptionJsonValue(pub Option<serde_json::Value>);

fn turbopack_config_documentation_link() -> RcStr {
    rcstr!("https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack#configuring-webpack-loaders")
}

#[turbo_tasks::value(shared)]
struct InvalidLoaderRuleRenameAsIssue {
    glob: RcStr,
    rename_as: RcStr,
    config_file_path: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl Issue for InvalidLoaderRuleRenameAsIssue {
    #[turbo_tasks::function]
    async fn file_path(&self) -> Result<Vc<FileSystemPath>> {
        Ok(self.config_file_path.clone().cell())
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Config.cell()
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<StyledString>> {
        Ok(
            StyledString::Text(format!("Invalid loader rule for extension: {}", self.glob).into())
                .cell(),
        )
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<OptionStyledString>> {
        Ok(Vc::cell(Some(
            StyledString::Text(RcStr::from(format!(
                "The extension {} contains a wildcard, but the `as` option does not: {}",
                self.glob, self.rename_as,
            )))
            .resolved_cell(),
        )))
    }

    #[turbo_tasks::function]
    fn documentation_link(&self) -> Vc<RcStr> {
        Vc::cell(turbopack_config_documentation_link())
    }
}

#[turbo_tasks::value(shared)]
struct InvalidLoaderRuleConditionIssue {
    condition: ConfigConditionItem,
    config_file_path: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl Issue for InvalidLoaderRuleConditionIssue {
    #[turbo_tasks::function]
    async fn file_path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        Ok(self.await?.config_file_path.clone().cell())
    }

    #[turbo_tasks::function]
    fn stage(self: Vc<Self>) -> Vc<IssueStage> {
        IssueStage::Config.cell()
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<StyledString>> {
        Ok(StyledString::Text(rcstr!("Invalid condition for Turbopack loader rule")).cell())
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<OptionStyledString>> {
        Ok(Vc::cell(Some(
            StyledString::Text(RcStr::from(
                serde_json::to_string_pretty(&self.condition)
                    .expect("condition must be serializable"),
            ))
            .resolved_cell(),
        )))
    }

    #[turbo_tasks::function]
    fn documentation_link(&self) -> Vc<RcStr> {
        Vc::cell(turbopack_config_documentation_link())
    }
}

#[turbo_tasks::value_impl]
impl NextConfig {
    #[turbo_tasks::function]
    pub async fn from_string(string: Vc<RcStr>) -> Result<Vc<Self>> {
        let string = string.await?;
        let mut jdeserializer = serde_json::Deserializer::from_str(&string);
        let config: NextConfig = serde_path_to_error::deserialize(&mut jdeserializer)
            .with_context(|| format!("failed to parse next.config.js: {string}"))?;
        Ok(config.cell())
    }

    #[turbo_tasks::function]
    pub async fn config_file_path(
        &self,
        project_path: FileSystemPath,
    ) -> Result<Vc<FileSystemPath>> {
        Ok(project_path.join(&self.config_file_name)?.cell())
    }

    #[turbo_tasks::function]
    pub fn bundle_pages_router_dependencies(&self) -> Vc<bool> {
        Vc::cell(self.bundle_pages_router_dependencies.unwrap_or_default())
    }

    #[turbo_tasks::function]
    pub fn enable_react_production_profiling(&self) -> Vc<bool> {
        Vc::cell(self.react_production_profiling.unwrap_or_default())
    }

    #[turbo_tasks::function]
    pub fn server_external_packages(&self) -> Vc<Vec<RcStr>> {
        Vc::cell(
            self.server_external_packages
                .as_ref()
                .cloned()
                .unwrap_or_default(),
        )
    }

    #[turbo_tasks::function]
    pub fn is_standalone(&self) -> Vc<bool> {
        Vc::cell(self.output == Some(OutputType::Standalone))
    }

    #[turbo_tasks::function]
    pub fn base_path(&self) -> Vc<Option<RcStr>> {
        Vc::cell(self.base_path.clone())
    }

    #[turbo_tasks::function]
    pub fn cache_handler(&self, project_path: FileSystemPath) -> Result<Vc<OptionFileSystemPath>> {
        if let Some(handler) = &self.cache_handler {
            Ok(Vc::cell(Some(project_path.join(handler)?)))
        } else {
            Ok(Vc::cell(None))
        }
    }

    #[turbo_tasks::function]
    pub fn compiler(&self) -> Vc<CompilerConfig> {
        self.compiler.clone().unwrap_or_default().cell()
    }

    #[turbo_tasks::function]
    pub fn env(&self) -> Vc<EnvMap> {
        // The value expected for env is Record<String, String>, but config itself
        // allows arbitrary object (https://github.com/vercel/next.js/blob/25ba8a74b7544dfb6b30d1b67c47b9cb5360cb4e/packages/next/src/server/config-schema.ts#L203)
        // then stringifies it. We do the interop here as well.
        let env = self
            .env
            .iter()
            .map(|(k, v)| {
                (
                    k.as_str().into(),
                    if let JsonValue::String(s) = v {
                        // A string value is kept, calling `to_string` would wrap in to quotes.
                        s.as_str().into()
                    } else {
                        v.to_string().into()
                    },
                )
            })
            .collect();

        Vc::cell(env)
    }

    #[turbo_tasks::function]
    pub fn image_config(&self) -> Vc<ImageConfig> {
        self.images.clone().cell()
    }

    #[turbo_tasks::function]
    pub fn page_extensions(&self) -> Vc<Vec<RcStr>> {
        // Sort page extensions by length descending. This mirrors the Webpack behavior in Next.js,
        // which just builds a regex alternative, which greedily matches the longest
        // extension: https://github.com/vercel/next.js/blob/32476071fe331948d89a35c391eb578aed8de979/packages/next/src/build/entries.ts#L409
        let mut extensions = self.page_extensions.clone();
        extensions.sort_by_key(|ext| std::cmp::Reverse(ext.len()));
        Vc::cell(extensions)
    }

    #[turbo_tasks::function]
    pub fn is_global_not_found_enabled(&self) -> Vc<bool> {
        Vc::cell(self.experimental.global_not_found.unwrap_or_default())
    }

    #[turbo_tasks::function]
    pub fn transpile_packages(&self) -> Vc<Vec<RcStr>> {
        Vc::cell(self.transpile_packages.clone().unwrap_or_default())
    }

    #[turbo_tasks::function]
    pub async fn webpack_rules(
        self: Vc<Self>,
        project_path: FileSystemPath,
    ) -> Result<Vc<WebpackRules>> {
        let this = self.await?;
        let Some(turbo_rules) = this.turbopack.as_ref().and_then(|t| t.rules.as_ref()) else {
            return Ok(Vc::cell(Vec::new()));
        };
        if turbo_rules.is_empty() {
            return Ok(Vc::cell(Vec::new()));
        }
        let mut rules = Vec::new();
        for (glob, rule_collection) in turbo_rules.iter() {
            fn transform_loaders(
                loaders: &mut dyn Iterator<Item = &LoaderItem>,
            ) -> ResolvedVc<WebpackLoaderItems> {
                ResolvedVc::cell(
                    loaders
                        .map(|item| match item {
                            LoaderItem::LoaderName(name) => WebpackLoaderItem {
                                loader: name.clone(),
                                options: Default::default(),
                            },
                            LoaderItem::LoaderOptions(options) => options.clone(),
                        })
                        .collect(),
                )
            }
            for item in &rule_collection.0 {
                match item {
                    RuleConfigCollectionItem::Shorthand(loaders) => {
                        rules.push((
                            glob.clone(),
                            LoaderRuleItem {
                                loaders: transform_loaders(&mut [loaders].into_iter()),
                                rename_as: None,
                                condition: None,
                            },
                        ));
                    }
                    RuleConfigCollectionItem::Full(RuleConfigItem {
                        loaders,
                        rename_as,
                        condition,
                    }) => {
                        // If the extension contains a wildcard, and the rename_as does not,
                        // emit an issue to prevent users from encountering duplicate module
                        // names.
                        if glob.contains("*")
                            && let Some(rename_as) = rename_as.as_ref()
                            && !rename_as.contains("*")
                        {
                            InvalidLoaderRuleRenameAsIssue {
                                glob: glob.clone(),
                                config_file_path: self
                                    .config_file_path(project_path.clone())
                                    .owned()
                                    .await?,
                                rename_as: rename_as.clone(),
                            }
                            .resolved_cell()
                            .emit();
                        }

                        // convert from Next.js-specific condition type to internal Turbopack
                        // condition type
                        let condition = if let Some(condition) = condition {
                            if let Ok(cond) = ConditionItem::try_from(condition.clone()) {
                                Some(cond)
                            } else {
                                InvalidLoaderRuleConditionIssue {
                                    condition: condition.clone(),
                                    config_file_path: self
                                        .config_file_path(project_path.clone())
                                        .owned()
                                        .await?,
                                }
                                .resolved_cell()
                                .emit();
                                None
                            }
                        } else {
                            None
                        };
                        rules.push((
                            glob.clone(),
                            LoaderRuleItem {
                                loaders: transform_loaders(&mut loaders.iter()),
                                rename_as: rename_as.clone(),
                                condition,
                            },
                        ));
                    }
                }
            }
        }
        Ok(Vc::cell(rules))
    }

    #[turbo_tasks::function]
    pub fn persistent_caching_enabled(&self) -> Result<Vc<bool>> {
        Ok(Vc::cell(
            self.experimental
                .turbopack_persistent_caching
                .unwrap_or_default(),
        ))
    }

    #[turbo_tasks::function]
    pub fn resolve_alias_options(&self) -> Result<Vc<ResolveAliasMap>> {
        let Some(resolve_alias) = self
            .turbopack
            .as_ref()
            .and_then(|t| t.resolve_alias.as_ref())
        else {
            return Ok(ResolveAliasMap::cell(ResolveAliasMap::default()));
        };
        let alias_map: ResolveAliasMap = resolve_alias.try_into()?;
        Ok(alias_map.cell())
    }

    #[turbo_tasks::function]
    pub fn resolve_extension(&self) -> Vc<ResolveExtensions> {
        let Some(resolve_extensions) = self
            .turbopack
            .as_ref()
            .and_then(|t| t.resolve_extensions.as_ref())
        else {
            return Vc::cell(None);
        };
        Vc::cell(Some(resolve_extensions.clone()))
    }

    #[turbo_tasks::function]
    pub fn import_externals(&self) -> Result<Vc<bool>> {
        Ok(Vc::cell(match self.experimental.esm_externals {
            Some(EsmExternals::Bool(b)) => b,
            Some(EsmExternals::Loose(_)) => bail!("esmExternals = \"loose\" is not supported"),
            None => true,
        }))
    }

    #[turbo_tasks::function]
    pub fn inline_css(&self) -> Vc<bool> {
        Vc::cell(self.experimental.inline_css.unwrap_or(false))
    }

    #[turbo_tasks::function]
    pub fn mdx_rs(&self) -> Vc<OptionalMdxTransformOptions> {
        let options = &self.experimental.mdx_rs;

        let options = match options {
            Some(MdxRsOptions::Boolean(true)) => OptionalMdxTransformOptions(Some(
                MdxTransformOptions {
                    provider_import_source: Some(mdx_import_source_file()),
                    ..Default::default()
                }
                .resolved_cell(),
            )),
            Some(MdxRsOptions::Option(options)) => OptionalMdxTransformOptions(Some(
                MdxTransformOptions {
                    provider_import_source: Some(
                        options
                            .provider_import_source
                            .clone()
                            .unwrap_or(mdx_import_source_file()),
                    ),
                    ..options.clone()
                }
                .resolved_cell(),
            )),
            _ => OptionalMdxTransformOptions(None),
        };

        options.cell()
    }

    #[turbo_tasks::function]
    pub fn modularize_imports(&self) -> Vc<ModularizeImports> {
        Vc::cell(self.modularize_imports.clone().unwrap_or_default())
    }

    #[turbo_tasks::function]
    pub fn dist_dir(&self) -> Vc<RcStr> {
        Vc::cell(self.dist_dir.clone())
    }
    #[turbo_tasks::function]
    pub fn dist_dir_root(&self) -> Vc<RcStr> {
        Vc::cell(self.dist_dir_root.clone())
    }

    #[turbo_tasks::function]
    pub fn experimental_cache_handlers(
        &self,
        project_path: FileSystemPath,
    ) -> Result<Vc<FileSystemPathVec>> {
        if let Some(handlers) = &self.experimental.cache_handlers {
            Ok(Vc::cell(
                handlers
                    .values()
                    .map(|h| project_path.join(h))
                    .collect::<Result<Vec<_>>>()?,
            ))
        } else {
            Ok(Vc::cell(vec![]))
        }
    }

    #[turbo_tasks::function]
    pub fn experimental_swc_plugins(&self) -> Vc<SwcPlugins> {
        Vc::cell(self.experimental.swc_plugins.clone().unwrap_or_default())
    }

    #[turbo_tasks::function]
    pub fn experimental_sri(&self) -> Vc<OptionSubResourceIntegrity> {
        Vc::cell(self.experimental.sri.clone())
    }

    #[turbo_tasks::function]
    pub fn experimental_server_actions(&self) -> Vc<OptionServerActions> {
        Vc::cell(match self.experimental.server_actions.as_ref() {
            Some(ServerActionsOrLegacyBool::ServerActionsConfig(server_actions)) => {
                Some(server_actions.clone())
            }
            Some(ServerActionsOrLegacyBool::LegacyBool(true)) => Some(ServerActions::default()),
            _ => None,
        })
    }

    #[turbo_tasks::function]
    pub fn experimental_turbopack_use_builtin_babel(&self) -> Vc<Option<bool>> {
        Vc::cell(self.experimental.turbopack_use_builtin_babel)
    }

    #[turbo_tasks::function]
    pub fn experimental_turbopack_use_builtin_sass(&self) -> Vc<Option<bool>> {
        Vc::cell(self.experimental.turbopack_use_builtin_sass)
    }

    #[turbo_tasks::function]
    pub fn react_compiler_options(&self) -> Vc<OptionalReactCompilerOptions> {
        let options = &self.react_compiler;

        let options = match options {
            Some(ReactCompilerOptionsOrBoolean::Boolean(true)) => {
                OptionalReactCompilerOptions(Some(ReactCompilerOptions::default().resolved_cell()))
            }
            Some(ReactCompilerOptionsOrBoolean::Option(options)) => OptionalReactCompilerOptions(
                Some(ReactCompilerOptions { ..options.clone() }.resolved_cell()),
            ),
            _ => OptionalReactCompilerOptions(None),
        };

        options.cell()
    }

    #[turbo_tasks::function]
    pub fn sass_config(&self) -> Vc<JsonValue> {
        Vc::cell(self.sass_options.clone().unwrap_or_default())
    }

    #[turbo_tasks::function]
    pub fn skip_proxy_url_normalize(&self) -> Vc<bool> {
        Vc::cell(self.skip_proxy_url_normalize.unwrap_or(false))
    }

    #[turbo_tasks::function]
    pub fn skip_trailing_slash_redirect(&self) -> Vc<bool> {
        Vc::cell(self.skip_trailing_slash_redirect.unwrap_or(false))
    }

    /// Returns the final asset prefix. If an assetPrefix is set, it's used.
    /// Otherwise, the basePath is used.
    #[turbo_tasks::function]
    pub async fn computed_asset_prefix(self: Vc<Self>) -> Result<Vc<RcStr>> {
        let this = self.await?;

        Ok(Vc::cell(
            format!(
                "{}/_next/",
                if let Some(asset_prefix) = &this.asset_prefix {
                    asset_prefix
                } else {
                    this.base_path.as_ref().map_or("", |b| b.as_str())
                }
                .trim_end_matches('/')
            )
            .into(),
        ))
    }

    /// Returns the suffix to use for chunk loading.
    #[turbo_tasks::function]
    pub async fn chunk_suffix_path(self: Vc<Self>) -> Result<Vc<Option<RcStr>>> {
        let this = self.await?;

        match &this.deployment_id {
            Some(deployment_id) => Ok(Vc::cell(Some(format!("?dpl={deployment_id}").into()))),
            None => Ok(Vc::cell(None)),
        }
    }

    #[turbo_tasks::function]
    pub fn enable_ppr(&self) -> Vc<bool> {
        Vc::cell(
            self.experimental
                .ppr
                .as_ref()
                .map(|ppr| match ppr {
                    ExperimentalPartialPrerendering::Incremental(
                        ExperimentalPartialPrerenderingIncrementalValue::Incremental,
                    ) => true,
                    ExperimentalPartialPrerendering::Boolean(b) => *b,
                })
                .unwrap_or(false),
        )
    }

    #[turbo_tasks::function]
    pub fn enable_taint(&self) -> Vc<bool> {
        Vc::cell(self.experimental.taint.unwrap_or(false))
    }

    #[turbo_tasks::function]
    pub fn enable_cache_components(&self) -> Vc<bool> {
        Vc::cell(self.cache_components.unwrap_or(false))
    }

    #[turbo_tasks::function]
    pub fn enable_use_cache(&self) -> Vc<bool> {
        Vc::cell(
            self.experimental
                .use_cache
                // "use cache" was originally implicitly enabled with the
                // cacheComponents flag, so we transfer the value for cacheComponents to the
                // explicit useCache flag to ensure backwards compatibility.
                .unwrap_or(self.cache_components.unwrap_or(false)),
        )
    }

    #[turbo_tasks::function]
    pub fn enable_root_params(&self) -> Vc<bool> {
        Vc::cell(
            self.experimental
                .root_params
                // rootParams should be enabled implicitly in cacheComponents.
                .unwrap_or(self.cache_components.unwrap_or(false)),
        )
    }

    #[turbo_tasks::function]
    pub fn cache_kinds(&self) -> Vc<CacheKinds> {
        let mut cache_kinds = CacheKinds::default();

        if let Some(handlers) = self.experimental.cache_handlers.as_ref() {
            cache_kinds.extend(handlers.keys().cloned());
        }

        cache_kinds.cell()
    }

    #[turbo_tasks::function]
    pub fn optimize_package_imports(&self) -> Vc<Vec<RcStr>> {
        Vc::cell(
            self.experimental
                .optimize_package_imports
                .clone()
                .unwrap_or_default(),
        )
    }

    #[turbo_tasks::function]
    pub fn tree_shaking_mode_for_foreign_code(
        &self,
        _is_development: bool,
    ) -> Vc<OptionTreeShaking> {
        OptionTreeShaking(match self.experimental.turbopack_tree_shaking {
            Some(false) => Some(TreeShakingMode::ReexportsOnly),
            Some(true) => Some(TreeShakingMode::ModuleFragments),
            None => Some(TreeShakingMode::ReexportsOnly),
        })
        .cell()
    }

    #[turbo_tasks::function]
    pub fn tree_shaking_mode_for_user_code(&self, _is_development: bool) -> Vc<OptionTreeShaking> {
        OptionTreeShaking(match self.experimental.turbopack_tree_shaking {
            Some(false) => Some(TreeShakingMode::ReexportsOnly),
            Some(true) => Some(TreeShakingMode::ModuleFragments),
            None => Some(TreeShakingMode::ReexportsOnly),
        })
        .cell()
    }

    #[turbo_tasks::function]
    pub async fn turbopack_remove_unused_exports(&self, mode: Vc<NextMode>) -> Result<Vc<bool>> {
        Ok(Vc::cell(
            self.experimental
                .turbopack_remove_unused_exports
                .unwrap_or(matches!(*mode.await?, NextMode::Build)),
        ))
    }

    #[turbo_tasks::function]
    pub async fn module_ids(&self, mode: Vc<NextMode>) -> Result<Vc<ModuleIds>> {
        Ok(match *mode.await? {
            // Ignore configuration in development mode, HMR only works with `named`
            NextMode::Development => ModuleIds::Named.cell(),
            NextMode::Build => self
                .experimental
                .turbopack_module_ids
                .unwrap_or(ModuleIds::Deterministic)
                .cell(),
        })
    }

    #[turbo_tasks::function]
    pub async fn turbo_minify(&self, mode: Vc<NextMode>) -> Result<Vc<bool>> {
        let minify = self.experimental.turbopack_minify;
        Ok(Vc::cell(
            minify.unwrap_or(matches!(*mode.await?, NextMode::Build)),
        ))
    }

    #[turbo_tasks::function]
    pub async fn turbo_scope_hoisting(&self, mode: Vc<NextMode>) -> Result<Vc<bool>> {
        Ok(Vc::cell(match *mode.await? {
            // Ignore configuration in development mode to not break HMR
            NextMode::Development => false,
            NextMode::Build => self.experimental.turbopack_scope_hoisting.unwrap_or(true),
        }))
    }

    #[turbo_tasks::function]
    pub async fn turbopack_import_type_bytes(&self) -> Vc<bool> {
        Vc::cell(
            self.experimental
                .turbopack_import_type_bytes
                .unwrap_or(false),
        )
    }

    #[turbo_tasks::function]
    pub async fn client_source_maps(&self, mode: Vc<NextMode>) -> Result<Vc<bool>> {
        let source_maps = self.experimental.turbopack_source_maps;
        Ok(Vc::cell(source_maps.unwrap_or(match &*mode.await? {
            NextMode::Development => true,
            NextMode::Build => self.production_browser_source_maps,
        })))
    }

    #[turbo_tasks::function]
    pub fn server_source_maps(&self) -> Result<Vc<bool>> {
        let source_maps = self.experimental.turbopack_source_maps;
        Ok(Vc::cell(source_maps.unwrap_or(true)))
    }

    #[turbo_tasks::function]
    pub fn turbopack_debug_ids(&self) -> Vc<bool> {
        Vc::cell(
            self.turbopack
                .as_ref()
                .and_then(|turbopack| turbopack.debug_ids)
                .unwrap_or(false),
        )
    }

    #[turbo_tasks::function]
    pub fn typescript_tsconfig_path(&self) -> Result<Vc<Option<RcStr>>> {
        Ok(Vc::cell(
            self.typescript
                .tsconfig_path
                .as_ref()
                .map(|path| path.to_owned().into()),
        ))
    }

    #[turbo_tasks::function]
    pub fn cross_origin(&self) -> Vc<OptionCrossOriginConfig> {
        Vc::cell(self.cross_origin.clone())
    }

    #[turbo_tasks::function]
    pub fn i18n(&self) -> Vc<OptionI18NConfig> {
        Vc::cell(self.i18n.clone())
    }

    #[turbo_tasks::function]
    pub fn output(&self) -> Vc<OptionOutputType> {
        Vc::cell(self.output.clone())
    }

    #[turbo_tasks::function]
    pub fn output_file_tracing_includes(&self) -> Vc<OptionJsonValue> {
        Vc::cell(self.output_file_tracing_includes.clone())
    }

    #[turbo_tasks::function]
    pub fn output_file_tracing_excludes(&self) -> Vc<OptionJsonValue> {
        Vc::cell(self.output_file_tracing_excludes.clone())
    }

    #[turbo_tasks::function]
    pub async fn fetch_client(
        &self,
        env: Vc<Box<dyn ProcessEnv>>,
    ) -> Result<Vc<FetchClientConfig>> {
        // Support both an env var and the experimental flag to provide more flexibility to
        // developers on locked down systems, depending on if they want to configure this on a
        // per-system or per-project basis.
        let use_system_tls_certs = env
            .read(rcstr!("NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS"))
            .await?
            .as_ref()
            .and_then(|env_value| {
                // treat empty value same as an unset value
                (!env_value.is_empty()).then(|| env_value == "1" || env_value == "true")
            })
            .or(self.experimental.turbopack_use_system_tls_certs)
            .unwrap_or(false);
        Ok(FetchClientConfig {
            tls_built_in_webpki_certs: !use_system_tls_certs,
            tls_built_in_native_certs: use_system_tls_certs,
        }
        .cell())
    }
}

/// A subset of ts/jsconfig that next.js implicitly
/// interops with.
#[turbo_tasks::value(serialization = "custom", eq = "manual")]
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsConfig {
    compiler_options: Option<serde_json::Value>,
}

#[turbo_tasks::value_impl]
impl JsConfig {
    #[turbo_tasks::function]
    pub async fn from_string(string: Vc<RcStr>) -> Result<Vc<Self>> {
        let string = string.await?;
        let config: JsConfig = serde_json::from_str(&string)
            .with_context(|| format!("failed to parse next.config.js: {string}"))?;

        Ok(config.cell())
    }

    #[turbo_tasks::function]
    pub fn compiler_options(&self) -> Vc<serde_json::Value> {
        Vc::cell(self.compiler_options.clone().unwrap_or_default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_serde_rule_config_item_options() {
        let json_value = serde_json::json!({
            "loaders": [],
            "as": "*.js",
            "condition": {
                "all": [
                    "production",
                    {"not": "foreign"},
                    {"any": [
                        "browser",
                        {
                            "path": { "type": "glob", "value": "*.svg"},
                            "content": {
                                "source": "@someTag",
                                "flags": ""
                            }
                        }
                    ]},
                ],
            }
        });

        let rule_config: RuleConfigItem = serde_json::from_value(json_value).unwrap();

        assert_eq!(
            rule_config,
            RuleConfigItem {
                loaders: vec![],
                rename_as: Some(rcstr!("*.js")),
                condition: Some(ConfigConditionItem::All(
                    [
                        ConfigConditionItem::Builtin(WebpackLoaderBuiltinCondition::Production),
                        ConfigConditionItem::Not(Box::new(ConfigConditionItem::Builtin(
                            WebpackLoaderBuiltinCondition::Foreign
                        ))),
                        ConfigConditionItem::Any(
                            vec![
                                ConfigConditionItem::Builtin(
                                    WebpackLoaderBuiltinCondition::Browser
                                ),
                                ConfigConditionItem::Base {
                                    path: Some(ConfigConditionPath::Glob(rcstr!("*.svg"))),
                                    content: Some(RegexComponents {
                                        source: rcstr!("@someTag"),
                                        flags: rcstr!(""),
                                    }),
                                },
                            ]
                            .into(),
                        ),
                    ]
                    .into(),
                )),
            }
        );
    }
}
