use std::collections::BTreeMap;

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
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

use crate::module_federation::{
    config::{ModuleFederationConfig, ModuleFederationRemote, ModuleFederationShared},
    shared::{apply_shared_import_map, resolved_fallback_request, shared_provider_version},
};

async fn provider_registrations(
    project_path: &FileSystemPath,
    shared: &[ModuleFederationShared],
    provider_requests: &[Option<RcStr>],
    host_name: &str,
) -> Result<String> {
    let mut registrations = Vec::new();
    for (shared, provider_request) in shared.iter().zip(provider_requests) {
        if shared.request.ends_with('/') {
            continue;
        }
        let Some(import) = provider_request else {
            continue;
        };
        let version = shared_provider_version(project_path, shared).await?;
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
            host_name = serde_json::to_string(host_name)?,
            eager = shared.eager,
        ));
    }
    Ok(registrations.join("\n"))
}

async fn module_federation_remote_init_source(
    project_path: FileSystemPath,
    remote: &ModuleFederationRemote,
    shared: &[ModuleFederationShared],
    host_name: &str,
) -> Result<ResolvedVc<Box<dyn Source>>> {
    let candidates = serde_json::to_string(
        &remote
            .external
            .iter()
            .map(|external| (&*external.global, &*external.url))
            .collect::<Vec<_>>(),
    )?;
    let remote_key = serde_json::to_string(&remote.request)?;
    let share_scope = serde_json::to_string(&remote.share_scope)?;
    let scoped_shared = shared
        .iter()
        .filter(|shared| shared.share_scope == remote.share_scope)
        .cloned()
        .collect::<Vec<_>>();
    let mut provider_requests = Vec::with_capacity(scoped_shared.len());
    for shared in &scoped_shared {
        provider_requests.push(match &shared.import {
            Some(import) => Some(resolved_fallback_request(&project_path, import).await?),
            None => None,
        });
    }
    let registrations =
        provider_registrations(&project_path, &scoped_shared, &provider_requests, host_name)
            .await?;
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
    Ok(ResolvedVc::upcast(
        VirtualSource::new(
            project_path.join(&format!(
                ".turbopack-module-federation-init-{}.js",
                remote.request.replace('/', "_")
            ))?,
            AssetContent::file(FileContent::Content(code.into()).cell()),
        )
        .to_resolved()
        .await?,
    ))
}

pub async fn apply_module_federation_import_map(
    import_map: &mut ImportMap,
    project_path: FileSystemPath,
    config: &ModuleFederationConfig,
) -> Result<()> {
    let host_name = config.name.clone().unwrap_or_else(|| "host".into());
    let mut init_requests_by_scope = BTreeMap::<RcStr, Vec<RcStr>>::new();
    for (index, remote) in config.remotes.iter().enumerate() {
        let init_request: RcStr =
            format!("__turbopack_module_federation_remote_init__/{index}").into();
        init_requests_by_scope
            .entry(remote.share_scope.clone())
            .or_default()
            .push(init_request.clone());
        let init_source = module_federation_remote_init_source(
            project_path.clone(),
            remote,
            &config.shared,
            &host_name,
        )
        .await?;
        import_map.insert_exact_alias(
            init_request.clone(),
            ImportMapping::Direct(ResolveResult::source(init_source).resolved_cell())
                .resolved_cell(),
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
    apply_shared_import_map(import_map, project_path, config, &init_requests_by_scope);
    Ok(())
}

#[turbo_tasks::value]
#[derive(Clone)]
struct ModuleFederationRemoteReplacer {
    project_path: FileSystemPath,
    remote: ModuleFederationRemote,
    init_request: RcStr,
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
