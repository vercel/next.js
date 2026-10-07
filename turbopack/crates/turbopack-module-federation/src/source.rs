//! Generates the virtual JavaScript modules used by Module Federation.
//!
//! No temporary source files are written. Turbopack receives in-memory [`VirtualSource`] values
//! for three jobs:
//!
//! ```text
//! remote import  -> load remoteEntry.js and export one exposed module
//! shared import  -> select a provider from the share scope
//! remote entry   -> publish { get, init } as a browser container
//! ```
//!
//! A framework adapter compiles the returned sources and decides where the final assets are
//! written and served.

use anyhow::Result;
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use indoc::formatdoc;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbo_tasks_hash::hash_xxh3_hash64;
use turbopack_core::{
    asset::AssetContent, ident::AssetIdent, source::Source, virtual_source::VirtualSource,
};
use turbopack_ecmascript::runtime_functions::TURBOPACK_EXPORT_NAMESPACE;

use crate::options::{ModuleFederationOptions, Remote, SharedModule, SharedVersion};

pub(crate) const INTERNAL_DIRECTORY: &str = "__turbopack_module_federation_internal__";
pub(crate) const INTERNAL_IMPORT_PREFIX: &str =
    "@vercel/turbopack-module-federation/internal-import/";
// The helper annotation tells Turbopack that these generated imports feed a dynamic namespace.
// Without it, static export analysis could incorrectly report that a remote has no exports.
const TURBOPACK_HELPER_IMPORT: &str = r#"with { "__turbopack-helper__": "true" }"#;

#[turbo_tasks::value(transparent)]
pub struct OptionModuleFederationSource(pub Option<ResolvedVc<Box<dyn Source>>>);

pub(crate) fn namespace_proxy_import(bindings: &str, request: &str) -> String {
    format!("import {bindings} from {request} {TURBOPACK_HELPER_IMPORT};")
}

pub(crate) fn request_from_internal_directory(request: &str) -> String {
    // Proxies live one directory below the project root. Rebase `./components/Button` so it still
    // means the same thing from `__turbopack_module_federation_internal__/virtual.mjs`.
    request.strip_prefix("./").map_or_else(
        || request.to_owned(),
        |project_relative| format!("../{project_relative}"),
    )
}

// Used by the import resolver introduced in the next stack layer.
#[allow(dead_code)]
pub(crate) fn generate_internal_import_source(request: &str) -> Result<String> {
    // This source is the escape hatch used by a provider to import the real local module without
    // the shared-module import map redirecting it back to a consumer proxy.
    let request = request_from_internal_directory(request);
    let request_json = serde_json::to_string(&request)?;
    let namespace_import = namespace_proxy_import("* as importedNamespace", &request_json);
    Ok(formatdoc! {
        r#"
        {namespace_import}
        {TURBOPACK_EXPORT_NAMESPACE}(importedNamespace);
        "#,
    })
}

pub(crate) fn generate_remote_module_source(
    externals: &[(RcStr, RcStr)],
    expose: &str,
    share_scope: &str,
) -> Result<String> {
    // The generated proxy is intentionally tiny. All script loading, fallback, and container
    // initialization behavior stays in the embedded browser runtime.
    let parsed_remotes = externals
        .iter()
        .map(|(name, url)| {
            Ok(format!(
                "{{ name: {}, url: {}, shareScope: {} }}",
                serde_json::to_string(name)?,
                serde_json::to_string(url)?,
                serde_json::to_string(share_scope)?,
            ))
        })
        .collect::<Result<Vec<_>>>()?
        .join(", ");
    let expose = serde_json::to_string(expose)?;
    let runtime_import = namespace_proxy_import(
        "{ loadRemoteModuleFromFallbacks }",
        r#""@vercel/turbopack-module-federation/remote-loader""#,
    );
    Ok(formatdoc! {
        r#"
        {runtime_import}

        const remoteModule = await loadRemoteModuleFromFallbacks([{parsed_remotes}], {expose});
        {TURBOPACK_EXPORT_NAMESPACE}(remoteModule);
        "#,
    })
}

pub(crate) fn generate_shared_consumer_source(shared: &SharedModule) -> Result<String> {
    let share_scope = serde_json::to_string(&shared.share_scope)?;
    let share_key = serde_json::to_string(&shared.share_key)?;
    let required_version = serde_json::to_string(&shared.required_version)?;
    // A fallback is a real local module used only when the requested share is unavailable.
    let fallback = if let Some(import_request) = &shared.import {
        let import_request = request_from_internal_directory(import_request);
        let import_request = serde_json::to_string(&import_request)?;
        format!(
            "{}\nconst fallbackFactory = () => fallback;",
            namespace_proxy_import("* as fallback", &import_request)
        )
    } else {
        "const fallbackFactory = undefined;".to_owned()
    };
    let singleton = shared.singleton;
    let strict_version = shared.strict_version;
    let eager = shared.eager;
    let runtime_import = namespace_proxy_import(
        "{ consumeSharedAsync }",
        r#""@vercel/turbopack-module-federation/consume-shared""#,
    );
    Ok(formatdoc! {
        r#"
        {runtime_import}
        {fallback}

        const sharedModule = await consumeSharedAsync({{
          shareScope: {share_scope},
          shareKey: {share_key},
          requiredVersion: {required_version},
          singleton: {singleton},
          strictVersion: {strict_version},
          eager: {eager},
          fallback: fallbackFactory,
        }});
        {TURBOPACK_EXPORT_NAMESPACE}(sharedModule);
        "#,
    })
}

/// Creates the virtual namespace proxy used for one remote import.
#[turbo_tasks::function]
pub async fn remote_proxy_source(
    project_path: FileSystemPath,
    remote: ResolvedVc<Remote>,
    expose: RcStr,
) -> Result<Vc<Box<dyn Source>>> {
    let remote = remote.await?;
    remote.validate()?;
    if !expose.starts_with('.') {
        anyhow::bail!("Module Federation remote expose {expose:?} must start with `.`");
    }
    let externals = remote
        .externals
        .iter()
        .map(|external| (external.name.clone(), external.url.clone()))
        .collect::<Vec<_>>();
    let source = generate_remote_module_source(&externals, &expose, &remote.share_scope)?;
    Ok(Vc::upcast(virtual_source(
        project_path.join(INTERNAL_DIRECTORY)?.join("virtual.mjs")?,
        source.into(),
        format!("module federation remote {}{expose}", remote.request).into(),
    )))
}

/// Creates the virtual namespace proxy used to consume one configured shared module.
#[turbo_tasks::function]
pub async fn shared_consumer_source(
    project_path: FileSystemPath,
    shared: ResolvedVc<SharedModule>,
    request: RcStr,
) -> Result<Vc<Box<dyn Source>>> {
    let shared = shared.await?;
    shared.validate()?;
    let source = generate_shared_consumer_source(&shared)?;
    Ok(Vc::upcast(virtual_source(
        project_path.join(INTERNAL_DIRECTORY)?.join("virtual.mjs")?,
        source.into(),
        format!("module federation shared {request}").into(),
    )))
}

fn generate_shared_providers_source(
    options: &ModuleFederationOptions,
    bypass_shared_resolver: bool,
    mark_singletons_loaded: bool,
    scope_expression: Option<&str>,
) -> Result<Option<String>> {
    let from = serde_json::to_string(&options.name)?;
    let mut imports = Vec::new();
    let mut provides = Vec::new();
    let mut singleton_consumes = Vec::new();

    for (index, shared) in options.shared.iter().enumerate() {
        let Some(import_request) = &shared.import else {
            continue;
        };
        // A container is compiled with shared consumption enabled. Encode provider imports into
        // the private namespace so they reach the real local module instead of consuming itself.
        let import_request = if bypass_shared_resolver {
            format!(
                "{INTERNAL_IMPORT_PREFIX}{}",
                URL_SAFE_NO_PAD.encode(import_request.as_bytes())
            )
        } else {
            import_request.to_string()
        };
        let import_request = serde_json::to_string(&import_request)?;
        let variable = format!("shared_{index}");
        imports.push(format!("import * as {variable} from {import_request};"));

        let share_scope = serde_json::to_string(&shared.share_scope)?;
        let share_key = serde_json::to_string(&shared.share_key)?;
        let version = match &shared.version {
            SharedVersion::Infer => {
                format!("(typeof {variable}.version === \"string\" ? {variable}.version : \"0\")")
            }
            SharedVersion::Unversioned => "\"0\"".to_owned(),
            SharedVersion::Exact(version) => serde_json::to_string(version)?,
        };
        let eager = shared.eager;
        let scope = scope_expression
            .map(|scope| format!("scope: {scope}, "))
            .unwrap_or_default();
        provides.push(format!(
            "provideShared({{ {scope}shareScope: {share_scope}, shareKey: {share_key}, version: \
             {version}, factory: () => {variable}, eager: {eager}, from: {from} }});"
        ));

        // Host providers run inside the host graph. Consuming a singleton immediately marks that
        // provider as selected before a remote can replace it during scope merging.
        if mark_singletons_loaded && shared.singleton {
            let required_version = serde_json::to_string(&shared.required_version)?;
            singleton_consumes.push(format!(
                "consumeShared({{ shareScope: {share_scope}, shareKey: {share_key}, \
                 requiredVersion: {required_version}, singleton: true, eager: true, fallback: () \
                 => {variable} }});"
            ));
        }
    }

    if imports.is_empty() {
        return Ok(None);
    }

    let consume_import = if singleton_consumes.is_empty() {
        String::new()
    } else {
        "\nimport { consumeShared } from \"@vercel/turbopack-module-federation/consume-shared\";"
            .to_owned()
    };
    let provide_import =
        "import { provideShared } from \"@vercel/turbopack-module-federation/provide-shared\";";
    Ok(Some(
        [
            format!("{provide_import}{consume_import}"),
            imports.join("\n"),
            provides.join("\n"),
            singleton_consumes.join("\n"),
        ]
        .join("\n"),
    ))
}

/// Creates the eager shared-provider entry injected into a host browser graph.
///
/// For example, a configured `react` provider becomes conceptually:
///
/// ```js
/// import * as react from "react"
/// provideShared({ shareKey: "react", factory: () => react })
/// ```
#[turbo_tasks::function]
pub async fn host_provider_source(
    project_path: FileSystemPath,
    options: ResolvedVc<ModuleFederationOptions>,
) -> Result<Vc<OptionModuleFederationSource>> {
    let options = options.await?;
    options.validate()?;
    let Some(source) = generate_shared_providers_source(&options, false, true, None)? else {
        return Ok(OptionModuleFederationSource(None).cell());
    };
    let source = virtual_source(
        project_path.join("__turbopack_module_federation_host__.mjs")?,
        source.into(),
        rcstr!("module federation host providers"),
    )
    .to_resolved()
    .await?;
    Ok(OptionModuleFederationSource(Some(ResolvedVc::upcast(source))).cell())
}

/// Creates a browser container entry source. The adapter compiles this source with its chosen
/// asset and chunking contexts and owns the fixed output filename.
///
/// The generated source exports Webpack's familiar container shape:
///
/// ```js
/// export const get = container.get
/// export const init = container.init
/// ```
#[turbo_tasks::function]
pub async fn container_entry_source(
    project_path: FileSystemPath,
    options: ResolvedVc<ModuleFederationOptions>,
) -> Result<Vc<Box<dyn Source>>> {
    let options = options.await?;
    options.validate()?;
    let source = generate_container_entry_source(&options)?;
    let sanitized_name = sanitize_name(&options.name);
    let source = virtual_source(
        project_path.join(&format!(".turbopack-module-federation-{sanitized_name}.js"))?,
        source.into(),
        rcstr!("module federation container entry"),
    );
    Ok(Vc::upcast(source))
}

fn generate_container_entry_source(options: &ModuleFederationOptions) -> Result<String> {
    let name = serde_json::to_string(&options.name)?;
    let share_scope = serde_json::to_string(&options.share_scope)?;
    let mut map_entries = Vec::new();

    for expose in &options.exposes {
        if expose.imports.is_empty() {
            continue;
        }
        let expose_name = serde_json::to_string(&expose.name)?;
        let mut imports = expose
            .imports
            .iter()
            .map(serde_json::to_string)
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .map(|request| format!("import({request})"));
        // Expose arrays are ordered setup imports. Chain them rather than using `Promise.all` so
        // each setup module finishes before the next import starts. Only the last namespace is
        // returned as the exposed module factory.
        let mut loader = imports.next().expect("empty expose imports were filtered");
        for import in imports {
            loader = format!("{loader}.then(() => {import})");
        }
        loader.push_str(".then(module => () => module)");
        map_entries.push(format!("  {expose_name}: () => {loader}"));
    }

    let shared_section =
        generate_shared_providers_source(options, true, false, Some("localShareScope"))?
            .unwrap_or_default();
    Ok(format!(
        r#"/** Turbopack Module Federation remote entry — generated */

import {{ createContainer }} from "@vercel/turbopack-module-federation/container";
import {{ createShareScope }} from "@vercel/turbopack-module-federation/share-runtime";
const localShareScope = createShareScope();
{shared_section}

const moduleMap = {{
{}
}};

const container = createContainer({name}, {share_scope}, moduleMap, {{
  libraryType: "var",
  uniqueName: {name},
  localShareScope
}});

export const get = container.get;
export const init = container.init;
export default container;
"#,
        map_entries.join(",\n")
    ))
}

#[turbo_tasks::function]
fn virtual_source(path: FileSystemPath, content: RcStr, modifier: RcStr) -> Vc<VirtualSource> {
    // Turbo Tasks memoizes this function, so repeated requests for the same generated module share
    // one source identity in the module graph.
    VirtualSource::new_with_ident(
        AssetIdent::from_path(path)
            .with_modifier(modifier)
            .into_vc(),
        AssetContent::file(FileContent::Content(File::from(content)).cell()),
    )
}

fn sanitize_name(name: &str) -> String {
    name.chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '_' {
                character
            } else {
                '_'
            }
        })
        .collect()
}

/// Returns a stable, container-specific Turbopack chunk registration global.
///
/// A host and remote may both use Turbopack on the same page. Giving each remote entry its own
/// registration global prevents its module IDs and chunk records from being consumed by the host
/// runtime before the remote container is installed.
pub fn module_federation_chunk_loading_global(name: &str) -> RcStr {
    format!("TURBOPACK_MF_{:016x}", hash_xxh3_hash64(name.as_bytes())).into()
}

#[cfg(test)]
mod tests {
    use turbo_rcstr::rcstr;

    use super::{
        generate_container_entry_source, generate_remote_module_source,
        module_federation_chunk_loading_global,
    };
    use crate::options::{Expose, ModuleFederationOptions, SharedModule, SharedVersion};

    #[test]
    fn generated_sources_are_framework_neutral_and_json_safe() {
        let mut options = ModuleFederationOptions::new(rcstr!("catalog"));
        options.exposes.push(Expose {
            name: rcstr!("./quoted\"module"),
            imports: vec![rcstr!("./quoted\"request")],
        });
        options.shared.push(SharedModule {
            request: rcstr!("react"),
            match_requests: Vec::new(),
            import: Some(rcstr!("react")),
            share_key: rcstr!("react"),
            share_scope: rcstr!("default"),
            version: SharedVersion::Infer,
            required_version: None,
            singleton: true,
            strict_version: false,
            eager: true,
        });

        let source = generate_container_entry_source(&options).unwrap();
        assert!(source.contains("@vercel/turbopack-module-federation/container"));
        assert!(source.contains(r#""./quoted\"module""#));
        assert!(!source.contains(&["next", "dist", ""].join("/")));
        assert!(!source.contains("__NEXT_"));
    }

    #[test]
    fn remote_source_uses_normalized_fallbacks() {
        let source = generate_remote_module_source(
            &[
                (rcstr!("catalog"), rcstr!("https://a.test/entry.js")),
                (rcstr!("catalog"), rcstr!("https://b.test/entry.js")),
            ],
            ".",
            "default",
        )
        .unwrap();

        assert!(source.contains("https://a.test/entry.js"));
        assert!(source.contains("https://b.test/entry.js"));
        assert!(source.contains(r#", ".")"#));
        assert!(!source.contains("parseRemoteConfig"));
    }

    #[test]
    fn chunk_global_is_stable_and_container_specific() {
        let first = module_federation_chunk_loading_global("remote-a");
        let repeated = module_federation_chunk_loading_global("remote-a");
        let second = module_federation_chunk_loading_global("remote_a");

        assert_eq!(first, repeated);
        assert_ne!(first, second);
        assert!(first.starts_with("TURBOPACK_MF_"));
        assert_ne!(first.as_str(), "TURBOPACK");
    }
}
