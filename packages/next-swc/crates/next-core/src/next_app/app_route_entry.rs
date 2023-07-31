use std::io::Write;

use anyhow::{bail, Result};
use indexmap::indexmap;
use indoc::writedoc;
use turbo_tasks::{Value, ValueToString, Vc};
use turbopack_binding::{
    turbo::tasks_fs::{rope::RopeBuilder, File, FileSystemPath},
    turbopack::{
        core::{
            asset::AssetContent,
            context::AssetContext,
            reference_type::{EntryReferenceSubType, ReferenceType},
            source::Source,
            virtual_source::VirtualSource,
        },
        ecmascript::{chunk::EcmascriptChunkPlaceable, utils::StringifyJs},
        turbopack::ModuleAssetContext,
    },
};

use crate::{
    next_app::AppEntry,
    parse_segment_config_from_source,
    util::{load_next_js_template, virtual_next_js_template_path, NextRuntime},
};

/// Computes the entry for a Next.js app route.
#[turbo_tasks::function]
pub async fn get_app_route_entry(
    nodejs_context: Vc<ModuleAssetContext>,
    edge_context: Vc<ModuleAssetContext>,
    source: Vc<Box<dyn Source>>,
    pathname: String,
    original_name: String,
    project_root: Vc<FileSystemPath>,
) -> Result<Vc<AppEntry>> {
    let userland_module = nodejs_context.process(
        source,
        Value::new(ReferenceType::Entry(EntryReferenceSubType::AppRoute)),
    );
    let config = parse_segment_config_from_source(userland_module, source);
    let is_edge = matches!(config.await?.runtime, Some(NextRuntime::Edge));
    let context = if is_edge {
        edge_context
    } else {
        nodejs_context
    };

    let mut result = RopeBuilder::default();

    let original_page_name = get_original_route_name(&original_name);
    let path = source.ident().path();

    let template_file = "build/webpack/loaders/next-route-loader/templates/app-route.js";

    // Load the file from the next.js codebase.
    let file = load_next_js_template(project_root, template_file.to_string()).await?;

    let mut file = file
        .to_str()?
        .replace(
            "\"VAR_DEFINITION_PAGE\"",
            &StringifyJs(&original_name).to_string(),
        )
        .replace(
            "\"VAR_DEFINITION_PATHNAME\"",
            &StringifyJs(&pathname).to_string(),
        )
        .replace(
            "\"VAR_DEFINITION_FILENAME\"",
            &StringifyJs(&path.file_stem().await?.as_ref().unwrap().clone()).to_string(),
        )
        // TODO(alexkirsz) Is this necessary?
        .replace(
            "\"VAR_DEFINITION_BUNDLE_PATH\"",
            &StringifyJs("").to_string(),
        )
        .replace(
            "\"VAR_ORIGINAL_PATHNAME\"",
            &StringifyJs(&original_page_name).to_string(),
        )
        .replace(
            "\"VAR_RESOLVED_PAGE_PATH\"",
            &StringifyJs(&path.to_string().await?).to_string(),
        )
        .replace(
            "// INJECT:nextConfigOutput",
            "const nextConfigOutput = \"\"",
        );

    // Ensure that the last line is a newline.
    if !file.ends_with('\n') {
        file.push('\n');
    }

    result.concat(&file.into());

    let file = File::from(result.build());

    let template_path = virtual_next_js_template_path(project_root, template_file.to_string());

    let virtual_source = VirtualSource::new(template_path, AssetContent::file(file.into()));

    let inner_assets = indexmap! {
        "VAR_USERLAND".to_string() => userland_module
    };

    let mut rsc_entry = context.process(
        Vc::upcast(virtual_source),
        Value::new(ReferenceType::Internal(Vc::cell(inner_assets))),
    );

    if is_edge {
        let mut source = RopeBuilder::default();
        writedoc!(
            source,
            r#"
                import {{ EdgeRouteModuleWrapper }} from 'next/dist/esm/server/web/edge-route-module-wrapper'
                import * as module from "MODULE"

                export const ComponentMod = module

                console.log("loaded edge route module")
                self._ENTRIES ||= {{}}
                self._ENTRIES.middleware_ = {{
                    ComponentMod: module,
                    default: EdgeRouteModuleWrapper.wrap(module.routeModule),
                }}
            "#
        )?;
        let file = File::from(source.build());
        // TODO(alexkirsz) Figure out how to name this virtual asset.
        let virtual_source = VirtualSource::new(
            project_root.join("edge-wrapper.js".to_string()),
            AssetContent::file(file.into()),
        );
        let inner_assets = indexmap! {
            "MODULE".to_string() => rsc_entry
        };

        rsc_entry = context.process(
            Vc::upcast(virtual_source),
            Value::new(ReferenceType::Internal(Vc::cell(inner_assets))),
        );
    }

    let Some(rsc_entry) =
        Vc::try_resolve_downcast::<Box<dyn EcmascriptChunkPlaceable>>(rsc_entry).await?
    else {
        bail!("expected an ECMAScript chunk placeable module");
    };

    Ok(AppEntry {
        pathname: pathname.to_string(),
        original_name: original_page_name,
        rsc_entry,
        config,
    }
    .cell())
}

fn get_original_route_name(pathname: &str) -> String {
    match pathname {
        "/" => "/route".to_string(),
        _ => format!("{}/route", pathname),
    }
}
