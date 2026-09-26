//! Framework-neutral configuration used by the compiler side of Module Federation.
//!
//! Frameworks normalize their public configuration before calling this crate. For example, this
//! JavaScript configuration:
//!
//! ```js
//! {
//!   name: "catalog",
//!   exposes: { "./Button": "./components/Button" },
//!   remotes: { checkout: "checkout@https://example.test/remoteEntry.js" }
//! }
//! ```
//!
//! becomes one [`ModuleFederationOptions`] containing an [`Expose`] named `"./Button"` and a
//! [`Remote`] whose request is `"checkout"`. Output filenames and server behavior stay with the
//! framework adapter.

use std::{collections::HashSet, sync::LazyLock};

use anyhow::{Result, bail};
use turbo_rcstr::{RcStr, rcstr};

/// A normalized exposed module. Import requests are evaluated in order and the final request is
/// returned by the container factory.
#[turbo_tasks::value(shared)]
#[derive(Clone, Debug, Hash)]
pub struct Expose {
    /// The request a host passes to `container.get`, for example `"./Button"` or `"."`.
    pub name: RcStr,
    /// Project imports evaluated in order. The namespace from the final import is exposed.
    pub imports: Vec<RcStr>,
}

/// One concrete browser global and script URL for a remote fallback.
#[turbo_tasks::value(shared)]
#[derive(Clone, Debug, Hash)]
pub struct RemoteExternal {
    /// Browser global installed by the remote script, for example `"checkout"`.
    pub name: RcStr,
    /// URL of the script which installs [`Self::name`].
    pub url: RcStr,
}

/// A normalized remote request and its ordered external fallbacks.
#[turbo_tasks::value(shared)]
#[derive(Clone, Debug, Hash)]
pub struct Remote {
    /// Import prefix used by application code, for example `"checkout"`.
    pub request: RcStr,
    /// Scripts tried in order until one installs a valid container.
    pub externals: Vec<RemoteExternal>,
    /// Name of the share scope passed to the selected container.
    pub share_scope: RcStr,
}

impl Remote {
    pub fn validate(&self) -> Result<()> {
        validate_module_request(&self.request, "remote request")?;
        validate_property_name(&self.share_scope, "remote share scope")?;
        if self.externals.is_empty() {
            bail!(
                "Module Federation remote {:?} must contain at least one external",
                self.request
            );
        }
        for external in &self.externals {
            validate_container_name(&external.name, "remote container name")?;
            validate_remote_url(&external.url)?;
        }
        Ok(())
    }
}

/// How a local shared provider advertises its version.
#[turbo_tasks::value(shared)]
#[derive(Clone, Debug, Default, Hash)]
pub enum SharedVersion {
    /// Infer the version from the imported namespace, falling back to `0`.
    #[default]
    Infer,
    /// Advertise an unversioned provider using Webpack's `0` sentinel.
    Unversioned,
    /// Advertise the provided semantic version.
    Exact(RcStr),
}

/// A normalized shared module.
///
/// `match_requests` lets a framework adapter associate its private aliases with a public shared
/// request without teaching Turbopack about framework-specific package names.
#[turbo_tasks::value(shared)]
#[derive(Clone, Debug, Hash)]
pub struct SharedModule {
    /// Public module request, for example `"react"`.
    pub request: RcStr,
    /// Extra framework aliases which should resolve to the same shared module.
    pub match_requests: Vec<RcStr>,
    /// Local provider or consumer fallback. `None` means the module must come from the share
    /// scope.
    pub import: Option<RcStr>,
    /// Key stored in the share scope. This is usually the same as [`Self::request`].
    pub share_key: RcStr,
    /// Share-scope name, normally `"default"`.
    pub share_scope: RcStr,
    /// Version advertised by a local provider.
    pub version: SharedVersion,
    /// Version range accepted by a consumer.
    pub required_version: Option<RcStr>,
    /// Reuse one selected provider for the lifetime of the share scope.
    pub singleton: bool,
    /// Fail instead of accepting a provider outside [`Self::required_version`].
    pub strict_version: bool,
    /// Whether the provider is available without loading another chunk.
    pub eager: bool,
}

impl SharedModule {
    pub fn validate(&self) -> Result<()> {
        validate_module_request(&self.request, "shared request")?;
        validate_module_request(&self.share_key, "share key")?;
        validate_property_name(&self.share_key, "share key")?;
        validate_property_name(&self.share_scope, "shared scope")?;
        if let Some(import) = &self.import {
            validate_module_request(import, "shared import")?;
        }
        for request in &self.match_requests {
            validate_module_request(request, "shared matching request")?;
        }
        Ok(())
    }
}

/// Framework-neutral, normalized Module Federation options.
///
/// Output filenames and public URL policy deliberately do not belong here. Adapters pass resolved
/// paths to their chunking and serving layers.
#[turbo_tasks::value(shared)]
#[derive(Clone, Debug, Hash)]
pub struct ModuleFederationOptions {
    /// Container name and browser global, for example `"catalog"`.
    pub name: RcStr,
    /// Default share-scope name used by this build.
    pub share_scope: RcStr,
    /// Modules published by this container.
    pub exposes: Vec<Expose>,
    /// Containers which imports in this build may consume.
    pub remotes: Vec<Remote>,
    /// Modules provided to or consumed from a share scope.
    pub shared: Vec<SharedModule>,
}

impl ModuleFederationOptions {
    pub fn new(name: RcStr) -> Self {
        Self {
            name,
            share_scope: rcstr!("default"),
            exposes: Vec::new(),
            remotes: Vec::new(),
            shared: Vec::new(),
        }
    }

    /// Defensively validates invariants required by generated JavaScript and browser globals.
    pub fn validate(&self) -> Result<()> {
        validate_container_name(&self.name, "container name")?;
        validate_property_name(&self.share_scope, "share scope")?;

        let mut expose_names = HashSet::new();
        for expose in &self.exposes {
            if !(expose.name == "." || expose.name.starts_with("./")) || expose.imports.is_empty() {
                bail!(
                    "Module Federation expose {:?} must be `.` or start with `./` and contain at \
                     least one import",
                    expose.name
                );
            }
            validate_module_request(&expose.name, "expose name")?;
            if !expose_names.insert(expose.name.as_str()) {
                bail!("duplicate Module Federation expose {:?}", expose.name);
            }
            for request in &expose.imports {
                validate_module_request(request, "expose import")?;
            }
        }

        let mut resolve_requests = HashSet::new();
        for remote in &self.remotes {
            remote.validate()?;
            if !resolve_requests.insert(remote.request.as_str()) {
                bail!(
                    "duplicate Module Federation resolved request {:?}",
                    remote.request
                );
            }
        }

        for shared in &self.shared {
            shared.validate()?;
            if !resolve_requests.insert(shared.request.as_str()) {
                bail!(
                    "duplicate Module Federation resolved request {:?}",
                    shared.request
                );
            }
            for request in &shared.match_requests {
                if !resolve_requests.insert(request.as_str()) {
                    bail!("duplicate Module Federation resolved request {request:?}");
                }
            }
        }

        Ok(())
    }
}

/// Selects which parts of Module Federation participate in a resolve context.
#[turbo_tasks::value(shared, task_input)]
#[derive(Clone, Copy, Debug, Hash)]
pub struct ModuleFederationResolveMode {
    /// Replace configured remote imports with remote-loading proxy modules.
    pub resolve_remotes: bool,
    /// Replace configured shared imports with share-scope consumer modules.
    pub consume_shared: bool,
}

impl ModuleFederationResolveMode {
    /// A normal host resolves remote imports but provides its own shared modules directly.
    pub const HOST: Self = Self {
        resolve_remotes: true,
        consume_shared: false,
    };
    /// A container resolves both nested remotes and shared imports in its exposed graph.
    pub const CONTAINER: Self = Self {
        resolve_remotes: true,
        consume_shared: true,
    };
}

static RESERVED_CONTAINER_NAMES: LazyLock<HashSet<String>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../js/src/reserved-container-names.json"))
        .expect("reserved container names must be a JSON string array")
});

fn validate_container_name(value: &str, kind: &str) -> Result<()> {
    validate_identifier(value, kind)?;
    if RESERVED_CONTAINER_NAMES.contains(value) {
        bail!("Module Federation {kind} {value:?} is a reserved browser or bundler global");
    }
    Ok(())
}

fn validate_identifier(value: &str, kind: &str) -> Result<()> {
    let mut chars = value.chars();
    let valid_start = chars.next().is_some_and(|character| {
        character == '_' || character == '$' || character.is_ascii_alphabetic()
    });
    if !valid_start
        || !chars.all(|character| {
            character == '_' || character == '$' || character.is_ascii_alphanumeric()
        })
    {
        bail!("Module Federation {kind} {value:?} must be a JavaScript identifier");
    }
    validate_property_name(value, kind)
}

fn validate_property_name(value: &str, kind: &str) -> Result<()> {
    if value.is_empty()
        || value.chars().any(|character| character.is_control())
        || matches!(value, "__proto__" | "prototype" | "constructor")
    {
        bail!("invalid Module Federation {kind} {value:?}");
    }
    Ok(())
}

fn validate_module_request(value: &str, kind: &str) -> Result<()> {
    let has_windows_drive_prefix = value.as_bytes().get(1) == Some(&b':')
        && value
            .as_bytes()
            .first()
            .is_some_and(u8::is_ascii_alphabetic);
    if value.is_empty()
        || value.trim() != value
        || value.starts_with('/')
        || has_windows_drive_prefix
        || value.contains('\\')
        || value.contains('?')
        || value.contains('#')
        || value == "@vercel/turbopack-module-federation"
        || value.starts_with("@vercel/turbopack-module-federation/")
        || value.chars().any(|character| character.is_control())
        || value.split('/').enumerate().any(|(index, segment)| {
            segment.is_empty() || segment == ".." || (segment == "." && index != 0)
        })
    {
        bail!("invalid Module Federation {kind} {value:?}");
    }
    Ok(())
}

fn validate_remote_url(value: &str) -> Result<()> {
    let lower = value.to_ascii_lowercase();
    let has_scheme = value.find(':').is_some_and(|index| {
        value[..index].chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '+' | '-' | '.')
        })
    });
    if value.is_empty()
        || value.trim() != value
        || value.contains('\\')
        || value
            .chars()
            .any(|character| character.is_control() || character.is_whitespace())
        || (has_scheme && !lower.starts_with("http:") && !lower.starts_with("https:"))
    {
        bail!("invalid Module Federation remote URL {value:?}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use turbo_rcstr::rcstr;

    use super::{Expose, ModuleFederationOptions, Remote, RemoteExternal};

    #[test]
    fn validates_normalized_options() {
        let mut options = ModuleFederationOptions::new(rcstr!("catalog"));
        options.exposes.push(Expose {
            name: rcstr!("./Button"),
            imports: vec![rcstr!("./components/Button")],
        });
        options.remotes.push(Remote {
            request: rcstr!("checkout"),
            externals: vec![RemoteExternal {
                name: rcstr!("checkout"),
                url: rcstr!("https://example.test/remoteEntry.js"),
            }],
            share_scope: rcstr!("default"),
        });

        options.validate().unwrap();
    }

    #[test]
    fn rejects_unsafe_values() {
        let mut options = ModuleFederationOptions::new(rcstr!("__proto__"));
        assert!(options.validate().is_err());

        options.name = rcstr!("catalog");
        options.exposes.push(Expose {
            name: rcstr!("./Button"),
            imports: vec![rcstr!("../outside")],
        });
        assert!(options.validate().is_err());

        options.exposes.clear();
        options.name = rcstr!("TURBOPACK");
        assert!(options.validate().is_err());
    }
}
