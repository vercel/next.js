#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! A composed output (see `CodeComposition`) across persisted sessions with the GC enabled: the
//! written files reference other tasks' cells, so those must stay alive, restore correctly, and
//! keep producing the current bytes after edits and collections. It runs once for each way the
//! pieces can carry source maps (only a full one, only a shallow one, both, or one shared by both);
//! the code files emit no map, and every generated map is written separately.

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
    source_map::{SourceMapAsset, SourceMapGenerationOptions, SourceMapType, SourceMaps},
};

const BOTH: SourceMapGenerationOptions = SourceMapGenerationOptions {
    full: true,
    shallow: true,
    shallow_sources_content: true,
};

fn section_map(source: &str) -> Rope {
    Rope::from(format!(
        r#"{{"version":3,"sources":["{source}"],"names":[],"mappings":"AAAA"}}"#
    ))
}

/// Which source maps the pieces carry.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Variants {
    Full,
    Shallow,
    Both,
    Shared,
}

const ALL: [Variants; 4] = [
    Variants::Full,
    Variants::Shallow,
    Variants::Both,
    Variants::Shared,
];

impl Variants {
    fn options(self) -> SourceMapGenerationOptions {
        match self {
            Variants::Full => SourceMapGenerationOptions::default(),
            Variants::Shallow => SourceMapGenerationOptions {
                full: false,
                shallow: true,
                shallow_sources_content: true,
            },
            Variants::Both | Variants::Shared => BOTH,
        }
    }

    fn maps(self, text: &str) -> SourceMaps<Rope> {
        let full = section_map(&format!("{text}.full.js"));
        let shallow = section_map(&format!("{text}.shallow.js"));
        match self {
            Variants::Full => SourceMaps::Full(full),
            Variants::Shallow => SourceMaps::Shallow(shallow),
            Variants::Both => SourceMaps::Both { full, shallow },
            Variants::Shared => SourceMaps::Shared(section_map(&format!("{text}.shared.js"))),
        }
    }

    /// The generated maps, as (file suffix, type).
    fn types(self) -> &'static [(&'static str, SourceMapType)] {
        const FULL: (&str, SourceMapType) = ("full", SourceMapType::Full);
        const SHALLOW: (&str, SourceMapType) = ("shallow", SourceMapType::Shallow);
        match self {
            Variants::Full => &[FULL],
            Variants::Shallow => &[SHALLOW],
            Variants::Both | Variants::Shared => &[FULL, SHALLOW],
        }
    }

    /// The source name the `suffix` map of a piece with `text` refers to.
    fn source(self, text: &str, suffix: &str) -> String {
        match self {
            Variants::Shared => format!("{text}.shared.js"),
            _ => format!("{text}.{suffix}.js"),
        }
    }

    /// How many map cells a piece's one mapped section has: a shared map stays one.
    fn cells_per_piece(self) -> usize {
        match self {
            Variants::Both => 2,
            _ => 1,
        }
    }
}

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

/// The edited text, which of two identical pieces fills the second slot, and which source maps
/// the pieces carry (an index into [`ALL`]).
#[turbo_tasks::value]
struct Input {
    text: State<RcStr>,
    use_twin: State<bool>,
    variants: usize,
}

#[turbo_tasks::function(operation, root)]
fn input_operation(variants: usize) -> Vc<Input> {
    Input {
        text: State::new(rcstr!("one")),
        use_twin: State::new(false),
        variants,
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
    let input = input.await?;
    let variants = ALL[input.variants];
    let text = match slot {
        0 => input.text.get().clone(),
        _ => rcstr!("fixed"),
    };
    let mut code = CodeBuilder::new(false, variants.options());
    code += "(()=>{";
    code.push_source(&Rope::from(text.to_string()), variants.maps(&text))?;
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
    let mut builder = CodeCompositionBuilder::new(debug_id, ALL[input.await?.variants].options());
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

/// Like a chunk content's `content`, with no source map emitted. Without a debug id the file is
/// the composition's body itself; with one it's a rope nesting the body between the debug id
/// comments.
#[turbo_tasks::function]
async fn content(input: ResolvedVc<Input>, debug_id: bool) -> Result<Vc<FileContent>> {
    let file = composed(*input, debug_id)
        .await?
        .to_file_with_magic_comments(None, || -> Vc<SourceMapAsset> {
            unreachable!("no source map is emitted")
        })
        .await?;
    Ok(FileContent::Content(file).cell())
}

#[turbo_tasks::function]
async fn source_map(
    input: ResolvedVc<Input>,
    debug_id: bool,
    ty: SourceMapType,
) -> Result<Vc<FileContent>> {
    composed(*input, debug_id)
        .await?
        .source_map_file_content(ty)
        .await
}

#[turbo_tasks::function(operation, root)]
async fn write_operation(fs: ResolvedVc<DiskFileSystem>, input: ResolvedVc<Input>) -> Result<()> {
    let root = fs.root().owned().await?;
    let variants = ALL[input.await?.variants];
    for (name, debug_id) in [("direct", false), ("nested", true)] {
        root.join(&format!("{name}.js"))?
            .write(content(*input, debug_id))
            .await?;
        for &(suffix, ty) in variants.types() {
            root.join(&format!("{name}.{suffix}.map"))?
                .write(source_map(*input, debug_id, ty))
                .await?;
        }
    }
    Ok(())
}

#[turbo_tasks::function(operation, root)]
async fn extract_effects_operation(op: OperationVc<()>) -> Result<Vc<Effects>> {
    let _ = op.resolve().strongly_consistent().await?;
    Ok(take_effects(op).await?.cell())
}

/// How many map cells the edited piece's persisted cells hold.
#[turbo_tasks::function(operation, root)]
async fn piece_map_cells_operation(input: ResolvedVc<Input>) -> Result<Vc<usize>> {
    Ok(Vc::cell(
        piece(*input, 0).await?.section_map_cells().count(),
    ))
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

fn assert_files(out: &Path, text: &str, variants: Variants) {
    let body = format!("[(()=>{{{text}}}),(()=>{{fixed}})]");
    assert_eq!(read_to_string(out.join("direct.js")).unwrap(), body);
    let nested = read_to_string(out.join("nested.js")).unwrap();
    assert!(
        nested.contains(&format!("\n{body}\n\n//# debugId=")),
        "unexpected nested.js: {nested}"
    );
    assert!(!nested.contains("sourceMappingURL"), "no map is emitted");
    for name in ["direct", "nested"] {
        for suffix in ["full", "shallow"] {
            let path = out.join(format!("{name}.{suffix}.map"));
            if !variants.types().iter().any(|&(s, _)| s == suffix) {
                assert!(!path.exists(), "{variants:?} generates no {suffix} map");
                continue;
            }
            let map = read_to_string(path).unwrap();
            for source in [text, "fixed"] {
                for other in ["full", "shallow", "shared"] {
                    let other = format!("{source}.{other}.js");
                    assert_eq!(
                        map.contains(&other),
                        other == variants.source(source, suffix),
                        "{variants:?}: unexpected {name}.{suffix}.map: {map}"
                    );
                }
            }
        }
    }
}

/// Runs session `n` (see [`composed_files_survive_restores_edits_and_gc`]), then GC with the
/// session's write operation pinned as its root, and persists the session. Returns the number of
/// tasks the GC collected.
async fn session(cache: &Path, out: &Path, n: u32, variants_index: usize) -> usize {
    let variants = ALL[variants_index];
    let tt = open_tt(cache);
    let root: RcStr = out.to_str().unwrap().into();
    let check = out.to_path_buf();
    let pinned = turbo_tasks::run_once(tt.clone(), async move {
        let fs = disk_fs_operation(root)
            .resolve()
            .strongly_consistent()
            .await?;
        let input_op = input_operation(variants_index);
        let input = input_op.resolve().strongly_consistent().await?;
        let input_value = input_op.read_strongly_consistent().await?;
        let assert_files = |text| assert_files(&check, text, variants);
        let op = match n {
            // Cold.
            1 => {
                let op = write(fs, input).await?;
                assert_files("one");
                op
            }
            // Restored, then a content edit, then a structural change with equal bytes (the
            // second slot moves to another task, the old one becomes collectible).
            2 => {
                let _ = write(fs, input).await?;
                assert_files("one");

                input_value.text.set(rcstr!("a longer text"));
                let _ = write(fs, input).await?;
                assert_files("a longer text");

                input_value.use_twin.set(true);
                let op = write(fs, input).await?;
                assert_files("a longer text");
                op
            }
            // Restored after the collection, with the files deleted: writing them again reads
            // every referenced cell. Then edits keep working on restored state.
            3 => {
                input_value.text.set(rcstr!("a longer text"));
                input_value.use_twin.set(true);
                let op = write(fs, input).await?;
                assert_files("a longer text");

                input_value.text.set(rcstr!("two"));
                let op2 = write(fs, input).await?;
                assert_files("two");
                assert_eq!(op, op2);
                op
            }
            _ => unreachable!(),
        };
        // The restored (or cold) cells keep a shared map as one cell.
        assert_eq!(
            *piece_map_cells_operation(input)
                .read_strongly_consistent()
                .await?,
            variants.cells_per_piece(),
            "{variants:?}"
        );
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
    for variants in 0..ALL.len() {
        let cache = tempfile::tempdir().unwrap();
        let out = tempfile::tempdir().unwrap();

        session(cache.path(), out.path(), 1, variants).await;
        // The second slot's previous piece and its entry (slot 1) are no longer used.
        assert!(session(cache.path(), out.path(), 2, variants).await >= 2);
        for entry in std::fs::read_dir(out.path()).unwrap() {
            std::fs::remove_file(entry.unwrap().path()).unwrap();
        }
        session(cache.path(), out.path(), 3, variants).await;
    }
}
