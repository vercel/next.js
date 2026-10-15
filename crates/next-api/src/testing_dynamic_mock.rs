//! Runtime registration is selected at the real native loader callback.
//! This manifest owns actual compiler module IDs and never evaluates a target.
use std::collections::HashSet;

use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, fxindexmap};
use turbo_tasks_fs::FileSystemPath;
use turbopack::ModuleAssetContext;
use turbopack_core::{
    asset::Asset,
    context::AssetContext,
    module::Module,
    reference::ModuleReference,
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
    resolve::{ModuleResolveResultItem, ResolveErrorMode, origin::ResolveOrigin, parse::Request},
    source::Source,
};
use turbopack_ecmascript::{
    chunk::{EcmascriptChunkPlaceable, EcmascriptExports},
    module_fragments::part::module::EcmascriptModulePartAsset,
    references::external_module::CachedExternalModule,
    side_effect_optimization::locals::module::EcmascriptModuleLocalsModule,
};
use turbopack_resolve::ecmascript::esm_resolve;

use crate::{
    project::Project,
    testing::{test_input_error, test_source},
};

async fn references(
    module: ResolvedVc<Box<dyn Module>>,
) -> Result<Vec<ResolvedVc<Box<dyn Module>>>> {
    let mut modules = Vec::new();
    for reference in module.references().await?.iter() {
        let resolved = reference.resolve_reference().await?;
        for (_, item) in resolved.primary.iter() {
            if let ModuleResolveResultItem::External { name, .. } = item
                && !name.starts_with("node:")
            {
                return Err(test_input_error(
                    module.ident().await?.path.clone(),
                    format!("Runtime mocks require qualified node: external ownership: {name}"),
                ));
            }
        }
        modules.extend(resolved.primary_modules().await?);
    }
    Ok(modules)
}

pub(crate) async fn manifest(
    project: ResolvedVc<Project>,
    context: ResolvedVc<ModuleAssetContext>,
    root_module: ResolvedVc<Box<dyn Module>>,
    path: &FileSystemPath,
    requests: &[String],
) -> Result<ResolvedVc<Box<dyn Module>>> {
    let root = project.project_path().owned().await?;
    let next_package = next_core::get_next_package(root.clone()).await?;
    let origin_module = if let Some(part) =
        ResolvedVc::try_downcast_type::<EcmascriptModulePartAsset>(root_module)
    {
        ResolvedVc::upcast(part.await?.full_module)
    } else if let Some(locals) =
        ResolvedVc::try_downcast_type::<EcmascriptModuleLocalsModule>(root_module)
    {
        ResolvedVc::upcast(locals.await?.module)
    } else {
        root_module
    };
    let Some(origin) = ResolvedVc::try_sidecast::<Box<dyn ResolveOrigin>>(origin_module) else {
        return Err(test_input_error(
            path.clone(),
            "Runtime mocks require the actual entry resolver origin",
        ));
    };
    let origin = crate::testing_dependencies::dependency_origin(origin).await?;
    let mut targets: Vec<(
        ResolvedVc<Box<dyn Module>>,
        Vec<String>,
        Vec<ResolvedVc<Box<dyn Module>>>,
    )> = Vec::new();
    let mut authorized = HashSet::new();
    for request in requests {
        if matches!(request.as_str(), "next" | "react" | "react-dom" | "vitest")
            || ["next/", "react/", "react-dom/", "node:"]
                .iter()
                .any(|prefix| request.starts_with(prefix))
        {
            return Err(test_input_error(
                path.clone(),
                "Runtime module mocks cannot replace framework or native targets",
            ));
        }
        let resolved = esm_resolve(
            *origin,
            Request::parse(RcStr::from(request.clone()).into()),
            EcmaScriptModulesReferenceSubType::DynamicImport,
            ResolveErrorMode::Error,
            None,
        )
        .await?;
        let resolved = resolved.await?;
        for source in resolved.affecting_sources_iter() {
            if !source
                .ident()
                .await?
                .path
                .realpath_with_links()
                .await?
                .symlinks
                .is_empty()
            {
                return Err(test_input_error(
                    path.clone(),
                    "Runtime mock target resolution cannot use symlink inputs yet",
                ));
            }
        }
        let modules = resolved.primary_modules().await?;
        if modules.len() != 1 {
            return Err(test_input_error(
                path.clone(),
                "Runtime mock target must resolve to one native ESM module",
            ));
        }
        let module = modules[0];
        if ResolvedVc::try_downcast_type::<CachedExternalModule>(module).is_some() {
            return Err(test_input_error(
                path.clone(),
                "Runtime module mocks cannot replace external targets",
            ));
        }
        if let Some((_, aliases, _)) = targets.iter_mut().find(|(known, _, _)| *known == module) {
            aliases.push(request.clone());
            continue;
        }
        let ident = module.ident().await?;
        let target_path = ident.path.clone();
        let Some(relative) = root.get_path_to(&target_path) else {
            return Err(test_input_error(
                path.clone(),
                "Runtime mock targets must stay inside the Next project",
            ));
        };
        if next_package.get_path_to(&target_path).is_some()
            || target_path == *path
            || relative.split('/').any(|part| part == "node_modules")
            || !ident.query.is_empty()
            || !ident.fragment.is_empty()
            || !target_path.realpath_with_links().await?.symlinks.is_empty()
        {
            return Err(test_input_error(
                path.clone(),
                "Runtime mocks require unaliased project-local ESM targets without queries or \
                 fragments",
            ));
        }
        let source = next_core::util::file_content_rope(target_path.read())
            .await?
            .to_str()?
            .into_owned();
        crate::testing_mock_source::validate_mock_target_source(&source, target_path.file_name())
            .map_err(|error| test_input_error(target_path.clone(), error.to_string()))?;
        let syntax = crate::testing_dependency_source::literal_dependencies(
            &source,
            target_path.file_name(),
        );
        if !syntax.complete
            || syntax
                .requests
                .iter()
                .any(|(request, _)| !request.starts_with("node:"))
            || !crate::testing_mock_source::extract_test_mocks(&source, target_path.file_name())?
                .is_empty()
        {
            return Err(test_input_error(
                target_path.clone(),
                "Runtime mock targets currently require leaf ESM with only explicit node: builtin \
                 imports",
            ));
        }
        let mut queue = vec![module];
        let mut seen = HashSet::new();
        let mut owned = Vec::new();
        let mut inspectable = false;
        while let Some(part) = queue.pop() {
            if !seen.insert(part) {
                continue;
            }
            let ident = part.ident().await?;
            if next_package.get_path_to(&ident.path).is_some() {
                continue;
            }
            if let Some(external) = ResolvedVc::try_downcast_type::<CachedExternalModule>(part) {
                if external.await?.request().starts_with("node:") {
                    continue;
                }
                return Err(test_input_error(
                    target_path.clone(),
                    "Runtime mock target externals must be explicit node: builtins",
                ));
            }
            if ident.path != target_path {
                return Err(test_input_error(
                    target_path.clone(),
                    "Runtime mock targets cannot have transitive user modules yet",
                ));
            }
            if let Some(source) = *part.source().await? {
                let transformed =
                    next_core::util::file_content_rope(source.content().file_content())
                        .await?
                        .to_str()?
                        .into_owned();
                crate::testing_mock_source::validate_mock_target_source(
                    &transformed,
                    target_path.file_name(),
                )
                .map_err(|error| test_input_error(target_path.clone(), error.to_string()))?;
                let syntax = crate::testing_dependency_source::literal_dependencies(
                    &transformed,
                    target_path.file_name(),
                );
                if !syntax.complete
                    || syntax
                        .requests
                        .iter()
                        .any(|(request, _)| !request.starts_with("node:"))
                    || !crate::testing_mock_source::extract_test_mocks(
                        &transformed,
                        target_path.file_name(),
                    )?
                    .is_empty()
                {
                    return Err(test_input_error(
                        target_path.clone(),
                        "Runtime mock transformed sources require leaf ESM without helper \
                         operations",
                    ));
                }
                inspectable = true;
            }
            let Some(placeable) =
                ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(part)
            else {
                return Err(test_input_error(
                    target_path.clone(),
                    "Runtime mock targets must be compiled ESM",
                ));
            };
            let EcmascriptExports::EsmExports(exports) = &*placeable.get_exports().await? else {
                return Err(test_input_error(
                    target_path.clone(),
                    "Runtime mock targets cannot be CommonJS",
                ));
            };
            if exports.await?.exports.contains_key("then") {
                return Err(test_input_error(
                    target_path.clone(),
                    "Runtime mock targets with then exports are not implemented",
                ));
            }
            authorized.insert(part);
            owned.push(part);
            queue.extend(references(part).await?);
        }
        if !inspectable {
            return Err(test_input_error(
                target_path.clone(),
                "Runtime mock targets require an inspectable compiler source",
            ));
        }
        targets.push((module, vec![request.clone()], owned));
    }
    let mut queue = vec![root_module];
    let mut seen = HashSet::new();
    let mut owners = Vec::new();
    while let Some(module) = queue.pop() {
        if !seen.insert(module) {
            continue;
        }
        let ident = module.ident().await?;
        if next_package.get_path_to(&ident.path).is_some() {
            continue;
        }
        if let Some(external) = ResolvedVc::try_downcast_type::<CachedExternalModule>(module) {
            if external.await?.request().starts_with("node:") {
                continue;
            }
            return Err(test_input_error(
                path.clone(),
                "Runtime mocks do not support external package modules",
            ));
        }
        if ident.path == *path {
            owners.push(module);
        } else if !authorized.contains(&module) {
            return Err(test_input_error(
                ident.path.clone(),
                "Runtime mock imports must currently originate in the explicit test entry",
            ));
        }
        queue.extend(references(module).await?);
    }
    if owners.is_empty() {
        return Err(test_input_error(
            path.clone(),
            "Runtime mock manifest has no native entry owner",
        ));
    }
    let mut assets = fxindexmap! {};
    let mut code = String::new();
    let mut emit_id = |name: String, module: ResolvedVc<Box<dyn Module>>| {
        let request = format!("INNER_DYNAMIC_MOCK_{}", assets.len());
        assets.insert(RcStr::from(request.clone()), module);
        code.push_str(&format!(
            "import {{ __turbopack_module_id__ as {name} }} from '{request}' with {{ \
             \"turbopack-chunking-type\": \"none\" }};\n"
        ));
    };
    for (index, module) in owners.iter().enumerate() {
        emit_id(format!("owner_{index}"), *module);
    }
    for (index, (module, _, parts)) in targets.iter().enumerate() {
        emit_id(format!("target_{index}"), *module);
        for (part_index, module) in parts.iter().enumerate() {
            emit_id(format!("part_{index}_{part_index}"), *module);
        }
    }
    code.push_str(&format!(
        "export const manifest={{version:1,owners:[{}],targets:[{}]}};\n",
        (0..owners.len())
            .map(|index| format!("owner_{index}"))
            .collect::<Vec<_>>()
            .join(","),
        targets
            .iter()
            .enumerate()
            .map(|(index, (_, requests, parts))| Ok(format!(
                "{{id:target_{index},aliases:[{}],requests:{}}}",
                (0..parts.len())
                    .map(|part_index| format!("part_{index}_{part_index}"))
                    .collect::<Vec<_>>()
                    .join(","),
                serde_json::to_string(requests)?
            )))
            .collect::<Result<Vec<_>>>()?
            .join(",")
    ));
    let source = test_source(
        path.clone(),
        Some(rcstr!("next-test-dynamic-mock-manifest")),
        code,
    )
    .await?;
    Ok(context
        .process(*source, ReferenceType::Internal(ResolvedVc::cell(assets)))
        .module()
        .to_resolved()
        .await?)
}
