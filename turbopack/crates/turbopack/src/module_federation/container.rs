use std::{collections::BTreeMap, path::Path};

use anyhow::{Context, Result};
use turbo_tasks::ResolvedVc;
use turbo_tasks_fs::{DiskFileSystem, FileContent, FileSystemPath};
use turbopack_core::{asset::AssetContent, source::Source, virtual_source::VirtualSource};
use turbopack_ecmascript::utils::StringifyJs;

use crate::module_federation::config::ModuleFederationConfig;

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
    let mut shared_entries = BTreeMap::<_, Vec<String>>::new();
    for shared in &config.shared {
        let Some(import) = &shared.import else {
            continue;
        };
        let version = shared.version.as_deref().unwrap_or("0");
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
                version = StringifyJs(version),
                scope = StringifyJs(&shared.share_scope),
                import = StringifyJs(import),
                eager = shared.eager,
            ));
        registrations.push(format!(
            r#"
  const versions_{index} = shareScope[{key}] ||= Object.create(null);
  versions_{index}[{version}] ||= {{
    get: () => import({import}).then((module) => () => module),
    from: {name},
    eager: {eager}
  }};"#,
            index = registrations.len(),
            key = StringifyJs(&shared.share_key),
            version = StringifyJs(version),
            import = StringifyJs(import),
            name = StringifyJs(name),
            eager = shared.eager,
        ));
    }
    let initialization = if let Some(implementation) = &config.implementation {
        let implementation_path = Path::new(&**implementation);
        let implementation = if implementation_path.is_absolute() {
            let fs = project_path.fs().to_resolved().await?;
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
            project_path
                .get_relative_request_to(&implementation_path)
                .context("Module Federation implementation must use the project's filesystem")?
        } else {
            implementation.clone()
        };
        let shared = shared_entries
            .into_iter()
            .map(|(key, entries)| format!("[{}]: [{}]", StringifyJs(key), entries.join(",\n")))
            .collect::<Vec<_>>()
            .join(",\n");
        format!(
            r#"
import {{ createInstance }} from {implementation};
const runtime = createInstance({{
  name: {name},
  remotes: [],
  shareStrategy: "loaded-first",
  shared: {{ {shared} }}
}});
const initToken = {{ from: {name} }};
let pending;
function init(shareScope, initScope, remoteEntryInitOptions) {{
  if (initializedScope && initializedScope !== shareScope) {{
    throw new Error("Container initialization failed because it has already been initialized with a different share scope");
  }}
  const shareScopeKeys = remoteEntryInitOptions?.shareScopeKeys;
  const hostShareScopeMap = remoteEntryInitOptions?.shareScopeMap;
  if (Array.isArray(shareScopeKeys) && (!hostShareScopeMap || typeof hostShareScopeMap !== "object")) {{
    throw new Error("Container initialization with shareScopeKeys requires a shareScopeMap");
  }}
  initializedScope = shareScope;
  runtime.initOptions({{ name: {name}, remotes: [], ...remoteEntryInitOptions }});
  if (Array.isArray(shareScopeKeys)) {{
    for (const key of shareScopeKeys) {{
      hostShareScopeMap[key] ||= {{}};
      runtime.initShareScopeMap(key, hostShareScopeMap[key], {{ hostShareScopeMap }});
    }}
  }} else {{
    runtime.initShareScopeMap({scope}, shareScope, {{ hostShareScopeMap: hostShareScopeMap || {{}} }});
  }}
  initScope ||= [];
  if (initScope.includes(initToken)) return;
  initScope.push(initToken);
  if (pending) return pending;
  pending = Promise.all(runtime.initializeSharing({scope}, {{ initScope, from: "build" }})).finally(() => {{
    pending = undefined;
  }});
  return pending;
}}
"#,
            implementation = StringifyJs(&implementation),
            name = StringifyJs(name),
            scope = StringifyJs(&config.share_scope),
        )
    } else {
        format!(
            r#"
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
"#,
            registrations = registrations.join("\n"),
        )
    };
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
{initialization}
const container = {{ get, init }};
globalThis[{name_json}] = container;
export {{ get, init }};
"#,
        module_entries = module_entries.join(",\n  "),
        name_json = StringifyJs(name),
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
