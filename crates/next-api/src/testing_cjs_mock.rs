//! The named CommonJS spy slice is certified by the real compiler exports and
//! unspecialized ESM references. This module never evaluates an implementation.
use std::collections::{BTreeSet, HashSet};

use anyhow::Result;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack::ModuleAssetContext;
use turbopack_core::{
    asset::Asset,
    chunk::ChunkingType,
    context::AssetContext,
    file_source::FileSource,
    module::Module,
    reference::ModuleReference,
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
    resolve::{ModulePart, ModuleResolveResultItem, ResolveErrorMode, parse::Request},
    source::Source,
};
use turbopack_ecmascript::{
    EcmascriptModuleAsset,
    module_fragments::part::module::EcmascriptModulePartAsset,
    references::{
        esm::EsmAssetReference,
        exports::{compute_ecmascript_module_exports, read_static_cjs_exports},
        external_module::CachedExternalModule,
    },
    side_effect_optimization::locals::module::EcmascriptModuleLocalsModule,
};
use turbopack_resolve::ecmascript::esm_resolve;

use crate::{project::Project, testing::test_input_error};

fn requested_name(part: Option<&ModulePart>, reexport: bool) -> Result<Option<String>> {
    if !reexport {
        match part {
            Some(ModulePart::Evaluation) => return Ok(None),
            Some(ModulePart::Export(name))
                if !matches!(
                    name.as_str(),
                    "default" | "then" | "__proto__" | "__esModule"
                ) =>
            {
                return Ok(Some(name.to_string()));
            }
            _ => {}
        }
    }
    anyhow::bail!("CommonJS spies currently require direct named ESM consumers")
}

async fn full_module(
    module: ResolvedVc<Box<dyn Module>>,
) -> Result<Option<ResolvedVc<EcmascriptModuleAsset>>> {
    if let Some(module) = ResolvedVc::try_downcast_type::<EcmascriptModuleAsset>(module) {
        return Ok(Some(module));
    }
    if let Some(part) = ResolvedVc::try_downcast_type::<EcmascriptModulePartAsset>(module) {
        return Ok(Some(part.await?.full_module));
    }
    if let Some(locals) = ResolvedVc::try_downcast_type::<EcmascriptModuleLocalsModule>(module) {
        return Ok(Some(locals.await?.module));
    }
    Ok(None)
}

async fn validate_source(path: &FileSystemPath, source: &str, entry: bool) -> Result<()> {
    if entry {
        crate::testing_mock_source::validate_cjs_spy_entry_source(source, path.file_name())
            .map_err(|error| test_input_error(path.clone(), error.to_string()))?;
    }
    let syntax = crate::testing_dependency_source::literal_dependencies(source, path.file_name());
    if !syntax.complete
        || syntax.requests.iter().any(|(_, dynamic)| *dynamic)
        || (!entry && !syntax.requests.is_empty())
    {
        return Err(test_input_error(
            path.clone(),
            "CommonJS spies require static ESM entry imports and a leaf CommonJS implementation",
        ));
    }
    Ok(())
}

pub(crate) async fn named_spy_exports(
    project: ResolvedVc<Project>,
    context: ResolvedVc<ModuleAssetContext>,
    path: &FileSystemPath,
    target: ResolvedVc<Box<dyn Module>>,
) -> Result<Vec<String>> {
    let target_module = full_module(target).await?.ok_or_else(|| {
        test_input_error(
            path.clone(),
            "CommonJS spies require the actual compiler module",
        )
    })?;
    let exports = read_static_cjs_exports(target_module)
        .await?
        .ok_or_else(|| {
            test_input_error(
                path.clone(),
                "CommonJS spies require a native static export certificate",
            )
        })?;
    if exports.has_es_module
        || exports.export_names.is_empty()
        || exports.export_names.iter().any(|name| {
            matches!(
                name.as_str(),
                "default" | "then" | "__proto__" | "__esModule"
            )
        })
    {
        return Err(test_input_error(
            path.clone(),
            "CommonJS spies require an unambiguous native static export table",
        ));
    }
    let target_path = target.ident().await?.path.clone();
    for source_path in [path, &target_path] {
        if !source_path.realpath_with_links().await?.symlinks.is_empty() {
            return Err(test_input_error(
                source_path.clone(),
                "CommonJS spy entry/targets cannot use symlink inputs yet",
            ));
        }
        let text = next_core::util::file_content_rope(source_path.read())
            .await?
            .to_str()?
            .into_owned();
        validate_source(source_path, &text, source_path == path).await?;
    }
    let root = context
        .process(
            Vc::upcast(FileSource::new(path.clone())),
            ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined),
        )
        .module()
        .to_resolved()
        .await?;
    let root_module = full_module(root).await?.ok_or_else(|| {
        test_input_error(
            path.clone(),
            "CommonJS spies require the actual ESM entry module",
        )
    })?;
    // This inventory precedes namespace/member optimization and DCE. A namespace
    // import using only one member must not accidentally become a named certificate.
    let analysis = compute_ecmascript_module_exports(*root_module, None).await?;
    let next_package = next_core::get_next_package(project.project_path().owned().await?).await?;
    let mut names = BTreeSet::new();
    for (index, reference) in analysis.import_references.iter().enumerate() {
        let data = reference.await?;
        if !matches!(
            data.chunking_type(),
            Some(ChunkingType::Parallel {
                inherit_async: true,
                hoisted: true
            })
        ) {
            return Err(test_input_error(
                path.clone(),
                "CommonJS spy imports cannot override native chunk ownership",
            ));
        }
        let origin = crate::testing_dependencies::dependency_origin(data.origin).await?;
        let provenance = esm_resolve(
            *origin,
            Request::parse(data.request.clone().into()),
            EcmaScriptModulesReferenceSubType::Import,
            ResolveErrorMode::Error,
            None,
        )
        .await?;
        for source in provenance.await?.affecting_sources_iter() {
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
                    "CommonJS spy import resolution cannot use symlink inputs yet",
                ));
            }
        }
        let resolved = reference.resolve_reference().await?;
        for (_, item) in resolved.primary.iter() {
            if let ModuleResolveResultItem::External { name, .. } = item
                && !name.starts_with("node:")
            {
                return Err(test_input_error(
                    path.clone(),
                    "CommonJS spy entry externals require explicit node: ownership",
                ));
            }
        }
        let modules = resolved.primary_modules().await?;
        if modules.is_empty() && !data.request.starts_with("node:") {
            return Err(test_input_error(
                path.clone(),
                "CommonJS spy imports require a concrete native module",
            ));
        }
        for module in modules {
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
                    "CommonJS spy entry packages are not implemented",
                ));
            }
            if full_module(module).await? != Some(target_module) {
                return Err(test_input_error(
                    path.clone(),
                    "CommonJS spies currently require the explicit entry as their only user \
                     importer",
                ));
            }
            let name = requested_name(
                data.export_name.as_ref(),
                analysis.esm_reexport_reference_idxs.contains(&index),
            )
            .map_err(|error| test_input_error(path.clone(), error.to_string()))?;
            if let Some(name) = name {
                if !exports
                    .export_names
                    .iter()
                    .any(|known| known.as_str() == name)
                {
                    return Err(test_input_error(
                        path.clone(),
                        format!(
                            "CommonJS spy export is absent from the native export table: {name}"
                        ),
                    ));
                }
                names.insert(name);
            }
        }
    }
    if names.is_empty() {
        return Err(test_input_error(
            path.clone(),
            "CommonJS spies require a named ESM consumer",
        ));
    }
    // Inspect actual transformed sources and actual references too. Raw syntax
    // alone cannot certify configured loader output or an implicit helper edge.
    let mut queue = vec![root, target];
    let mut seen = HashSet::new();
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
                "CommonJS spy graphs cannot use package externals",
            ));
        }
        let full = full_module(module).await?;
        if full != Some(root_module) && full != Some(target_module) {
            return Err(test_input_error(
                path.clone(),
                "CommonJS spies do not support foreign user modules or importer cycles",
            ));
        }
        let source = (*module.source().await?).ok_or_else(|| {
            test_input_error(
                path.clone(),
                "CommonJS spies require inspectable transformed compiler sources",
            )
        })?;
        let text = next_core::util::file_content_rope(source.content().file_content())
            .await?
            .to_str()?
            .into_owned();
        crate::testing_mock_source::validate_mock_target_source(&text, ident.path.file_name())
            .map_err(|error| test_input_error(ident.path.clone(), error.to_string()))?;
        validate_source(&ident.path, &text, full == Some(root_module)).await?;
        for reference in module.references().await?.iter() {
            let resolved = reference.resolve_reference().await?;
            for (_, item) in resolved.primary.iter() {
                if let ModuleResolveResultItem::External { name, .. } = item
                    && !name.starts_with("node:")
                {
                    return Err(test_input_error(
                        path.clone(),
                        "CommonJS spy graphs require explicit node: external ownership",
                    ));
                }
            }
            let modules = resolved.primary_modules().await?;
            for referenced in &modules {
                if full_module(*referenced).await? == Some(target_module) {
                    let Some(esm) = ResolvedVc::try_downcast_type::<EsmAssetReference>(*reference)
                    else {
                        return Err(test_input_error(
                            path.clone(),
                            "CommonJS spies cannot be consumed through require, dynamic or opaque \
                             native references",
                        ));
                    };
                    let esm = esm.await?;
                    if full != Some(root_module) || esm.module != root_module {
                        return Err(test_input_error(
                            path.clone(),
                            "CommonJS spy consumers must retain their actual entry origin",
                        ));
                    }
                    if let Some(name) = requested_name(esm.export_name.as_ref(), false)
                        .map_err(|error| test_input_error(path.clone(), error.to_string()))?
                    {
                        if !names.contains(&name) {
                            return Err(test_input_error(
                                path.clone(),
                                "CommonJS spy consumer is absent from the native import inventory",
                            ));
                        }
                    }
                }
            }
            if full == Some(target_module) && modules.iter().any(|module| *module == root) {
                return Err(test_input_error(
                    path.clone(),
                    "CommonJS spy implementations cannot import their consumer",
                ));
            }
            queue.extend(modules);
        }
    }
    Ok(names.into_iter().collect())
}

#[cfg(test)]
mod tests {
    use turbopack_core::resolve::ModulePart;

    use crate::testing_cjs_mock::requested_name;

    #[test]
    fn only_actual_named_exports_and_evaluation_certify_cjs_consumers() {
        assert_eq!(
            requested_name(Some(&ModulePart::Export("arbitrary".into())), false).unwrap(),
            Some("arbitrary".into())
        );
        assert_eq!(
            requested_name(Some(&ModulePart::Evaluation), false).unwrap(),
            None
        );
        for part in [
            None,
            Some(ModulePart::Exports),
            Some(ModulePart::Export("default".into())),
            Some(ModulePart::Export("then".into())),
            Some(ModulePart::Export("__proto__".into())),
            Some(ModulePart::Export("__esModule".into())),
            Some(ModulePart::Locals),
            Some(ModulePart::Facade),
        ] {
            assert!(requested_name(part.as_ref(), false).is_err(), "{part:?}");
        }
        assert!(requested_name(Some(&ModulePart::Export("arbitrary".into())), true).is_err());
    }
}
