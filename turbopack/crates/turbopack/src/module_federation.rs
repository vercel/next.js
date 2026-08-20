use anyhow::{Result, bail};
use bincode::{Decode, Encode};
use serde_json::Value as JsonValue;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{NonLocalValue, ResolvedVc, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::{FileContent, FileSystemPath};
use turbopack_core::{
    asset::AssetContent,
    resolve::{
        ResolveResult,
        options::{
            ImportMap, ImportMapResult, ImportMapping, ImportMappingReplacement,
            ReplacedImportMapping,
        },
        parse::Request,
        pattern::Pattern,
    },
    source::Source,
    virtual_source::VirtualSource,
};

/// Normalized first-class Module Federation configuration.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct ModuleFederationConfig {
    pub name: Option<RcStr>,
    pub filename: Option<RcStr>,
    pub remotes: Vec<ModuleFederationRemote>,
    pub exposes: Vec<ModuleFederationExpose>,
    pub shared: Vec<ModuleFederationShared>,
    pub share_scope: RcStr,
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TraceRawVcs, NonLocalValue)]
pub struct ModuleFederationRemote {
    pub request: RcStr,
    pub external: Vec<ModuleFederationRemoteExternal>,
    pub share_scope: RcStr,
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TraceRawVcs, NonLocalValue)]
pub struct ModuleFederationRemoteExternal {
    pub global: RcStr,
    pub url: RcStr,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ModuleFederationExpose {
    pub request: RcStr,
    pub imports: Vec<RcStr>,
    pub chunk_name: Option<RcStr>,
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TraceRawVcs, NonLocalValue)]
pub struct ModuleFederationShared {
    pub request: RcStr,
    pub import: Option<RcStr>,
    pub package_name: Option<RcStr>,
    pub required_version: Option<RcStr>,
    pub share_key: RcStr,
    pub share_scope: RcStr,
    pub version: Option<RcStr>,
    pub eager: bool,
    pub singleton: bool,
    pub strict_version: bool,
}

impl ModuleFederationConfig {
    pub fn from_json(json: &str) -> Result<Self> {
        let value: JsonValue = serde_json::from_str(json)?;
        let object = value
            .as_object()
            .ok_or_else(|| anyhow::anyhow!("Module Federation configuration must be an object"))?;
        for key in object.keys() {
            if !matches!(
                key.as_str(),
                "name"
                    | "filename"
                    | "remotes"
                    | "exposes"
                    | "shared"
                    | "shareScope"
                    | "remoteType"
            ) {
                bail!("Unknown Module Federation option '{key}'");
            }
        }
        if let Some(remote_type) = object.get("remoteType").and_then(JsonValue::as_str)
            && remote_type != "script"
        {
            bail!(
                "Unsupported Module Federation remoteType '{remote_type}'; only 'script' is \
                 supported"
            );
        }
        let share_scope: RcStr = object
            .get("shareScope")
            .and_then(JsonValue::as_str)
            .unwrap_or("default")
            .into();
        let mut config = Self {
            name: object
                .get("name")
                .and_then(JsonValue::as_str)
                .map(Into::into),
            filename: object
                .get("filename")
                .and_then(JsonValue::as_str)
                .map(Into::into),
            share_scope: share_scope.clone(),
            ..Default::default()
        };
        if let Some(remotes) = object.get("remotes") {
            for (request, value) in option_entries(remotes)? {
                let (external, remote_share_scope) = if let Some(options) = value.as_object() {
                    let external = options.get("external").ok_or_else(|| {
                        anyhow::anyhow!(
                            "Module Federation remote '{request}' is missing 'external'"
                        )
                    })?;
                    (
                        string_or_strings(external, "remote external")?,
                        options
                            .get("shareScope")
                            .and_then(JsonValue::as_str)
                            .unwrap_or(&share_scope)
                            .into(),
                    )
                } else {
                    (
                        string_or_strings(&value, "remote external")?,
                        share_scope.clone(),
                    )
                };
                config.remotes.push(ModuleFederationRemote {
                    request,
                    external: external
                        .into_iter()
                        .map(|external| parse_remote_external(&external))
                        .collect::<Result<_>>()?,
                    share_scope: remote_share_scope,
                });
            }
        }
        if let Some(exposes) = object.get("exposes") {
            for (request, value) in option_entries(exposes)? {
                let (imports, chunk_name) = if let Some(options) = value.as_object() {
                    (
                        string_or_strings(
                            options.get("import").ok_or_else(|| {
                                anyhow::anyhow!(
                                    "Module Federation expose '{request}' is missing 'import'"
                                )
                            })?,
                            "expose import",
                        )?,
                        options
                            .get("name")
                            .and_then(JsonValue::as_str)
                            .map(Into::into),
                    )
                } else {
                    (string_or_strings(&value, "expose import")?, None)
                };
                config.exposes.push(ModuleFederationExpose {
                    request,
                    imports,
                    chunk_name,
                });
            }
        }
        if let Some(shared) = object.get("shared") {
            for (request, value) in option_entries(shared)? {
                let options = value.as_object();
                let import = match options.and_then(|value| value.get("import")) {
                    Some(JsonValue::Bool(false)) => None,
                    Some(JsonValue::String(value)) => Some(value.as_str().into()),
                    Some(_) => bail!("Module Federation shared import must be a string or false"),
                    None => Some(
                        value
                            .as_str()
                            .filter(|value| *value != request.as_str())
                            .unwrap_or(&request)
                            .into(),
                    ),
                };
                let string = |key: &str| {
                    options
                        .and_then(|value| value.get(key))
                        .and_then(JsonValue::as_str)
                        .map(RcStr::from)
                };
                let boolean = |key: &str| {
                    options
                        .and_then(|value| value.get(key))
                        .and_then(JsonValue::as_bool)
                        .unwrap_or(false)
                };
                config.shared.push(ModuleFederationShared {
                    request: request.clone(),
                    import,
                    package_name: string("packageName"),
                    required_version: string("requiredVersion"),
                    share_key: string("shareKey").unwrap_or_else(|| request.clone()),
                    share_scope: string("shareScope").unwrap_or_else(|| share_scope.clone()),
                    version: string("version"),
                    eager: boolean("eager"),
                    singleton: boolean("singleton"),
                    strict_version: boolean("strictVersion"),
                });
            }
        }
        config.validate()?;
        Ok(config)
    }

    pub fn validate(&self) -> Result<()> {
        if !self.exposes.is_empty() && self.name.as_deref().is_none_or(str::is_empty) {
            bail!("Module Federation exposes require a non-empty container name");
        }
        if let Some(filename) = &self.filename {
            validate_output_filename(filename)?;
        }
        for remote in &self.remotes {
            if remote.request.is_empty() {
                bail!("Module Federation remote request must not be empty");
            }
            if remote.external.is_empty() {
                bail!(
                    "Module Federation remote '{}' must have at least one external",
                    remote.request
                );
            }
            for external in &remote.external {
                if external.global.is_empty() {
                    bail!(
                        "Module Federation remote '{}' has an empty global name",
                        remote.request
                    );
                }
                if !(external.url.starts_with("http://") || external.url.starts_with("https://")) {
                    bail!(
                        "Module Federation remote '{}' must use an absolute HTTP(S) script URL, \
                         got '{}'",
                        remote.request,
                        external.url
                    );
                }
            }
        }
        Ok(())
    }
}

fn option_entries(value: &JsonValue) -> Result<Vec<(RcStr, JsonValue)>> {
    if let Some(object) = value.as_object() {
        return Ok(object
            .iter()
            .map(|(key, value)| (key.as_str().into(), value.clone()))
            .collect());
    }
    let Some(array) = value.as_array() else {
        bail!("Module Federation options must be an object or array");
    };
    let mut entries = Vec::new();
    for item in array {
        if let Some(item) = item.as_str() {
            entries.push((item.into(), JsonValue::String(item.to_string())));
        } else if let Some(object) = item.as_object() {
            entries.extend(
                object
                    .iter()
                    .map(|(key, value)| (key.as_str().into(), value.clone())),
            );
        } else {
            bail!("Unexpected Module Federation array item");
        }
    }
    Ok(entries)
}

fn string_or_strings(value: &JsonValue, description: &str) -> Result<Vec<RcStr>> {
    if let Some(value) = value.as_str() {
        return Ok(vec![value.into()]);
    }
    let Some(values) = value.as_array() else {
        bail!("Module Federation {description} must be a string or string array");
    };
    values
        .iter()
        .map(|value| {
            value.as_str().map(Into::into).ok_or_else(|| {
                anyhow::anyhow!("Module Federation {description} array must contain only strings")
            })
        })
        .collect()
}

fn parse_remote_external(external: &str) -> Result<ModuleFederationRemoteExternal> {
    let Some((global, url)) = external.split_once('@') else {
        bail!("Module Federation script remote must use 'globalName@url', got '{external}'");
    };
    Ok(ModuleFederationRemoteExternal {
        global: global.into(),
        url: url.into(),
    })
}

pub fn validate_output_filename(filename: &str) -> Result<()> {
    if filename.is_empty()
        || filename.starts_with('/')
        || filename.starts_with('\\')
        || filename.contains('?')
        || filename.contains('#')
        || filename.contains("://")
        || filename
            .split(['/', '\\'])
            .any(|segment| segment.is_empty() || segment == "..")
    {
        bail!(
            "Module Federation filename must be a safe relative path without empty or '..' \
             segments"
        );
    }
    Ok(())
}

fn shared_package_name(shared: &ModuleFederationShared) -> Option<RcStr> {
    shared.package_name.clone().or_else(|| {
        let request = shared.request.as_str();
        if request.starts_with('@') {
            request
                .split_once('/')
                .map(|(scope, name)| format!("{scope}/{name}").into())
        } else {
            request.split('/').next().map(Into::into)
        }
    })
}

async fn shared_provider_version(
    project_path: &FileSystemPath,
    shared: &ModuleFederationShared,
) -> Result<RcStr> {
    if let Some(version) = &shared.version {
        return Ok(version.clone());
    }
    let Some(package_name) = shared_package_name(shared) else {
        return Ok(rcstr!("0"));
    };
    let package_json_path = project_path
        .join("node_modules")?
        .join(package_name.as_str())?
        .join("package.json")?;
    if let FileContent::Content(file) = &*package_json_path.read().await? {
        let package_json: JsonValue = serde_json::from_reader(file.read())?;
        if let Some(version) = package_json.get("version").and_then(JsonValue::as_str) {
            return Ok(version.into());
        }
    }
    Ok(rcstr!("0"))
}

/// Creates the virtual entry module for a webpack-compatible global container.
pub async fn module_federation_container_source(
    project_path: FileSystemPath,
    config: &ModuleFederationConfig,
) -> Result<ResolvedVc<Box<dyn Source>>> {
    config.validate()?;
    let name = config
        .name
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!("Module Federation container requires a name"))?;
    let mut module_entries = Vec::new();
    for expose in &config.exposes {
        let imports = expose
            .imports
            .iter()
            .map(|request| format!("import({})", serde_json::to_string(request).unwrap()))
            .collect::<Vec<_>>()
            .join(", ");
        module_entries.push(format!(
            "{}: () => Promise.all([{}]).then((modules) => () => modules[modules.length - 1])",
            serde_json::to_string(&expose.request)?,
            imports
        ));
    }
    let mut registrations = Vec::new();
    for shared in &config.shared {
        if shared.request.ends_with('/') {
            continue;
        }
        let Some(import) = &shared.import else {
            continue;
        };
        let version = shared_provider_version(&project_path, shared).await?;
        registrations.push(format!(
            r#"
  const versions_{index} = shareScope[{key}] ||= Object.create(null);
  versions_{index}[{version}] ||= {{
    get: () => import({import}).then((module) => () => module),
    from: {name},
    eager: {eager}
  }};"#,
            index = registrations.len(),
            key = serde_json::to_string(&shared.share_key)?,
            version = serde_json::to_string(&version)?,
            import = serde_json::to_string(import)?,
            name = serde_json::to_string(name)?,
            eager = shared.eager,
        ));
    }
    let name_json = serde_json::to_string(name)?;
    let source = format!(
        r#"
const moduleMap = {{
  {module_entries}
}};
let initializedScope;
function get(request) {{
  const loader = moduleMap[request];
  if (!loader) {{
    return Promise.reject(new Error(`Module ${{request}} does not exist in container {name}`));
  }}
  return loader();
}}
function init(shareScope, initScope) {{
  if (initializedScope) {{
    if (initializedScope !== shareScope) {{
      throw new Error("Container initialization failed because it has already been initialized with a different share scope");
    }}
    return;
  }}
  initializedScope = shareScope;
  {registrations}
}}
const container = {{ get, init }};
globalThis[{name_json}] = container;
export {{ get, init }};
"#,
        module_entries = module_entries.join(",\n  "),
        registrations = registrations.join("\n"),
    );
    Ok(ResolvedVc::upcast(
        VirtualSource::new(
            project_path.join("__turbopack_module_federation_entry__.js")?,
            AssetContent::file(FileContent::Content(source.into()).cell()),
        )
        .to_resolved()
        .await?,
    ))
}

/// Adds configured remote scopes to a Turbopack import map.
pub fn apply_module_federation_import_map(
    import_map: &mut ImportMap,
    project_path: FileSystemPath,
    config: &ModuleFederationConfig,
) {
    for remote in &config.remotes {
        let replacer = ModuleFederationRemoteReplacer {
            project_path: project_path.clone(),
            remote: remote.clone(),
            shared: config.shared.clone(),
            host_name: config.name.clone().unwrap_or_else(|| "host".into()),
        }
        .resolved_cell();
        let mapping = ImportMapping::Dynamic(ResolvedVc::upcast(replacer)).resolved_cell();
        import_map.insert_exact_alias(remote.request.clone(), mapping);
        import_map.insert_wildcard_alias(RcStr::from(format!("{}/", remote.request)), mapping);
    }

    for (index, shared) in config.shared.iter().enumerate() {
        let is_prefix = shared.request.ends_with('/');
        let fallback_request: RcStr = if is_prefix {
            format!("__turbopack_module_federation_shared_fallback__/{index}/").into()
        } else {
            format!("__turbopack_module_federation_shared_fallback__/{index}").into()
        };
        if let Some(import) = &shared.import {
            let mapping = if is_prefix {
                ImportMapping::PrimaryAlternative(
                    format!("{import}*").into(),
                    Some(project_path.clone()),
                )
            } else {
                ImportMapping::PrimaryAlternative(import.clone(), Some(project_path.clone()))
            }
            .resolved_cell();
            if is_prefix {
                import_map.insert_wildcard_alias(fallback_request.clone(), mapping);
            } else {
                import_map.insert_exact_alias(fallback_request.clone(), mapping);
            }
        }
        let replacer = ModuleFederationSharedReplacer {
            project_path: project_path.clone(),
            shared: shared.clone(),
            fallback_request,
        }
        .resolved_cell();
        let mapping = ImportMapping::Dynamic(ResolvedVc::upcast(replacer)).resolved_cell();
        if is_prefix {
            import_map.insert_wildcard_alias(shared.request.clone(), mapping);
        } else {
            import_map.insert_exact_alias(shared.request.clone(), mapping);
        }
    }
}

#[turbo_tasks::value]
#[derive(Clone)]
struct ModuleFederationRemoteReplacer {
    project_path: FileSystemPath,
    remote: ModuleFederationRemote,
    shared: Vec<ModuleFederationShared>,
    host_name: RcStr,
}

#[turbo_tasks::value_impl]
impl ImportMappingReplacement for ModuleFederationRemoteReplacer {
    #[turbo_tasks::function]
    fn replace(&self, _capture: Vc<Pattern>) -> Vc<ReplacedImportMapping> {
        ReplacedImportMapping::Dynamic(ResolvedVc::upcast(self.clone().resolved_cell())).cell()
    }

    #[turbo_tasks::function]
    async fn result(
        self: Vc<Self>,
        _lookup_path: FileSystemPath,
        request: Vc<Request>,
    ) -> Result<Vc<ImportMapResult>> {
        let this = self.await?;
        let Some(request) = request.await?.request() else {
            return Ok(ImportMapResult::NoEntry.cell());
        };
        let exposed_request = if request == this.remote.request {
            ".".to_string()
        } else if let Some(remainder) = request.strip_prefix(&format!("{}/", this.remote.request)) {
            format!("./{remainder}")
        } else {
            return Ok(ImportMapResult::NoEntry.cell());
        };

        let candidates = serde_json::to_string(
            &this
                .remote
                .external
                .iter()
                .map(|external| (&*external.global, &*external.url))
                .collect::<Vec<_>>(),
        )?;
        let share_scope = serde_json::to_string(&this.remote.share_scope)?;
        let exposed_request_json = serde_json::to_string(&exposed_request)?;
        let full_request = serde_json::to_string(&request)?;
        let mut registrations = Vec::new();
        for shared in &this.shared {
            if shared.request.ends_with('/') {
                continue;
            }
            let Some(import) = &shared.import else {
                continue;
            };
            let version = shared_provider_version(&this.project_path, shared).await?;
            registrations.push(format!(
                r#"
    const versions_{index} = scope[{key}] ||= Object.create(null);
    versions_{index}[{version}] ||= {{
      get: () => import({import}).then((module) => () => module),
      from: {host_name},
      eager: {eager}
    }};"#,
                index = registrations.len(),
                key = serde_json::to_string(&shared.share_key)?,
                version = serde_json::to_string(&version)?,
                import = serde_json::to_string(import)?,
                host_name = serde_json::to_string(&this.host_name)?,
                eager = shared.eager,
            ));
        }
        let registrations = registrations.join("\n");
        let code = format!(
            r#"
const candidates = {candidates};
const failures = [];
let federatedModule;
for (const [globalName, url] of candidates) {{
  try {{
    await __turbopack_load_script__(url);
    const container = globalThis[globalName];
    if (!container) {{
      throw new Error(`Container global ${{globalName}} is missing after loading ${{url}}`);
    }}
    const scopes = globalThis.__turbopack_module_federation_share_scopes__ ||= Object.create(null);
    const scope = scopes[{share_scope}] ||= Object.create(null);
    {registrations}
    const initScopes = globalThis.__turbopack_module_federation_init_scopes__ ||= Object.create(null);
    const initScope = initScopes[{share_scope}] ||= [];
    await container.init(scope, initScope);
    const factory = await container.get({exposed_request_json}, initScope);
    if (typeof factory !== "function") {{
      throw new Error(`Container ${{globalName}} returned no factory for ${{{exposed_request_json}}}`);
    }}
    federatedModule = factory();
    break;
  }} catch (error) {{
    failures.push(error);
  }}
}}
if (federatedModule === undefined) {{
  const details = failures.map((failure) => failure?.message || String(failure)).join("; ");
  const error = new Error(`Failed to load federated module ${{{full_request}}}: ${{details}}`);
  error.cause = failures;
  throw error;
}}
__turbopack_export_namespace__(federatedModule);
"#
        );
        let virtual_name = format!(
            ".turbopack-module-federation-remote-{}-{}.js",
            this.remote.request.replace('/', "_"),
            exposed_request.replace('/', "_")
        );
        let path = this.project_path.join(&virtual_name)?;
        let source = VirtualSource::new(
            path,
            AssetContent::file(FileContent::Content(code.into()).cell()),
        )
        .to_resolved()
        .await?;
        Ok(ImportMapResult::Result(
            ResolveResult::source(ResolvedVc::upcast(source)).resolved_cell(),
        )
        .cell())
    }
}

#[turbo_tasks::value]
#[derive(Clone)]
struct ModuleFederationSharedReplacer {
    project_path: FileSystemPath,
    shared: ModuleFederationShared,
    fallback_request: RcStr,
}

#[turbo_tasks::value_impl]
impl ImportMappingReplacement for ModuleFederationSharedReplacer {
    #[turbo_tasks::function]
    fn replace(&self, _capture: Vc<Pattern>) -> Vc<ReplacedImportMapping> {
        ReplacedImportMapping::Dynamic(ResolvedVc::upcast(self.clone().resolved_cell())).cell()
    }

    #[turbo_tasks::function]
    async fn result(
        self: Vc<Self>,
        _lookup_path: FileSystemPath,
        request: Vc<Request>,
    ) -> Result<Vc<ImportMapResult>> {
        let this = self.await?;
        let Some(request) = request.await?.request() else {
            return Ok(ImportMapResult::NoEntry.cell());
        };
        let suffix = if this.shared.request.ends_with('/') {
            let Some(suffix) = request.strip_prefix(this.shared.request.as_str()) else {
                return Ok(ImportMapResult::NoEntry.cell());
            };
            suffix
        } else if request == this.shared.request {
            ""
        } else {
            return Ok(ImportMapResult::NoEntry.cell());
        };
        let effective_key: RcStr = format!("{}{suffix}", this.shared.share_key).into();
        let effective_fallback: RcStr = format!("{}{suffix}", this.fallback_request).into();

        let inferred_required_version = if this.shared.required_version.is_none() {
            let package_name = shared_package_name(&this.shared);
            if let Some(package_name) = package_name {
                let package_json_path = this.project_path.join("package.json")?;
                if let FileContent::Content(file) = &*package_json_path.read().await? {
                    let package_json: JsonValue = serde_json::from_reader(file.read())?;
                    [
                        "optionalDependencies",
                        "dependencies",
                        "peerDependencies",
                        "devDependencies",
                    ]
                    .into_iter()
                    .find_map(|field| {
                        package_json
                            .get(field)
                            .and_then(|dependencies| dependencies.get(package_name.as_str()))
                            .and_then(JsonValue::as_str)
                            .map(RcStr::from)
                    })
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };
        let required_version_value = this
            .shared
            .required_version
            .as_ref()
            .or(inferred_required_version.as_ref());
        let scope = serde_json::to_string(&this.shared.share_scope)?;
        let key = serde_json::to_string(&effective_key)?;
        let required_version = serde_json::to_string(&required_version_value)?;
        let fallback_request_json = serde_json::to_string(&effective_fallback)?;
        let (fallback_import, fallback) = if this.shared.eager {
            if this.shared.import.is_some() {
                (
                    String::new(),
                    format!("sharedModule = require({fallback_request_json});"),
                )
            } else {
                (
                    String::new(),
                    format!(
                        "throw new Error(`No satisfying shared module for ${{{}}}`);",
                        serde_json::to_string(&effective_key).unwrap()
                    ),
                )
            }
        } else if this.shared.import.is_some() {
            (
                String::new(),
                format!("sharedModule = await import({fallback_request_json});"),
            )
        } else {
            (
                String::new(),
                format!(
                    "throw new Error(`No satisfying shared module for ${{{}}}`);",
                    serde_json::to_string(&effective_key).unwrap()
                ),
            )
        };
        let selected_load = if this.shared.eager {
            r#"
  const factory = versions[selected].get();
  if (factory && typeof factory.then === "function") {
    throw new Error("Eager shared module provider returned a promise");
  }
  sharedModule = factory();"#
                .to_string()
        } else {
            r#"
  const factory = await versions[selected].get();
  sharedModule = factory();"#
                .to_string()
        };
        let code = format!(
            r#"
{fallback_import}
const scopes = globalThis.__turbopack_module_federation_share_scopes__ ||= Object.create(null);
const scope = scopes[{scope}] ||= Object.create(null);
const versions = scope[{key}] || Object.create(null);
const requiredVersion = {required_version};

// Range evaluation compatible with the subset of npm semver ranges webpack's Module Federation
// supports: comparators, caret/tilde, partial and `x` ranges, `||` unions and hyphen ranges,
// including prerelease ordering. This is an independent implementation, not a copy of webpack's
// build-time encoded-range runtime.
function parseVersion(version) {{
  const [mainAndPre] = version.replace(/^v/, "").split("+");
  const [main, pre = ""] = mainAndPre.split("-");
  const parts = main.split(".").map((part) => Number(part || 0));
  while (parts.length < 3) parts.push(0);
  return {{ parts, pre: pre ? pre.split(".") : [] }};
}}
function compareVersionAscending(left, right) {{
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < 3; index++) {{
    if (a.parts[index] !== b.parts[index]) return a.parts[index] - b.parts[index];
  }}
  if (!a.pre.length || !b.pre.length) return b.pre.length - a.pre.length;
  for (let index = 0; index < Math.max(a.pre.length, b.pre.length); index++) {{
    if (a.pre[index] === undefined) return -1;
    if (b.pre[index] === undefined) return 1;
    if (a.pre[index] === b.pre[index]) continue;
    const aNumber = Number(a.pre[index]);
    const bNumber = Number(b.pre[index]);
    const aNumeric = Number.isFinite(aNumber);
    const bNumeric = Number.isFinite(bNumber);
    if (aNumeric && bNumeric) return aNumber - bNumber;
    if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
    return a.pre[index] < b.pre[index] ? -1 : 1;
  }}
  return 0;
}}
function satisfiesComparator(version, comparator) {{
  const match = /^(<=|>=|<|>|=|~|\^)?\s*(.*)$/.exec(comparator);
  const operator = match[1] || "=";
  const target = match[2];
  if (!target || /^[*xX]$/.test(target)) return true;
  const targetParts = target.split(/[+-]/, 1)[0].split(".");
  const versionParts = parseVersion(version).parts;
  const wildcard = targetParts.findIndex((part) => /^[*xX]$/.test(part));
  const specified = wildcard >= 0 ? wildcard : targetParts.length;
  if ((wildcard >= 0 || specified < 3) && operator === "=") {{
    for (let index = 0; index < specified; index++) {{
      if (versionParts[index] !== Number(targetParts[index])) return false;
    }}
    return true;
  }}
  const comparison = compareVersionAscending(version, target);
  if (operator === ">=") return comparison >= 0;
  if (operator === ">") return comparison > 0;
  if (operator === "<=") return comparison <= 0;
  if (operator === "<") return comparison < 0;
  if (operator === "~") {{
    const parsed = parseVersion(target).parts;
    return comparison >= 0 && versionParts[0] === parsed[0] && versionParts[1] === parsed[1];
  }}
  if (operator === "^") {{
    const parsed = parseVersion(target).parts;
    const boundary = parsed[0] > 0 ? 0 : parsed[1] > 0 ? 1 : 2;
    return comparison >= 0 && versionParts.slice(0, boundary + 1).every((part, index) => part === parsed[index]);
  }}
  return comparison === 0;
}}
function satisfies(version, range) {{
  if (!range || range === "*") return true;
  return range.split(/\s*\|\|\s*/).some((alternative) => {{
    const hyphen = /^(\S+)\s+-\s+(\S+)$/.exec(alternative);
    if (hyphen) return satisfiesComparator(version, `>=${{hyphen[1]}}`) && satisfiesComparator(version, `<=${{hyphen[2]}}`);
    return alternative.trim().split(/\s+/).every((comparator) => satisfiesComparator(version, comparator));
  }});
}}

const available = Object.keys(versions).sort((a, b) => compareVersionAscending(b, a));
const satisfying = available.filter((version) => satisfies(version, requiredVersion));
const selected = {singleton} ? available[0] : satisfying[0];
let sharedModule;
if (selected && (!{strict_version} || satisfies(selected, requiredVersion))) {{{selected_load}
}} else {{
  {fallback}
}}
// Webpack's module namespace objects are sealed, so copy the bindings into a fresh object
// before handing them to Turbopack's namespace export helper.
__turbopack_export_namespace__({{ ...sharedModule }});
"#,
            singleton = this.shared.singleton,
            strict_version = this.shared.strict_version,
        );
        let mut virtual_name = request.replace('/', "_");
        virtual_name.insert_str(0, ".turbopack-module-federation-shared-");
        virtual_name.push_str(".js");
        let source = VirtualSource::new(
            this.project_path.join(&virtual_name)?,
            AssetContent::file(FileContent::Content(code.into()).cell()),
        )
        .to_resolved()
        .await?;
        Ok(ImportMapResult::Result(
            ResolveResult::source(ResolvedVc::upcast(source)).resolved_cell(),
        )
        .cell())
    }
}

#[cfg(test)]
mod tests {
    use super::{ModuleFederationConfig, validate_output_filename};

    #[test]
    fn normalizes_remote_configuration() {
        let config = ModuleFederationConfig::from_json(
            r#"{
                "name": "host",
                "remotes": {
                    "catalog": {
                        "external": [
                            "catalog@https://one.example/remote.js",
                            "fallback@https://two.example/remote.js"
                        ],
                        "shareScope": "catalog"
                    }
                }
            }"#,
        )
        .unwrap();
        assert_eq!(config.name.as_deref(), Some("host"));
        assert_eq!(config.remotes[0].request, "catalog");
        assert_eq!(config.remotes[0].external[1].global, "fallback");
        assert_eq!(config.remotes[0].share_scope, "catalog");
    }

    #[test]
    fn rejects_unsupported_configuration() {
        assert!(ModuleFederationConfig::from_json(r#"{"remoteType":"module"}"#).is_err());
        assert!(ModuleFederationConfig::from_json(r#"{"library":{"type":"var"}}"#).is_err());
        assert!(
            ModuleFederationConfig::from_json(
                r#"{"remotes":{"catalog":"catalog@file:///remote.js"}}"#
            )
            .is_err()
        );
    }

    #[test]
    fn validates_output_filenames() {
        assert!(validate_output_filename("remoteEntry.js").is_ok());
        assert!(validate_output_filename("nested/remoteEntry.js").is_ok());
        for invalid in [
            "",
            "/remoteEntry.js",
            "../remoteEntry.js",
            "nested//remoteEntry.js",
            "https://example.test/remoteEntry.js",
            "remoteEntry.js?x=1",
            "remoteEntry.js#fragment",
        ] {
            assert!(validate_output_filename(invalid).is_err(), "{invalid}");
        }
    }
}
