//! Rewrites configured imports to small virtual Module Federation modules.
//!
//! For a remote named `catalog`, application code remains ordinary JavaScript:
//!
//! ```js
//! const { Button } = await import("catalog/Button")
//! ```
//!
//! This module maps that request to a virtual proxy. The proxy loads the configured remote entry
//! and asks its container for `"./Button"`. Shared requests are mapped in the same way, but their
//! proxy reads from a share scope instead of loading a container script.

use anyhow::Result;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack_core::{
    asset::AssetContent,
    ident::AssetIdent,
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

use crate::{
    embed::module_federation_runtime_import_map,
    options::{ModuleFederationOptions, ModuleFederationResolveMode, Remote, SharedModule},
    source::{
        INTERNAL_DIRECTORY, INTERNAL_IMPORT_PREFIX, generate_internal_import_source,
        remote_proxy_source, shared_consumer_source,
    },
};

#[turbo_tasks::value(shared)]
struct RemoteImportMappingReplacement {
    project_path: FileSystemPath,
    remote: Remote,
    base_import_map: Option<ResolvedVc<ImportMap>>,
}

#[turbo_tasks::value_impl]
impl ImportMappingReplacement for RemoteImportMappingReplacement {
    #[turbo_tasks::function]
    async fn replace(self: Vc<Self>, _capture: Vc<Pattern>) -> Result<Vc<ReplacedImportMapping>> {
        Ok(ReplacedImportMapping::Dynamic(ResolvedVc::upcast(self.to_resolved().await?)).cell())
    }

    #[turbo_tasks::function]
    async fn result(
        self: Vc<Self>,
        lookup_path: FileSystemPath,
        request: Vc<Request>,
    ) -> Result<Vc<ImportMapResult>> {
        let this = self.await?;
        if is_internal_lookup_path(&this.project_path, &lookup_path) {
            return delegate_to_base(this.base_import_map, lookup_path, request).await;
        }
        let Request::Module {
            module: Pattern::Constant(module),
            path: Pattern::Constant(path),
            query,
            fragment,
        } = &*request.await?
        else {
            return Ok(ImportMapResult::NoEntry.cell());
        };
        if module != &this.remote.request || !query.is_empty() || !fragment.is_empty() {
            return Ok(ImportMapResult::NoEntry.cell());
        }

        // `path` includes its leading slash. An empty path is the root expose `.`;
        // `/Button` becomes the conventional expose name `./Button`.
        let expose = format!(".{path}");
        let source = remote_proxy_source(
            this.project_path.clone(),
            *this.remote.clone().resolved_cell(),
            expose.into(),
        )
        .to_resolved()
        .await?;
        Ok(ImportMapResult::Result(ResolveResult::source(source).resolved_cell()).cell())
    }
}

#[turbo_tasks::value(shared)]
struct SharedImportMappingReplacement {
    project_path: FileSystemPath,
    shared: SharedModule,
    base_import_map: Option<ResolvedVc<ImportMap>>,
}

#[turbo_tasks::value_impl]
impl ImportMappingReplacement for SharedImportMappingReplacement {
    #[turbo_tasks::function]
    async fn replace(self: Vc<Self>, _capture: Vc<Pattern>) -> Result<Vc<ReplacedImportMapping>> {
        Ok(ReplacedImportMapping::Dynamic(ResolvedVc::upcast(self.to_resolved().await?)).cell())
    }

    #[turbo_tasks::function]
    async fn result(
        self: Vc<Self>,
        lookup_path: FileSystemPath,
        request: Vc<Request>,
    ) -> Result<Vc<ImportMapResult>> {
        let this = self.await?;
        if is_internal_lookup_path(&this.project_path, &lookup_path) {
            return delegate_to_base(this.base_import_map, lookup_path, request).await;
        }
        let Request::Module {
            module: Pattern::Constant(module),
            path: Pattern::Constant(path),
            query,
            fragment,
        } = &*request.await?
        else {
            return Ok(ImportMapResult::NoEntry.cell());
        };
        let full_request = format!("{module}{path}");
        if !matches_shared_request(&this.shared, &full_request)
            || !query.is_empty()
            || !fragment.is_empty()
        {
            return Ok(ImportMapResult::NoEntry.cell());
        }

        let source = shared_consumer_source(
            this.project_path.clone(),
            *this.shared.clone().resolved_cell(),
            full_request.into(),
        )
        .to_resolved()
        .await?;
        Ok(ImportMapResult::Result(ResolveResult::source(source).resolved_cell()).cell())
    }
}

#[turbo_tasks::value(shared)]
struct InternalImportMappingReplacement {
    project_path: FileSystemPath,
}

#[turbo_tasks::value_impl]
impl ImportMappingReplacement for InternalImportMappingReplacement {
    #[turbo_tasks::function]
    async fn replace(self: Vc<Self>, _capture: Vc<Pattern>) -> Result<Vc<ReplacedImportMapping>> {
        Ok(ReplacedImportMapping::Dynamic(ResolvedVc::upcast(self.to_resolved().await?)).cell())
    }

    #[turbo_tasks::function]
    async fn result(
        self: Vc<Self>,
        _lookup_path: FileSystemPath,
        request: Vc<Request>,
    ) -> Result<Vc<ImportMapResult>> {
        let this = self.await?;
        let Request::Module {
            module: Pattern::Constant(module),
            path: Pattern::Constant(path),
            query,
            fragment,
        } = &*request.await?
        else {
            return Ok(ImportMapResult::NoEntry.cell());
        };
        let request = format!("{module}{path}");
        let Some(encoded_request) = request.strip_prefix(INTERNAL_IMPORT_PREFIX) else {
            return Ok(ImportMapResult::NoEntry.cell());
        };
        if !query.is_empty() || !fragment.is_empty() {
            return Ok(ImportMapResult::NoEntry.cell());
        }
        // Base64 makes an arbitrary module request safe to carry inside our private import
        // namespace. It is an encoding, not a security boundary.
        let decoded_request = String::from_utf8(URL_SAFE_NO_PAD.decode(encoded_request)?)?;
        let source = generate_internal_import_source(&decoded_request)?;
        Ok(virtual_result(
            this.project_path.clone(),
            source.into(),
            format!("module federation internal import {decoded_request}").into(),
        ))
    }
}

/// Builds the import map for configured remotes and shared consumers.
///
/// `base_import_map` must be the adapter's import map before Module Federation aliases are added.
/// Generated provider/fallback modules delegate to it so framework aliases are preserved without
/// recursively consuming the shared module they provide.
#[turbo_tasks::function]
pub async fn module_federation_import_map(
    project_path: FileSystemPath,
    options: ResolvedVc<ModuleFederationOptions>,
    mode: ModuleFederationResolveMode,
    base_import_map: Option<ResolvedVc<ImportMap>>,
) -> Result<Vc<ImportMap>> {
    let options = options.await?;
    options.validate()?;
    // Every generated proxy imports this crate's embedded browser helpers, so install that map
    // before adding user-configured remote and shared aliases.
    let mut import_map = module_federation_runtime_import_map().owned().await?;

    let internal_mapping = ImportMapping::Dynamic(ResolvedVc::upcast(
        InternalImportMappingReplacement {
            project_path: project_path.clone(),
        }
        .resolved_cell(),
    ))
    .resolved_cell();
    import_map.insert_wildcard_alias(rcstr!(INTERNAL_IMPORT_PREFIX), internal_mapping);

    if mode.resolve_remotes {
        for remote in &options.remotes {
            let mapping = ImportMapping::Dynamic(ResolvedVc::upcast(
                RemoteImportMappingReplacement {
                    project_path: project_path.clone(),
                    remote: remote.clone(),
                    base_import_map,
                }
                .resolved_cell(),
            ))
            .resolved_cell();
            // Register both forms:
            //   import("catalog")        -> expose "."
            //   import("catalog/Button") -> expose "./Button"
            import_map.insert_exact_alias(remote.request.clone(), mapping);
            import_map.insert_wildcard_alias(format!("{}/", remote.request), mapping);
        }
    }

    if mode.consume_shared {
        for shared in &options.shared {
            let mapping = ImportMapping::Dynamic(ResolvedVc::upcast(
                SharedImportMappingReplacement {
                    project_path: project_path.clone(),
                    shared: shared.clone(),
                    base_import_map,
                }
                .resolved_cell(),
            ))
            .resolved_cell();
            import_map.insert_exact_alias(shared.request.clone(), mapping);
            for request in &shared.match_requests {
                import_map.insert_exact_alias(request.clone(), mapping);
            }
        }
    }

    Ok(import_map.cell())
}

fn matches_shared_request(shared: &SharedModule, request: &str) -> bool {
    shared.request == request
        || shared
            .match_requests
            .iter()
            .any(|candidate| candidate == request)
}

fn is_internal_lookup_path(project_path: &FileSystemPath, lookup_path: &FileSystemPath) -> bool {
    project_path.get_path_to(lookup_path).is_some_and(|path| {
        path == INTERNAL_DIRECTORY
            || path
                .strip_prefix(INTERNAL_DIRECTORY)
                .is_some_and(|path| path.starts_with('/'))
    })
}

async fn delegate_to_base(
    base_import_map: Option<ResolvedVc<ImportMap>>,
    lookup_path: FileSystemPath,
    request: Vc<Request>,
) -> Result<Vc<ImportMapResult>> {
    // Provider and fallback modules must resolve their real local import. Delegating to the map
    // from before Module Federation was installed avoids resolving the proxy back into itself.
    let Some(base_import_map) = base_import_map else {
        return Ok(ImportMapResult::NoEntry.cell());
    };
    Ok(base_import_map
        .await?
        .lookup(lookup_path, request)
        .await?
        .cell())
}

#[turbo_tasks::function]
async fn virtual_result(
    project_path: FileSystemPath,
    source: RcStr,
    modifier: RcStr,
) -> Result<Vc<ImportMapResult>> {
    // Keeping this as a memoized Turbo Tasks function is important. The same shared request may
    // appear from many parents, and they must all receive one canonical source identity.
    let content = AssetContent::file(FileContent::Content(File::from(source)).cell());
    let source = VirtualSource::new_with_ident(
        AssetIdent::from_path(project_path.join(INTERNAL_DIRECTORY)?.join("virtual.mjs")?)
            .with_modifier(modifier)
            .into_vc(),
        content,
    )
    .to_resolved()
    .await?;
    Ok(
        ImportMapResult::Result(ResolveResult::source(ResolvedVc::upcast(source)).resolved_cell())
            .cell(),
    )
}

#[cfg(test)]
mod tests {
    use turbo_rcstr::rcstr;

    use super::matches_shared_request;
    use crate::options::SharedModule;

    #[test]
    fn framework_aliases_are_explicit_matching_requests() {
        let shared = SharedModule {
            request: rcstr!("react"),
            match_requests: vec![rcstr!("framework/private/react")],
            import: Some(rcstr!("react")),
            share_key: rcstr!("react"),
            share_scope: rcstr!("default"),
            version: Default::default(),
            required_version: None,
            singleton: true,
            strict_version: false,
            eager: true,
        };

        assert!(matches_shared_request(&shared, "react"));
        assert!(matches_shared_request(&shared, "framework/private/react"));
        assert!(!matches_shared_request(&shared, "framework/other/react"));
    }
}
