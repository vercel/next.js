use anyhow::{Context, Result};
use turbo_rcstr::{RcStr, rcstr};
use turbopack_module_federation::{
    Expose, ModuleFederationOptions, Remote, RemoteExternal, SharedModule, SharedVersion,
};

use crate::next_config::{
    ImportOrFalse, ImportValue, ModuleFederationConfig, ModuleFederationExposeValue,
    ModuleFederationRemoteValue, ModuleFederationSharedValue, VersionOrFalse,
};

const DEFAULT_REMOTE_ENTRY_PATH: &str = "/_next/static/chunks/remoteEntry.js";

pub fn module_federation_options(
    config: &ModuleFederationConfig,
) -> Result<ModuleFederationOptions> {
    let share_scope = config.share_scope_name();
    let exposes = config
        .exposes
        .iter()
        .flat_map(|exposes| exposes.iter())
        .map(|(name, value)| Expose {
            name: name.clone(),
            imports: expose_imports(value),
        })
        .collect();
    let remotes = config
        .remotes
        .iter()
        .flat_map(|remotes| remotes.iter())
        .map(|(request, value)| remote(request, value, &share_scope))
        .collect();
    let shared = config
        .shared
        .iter()
        .flat_map(|shared| shared.iter())
        .filter_map(|(request, value)| shared_module(request, value, &share_scope))
        .collect();

    let options = ModuleFederationOptions {
        name: config.name.clone(),
        share_scope,
        exposes,
        remotes,
        shared,
    };
    options
        .validate()
        .context("invalid Turbopack Module Federation configuration")?;
    Ok(options)
}

fn expose_imports(value: &ModuleFederationExposeValue) -> Vec<RcStr> {
    match value {
        ModuleFederationExposeValue::Str(request) => vec![request.clone()],
        ModuleFederationExposeValue::Obj(value) => {
            value.import.as_ref().map(import_value).unwrap_or_default()
        }
    }
}

fn import_value(value: &ImportValue) -> Vec<RcStr> {
    match value {
        ImportValue::Str(request) => vec![request.clone()],
        ImportValue::Array(requests) => requests.clone(),
    }
}

fn remote(
    request: &RcStr,
    value: &ModuleFederationRemoteValue,
    default_share_scope: &RcStr,
) -> Remote {
    let (name, locations, use_default_entry, share_scope) = match value {
        ModuleFederationRemoteValue::Str(origin) => (
            request.clone(),
            vec![origin.clone()],
            true,
            default_share_scope.clone(),
        ),
        ModuleFederationRemoteValue::Array(origins) => (
            request.clone(),
            origins.clone(),
            true,
            default_share_scope.clone(),
        ),
        ModuleFederationRemoteValue::Obj(value) => {
            let (locations, use_default_entry) = if let Some(entry) = &value.entry {
                (import_value(entry), false)
            } else {
                (
                    value.origin.as_ref().map(import_value).unwrap_or_default(),
                    true,
                )
            };
            (
                value.name.clone().unwrap_or_else(|| request.clone()),
                locations,
                use_default_entry,
                value
                    .share_scope
                    .clone()
                    .unwrap_or_else(|| default_share_scope.clone()),
            )
        }
    };

    Remote {
        request: request.clone(),
        externals: locations
            .into_iter()
            .map(|location| RemoteExternal {
                name: name.clone(),
                url: if use_default_entry {
                    default_remote_entry(&location)
                } else {
                    location
                },
            })
            .collect(),
        share_scope,
    }
}

fn default_remote_entry(origin: &str) -> RcStr {
    format!(
        "{}{DEFAULT_REMOTE_ENTRY_PATH}",
        origin.trim_end_matches('/')
    )
    .into()
}

fn shared_module(
    request: &RcStr,
    value: &ModuleFederationSharedValue,
    default_share_scope: &RcStr,
) -> Option<SharedModule> {
    if matches!(value, ModuleFederationSharedValue::Bool(false)) {
        return None;
    }

    let mut shared = SharedModule {
        request: request.clone(),
        match_requests: next_shared_match_requests(request),
        import: Some(request.clone()),
        share_key: request.clone(),
        share_scope: default_share_scope.clone(),
        version: SharedVersion::Infer,
        required_version: None,
        singleton: false,
        strict_version: false,
        eager: true,
    };

    match value {
        ModuleFederationSharedValue::Bool(_) => {}
        ModuleFederationSharedValue::Str(required_version) => {
            shared.required_version = Some(required_version.clone());
        }
        ModuleFederationSharedValue::Obj(value) => {
            shared.import = match &value.import {
                Some(ImportOrFalse::Bool(false)) => None,
                Some(ImportOrFalse::Str(import)) => Some(import.clone()),
                Some(ImportOrFalse::Bool(true)) | None => shared.import,
            };
            if let Some(share_key) = &value.share_key {
                shared.share_key = share_key.clone();
            }
            if let Some(share_scope) = &value.share_scope {
                shared.share_scope = share_scope.clone();
            }
            shared.version = match &value.version {
                Some(VersionOrFalse::Str(version)) => SharedVersion::Exact(version.clone()),
                Some(VersionOrFalse::Bool(false)) => SharedVersion::Unversioned,
                Some(VersionOrFalse::Bool(true)) | None => SharedVersion::Infer,
            };
            shared.required_version = match &value.required_version {
                Some(VersionOrFalse::Str(version)) => Some(version.clone()),
                Some(VersionOrFalse::Bool(_)) | None => None,
            };
            shared.singleton = value.singleton.unwrap_or(false);
            shared.strict_version = value.strict_version.unwrap_or(false);
            shared.eager = value.eager.unwrap_or(true);
        }
    }

    Some(shared)
}

/// Next aliases public React requests to private vendored packages. Match both stable and
/// experimental aliases so generated framework code participates in the configured share.
fn next_shared_match_requests(request: &str) -> Vec<RcStr> {
    match request {
        "react" => vec![
            rcstr!("next/dist/compiled/react"),
            rcstr!("next/dist/compiled/react-experimental"),
        ],
        "react-dom" => vec![
            rcstr!("next/dist/compiled/react-dom"),
            rcstr!("next/dist/compiled/react-dom-experimental"),
        ],
        _ => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use turbo_rcstr::rcstr;
    use turbo_tasks::{FxIndexMap, fxindexmap};
    use turbopack_module_federation::SharedVersion;

    use super::module_federation_options;
    use crate::next_config::{
        ImportValue, ModuleFederationConfig, ModuleFederationRemoteObject,
        ModuleFederationRemoteValue, ModuleFederationSharedObject, ModuleFederationSharedValue,
        VersionOrFalse,
    };

    #[test]
    fn normalizes_next_config_and_react_aliases() {
        let config = ModuleFederationConfig {
            name: rcstr!("catalog"),
            remotes: Some(fxindexmap! {
                rcstr!("checkout") => ModuleFederationRemoteValue::Obj(ModuleFederationRemoteObject {
                    name: Some(rcstr!("checkout_v1")),
                    origin: Some(ImportValue::Array(vec![
                        rcstr!("https://a.test"),
                        rcstr!("https://b.test/store/"),
                    ])),
                    share_scope: Some(rcstr!("commerce")),
                    ..Default::default()
                }),
                rcstr!("legacy") => ModuleFederationRemoteValue::Obj(ModuleFederationRemoteObject {
                    name: Some(rcstr!("legacy_container")),
                    entry: Some(ImportValue::Str(rcstr!("https://cdn.test/remoteEntry.js"))),
                    ..Default::default()
                }),
                rcstr!("account") => ModuleFederationRemoteValue::Str(rcstr!("https://account.test")),
            }),
            shared: Some(fxindexmap! {
                rcstr!("react") => ModuleFederationSharedValue::Obj(ModuleFederationSharedObject {
                    version: Some(VersionOrFalse::Bool(false)),
                    singleton: Some(true),
                    ..Default::default()
                }),
                rcstr!("disabled") => ModuleFederationSharedValue::Bool(false),
            }),
            ..Default::default()
        };

        let options = module_federation_options(&config).unwrap();
        assert_eq!(options.remotes[0].externals[0].name, "checkout_v1");
        assert_eq!(options.remotes[0].externals[1].name, "checkout_v1");
        assert_eq!(
            options.remotes[0].externals[0].url,
            "https://a.test/_next/static/chunks/remoteEntry.js"
        );
        assert_eq!(
            options.remotes[0].externals[1].url,
            "https://b.test/store/_next/static/chunks/remoteEntry.js"
        );
        assert_eq!(options.remotes[0].share_scope, "commerce");
        assert_eq!(
            options.remotes[1].externals[0].url,
            "https://cdn.test/remoteEntry.js"
        );
        assert_eq!(
            options.remotes[2].externals[0].url,
            "https://account.test/_next/static/chunks/remoteEntry.js"
        );
        assert_eq!(options.shared.len(), 1);
        assert!(options.shared[0].singleton);
        assert!(matches!(
            options.shared[0].version,
            SharedVersion::Unversioned
        ));
        assert_eq!(
            options.shared[0].match_requests,
            vec![
                rcstr!("next/dist/compiled/react"),
                rcstr!("next/dist/compiled/react-experimental"),
            ]
        );
    }

    #[test]
    fn rejects_incomplete_expose_objects() {
        let mut exposes = FxIndexMap::default();
        exposes.insert(
            rcstr!("./Button"),
            crate::next_config::ModuleFederationExposeValue::Obj(Default::default()),
        );
        let config = ModuleFederationConfig {
            name: rcstr!("catalog"),
            exposes: Some(exposes),
            ..Default::default()
        };

        assert!(module_federation_options(&config).is_err());
    }
}
