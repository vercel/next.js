use std::io::Write;

use anyhow::{bail, Result};
use indoc::writedoc;
use next_core::{
    app_structure::LoaderTreeVc,
    loader_tree::{LoaderTreeModule, ServerComponentTransition},
    mode::NextMode,
    next_server_component::NextServerComponentTransitionVc,
    UnsupportedDynamicMetadataIssue,
};
use turbo_tasks::{TryJoinIterExt, Value, ValueToString};
use turbopack_binding::{
    turbo::tasks_fs::{rope::RopeBuilder, File, FileSystemPathVc},
    turbopack::{
        core::{
            context::AssetContext,
            reference_type::{InnerAssetsVc, ReferenceType},
            virtual_source::VirtualSourceVc,
        },
        ecmascript::{chunk::EcmascriptChunkPlaceableVc, utils::StringifyJs},
        turbopack::ModuleAssetContextVc,
    },
};

use super::app_entries::{AppEntry, AppEntryVc};

/// Computes the entry for a Next.js app page.
pub(super) async fn get_app_page_entry(
    context: ModuleAssetContextVc,
    loader_tree: LoaderTreeVc,
    app_dir: FileSystemPathVc,
    pathname: &str,
    project_root: FileSystemPathVc,
) -> Result<AppEntryVc> {
    let server_component_transition = NextServerComponentTransitionVc::new().into();

    let loader_tree = LoaderTreeModule::build(
        loader_tree,
        context,
        ServerComponentTransition::Transition(server_component_transition),
        NextMode::Build,
    )
    .await?;

    let LoaderTreeModule {
        inner_assets,
        imports,
        loader_tree_code,
        unsupported_metadata,
        pages,
    } = loader_tree;

    if !unsupported_metadata.is_empty() {
        UnsupportedDynamicMetadataIssue {
            app_dir,
            files: unsupported_metadata,
        }
        .cell()
        .as_issue()
        .emit();
    }

    let mut result = RopeBuilder::default();

    for import in imports {
        writeln!(result, "{import}")?;
    }

    let pages = pages.iter().map(|page| page.to_string()).try_join().await?;

    // NOTE(alexkirsz) Keep in sync with
    // next.js/packages/next/src/build/webpack/loaders/next-app-loader.ts
    // TODO(alexkirsz) Support custom global error.
    let original_name = get_original_page_name(pathname);

    writedoc!(
        result,
        r#"
            export const tree = {loader_tree_code}
            export const pages = {pages}
            export {{ default as GlobalError }} from 'next/dist/client/components/error-boundary'
            export const originalPathname = {pathname}
            export const __next_app__ = {{
                require: __turbopack_require__,
                loadChunk: __turbopack_load__,
            }};

            export * from 'next/dist/server/app-render/entry-base'
        "#,
        pages = StringifyJs(&pages),
        pathname = StringifyJs(&original_name),
    )?;

    let file = File::from(result.build());
    let source =
        // TODO(alexkirsz) Figure out how to name this virtual asset.
        VirtualSourceVc::new(project_root.join("todo.tsx"), file.into());

    let rsc_entry = context.process(
        source.into(),
        Value::new(ReferenceType::Internal(InnerAssetsVc::cell(inner_assets))),
    );

    let Some(rsc_entry) = EcmascriptChunkPlaceableVc::resolve_from(rsc_entry).await? else {
        bail!("expected an ECMAScript chunk placeable asset");
    };

    Ok(AppEntry {
        pathname: pathname.to_string(),
        original_name,
        rsc_entry,
    }
    .cell())
}

// TODO(alexkirsz) This shouldn't be necessary. The loader tree should keep
// track of this instead.
fn get_original_page_name(pathname: &str) -> String {
    match pathname {
        "/" => "/page".to_string(),
        "/_not-found" => "/_not-found".to_string(),
        _ => format!("{}/page", pathname),
    }
}
