#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)] // tokio macro-generated code doesn't respect this

//! Module factories' source maps reference their module's map tail (see `SplitSourceMap`) across
//! persisted sessions: an edit to the tail only updates the composed map, without changing the
//! factories' map cells or the composition, before and after a restore. It runs once for each way
//! the module can carry source maps: only a full one, only a shallow one, both (distinct, with
//! their own tails), or one shared by both (one tail, referenced once per factory).
//!
//! The module maps' `sourcesContent` references the module's source file instead of holding an
//! escaped copy of its text. The file's content (and its escaped form) is only hashed in the
//! persistent cache, so after a restore the escaped text is recomputed from the file.

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
    source_map::{
        SourceMapGenerationOptions, SourceMapType, SourceMaps,
        structured::{SplitSourceMap, StructuredSourceMap},
    },
};

const BOTH: SourceMapGenerationOptions = SourceMapGenerationOptions {
    full: true,
    shallow: true,
    shallow_sources_content: true,
};

/// Which source maps the module carries.
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

    /// The generated maps: their type, the file they're written to, and the name of the source
    /// they point at.
    fn types(self) -> &'static [(SourceMapType, &'static str, &'static str)] {
        const FULL: (SourceMapType, &str, &str) = (SourceMapType::Full, "full", "module.ts");
        const SHALLOW: (SourceMapType, &str, &str) =
            (SourceMapType::Shallow, "shallow", "module.js");
        match self {
            Variants::Full => &[FULL],
            Variants::Shallow => &[SHALLOW],
            Variants::Both => &[FULL, SHALLOW],
            Variants::Shared => &[
                (SourceMapType::Full, "full", "module.shared.js"),
                (SourceMapType::Shallow, "shallow", "module.shared.js"),
            ],
        }
    }
}

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

/// The module source's content, which only ends up in the map's tail (`sourcesContent`), and which
/// source maps the module carries (an index into [`ALL`]).
#[turbo_tasks::value]
struct Input {
    content: State<RcStr>,
    variants: usize,
}

#[turbo_tasks::function(operation, root)]
fn input_operation(variants: usize) -> Vc<Input> {
    Input {
        content: State::new(rcstr!("one")),
        variants,
    }
    .cell()
}

#[turbo_tasks::function(operation, root)]
fn disk_fs_operation(root: RcStr) -> Vc<DiskFileSystem> {
    DiskFileSystem::new(rcstr!("out"), Vc::cell(root))
}

/// Like a module's content: the module's maps, split, with their tails in this task's cells and
/// their `sourcesContent` referencing the source file.
#[turbo_tasks::value(shared)]
struct ModuleMap {
    maps: SourceMaps<SplitSourceMap>,
}

/// The module's source file.
#[turbo_tasks::function]
async fn source_file(input: ResolvedVc<Input>) -> Result<Vc<FileContent>> {
    let content = input.await?.content.get().clone();
    Ok(FileContent::Content(File::from(content.to_string())).cell())
}

#[turbo_tasks::function]
async fn module_map(input: ResolvedVc<Input>) -> Result<Vc<ModuleMap>> {
    let input_value = input.await?;
    let content = input_value.content.get().clone();
    let variants = ALL[input_value.variants];
    let file = source_file(*input).to_resolved().await?;
    let map = |source: &str| -> Result<SplitSourceMap> {
        let map = swc_sourcemap::SourceMap::from_slice(
            serde_json::to_string(&serde_json::json!({
                "version": 3,
                "sources": [source],
                "sourcesContent": [content],
                "names": [],
                "mappings": "AAAA",
            }))?
            .as_bytes(),
        )?;
        let (map, refs) = StructuredSourceMap::from_swc_map_with_sources(
            map,
            &[(Rope::from(content.to_string()), file)],
        )?;
        if refs != [Some(file)] {
            bail!("the content isn't matched to the source file");
        }
        Ok(SplitSourceMap::new_with_source_contents(map, &refs))
    };
    let types = variants.types();
    Ok(ModuleMap {
        maps: match variants {
            Variants::Full => SourceMaps::Full(map(types[0].2)?),
            Variants::Shallow => SourceMaps::Shallow(map(types[0].2)?),
            Variants::Both => SourceMaps::Both {
                full: map(types[0].2)?,
                shallow: map(types[1].2)?,
            },
            Variants::Shared => SourceMaps::Shared(map(types[0].2)?),
        },
    }
    .cell())
}

/// Like the module's factory for one chunking context: `sources` rewritten under `prefix`.
#[turbo_tasks::function]
async fn piece(input: ResolvedVc<Input>, prefix: RcStr) -> Result<Vc<CodeCells>> {
    let module = module_map(*input).await?;
    let maps = module
        .maps
        .clone()
        .try_map_async(|map| {
            let prefix = prefix.clone();
            async move {
                let head = map
                    .head()
                    .rewrite_sources(|source| Ok(Some(format!("{prefix}/{source}"))))?;
                map.to_section_map(head).await
            }
        })
        .await?;
    let mut code = CodeBuilder::new(false, ALL[input.await?.variants].options());
    code += "(()=>{";
    code.push_source(&Rope::from("x()"), maps)?;
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
    let mut builder = CodeCompositionBuilder::new(false, ALL[input.await?.variants].options());
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
async fn map_content(input: ResolvedVc<Input>, ty: SourceMapType) -> Result<Vc<FileContent>> {
    composed(*input).await?.source_map_file_content(ty).await
}

#[turbo_tasks::function(operation, root)]
async fn write_operation(fs: ResolvedVc<DiskFileSystem>, input: ResolvedVc<Input>) -> Result<()> {
    let root = fs.root().owned().await?;
    root.join("out.js")?.write(code_content(*input)).await?;
    for &(ty, file, _) in ALL[input.await?.variants].types() {
        root.join(&format!("{file}.map"))?
            .write(map_content(*input, ty))
            .await?;
    }
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

/// The factories' section map cells, and checks that each references the module's tail of its
/// variant (a shared map's single tail once).
#[turbo_tasks::function(operation, root)]
async fn piece_maps_operation(input: ResolvedVc<Input>) -> Result<Vc<PieceMaps>> {
    let module = module_map(*input).await?;
    let module_maps = match &module.maps {
        SourceMaps::None => bail!("the module has a map"),
        SourceMaps::Full(map) | SourceMaps::Shallow(map) | SourceMaps::Shared(map) => vec![map],
        SourceMaps::Both { full, shallow } => vec![full, shallow],
    };
    let file = source_file(*input).to_resolved().await?;
    let references_file = |rope: &CellRope| {
        rope.parts()
            .any(|part| matches!(part, CellRopePart::EscapedFileContent(f) if f == file))
    };
    let mut tails = Vec::new();
    for map in module_maps {
        let contents = map.contents().expect("the contents are a part");
        if !references_file(&*contents.await?) {
            bail!("the module's contents don't reference the source file");
        }
        // The factories copy the contents' segments (the file reference) and reference the rest.
        tails.push(map.rest());
    }
    let mut maps = Vec::new();
    for prefix in [rcstr!("a"), rcstr!("b")] {
        let cells = piece(*input, prefix).await?;
        let section_maps = cells.section_map_cells().collect::<Vec<_>>();
        if section_maps.len() != tails.len() {
            bail!("a factory has one section map per distinct module map");
        }
        for (map, tail) in section_maps.into_iter().zip(&tails) {
            let map = map.await?;
            let referenced = map
                .parts()
                .filter_map(|part| match part {
                    CellRopePart::Nested(rope) => Some(rope),
                    _ => None,
                })
                .collect::<Vec<_>>();
            if referenced != [*tail] || !references_file(&map) {
                bail!("the factory's map doesn't reference the module's tail of its variant");
            }
            maps.push(map);
        }
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

fn assert_files(out: &Path, content: &str, variants: Variants) {
    assert_eq!(
        read_to_string(out.join("out.js")).unwrap(),
        "[(()=>{x()}),(()=>{x()})]"
    );
    for file in ["full", "shallow"] {
        let path = out.join(format!("{file}.map"));
        let Some(&(_, _, source)) = variants.types().iter().find(|(_, f, _)| *f == file) else {
            assert!(!path.exists(), "{variants:?} generates no {file} map");
            continue;
        };
        let map = read_to_string(path).unwrap();
        for prefix in ["a", "b"] {
            assert!(
                map.contains(&format!(
                    r#""sources":["{prefix}/{source}"],"sourcesContent":["{content}"]"#
                )),
                "{variants:?}: unexpected {file}.map: {map}"
            );
        }
    }
}

/// Runs session `n` (see [`factory_maps_follow_module_tail_edits_across_restores`]) and persists
/// it.
async fn session(cache: &Path, out: &Path, n: u32, variants_index: usize) {
    let variants = ALL[variants_index];
    let tt = open_tt(cache);
    let root: RcStr = out.to_str().unwrap().into();
    let check = out.to_path_buf();
    turbo_tasks::run_once(tt.clone(), async move {
        let fs = disk_fs_operation(root)
            .resolve()
            .strongly_consistent()
            .await?;
        let input_op = input_operation(variants_index);
        let input = input_op.resolve().strongly_consistent().await?;
        let input_value = input_op.read_strongly_consistent().await?;
        let assert_files = |content| assert_files(&check, content, variants);
        match n {
            // Cold.
            1 => {
                write(fs, input).await?;
                assert_files("one");
                piece_maps(input).await?;
            }
            // Restored, then an edit to the map's tail only.
            2 => {
                write(fs, input).await?;
                assert_files("one");
                let maps = piece_maps(input).await?;
                let executions = COMPOSITION_EXECUTIONS.load(Ordering::SeqCst);

                input_value.content.set(rcstr!("two"));
                write(fs, input).await?;
                assert_files("two");
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
                assert_files("two");
                let maps = piece_maps(input).await?;
                let executions = COMPOSITION_EXECUTIONS.load(Ordering::SeqCst);

                input_value.content.set(rcstr!("three"));
                write(fs, input).await?;
                assert_files("three");
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
    for variants in 0..ALL.len() {
        let cache = tempfile::tempdir().unwrap();
        let out = tempfile::tempdir().unwrap();

        session(cache.path(), out.path(), 1, variants).await;
        session(cache.path(), out.path(), 2, variants).await;
        for entry in std::fs::read_dir(out.path()).unwrap() {
            std::fs::remove_file(entry.unwrap().path()).unwrap();
        }
        session(cache.path(), out.path(), 3, variants).await;
    }
}
