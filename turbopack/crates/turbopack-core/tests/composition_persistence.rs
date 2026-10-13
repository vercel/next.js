#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! A composed output (see `CodeComposition`) across persisted sessions with the GC enabled: the
//! written files reference other tasks' cells, so those must stay alive, restore correctly, and
//! keep producing the current bytes after edits and collections.

use std::{fs::read_to_string, path::Path, sync::Arc};

use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    Effects, GcRoot, OperationVc, ResolvedVc, State, TurboTasks, Vc,
    read_strongly_consistent_and_apply_effects, take_effects,
};
use turbo_tasks_backend::{
    BackendOptions, BackingStorageOptions, EvictionMode, GitVersionInfo, StorageMode,
    TurboTasksBackend,
};
use turbo_tasks_fs::{DiskFileSystem, FileContent, FileSystem, rope::Rope};
use turbopack_core::{
    code_builder::{CodeBuilder, CodeCells, CodeComposition, CodeCompositionBuilder, ComposedCode},
    source_map::SourceMapAsset,
};

fn open_tt(path: &Path) -> Arc<TurboTasks<TurboTasksBackend>> {
    TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            num_workers: Some(2),
            small_preallocation: true,
            storage_mode: Some(StorageMode::ReadWriteOnShutdown),
            eviction_mode: EvictionMode::Full,
            gc: Some(true),
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

/// The edited text, and which of two identical pieces fills the second slot.
#[turbo_tasks::value]
struct Input {
    text: State<RcStr>,
    use_twin: State<bool>,
}

#[turbo_tasks::function(operation, root)]
fn input_operation() -> Vc<Input> {
    Input {
        text: State::new(rcstr!("one")),
        use_twin: State::new(false),
    }
    .cell()
}

#[turbo_tasks::function(operation, root)]
fn disk_fs_operation(root: RcStr) -> Vc<DiskFileSystem> {
    DiskFileSystem::new(rcstr!("out"), Vc::cell(root))
}

/// A module factory. Slot 0 is the edited one; slots 1 and 2 are distinct tasks with identical
/// bytes.
#[turbo_tasks::function]
async fn piece(input: ResolvedVc<Input>, slot: u32) -> Result<Vc<CodeCells>> {
    let text = match slot {
        0 => input.await?.text.get().clone(),
        _ => rcstr!("fixed"),
    };
    let mut code = CodeBuilder::new(false, false);
    code += "(()=>{";
    code.push_source(&Rope::from(text.to_string()), None::<Rope>);
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
async fn piece_ref(input: ResolvedVc<Input>, slot: u32) -> Result<Vc<PieceRef>> {
    let cells = piece(*input, slot).to_resolved().await?;
    Ok(PieceRef {
        cells,
        code: cells.await?.code(),
    }
    .cell())
}

/// The structure-only task, like a chunk content's `composition`.
#[turbo_tasks::function]
async fn composition(input: ResolvedVc<Input>, debug_id: bool) -> Result<Vc<CodeComposition>> {
    let second = if *input.await?.use_twin.get() { 2 } else { 1 };
    let mut builder = CodeCompositionBuilder::new(false, debug_id);
    builder += "[";
    for slot in [0, second] {
        if slot != 0 {
            builder += ",";
        }
        let piece = piece_ref(*input, slot).await?;
        builder.push_code_cells(piece.cells, piece.code);
    }
    builder += "]";
    Ok(builder.build().cell())
}

#[turbo_tasks::function]
async fn composed(input: ResolvedVc<Input>, debug_id: bool) -> Result<Vc<ComposedCode>> {
    let composition = composition(*input, debug_id).to_resolved().await?;
    let code = composition.await?.build_code().await?;
    Ok(ComposedCode::new(code, Some(composition)).cell())
}

/// Like a chunk content's `content`. Without a debug id the file is the composition's body
/// itself; with one it's a rope nesting the body between the debug id comments.
#[turbo_tasks::function]
async fn content(input: ResolvedVc<Input>, debug_id: bool) -> Result<Vc<FileContent>> {
    let file = composed(*input, debug_id)
        .await?
        .to_file_with_magic_comments(|| -> Vc<SourceMapAsset> {
            unreachable!("the pieces have no source maps")
        })
        .await?;
    Ok(FileContent::Content(file).cell())
}

#[turbo_tasks::function(operation, root)]
async fn write_operation(fs: ResolvedVc<DiskFileSystem>, input: ResolvedVc<Input>) -> Result<()> {
    let root = fs.root().owned().await?;
    for (name, debug_id) in [("direct.js", false), ("nested.js", true)] {
        root.join(name)?.write(content(*input, debug_id)).await?;
    }
    Ok(())
}

#[turbo_tasks::function(operation, root)]
async fn extract_effects_operation(op: OperationVc<()>) -> Result<Vc<Effects>> {
    let _ = op.resolve().strongly_consistent().await?;
    Ok(take_effects(op).await?.cell())
}

/// Writes both files, and returns the operation so a session can pin it as its GC root.
async fn write(
    fs: ResolvedVc<DiskFileSystem>,
    input: ResolvedVc<Input>,
) -> Result<OperationVc<Effects>> {
    let op = extract_effects_operation(write_operation(fs, input));
    read_strongly_consistent_and_apply_effects(op, |e| e).await?;
    Ok(op)
}

fn assert_files(out: &Path, text: &str) {
    let body = format!("[(()=>{{{text}}}),(()=>{{fixed}})]");
    assert_eq!(read_to_string(out.join("direct.js")).unwrap(), body);
    let nested = read_to_string(out.join("nested.js")).unwrap();
    assert!(
        nested.contains(&format!("\n{body}\n\n//# debugId=")),
        "unexpected nested.js: {nested}"
    );
}

/// Runs session `n` (see [`composed_files_survive_restores_edits_and_gc`]), then GC with the
/// session's write operation pinned as its root, and persists the session. Returns the number of
/// tasks the GC collected.
async fn session(cache: &Path, out: &Path, n: u32) -> usize {
    let tt = open_tt(cache);
    let root: RcStr = out.to_str().unwrap().into();
    let check = out.to_path_buf();
    let pinned = turbo_tasks::run_once(tt.clone(), async move {
        let fs = disk_fs_operation(root)
            .resolve()
            .strongly_consistent()
            .await?;
        let input_op = input_operation();
        let input = input_op.resolve().strongly_consistent().await?;
        let input_value = input_op.read_strongly_consistent().await?;
        let op = match n {
            // Cold.
            1 => {
                let op = write(fs, input).await?;
                assert_files(&check, "one");
                op
            }
            // Restored, then a content edit, then a structural change with equal bytes (the
            // second slot moves to another task, the old one becomes collectible).
            2 => {
                let _ = write(fs, input).await?;
                assert_files(&check, "one");

                input_value.text.set(rcstr!("a longer text"));
                let _ = write(fs, input).await?;
                assert_files(&check, "a longer text");

                input_value.use_twin.set(true);
                let op = write(fs, input).await?;
                assert_files(&check, "a longer text");
                op
            }
            // Restored after the collection, with the files deleted: writing them again reads
            // every referenced cell. Then edits keep working on restored state.
            3 => {
                input_value.text.set(rcstr!("a longer text"));
                input_value.use_twin.set(true);
                let op = write(fs, input).await?;
                assert_files(&check, "a longer text");

                input_value.text.set(rcstr!("two"));
                let op2 = write(fs, input).await?;
                assert_files(&check, "two");
                assert_eq!(op, op2);
                op
            }
            _ => unreachable!(),
        };
        anyhow::Ok(op)
    })
    .await
    .unwrap();
    let pin = GcRoot::pin(tt.clone(), pinned);
    let mut collected = 0;
    for _ in 0..3 {
        collected += tt.backend().gc_for_testing(&tt);
    }
    tt.backend().snapshot_and_evict_for_testing(&tt);
    drop(pin);
    tt.stop_and_wait().await;
    collected
}

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn composed_files_survive_restores_edits_and_gc() {
    let cache = tempfile::tempdir().unwrap();
    let out = tempfile::tempdir().unwrap();

    session(cache.path(), out.path(), 1).await;
    // The second slot's previous piece and its entry (slot 1) are no longer used.
    assert!(session(cache.path(), out.path(), 2).await >= 2);
    std::fs::remove_file(out.path().join("direct.js")).unwrap();
    std::fs::remove_file(out.path().join("nested.js")).unwrap();
    session(cache.path(), out.path(), 3).await;
}
