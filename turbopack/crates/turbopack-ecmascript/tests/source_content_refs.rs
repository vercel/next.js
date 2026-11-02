#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! A module's source map references its source file's content in `sourcesContent` (instead of
//! embedding an escaped copy) only when the map was generated from exactly that content: an
//! ordinary file-backed module does, a source parsed from other bytes (the last successful source
//! of a failsafe parse, after an edit made the file unparsable) doesn't.

use std::path::PathBuf;

use anyhow::{Context, Result, bail};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, TurboTasks, Vc};
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
use turbo_tasks_fs::{CellRopePart, DiskFileSystem, FileSystem, FileSystemPath};
use turbopack_core::{
    compile_time_info::CompileTimeInfo,
    environment::{Environment, ExecutionEnvironment, NodeJsEnvironment},
    file_source::FileSource,
    ident::Layer,
    module::Module,
};
use turbopack_ecmascript::{
    EcmascriptAnalyzable, EcmascriptInputTransforms, EcmascriptModuleAsset,
    EcmascriptModuleContent, EcmascriptOptions, EcmascriptParsable, SpecifiedModuleType,
    parse::ParseResult,
};
use turbopack_test_utils::noop_asset_context::NoopAssetContext;

const VALID: &str = "export const value = \"valid \\\"text\\\"\";\n";
const INVALID: &str = "export const value = ;\n";

#[turbo_tasks::function(operation, root)]
fn fs_operation(root: RcStr) -> Vc<DiskFileSystem> {
    DiskFileSystem::new(rcstr!("project"), Vc::cell(root))
}

/// Changes the module's file on disk, and invalidates the reads of it (there's no watcher).
async fn edit(fs: ResolvedVc<DiskFileSystem>, root: &std::path::Path, content: &str) -> Result<()> {
    std::fs::write(root.join("module.js"), content)?;
    fs.await?.invalidate();
    Ok(())
}

#[turbo_tasks::function]
async fn module(
    fs: ResolvedVc<DiskFileSystem>,
    keep_last_successful_parse: bool,
) -> Result<Vc<EcmascriptModuleAsset>> {
    let path: FileSystemPath = fs.root().await?.join("module.js")?;
    let environment = Environment::new(ExecutionEnvironment::NodeJsLambda(
        NodeJsEnvironment::default().resolved_cell(),
    ));
    let compile_time_info = CompileTimeInfo::new(environment).to_resolved().await?;
    let asset_context = NoopAssetContext {
        compile_time_info,
        layer: Layer::new(rcstr!("test")),
    }
    .resolved_cell();
    Ok(EcmascriptModuleAsset::builder(
        ResolvedVc::upcast(FileSource::new(path).to_resolved().await?),
        ResolvedVc::upcast(asset_context),
        EcmascriptInputTransforms::empty().to_resolved().await?,
        EcmascriptOptions {
            keep_last_successful_parse,
            ..Default::default()
        }
        .resolved_cell(),
        compile_time_info,
        None,
    )
    .build())
}

/// The module's map `sourcesContent`, and whether it references the source file.
#[turbo_tasks::value(shared, serialization = "skip")]
struct MapContents {
    references_file: bool,
    map: RcStr,
}

#[turbo_tasks::function(operation, root)]
async fn map_contents_operation(fs: ResolvedVc<DiskFileSystem>) -> Result<Vc<MapContents>> {
    let content = module(*fs, false)
        .module_content_without_analysis(true)
        .await?;
    let map = content.source_map.as_ref().context("a source map")?;
    let contents = map.contents().context("the contents are a part")?;
    let references_file = contents
        .await?
        .parts()
        .any(|part| matches!(part, CellRopePart::EscapedFileContent(_)));
    let head = map.head().clone();
    let rope = map.to_section_map(head).await?.to_rope();
    Ok(MapContents {
        references_file,
        map: rope.to_str()?.into(),
    }
    .cell())
}

/// What a failsafe parse saw: the parsed text, whether it references the file content cell, and
/// the `sourcesContent` of the source map generated from it (and whether that references the
/// file).
#[turbo_tasks::value(shared, serialization = "skip")]
struct FailsafeParse {
    program_source: RcStr,
    references_file: bool,
    map: RcStr,
    map_references_file: bool,
}

#[turbo_tasks::function(operation, root)]
async fn failsafe_parse_operation(fs: ResolvedVc<DiskFileSystem>) -> Result<Vc<FailsafeParse>> {
    let module = module(*fs, true);
    let parsed = module.failsafe_parse();
    let ParseResult::Ok {
        program_source,
        source_content,
        ..
    } = &*parsed.await?
    else {
        bail!("the failsafe parse has no last successful source");
    };
    let content = EcmascriptModuleContent::new_without_analysis(
        parsed,
        module.ident(),
        SpecifiedModuleType::Automatic,
        true,
    )
    .await?;
    let map = content.source_map.as_ref().context("a source map")?;
    let contents = map.contents().context("the contents are a part")?;
    let map_references_file = contents
        .await?
        .parts()
        .any(|part| matches!(part, CellRopePart::EscapedFileContent(_)));
    let rope = map.to_section_map(map.head().clone()).await?.to_rope();
    Ok(FailsafeParse {
        program_source: program_source.to_str()?.into(),
        references_file: source_content.is_some(),
        map: rope.to_str()?.into(),
        map_references_file,
    }
    .cell())
}

fn temp_root(name: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "turbopack-source-content-refs-{name}-{}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).unwrap();
    root
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn module_maps_reference_their_source_file() {
    let root = temp_root("module");
    std::fs::write(root.join("module.js"), VALID).unwrap();
    TurboTasks::new(TurboTasksBackend::new(
        BackendOptions::default(),
        noop_backing_storage(),
    ))
    .run_once(async move {
        let fs = fs_operation(root.to_str().unwrap().into())
            .resolve()
            .strongly_consistent()
            .await?;
        let before = map_contents_operation(fs)
            .read_strongly_consistent()
            .await?;
        assert!(before.references_file);
        assert!(
            before.map.contains(&serde_json::to_string(VALID)?),
            "{}",
            before.map
        );

        // An edit is followed by the referenced content.
        let edited = "export const value = 2;\n";
        edit(fs, &root, edited).await?;
        let after = map_contents_operation(fs)
            .read_strongly_consistent()
            .await?;
        assert!(after.references_file);
        assert!(
            after.map.contains(&serde_json::to_string(edited)?),
            "{}",
            after.map
        );
        anyhow::Ok(())
    })
    .await
    .unwrap();
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn failsafe_parse_of_last_successful_source_does_not_reference_the_file() {
    let root = temp_root("failsafe");
    std::fs::write(root.join("module.js"), VALID).unwrap();
    TurboTasks::new(TurboTasksBackend::new(
        BackendOptions::default(),
        noop_backing_storage(),
    ))
    .run_once(async move {
        let fs = fs_operation(root.to_str().unwrap().into())
            .resolve()
            .strongly_consistent()
            .await?;
        let valid = failsafe_parse_operation(fs)
            .read_strongly_consistent()
            .await?;
        assert_eq!(valid.program_source.as_str(), VALID);
        assert!(valid.references_file);
        assert!(valid.map_references_file);

        // The file becomes unparsable: the failsafe parse falls back to the last successful
        // source. Its text isn't the file's content anymore, so it must not reference the file
        // (a map generated from it keeps an inline copy of the old text).
        edit(fs, &root, INVALID).await?;
        let invalid = failsafe_parse_operation(fs)
            .read_strongly_consistent()
            .await?;
        assert_eq!(invalid.program_source.as_str(), VALID);
        assert!(!invalid.references_file);
        // The map generated from it embeds the old text instead of referencing the file.
        assert!(!invalid.map_references_file);
        assert!(
            invalid.map.contains(&serde_json::to_string(VALID)?),
            "{}",
            invalid.map
        );
        assert!(!invalid.map.contains("value = ;"), "{}", invalid.map);
        anyhow::Ok(())
    })
    .await
    .unwrap();
}
