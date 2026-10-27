use anyhow::{Result, bail};
use bincode::{Decode, Encode};
use serde_json::Value as JsonValue;
use turbo_rcstr::RcStr;
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
        let Some(import) = &shared.import else {
            continue;
        };
        let version = shared.version.as_deref().unwrap_or("0");
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
            version = serde_json::to_string(version)?,
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
            let Some(import) = &shared.import else {
                continue;
            };
            let version = shared.version.as_deref().unwrap_or("0");
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
                version = serde_json::to_string(version)?,
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
    const initScope = [];
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
