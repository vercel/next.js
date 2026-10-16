use std::sync::Arc;

use anyhow::{Result, ensure};
use next_api::{
    analyze::{
        AnalyzeClientReferenceEntry, AnalyzeDataOutputAsset, AnalyzeRouteEntries,
        AnalyzeRouteEntry, ModulesDataOutputAsset, RouteBundleSummary, analyze_output_assets,
        analyze_route_entry_id, combine_output_assets, combine_traced_files,
    },
    project::ProjectContainer,
    route::{AnalyzeChunkGroup, AnalyzeChunkGroups, Endpoint, EndpointGroup, EndpointGroupKey},
};
use serde::Serialize;
use turbo_rcstr::rcstr;
use turbo_tasks::{
    Effects, FxIndexSet, ReadRef, ResolvedVc, TryJoinIterExt, ValueToString, ValueToStringRef, Vc,
};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbopack_core::{
    asset::AssetContent,
    issue::PlainIssue,
    module::Module,
    output::{OutputAsset, OutputAssets},
    virtual_output::VirtualOutputAsset,
};

#[derive(Serialize)]
struct RouteSummary {
    route: String,
    #[serde(flatten)]
    bundles: RouteBundleSummary,
}

use crate::next_api::utils::strongly_consistent_catch_collectables;

#[turbo_tasks::value(serialization = "skip")]
pub struct WriteAnalyzeResult {
    pub issues: Arc<Vec<ReadRef<PlainIssue>>>,
    pub effects: Arc<Effects>,
}

#[turbo_tasks::function(operation, root)]
pub async fn write_analyze_data_with_issues_operation(
    project: ResolvedVc<ProjectContainer>,
    app_dir_only: bool,
) -> Result<Vc<WriteAnalyzeResult>> {
    let analyze_data_op = write_analyze_data_with_issues_operation_inner(project, app_dir_only);
    let filter = project.project().issue_filter().await?;

    let (_analyze_data, issues, effects) =
        strongly_consistent_catch_collectables(analyze_data_op, &filter).await?;

    Ok(WriteAnalyzeResult { issues, effects }.cell())
}

#[turbo_tasks::function(operation, root)]
async fn write_analyze_data_with_issues_operation_inner(
    project: ResolvedVc<ProjectContainer>,
    app_dir_only: bool,
) -> Result<()> {
    let analyze_data_op = get_analyze_data_operation(project, app_dir_only);

    project
        .project()
        .emit_all_output_assets(analyze_data_op)
        .as_side_effect()
        .await?;

    Ok(())
}

async fn route_chunk_groups(endpoint_group: &EndpointGroup) -> Result<Vec<AnalyzeChunkGroup>> {
    let mut groups = vec![];
    for entry in &endpoint_group.primary {
        groups.extend(entry.endpoint.analyze_chunk_groups().await?.iter().cloned());
    }
    Ok(groups)
}

/// Routes are rooted by server code, with client references nested under those roots.
async fn route_entries(
    key: &EndpointGroupKey,
    endpoint_group: &EndpointGroup,
    role: &str,
) -> Result<Vec<AnalyzeRouteEntry>> {
    let mut result = vec![];
    for endpoint in &endpoint_group.primary {
        let entries = endpoint.endpoint.entries().await?;
        let client = endpoint.endpoint.analyze_client_entries().await?;
        let bootstrap = client
            .bootstrap_modules
            .iter()
            .map(|module| module.ident().to_string().owned())
            .try_join()
            .await?
            .into_iter()
            .collect::<FxIndexSet<_>>();
        let server = client
            .server_modules
            .iter()
            .map(|module| module.ident().to_string().owned())
            .try_join()
            .await?
            .into_iter()
            .collect::<FxIndexSet<_>>();
        let owner = if let Some(module) = client.server_modules.first() {
            Some(module.ident().to_string().owned().await?)
        } else {
            None
        };
        let mut seen_references = FxIndexSet::default();
        let mut references = vec![];
        for reference in &client.references {
            let module_ident = reference.module.ident().to_string().owned().await?;
            if !seen_references.insert((module_ident.clone(), reference.kind.clone())) {
                continue;
            }
            references.push(AnalyzeClientReferenceEntry {
                module_path: reference.module.ident().await?.path.to_string_ref().await?,
                module_ident,
                reference_kind: reference.kind.clone(),
            });
        }
        ensure!(
            references.is_empty() || owner.is_some(),
            "client references without an endpoint root"
        );
        let mut seen = FxIndexSet::default();
        let mut attached = false;
        for module in entries.all_modules() {
            let module_ident = module.ident().to_string().owned().await?;
            if !seen.insert(module_ident.clone()) {
                continue;
            }
            let module_path = module.ident().await?.path.to_string_ref().await?;
            let is_owner = owner.as_ref() == Some(&module_ident);
            attached |= is_owner;
            let sub_name = endpoint.sub_name.as_deref().unwrap_or("");
            result.push(AnalyzeRouteEntry {
                route_entry_id: analyze_route_entry_id(key.as_str(), role, sub_name, &module_ident),
                entry_kind: if bootstrap.contains(&module_ident) {
                    Some(rcstr!("client_bootstrap"))
                } else if server.contains(&module_ident) {
                    Some(rcstr!("server"))
                } else {
                    None
                },
                client_references: if is_owner { references.clone() } else { vec![] },
                module_ident,
                module_path,
                role: role.into(),
            });
        }
        ensure!(
            references.is_empty() || attached,
            "client references cannot be attached to an endpoint root"
        );
    }
    result.sort_by(|a, b| a.route_entry_id.cmp(&b.route_entry_id));
    Ok(result)
}

#[turbo_tasks::function(operation)]
async fn get_analyze_data_operation(
    container: ResolvedVc<ProjectContainer>,
    app_dir_only: bool,
) -> Result<Vc<OutputAssets>> {
    let project = container.project();
    let project = project.with_next_config(project.next_config().with_analyze_config());

    let analyze_output_root = project
        .node_root()
        .owned()
        .await?
        .join("diagnostics/analyze/data")?;
    let whole_app_module_graphs = project.whole_app_module_graphs();
    let analyze_output_root = &analyze_output_root;
    let endpoint_groups = project.get_all_endpoint_groups(app_dir_only).await?;

    // Collect output assets from _app and _document to merge into each route's
    // analyze.data so their modules are visible in every route's treemap.
    let mut combined_output_assets: Vec<ResolvedVc<Box<dyn OutputAsset>>> = vec![];
    let mut combined_traced_files: Vec<FileSystemPath> = vec![];
    for (key, endpoint_group) in endpoint_groups.iter() {
        if matches!(
            key,
            EndpointGroupKey::PagesApp | EndpointGroupKey::PagesDocument
        ) {
            combined_output_assets.extend(endpoint_group.output_assets().await?.iter().copied());
            combined_traced_files.extend(endpoint_group.traced_files().await?.iter().cloned());
        }
    }

    let has_combined = !combined_output_assets.is_empty();
    let combined_assets_vc = Vc::cell(combined_output_assets);
    let combined_traced_vc = Vc::cell(combined_traced_files);
    let mut shared_route_entries = vec![];
    let mut shared_chunk_groups = vec![];
    for (key, endpoint_group) in endpoint_groups.iter() {
        if matches!(
            key,
            EndpointGroupKey::PagesApp | EndpointGroupKey::PagesDocument
        ) {
            shared_route_entries.extend(route_entries(key, endpoint_group, "shared").await?);
            shared_chunk_groups.extend(route_chunk_groups(endpoint_group).await?);
        }
    }

    let analyze_data_and_summaries = endpoint_groups
        .iter()
        .map(async |(key, endpoint_group)| {
            let output_assets = if has_combined
                && !matches!(
                    key,
                    EndpointGroupKey::PagesApp | EndpointGroupKey::PagesDocument
                ) {
                // Combine route output assets with _app and _document output assets so
                // the generated analyze.data already includes their modules.
                combine_output_assets(endpoint_group.output_assets(), combined_assets_vc)
            } else {
                endpoint_group.output_assets()
            };
            let traced_files = if has_combined
                && !matches!(
                    key,
                    EndpointGroupKey::PagesApp | EndpointGroupKey::PagesDocument
                ) {
                // Combine route traced files with _app and _document traced modules so
                // the generated analyze.data already includes their modules.
                combine_traced_files(endpoint_group.traced_files(), combined_traced_vc)
            } else {
                endpoint_group.traced_files()
            };
            let mut entries = route_entries(key, endpoint_group, "route").await?;
            let has_client_bootstrap = entries
                .iter()
                .any(|entry| entry.entry_kind.as_deref() == Some("client_bootstrap"));
            if has_combined
                && !matches!(
                    key,
                    EndpointGroupKey::PagesApp | EndpointGroupKey::PagesDocument
                )
            {
                entries.extend(shared_route_entries.iter().cloned().map(|mut entry| {
                    // Shared Pages output appears in API route artifacts as well.
                    // That does not make it an API route's browser bootstrap.
                    if !has_client_bootstrap {
                        entry.entry_kind = None;
                        entry.client_references.clear();
                    }
                    entry
                }));
                entries.sort_by(|a, b| a.route_entry_id.cmp(&b.route_entry_id));
                entries.dedup_by(|a, b| a.route_entry_id == b.route_entry_id);
            }
            let mut groups = route_chunk_groups(endpoint_group).await?;
            if has_client_bootstrap
                && !matches!(
                    key,
                    EndpointGroupKey::PagesApp | EndpointGroupKey::PagesDocument
                )
                && groups.iter().any(|group| group.pages_html)
            {
                groups.extend(shared_chunk_groups.iter().cloned());
            }
            let chunk_groups: Vc<AnalyzeChunkGroups> = Vc::cell(groups);
            let route_entries: Vc<AnalyzeRouteEntries> = Vc::cell(entries);
            let analyze_data = AnalyzeDataOutputAsset::new(
                analyze_output_root
                    .join(&key.to_string())?
                    .join("analyze.data")?,
                output_assets,
                traced_files,
                route_entries,
                chunk_groups,
                *whole_app_module_graphs.await?.full,
            )
            .to_resolved()
            .await?;

            let summary = if let EndpointGroupKey::Route(route) = key {
                Some(RouteSummary {
                    route: route.to_string(),
                    bundles: analyze_output_assets(
                        output_assets,
                        traced_files,
                        route_entries,
                        chunk_groups,
                        *whole_app_module_graphs.await?.full,
                    )
                    .await?
                    .summary,
                })
            } else {
                None
            };

            Ok((ResolvedVc::upcast(analyze_data), summary))
        })
        .try_join()
        .await?;

    let mut analyze_data = Vec::with_capacity(analyze_data_and_summaries.len() + 2);
    let mut route_summaries = Vec::new();
    for (asset, summary) in analyze_data_and_summaries {
        analyze_data.push(asset);
        if let Some(summary) = summary {
            route_summaries.push(summary);
        }
    }

    let route_summaries_asset = ResolvedVc::upcast(
        VirtualOutputAsset::new(
            analyze_output_root.join("route-summaries.json")?,
            AssetContent::file(
                FileContent::Content(File::from(serde_json::to_string(&route_summaries)?)).cell(),
            ),
        )
        .to_resolved()
        .await?,
    );

    let modules_data = ResolvedVc::upcast(
        ModulesDataOutputAsset::new(
            analyze_output_root.join("modules.data")?,
            *whole_app_module_graphs.await?.full,
        )
        .to_resolved()
        .await?,
    );

    analyze_data.extend([route_summaries_asset, modules_data]);
    Ok(Vc::cell(analyze_data))
}
