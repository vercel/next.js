use anyhow::Result;
use turbo_tasks::ResolvedVc;
use turbo_tasks_fs::{FileContent, FileSystemPath};
use turbopack_core::{asset::AssetContent, source::Source, virtual_source::VirtualSource};

use crate::module_federation::{config::ModuleFederationConfig, shared::shared_provider_version};

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
