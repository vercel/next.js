use std::collections::BTreeMap;

use anyhow::{Result, bail};
use bincode::{Decode, Encode};
use semver::{Version, VersionReq};
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, OperationValue};
use turbo_tasks_fs::{FileContent, FileSystemPath};
use url::Url;

#[derive(
    Clone,
    Debug,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    Encode,
    Decode,
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
    NonLocalValue,
    OperationValue,
)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct UnnormalizedModuleFederationRemoteOptions {
    pub external: Option<ModuleFederationStringOrStrings>,
    pub manifest: Option<RcStr>,
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
    NonLocalValue,
    OperationValue,
)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct UnnormalizedModuleFederationSharedOptions {
    pub import: Option<ModuleFederationSharedImport>,
    pub package_name: Option<RcStr>,
    pub required_version: Option<ModuleFederationSharedImport>,
    pub share_key: Option<RcStr>,
    pub share_scope: Option<RcStr>,
    pub version: Option<RcStr>,
    pub eager: Option<bool>,
    pub singleton: Option<bool>,
    pub strict_version: Option<bool>,
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
    NonLocalValue,
    OperationValue,
)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct UnnormalizedModuleFederationExposeOptions {
    pub import: ModuleFederationStringOrStrings,
    pub name: Option<RcStr>,
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
    NonLocalValue,
    OperationValue,
)]
#[serde(untagged)]
pub enum UnnormalizedModuleFederationExpose {
    String(RcStr),
    Strings(Vec<RcStr>),
    Options(UnnormalizedModuleFederationExposeOptions),
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
    NonLocalValue,
    OperationValue,
)]
#[serde(untagged)]
pub enum UnnormalizedModuleFederationExposeArrayItem {
    String(RcStr),
    Object(BTreeMap<RcStr, UnnormalizedModuleFederationExpose>),
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
    NonLocalValue,
    OperationValue,
)]
#[serde(untagged)]
pub enum UnnormalizedModuleFederationExposes {
    Object(BTreeMap<RcStr, UnnormalizedModuleFederationExpose>),
    Array(Vec<UnnormalizedModuleFederationExposeArrayItem>),
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
    NonLocalValue,
    OperationValue,
)]
#[serde(rename_all = "lowercase")]
pub enum ModuleFederationRemoteType {
    Script,
}

#[derive(
    Clone,
    Copy,
    Debug,
    Default,
    PartialEq,
    Eq,
    Serialize,
    Deserialize,
    Encode,
    Decode,
    NonLocalValue,
    OperationValue,
)]
#[serde(rename_all = "kebab-case")]
pub enum ModuleFederationShareStrategy {
    #[default]
    VersionFirst,
    LoadedFirst,
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
    NonLocalValue,
    OperationValue,
)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct UnnormalizedModuleFederationGenerateTypes {
    pub ts_config_path: Option<RcStr>,
    pub abort_on_error: Option<bool>,
    pub extract_third_party: Option<bool>,
    pub extract_remote_types: Option<bool>,
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
    NonLocalValue,
    OperationValue,
)]
#[serde(untagged)]
pub enum UnnormalizedModuleFederationGenerateTypesConfig {
    Enabled(bool),
    Options(UnnormalizedModuleFederationGenerateTypes),
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
    NonLocalValue,
    OperationValue,
)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct UnnormalizedModuleFederationDtsOptions {
    pub generate_types: UnnormalizedModuleFederationGenerateTypesConfig,
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
    NonLocalValue,
    OperationValue,
)]
#[serde(untagged)]
pub enum UnnormalizedModuleFederationDts {
    Disabled(bool),
    Options(UnnormalizedModuleFederationDtsOptions),
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
    NonLocalValue,
    OperationValue,
)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct UnnormalizedModuleFederationConfig {
    pub name: Option<RcStr>,
    pub filename: Option<RcStr>,
    pub remotes: Option<UnnormalizedModuleFederationRemotes>,
    pub exposes: Option<UnnormalizedModuleFederationExposes>,
    pub shared: Option<UnnormalizedModuleFederationSharedEntries>,
    pub share_scope: Option<RcStr>,
    pub remote_type: Option<ModuleFederationRemoteType>,
    pub share_strategy: Option<ModuleFederationShareStrategy>,
    pub implementation: Option<RcStr>,
    pub dts: Option<UnnormalizedModuleFederationDts>,
    #[bincode(with = "turbo_bincode::serde_self_describing")]
    pub runtime_plugins: Option<Vec<serde_json::Value>>,
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug, Default)]
pub struct ModuleFederationConfig {
    pub name: Option<RcStr>,
    pub filename: Option<RcStr>,
    pub remotes: Vec<ModuleFederationRemote>,
    pub exposes: Vec<ModuleFederationExpose>,
    pub shared: Vec<ModuleFederationShared>,
    pub share_scope: RcStr,
    pub share_strategy: ModuleFederationShareStrategy,
    pub implementation: Option<RcStr>,
    pub dts_enabled: bool,
    pub runtime_plugins: Vec<ModuleFederationRuntimePlugin>,
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, NonLocalValue)]
pub struct ModuleFederationRemote {
    pub request: RcStr,
    pub external: Vec<ModuleFederationRemoteExternal>,
    pub manifest: Option<RcStr>,
    pub share_scope: RcStr,
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, NonLocalValue)]
pub struct ModuleFederationRemoteExternal {
    pub global: RcStr,
    pub url: RcStr,
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, NonLocalValue)]
pub struct ModuleFederationRuntimePlugin {
    pub request: RcStr,
    pub params: RcStr,
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, NonLocalValue)]
pub struct ModuleFederationExpose {
    pub request: RcStr,
    pub imports: Vec<RcStr>,
    pub chunk_name: Option<RcStr>,
}

#[derive(Clone, Debug, PartialEq, Eq, Encode, Decode, NonLocalValue)]
pub struct ModuleFederationShared {
    pub request: RcStr,
    pub import: Option<RcStr>,
    pub package_name: Option<RcStr>,
    pub required_version: Option<RcStr>,
    pub required_version_disabled: bool,
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

impl UnnormalizedModuleFederationExposes {
    fn into_entries(self) -> Vec<(RcStr, UnnormalizedModuleFederationExpose)> {
        match self {
            Self::Object(entries) => entries.into_iter().collect(),
            Self::Array(items) => items
                .into_iter()
                .flat_map(|item| match item {
                    UnnormalizedModuleFederationExposeArrayItem::String(request) => vec![(
                        request.clone(),
                        UnnormalizedModuleFederationExpose::String(request),
                    )],
                    UnnormalizedModuleFederationExposeArrayItem::Object(entries) => {
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
        let dts_enabled = match self.dts {
            None | Some(UnnormalizedModuleFederationDts::Disabled(false)) => false,
            Some(UnnormalizedModuleFederationDts::Disabled(true)) => {
                bail!("Module Federation dts must be false or an object with generateTypes")
            }
            Some(UnnormalizedModuleFederationDts::Options(options)) => {
                match options.generate_types {
                    UnnormalizedModuleFederationGenerateTypesConfig::Enabled(true) => {}
                    UnnormalizedModuleFederationGenerateTypesConfig::Enabled(false) => {
                        bail!(
                            "Module Federation dts.generateTypes must be true or an options object"
                        )
                    }
                    UnnormalizedModuleFederationGenerateTypesConfig::Options(options) => {
                        if let Some(path) = options.ts_config_path {
                            validate_dts_ts_config_path(&path)?;
                        }
                    }
                }
                if self
                    .exposes
                    .as_ref()
                    .is_none_or(|exposes| exposes.clone().into_entries().is_empty())
                {
                    bail!("Module Federation dts.generateTypes requires exposed modules");
                }
                true
            }
        };
        let share_scope = self.share_scope.unwrap_or_else(|| "default".into());
        let runtime_plugins = self
            .runtime_plugins
            .unwrap_or_default()
            .into_iter()
            .map(|value| {
                let (request, params) = match value {
                    serde_json::Value::String(request) => (request, serde_json::json!({})),
                    serde_json::Value::Array(mut values) if values.len() == 2 => {
                        let params = values.pop().unwrap();
                        let request = values.pop().unwrap();
                        let Some(request) = request.as_str() else {
                            bail!("Module Federation runtime plugin request must be a string");
                        };
                        (request.to_string(), params)
                    }
                    _ => bail!("Invalid Module Federation runtime plugin entry"),
                };
                if request.trim().is_empty() {
                    bail!("Module Federation runtime plugin request must not be empty");
                }
                Ok(ModuleFederationRuntimePlugin {
                    request: request.into(),
                    params: params.to_string().into(),
                })
            })
            .collect::<Result<Vec<_>>>()?;
        let mut config = ModuleFederationConfig {
            name: self.name,
            filename: self.filename,
            share_scope: share_scope.clone(),
            share_strategy: self.share_strategy.unwrap_or_default(),
            implementation: self.implementation,
            dts_enabled,
            runtime_plugins,
            ..Default::default()
        };

        if let Some(remotes) = self.remotes {
            for (request, remote) in remotes.into_entries() {
                let (external, manifest, remote_share_scope) = match remote {
                    UnnormalizedModuleFederationRemote::String(entry) => {
                        if Url::parse(&entry).is_ok_and(|url| {
                            matches!(url.scheme(), "http" | "https") && url.has_host()
                        }) {
                            if !is_manifest_url(&entry) {
                                bail!(
                                    "Module Federation bare remote must be an http(s) manifest \
                                     URL ending in .json without credentials; use globalName@url \
                                     for scripts"
                                );
                            }
                            (vec![], Some(entry), share_scope.clone())
                        } else {
                            (vec![entry], None, share_scope.clone())
                        }
                    }
                    UnnormalizedModuleFederationRemote::Strings(external) => {
                        (external, None, share_scope.clone())
                    }
                    UnnormalizedModuleFederationRemote::Options(options) => {
                        let scope = options.share_scope.unwrap_or_else(|| share_scope.clone());
                        match (options.external, options.manifest) {
                            (Some(_), Some(_)) => bail!(
                                "Module Federation remote '{request}' cannot have both external \
                                 and manifest"
                            ),
                            (None, None) => bail!(
                                "Module Federation remote '{request}' needs external or manifest"
                            ),
                            (Some(external), None) => (external.into_vec(), None, scope),
                            (None, Some(manifest)) => (vec![], Some(manifest), scope),
                        }
                    }
                };
                config.remotes.push(ModuleFederationRemote {
                    request,
                    external: external
                        .into_iter()
                        .map(|external| parse_remote_external(&external))
                        .collect::<Result<_>>()?,
                    manifest,
                    share_scope: remote_share_scope,
                });
            }
        }

        if let Some(exposes) = self.exposes {
            for (request, expose) in exposes.into_entries() {
                let (imports, chunk_name) = match expose {
                    UnnormalizedModuleFederationExpose::String(import) => (vec![import], None),
                    UnnormalizedModuleFederationExpose::Strings(imports) => (imports, None),
                    UnnormalizedModuleFederationExpose::Options(options) => {
                        (options.import.into_vec(), options.name)
                    }
                };
                config.exposes.push(ModuleFederationExpose {
                    request,
                    imports,
                    chunk_name,
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
                let (required_version, required_version_disabled) = match options.required_version {
                    Some(ModuleFederationSharedImport::String(version)) => (Some(version), false),
                    Some(ModuleFederationSharedImport::False(false)) => (None, true),
                    None => (None, false),
                    Some(ModuleFederationSharedImport::False(true)) => {
                        bail!("Module Federation shared requiredVersion must be a string or false")
                    }
                };
                config.shared.push(ModuleFederationShared {
                    request: request.clone(),
                    import,
                    package_name: options.package_name,
                    required_version,
                    required_version_disabled,
                    share_key: options.share_key.unwrap_or_else(|| request.clone()),
                    share_scope: options.share_scope.unwrap_or_else(|| share_scope.clone()),
                    version: options.version,
                    eager: options.eager.unwrap_or(false),
                    singleton: options.singleton.unwrap_or(false),
                    strict_version: options.strict_version.unwrap_or(false),
                });
            }
        }

        config.validate()?;
        Ok(config)
    }
}

/// Match Node's parent-directory lookup for a package, including hoisted workspace installs.
/// Follow pnpm's node_modules symlinks before checking the installed package metadata.
async fn installed_package_path(
    project_path: &FileSystemPath,
    package_name: &str,
) -> Result<Option<FileSystemPath>> {
    let mut current = project_path.clone();
    loop {
        let candidate = current.join("node_modules")?.join(package_name)?;
        if let Ok(path) = candidate.realpath().await? {
            return Ok(Some(path));
        }
        let parent = current.parent();
        if parent == current {
            return Ok(None);
        }
        current = parent;
    }
}

impl ModuleFederationConfig {
    pub fn is_enabled(&self) -> bool {
        !self.remotes.is_empty() || !self.exposes.is_empty() || !self.shared.is_empty()
    }

    pub async fn host_name(&self, project_path: &FileSystemPath) -> Result<RcStr> {
        if let Some(name) = &self.name
            && !name.trim().is_empty()
        {
            return Ok(name.clone());
        }
        let path = project_path.join("package.json")?;
        if let FileContent::Content(file) = &*path.read().await? {
            let package: serde_json::Value = serde_json::from_reader(file.read())?;
            if let Some(name) = package.get("name").and_then(serde_json::Value::as_str)
                && !name.trim().is_empty()
            {
                return Ok(name.into());
            }
        }
        bail!("Module Federation requires a name or a non-empty app package.json name");
    }

    pub async fn validate_runtime(&self, project_path: &FileSystemPath) -> Result<()> {
        if !self.is_enabled() {
            return Ok(());
        }
        self.host_name(project_path).await?;
        if let Some(implementation) = &self.implementation {
            let path = if implementation.starts_with("./") {
                project_path.join(implementation)?.realpath().await?.ok()
            } else {
                installed_package_path(project_path, implementation).await?
            };
            let Some(path) = path else {
                bail!(
                    "Module Federation implementation '{implementation}' could not be resolved \
                     from the project"
                );
            };
            let FileContent::Content(file) = &*path.join("package.json")?.read().await? else {
                bail!(
                    "Module Federation implementation '{implementation}' must have a package.json"
                );
            };
            let package: serde_json::Value = serde_json::from_reader(file.read())?;
            let exports = package
                .get("exports")
                .and_then(serde_json::Value::as_object);
            if !exports.is_some_and(|exports| {
                exports.contains_key("./runtime")
                    && exports.contains_key("./webpack-bundler-runtime")
            }) {
                bail!(
                    "Module Federation implementation '{implementation}' must export ./runtime \
                     and ./webpack-bundler-runtime"
                );
            }
            return Ok(());
        }
        let missing_peer = "Module Federation requires @module-federation/runtime-tools@^2.9.0 in \
                            the project. Install it or provide an implementation override";
        let Some(package_dir) =
            installed_package_path(project_path, "@module-federation/runtime-tools").await?
        else {
            bail!("{missing_peer}");
        };
        let path = package_dir.join("package.json")?;
        let FileContent::Content(file) = &*path.read().await? else {
            bail!("{missing_peer}");
        };
        let package: serde_json::Value = serde_json::from_reader(file.read())?;
        let version = package
            .get("version")
            .and_then(serde_json::Value::as_str)
            .and_then(|version| Version::parse(version).ok());
        if !version
            .as_ref()
            .is_some_and(|version| VersionReq::parse("^2.9.0").unwrap().matches(version))
        {
            bail!(
                "Module Federation requires @module-federation/runtime-tools@^2.9.0 in the \
                 project. Install a compatible version or provide an implementation override"
            );
        }
        Ok(())
    }

    pub fn validate(&self) -> Result<()> {
        if !self.exposes.is_empty()
            && self
                .name
                .as_deref()
                .is_none_or(|name| name.trim().is_empty())
        {
            bail!("Module Federation exposes require a non-empty container name");
        }
        if let Some(implementation) = &self.implementation
            && (implementation.trim().is_empty()
                || implementation.starts_with('/')
                || implementation.contains('\\')
                || implementation
                    .split('/')
                    .any(|segment| segment.is_empty() || segment == ".."))
        {
            bail!(
                "Module Federation implementation must be a package name or safe project-relative \
                 directory"
            );
        }
        if let Some(filename) = &self.filename {
            validate_output_filename(filename)?;
        }
        for remote in &self.remotes {
            if remote.request.is_empty() {
                bail!("Module Federation remote request must not be empty");
            }
            if let Some(manifest) = &remote.manifest {
                if !remote.external.is_empty() {
                    bail!(
                        "Module Federation remote '{}' cannot have both external and manifest",
                        remote.request
                    );
                }
                if !is_manifest_url(manifest) {
                    bail!(
                        "Module Federation manifest must be an http(s) URL whose pathname ends in \
                         .json, without credentials"
                    );
                }
                continue;
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

fn is_manifest_url(value: &str) -> bool {
    Url::parse(value).is_ok_and(|url| {
        matches!(url.scheme(), "http" | "https")
            && url.has_host()
            && url.username().is_empty()
            && url.password().is_none()
            && url.path().ends_with(".json")
    })
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

fn validate_dts_ts_config_path(path: &str) -> Result<()> {
    if path.is_empty()
        || path.starts_with(['/', '\\'])
        || path.contains(['\\', ':', '\0', '?', '#'])
        || path.split('/').any(|part| part.is_empty() || part == "..")
        || path.rsplit('/').next() == Some(".")
    {
        bail!(
            "Module Federation dts.generateTypes.tsConfigPath must be a safe relative project path"
        );
    }
    Ok(())
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

#[cfg(test)]
mod tests {
    use crate::module_federation::{
        UnnormalizedModuleFederationConfig, UnnormalizedModuleFederationSharedOptions,
        validate_output_filename,
    };

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
    fn normalizes_manifest_remotes() {
        let config: UnnormalizedModuleFederationConfig = serde_json::from_str(
            r#"{"remotes":{
                "catalog":"https://catalog.example.com/mf-manifest.json?v=1#hash",
                "checkout":{"manifest":"http://checkout.example.com/manifest.json?c=1","shareScope":"feature"},
                "legacy":"legacy@/remoteEntry.js"
            }}"#,
        )
        .unwrap();
        let config = config.normalize().unwrap();
        assert_eq!(
            config.remotes[0].manifest.as_deref(),
            Some("https://catalog.example.com/mf-manifest.json?v=1#hash")
        );
        assert!(config.remotes[0].external.is_empty());
        assert_eq!(
            config.remotes[1].manifest.as_deref(),
            Some("http://checkout.example.com/manifest.json?c=1")
        );
        assert_eq!(config.remotes[1].share_scope, "feature");
        assert_eq!(config.remotes[2].external[0].global, "legacy");
    }

    #[test]
    fn rejects_invalid_manifest_remotes() {
        for json in [
            r#"{"remotes":{"catalog":{"manifest":"file:///tmp/manifest.json"}}}"#,
            r#"{"remotes":{"catalog":{"manifest":"https://remote.example.com/entry.js"}}}"#,
            r#"{"remotes":{"catalog":{"manifest":"https://remote.example.com/mf.json","external":"catalog@/entry.js"}}}"#,
            r#"{"remotes":{"catalog":{}}}"#,
            r#"{"remotes":{"catalog":"https://remote.example.com/entry.js"}}"#,
            r#"{"remotes":{"catalog":"https://user:pass@remote.example.com/mf.json"}}"#,
            r#"{"remotes":{"catalog":{"manifest":"https://user:pass@remote.example.com/mf.json"}}}"#,
        ] {
            let result = serde_json::from_str::<UnnormalizedModuleFederationConfig>(json)
                .and_then(|config| config.normalize().map_err(serde::de::Error::custom));
            assert!(result.is_err(), "{json}");
        }
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
    fn deserializes_shared_consumer_options() {
        let options = serde_json::from_str::<UnnormalizedModuleFederationSharedOptions>(
            r#"{"import":"./fallback.js","requiredVersion":"^2.0.0","singleton":true,"strictVersion":true}"#,
        )
        .unwrap();
        assert!(options.singleton.unwrap());
        let disabled = serde_json::from_str::<UnnormalizedModuleFederationConfig>(
            r#"{"shared":{"react":{"requiredVersion":false}}}"#,
        )
        .unwrap()
        .normalize()
        .unwrap();
        assert!(disabled.shared[0].required_version_disabled);
    }

    #[test]
    fn normalizes_enhanced_runtime_options() {
        let config = serde_json::from_str::<UnnormalizedModuleFederationConfig>(
            r#"{
                "name":"host",
                "implementation":"custom-runtime",
                "shareStrategy":"loaded-first",
                "runtimePlugins":["./first.js",["./second.js",{"marker":"loaded"}],["./third.js",[1,"two",null]],["./fourth.js",false]]
            }"#,
        )
        .unwrap()
        .normalize()
        .unwrap();
        assert!(matches!(
            config.share_strategy,
            crate::module_federation::ModuleFederationShareStrategy::LoadedFirst
        ));
        assert_eq!(config.implementation.as_deref(), Some("custom-runtime"));
        assert_eq!(config.runtime_plugins[0].request, "./first.js");
        assert_eq!(config.runtime_plugins[0].params, "{}");
        assert_eq!(config.runtime_plugins[1].params, r#"{"marker":"loaded"}"#);
        assert_eq!(config.runtime_plugins[2].params, r#"[1,"two",null]"#);
        assert_eq!(config.runtime_plugins[3].params, "false");
    }

    #[test]
    fn rejects_invalid_enhanced_runtime_options() {
        for json in [
            r#"{"runtimePlugins":[["./plugin.js",1,2]]}"#,
            r#"{"runtimePlugins":[[123,{}]]}"#,
            r#"{"runtimePlugins":[""]}"#,
            r#"{"shareStrategy":"auto"}"#,
            r#"{"implementation":"  "}"#,
        ] {
            let result = serde_json::from_str::<UnnormalizedModuleFederationConfig>(json)
                .and_then(|config| config.normalize().map_err(serde::de::Error::custom));
            assert!(result.is_err(), "{json}");
        }
    }

    #[test]
    fn validates_dts_producer_options() {
        for json in [
            r#"{"name":"remote","exposes":{"./Widget":"./src/Widget.tsx"},"dts":{"generateTypes":true}}"#,
            r#"{"name":"remote","exposes":{"./Widget":"./src/Widget.tsx"},"dts":{"generateTypes":{"tsConfigPath":"./configs/tsconfig.json","abortOnError":false,"extractThirdParty":true,"extractRemoteTypes":false}}}"#,
        ] {
            let config = serde_json::from_str::<UnnormalizedModuleFederationConfig>(json)
                .unwrap()
                .normalize()
                .unwrap();
            assert!(config.dts_enabled, "{json}");
        }
        let disabled =
            serde_json::from_str::<UnnormalizedModuleFederationConfig>(r#"{"dts":false}"#)
                .unwrap()
                .normalize()
                .unwrap();
        assert!(!disabled.dts_enabled);

        for json in [
            r#"{"dts":true}"#,
            r#"{"dts":{"generateTypes":true}}"#,
            r#"{"name":"remote","exposes":{},"dts":{"generateTypes":true}}"#,
            r#"{"name":"remote","exposes":{"./A":"./a.ts"},"dts":{"generateTypes":false}}"#,
            r#"{"name":"remote","exposes":{"./A":"./a.ts"},"dts":{"consumeTypes":true,"generateTypes":true}}"#,
            r#"{"name":"remote","exposes":{"./A":"./a.ts"},"dts":{"generateTypes":{"outputDir":"/tmp"}}}"#,
            r#"{"name":"remote","exposes":{"./A":"./a.ts"},"dts":{"generateTypes":{"tsConfigPath":"../secret.json"}}}"#,
            r#"{"name":"remote","exposes":{"./A":"./a.ts"},"dts":{"generateTypes":{"tsConfigPath":"/tmp/tsconfig.json"}}}"#,
            r#"{"name":"remote","exposes":{"./A":"./a.ts"},"dts":{"generateTypes":{"tsConfigPath":"C:\\secret.json"}}}"#,
        ] {
            let result = serde_json::from_str::<UnnormalizedModuleFederationConfig>(json)
                .and_then(|config| config.normalize().map_err(serde::de::Error::custom));
            assert!(result.is_err(), "{json}");
        }
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
