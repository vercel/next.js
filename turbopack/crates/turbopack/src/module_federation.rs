use std::collections::BTreeMap;

use anyhow::{Result, bail};
use bincode::{Decode, Encode};
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, OperationValue, ResolvedVc, Vc, trace::TraceRawVcs};
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

#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    Encode,
    Decode,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(untagged)]
pub enum ModuleFederationStringOrStrings {
    String(RcStr),
    Strings(Vec<RcStr>),
}

impl ModuleFederationStringOrStrings {
    fn into_vec(self) -> Vec<RcStr> {
        match self {
            Self::String(value) => vec![value],
            Self::Strings(values) => values,
        }
    }
}

#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    Encode,
    Decode,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct UnnormalizedModuleFederationRemoteOptions {
    pub external: ModuleFederationStringOrStrings,
    pub share_scope: Option<RcStr>,
}

#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    Encode,
    Decode,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(untagged)]
pub enum UnnormalizedModuleFederationRemote {
    String(RcStr),
    Strings(Vec<RcStr>),
    Options(UnnormalizedModuleFederationRemoteOptions),
}

#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    Encode,
    Decode,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(untagged)]
pub enum UnnormalizedModuleFederationRemoteArrayItem {
    String(RcStr),
    Object(BTreeMap<RcStr, UnnormalizedModuleFederationRemote>),
}

#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    Encode,
    Decode,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(untagged)]
pub enum UnnormalizedModuleFederationRemotes {
    Object(BTreeMap<RcStr, UnnormalizedModuleFederationRemote>),
    Array(Vec<UnnormalizedModuleFederationRemoteArrayItem>),
}

#[derive(
    Clone,
    Debug,
    Default,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    Encode,
    Decode,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct UnnormalizedModuleFederationSharedOptions {
    pub import: Option<ModuleFederationSharedImport>,
    pub share_key: Option<RcStr>,
    pub share_scope: Option<RcStr>,
    pub version: Option<RcStr>,
    pub eager: Option<bool>,
}

#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    Encode,
    Decode,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(untagged)]
pub enum ModuleFederationSharedImport {
    String(RcStr),
    False(bool),
}

#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    Encode,
    Decode,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(untagged)]
pub enum UnnormalizedModuleFederationShared {
    String(RcStr),
    Options(UnnormalizedModuleFederationSharedOptions),
}

#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    Encode,
    Decode,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(untagged)]
pub enum UnnormalizedModuleFederationSharedArrayItem {
    String(RcStr),
    Object(BTreeMap<RcStr, UnnormalizedModuleFederationShared>),
}

#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    Encode,
    Decode,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(untagged)]
pub enum UnnormalizedModuleFederationSharedEntries {
    Object(BTreeMap<RcStr, UnnormalizedModuleFederationShared>),
    Array(Vec<UnnormalizedModuleFederationSharedArrayItem>),
}

#[derive(
    Clone,
    Copy,
    Debug,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    Encode,
    Decode,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(rename_all = "lowercase")]
pub enum ModuleFederationRemoteType {
    Script,
}

#[derive(
    Clone,
    Debug,
    Default,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    Encode,
    Decode,
    TraceRawVcs,
    NonLocalValue,
    OperationValue,
)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct UnnormalizedModuleFederationConfig {
    pub name: Option<RcStr>,
    pub remotes: Option<UnnormalizedModuleFederationRemotes>,
    pub shared: Option<UnnormalizedModuleFederationSharedEntries>,
    pub share_scope: Option<RcStr>,
    pub remote_type: Option<ModuleFederationRemoteType>,
}

/// Normalized first-class Module Federation configuration.
#[turbo_tasks::value(shared)]
#[derive(Clone, Debug, Default)]
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

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, TraceRawVcs, NonLocalValue)]
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

impl UnnormalizedModuleFederationRemotes {
    fn into_entries(self) -> Vec<(RcStr, UnnormalizedModuleFederationRemote)> {
        match self {
            Self::Object(entries) => entries.into_iter().collect(),
            Self::Array(items) => items
                .into_iter()
                .flat_map(|item| match item {
                    UnnormalizedModuleFederationRemoteArrayItem::String(request) => vec![(
                        request.clone(),
                        UnnormalizedModuleFederationRemote::String(request),
                    )],
                    UnnormalizedModuleFederationRemoteArrayItem::Object(entries) => {
                        entries.into_iter().collect()
                    }
                })
                .collect(),
        }
    }
}

impl UnnormalizedModuleFederationSharedEntries {
    fn into_entries(self) -> Vec<(RcStr, UnnormalizedModuleFederationShared)> {
        match self {
            Self::Object(entries) => entries.into_iter().collect(),
            Self::Array(items) => items
                .into_iter()
                .flat_map(|item| match item {
                    UnnormalizedModuleFederationSharedArrayItem::String(request) => vec![(
                        request.clone(),
                        UnnormalizedModuleFederationShared::String(request),
                    )],
                    UnnormalizedModuleFederationSharedArrayItem::Object(entries) => {
                        entries.into_iter().collect()
                    }
                })
                .collect(),
        }
    }
}

impl UnnormalizedModuleFederationConfig {
    pub fn normalize(self) -> Result<ModuleFederationConfig> {
        let share_scope = self.share_scope.unwrap_or_else(|| "default".into());
        let mut config = ModuleFederationConfig {
            name: self.name,
            share_scope: share_scope.clone(),
            ..Default::default()
        };

        if let Some(remotes) = self.remotes {
            for (request, remote) in remotes.into_entries() {
                let (external, remote_share_scope) = match remote {
                    UnnormalizedModuleFederationRemote::String(external) => {
                        (vec![external], share_scope.clone())
                    }
                    UnnormalizedModuleFederationRemote::Strings(external) => {
                        (external, share_scope.clone())
                    }
                    UnnormalizedModuleFederationRemote::Options(options) => (
                        options.external.into_vec(),
                        options.share_scope.unwrap_or_else(|| share_scope.clone()),
                    ),
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

        if let Some(shared) = self.shared {
            for (request, shared) in shared.into_entries() {
                let options = match shared {
                    UnnormalizedModuleFederationShared::String(import) => {
                        UnnormalizedModuleFederationSharedOptions {
                            import: Some(ModuleFederationSharedImport::String(import)),
                            ..Default::default()
                        }
                    }
                    UnnormalizedModuleFederationShared::Options(options) => options,
                };
                let import = match options.import {
                    Some(ModuleFederationSharedImport::String(import)) => Some(import),
                    Some(ModuleFederationSharedImport::False(false)) => None,
                    Some(ModuleFederationSharedImport::False(true)) => {
                        bail!("Module Federation shared import must be a string or false")
                    }
                    None => Some(request.clone()),
                };
                config.shared.push(ModuleFederationShared {
                    request: request.clone(),
                    import,
                    package_name: None,
                    required_version: None,
                    share_key: options.share_key.unwrap_or_else(|| request.clone()),
                    share_scope: options.share_scope.unwrap_or_else(|| share_scope.clone()),
                    version: options.version,
                    eager: options.eager.unwrap_or(false),
                    singleton: false,
                    strict_version: false,
                });
            }
        }

        config.validate()?;
        Ok(config)
    }
}

impl ModuleFederationConfig {
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
                if external.url.is_empty() {
                    bail!(
                        "Module Federation remote '{}' has an empty script URL",
                        remote.request
                    );
                }
            }
        }
        Ok(())
    }
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

fn provider_registrations(shared: &[ModuleFederationShared], host_name: &str) -> Result<String> {
    let mut registrations = Vec::new();
    for shared in shared {
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
            host_name = serde_json::to_string(host_name)?,
            eager = shared.eager,
        ));
    }
    Ok(registrations.join("\n"))
}

/// Adds configured remote scopes to a Turbopack import map.
pub fn apply_module_federation_import_map(
    import_map: &mut ImportMap,
    project_path: FileSystemPath,
    config: &ModuleFederationConfig,
) {
    let host_name = config.name.clone().unwrap_or_else(|| "host".into());
    for (index, remote) in config.remotes.iter().enumerate() {
        let init_request: RcStr =
            format!("__turbopack_module_federation_remote_init__/{index}").into();
        let init_replacer = ModuleFederationRemoteInitReplacer {
            project_path: project_path.clone(),
            remote: remote.clone(),
            shared: config.shared.clone(),
            host_name: host_name.clone(),
            init_request: init_request.clone(),
        }
        .resolved_cell();
        import_map.insert_exact_alias(
            init_request.clone(),
            ImportMapping::Dynamic(ResolvedVc::upcast(init_replacer)).resolved_cell(),
        );

        let replacer = ModuleFederationRemoteReplacer {
            project_path: project_path.clone(),
            remote: remote.clone(),
            init_request,
        }
        .resolved_cell();
        let mapping = ImportMapping::Dynamic(ResolvedVc::upcast(replacer)).resolved_cell();
        import_map.insert_exact_alias(remote.request.clone(), mapping);
        import_map.insert_wildcard_alias(RcStr::from(format!("{}/", remote.request)), mapping);
    }
}

#[turbo_tasks::value]
#[derive(Clone)]
struct ModuleFederationRemoteInitReplacer {
    project_path: FileSystemPath,
    remote: ModuleFederationRemote,
    shared: Vec<ModuleFederationShared>,
    host_name: RcStr,
    init_request: RcStr,
}

#[turbo_tasks::value]
#[derive(Clone)]
struct ModuleFederationRemoteReplacer {
    project_path: FileSystemPath,
    remote: ModuleFederationRemote,
    init_request: RcStr,
}

#[turbo_tasks::value_impl]
impl ImportMappingReplacement for ModuleFederationRemoteInitReplacer {
    #[turbo_tasks::function]
    fn replace(&self, _capture: Vc<Pattern>) -> Vc<ReplacedImportMapping> {
        ReplacedImportMapping::Dynamic(ResolvedVc::upcast(self.clone().resolved_cell())).cell()
    }

    #[turbo_tasks::function]
    async fn result(
        self: Vc<Self>,
        _lookup_path: FileSystemPath,
        _request: Vc<Request>,
    ) -> Result<Vc<ImportMapResult>> {
        let this = self.await?;
        let candidates = serde_json::to_string(
            &this
                .remote
                .external
                .iter()
                .map(|external| (&*external.global, &*external.url))
                .collect::<Vec<_>>(),
        )?;
        let remote_key = serde_json::to_string(&this.remote.request)?;
        let share_scope = serde_json::to_string(&this.remote.share_scope)?;
        let registrations = provider_registrations(&this.shared, &this.host_name)?;
        let code = format!(
            r#"
const candidates = {candidates};
const remoteKey = {remote_key};
const federation = __turbopack_module_federation__;
const scope = federation.shareScopes[{share_scope}] ||= Object.create(null);
{registrations}

async function initializeCandidate(index) {{
  const [globalName, url] = candidates[index];
  const cacheKey = `${{remoteKey}}:${{index}}`;
  let promise = federation.remoteInitializations[cacheKey];
  if (!promise) {{
    promise = (async () => {{
      if (!Object.prototype.hasOwnProperty.call(globalThis, globalName)) {{
        await __turbopack_load_by_url__(url, true);
      }}
      if (!Object.prototype.hasOwnProperty.call(globalThis, globalName)) {{
        throw new Error(`Container global ${{globalName}} is missing after loading ${{url}}`);
      }}
      const container = globalThis[globalName];
      const initScope = federation.initScopes[{share_scope}] ||= [];
      await container.init(scope, initScope);
      return container;
    }})();
    federation.remoteInitializations[cacheKey] = promise;
    void promise.catch(() => {{
      if (federation.remoteInitializations[cacheKey] === promise) {{
        delete federation.remoteInitializations[cacheKey];
      }}
    }});
  }}
  return promise;
}}

export async function initializeAll() {{
  const containers = [];
  const failures = [];
  for (let index = 0; index < candidates.length; index++) {{
    try {{
      containers.push(await initializeCandidate(index));
    }} catch (error) {{
      failures.push(error);
    }}
  }}
  return {{ containers, failures }};
}}

export async function get(request, fullRequest) {{
  const failures = [];
  for (let index = 0; index < candidates.length; index++) {{
    try {{
      const container = await initializeCandidate(index);
      const initScope = federation.initScopes[{share_scope}] ||= [];
      const factory = await container.get(request, initScope);
      if (typeof factory !== "function") {{
        throw new Error(`Container ${{candidates[index][0]}} returned no factory for ${{request}}`);
      }}
      return factory;
    }} catch (error) {{
      failures.push(error);
    }}
  }}
  const details = failures.map((failure) => failure?.message || String(failure)).join("; ");
  const error = new Error(`Failed to load federated module ${{fullRequest}}: ${{details}}`);
  error.cause = failures;
  throw error;
}}
"#,
        );
        let virtual_name = format!(
            ".turbopack-module-federation-init-{}.js",
            this.remote.request.replace('/', "_")
        );
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

        let exposed_request_json = serde_json::to_string(&exposed_request)?;
        let full_request = serde_json::to_string(&request)?;
        let init_request = serde_json::to_string(&this.init_request)?;
        let code = format!(
            r#"
const {{ get }} = await import({init_request});
const factory = await get({exposed_request_json}, {full_request});
const federatedModule = factory();
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
    use super::{UnnormalizedModuleFederationConfig, validate_output_filename};

    #[test]
    fn normalizes_remote_configuration() {
        let config: UnnormalizedModuleFederationConfig = serde_json::from_str(
            r#"{
                "name": "host",
                "remotes": {
                    "catalog": {
                        "external": [
                            "catalog@https://one.example/remote.js",
                            "fallback@/remote.js",
                            "fileRemote@file:///tmp/remote.js"
                        ],
                        "shareScope": "catalog"
                    }
                }
            }"#,
        )
        .unwrap();
        let config = config.normalize().unwrap();
        assert_eq!(config.name.as_deref(), Some("host"));
        assert_eq!(config.remotes[0].request, "catalog");
        assert_eq!(config.remotes[0].external[1].global, "fallback");
        assert_eq!(config.remotes[0].external[1].url, "/remote.js");
        assert_eq!(config.remotes[0].external[2].url, "file:///tmp/remote.js");
        assert_eq!(config.remotes[0].share_scope, "catalog");
    }

    #[test]
    fn rejects_unsupported_configuration() {
        assert!(
            serde_json::from_str::<UnnormalizedModuleFederationConfig>(
                r#"{"remoteType":"module"}"#
            )
            .is_err()
        );
        assert!(
            serde_json::from_str::<UnnormalizedModuleFederationConfig>(
                r#"{"library":{"type":"var"}}"#
            )
            .is_err()
        );
        assert!(
            serde_json::from_str::<UnnormalizedModuleFederationConfig>(
                r#"{"remotes":{"catalog":{"external":"catalog@/remote.js","unknown":true}}}"#
            )
            .is_err()
        );
        let empty_url: UnnormalizedModuleFederationConfig =
            serde_json::from_str(r#"{"remotes":{"catalog":"catalog@"}}"#).unwrap();
        assert!(empty_url.normalize().is_err());
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
