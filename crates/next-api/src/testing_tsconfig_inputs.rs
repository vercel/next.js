//! Private, opt-in receipts from the actual native TypeScript option computations.
//! No path crawl, JSON extension, or user-supplied receipt can create these observations.
use std::collections::{BTreeMap, BTreeSet};

use anyhow::{Context, Result, bail};
use next_core::{
    mode::NextMode,
    next_config::NextConfig,
    next_server::{
        ServerContextType, get_server_module_options_context,
        get_server_module_options_context_with_native_provenance,
    },
    util::NextRuntime,
};
use serde_json::{Value, json};
use turbo_rcstr::RcStr;
use turbo_tasks::{OperationVc, ResolvedVc, Vc};
use turbo_tasks_fs::{
    File, FileContent, FileSystemEntryType, FileSystemPath, RealPathError, RealPathErrorType,
    to_sys_path,
};
use turbo_tasks_hash::HashAlgorithm;
use turbopack::module_options::ModuleOptionsContext;
use turbopack_core::{
    asset::{Asset, AssetContent, no_hash_salt},
    environment::Environment,
    output::OutputAsset,
    reference::all_assets_from_entries,
    resolve::{
        ResolveResultItem,
        tsconfig_provenance::{
            NativeTsConfigConsumer, NativeTsConfigObservation, NativeTsConfigProbe,
            NativeTsConfigProbeContext, NativeTsConfigReadStatus,
        },
    },
    source::Source,
    source_map::GenerateSourceMap,
    virtual_output::VirtualOutputAsset,
};
use turbopack_node::execution_context::ExecutionContext;
use turbopack_resolve::resolve_options_context::{ResolveOptionsContext, TsConfigHandling};

use crate::{
    operation::OptionEndpoint,
    route::{Endpoint, EndpointOutput},
    testing::TestEntryOptions,
};

pub(crate) fn module_options_context(
    native_probe: Option<ResolvedVc<NativeTsConfigProbeContext>>,
    project_path: FileSystemPath,
    execution_context: Vc<ExecutionContext>,
    ty: ServerContextType,
    mode: Vc<NextMode>,
    next_config: Vc<NextConfig>,
    next_runtime: NextRuntime,
    encryption_key: Vc<RcStr>,
    environment: Vc<Environment>,
    client_environment: Vc<Environment>,
    enable_tracing: bool,
) -> Vc<ModuleOptionsContext> {
    match native_probe {
        Some(context) => get_server_module_options_context_with_native_provenance(
            project_path,
            execution_context,
            ty,
            mode,
            next_config,
            next_runtime,
            encryption_key,
            environment,
            client_environment,
            enable_tracing,
            *context,
        ),
        None => get_server_module_options_context(
            project_path,
            execution_context,
            ty,
            mode,
            next_config,
            next_runtime,
            encryption_key,
            environment,
            client_environment,
            enable_tracing,
        ),
    }
}

/// Follow precisely the existing recursive contexts; foreign rules keep their native choices.
#[turbo_tasks::function]
pub(crate) async fn resolve_options_context(
    options: Vc<ResolveOptionsContext>,
    native_probe: Option<ResolvedVc<NativeTsConfigProbeContext>>,
) -> Result<Vc<ResolveOptionsContext>> {
    let Some(native_probe) = native_probe else {
        return Ok(options);
    };
    let mut options = options.owned().await?;
    let mut context = native_probe.owned().await?;
    context.consumer = NativeTsConfigConsumer::Aliases;
    context.configured_path = match &options.tsconfig_path {
        TsConfigHandling::Fixed(path) => Some(path.clone()),
        _ => None,
    };
    options.native_tsconfig_probe = Some(context.resolved_cell());
    for (_, nested) in &mut options.rules {
        *nested = resolve_options_context(**nested, Some(*native_probe))
            .to_resolved()
            .await?;
    }
    Ok(options.cell())
}

/// Snapshot callers read this actual graph strongly before peeking its typed collectibles.
#[turbo_tasks::function(operation, root)]
pub(crate) async fn actual_endpoint_output_operation(
    endpoint: OperationVc<OptionEndpoint>,
) -> Result<Vc<EndpointOutput>> {
    let endpoint = (*endpoint.connect().await?).context("Missing native config endpoint")?;
    let output = endpoint.output();
    output.await?;
    Ok(output)
}

async fn path_value(path: &FileSystemPath) -> Result<Value> {
    let system = to_sys_path(path.clone())
        .await?
        .context("Native config input has no physical filesystem identity")?;
    Ok(
        json!({"nativePath":path.path,"path":system.to_str().context("Native config input path is not UTF-8")?}),
    )
}
fn consumer_name(consumer: NativeTsConfigConsumer) -> &'static str {
    match consumer {
        NativeTsConfigConsumer::TypeScript => "typescript",
        NativeTsConfigConsumer::Decorators => "decorators",
        NativeTsConfigConsumer::Jsx => "jsx",
        NativeTsConfigConsumer::Aliases => "aliases",
    }
}
fn type_name(kind: FileSystemEntryType) -> &'static str {
    match kind {
        FileSystemEntryType::NotFound => "absent",
        FileSystemEntryType::File => "file",
        FileSystemEntryType::Directory => "directory",
        FileSystemEntryType::Symlink => "symlink",
        FileSystemEntryType::Other => "other",
        FileSystemEntryType::Error => "error",
    }
}
async fn realpath_value(
    result: &std::result::Result<FileSystemPath, RealPathError>,
    symlinks: &[FileSystemPath],
    reasons: &mut BTreeSet<String>,
) -> Result<Value> {
    let mut links = Vec::new();
    for path in symlinks {
        links.push(path_value(path).await?);
    }
    if !links.is_empty() {
        reasons.insert("symlink config probe is not qualified".into());
    }
    Ok(match result {
        Ok(path) => json!({"status":"found","target":path_value(path).await?,"symlinks":links}),
        Err(error) if matches!(error.kind(), RealPathErrorType::NotFound) => {
            json!({"status":"absent","symlinks":links})
        }
        Err(error) => {
            reasons.insert("non-absence native realpath error".into());
            json!({"status":"error","error":format!("{:?}",error.kind()),"symlinks":links})
        }
    })
}
async fn sha256(content: Vc<AssetContent>) -> Result<Option<String>> {
    let value = content
        .content_hash(no_hash_salt(), HashAlgorithm::Sha256Base64)
        .owned()
        .await?;
    value
        .map(|value| {
            Ok(data_encoding::HEXLOWER.encode(&data_encoding::BASE64.decode(value.as_bytes())?))
        })
        .transpose()
}

#[derive(Debug)]
struct OrderedRecord {
    context: String,
    order: Vec<u32>,
    kind: u8,
    path: String,
    value: Value,
}

/// Collectibles are unordered. Equal identities may deduplicate only identical immutable facts.
fn ordered_records(mut records: Vec<OrderedRecord>) -> Result<Vec<Value>> {
    records.sort_by(|a, b| {
        (&a.context, &a.order, a.kind, &a.path).cmp(&(&b.context, &b.order, b.kind, &b.path))
    });
    let mut previous: Option<OrderedRecord> = None;
    let mut output = Vec::new();
    for record in records {
        if let Some(old) = &previous {
            if (&old.context, &old.order, old.kind, &old.path)
                == (&record.context, &record.order, record.kind, &record.path)
            {
                if old.value != record.value {
                    bail!(
                        "Contradictory native config observations under one \
                         context/order/kind/path"
                    );
                }
                continue;
            }
        }
        output.push(record.value.clone());
        previous = Some(record);
    }
    Ok(output)
}

/// Bind the returned sidecar inventory to its exact native asset bytes.
/// Other output paths retain their existing change-detection hashes.
pub(crate) fn receipt_asset_paths(
    receipt: ResolvedVc<Box<dyn OutputAsset>>,
    root: FileSystemPath,
) -> Vc<crate::paths::AssetPaths> {
    crate::paths::all_asset_paths(
        Vc::cell(vec![receipt]),
        root,
        Some(HashAlgorithm::Sha256Base64),
    )
}

pub(crate) async fn receipt_asset(
    output: &EndpointOutput,
    entry: ResolvedVc<TestEntryOptions>,
    observations: Vec<ResolvedVc<Box<dyn NativeTsConfigObservation>>>,
    destination: FileSystemPath,
) -> Result<ResolvedVc<Box<dyn OutputAsset>>> {
    if output.project.await?.test_entry != Some(entry) {
        bail!("Native config output/entry ownership mismatch");
    }
    let entry = entry.await?;
    let revision = entry
        .tsconfig_input_revision
        .as_ref()
        .context("Missing native config revision")?;
    let project_path = output.project.project_path().owned().await?;
    let filesystem_root = output.project.project_root_path().owned().await?;
    let mut reasons = BTreeSet::new();
    let mut roles = BTreeSet::new();
    let mut records = Vec::new();
    let mut selections = BTreeMap::new();
    let mut reads = BTreeMap::new();
    let mut extends = Vec::new();
    for observation in observations {
        let data = observation.data().await?;
        let context = data.context.await?;
        if context.filesystem_root != filesystem_root || context.project_path != project_path {
            bail!("Foreign native config observation ownership");
        }
        if context
            .configured_path
            .as_ref()
            .is_some_and(|path| !path.path.ends_with(".json"))
        {
            reasons.insert("non-json configured native input".into());
        }
        let role = consumer_name(context.consumer);
        let configured = match &context.configured_path {
            Some(path) => path_value(path).await?,
            None => Value::Null,
        };
        let consumer_path = path_value(&context.consumer_path).await?;
        let owner = serde_json::to_string(&json!([role, consumer_path, configured]))?;
        let context_value = json!({"consumer":role,"configuredPath":configured,"consumerPath":consumer_path,"lookupPath":path_value(&context.lookup_path).await?,"request":context.request,"chainIndex":context.chain_index,"attemptIndex":context.attempt_index});
        let context_key = serde_json::to_string(&context_value)?;
        let (kind, name, path, fact) = match &data.probe {
            NativeTsConfigProbe::Selection { path, selected } => {
                roles.insert(role);
                let selected_path = selected.as_ref().map(|p| p.path.to_string());
                if selections
                    .insert(owner.clone(), selected_path.clone())
                    .is_some_and(|old| old != selected_path)
                {
                    bail!("Contradictory native config selection for one actual consumer");
                }
                let selected = match selected {
                    Some(path) => path_value(path).await?,
                    None => Value::Null,
                };
                (0, "selection", path, json!({"selected":selected}))
            }
            NativeTsConfigProbe::FixedMetadata {
                path,
                succeeded,
                real_path,
                symlinks,
                observed,
            } => {
                let canonical = real_path.as_ref().ok() == Some(path);
                let absent = real_path
                    .as_ref()
                    .err()
                    .is_some_and(|error| matches!(error.kind(), RealPathErrorType::NotFound));
                if (*succeeded && (*observed != FileSystemEntryType::File || !canonical))
                    || (!*succeeded && (*observed != FileSystemEntryType::NotFound || !absent))
                {
                    reasons.insert("unqualified native Fixed metadata outcome".into());
                }
                (
                    1,
                    "fixed-metadata",
                    path,
                    json!({"succeeded":succeeded,"observed":type_name(*observed),"identity":realpath_value(real_path,symlinks,&mut reasons).await?}),
                )
            }
            NativeTsConfigProbe::ConfigRead {
                source,
                path,
                content,
                status,
                real_path,
                symlinks,
                observed,
                ..
            } => {
                if source.ident().await?.path != *path {
                    bail!("Native config source/read identity mismatch");
                }
                if !path.path.ends_with(".json")
                    || *observed != FileSystemEntryType::File
                    || real_path.as_ref().ok() != Some(path)
                {
                    reasons.insert("non-canonical regular json config read".into());
                }
                let status = match status {
                    NativeTsConfigReadStatus::Empty => "empty",
                    NativeTsConfigReadStatus::Missing => {
                        reasons.insert("selected native config is missing".into());
                        "missing"
                    }
                    NativeTsConfigReadStatus::Invalid => {
                        reasons.insert("selected native config is invalid".into());
                        "invalid"
                    }
                    NativeTsConfigReadStatus::Parsed => "parsed",
                };
                if reads
                    .insert(
                        (owner.clone(), context.chain_index, path.path.to_string()),
                        status,
                    )
                    .is_some_and(|old| old != status)
                {
                    bail!("Conflicting native config read status");
                }
                (
                    2,
                    "config-read",
                    path,
                    json!({"status":status,"sha256":sha256(AssetContent::file(**content)).await?,"observed":type_name(*observed),"identity":realpath_value(real_path,symlinks,&mut reasons).await?}),
                )
            }
            NativeTsConfigProbe::Extends {
                path,
                request,
                result,
            } => {
                let result = result.await?;
                let mut primary = Vec::new();
                let mut selected = None;
                for (index, (key, item)) in result.primary.iter().enumerate() {
                    if !key.conditions.is_empty() {
                        reasons.insert("conditional native config result".into());
                    }
                    let value = match item {
                        ResolveResultItem::Source(source) => {
                            let target = source.ident().await?.path.clone();
                            if index == 0 {
                                selected = Some(target.path.to_string());
                            }
                            json!({"kind":"source","path":path_value(&target).await?})
                        }
                        _ => {
                            reasons.insert("non-source native config result".into());
                            json!({"kind":"unsupported"})
                        }
                    };
                    let mut conditions = key
                        .conditions
                        .iter()
                        .map(|(name, value)| json!({"name":name,"value":value}))
                        .collect::<Vec<_>>();
                    conditions.sort_by(|a, b| a["name"].as_str().cmp(&b["name"].as_str()));
                    primary.push(
                        json!({"request":key.request,"conditions":conditions,"result":value}),
                    );
                }
                if result.primary.len() != 1 || !result.affecting_sources.is_empty() {
                    reasons.insert("ambiguous/unresolved native config inheritance result".into());
                }
                let mut affecting_sources = Vec::new();
                for source in result.affecting_sources.iter() {
                    affecting_sources.push(path_value(&source.ident().await?.path).await?);
                }
                extends.push((owner.clone(), context.chain_index, selected));
                (
                    3,
                    "extends",
                    path,
                    json!({"request":request,"primary":primary,"affectingSourceReferences":affecting_sources}),
                )
            }
            NativeTsConfigProbe::RealPath {
                path,
                result,
                symlinks,
            } => {
                if result.as_ref().ok().is_some_and(|target| target != path) {
                    reasons.insert("non-canonical config probe path".into());
                }
                (
                    4,
                    "realpath",
                    path,
                    realpath_value(result, symlinks, &mut reasons).await?,
                )
            }
            NativeTsConfigProbe::Directory { path, found } => {
                (5, "directory", path, json!({"found":found}))
            }
            NativeTsConfigProbe::Candidate {
                path,
                requested,
                observed,
            } => {
                use turbopack_core::resolve::tsconfig_provenance::NativeTsConfigProbeRequest;
                let requested = match requested {
                    NativeTsConfigProbeRequest::Entry => "entry",
                    NativeTsConfigProbeRequest::Type(kind) => type_name(*kind),
                };
                if !matches!(
                    observed,
                    FileSystemEntryType::NotFound | FileSystemEntryType::File
                ) {
                    reasons.insert("unqualified config candidate kind".into());
                }
                (
                    6,
                    "candidate",
                    path,
                    json!({"requested":requested,"observed":type_name(*observed)}),
                )
            }
            NativeTsConfigProbe::Incomplete { path, reason } => {
                reasons.insert(reason.to_string());
                (7, "incomplete", path, json!({"reason":reason}))
            }
        };
        records.push(OrderedRecord { context:context_key, order:data.order.clone(), kind, path:path.path.to_string(), value:json!({"context":context_value,"order":data.order,"kind":name,"path":path_value(path).await?,"fact":fact}) });
    }
    for role in ["typescript", "decorators", "jsx", "aliases"] {
        if !roles.contains(role) {
            reasons.insert(format!("actual {role} config consumer receipt missing"));
        }
    }
    for (owner, path) in &selections {
        if let Some(path) = path {
            if !reads.contains_key(&(owner.clone(), 0, path.clone())) {
                reasons.insert("selected native config read missing".into());
            }
        }
    }
    for ((owner, chain, path), _) in &reads {
        if *chain == 0 && selections.get(owner).and_then(Option::as_ref) != Some(path) {
            reasons.insert("native config read has no actual selection".into());
        }
        if *chain > 0
            && !extends.iter().any(|(eowner, echain, selected)| {
                eowner == owner
                    && echain.checked_add(1) == Some(*chain)
                    && selected.as_ref() == Some(path)
            })
        {
            reasons.insert("config inheritance read has no originating native result".into());
        }
    }
    for (owner, chain, path) in extends {
        if let Some(path) = path {
            if !chain
                .checked_add(1)
                .is_some_and(|next| reads.contains_key(&(owner, next, path)))
            {
                reasons.insert("resolved native config was not consumed".into());
            }
        }
    }
    let records = ordered_records(records)?;
    let root = output.project.node_root().owned().await?;
    let mut scripts = Vec::new();
    let mut seen = BTreeSet::new();
    for asset in all_assets_from_entries(*output.output_assets).await?.iter() {
        let path = asset.path().await?;
        if !path.path.ends_with(".js")
            && !path.path.ends_with(".mjs")
            && !path.path.ends_with(".cjs")
        {
            continue;
        }
        let relative = root
            .get_path_to(&path)
            .context("Native config script escaped Node output root")?;
        if relative.is_empty() || !seen.insert(relative.to_string()) {
            bail!("Duplicate native config script identity");
        }
        let code_hash = sha256(asset.content())
            .await?
            .context("Native config script bytes missing")?;
        let map_hash = if let Some(generator) =
            ResolvedVc::try_sidecast::<Box<dyn GenerateSourceMap>>(*asset)
        {
            sha256(AssetContent::file(generator.generate_source_map())).await?
        } else {
            None
        };
        scripts.push(json!({"path":relative,"sha256":code_hash,"mapPath":map_hash.as_ref().map(|_|format!("{relative}.map")),"mapSha256":map_hash}));
    }
    scripts.sort_by(|a, b| a["path"].as_str().cmp(&b["path"].as_str()));
    if scripts.is_empty() {
        reasons.insert("native config output inventory is empty".into());
    }
    let mode = if output.project.next_mode().await?.is_production() {
        "production"
    } else {
        "development"
    };
    let receipt = json!({"version":1,"kind":"native-typescript-config-inputs","mode":mode,"environment":entry.environment,"route":entry.route,"browserClient":entry.browser_client,"sourceCoverage":entry.source_coverage,"entryId":entry.id,"entryFile":entry.file,"entryPath":format!("server/next-test/{}.js",entry.id),"revision":revision,"filesystemRoot":path_value(&filesystem_root).await?,"projectPath":path_value(&project_path).await?,"complete":reasons.is_empty(),"reasons":reasons,"scripts":scripts,"records":records});
    Ok(ResolvedVc::upcast(
        VirtualOutputAsset::new(
            destination,
            AssetContent::file(FileContent::Content(File::from(receipt.to_string())).cell()),
        )
        .to_resolved()
        .await?,
    ))
}

#[cfg(test)]
mod tests {
    use anyhow::Result;
    use serde_json::json;
    use turbo_rcstr::{RcStr, rcstr};
    use turbo_tasks::{ResolvedVc, TurboTasks, Vc};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
    use turbo_tasks_fs::{DiskFileSystem, File, FileContent, FileSystem};
    use turbopack_core::{
        asset::AssetContent, output::OutputAsset, virtual_output::VirtualOutputAsset,
    };

    use super::{OrderedRecord, ordered_records, receipt_asset_paths};
    fn row(kind: u8, value: i32) -> OrderedRecord {
        OrderedRecord {
            context: "same-owner".into(),
            order: vec![0, 1],
            kind,
            path: "same-path".into(),
            value: json!({"kind":kind,"value":value}),
        }
    }
    #[test]
    fn kind_breaks_equal_order_ties() {
        assert_eq!(
            ordered_records(vec![row(6, 1), row(4, 2), row(5, 3)]).unwrap(),
            vec![
                json!({"kind":4,"value":2}),
                json!({"kind":5,"value":3}),
                json!({"kind":6,"value":1})
            ]
        );
    }
    #[test]
    fn identical_repeats_deduplicate() {
        assert_eq!(
            ordered_records(vec![row(4, 1), row(4, 1)]).unwrap().len(),
            1
        );
    }
    #[test]
    fn contradictory_observations_refuse() {
        assert!(ordered_records(vec![row(4, 1), row(4, 2)]).is_err());
    }
    #[test]
    fn consumer_contexts_never_substitute() {
        let mut alias = row(0, 1);
        alias.context = "aliases".into();
        assert_eq!(ordered_records(vec![alias, row(0, 1)]).unwrap().len(), 2);
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn receipt_inventory_hash_is_raw_sha256() -> Result<()> {
        #[turbo_tasks::function(operation, root)]
        async fn operation(disk_root: RcStr) -> Result<()> {
            let root = DiskFileSystem::new(rcstr!("native-receipt-hash"), Vc::cell(disk_root))
                .root()
                .owned()
                .await?;
            let path = root.join("server/next-test/entry.tsconfig-inputs.json")?;
            for (bytes, expected) in [
                ("", "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU="),
                ("abc", "ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0="),
                ("abd", "pS0VnyYrLG3bckphhAvvw26zDIiHekAwtly+himESck="),
                (
                    r#"{"version":1}"#,
                    "JDDxoq0pgtAGeIVIikyJ4hrR18g7EVuo8bIKzIjfrqg=",
                ),
            ] {
                for content_type in [None, Some("application/json")] {
                    let mut file = File::from(bytes);
                    if let Some(content_type) = content_type {
                        file = file.with_content_type(content_type.parse()?);
                    }
                    let receipt: ResolvedVc<Box<dyn OutputAsset>> = ResolvedVc::upcast(
                        VirtualOutputAsset::new(
                            path.clone(),
                            AssetContent::file(FileContent::Content(file).cell()),
                        )
                        .to_resolved()
                        .await?,
                    );
                    let paths = receipt_asset_paths(receipt, root.clone()).await?;
                    assert_eq!(paths.len(), 1);
                    assert_eq!(
                        &*paths[0].path,
                        "server/next-test/entry.tsconfig-inputs.json"
                    );
                    assert_eq!(&*paths[0].content_hash, expected);
                    let digest = data_encoding::BASE64.decode(paths[0].content_hash.as_bytes())?;
                    assert_eq!(digest.len(), 32);
                    assert_eq!(data_encoding::BASE64.encode(&digest), expected);
                    let ordinary =
                        crate::paths::all_asset_paths(Vc::cell(vec![receipt]), root.clone(), None)
                            .await?;
                    assert_ne!(paths[0].content_hash, ordinary[0].content_hash);
                }
            }
            Ok(())
        }

        let directory = tempfile::tempdir()?;
        let disk_root = directory.path().canonicalize()?;
        let disk_root: RcStr = disk_root.to_str().unwrap().into();
        let tasks = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tasks
            .run_once(async move {
                operation(disk_root).read_strongly_consistent().await?;
                Ok(())
            })
            .await
    }
}
