use anyhow::Result;
use turbo_tasks::ResolvedVc;
use turbo_tasks_fs::{FileContent, FileSystemPath};
use turbopack_core::{asset::AssetContent, source::Source, virtual_source::VirtualSource};
use turbopack_ecmascript::utils::StringifyJs;

use crate::module_federation::{
    config::ModuleFederationConfig,
    runtime::FEDERATION_RUNTIME_REQUEST,
    shared::{resolved_fallback_request, shared_provider_version},
};

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
            .map(|request| format!("import({})", StringifyJs(request)))
            .collect::<Vec<_>>()
            .join(", ");
        module_entries.push(format!(
            "{}: () => Promise.all([{}]).then((modules) => () => modules[modules.length - 1])",
            StringifyJs(&expose.request),
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
        let import = resolved_fallback_request(&project_path, import).await?;
        registrations.push(format!(
            r#"{{
  scope: {scope}, key: {key}, version: {version},
  get: () => import({import}).then((module) => () => module),
  from: {name}, eager: {eager}, singleton: {singleton}, strictVersion: {strict_version}
}}"#,
            scope = StringifyJs(&shared.share_scope),
            key = StringifyJs(&shared.share_key),
            version = StringifyJs(&version),
            import = StringifyJs(&import),
            name = StringifyJs(name),
            eager = shared.eager,
            singleton = shared.singleton,
            strict_version = shared.strict_version,
        ));
    }
    let source = format!(
        r#"
const moduleMap = {{
  {module_entries}
}};
const providers = [{registrations}];
const initializedScopes = Object.create(null);
const initializations = Object.create(null);
const activeInitScopes = Object.create(null);
function get(request) {{
  const loader = moduleMap[request];
  if (!loader) {{
    return Promise.reject(new Error(`Module ${{request}} does not exist in container {name}`));
  }}
  return loader();
}}
function init(shareScope, initScope, remoteEntryInitOptions) {{
  const keys = remoteEntryInitOptions?.shareScopeKeys || {default_scope};
  const scopeNames = Array.isArray(keys) ? keys : [keys];
  const pending = [];
  for (const scopeName of scopeNames) {{
    const hostScopes = remoteEntryInitOptions?.shareScopeMap;
    const scope = hostScopes
      ? (hostScopes[scopeName] ||= scopeName === scopeNames[0] ? shareScope : Object.create(null))
      : shareScope;
    if (initializedScopes[scopeName] && initializedScopes[scopeName] !== scope) {{
      throw new Error(`Container initialization failed: different share scope for ${{scopeName}}`);
    }}
    if (initializations[scopeName]) {{
      // A cyclic remote passes the same initScope token back to the container. Waiting on
      // our own in-flight promise would deadlock; unrelated callers still wait for it.
      if (!initScope || activeInitScopes[scopeName] !== initScope) {{
        pending.push(initializations[scopeName]);
      }}
      continue;
    }}
    initializedScopes[scopeName] = scope;
    activeInitScopes[scopeName] = initScope;
    const promise = (async () => {{
      try {{
      // Webpack v1 supplies only get/from/eager; enhance the same scope object in place so
      // both legacy hosts and the enhanced runtime can select its providers.
      for (const [key, versions] of Object.entries(scope)) {{
        for (const [version, entry] of Object.entries(versions)) {{
          entry.version ||= version;
          entry.scope ||= [scopeName];
          entry.shareConfig ||= {{requiredVersion: false, singleton: false, eager: !!entry.eager}};
          entry.strategy ||= 'version-first';
          entry.deps ||= [];
          entry.useIn ||= [];
        }}
      }}
      for (const provider of providers) {{
        if (provider.scope !== scopeName) continue;
        const versions = scope[provider.key] ||= Object.create(null);
        versions[provider.version] ||= {{
          version: provider.version,
          scope: [scopeName],
          get: provider.get,
          from: provider.from,
          eager: provider.eager,
          shareConfig: {{requiredVersion: false, singleton: provider.singleton, eager: provider.eager, strictVersion: provider.strictVersion}},
          strategy: 'version-first',
          deps: [], useIn: []
        }};
      }}
      const {{ instance }} = await import({runtime_request});
      instance.initShareScopeMap(scopeName, scope, {{hostShareScopeMap: remoteEntryInitOptions?.shareScopeMap}});
      await Promise.all(instance.initializeSharing(scopeName, {{initScope}}));
      }} finally {{
        delete activeInitScopes[scopeName];
      }}
    }})();
    initializations[scopeName] = promise;
    void promise.catch(() => {{
      if (initializations[scopeName] === promise) {{
        delete initializations[scopeName];
        delete initializedScopes[scopeName];
      }}
    }});
    pending.push(promise);
  }}
  return Promise.all(pending);
}}
const container = {{ get, init }};
globalThis[{name_json}] = container;
export {{ get, init }};
"#,
        module_entries = module_entries.join(",\n  "),
        registrations = registrations.join(",\n  "),
        name_json = StringifyJs(name),
        default_scope = StringifyJs(&config.share_scope),
        runtime_request = StringifyJs(FEDERATION_RUNTIME_REQUEST),
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
