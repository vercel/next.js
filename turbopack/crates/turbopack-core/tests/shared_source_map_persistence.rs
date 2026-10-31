#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Module factories' source maps reference their module's map tail (see `SplitSourceMap`) across
//! persisted sessions: an edit to the tail only updates the composed map, without changing the
//! factories' map cells or the composition, before and after a restore.

use std::{
    fs::read_to_string,
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
};

use anyhow::{Result, bail};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    Effects, OperationVc, ReadRef, ResolvedVc, State, TurboTasks, Vc,
    read_strongly_consistent_and_apply_effects, take_effects,
};
use turbo_tasks_backend::{
    BackendOptions, BackingStorageOptions, GitVersionInfo, StorageMode, TurboTasksBackend,
};
use turbo_tasks_fs::{
    CellRope, CellRopePart, DiskFileSystem, File, FileContent, FileSystem, rope::Rope,
};
use turbopack_core::{
    code_builder::{CodeBuilder, CodeCells, CodeComposition, CodeCompositionBuilder, ComposedCode},
    source_map::structured::{SplitSourceMap, StructuredSourceMap},
};

fn open_tt(path: &Path) -> Arc<TurboTasks<TurboTasksBackend>> {
    TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            num_workers: Some(2),
            small_preallocation: true,
            storage_mode: Some(StorageMode::ReadWriteOnShutdown),
            ..Default::default()
        },
        turbo_tasks_backend::turbo_backing_storage(
            path,
            &GitVersionInfo {
                describe: "test-unversioned",
                dirty: false,
            },
            BackingStorageOptions {
                is_short_session: true,
                skip_compaction: true,
                ..Default::default()
            },
        )
        .unwrap()
        .0,
    ))
}

/// The module source's content, which only ends up in the map's tail (`sourcesContent`).
#[turbo_tasks::value]
struct Input {
    content: State<RcStr>,
}

#[turbo_tasks::function(operation, root)]
fn input_operation() -> Vc<Input> {
    Input {
        content: State::new(rcstr!("one")),
    }
    .cell()
}

#[turbo_tasks::function(operation, root)]
fn disk_fs_operation(root: RcStr) -> Vc<DiskFileSystem> {
    DiskFileSystem::new(rcstr!("out"), Vc::cell(root))
}

/// Like a module's content: the module's map, split, with its tail in this task's cell.
#[turbo_tasks::value(shared)]
struct ModuleMap {
    map: SplitSourceMap,
}

#[turbo_tasks::function]
async fn module_map(input: ResolvedVc<Input>) -> Result<Vc<ModuleMap>> {
    let content = input.await?.content.get().clone();
    let map = StructuredSourceMap::from_json(&Rope::from(format!(
        r#"{{"version":3,"sources":["module.js"],"sourcesContent":["{content}"],"names":[],"mappings":"AAAA"}}"#
    )))?;
    Ok(ModuleMap {
        map: SplitSourceMap::new(map),
    }
    .cell())
}

/// Like the module's factory for one chunking context: `sources` rewritten under `prefix`.
#[turbo_tasks::function]
async fn piece(input: ResolvedVc<Input>, prefix: RcStr) -> Result<Vc<CodeCells>> {
    let module = module_map(*input).await?;
    let head = module
        .map
        .head()
        .rewrite_sources(|source| Ok(Some(format!("{prefix}/{source}"))))?;
    let mut code = CodeBuilder::new(true, false);
    code += "(()=>{";
    code.push_source(
        &Rope::from("x()"),
        Some(module.map.to_section_map(head).await?),
    );
    code += "})";
    Ok(*code.build().resolved_code_cells())
}

/// What a chunk item's entry exposes to the composition: references only.
#[turbo_tasks::value(shared)]
struct PieceRef {
    cells: ResolvedVc<CodeCells>,
    code: ResolvedVc<Rope>,
}

#[turbo_tasks::function]
async fn piece_ref(input: ResolvedVc<Input>, prefix: RcStr) -> Result<Vc<PieceRef>> {
    let cells = piece(*input, prefix).to_resolved().await?;
    Ok(PieceRef {
        cells,
        code: cells.await?.code(),
    }
    .cell())
}

static COMPOSITION_EXECUTIONS: AtomicUsize = AtomicUsize::new(0);

/// The structure-only task, like a chunk content's `composition`: `[<a>,<b>]`.
#[turbo_tasks::function]
async fn composition(input: ResolvedVc<Input>) -> Result<Vc<CodeComposition>> {
    COMPOSITION_EXECUTIONS.fetch_add(1, Ordering::SeqCst);
    let mut builder = CodeCompositionBuilder::new(true, false);
    builder += "[";
    for (i, prefix) in [rcstr!("a"), rcstr!("b")].into_iter().enumerate() {
        if i > 0 {
            builder += ",";
        }
        let piece = piece_ref(*input, prefix).await?;
        builder.push_code_cells(piece.cells, piece.code);
    }
    builder += "]";
    Ok(builder.build().cell())
}

#[turbo_tasks::function]
async fn composed(input: ResolvedVc<Input>) -> Result<Vc<ComposedCode>> {
    let composition = composition(*input).to_resolved().await?;
    let code = composition.await?.build_code().await?;
    Ok(ComposedCode::new(code, Some(composition)).cell())
}

#[turbo_tasks::function]
async fn code_content(input: ResolvedVc<Input>) -> Result<Vc<FileContent>> {
    let code = composed(*input).await?.code().await?;
    Ok(FileContent::Content(File::from(code.source_code().clone())).cell())
}

#[turbo_tasks::function]
async fn map_content(input: ResolvedVc<Input>) -> Result<Vc<FileContent>> {
    composed(*input).await?.source_map_file_content().await
}

#[turbo_tasks::function(operation, root)]
async fn write_operation(fs: ResolvedVc<DiskFileSystem>, input: ResolvedVc<Input>) -> Result<()> {
    let root = fs.root().owned().await?;
    root.join("out.js")?.write(code_content(*input)).await?;
    root.join("out.js.map")?.write(map_content(*input)).await?;
    Ok(())
}

#[turbo_tasks::function(operation, root)]
async fn extract_effects_operation(op: OperationVc<()>) -> Result<Vc<Effects>> {
    let _ = op.resolve().strongly_consistent().await?;
    Ok(take_effects(op).await?.cell())
}

async fn write(fs: ResolvedVc<DiskFileSystem>, input: ResolvedVc<Input>) -> Result<()> {
    let op = extract_effects_operation(write_operation(fs, input));
    read_strongly_consistent_and_apply_effects(op, |e| e).await?;
    Ok(())
}

#[turbo_tasks::value(shared, serialization = "skip")]
struct PieceMaps {
    maps: Vec<ReadRef<CellRope>>,
}

/// The factories' section map cells, and checks that each references the module's tail.
#[turbo_tasks::function(operation, root)]
async fn piece_maps_operation(input: ResolvedVc<Input>) -> Result<Vc<PieceMaps>> {
    let tail = module_map(*input).await?.map.tail();
    let mut maps = Vec::new();
    for prefix in [rcstr!("a"), rcstr!("b")] {
        let cells = piece(*input, prefix).await?;
        let map = cells
            .section_map_cells()
            .next()
            .expect("a factory has a section map")
            .await?;
        let referenced = map
            .parts()
            .filter_map(|part| match part {
                CellRopePart::Cell { cell, skip: None } => Some(cell),
                _ => None,
            })
            .collect::<Vec<_>>();
        if referenced != [tail] {
            bail!("the factory's map doesn't reference the module's tail");
        }
        maps.push(map);
    }
    Ok(PieceMaps { maps }.cell())
}

async fn piece_maps(input: ResolvedVc<Input>) -> Result<Vec<ReadRef<CellRope>>> {
    Ok(piece_maps_operation(input)
        .read_strongly_consistent()
        .await?
        .maps
        .clone())
}

fn assert_files(out: &Path, content: &str) {
    assert_eq!(
        read_to_string(out.join("out.js")).unwrap(),
        "[(()=>{x()}),(()=>{x()})]"
    );
    let map = read_to_string(out.join("out.js.map")).unwrap();
    for prefix in ["a", "b"] {
        assert!(
            map.contains(&format!(
                r#""sources":["{prefix}/module.js"],"sourcesContent":["{content}"]"#
            )),
            "unexpected out.js.map: {map}"
        );
    }
}

/// Runs session `n` (see [`factory_maps_follow_module_tail_edits_across_restores`]) and persists
/// it.
async fn session(cache: &Path, out: &Path, n: u32) {
    let tt = open_tt(cache);
    let root: RcStr = out.to_str().unwrap().into();
    let check = out.to_path_buf();
    turbo_tasks::run_once(tt.clone(), async move {
        let fs = disk_fs_operation(root)
            .resolve()
            .strongly_consistent()
            .await?;
        let input_op = input_operation();
        let input = input_op.resolve().strongly_consistent().await?;
        let input_value = input_op.read_strongly_consistent().await?;
        match n {
            // Cold.
            1 => {
                write(fs, input).await?;
                assert_files(&check, "one");
                piece_maps(input).await?;
            }
            // Restored, then an edit to the map's tail only.
            2 => {
                write(fs, input).await?;
                assert_files(&check, "one");
                let maps = piece_maps(input).await?;
                let executions = COMPOSITION_EXECUTIONS.load(Ordering::SeqCst);

                input_value.content.set(rcstr!("two"));
                write(fs, input).await?;
                assert_files(&check, "two");
                assert_eq!(
                    COMPOSITION_EXECUTIONS.load(Ordering::SeqCst),
                    executions,
                    "the composition must not re-execute"
                );
                assert_eq!(
                    piece_maps(input).await?,
                    maps,
                    "the factories' map cells must not change"
                );
            }
            // Restored with the files deleted: writing them again reads the restored cells,
            // including the edited tail. Another tail-only edit still leaves the restored
            // structure in place.
            3 => {
                input_value.content.set(rcstr!("two"));
                write(fs, input).await?;
                assert_files(&check, "two");
                let maps = piece_maps(input).await?;
                let executions = COMPOSITION_EXECUTIONS.load(Ordering::SeqCst);

                input_value.content.set(rcstr!("three"));
                write(fs, input).await?;
                assert_files(&check, "three");
                assert_eq!(
                    COMPOSITION_EXECUTIONS.load(Ordering::SeqCst),
                    executions,
                    "the restored composition must not re-execute"
                );
                assert_eq!(
                    piece_maps(input).await?,
                    maps,
                    "the restored factories' map cells must not change"
                );
            }
            _ => unreachable!(),
        }
        anyhow::Ok(())
    })
    .await
    .unwrap();
    tt.stop_and_wait().await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn factory_maps_follow_module_tail_edits_across_restores() {
    let cache = tempfile::tempdir().unwrap();
    let out = tempfile::tempdir().unwrap();

    session(cache.path(), out.path(), 1).await;
    session(cache.path(), out.path(), 2).await;
    std::fs::remove_file(out.path().join("out.js")).unwrap();
    std::fs::remove_file(out.path().join("out.js.map")).unwrap();
    session(cache.path(), out.path(), 3).await;
}
