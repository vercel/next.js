use anyhow::Result;
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use turbo_tasks::{
    primitives::{BoolVc, StringsVc},
    trace::TraceRawVcs,
    Value,
};
use turbo_tasks_env::EnvMapVc;
use turbopack::{
    evaluate_context::node_evaluate_asset_context,
    module_options::{WebpackLoadersOptions, WebpackLoadersOptionsVc},
};
use turbopack_core::{
    asset::Asset,
    reference_type::{EntryReferenceSubType, ReferenceType},
    resolve::{
        find_context_file,
        options::{ImportMap, ImportMapping},
        FindContextFileResult, ResolveAliasMap, ResolveAliasMapVc,
    },
    source_asset::SourceAssetVc,
};
use turbopack_ecmascript::{
    chunk::EcmascriptChunkPlaceablesVc, EcmascriptInputTransformsVc, EcmascriptModuleAssetType,
    EcmascriptModuleAssetVc,
};
use turbopack_node::{
    evaluate::{evaluate, JavaScriptValue},
    execution_context::{ExecutionContext, ExecutionContextVc},
};

use crate::embed_js::next_asset;

#[turbo_tasks::value(serialization = "custom", eq = "manual")]
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NextConfig {
    pub config_file: Option<String>,
    pub config_file_name: String,

    pub env: IndexMap<String, String>,
    pub experimental: ExperimentalConfig,
    pub images: ImageConfig,
    pub page_extensions: Vec<String>,
    pub react_strict_mode: Option<bool>,
    pub transpile_packages: Option<Vec<String>>,

    // unsupported
    cross_origin: Option<String>,
    compiler: Option<CompilerConfig>,
    amp: AmpConfig,
    analytics_id: String,
    asset_prefix: String,
    base_path: String,
    clean_dist_dir: bool,
    compress: bool,
    dev_indicators: DevIndicatorsConfig,
    dist_dir: String,
    eslint: EslintConfig,
    exclude_default_moment_locales: bool,
    // this can be a function in js land
    export_path_map: Option<serde_json::Value>,
    // this is a function in js land
    generate_build_id: Option<serde_json::Value>,
    generate_etags: bool,
    // this is a function in js land
    headers: Option<serde_json::Value>,
    http_agent_options: HttpAgentConfig,
    i18n: Option<I18NConfig>,
    on_demand_entries: OnDemandEntriesConfig,
    optimize_fonts: bool,
    output: Option<OutputType>,
    output_file_tracing: bool,
    powered_by_header: bool,
    production_browser_source_maps: bool,
    public_runtime_config: IndexMap<String, serde_json::Value>,
    // this is a function in js land
    redirects: Option<serde_json::Value>,
    // this is a function in js land
    rewrites: Option<serde_json::Value>,
    sass_options: IndexMap<String, serde_json::Value>,
    server_runtime_config: IndexMap<String, serde_json::Value>,
    static_page_generation_timeout: f64,
    swc_minify: bool,
    target: String,
    trailing_slash: bool,
    typescript: TypeScriptConfig,
    use_file_system_public_routes: bool,
    webpack: Option<serde_json::Value>,
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
enum OutputType {
    Standalone,
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
    pub protocol: Option<RemotePatternProtocal>,
    pub hostname: String,
    pub port: Option<String>,
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
pub struct ExperimentalConfig {
    pub app_dir: Option<bool>,
    pub resolve_alias: Option<IndexMap<String, JsonValue>>,
    pub server_components_external_packages: Option<Vec<String>>,
    pub turbopack_loaders: Option<IndexMap<String, Vec<String>>>,

    // unsupported
    adjust_font_fallbacks: Option<bool>,
    adjust_font_fallbacks_with_size_adjust: Option<bool>,
    allow_middleware_response_body: Option<bool>,
    amp: Option<serde_json::Value>,
    cpus: Option<f64>,
    cra_compat: Option<bool>,
    disable_optimized_loading: Option<bool>,
    disable_postcss_preset_env: Option<bool>,
    enable_undici: Option<bool>,
    esm_externals: Option<serde_json::Value>,
    external_dir: Option<bool>,
    fallback_node_polyfills: Option<bool>,
    fetch_cache: Option<bool>,
    font_loaders: Option<serde_json::Value>,
    force_swc_transforms: Option<bool>,
    fully_specified: Option<bool>,
    gzip_size: Option<bool>,
    incremental_cache_handler_path: Option<String>,
    isr_flush_to_disk: Option<bool>,
    isr_memory_cache_size: Option<f64>,
    large_page_data_bytes: Option<f64>,
    legacy_browsers: Option<bool>,
    manual_client_base_path: Option<bool>,
    mdx_rs: Option<serde_json::Value>,
    middleware_prefetch: Option<MiddlewarePrefetchType>,
    modularize_imports: Option<serde_json::Value>,
    new_next_link_behavior: Option<bool>,
    next_script_workers: Option<bool>,
    optimistic_client_cache: Option<bool>,
    optimize_css: Option<serde_json::Value>,
    output_file_tracing_ignores: Option<Vec<String>>,
    output_file_tracing_root: Option<String>,
    page_env: Option<bool>,
    profiling: Option<bool>,
    proxy_timeout: Option<f64>,
    runtime: Option<serde_json::Value>,
    scroll_restoration: Option<bool>,
    shared_pool: Option<bool>,
    skip_middleware_url_normalize: Option<bool>,
    skip_trailing_slash_redirect: Option<bool>,
    sri: Option<serde_json::Value>,
    swc_file_reading: Option<bool>,
    swc_minify: Option<bool>,
    swc_minify_debug_options: Option<serde_json::Value>,
    swc_plugins: Option<serde_json::Value>,
    swc_trace_profiling: Option<bool>,
    transpile_packages: Option<Vec<String>>,
    turbotrace: Option<serde_json::Value>,
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
#[serde(rename_all = "camelCase")]
pub struct CompilerConfig {
    pub react_remove_properties: Option<bool>,
    pub relay: Option<RelayConfig>,
    pub remove_console: Option<RemoveConsoleConfig>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(untagged, rename_all = "camelCase")]
pub enum ReactRemoveProperties {
    Boolean(bool),
    Config { properties: Option<Vec<String>> },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(rename_all = "camelCase")]
pub struct RelayConfig {
    pub src: String,
    pub artifact_directory: Option<String>,
    pub language: Option<RelayLanguage>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(untagged, rename_all = "lowercase")]
pub enum RelayLanguage {
    TypeScript,
    Flow,
    JavaScript,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, TraceRawVcs)]
#[serde(untagged)]
pub enum RemoveConsoleConfig {
    Boolean(bool),
    Config { exclude: Option<Vec<String>> },
}

#[turbo_tasks::value_impl]
impl NextConfigVc {
    #[turbo_tasks::function]
    pub async fn server_component_externals(self) -> Result<StringsVc> {
        Ok(StringsVc::cell(
            self.await?
                .experimental
                .server_components_external_packages
                .as_ref()
                .cloned()
                .unwrap_or_default(),
        ))
    }

    #[turbo_tasks::function]
    pub async fn app_dir(self) -> Result<BoolVc> {
        Ok(BoolVc::cell(
            self.await?
                .experimental
                .app_dir
                .as_ref()
                .cloned()
                .unwrap_or_default(),
        ))
    }

    #[turbo_tasks::function]
    pub async fn env(self) -> Result<EnvMapVc> {
        Ok(EnvMapVc::cell(self.await?.env.clone()))
    }

    #[turbo_tasks::function]
    pub async fn image_config(self) -> Result<ImageConfigVc> {
        Ok(self.await?.images.clone().cell())
    }

    #[turbo_tasks::function]
    pub async fn page_extensions(self) -> Result<StringsVc> {
        Ok(StringsVc::cell(self.await?.page_extensions.clone()))
    }

    #[turbo_tasks::function]
    pub async fn transpile_packages(self) -> Result<StringsVc> {
        Ok(StringsVc::cell(
            self.await?.transpile_packages.clone().unwrap_or_default(),
        ))
    }

    #[turbo_tasks::function]
    pub async fn webpack_loaders_options(self) -> Result<WebpackLoadersOptionsVc> {
        let Some(ref turbopack_loaders) = self.await?.experimental.turbopack_loaders else {
            return Ok(WebpackLoadersOptionsVc::cell(WebpackLoadersOptions::default()));
        };
        let mut extension_to_loaders = IndexMap::new();
        for (ext, loaders) in turbopack_loaders {
            extension_to_loaders.insert(ext.clone(), StringsVc::cell(loaders.clone()));
        }
        Ok(WebpackLoadersOptions {
            extension_to_loaders,
            ..Default::default()
        }
        .cell())
    }

    #[turbo_tasks::function]
    pub async fn resolve_alias_options(self) -> Result<ResolveAliasMapVc> {
        let this = self.await?;
        let Some(resolve_alias) = this.experimental.resolve_alias.as_ref() else {
            return Ok(ResolveAliasMapVc::cell(ResolveAliasMap::default()));
        };
        let alias_map: ResolveAliasMap = resolve_alias.try_into()?;
        Ok(alias_map.cell())
    }
}

fn next_configs() -> StringsVc {
    StringsVc::cell(
        ["next.config.mjs", "next.config.js"]
            .into_iter()
            .map(ToOwned::to_owned)
            .collect(),
    )
}

#[turbo_tasks::function]
pub async fn load_next_config(execution_context: ExecutionContextVc) -> Result<NextConfigVc> {
    let ExecutionContext {
        project_root,
        intermediate_output_path,
    } = *execution_context.await?;
    let mut import_map = ImportMap::default();

    import_map.insert_exact_alias("next", ImportMapping::External(None).into());
    import_map.insert_wildcard_alias("next/", ImportMapping::External(None).into());
    import_map.insert_exact_alias("styled-jsx", ImportMapping::External(None).into());
    import_map.insert_wildcard_alias("styled-jsx/", ImportMapping::External(None).into());

    let context = node_evaluate_asset_context(Some(import_map.cell()));
    let find_config_result = find_context_file(project_root, next_configs());
    let config_asset = match &*find_config_result.await? {
        FindContextFileResult::Found(config_path, _) => Some(SourceAssetVc::new(*config_path)),
        FindContextFileResult::NotFound(_) => None,
    };

    let runtime_entries = config_asset.map(|config_asset| {
        // TODO this is a hack to add the config to the bundling to make it watched
        let config_chunk = EcmascriptModuleAssetVc::new(
            config_asset.into(),
            context,
            Value::new(EcmascriptModuleAssetType::Ecmascript),
            EcmascriptInputTransformsVc::cell(vec![]),
            context.environment(),
        )
        .as_ecmascript_chunk_placeable();
        EcmascriptChunkPlaceablesVc::cell(vec![config_chunk])
    });
    let asset_path = config_asset
        .map_or(project_root, |a| a.path())
        .join("load-next-config.js");
    let load_next_config_asset = context.process(
        next_asset(asset_path, "entry/config/next.js"),
        Value::new(ReferenceType::Entry(EntryReferenceSubType::Undefined)),
    );
    let config_value = evaluate(
        project_root,
        load_next_config_asset,
        project_root,
        config_asset.map_or(project_root, |c| c.path()),
        context,
        intermediate_output_path,
        runtime_entries,
        vec![],
        /* debug */ false,
    )
    .await?;
    match &*config_value {
        JavaScriptValue::Value(val) => {
            let next_config: NextConfig = serde_json::from_reader(val.read())?;
            let next_config = next_config.cell();

            Ok(next_config)
        }
        JavaScriptValue::Error => Ok(NextConfig::default().cell()),
        JavaScriptValue::Stream(_) => {
            unimplemented!("Stream not supported now");
        }
    }
}
