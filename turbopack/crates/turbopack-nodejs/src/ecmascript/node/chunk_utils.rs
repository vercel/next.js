use std::io::Write;

use anyhow::{Result, bail};
use indoc::writedoc;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    chunk::{ChunkingContext, EvaluatableAssets, ModuleChunkItemIdExt},
    code_builder::CodeBuilder,
    output::{OutputAsset, OutputAssets},
};
use turbopack_ecmascript::{chunk::EcmascriptChunkPlaceable, utils::StringifyJs};

use crate::NodeJsChunkingContext;

/// Generates the common code for Node.js chunks that load and evaluate modules.
/// This includes:
/// - Loading the Turbopack runtime
/// - Loading dependency chunks
/// - Instantiating evaluatable assets
///
/// This is shared between entry chunks (which add a final export) and evaluate chunks
/// (which are used for workers and don't export).
pub(super) async fn generate_node_chunk_bootstrap(
    code: &mut CodeBuilder,
    chunking_context: ResolvedVc<NodeJsChunkingContext>,
    chunk_path: &FileSystemPath,
    runtime_path: &FileSystemPath,
    other_chunks: ResolvedVc<OutputAssets>,
    evaluatable_assets: ResolvedVc<EvaluatableAssets>,
) -> Result<()> {
    let output_root = chunking_context.output_root().owned().await?;
    let chunk_directory = chunk_path.parent();

    let runtime_relative_path =
        if let Some(path) = chunk_directory.get_relative_path_to(runtime_path) {
            path
        } else {
            bail!(
                "cannot find a relative path from the chunk ({chunk_path}) to the runtime chunk \
                 ({runtime_path})",
            );
        };

    let chunk_public_path = if let Some(path) = output_root.get_path_to(chunk_path) {
        path
    } else {
        bail!("chunk path ({chunk_path}) is not in output root ({output_root})");
    };

    // Load the runtime
    writedoc!(
        code,
        r#"
            var R=require({})({})
        "#,
        StringifyJs(&*runtime_relative_path),
        StringifyJs(chunk_public_path),
    )?;

    // Load all other chunks (dependencies)
    let other_chunks = other_chunks.await?;
    for other_chunk in &*other_chunks {
        let other_chunk_path = &*other_chunk.path().await?;
        if let Some(other_chunk_public_path) = output_root.get_path_to(other_chunk_path) {
            writedoc!(
                code,
                r#"
                    R.c({})
                "#,
                StringifyJs(&other_chunk_public_path)
            )?;
        }
    }

    // Instantiate all evaluatable assets
    let evaluatable_assets = evaluatable_assets.await?;
    for evaluatable_asset in &*evaluatable_assets {
        if let Some(placeable) =
            ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(*evaluatable_asset)
        {
            let runtime_module_id = placeable
                .chunk_item_id(Vc::upcast(*chunking_context))
                .await?;

            writedoc!(
                code,
                r#"
                    R.m({})
                "#,
                StringifyJs(&*runtime_module_id),
            )?;
        }
    }

    Ok(())
}
