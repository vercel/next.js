use std::{
    future::Future,
    path::Path,
    pin::Pin,
    sync::{LazyLock, OnceLock},
};

use next_taskless::NEVER_EXTERNAL_RE;
use regex::Regex;
use rspack_core::{Alias, DependencyCategory, Resolve, ResolveOptionsWithDependencyType};
use rspack_regex::RspackRegex;
use rustc_hash::FxHashMap;

use crate::config_shared::{EsmExternalsConfig, NextConfigComplete};

const WEBPACK_BUNDLED_LAYERS: &[&str] = &[
    "rsc",
    "action-browser",
    "ssr",
    "app-pages-browser",
    "shared",
    "instrument",
    "middleware",
];

fn is_webpack_bundled_layer(layer: Option<&str>) -> bool {
    layer.is_some_and(|layer| WEBPACK_BUNDLED_LAYERS.contains(&layer))
}

static REACT_PACKAGES_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(react|react-dom|react-server-dom-webpack)($|/)").unwrap());

static NEXT_IMAGE_LOADER_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^next[/\\]dist[/\\]shared[/\\]lib[/\\]image-loader").unwrap());

static NEXT_SERVER_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^next[/\\]dist[/\\]compiled[/\\]next-server").unwrap());

static NEXT_SHARED_CJS_REGEX: LazyLock<RspackRegex> = LazyLock::new(|| {
    RspackRegex::new(r"^next[/\\]dist[/\\]shared[/\\](?!lib[/\\]router[/\\]router)").unwrap()
});

static NEXT_COMPILED_CJS_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^next[/\\]dist[/\\]compiled[/\\].*\.c?js$").unwrap());

static NEXT_SHARED_ESM_REGEX: LazyLock<RspackRegex> = LazyLock::new(|| {
    RspackRegex::new(r"^next[/\\]dist[/\\]esm[/\\]shared[/\\](?!lib[/\\]router[/\\]router)")
        .unwrap()
});

static NEXT_COMPILED_MJS_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^next[/\\]dist[/\\]compiled[/\\].*\.mjs$").unwrap());

static BABEL_RUNTIME_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"node_modules[/\\]@babel[/\\]runtime[/\\]").unwrap());

static WEBPACK_CSS_LOADER_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"node_modules[/\\]webpack|node_modules[/\\]css-loader").unwrap());

const BARREL_OPTIMIZATION_PREFIX: &str = "__barrel_optimize__";

const WEBPACK_SERVER_ONLY_LAYERS: &[&str] = &["rsc", "action-browser", "instrument", "middleware"];

fn should_use_react_server_condition(layer: Option<&str>) -> bool {
    layer.is_some_and(|layer| WEBPACK_SERVER_ONLY_LAYERS.contains(&layer))
}

static NODE_RESOLVE_OPTIONS: LazyLock<ResolveOptionsWithDependencyType> =
    LazyLock::new(|| ResolveOptionsWithDependencyType {
        resolve_options: Some(Box::new(Resolve {
            extensions: Some(vec![
                ".js".to_string(),
                ".json".to_string(),
                ".node".to_string(),
            ]),
            alias: None,
            prefer_relative: Some(false),
            prefer_absolute: Some(false),
            symlinks: Some(true),
            main_files: Some(vec!["index".to_string()]),
            main_fields: Some(vec!["main".to_string()]),
            condition_names: Some(vec!["node".to_string(), "require".to_string()]),
            tsconfig: None,
            modules: Some(vec!["node_modules".to_string()]),
            fallback: Some(Alias::OverwriteToNoAlias),
            fully_specified: Some(false),
            exports_fields: Some(vec![vec!["exports".to_string()]]),
            extension_alias: None,
            alias_fields: None,
            roots: Some(vec![]),
            restrictions: Some(vec![]),
            imports_fields: Some(vec![vec!["imports".to_string()]]),
            by_dependency: None,
            description_files: Some(vec!["package.json".to_string()]),
            enforce_extension: Some(false),
            pnp: None,
            builtin_modules: false,
        })),
        resolve_to_context: false,
        dependency_category: DependencyCategory::CommonJS,
    });

static NODE_BASE_RESOLVE_OPTIONS: LazyLock<ResolveOptionsWithDependencyType> =
    LazyLock::new(|| ResolveOptionsWithDependencyType {
        resolve_options: NODE_RESOLVE_OPTIONS
            .resolve_options
            .clone()
            .map(|mut options| {
                options.alias = Some(Alias::OverwriteToNoAlias);
                options
            }),
        resolve_to_context: NODE_RESOLVE_OPTIONS.resolve_to_context,
        dependency_category: NODE_RESOLVE_OPTIONS.dependency_category,
    });

static NODE_ESM_RESOLVE_OPTIONS: LazyLock<ResolveOptionsWithDependencyType> =
    LazyLock::new(|| ResolveOptionsWithDependencyType {
        resolve_options: NODE_RESOLVE_OPTIONS
            .resolve_options
            .clone()
            .map(|mut options| {
                options.alias = Some(Alias::OverwriteToNoAlias);
                options.condition_names = Some(vec!["node".to_string(), "import".to_string()]);
                options.fully_specified = Some(true);
                options
            }),
        resolve_to_context: NODE_RESOLVE_OPTIONS.resolve_to_context,
        dependency_category: DependencyCategory::Esm,
    });

static NODE_BASE_ESM_RESOLVE_OPTIONS: LazyLock<ResolveOptionsWithDependencyType> =
    LazyLock::new(|| ResolveOptionsWithDependencyType {
        resolve_options: NODE_ESM_RESOLVE_OPTIONS
            .resolve_options
            .clone()
            .map(|mut options| {
                options.alias = Some(Alias::OverwriteToNoAlias);
                options
            }),
        resolve_to_context: NODE_ESM_RESOLVE_OPTIONS.resolve_to_context,
        dependency_category: NODE_ESM_RESOLVE_OPTIONS.dependency_category,
    });

static NODE_MODULES_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"node_modules[/\\].*\.[mc]?js$").unwrap());

fn is_resource_in_packages(
    resource: &str,
    package_names: &[String],
    package_dir_mapping: Option<&FxHashMap<String, String>>,
) -> bool {
    if package_names.is_empty() {
        return false;
    }
    package_names.iter().any(|pkg| {
        if let Some(dirs) = package_dir_mapping {
            if let Some(dir) = dirs.get(pkg) {
                return resource.starts_with(&format!("{dir}/"));
            }
        }
        resource.contains(&format!(
            "/node_modules/{}/",
            pkg.replace('/', std::path::MAIN_SEPARATOR_STR)
        ))
    })
}

#[derive(Debug)]
pub struct ExternalHandler {
    config: NextConfigComplete,
    opt_out_bundling_package_regex: RspackRegex,
    transpiled_packages: Vec<String>,
    dir: String,
    resolved_external_package_dirs: OnceLock<FxHashMap<String, String>>,
    loose_esm_externals: bool,
    default_overrides: FxHashMap<String, String>,
}

impl ExternalHandler {
    pub fn new(
        config: NextConfigComplete,
        opt_out_bundling_package_regex: RspackRegex,
        transpiled_packages: Vec<String>,
        dir: String,
        default_overrides: FxHashMap<String, String>,
    ) -> Self {
        let loose_esm_externals = config.experimental.esm_externals == EsmExternalsConfig::Loose;

        Self {
            config,
            opt_out_bundling_package_regex,
            transpiled_packages,
            dir,
            resolved_external_package_dirs: OnceLock::default(),
            loose_esm_externals,
            default_overrides,
        }
    }

    fn resolve_bundling_opt_out_packages(
        &self,
        resolved_res: &str,
        is_app_layer: bool,
        external_type: &str,
        is_opt_out_bundling: bool,
        request: &str,
    ) -> Option<String> {
        if NODE_MODULES_REGEX.is_match(resolved_res) {
            let should_bundle_pages = !is_app_layer
                && self
                    .config
                    .bundle_pages_router_dependencies
                    .unwrap_or(false)
                && !is_opt_out_bundling;

            let should_be_bundled = should_bundle_pages
                || is_resource_in_packages(
                    resolved_res,
                    &self.transpiled_packages,
                    self.resolved_external_package_dirs.get(),
                );

            if !should_be_bundled {
                return Some(format!("{external_type} {request}"));
            }
        }
        None
    }

    pub async fn handle_externals<GetResolveFn>(
        &self,
        ctx: String,
        request: String,
        dependency_type: &str,
        layer: Option<&str>,
        get_resolve: &GetResolveFn,
    ) -> rspack_error::Result<Option<String>>
    where
        GetResolveFn: Fn(Option<ResolveOptionsWithDependencyType>) -> ResolveFn,
    {
        // We need to externalize internal requests for files intended to
        // not be bundled.
        let is_local = request.starts_with('.') || Path::new(&request).is_absolute();

        // make sure import "next" shows a warning when imported
        // in pages/components
        if request == "next" {
            return Ok(Some(
                "commonjs next/dist/lib/import-next-warning".to_string(),
            ));
        }

        let is_app_layer = is_webpack_bundled_layer(layer);

        // Relative requires don't need custom resolution, because they
        // are relative to requests we've already resolved here.
        // Absolute requires (require('/foo')) are extremely uncommon, but
        // also have no need for customization as they're already resolved.
        if !is_local {
            // Handle React packages
            if REACT_PACKAGES_REGEX.is_match(&request) && !is_app_layer {
                return Ok(Some(format!("commonjs {request}")));
            }

            // Skip modules that should not be external
            if NEVER_EXTERNAL_RE.is_match(&request) {
                return Ok(None);
            }
        }

        // @swc/helpers should not be external as it would
        // require hoisting the package which we can't rely on
        if request.contains("@swc/helpers") {
            return Ok(None);
        }

        // BARREL_OPTIMIZATION_PREFIX is a special marker that tells Next.js to
        // optimize the import by removing unused exports. This has to be compiled.
        if request.starts_with(BARREL_OPTIMIZATION_PREFIX) {
            return Ok(None);
        }

        // When in esm externals mode, and using import, we resolve with
        // ESM resolving options.
        // Also disable esm request when appDir is enabled
        let is_esm_requested = dependency_type == "esm";

        // Don't bundle @vercel/og nodejs bundle for nodejs runtime.
        // TODO-APP: bundle route.js with different layer that externals common node_module deps.
        // Make sure @vercel/og is loaded as ESM for Node.js runtime
        if should_use_react_server_condition(layer)
            && request == "next/dist/compiled/@vercel/og/index.node.js"
        {
            return Ok(Some(format!("module {request}")));
        }

        // Specific Next.js imports that should remain external
        // TODO-APP: Investigate if we can remove this.
        if request.starts_with("next/dist/") {
            // Non external that needs to be transpiled
            // Image loader needs to be transpiled
            if NEXT_IMAGE_LOADER_REGEX.is_match(&request) {
                return Ok(None);
            }

            if NEXT_SERVER_REGEX.is_match(&request) {
                return Ok(Some(format!("commonjs {request}")));
            }

            if NEXT_SHARED_CJS_REGEX.test(&request) || NEXT_COMPILED_CJS_REGEX.is_match(&request) {
                return Ok(Some(format!("commonjs {request}")));
            }

            if NEXT_SHARED_ESM_REGEX.test(&request) || NEXT_COMPILED_MJS_REGEX.is_match(&request) {
                return Ok(Some(format!("module {request}")));
            }

            return Ok(resolve_next_external(&request));
        }

        // TODO-APP: Let's avoid this resolve call as much as possible, and eventually get rid of
        // it.
        let resolve_result = resolve_external(
            self.dir.to_string(),
            &self.config.experimental.esm_externals,
            ctx.to_string(),
            request.to_string(),
            is_esm_requested,
            get_resolve,
            if is_local {
                Some(&resolve_next_external)
            } else {
                None
            },
            None,
            None,
            None,
            None,
            None,
        )
        .await?;

        if let Some(local_res) = resolve_result.local_res {
            return Ok(Some(local_res));
        }

        // Forcedly resolve the styled-jsx installed by next.js,
        // since `resolveExternal` cannot find the styled-jsx dep with pnpm
        let (res, is_esm) = if request == "styled-jsx/style" {
            (
                self.default_overrides
                    .get("styled-jsx/style")
                    .map(|s| s.to_string()),
                resolve_result.is_esm,
            )
        } else {
            (resolve_result.res, resolve_result.is_esm)
        };

        let Some(res) = res else {
            // If the request cannot be resolved we need to have
            // webpack "bundle" it so it surfaces the not found error.
            return Ok(None);
        };

        let is_opt_out_bundling = self.opt_out_bundling_package_regex.test(&res);

        // Apply bundling rules to all app layers.
        // Since handleExternals only handle the server layers, we don't need to exclude client here
        if !is_opt_out_bundling && is_app_layer {
            return Ok(None);
        }

        // ESM externals can only be imported (and not required).
        // Make an exception in loose mode.
        if !is_esm_requested && is_esm && !self.loose_esm_externals && !is_local {
            return Err(rspack_error::error!(
        "ESM packages ({}) need to be imported. Use 'import' to reference the package instead. https://nextjs.org/docs/messages/import-esm-externals",
        request
      ));
        }

        let external_type = if is_esm { "module" } else { "commonjs" };

        // Default pages have to be transpiled
        // This is the @babel/plugin-transform-runtime "helpers: true" option
        if BABEL_RUNTIME_REGEX.is_match(&res) {
            return Ok(None);
        }

        // Webpack itself has to be compiled because it doesn't always use module relative paths
        if WEBPACK_CSS_LOADER_REGEX.is_match(&res) {
            return Ok(None);
        }

        // If a package should be transpiled by Next.js, we skip making it external.
        // It doesn't matter what the extension is, as we'll transpile it anyway.
        if !self.transpiled_packages.is_empty()
            && self.resolved_external_package_dirs.get().is_none()
        {
            let mut resolved_dirs = FxHashMap::default();

            // We need to resolve all the external package dirs initially.
            for pkg in &self.transpiled_packages {
                let pkg_request = format!("{pkg}/package.json");
                let pkg_res = resolve_external(
                    self.dir.to_string(),
                    &self.config.experimental.esm_externals,
                    ctx.to_string(),
                    pkg_request,
                    is_esm_requested,
                    get_resolve,
                    if is_local {
                        Some(&resolve_next_external)
                    } else {
                        None
                    },
                    None,
                    None,
                    None,
                    None,
                    None,
                )
                .await?;

                if let Some(res) = pkg_res.res {
                    if let Some(parent) = Path::new(&res).parent() {
                        resolved_dirs.insert(pkg.clone(), parent.to_string_lossy().to_string());
                    }
                }
            }

            self.resolved_external_package_dirs
                .get_or_init(move || resolved_dirs);
        }

        let resolved_bundling_opt_out_res = self.resolve_bundling_opt_out_packages(
            &res,
            is_app_layer,
            external_type,
            is_opt_out_bundling,
            &request,
        );

        if resolved_bundling_opt_out_res.is_some() {
            return Ok(resolved_bundling_opt_out_res);
        }

        // if here, we default to bundling the file
        Ok(None)
    }
}

static EXTERNAL_PATTERN: LazyLock<Regex> = LazyLock::new(|| {
    let path_separators = r"[/\\]";
    let optional_esm_part = format!(r"(({path_separators})esm)?{path_separators}",);
    let external_file_end = r"(\.external(\.js)?)$";
    let next_dist = format!(r"next{path_separators}dist");

    Regex::new(&format!(
        r"{next_dist}{optional_esm_part}.*{external_file_end}"
    ))
    .unwrap()
});

static NEXT_DIST_REPLACE_PATTERN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r".*?next[/\\]dist").unwrap());

/// Returns an externalized path if the file is a Next.js file and ends with either
/// `.shared-runtime.js` or `.external.js` This is used to ensure that files used across the
/// rendering runtime(s) and the user code are one and the same. The logic in this function will
/// rewrite the require to the correct bundle location depending on the layer at which the file is
/// being used.
///
/// # Arguments
/// * `local_res` - the full path to the file
///
/// # Returns
/// * `Option<String>` - the externalized path, or None if not external
pub fn resolve_next_external(local_res: &str) -> Option<String> {
    let is_external = EXTERNAL_PATTERN.is_match(local_res);

    // If the file ends with .external, we need to make it a commonjs require in all cases
    // This is used mainly to share the async local storage across the routing, rendering and user
    // layers.
    if is_external {
        // It's important we return the path that starts with `next/dist/` here instead of the
        // absolute path otherwise NFT will get tripped up
        let normalized_path = NEXT_DIST_REPLACE_PATTERN.replace(local_res, "next/dist");
        let normalized_path = normalize_path_sep(&normalized_path);

        Some(format!("commonjs {normalized_path}"))
    } else {
        None
    }
}

/// Normalize path separators to forward slashes
fn normalize_path_sep(path: &str) -> String {
    path.replace('\\', "/")
}

#[derive(Debug)]
pub struct ResolveResult {
    pub res: Option<String>,
    pub is_esm: bool,
    pub local_res: Option<String>,
}

impl EsmExternalsConfig {
    pub fn is_enabled(&self) -> bool {
        !matches!(self, EsmExternalsConfig::None)
    }

    pub fn is_loose(&self) -> bool {
        matches!(self, EsmExternalsConfig::Loose)
    }
}

pub type ResolveFn = Box<
    dyn Fn(
            String,
            String,
        ) -> Pin<
            Box<dyn Future<Output = rspack_error::Result<(Option<String>, bool)>> + Send + 'static>,
        > + Send
        + 'static,
>;

#[allow(clippy::too_many_arguments)]
pub async fn resolve_external<'a, GetResolveFn, IsLocalCallbackFn>(
    dir: String,
    esm_externals_config: &'a EsmExternalsConfig,
    ctx: String,
    request: String,
    is_esm_requested: bool,
    get_resolve: &'a GetResolveFn,
    is_local_callback: Option<&'a IsLocalCallbackFn>,
    base_resolve_check: Option<bool>,
    esm_resolve_options: Option<&'a ResolveOptionsWithDependencyType>,
    node_resolve_options: Option<&'a ResolveOptionsWithDependencyType>,
    base_esm_resolve_options: Option<&'a ResolveOptionsWithDependencyType>,
    base_resolve_options: Option<&'a ResolveOptionsWithDependencyType>,
) -> rspack_error::Result<ResolveResult>
where
    GetResolveFn: Fn(Option<ResolveOptionsWithDependencyType>) -> ResolveFn,
    IsLocalCallbackFn: Fn(&str) -> Option<String> + Send + Sync + 'static,
{
    let esm_externals = esm_externals_config.is_enabled();
    let loose_esm_externals = esm_externals_config.is_loose();

    let mut res: Option<String> = None;
    let mut is_esm = false;

    let prefer_esm_options = if esm_externals && is_esm_requested {
        vec![true, false]
    } else {
        vec![false]
    };

    let base_resolve_check = base_resolve_check.unwrap_or(true);
    let esm_resolve_options = esm_resolve_options.unwrap_or(&NODE_ESM_RESOLVE_OPTIONS);
    let node_resolve_options = node_resolve_options.unwrap_or(&NODE_RESOLVE_OPTIONS);
    let base_esm_resolve_options =
        base_esm_resolve_options.unwrap_or(&NODE_BASE_ESM_RESOLVE_OPTIONS);
    let base_resolve_options = base_resolve_options.unwrap_or(&NODE_BASE_RESOLVE_OPTIONS);

    for prefer_esm in prefer_esm_options {
        let resolve_options = if prefer_esm {
            esm_resolve_options
        } else {
            node_resolve_options
        };

        let resolve = get_resolve(Some(resolve_options.clone()));

        // Resolve the import with the webpack provided context, this
        // ensures we're resolving the correct version when multiple exist.
        match resolve(ctx.to_string(), request.to_string()).await {
            Ok((resolved_path, resolved_is_esm)) => {
                res = resolved_path;
                is_esm = resolved_is_esm;
            }
            Err(_) => {
                res = None;
            }
        }

        if res.is_none() {
            continue;
        }

        // ESM externals can only be imported (and not required).
        // Make an exception in loose mode.
        if !is_esm_requested && is_esm && !loose_esm_externals {
            continue;
        }

        if let Some(is_local_callback) = &is_local_callback {
            if let Some(ref resolved) = res {
                return Ok(ResolveResult {
                    res: None,
                    is_esm: false,
                    local_res: is_local_callback(resolved),
                });
            }
        }

        // Bundled Node.js code is relocated without its node_modules tree.
        // This means we need to make sure its request resolves to the same
        // package that'll be available at runtime. If it's not identical,
        // we need to bundle the code (even if it _should_ be external).
        if base_resolve_check {
            let resolve_options = if is_esm {
                base_esm_resolve_options
            } else {
                base_resolve_options
            };

            let base_resolve = get_resolve(Some(resolve_options.clone()));

            let (base_res, base_is_esm) =
                match base_resolve(dir.to_string(), request.to_string()).await {
                    Ok((resolved_path, resolved_is_esm)) => (resolved_path, resolved_is_esm),
                    Err(_) => (None, false),
                };

            // Same as above: if the package, when required from the root,
            // would be different from what the real resolution would use, we
            // cannot externalize it.
            // If request is pointing to a symlink it could point to the same file,
            // the resolver will resolve symlinks so this is handled
            if base_res != res || is_esm != base_is_esm {
                res = None;
                continue;
            }
        }

        break;
    }

    Ok(ResolveResult {
        res,
        is_esm,
        local_res: None,
    })
}
