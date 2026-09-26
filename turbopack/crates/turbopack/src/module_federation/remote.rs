use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{FileContent, FileSystemPath};
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
    source::Source,
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::utils::StringifyJs;

use crate::module_federation::{
    config::{ModuleFederationConfig, ModuleFederationRemote},
    runtime::{FEDERATION_RUNTIME_REQUEST, module_federation_runtime_source},
    shared::apply_shared_import_map,
};

async fn module_federation_remote_init_source(
    project_path: FileSystemPath,
    remote: &ModuleFederationRemote,
) -> Result<ResolvedVc<Box<dyn Source>>> {
    let candidates = remote
        .external
        .iter()
        .map(|external| (&*external.global, &*external.url))
        .collect::<Vec<_>>();
    let code = format!(
        r#"
const candidates = {candidates};
const manifestEntry = {manifest_entry};
const remoteName = {remote_name};
const shareScope = {share_scope};

async function getInstance() {{
  if (typeof window === 'undefined' && typeof importScripts === 'undefined') {{
    const transport = manifestEntry ? 'Manifest' : 'External script';
    throw new Error(`${{transport}} loading is only supported in browser client code: ${{manifestEntry || candidates[0]?.[1]}}`);
  }}
  return (await import({runtime_request})).instance;
}}

export async function initializeAll() {{
  const instance = await getInstance();
  await Promise.all(instance.initializeSharing(shareScope));
  return {{ containers: [], failures: [] }};
}}

export async function get(request, fullRequest) {{
  let instance;
  try {{
    instance = await getInstance();
  }} catch (error) {{
    throw new Error(`Failed to load federated module ${{fullRequest}}: ${{error?.message || error}}`);
  }}
  const failures = [];
  const id = `${{remoteName}}${{request === '.' ? '' : '/' + request.replace(/^\.\//, '')}}`;
  if (manifestEntry) {{
    try {{
      const namespace = await instance.loadRemote(id);
      if (namespace == null) throw new Error(`Remote ${{remoteName}} returned no module for ${{request}}`);
      return () => namespace;
    }} catch (error) {{
      throw new Error(`Failed to load federated module ${{fullRequest}} via manifest: ${{error?.message || error}}`);
    }}
  }}
  for (let index = 0; index < candidates.length; index++) {{
    const [entryGlobalName, entry] = candidates[index];
    if (index) {{
      instance.registerRemotes([{{name: remoteName, entry, entryGlobalName, type: 'var', shareScope}}], {{force: true}});
    }}
    try {{
      const namespace = await instance.loadRemote(id);
      if (namespace == null) throw new Error(`Remote ${{remoteName}} returned no module for ${{request}}`);
      return () => namespace;
    }} catch (error) {{
      failures.push(error);
    }}
  }}
  const details = failures.map((failure) => failure?.message || String(failure)).join('; ');
  const error = new Error(`Failed to load federated module ${{fullRequest}}: ${{details}}`);
  error.cause = failures;
  throw error;
}}
"#,
        candidates = StringifyJs(&candidates),
        manifest_entry = StringifyJs(&remote.manifest),
        remote_name = StringifyJs(&remote.request),
        share_scope = StringifyJs(&remote.share_scope),
        runtime_request = StringifyJs(FEDERATION_RUNTIME_REQUEST),
    );
    Ok(ResolvedVc::upcast(
        VirtualSource::new(
            project_path.join(&format!(
                ".turbopack-module-federation-init-{}.js",
                remote.request.replace('/', "_")
            ))?,
            AssetContent::file(FileContent::Content(code.into()).cell()),
        )
        .to_resolved()
        .await?,
    ))
}

pub async fn apply_module_federation_import_map(
    import_map: &mut ImportMap,
    project_path: FileSystemPath,
    config: &ModuleFederationConfig,
) -> Result<()> {
    if !config.is_enabled() {
        return Ok(());
    }
    let runtime_source = module_federation_runtime_source(project_path.clone(), config).await?;
    import_map.insert_exact_alias(
        FEDERATION_RUNTIME_REQUEST,
        ImportMapping::Direct(ResolveResult::source(runtime_source).resolved_cell())
            .resolved_cell(),
    );
    for (index, remote) in config.remotes.iter().enumerate() {
        let init_request: RcStr =
            format!("__turbopack_module_federation_remote_init__/{index}").into();
        let init_source =
            module_federation_remote_init_source(project_path.clone(), remote).await?;
        import_map.insert_exact_alias(
            init_request.clone(),
            ImportMapping::Direct(ResolveResult::source(init_source).resolved_cell())
                .resolved_cell(),
        );

        let replacer = ModuleFederationRemoteReplacer {
            project_path: project_path.clone(),
            remote: remote.clone(),
            init_request,
        }
        .resolved_cell();
        let mapping = ImportMapping::Dynamic(ResolvedVc::upcast(replacer)).resolved_cell();
        import_map.insert_exact_alias(remote.request.clone(), mapping);
        import_map.insert_wildcard_alias(RcStr::from(format!("{}/", remote.request)), mapping);
    }
    apply_shared_import_map(import_map, project_path, config, false);
    Ok(())
}

#[turbo_tasks::value]
#[derive(Clone)]
struct ModuleFederationRemoteReplacer {
    project_path: FileSystemPath,
    remote: ModuleFederationRemote,
    init_request: RcStr,
}

#[turbo_tasks::value_impl]
impl ImportMappingReplacement for ModuleFederationRemoteReplacer {
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
        let exposed_request = if request == this.remote.request {
            ".".to_string()
        } else if let Some(remainder) = request.strip_prefix(&format!("{}/", this.remote.request)) {
            format!("./{remainder}")
        } else {
            return Ok(ImportMapResult::NoEntry.cell());
        };

        let code = format!(
            r#"
const {{ get }} = await import({init_request});
const factory = await get({exposed_request_json}, {full_request});
const federatedModule = factory();
__turbopack_export_namespace__(federatedModule);
"#,
            init_request = StringifyJs(&this.init_request),
            exposed_request_json = StringifyJs(&exposed_request),
            full_request = StringifyJs(&request),
        );
        let virtual_name = format!(
            ".turbopack-module-federation-remote-{}-{}.js",
            this.remote.request.replace('/', "_"),
            exposed_request.replace('/', "_")
        );
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
