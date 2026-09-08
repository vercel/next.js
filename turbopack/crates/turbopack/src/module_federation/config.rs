use std::collections::BTreeMap;

use anyhow::{Result, bail};
use bincode::{Decode, Encode};
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, OperationValue, trace::TraceRawVcs};

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
    TraceRawVcs,
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
    TraceRawVcs,
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
    TraceRawVcs,
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
    pub filename: Option<RcStr>,
    pub remotes: Option<UnnormalizedModuleFederationRemotes>,
    pub exposes: Option<UnnormalizedModuleFederationExposes>,
    pub shared: Option<UnnormalizedModuleFederationSharedEntries>,
    pub share_scope: Option<RcStr>,
    pub remote_type: Option<ModuleFederationRemoteType>,
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
        let share_scope = self.share_scope.unwrap_or_else(|| "default".into());
        let mut config = ModuleFederationConfig {
            name: self.name,
            filename: self.filename,
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

#[cfg(test)]
mod tests {
    use crate::module_federation::{UnnormalizedModuleFederationConfig, validate_output_filename};

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
