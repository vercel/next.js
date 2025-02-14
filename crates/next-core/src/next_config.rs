use anyhow::{bail, Context, Result};
use rustc_hash::FxHashSet;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value as JsonValue;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    debug::ValueDebugFormat, trace::TraceRawVcs, FxIndexMap, NonLocalValue, OperationValue,
    ResolvedVc, TaskInput, Vc,
};
use turbo_tasks_env::EnvMap;
use turbo_tasks_fs::FileSystemPath;
use turbopack::module_options::{
    module_options_context::MdxTransformOptions, LoaderRuleItem, OptionWebpackRules,
};
use turbopack_core::{
    issue::{Issue, IssueSeverity, IssueStage, OptionStyledString, StyledString},
    resolve::ResolveAliasMap,
};
use turbopack_ecmascript::{OptionTreeShaking, TreeShakingMode};
use turbopack_ecmascript_plugins::transform::{
    emotion::EmotionTransformConfig, relay::RelayConfig,
    styled_components::StyledComponentsTransformConfig,
};
use turbopack_node::transforms::webpack::{WebpackLoaderItem, WebpackLoaderItems};

use crate::{
    mode::NextMode, next_import_map::mdx_import_source_file,
    next_shared::transforms::ModularizeImportPackageConfig,
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
pub struct CacheKinds(FxHashSet<RcStr>);

#[turbo_tasks::value(serialization = "custom", eq = "manual")]
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, OperationValue)]
#[serde(rename_all = "camelCase")]
pub struct NextConfig {
    // TODO all fields should be private and access should be wrapped within a turbo-tasks function
    // Otherwise changing NextConfig will lead to invalidating all tasks accessing it.
    pub config_file: Option<RcStr>,
    pub config_file_name: RcStr,

    /// In-memory cache size in bytes.
    ///
    /// If `cache_max_memory_size: 0` disables in-memory caching.
    pub cache_max_memory_size: Option<f64>,
    /// custom path to a cache handler to use
    pub cache_handler: Option<RcStr>,

    pub env: FxIndexMap<String, JsonValue>,
    pub experimental: ExperimentalConfig,
    pub images: ImageConfig,
    pub page_extensions: Vec<RcStr>,
    pub react_production_profiling: Option<bool>,
    pub react_strict_mode: Option<bool>,
    pub transpile_packages: Option<Vec<RcStr>>,
    pub modularize_imports: Option<FxIndexMap<String, ModularizeImportPackageConfig>>,
    pub dist_dir: Option<RcStr>,
    sass_options: Option<serde_json::Value>,
    pub trailing_slash: Option<bool>,
    pub asset_prefix: Option<RcStr>,
    pub base_path: Option<RcStr>,
    pub skip_middleware_url_normalize: Option<bool>,
    pub skip_trailing_slash_redirect: Option<bool>,
    pub i18n: Option<I18NConfig>,
    pub cross_origin: Option<CrossOriginConfig>,
    pub dev_indicators: Option<DevIndicatorsConfig>,
    pub output: Option<OutputType>,

    /// Enables the bundling of node_modules packages (externals) for pages
    /// server-side bundles.
    ///
    /// [API Reference](https://nextjs.org/docs/pages/api-reference/next-config-js/bundlePagesRouterDependencies)
    pub bundle_pages_router_dependencies: Option<bool>,

    /// A list of packages that should be treated as external on the server
    /// build.
    ///
    /// [API Reference](https://nextjs.org/docs/app/api-reference/next-config-js/serverExternalPackages)
    pub server_external_packages: Option<Vec<RcStr>>,

    #[serde(rename = "_originalRedirects")]
    pub original_redirects: Option<Vec<Redirect>>,

    // Partially supported
    pub compiler: Option<CompilerConfig>,

    pub optimize_fonts: Option<bool>,

    // unsupported
    amp: AmpConfig,
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
    production_browser_source_maps: bool,
    public_runtime_config: FxIndexMap<String, serde_json::Value>,
    server_runtime_config: FxIndexMap<String, serde_json::Value>,
    static_page_generation_timeout: f64,
    target: Option<String>,
    typescript: TypeScriptConfig,
    use_file_system_public_routes: bool,
    webpack: Option<serde_json::Value>,
}

#[derive(
    Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(rename_all = "kebab-case")]
pub enum CrossOriginConfig {
    Anonymous,
    UseCredentials,
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
struct AmpConfig {
    canonical_base: Option<String>,
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
pub struct DevIndicatorsConfig {
    pub build_activity: Option<bool>,
    pub build_activity_position: Option<BuildActivityPositions>,
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
    Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(rename_all = "camelCase")]
pub struct DomainLocale {
    pub default_locale: String,
    pub domain: String,
    pub http: Option<bool>,
    pub locales: Option<Vec<String>>,
}

#[derive(
    Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(rename_all = "camelCase")]
pub struct I18NConfig {
    pub default_locale: String,
    pub domains: Option<Vec<DomainLocale>>,
    pub locale_detection: Option<bool>,
    pub locales: Vec<String>,
}

#[derive(
    Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(rename_all = "kebab-case")]
pub enum OutputType {
    Standalone,
    Export,
}

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
    pub ts_config_path: Option<String>,
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
            image_sizes: vec![16, 32, 48, 64, 96, 128, 256, 384],
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
    pub protocol: Option<RemotePatternProtocal>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub port: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pathname: Option<String>,
}

#[derive(
    Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(rename_all = "kebab-case")]
pub enum RemotePatternProtocal {
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
pub struct ExperimentalTurboConfig {
    /// This option has been replaced by `rules`.
    pub loaders: Option<JsonValue>,
    pub rules: Option<FxIndexMap<RcStr, RuleConfigItemOrShortcut>>,
    pub resolve_alias: Option<FxIndexMap<RcStr, JsonValue>>,
    pub resolve_extensions: Option<Vec<RcStr>>,
    pub tree_shaking: Option<bool>,
    pub module_id_strategy: Option<ModuleIdStrategy>,
    pub minify: Option<bool>,
    pub source_maps: Option<bool>,
    pub unstable_persistent_caching: Option<bool>,
}

#[derive(
    Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(rename_all = "camelCase")]
pub struct RuleConfigItemOptions {
    pub loaders: Vec<LoaderItem>,
    #[serde(default, alias = "as")]
    pub rename_as: Option<RcStr>,
}

#[derive(
    Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(rename_all = "camelCase", untagged)]
pub enum RuleConfigItemOrShortcut {
    Loaders(Vec<LoaderItem>),
    Advanced(RuleConfigItem),
}

#[derive(
    Clone, Debug, PartialEq, Eq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(rename_all = "camelCase", untagged)]
pub enum RuleConfigItem {
    Options(RuleConfigItemOptions),
    Conditional(FxIndexMap<RcStr, RuleConfigItem>),
    Boolean(bool),
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
pub enum ModuleIdStrategy {
    Named,
    Deterministic,
}

#[turbo_tasks::value(transparent)]
pub struct OptionModuleIdStrategy(pub Option<ModuleIdStrategy>);

#[derive(
    Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue, OperationValue,
)]
#[serde(untagged)]
pub enum MdxRsOptions {
    Boolean(bool),
    Option(MdxTransformOptions),
}

#[turbo_tasks::value(shared, operation)]
#[derive(Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub enum ReactCompilerMode {
    Infer,
    Annotation,
    All,
}

/// Subset of react compiler options
#[turbo_tasks::value(shared, operation)]
#[derive(Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReactCompilerOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compilation_mode: Option<ReactCompilerMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub panic_threshold: Option<RcStr>,
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
    turbo: Option<ExperimentalTurboConfig>,
    external_middleware_rewrites_resolve: Option<bool>,
    scroll_restoration: Option<bool>,
    use_deployment_id: Option<bool>,
    use_deployment_id_server_actions: Option<bool>,
    deployment_id: Option<RcStr>,
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
    react_compiler: Option<ReactCompilerOptionsOrBoolean>,
    #[serde(rename = "dynamicIO")]
    dynamic_io: Option<bool>,
    use_cache: Option<bool>,
    // ---
    // UNSUPPORTED
    // ---
    adjust_font_fallbacks: Option<bool>,
    adjust_font_fallbacks_with_size_adjust: Option<bool>,
    after: Option<bool>,
    amp: Option<serde_json::Value>,
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
    output_file_tracing_ignores: Option<Vec<RcStr>>,
    output_file_tracing_includes: Option<serde_json::Value>,
    output_file_tracing_root: Option<RcStr>,
    /// Using this feature will enable the `react@experimental` for the `app`
    /// directory.
    ppr: Option<ExperimentalPartialPrerendering>,
    taint: Option<bool>,
    react_owner_stack: Option<bool>,
    proxy_timeout: Option<f64>,
    /// enables the minification of server code.
    server_minification: Option<bool>,
    /// Enables source maps generation for the server production bundle.
    server_source_maps: Option<bool>,
    swc_trace_profiling: Option<bool>,
    /// @internal Used by the Next.js internals only.
    trust_host_header: Option<bool>,
    /// Generate Route types and enable type checking for Link and Router.push,
    /// etc. This option requires `appDir` to be enabled first.
    /// @see [api reference](https://nextjs.org/docs/app/api-reference/next-config-js/typedRoutes)
    typed_routes: Option<bool>,
    url_imports: Option<serde_json::Value>,
    view_transition: Option<bool>,
    /// This option is to enable running the Webpack build in a worker thread
    /// (doesn't apply to Turbopack).
    webpack_build_worker: Option<bool>,
    worker_threads: Option<bool>,
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
pub struct OptionServerActions(Option<ServerActions>);

#[turbo_tasks::value_impl]
impl NextConfig {
    #[turbo_tasks::function]
    pub async fn from_string(string: Vc<RcStr>) -> Result<Vc<Self>> {
        let string = string.await?;
        let config: NextConfig = serde_json::from_str(&string)
            .with_context(|| format!("failed to parse next.config.js: {}", string))?;
        Ok(config.cell())
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
    pub fn cache_handler(&self) -> Vc<Option<RcStr>> {
        Vc::cell(self.cache_handler.clone())
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
        Vc::cell(self.page_extensions.clone())
    }

    #[turbo_tasks::function]
    pub fn transpile_packages(&self) -> Vc<Vec<RcStr>> {
        Vc::cell(self.transpile_packages.clone().unwrap_or_default())
    }

    #[turbo_tasks::function]
    pub fn webpack_rules(&self, active_conditions: Vec<RcStr>) -> Vc<OptionWebpackRules> {
        let Some(turbo_rules) = self
            .experimental
            .turbo
            .as_ref()
            .and_then(|t| t.rules.as_ref())
        else {
            return Vc::cell(None);
        };
        if turbo_rules.is_empty() {
            return Vc::cell(None);
        }
        let active_conditions = active_conditions.into_iter().collect::<FxHashSet<_>>();
        let mut rules = FxIndexMap::default();
        for (ext, rule) in turbo_rules.iter() {
            fn transform_loaders(loaders: &[LoaderItem]) -> ResolvedVc<WebpackLoaderItems> {
                ResolvedVc::cell(
                    loaders
                        .iter()
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
            enum FindRuleResult<'a> {
                Found(&'a RuleConfigItemOptions),
                NotFound,
                Break,
            }
            fn find_rule<'a>(
                rule: &'a RuleConfigItem,
                active_conditions: &FxHashSet<RcStr>,
            ) -> FindRuleResult<'a> {
                match rule {
                    RuleConfigItem::Options(rule) => FindRuleResult::Found(rule),
                    RuleConfigItem::Conditional(map) => {
                        for (condition, rule) in map.iter() {
                            if condition == "default" || active_conditions.contains(condition) {
                                match find_rule(rule, active_conditions) {
                                    FindRuleResult::Found(rule) => {
                                        return FindRuleResult::Found(rule);
                                    }
                                    FindRuleResult::Break => {
                                        return FindRuleResult::Break;
                                    }
                                    FindRuleResult::NotFound => {}
                                }
                            }
                        }
                        FindRuleResult::NotFound
                    }
                    RuleConfigItem::Boolean(_) => FindRuleResult::Break,
                }
            }
            match rule {
                RuleConfigItemOrShortcut::Loaders(loaders) => {
                    rules.insert(
                        ext.clone(),
                        LoaderRuleItem {
                            loaders: transform_loaders(loaders),
                            rename_as: None,
                        },
                    );
                }
                RuleConfigItemOrShortcut::Advanced(rule) => {
                    if let FindRuleResult::Found(RuleConfigItemOptions { loaders, rename_as }) =
                        find_rule(rule, &active_conditions)
                    {
                        rules.insert(
                            ext.clone(),
                            LoaderRuleItem {
                                loaders: transform_loaders(loaders),
                                rename_as: rename_as.clone(),
                            },
                        );
                    }
                }
            }
        }
        Vc::cell(Some(ResolvedVc::cell(rules)))
    }

    #[turbo_tasks::function]
    pub fn persistent_caching_enabled(&self) -> Result<Vc<bool>> {
        Ok(Vc::cell(
            self.experimental
                .turbo
                .as_ref()
                .and_then(|t| t.unstable_persistent_caching)
                .unwrap_or_default(),
        ))
    }

    #[turbo_tasks::function]
    pub fn resolve_alias_options(&self) -> Result<Vc<ResolveAliasMap>> {
        let Some(resolve_alias) = self
            .experimental
            .turbo
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
            .experimental
            .turbo
            .as_ref()
            .and_then(|t| t.resolve_extensions.as_ref())
        else {
            return Vc::cell(None);
        };
        Vc::cell(Some(resolve_extensions.clone()))
    }

    #[turbo_tasks::function]
    pub async fn import_externals(&self) -> Result<Vc<bool>> {
        Ok(Vc::cell(match self.experimental.esm_externals {
            Some(EsmExternals::Bool(b)) => b,
            Some(EsmExternals::Loose(_)) => bail!("esmExternals = \"loose\" is not supported"),
            None => true,
        }))
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
    pub fn react_compiler(&self) -> Vc<OptionalReactCompilerOptions> {
        let options = &self.experimental.react_compiler;

        let options = match options {
            Some(ReactCompilerOptionsOrBoolean::Boolean(true)) => {
                OptionalReactCompilerOptions(Some(
                    ReactCompilerOptions {
                        compilation_mode: None,
                        panic_threshold: None,
                    }
                    .resolved_cell(),
                ))
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
    pub fn skip_middleware_url_normalize(&self) -> Vc<bool> {
        Vc::cell(self.skip_middleware_url_normalize.unwrap_or(false))
    }

    #[turbo_tasks::function]
    pub fn skip_trailing_slash_redirect(&self) -> Vc<bool> {
        Vc::cell(self.skip_trailing_slash_redirect.unwrap_or(false))
    }

    /// Returns the final asset prefix. If an assetPrefix is set, it's used.
    /// Otherwise, the basePath is used.
    #[turbo_tasks::function]
    pub async fn computed_asset_prefix(self: Vc<Self>) -> Result<Vc<Option<RcStr>>> {
        let this = self.await?;

        Ok(Vc::cell(Some(
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
        )))
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
    pub fn enable_react_owner_stack(&self) -> Vc<bool> {
        Vc::cell(self.experimental.react_owner_stack.unwrap_or(false))
    }

    #[turbo_tasks::function]
    pub fn enable_view_transition(&self) -> Vc<bool> {
        Vc::cell(self.experimental.view_transition.unwrap_or(false))
    }

    #[turbo_tasks::function]
    pub fn enable_dynamic_io(&self) -> Vc<bool> {
        Vc::cell(self.experimental.dynamic_io.unwrap_or(false))
    }

    #[turbo_tasks::function]
    pub fn enable_use_cache(&self) -> Vc<bool> {
        Vc::cell(
            self.experimental
                .use_cache
                // "use cache" was originally implicitly enabled with the
                // dynamicIO flag, so we transfer the value for dynamicIO to the
                // explicit useCache flag to ensure backwards compatibility.
                .unwrap_or(self.experimental.dynamic_io.unwrap_or(false)),
        )
    }

    #[turbo_tasks::function]
    pub fn cache_kinds(&self) -> Vc<CacheKinds> {
        Vc::cell(
            self.experimental
                .cache_handlers
                .as_ref()
                .map(|handlers| handlers.keys().cloned().collect())
                .unwrap_or_default(),
        )
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
        let tree_shaking = self
            .experimental
            .turbo
            .as_ref()
            .and_then(|v| v.tree_shaking);

        OptionTreeShaking(match tree_shaking {
            Some(false) => Some(TreeShakingMode::ReexportsOnly),
            Some(true) => Some(TreeShakingMode::ModuleFragments),
            None => Some(TreeShakingMode::ReexportsOnly),
        })
        .cell()
    }

    #[turbo_tasks::function]
    pub fn tree_shaking_mode_for_user_code(&self, _is_development: bool) -> Vc<OptionTreeShaking> {
        let tree_shaking = self
            .experimental
            .turbo
            .as_ref()
            .and_then(|v| v.tree_shaking);

        OptionTreeShaking(match tree_shaking {
            Some(false) => Some(TreeShakingMode::ReexportsOnly),
            Some(true) => Some(TreeShakingMode::ModuleFragments),
            None => Some(TreeShakingMode::ReexportsOnly),
        })
        .cell()
    }

    #[turbo_tasks::function]
    pub fn module_id_strategy_config(&self) -> Vc<OptionModuleIdStrategy> {
        let Some(module_id_strategy) = self
            .experimental
            .turbo
            .as_ref()
            .and_then(|t| t.module_id_strategy)
        else {
            return Vc::cell(None);
        };
        Vc::cell(Some(module_id_strategy))
    }

    #[turbo_tasks::function]
    pub async fn turbo_minify(&self, mode: Vc<NextMode>) -> Result<Vc<bool>> {
        let minify = self.experimental.turbo.as_ref().and_then(|t| t.minify);

        Ok(Vc::cell(
            minify.unwrap_or(matches!(*mode.await?, NextMode::Build)),
        ))
    }

    #[turbo_tasks::function]
    pub async fn turbo_source_maps(&self) -> Result<Vc<bool>> {
        let source_maps = self.experimental.turbo.as_ref().and_then(|t| t.source_maps);

        Ok(Vc::cell(source_maps.unwrap_or(true)))
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
            .with_context(|| format!("failed to parse next.config.js: {}", string))?;

        Ok(config.cell())
    }

    #[turbo_tasks::function]
    pub fn compiler_options(&self) -> Vc<serde_json::Value> {
        Vc::cell(self.compiler_options.clone().unwrap_or_default())
    }
}

#[turbo_tasks::value]
struct OutdatedConfigIssue {
    path: ResolvedVc<FileSystemPath>,
    old_name: RcStr,
    new_name: RcStr,
    description: RcStr,
}

#[turbo_tasks::value_impl]
impl Issue for OutdatedConfigIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        IssueSeverity::Error.into()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Config.into()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        *self.path
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Line(vec![
            StyledString::Code(self.old_name.clone()),
            StyledString::Text(" has been replaced by ".into()),
            StyledString::Code(self.new_name.clone()),
        ])
        .cell()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(
            StyledString::Text(self.description.clone()).resolved_cell(),
        ))
    }
}
