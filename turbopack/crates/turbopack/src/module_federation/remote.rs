use std::{collections::BTreeMap, path::Path};

use anyhow::{Context, Result};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{DiskFileSystem, FileContent, FileSystemPath};
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
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::utils::StringifyJs;

use crate::module_federation::config::{
    ModuleFederationConfig, ModuleFederationRemote, ModuleFederationShared,
};

const IMPLEMENTATION_HOST_REQUEST: &str = "__turbopack_module_federation_host__";

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
            key = StringifyJs(&shared.share_key),
            version = StringifyJs(version),
            import = StringifyJs(import),
            host_name = StringifyJs(host_name),
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
    if let Some(implementation) = &config.implementation {
        let host_replacer = ModuleFederationHostReplacer {
            project_path: project_path.clone(),
            implementation: implementation.clone(),
            config: config.clone(),
        }
        .resolved_cell();
        import_map.insert_exact_alias(
            IMPLEMENTATION_HOST_REQUEST,
            ImportMapping::Dynamic(ResolvedVc::upcast(host_replacer)).resolved_cell(),
        );
    }
    for (index, remote) in config.remotes.iter().enumerate() {
        let init_request: RcStr =
            format!("__turbopack_module_federation_remote_init__/{index}").into();
        let init_replacer = ModuleFederationRemoteInitReplacer {
            project_path: project_path.clone(),
            remote: remote.clone(),
            shared: config.shared.clone(),
            host_name: host_name.clone(),
            init_request: init_request.clone(),
            implementation_remote_index: config.implementation.as_ref().map(|_| index),
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
            await_factory: config.implementation.is_some(),
        }
        .resolved_cell();
        let mapping = ImportMapping::Dynamic(ResolvedVc::upcast(replacer)).resolved_cell();
        import_map.insert_exact_alias(remote.request.clone(), mapping);
        import_map.insert_wildcard_alias(RcStr::from(format!("{}/", remote.request)), mapping);
    }
}

#[turbo_tasks::value]
#[derive(Clone)]
struct ModuleFederationHostReplacer {
    project_path: FileSystemPath,
    implementation: RcStr,
    config: ModuleFederationConfig,
}

#[turbo_tasks::value]
#[derive(Clone)]
struct ModuleFederationRemoteInitReplacer {
    project_path: FileSystemPath,
    remote: ModuleFederationRemote,
    shared: Vec<ModuleFederationShared>,
    host_name: RcStr,
    init_request: RcStr,
    implementation_remote_index: Option<usize>,
}

#[turbo_tasks::value]
#[derive(Clone)]
struct ModuleFederationRemoteReplacer {
    project_path: FileSystemPath,
    remote: ModuleFederationRemote,
    init_request: RcStr,
    await_factory: bool,
}

#[turbo_tasks::value_impl]
impl ImportMappingReplacement for ModuleFederationHostReplacer {
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
        let implementation_path = Path::new(&*this.implementation);
        let implementation = if implementation_path.is_absolute() {
            let fs = this.project_path.fs().to_resolved().await?;
            let disk_fs = ResolvedVc::try_downcast_type::<DiskFileSystem>(fs).context(
                "An absolute Module Federation implementation requires a disk filesystem",
            )?;
            let implementation_path = disk_fs
                .await?
                .try_from_sys_path(disk_fs, implementation_path, None)
                .context(
                    "Module Federation implementation is outside the filesystem root; include its \
                     package in the configured root",
                )?;
            this.project_path
                .get_relative_request_to(&implementation_path)
                .context("Module Federation implementation must use the project's filesystem")?
        } else {
            this.implementation.clone()
        };
        let mut remotes = Vec::new();
        for (remote_index, remote) in this.config.remotes.iter().enumerate() {
            for (candidate_index, external) in remote.external.iter().enumerate() {
                remotes.push(serde_json::json!({
                    "name": format!("__turbopack_remote_{remote_index}_{candidate_index}"),
                    "entry": external.url,
                    "entryGlobalName": external.global,
                    "type": "global",
                    "shareScope": remote.share_scope,
                }));
            }
        }
        let mut shared_entries: BTreeMap<&RcStr, Vec<String>> = BTreeMap::new();
        for shared in &this.config.shared {
            let Some(import) = &shared.import else {
                continue;
            };
            shared_entries
                .entry(&shared.share_key)
                .or_default()
                .push(format!(
                    r#"{{
  version: {version},
  scope: [{scope}],
  get: () => import({import}).then((module) => () => module),
  shareConfig: {{ eager: {eager}, requiredVersion: false }}
}}"#,
                    version = StringifyJs(shared.version.as_deref().unwrap_or("0")),
                    scope = StringifyJs(&shared.share_scope),
                    import = StringifyJs(import),
                    eager = shared.eager,
                ));
        }
        let shared = shared_entries
            .into_iter()
            .map(|(key, entries)| format!("[{}]: [{}]", StringifyJs(key), entries.join(",\n")))
            .collect::<Vec<_>>()
            .join(",\n");
        let code = format!(
            r#"
import {{ createInstance }} from {implementation};
export const host = createInstance({{
  name: {host_name},
  shareStrategy: "loaded-first",
  remotes: {remotes},
  shared: {{ {shared} }}
}});
"#,
            implementation = StringifyJs(&implementation),
            host_name = StringifyJs(this.config.name.as_deref().unwrap_or("host")),
            remotes = StringifyJs(&remotes),
        );
        let source = VirtualSource::new(
            this.project_path
                .join(".turbopack-module-federation-host.js")?,
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

fn implementation_remote_source(remote_index: usize, remote: &ModuleFederationRemote) -> String {
    let candidates = remote
        .external
        .iter()
        .enumerate()
        .map(|(index, external)| {
            (
                format!("__turbopack_remote_{remote_index}_{index}"),
                &external.global,
                &external.url,
            )
        })
        .collect::<Vec<_>>();
    format!(
        r#"
import {{ host }} from {host_request};
const candidates = {candidates};

export async function get(request, fullRequest) {{
  await Promise.all(host.initializeSharing({share_scope}, {{ strategy: "loaded-first" }}));
  const failures = [];
  for (const [name, globalName, url] of candidates) {{
    try {{
      if (!Object.prototype.hasOwnProperty.call(globalThis, globalName)) {{
        await __turbopack_load_by_url__(url, true);
      }}
      if (!Object.prototype.hasOwnProperty.call(globalThis, globalName)) {{
        throw new Error(`Container global ${{globalName}} is missing after loading ${{url}}`);
      }}
      const id = request === "." ? name : `${{name}}/${{request.slice(2)}}`;
      const factory = await host.loadRemote(id, {{ loadFactory: false, from: "runtime" }});
      if (typeof factory !== "function") {{
        throw new Error(`Container ${{globalName}} returned no factory for ${{request}}`);
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
        host_request = StringifyJs(IMPLEMENTATION_HOST_REQUEST),
        candidates = StringifyJs(&candidates),
        share_scope = StringifyJs(&remote.share_scope),
    )
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
        let code = if let Some(index) = this.implementation_remote_index {
            implementation_remote_source(index, &this.remote)
        } else {
            let candidates = this
                .remote
                .external
                .iter()
                .map(|external| (&*external.global, &*external.url))
                .collect::<Vec<_>>();
            let registrations = provider_registrations(&this.shared, &this.host_name)?;
            format!(
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
                candidates = StringifyJs(&candidates),
                remote_key = StringifyJs(&this.remote.request),
                share_scope = StringifyJs(&this.remote.share_scope),
            )
        };
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

        let code = format!(
            r#"
const {{ get }} = await import({init_request});
const factory = await get({exposed_request_json}, {full_request});
const federatedModule = {await_factory}factory();
__turbopack_export_namespace__(federatedModule);
"#,
            init_request = StringifyJs(&this.init_request),
            exposed_request_json = StringifyJs(&exposed_request),
            full_request = StringifyJs(&request),
            await_factory = if this.await_factory { "await " } else { "" },
        );
        let virtual_name = format!(
            ".turbopack-module-federation-remote-{}-{}.js",
            this.remote.request.replace('/', "_"),
            exposed_request.replace('/', "_")
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
