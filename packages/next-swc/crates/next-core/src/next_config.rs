use anyhow::{Context, Result};
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use turbo_tasks::{trace::TraceRawVcs, Completion, Value, Vc};
use turbo_tasks_fs::json::parse_json_with_source_context;
use turbopack_binding::{
    turbo::{tasks_env::EnvMap, tasks_fs::FileSystemPath},
    turbopack::{
        core::{
            changed::any_content_changed_of_module,
            chunk::ChunkingContext,
            context::AssetContext,
            file_source::FileSource,
            ident::AssetIdent,
            issue::{Issue, IssueDescriptionExt, IssueExt, IssueSeverity},
            reference_type::{EntryReferenceSubType, InnerAssets, ReferenceType},
            resolve::{
                find_context_file,
                options::{ImportMap, ImportMapping},
                FindContextFileResult, ResolveAliasMap,
            },
            source::Source,
        },
        ecmascript_plugin::transform::{
            emotion::EmotionTransformConfig, relay::RelayConfig,
            styled_components::StyledComponentsTransformConfig,
        },
        node::{
            debug::should_debug,
            evaluate::evaluate,
            execution_context::ExecutionContext,
            transforms::webpack::{WebpackLoaderItem, WebpackLoaderItems},
        },
        turbopack::{
            evaluate_context::node_evaluate_asset_context,
            module_options::{LoaderRuleItem, OptionWebpackRules},
        },
    },
};

use crate::{embed_js::next_asset, next_shared::transforms::ModularizeImportPackageConfig};

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NextConfigAndCustomRoutesRaw {
    config: NextConfig,
    custom_routes: CustomRoutesRaw,
}

#[turbo_tasks::value]
struct NextConfigAndCustomRoutes {
    config: Vc<NextConfig>,
    custom_routes: Vc<CustomRoutes>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CustomRoutesRaw {
    rewrites: Rewrites,

    // unsupported
    headers: Vec<Header>,
    redirects: Vec<Redirect>,
}

#[turbo_tasks::value]
struct CustomRoutes {
    rewrites: Vc<Rewrites>,
}

#[turbo_tasks::value(serialization = "custom", eq = "manual")]
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NextConfig {
    pub config_file: Option<String>,
    pub config_file_name: String,

    pub env: IndexMap<String, JsonValue>,
    pub experimental: ExperimentalConfig,
    pub images: ImageConfig,
    pub page_extensions: Vec<String>,
    pub react_strict_mode: Option<bool>,
    pub transpile_packages: Option<Vec<String>>,
    pub modularize_imports: Option<IndexMap<String, ModularizeImportPackageConfig>>,
    pub dist_dir: Option<String>,
    sass_options: Option<serde_json::Value>,
    pub trailing_slash: Option<bool>,
    pub asset_prefix: Option<String>,
    pub base_path: Option<String>,

    // Partially supported
    pub compiler: Option<CompilerConfig>,

    pub output: Option<OutputType>,

    // unsupported
    cross_origin: Option<String>,
    amp: AmpConfig,
    analytics_id: String,
    clean_dist_dir: bool,
    compress: bool,
    dev_indicators: DevIndicatorsConfig,
    eslint: EslintConfig,
    exclude_default_moment_locales: bool,
    // this can be a function in js land
    export_path_map: Option<serde_json::Value>,
    // this is a function in js land
    generate_build_id: Option<serde_json::Value>,
    generate_etags: bool,
    http_agent_options: HttpAgentConfig,
    i18n: Option<I18NConfig>,
    on_demand_entries: OnDemandEntriesConfig,
    optimize_fonts: bool,
    output_file_tracing: bool,
    powered_by_header: bool,
    production_browser_source_maps: bool,
    public_runtime_config: IndexMap<String, serde_json::Value>,
    server_runtime_config: IndexMap<String, serde_json::Value>,
    static_page_generation_timeout: f64,
    swc_minify: Option<bool>,
    target: Option<String>,
    typescript: TypeScriptConfig,
    use_file_system_public_routes: bool,
    webpack: Option<serde_json::Value>,
    skip_middleware_url_normalize: Option<bool>,
    skip_trailing_slash_redirect: Option<bool>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(rename_all = "camelCase")]
struct AmpConfig {
    canonical_base: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(rename_all = "camelCase")]
struct EslintConfig {
    dirs: Option<Vec<String>>,
    ignore_during_builds: Option<bool>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(rename_all = "kebab-case")]
enum BuildActivityPositions {
    #[default]
    BottomRight,
    BottomLeft,
    TopRight,
    TopLeft,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(rename_all = "camelCase")]
struct DevIndicatorsConfig {
    build_activity: bool,
    build_activity_position: BuildActivityPositions,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(rename_all = "camelCase")]
struct OnDemandEntriesConfig {
    max_inactive_age: f64,
    pages_buffer_length: f64,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(rename_all = "camelCase")]
struct HttpAgentConfig {
    keep_alive: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(rename_all = "camelCase")]
struct DomainLocale {
    default_locale: String,
    domain: String,
    http: Option<bool>,
    locales: Option<Vec<String>>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(rename_all = "camelCase")]
struct I18NConfig {
    default_locale: String,
    domains: Option<Vec<DomainLocale>>,
    locale_detection: Option<bool>,
    locales: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(rename_all = "kebab-case")]
pub enum OutputType {
    Standalone,
    Export,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum RouteHas {
    Header {
        key: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        value: Option<String>,
    },
    Cookie {
        key: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        value: Option<String>,
    },
    Query {
        key: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        value: Option<String>,
    },
    Host {
        value: String,
    },
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(rename_all = "camelCase")]
pub struct HeaderValue {
    pub key: String,
    pub value: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
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

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(rename_all = "camelCase")]
pub enum RedirectStatus {
    StatusCode(f64),
    Permanent(bool),
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
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

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
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

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(rename_all = "camelCase")]
pub struct TypeScriptConfig {
    pub ignore_build_errors: Option<bool>,
    pub ts_config_path: Option<String>,
}

#[turbo_tasks::value(eq = "manual")]
#[derive(Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ImageConfig {
    pub device_sizes: Vec<u16>,
    pub image_sizes: Vec<u16>,
    pub path: String,
    pub loader: ImageLoader,
    pub domains: Vec<String>,
    pub disable_static_images: bool,
    #[serde(rename(deserialize = "minimumCacheTTL"))]
    pub minimum_cache_ttl: u32,
    pub formats: Vec<ImageFormat>,
    #[serde(rename(deserialize = "dangerouslyAllowSVG"))]
    pub dangerously_allow_svg: bool,
    pub content_security_policy: String,
    pub remote_patterns: Vec<RemotePattern>,
    pub unoptimized: bool,
}

impl Default for ImageConfig {
    fn default() -> Self {
        // https://github.com/vercel/next.js/blob/327634eb/packages/next/shared/lib/image-config.ts#L100-L114
        Self {
            device_sizes: vec![640, 750, 828, 1080, 1200, 1920, 2048, 3840],
            image_sizes: vec![16, 32, 48, 64, 96, 128, 256, 384],
            path: "/_next/image".to_string(),
            loader: ImageLoader::Default,
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

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(rename_all = "kebab-case")]
pub enum ImageLoader {
    Default,
    Imgix,
    Cloudinary,
    Akamai,
    Custom,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
pub enum ImageFormat {
    #[serde(rename = "image/webp")]
    Webp,
    #[serde(rename = "image/avif")]
    Avif,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, TraceRawVcs)]
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

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(rename_all = "kebab-case")]
pub enum RemotePatternProtocal {
    Http,
    Https,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(rename_all = "camelCase")]
pub struct ExperimentalTurboConfig {
    /// This option has been replaced by `rules`.
    pub loaders: Option<JsonValue>,
    pub rules: Option<IndexMap<String, RuleConfigItem>>,
    pub resolve_alias: Option<IndexMap<String, JsonValue>>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(rename_all = "camelCase", untagged)]
pub enum RuleConfigItem {
    Loaders(Vec<LoaderItem>),
    Options {
        loaders: Vec<LoaderItem>,
        #[serde(default, alias = "as")]
        rename_as: Option<String>,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(untagged)]
pub enum LoaderItem {
    LoaderName(String),
    LoaderOptions(WebpackLoaderItem),
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(rename_all = "camelCase")]
pub struct ExperimentalConfig {
    pub strict_next_head: Option<bool>,
    pub server_components_external_packages: Option<Vec<String>>,
    pub turbo: Option<ExperimentalTurboConfig>,
    pub allowed_revalidate_header_keys: Option<Vec<String>>,
    pub fetch_cache_key_prefix: Option<String>,
    pub isr_memory_cache_size: Option<f64>,
    pub isr_flush_to_disk: Option<bool>,
    mdx_rs: Option<bool>,
    pub swc_plugins: Option<Vec<(String, serde_json::Value)>>,

    // unsupported
    optimize_package_imports: Option<Vec<String>>,
    adjust_font_fallbacks_with_size_adjust: Option<bool>,
    allow_middleware_response_body: Option<bool>,
    amp: Option<serde_json::Value>,
    cpus: Option<f64>,
    cra_compat: Option<bool>,
    disable_optimized_loading: Option<bool>,
    disable_postcss_preset_env: Option<bool>,
    esm_externals: Option<serde_json::Value>,
    external_dir: Option<bool>,
    fallback_node_polyfills: Option<bool>,
    font_loaders: Option<serde_json::Value>,
    force_swc_transforms: Option<bool>,
    fully_specified: Option<bool>,
    gzip_size: Option<bool>,
    incremental_cache_handler_path: Option<String>,
    large_page_data_bytes: Option<f64>,
    manual_client_base_path: Option<bool>,
    middleware_prefetch: Option<MiddlewarePrefetchType>,
    next_script_workers: Option<bool>,
    optimistic_client_cache: Option<bool>,
    optimize_css: Option<serde_json::Value>,
    output_file_tracing_ignores: Option<Vec<String>>,
    output_file_tracing_root: Option<String>,
    proxy_timeout: Option<f64>,
    scroll_restoration: Option<bool>,
    shared_pool: Option<bool>,
    sri: Option<serde_json::Value>,
    swc_minify_debug_options: Option<serde_json::Value>,
    swc_trace_profiling: Option<bool>,
    transpile_packages: Option<Vec<String>>,
    pub turbotrace: Option<serde_json::Value>,
    url_imports: Option<serde_json::Value>,
    web_vitals_attribution: Option<serde_json::Value>,
    worker_threads: Option<bool>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(rename_all = "kebab-case")]
enum MiddlewarePrefetchType {
    Strict,
    Flexible,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(untagged)]
pub enum EmotionTransformOptionsOrBoolean {
    Boolean(bool),
    Options(EmotionTransformConfig),
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(untagged)]
pub enum StyledComponentsTransformOptionsOrBoolean {
    Boolean(bool),
    Options(StyledComponentsTransformConfig),
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(rename_all = "camelCase")]
pub struct CompilerConfig {
    pub react_remove_properties: Option<bool>,
    pub relay: Option<RelayConfig>,
    pub emotion: Option<EmotionTransformOptionsOrBoolean>,
    pub remove_console: Option<RemoveConsoleConfig>,
    pub styled_components: Option<StyledComponentsTransformOptionsOrBoolean>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(untagged, rename_all = "camelCase")]
pub enum ReactRemoveProperties {
    Boolean(bool),
    Config { properties: Option<Vec<String>> },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(untagged)]
pub enum RemoveConsoleConfig {
    Boolean(bool),
    Config { exclude: Option<Vec<String>> },
}

#[turbo_tasks::value_impl]
impl NextConfig {
    #[turbo_tasks::function]
    pub async fn from_string(string: Vc<String>) -> Result<Vc<Self>> {
        let string = string.await?;
        let config: NextConfig = serde_json::from_str(&string)
            .with_context(|| format!("failed to parse next.config.js: {}", string))?;
        Ok(config.cell())
    }

    #[turbo_tasks::function]
    pub async fn server_component_externals(self: Vc<Self>) -> Result<Vc<Vec<String>>> {
        Ok(Vc::cell(
            self.await?
                .experimental
                .server_components_external_packages
                .as_ref()
                .cloned()
                .unwrap_or_default(),
        ))
    }

    #[turbo_tasks::function]
    pub async fn env(self: Vc<Self>) -> Result<Vc<EnvMap>> {
        // The value expected for env is Record<String, String>, but config itself
        // allows arbitary object (https://github.com/vercel/next.js/blob/25ba8a74b7544dfb6b30d1b67c47b9cb5360cb4e/packages/next/src/server/config-schema.ts#L203)
        // then stringifies it. We do the interop here as well.
        let env = self
            .await?
            .env
            .iter()
            .map(|(k, v)| {
                (
                    k.clone(),
                    if let JsonValue::String(s) = v {
                        // A string value is kept, calling `to_string` would wrap in to quotes.
                        s.clone()
                    } else {
                        v.to_string()
                    },
                )
            })
            .collect();

        Ok(Vc::cell(env))
    }

    #[turbo_tasks::function]
    pub async fn image_config(self: Vc<Self>) -> Result<Vc<ImageConfig>> {
        Ok(self.await?.images.clone().cell())
    }

    #[turbo_tasks::function]
    pub async fn page_extensions(self: Vc<Self>) -> Result<Vc<Vec<String>>> {
        Ok(Vc::cell(self.await?.page_extensions.clone()))
    }

    #[turbo_tasks::function]
    pub async fn transpile_packages(self: Vc<Self>) -> Result<Vc<Vec<String>>> {
        Ok(Vc::cell(
            self.await?.transpile_packages.clone().unwrap_or_default(),
        ))
    }

    #[turbo_tasks::function]
    pub async fn webpack_rules(self: Vc<Self>) -> Result<Vc<OptionWebpackRules>> {
        let this = self.await?;
        let Some(turbo_rules) = this
            .experimental
            .turbo
            .as_ref()
            .and_then(|t| t.rules.as_ref())
        else {
            return Ok(Vc::cell(None));
        };
        if turbo_rules.is_empty() {
            return Ok(Vc::cell(None));
        }
        let mut rules = IndexMap::new();
        for (ext, rule) in turbo_rules {
            fn transform_loaders(loaders: &[LoaderItem]) -> Vc<WebpackLoaderItems> {
                Vc::cell(
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
            let rule = match rule {
                RuleConfigItem::Loaders(loaders) => LoaderRuleItem {
                    loaders: transform_loaders(loaders),
                    rename_as: None,
                },
                RuleConfigItem::Options { loaders, rename_as } => LoaderRuleItem {
                    loaders: transform_loaders(loaders),
                    rename_as: rename_as.clone(),
                },
            };

            rules.insert(ext.clone(), rule);
        }
        Ok(Vc::cell(Some(Vc::cell(rules))))
    }

    #[turbo_tasks::function]
    pub async fn resolve_alias_options(self: Vc<Self>) -> Result<Vc<ResolveAliasMap>> {
        let this = self.await?;
        let Some(resolve_alias) = this
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
    pub async fn mdx_rs(self: Vc<Self>) -> Result<Vc<bool>> {
        Ok(Vc::cell(self.await?.experimental.mdx_rs.unwrap_or(false)))
    }

    #[turbo_tasks::function]
    pub async fn sass_config(self: Vc<Self>) -> Result<Vc<JsonValue>> {
        Ok(Vc::cell(
            self.await?.sass_options.clone().unwrap_or_default(),
        ))
    }

    #[turbo_tasks::function]
    pub async fn swc_minify(self: Vc<Self>) -> Result<Vc<bool>> {
        Ok(Vc::cell(self.await?.swc_minify.unwrap_or(false)))
    }

    #[turbo_tasks::function]
    pub async fn skip_middleware_url_normalize(self: Vc<Self>) -> Result<Vc<bool>> {
        Ok(Vc::cell(
            self.await?.skip_middleware_url_normalize.unwrap_or(false),
        ))
    }

    #[turbo_tasks::function]
    pub async fn skip_trailing_slash_redirect(self: Vc<Self>) -> Result<Vc<bool>> {
        Ok(Vc::cell(
            self.await?.skip_trailing_slash_redirect.unwrap_or(false),
        ))
    }
}

fn next_configs() -> Vc<Vec<String>> {
    Vc::cell(
        ["next.config.mjs", "next.config.js"]
            .into_iter()
            .map(ToOwned::to_owned)
            .collect(),
    )
}

#[turbo_tasks::function]
pub async fn load_next_config(execution_context: Vc<ExecutionContext>) -> Result<Vc<NextConfig>> {
    Ok(load_config_and_custom_routes(execution_context)
        .await?
        .config)
}

#[turbo_tasks::function]
pub async fn load_rewrites(execution_context: Vc<ExecutionContext>) -> Result<Vc<Rewrites>> {
    Ok(load_config_and_custom_routes(execution_context)
        .await?
        .custom_routes
        .await?
        .rewrites)
}

#[turbo_tasks::function]
async fn load_config_and_custom_routes(
    execution_context: Vc<ExecutionContext>,
) -> Result<Vc<NextConfigAndCustomRoutes>> {
    let ExecutionContext { project_path, .. } = *execution_context.await?;
    let find_config_result = find_context_file(project_path, next_configs());
    let config_file = match &*find_config_result.await? {
        FindContextFileResult::Found(config_path, _) => Some(*config_path),
        FindContextFileResult::NotFound(_) => None,
    };

    load_next_config_and_custom_routes_internal(execution_context, config_file)
        .issue_file_path(config_file, "Loading Next.js config")
        .await
}

#[turbo_tasks::function]
async fn load_next_config_and_custom_routes_internal(
    execution_context: Vc<ExecutionContext>,
    config_file: Option<Vc<FileSystemPath>>,
) -> Result<Vc<NextConfigAndCustomRoutes>> {
    let ExecutionContext {
        project_path,
        chunking_context,
        env,
    } = *execution_context.await?;
    let mut import_map = ImportMap::default();

    import_map.insert_exact_alias("next", ImportMapping::External(None).into());
    import_map.insert_wildcard_alias("next/", ImportMapping::External(None).into());
    import_map.insert_exact_alias("styled-jsx", ImportMapping::External(None).into());
    import_map.insert_wildcard_alias("styled-jsx/", ImportMapping::External(None).into());

    let context = node_evaluate_asset_context(execution_context, Some(import_map.cell()), None);
    let config_asset = config_file.map(FileSource::new);

    let config_changed = config_asset.map_or_else(Completion::immutable, |config_asset| {
        // This invalidates the execution when anything referenced by the config file
        // changes
        let config_asset = context.process(
            Vc::upcast(config_asset),
            Value::new(ReferenceType::Internal(InnerAssets::empty())),
        );
        any_content_changed_of_module(config_asset)
    });
    let load_next_config_asset = context.process(
        next_asset("entry/config/next.js".to_string()),
        Value::new(ReferenceType::Entry(EntryReferenceSubType::Undefined)),
    );
    let config_value = evaluate(
        load_next_config_asset,
        project_path,
        env,
        config_asset.map_or_else(|| AssetIdent::from_path(project_path), |c| c.ident()),
        context,
        chunking_context.with_layer("next_config".to_string()),
        None,
        vec![],
        config_changed,
        should_debug("next_config"),
    )
    .await?;

    let turbopack_binding::turbo::tasks_bytes::stream::SingleValue::Single(val) = config_value
        .try_into_single()
        .await
        .context("Evaluation of Next.js config failed")?
    else {
        return Ok(NextConfigAndCustomRoutes {
            config: NextConfig::default().cell(),
            custom_routes: CustomRoutes {
                rewrites: Rewrites::default().cell(),
            }
            .cell(),
        }
        .cell());
    };
    let next_config_and_custom_routes: NextConfigAndCustomRoutesRaw =
        parse_json_with_source_context(val.to_str()?)?;

    if let Some(turbo) = next_config_and_custom_routes
        .config
        .experimental
        .turbo
        .as_ref()
    {
        if turbo.loaders.is_some() {
            OutdatedConfigIssue {
                path: config_file.unwrap_or(project_path),
                old_name: "experimental.turbo.loaders".to_string(),
                new_name: "experimental.turbo.rules".to_string(),
                description: indoc::indoc! { r#"
                    The new option is similar, but the key should be a glob instead of an extension.
                    Example: loaders: { ".mdx": ["mdx-loader"] } -> rules: { "*.mdx": ["mdx-loader"] }"# }
                .to_string(),
            }
            .cell()
            .emit()
        }
    }

    Ok(NextConfigAndCustomRoutes {
        config: next_config_and_custom_routes.config.cell(),
        custom_routes: CustomRoutes {
            rewrites: next_config_and_custom_routes.custom_routes.rewrites.cell(),
        }
        .cell(),
    }
    .cell())
}

#[turbo_tasks::function]
pub async fn has_next_config(context: Vc<FileSystemPath>) -> Result<Vc<bool>> {
    Ok(Vc::cell(!matches!(
        *find_context_file(context, next_configs()).await?,
        FindContextFileResult::NotFound(_)
    )))
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
    pub async fn from_string(string: Vc<String>) -> Result<Vc<Self>> {
        let string = string.await?;
        let config: JsConfig = serde_json::from_str(&string)
            .with_context(|| format!("failed to parse next.config.js: {}", string))?;

        Ok(config.cell())
    }

    #[turbo_tasks::function]
    pub async fn compiler_options(self: Vc<Self>) -> Result<Vc<serde_json::Value>> {
        Ok(Vc::cell(
            self.await?.compiler_options.clone().unwrap_or_default(),
        ))
    }
}

#[turbo_tasks::value]
struct OutdatedConfigIssue {
    path: Vc<FileSystemPath>,
    old_name: String,
    new_name: String,
    description: String,
}

#[turbo_tasks::value_impl]
impl Issue for OutdatedConfigIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        IssueSeverity::Error.into()
    }

    #[turbo_tasks::function]
    fn category(&self) -> Vc<String> {
        Vc::cell("config".to_string())
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.path
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<String> {
        Vc::cell(format!(
            "\"{}\" has been replaced by \"{}\"",
            self.old_name, self.new_name
        ))
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<String> {
        Vc::cell(self.description.to_string())
    }
}
