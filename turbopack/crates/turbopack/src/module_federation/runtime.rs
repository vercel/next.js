use std::collections::BTreeMap;

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::ResolvedVc;
use turbo_tasks_fs::{FileContent, FileSystemPath};
use turbopack_core::{asset::AssetContent, source::Source, virtual_source::VirtualSource};
use turbopack_ecmascript::utils::StringifyJs;

use crate::module_federation::{
    config::ModuleFederationConfig,
    shared::{resolved_fallback_request, shared_provider_version},
};

/// An import that is shared by the app bootstrap, federated imports and the container entry.
pub const FEDERATION_RUNTIME_REQUEST: &str = "__turbopack_module_federation_runtime__";

pub async fn module_federation_runtime_source(
    project_path: FileSystemPath,
    config: &ModuleFederationConfig,
) -> Result<ResolvedVc<Box<dyn Source>>> {
    config.validate_runtime(&project_path).await?;
    let name = config.host_name(&project_path).await?;
    let implementation = config
        .implementation
        .as_deref()
        .unwrap_or("@module-federation/runtime-tools");
    let runtime_request = format!("{implementation}/runtime");
    let mut plugins = Vec::with_capacity(config.runtime_plugins.len());
    let mut plugin_imports = String::new();
    for (index, plugin) in config.runtime_plugins.iter().enumerate() {
        plugin_imports.push_str(&format!(
            "import runtimePlugin_{index} from {};\n",
            StringifyJs(&plugin.request),
        ));
        plugins.push(format!("runtimePlugin_{index}({})", plugin.params));
    }

    let mut remotes = Vec::new();
    for remote in &config.remotes {
        if let Some(manifest) = &remote.manifest {
            remotes.push(format!(
                "{{name:{},entry:{},shareScope:{}}}",
                StringifyJs(&remote.request),
                StringifyJs(manifest),
                StringifyJs(&remote.share_scope),
            ));
        } else if let Some(external) = remote.external.first() {
            remotes.push(format!(
                "{{name:{},entry:{},entryGlobalName:{},type:'var',shareScope:{}}}",
                StringifyJs(&remote.request),
                StringifyJs(&external.url),
                StringifyJs(&external.global),
                StringifyJs(&remote.share_scope),
            ));
        }
    }

    let mut providers_by_key = BTreeMap::<RcStr, Vec<String>>::new();
    let mut eager_imports = String::new();
    for provider in &config.shared {
        if provider.request.ends_with('/') {
            continue;
        }
        let Some(import) = &provider.import else {
            continue;
        };
        let version = shared_provider_version(&project_path, provider).await?;
        let import = resolved_fallback_request(&project_path, import).await?;
        let get = if provider.eager {
            let index = eager_imports.lines().count();
            eager_imports.push_str(&format!(
                "import * as eagerShared_{index} from {};\n",
                StringifyJs(&import)
            ));
            format!("get:()=>()=>eagerShared_{index},lib:()=>eagerShared_{index},loaded:true")
        } else {
            format!(
                "get:()=>import({}).then((module)=>()=>module)",
                StringifyJs(&import)
            )
        };
        providers_by_key
            .entry(provider.share_key.clone())
            .or_default()
            .push(format!(
                "{{version:{},scope:[{}],shareConfig:{{requiredVersion:false,singleton:{},eager:\
                 {},strictVersion:{}}},{get}}}",
                StringifyJs(&version),
                StringifyJs(&provider.share_scope),
                provider.singleton,
                provider.eager,
                provider.strict_version,
            ));
    }
    let shared = providers_by_key
        .into_iter()
        .map(|(key, providers)| format!("{}:[{}]", StringifyJs(&key), providers.join(",")))
        .collect::<Vec<_>>();

    let share_strategy = match config.share_strategy {
        crate::module_federation::config::ModuleFederationShareStrategy::VersionFirst => {
            "version-first"
        }
        crate::module_federation::config::ModuleFederationShareStrategy::LoadedFirst => {
            "loaded-first"
        }
    };
    let code = format!(
        r#"
import {{ init }} from {runtime_request};
{plugin_imports}{eager_imports}
const workerPlugin = {{
  name: 'turbopack-worker-entry',
  async loadEntry({{ remoteInfo }}) {{
    if (typeof importScripts !== 'function') return;
    importScripts(remoteInfo.entry);
    return globalThis[remoteInfo.entryGlobalName];
  }}
}};
export const instance = init({{
  name: {name},
  remotes: [{remotes}],
  shared: {{{shared}}},
  shareStrategy: {share_strategy},
  plugins: [workerPlugin, {plugins}]
}});
"#,
        runtime_request = StringifyJs(&runtime_request),
        plugin_imports = plugin_imports,
        eager_imports = eager_imports,
        name = StringifyJs(&name),
        remotes = remotes.join(",\n"),
        shared = shared.join(",\n"),
        share_strategy = StringifyJs(share_strategy),
        plugins = plugins.join(", "),
    );
    Ok(ResolvedVc::upcast(
        VirtualSource::new(
            project_path.join(".turbopack-module-federation-runtime.js")?,
            AssetContent::file(FileContent::Content(code.into()).cell()),
        )
        .to_resolved()
        .await?,
    ))
}
