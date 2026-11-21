use anyhow::{Result, bail};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{FileContent, FileSystemEntryType, FileSystemPath};
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

use crate::module_federation::{
    config::{ModuleFederationConfig, ModuleFederationShared},
    runtime::FEDERATION_RUNTIME_REQUEST,
};

fn shared_package_name(shared: &ModuleFederationShared) -> Option<RcStr> {
    shared.package_name.clone().or_else(|| {
        let request = shared.request.as_str();
        if request.starts_with('.') || request.starts_with('/') {
            None
        } else if request.starts_with('@') {
            request
                .split_once('/')
                .map(|(scope, name)| format!("{scope}/{name}").into())
        } else {
            request.split('/').next().map(Into::into)
        }
    })
}

pub async fn shared_provider_version(
    project_path: &FileSystemPath,
    shared: &ModuleFederationShared,
) -> Result<RcStr> {
    if let Some(version) = &shared.version {
        return Ok(version.clone());
    }
    let Some(package_name) = shared_package_name(shared) else {
        return Ok(rcstr!("0"));
    };
    let mut current = project_path.clone();
    loop {
        let package_dir = current.join("node_modules")?.join(package_name.as_str())?;
        if let Ok(package_dir) = package_dir.realpath().await? {
            let package_json_path = package_dir.join("package.json")?;
            if let FileContent::Content(file) = &*package_json_path.read().await? {
                let package_json: serde_json::Value = serde_json::from_reader(file.read())?;
                if let Some(version) = package_json
                    .get("version")
                    .and_then(serde_json::Value::as_str)
                {
                    return Ok(version.into());
                }
            }
        }
        let parent = current.parent();
        if parent == current {
            return Ok(rcstr!("0"));
        }
        current = parent;
    }
}

async fn shared_fallback_location(
    project_path: &FileSystemPath,
    request: &str,
) -> Result<(FileSystemPath, RcStr)> {
    if request.starts_with('.') || request.starts_with('/') {
        return Ok((project_path.clone(), request.into()));
    }

    let parts = request.split('/').collect::<Vec<_>>();
    let package_segments = if request.starts_with('@') { 2 } else { 1 };
    if parts.len() < package_segments {
        bail!("Invalid shared fallback request '{request}'");
    }
    let package_name = parts[..package_segments].join("/");
    let subpath = parts[package_segments..].join("/");
    let mut current = project_path.clone();
    let node_modules_path = loop {
        let node_modules = current.join("node_modules")?;
        let candidate = node_modules.join(&package_name)?;
        if let Ok(real_path) = candidate.realpath().await?
            && *real_path.get_type().await? == FileSystemEntryType::Directory
        {
            break node_modules;
        }
        let parent = current.parent();
        if parent == current {
            bail!("Unable to resolve shared fallback '{request}'");
        }
        current = parent;
    };
    let request = if subpath.is_empty() {
        format!("./{package_name}").into()
    } else {
        format!("./{package_name}/{subpath}").into()
    };
    Ok((node_modules_path, request))
}

pub(crate) async fn resolved_fallback_request(
    project_path: &FileSystemPath,
    request: &str,
) -> Result<RcStr> {
    let (source_dir, request) = shared_fallback_location(project_path, request).await?;
    let target = source_dir.join(&request)?;
    let relative = project_path.get_relative_path_to(&target).ok_or_else(|| {
        anyhow::anyhow!("Shared fallback '{request}' is on a different file system")
    })?;
    Ok(if relative.starts_with('.') {
        relative
    } else {
        format!("./{relative}").into()
    })
}

/// Exposed modules consume shared dependencies through their host's share scope, even when
/// a provider is eager. Ordinary client modules retain the eager local fallback behavior.
pub fn apply_shared_import_map(
    import_map: &mut ImportMap,
    project_path: FileSystemPath,
    config: &ModuleFederationConfig,
    exposed: bool,
) {
    for shared in &config.shared {
        let replacer = ModuleFederationSharedReplacer {
            project_path: project_path.clone(),
            shared: shared.clone(),
            consume_from_share_scope: exposed,
        }
        .resolved_cell();
        let mapping = ImportMapping::Dynamic(ResolvedVc::upcast(replacer)).resolved_cell();
        if shared.request.ends_with('/') {
            import_map.insert_wildcard_alias(shared.request.clone(), mapping);
        } else {
            import_map.insert_exact_alias(shared.request.clone(), mapping);
        }
    }
}

#[turbo_tasks::value]
#[derive(Clone)]
struct ModuleFederationSharedReplacer {
    project_path: FileSystemPath,
    shared: ModuleFederationShared,
    consume_from_share_scope: bool,
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
        let effective_import = this
            .shared
            .import
            .as_ref()
            .map(|import| format!("{import}{suffix}"));

        if this.shared.eager
            && !this.consume_from_share_scope
            && let Some(import) = &effective_import
        {
            let fallback_request = resolved_fallback_request(&this.project_path, import).await?;
            let code = format!("export * from {};", StringifyJs(&fallback_request));
            let mut virtual_name = request.replace('/', "_");
            virtual_name.insert_str(0, ".turbopack-module-federation-shared-");
            virtual_name.push_str(".js");
            let source = VirtualSource::new(
                this.project_path.join(&virtual_name)?,
                AssetContent::file(FileContent::Content(code.into()).cell()),
            )
            .to_resolved()
            .await?;
            return Ok(ImportMapResult::Result(
                ResolveResult::source(ResolvedVc::upcast(source)).resolved_cell(),
            )
            .cell());
        }

        let inferred_required_version =
            if this.shared.required_version.is_none() && !this.shared.required_version_disabled {
                let package_name = shared_package_name(&this.shared);
                if let Some(package_name) = package_name {
                    let package_json_path = this.project_path.join("package.json")?;
                    if let FileContent::Content(file) = &*package_json_path.read().await? {
                        let package_json: serde_json::Value = serde_json::from_reader(file.read())?;
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
                                .and_then(serde_json::Value::as_str)
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
        let required_version = this
            .shared
            .required_version
            .as_ref()
            .or(inferred_required_version.as_ref());
        let fallback_request = if let Some(import) = &effective_import {
            Some(resolved_fallback_request(&this.project_path, import).await?)
        } else {
            None
        };
        let fallback = match fallback_request {
            Some(request) => format!("sharedModule = await import({});", StringifyJs(&request)),
            None => format!(
                "throw new Error(`No satisfying shared module for ${{{}}}`);",
                StringifyJs(&effective_key)
            ),
        };
        let code = format!(
            r#"
if (typeof window === 'undefined' && typeof importScripts === 'undefined') {{
  throw new Error('Shared Module Federation consumption is only supported in browser client code');
}}
const {{ instance }} = await import({runtime_request});
let sharedModule;
try {{
  const factory = await instance.loadShare({key}, {{
    customShareInfo: {{
      scope: [{scope}],
      shareConfig: {{requiredVersion: {required_version}, singleton: {singleton}, strictVersion: {strict_version}}}
    }}
  }});
  if (factory) sharedModule = factory();
}} catch (error) {{
  if ({strict_version}) {{
    throw new Error(`No satisfying shared module for ${{{key}}}: ${{error?.message || error}}`);
  }}
}}
if (!sharedModule) {{ {fallback} }}
// CommonJS providers export the entire module as their default. Keep this source free of
// static export declarations so Turbopack treats its runtime namespace as dynamic.
const sharedDefault = Object.prototype.hasOwnProperty.call(sharedModule, 'default')
  ? sharedModule.default : sharedModule;
__turbopack_export_namespace__({{ ...sharedModule, default: sharedDefault }});
"#,
            runtime_request = StringifyJs(FEDERATION_RUNTIME_REQUEST),
            key = StringifyJs(&effective_key),
            scope = StringifyJs(&this.shared.share_scope),
            required_version = StringifyJs(&required_version),
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
