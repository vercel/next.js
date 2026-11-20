use std::collections::BTreeMap;

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

use crate::module_federation::config::{ModuleFederationConfig, ModuleFederationShared};

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

pub(crate) async fn shared_provider_version(
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
        let package_json_path = current
            .join("node_modules")?
            .join(package_name.as_str())?
            .join("package.json")?;
        if let FileContent::Content(file) = &*package_json_path.read().await? {
            let package_json: serde_json::Value = serde_json::from_reader(file.read())?;
            if let Some(version) = package_json
                .get("version")
                .and_then(serde_json::Value::as_str)
            {
                return Ok(version.into());
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
        if *candidate.get_type().await? == FileSystemEntryType::Directory {
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

pub(crate) fn apply_shared_import_map(
    import_map: &mut ImportMap,
    project_path: FileSystemPath,
    config: &ModuleFederationConfig,
    init_requests_by_scope: &BTreeMap<RcStr, Vec<RcStr>>,
) {
    for shared in &config.shared {
        let replacer = ModuleFederationSharedReplacer {
            project_path: project_path.clone(),
            shared: shared.clone(),
            init_requests: init_requests_by_scope
                .get(&shared.share_scope)
                .cloned()
                .unwrap_or_default(),
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
    init_requests: Vec<RcStr>,
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
            && let Some(import) = &effective_import
        {
            let fallback_request = resolved_fallback_request(&this.project_path, import).await?;
            let code = format!(
                "export * from {};",
                serde_json::to_string(&fallback_request)?
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
        let required_version_value = this
            .shared
            .required_version
            .as_ref()
            .or(inferred_required_version.as_ref());
        let scope = serde_json::to_string(&this.shared.share_scope)?;
        let key = serde_json::to_string(&effective_key)?;
        let required_version = serde_json::to_string(&required_version_value)?;
        let initialize_remotes = if this.shared.eager {
            String::new()
        } else {
            let init_loaders = this
                .init_requests
                .iter()
                .map(|request| {
                    Ok(format!(
                        "() => import({}).then((remote) => remote.initializeAll())",
                        serde_json::to_string(request)?
                    ))
                })
                .collect::<Result<Vec<_>>>()?
                .join(",\n  ");
            format!(
                "const initializeRemotes = [\n  {init_loaders}\n];\nawait \
                 Promise.all(initializeRemotes.map((initialize) => initialize()));"
            )
        };
        let fallback_request = if let Some(import) = &effective_import {
            Some(resolved_fallback_request(&this.project_path, import).await?)
        } else {
            None
        };
        let fallback = match fallback_request {
            Some(request) => format!(
                "sharedModule = await import({});",
                serde_json::to_string(&request)?
            ),
            None => format!(
                "throw new Error(`No satisfying shared module for ${{{}}}`);",
                serde_json::to_string(&effective_key)?
            ),
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
{initialize_remotes}
const federation = __turbopack_module_federation__;
const scope = federation.shareScopes[{scope}] ||= Object.create(null);
const versions = scope[{key}] || Object.create(null);
const requiredVersion = {required_version};

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
