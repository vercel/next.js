//! [`CellRope`]: a rope whose contents are partly owned by other cells, and [`ComposedFile`]: a
//! file made of one.

use std::{io::Write, ops::Range};

use anyhow::{Result, ensure};
use bincode::{Decode, Encode};
use turbo_tasks::{NonLocalValue, ReadRef, ResolvedVc, Vc};

use crate::{
    File, FileContent, FileMeta,
    rope::{Rope, RopeBuilder},
};

/// A rope made of inline bytes and references to [`Rope`] cells owned by other tasks.
///
/// This is a useful representation when the content is composed from multiple tasks since it
/// allows persistence to represent the structure without duplicating content on disk as a
/// [`Rope`] would.
///
/// Because the cells can change independently of the `CellRope`, it stores nothing derived
/// from their contents (not even its total length).
///
/// A referenced cell's bytes can be patched when the rope is read: see [`SkippableRope`]. The
/// patch lives in the same cell as the bytes, so it stays as independent of the cells' contents as
/// the rest of the rope.
///
/// A rope can also reference a file's content as a JSON string literal, escaped when the rope is
/// read: see [`CellRopeBuilder::push_escaped_file_content`]. Source maps use this to embed a
/// source's text (`sourcesContent`) without storing an escaped copy of it.
///
/// Only [`CellRopeBuilder`] creates cells of this type, see [`CellRopeBuilder::build_cell`].
#[turbo_tasks::value]
#[derive(Clone, Debug, Default)]
pub struct CellRope {
    segments: Vec<CellRopeSegment>,
}

/// A segment of a [`CellRope`], see [`CellRope::parts`].
#[derive(Clone, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode)]
pub enum CellRopeSegment {
    /// Bytes owned by the `CellRope` itself (scaffolding between cells). Never empty.
    Inline(Rope),
    /// Bytes owned (and persisted) by another cell.
    Cell(ResolvedVc<Rope>),
    /// The bytes of a [`SkippableRope`] owned by another cell: all of them, or without its skip
    /// range when `skip` is true. See [`CellRopeBuilder::push_skippable`].
    Skippable {
        cell: ResolvedVc<SkippableRope>,
        skip: bool,
    },
    /// All of another `CellRope`'s bytes. Lets a rope extend another one (e.g. append a footer)
    /// without copying its segments.
    Nested(ResolvedVc<CellRope>),
    /// A file's content as a JSON string literal, see
    /// [`CellRopeBuilder::push_escaped_file_content`].
    EscapedFileContent(ResolvedVc<FileContent>),
}

/// JSON-escapes `text` into a string literal (including the quotes), as `serde_json` serializes
/// a string. This is the form of a source's text in a source map's `sourcesContent`.
pub fn escape_json_string(text: &str) -> Rope {
    Rope::from(crate::json_escape::escape_json(text))
}

/// `content` as a JSON string literal, see [`CellRopeBuilder::push_escaped_file_content`].
fn escape_file_content(content: &FileContent) -> Result<Rope> {
    let FileContent::Content(file) = content else {
        anyhow::bail!("an escaped file content reference points to a missing file");
    };
    Ok(escape_json_string(&file.content().to_str()?))
}

/// A file's content as a JSON string literal, see [`escaped_file_content`].
///
/// Only hashed in the persistent cache, like the file's content: referencing the file instead of
/// persisting an escaped copy of its text is the point. After a restore, it is recomputed from
/// the file when a rope referencing it is read.
#[turbo_tasks::value(transparent, serialization = "hash")]
struct EscapedFileContent(Rope);

/// Escapes `content` once, so that every rope referencing the same file shares the escaped
/// bytes (in memory) instead of escaping them again on every read.
#[turbo_tasks::function]
async fn escaped_file_content(content: Vc<FileContent>) -> Result<Vc<EscapedFileContent>> {
    Ok(Vc::cell(escape_file_content(&*content.await?)?))
}

/// Bytes, together with a range of them that a [`CellRope`] can leave out when it references the
/// bytes (see [`CellRopeBuilder::push_skippable`]).
///
/// Keeping the range in the same cell as the bytes means one cell can be referenced both whole
/// and skipped, persisting the bytes once, and the range can never belong to other bytes.
#[turbo_tasks::value(shared)]
#[derive(Clone, Debug, Default)]
pub struct SkippableRope {
    rope: Rope,
    skip: Option<(usize, usize)>,
}

impl SkippableRope {
    pub fn new(rope: Rope, skip: Option<Range<usize>>) -> Self {
        SkippableRope {
            rope,
            skip: skip.map(|range| (range.start, range.end)),
        }
    }

    /// All of the bytes.
    pub fn rope(&self) -> &Rope {
        &self.rope
    }

    /// The range a skipping reference leaves out, if any.
    pub fn skip(&self) -> Option<Range<usize>> {
        self.skip.map(|(start, end)| start..end)
    }

    /// The bytes without the skip range. Errors if the range doesn't lie within the bytes.
    pub fn skipped(&self) -> Result<Rope> {
        let Some(range) = self.skip() else {
            return Ok(self.rope.clone());
        };
        ensure!(
            range.start <= range.end && range.end <= self.rope.len(),
            "skipped range {range:?} is out of bounds for a cell of {} bytes",
            self.rope.len()
        );
        Ok(self.rope.clone().skip(range))
    }
}

impl CellRope {
    /// Reads every referenced cell (and nested rope) and concatenates the segments into a flat
    /// [`Rope`].
    ///
    /// This doesn't copy the cells' bytes: the result shares their buffers, and skipped ranges
    /// are left out with [`Rope::skip`]. (Escaped file contents are escaped once per file, see
    /// [`CellRopeBuilder::push_escaped_file_content`].) If any cell fails to read (or a skipped
    /// range doesn't fit its cell), this fails too; a partial rope is never returned.
    pub fn read(&self) -> impl IntoFuture<Output = Result<Rope>, IntoFuture: Send> + '_ {
        self.read_segments(true)
    }

    /// Like [`CellRope::read`], but reads the cells without tracking a dependency on them.
    ///
    /// Only for callers that don't need to be invalidated when the cells change, because they
    /// already depend on the content another way: e.g. writing a [`ComposedFile`] compares the
    /// bytes with a content hash computed by a tracked read, and retries on a mismatch.
    pub fn read_untracked(&self) -> impl IntoFuture<Output = Result<Rope>, IntoFuture: Send> + '_ {
        self.read_segments(false)
    }

    /// Reads the segments in order, appending each to the result as it is read. Nested ropes are
    /// walked with an explicit stack instead of recursion.
    async fn read_segments(&self, tracked: bool) -> Result<Rope> {
        let mut builder = RopeBuilder::default();
        let mut next = 0;
        // Nested ropes being read, each with the index of its next segment.
        let mut nested: Vec<(ReadRef<CellRope>, usize)> = Vec::new();
        loop {
            let segment = if let Some((rope, index)) = nested.last_mut() {
                let Some(segment) = rope.segments.get(*index) else {
                    nested.pop();
                    continue;
                };
                *index += 1;
                segment.clone()
            } else {
                let Some(segment) = self.segments.get(next) else {
                    break;
                };
                next += 1;
                segment.clone()
            };
            match segment {
                CellRopeSegment::Inline(inline) => builder.concat(&inline),
                CellRopeSegment::Cell(cell) => {
                    let cell = if tracked {
                        cell.await?
                    } else {
                        // INVALIDATION: only `read_untracked` gets here. Its callers check the
                        // bytes against a hash they track elsewhere, see `read_untracked`.
                        cell.untracked().await?
                    };
                    builder.concat(&cell);
                }
                CellRopeSegment::Skippable { cell, skip } => {
                    let cell = if tracked {
                        cell.await?
                    } else {
                        // INVALIDATION: only `read_untracked` gets here, see `Cell` above.
                        cell.untracked().await?
                    };
                    if skip {
                        builder.concat(&cell.skipped()?);
                    } else {
                        builder.concat(cell.rope());
                    }
                }
                CellRopeSegment::Nested(rope) => {
                    let rope = if tracked {
                        rope.await?
                    } else {
                        // INVALIDATION: only `read_untracked` gets here, see `Cell` above.
                        rope.untracked().await?
                    };
                    nested.push((rope, 0));
                }
                CellRopeSegment::EscapedFileContent(content) => {
                    let escaped = escaped_file_content(*content);
                    let escaped = if tracked {
                        escaped.await?
                    } else {
                        // INVALIDATION: only `read_untracked` gets here, see `Cell` above.
                        escaped.untracked().await?
                    };
                    builder.concat(&escaped);
                }
            }
        }
        Ok(builder.build())
    }

    /// The rope's segments, in order, without reading any cells.
    pub fn parts(&self) -> &[CellRopeSegment] {
        &self.segments
    }
}

/// Builds a [`CellRope`]. Inline bytes are buffered in a [`RopeBuilder`], so adjacent inline
/// parts become a single segment.
#[derive(Default)]
pub struct CellRopeBuilder {
    segments: Vec<CellRopeSegment>,
    inline: RopeBuilder,
}

impl CellRopeBuilder {
    /// Appends inline bytes, sharing `rope`'s buffers.
    pub fn concat(&mut self, rope: &Rope) {
        self.inline.concat(rope);
    }

    /// Appends static inline bytes.
    pub fn push_static_bytes(&mut self, bytes: &'static [u8]) {
        self.inline.push_static_bytes(bytes);
    }

    /// Appends a reference to a cell owned by another task. The cell may be empty, which adds
    /// no bytes.
    pub fn push_cell(&mut self, cell: ResolvedVc<Rope>) {
        self.flush_inline();
        self.segments.push(CellRopeSegment::Cell(cell));
    }

    /// Appends a reference to a [`SkippableRope`] cell owned by another task: all of its bytes, or
    /// without its skip range when `skip` is true.
    ///
    /// The cell is only read when the rope is read, so the range always belongs to the bytes it
    /// is read with. Reading fails if the range doesn't lie within the bytes.
    pub fn push_skippable(&mut self, cell: ResolvedVc<SkippableRope>, skip: bool) {
        self.flush_inline();
        self.segments
            .push(CellRopeSegment::Skippable { cell, skip });
    }

    /// Appends a reference to all of another `CellRope`'s bytes, without copying its segments.
    pub fn push_rope(&mut self, rope: ResolvedVc<CellRope>) {
        self.flush_inline();
        self.segments.push(CellRopeSegment::Nested(rope));
    }

    /// Appends a reference to a file's content, emitted as a JSON string literal (see
    /// [`escape_json_string`]) when the rope is read.
    ///
    /// Nothing but the reference is stored, so a rope persisting this doesn't persist a copy of
    /// the text. The escaped text is computed once per file and shared (in memory) by every rope
    /// referencing it; it isn't persisted either, but recomputed from the file when needed (e.g.
    /// after a restore). Reading fails if the file doesn't exist or isn't valid UTF-8.
    pub fn push_escaped_file_content(&mut self, content: ResolvedVc<FileContent>) {
        self.flush_inline();
        self.segments
            .push(CellRopeSegment::EscapedFileContent(content));
    }

    /// Appends copies of all of `rope`'s segments.
    pub fn append(&mut self, rope: &CellRope) {
        for segment in &rope.segments {
            match segment {
                CellRopeSegment::Inline(inline) => self.inline.concat(inline),
                segment => {
                    self.flush_inline();
                    self.segments.push(segment.clone());
                }
            }
        }
    }

    fn flush_inline(&mut self) {
        let inline = std::mem::take(&mut self.inline).build();
        if !inline.is_empty() {
            self.segments.push(CellRopeSegment::Inline(inline));
        }
    }

    /// Builds the rope as a value, e.g. to [`CellRopeBuilder::append`] it to another builder.
    pub fn build(mut self) -> CellRope {
        self.flush_inline();
        self.segments.shrink_to_fit();
        CellRope {
            segments: self.segments,
        }
    }

    /// Builds the rope and stores it in a new cell of the current task.
    pub fn build_cell(self) -> Vc<CellRope> {
        self.build().cell()
    }

    /// Like [`CellRopeBuilder::build_cell`], returning a [`ResolvedVc`].
    pub fn build_resolved_cell(self) -> ResolvedVc<CellRope> {
        self.build().resolved_cell()
    }
}

impl Write for CellRopeBuilder {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.inline.write(bytes)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

impl std::ops::AddAssign<&'static str> for CellRopeBuilder {
    fn add_assign(&mut self, rhs: &'static str) {
        self.push_static_bytes(rhs.as_bytes());
    }
}

/// A file whose content is a [`CellRope`], i.e. composed from cells owned by other tasks, with the
/// same [`FileMeta`] a [`File`] has.
///
/// Creating one doesn't read the rope. Readers that need the bytes use [`ComposedFile::content`];
/// [`crate::FileSystemPath::write_composed`] writes it without persisting the bytes as a whole,
/// since the referenced cells persist them already.
#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub struct ComposedFile {
    rope: ResolvedVc<CellRope>,
    meta: FileMeta,
}

impl ComposedFile {
    pub fn new(rope: ResolvedVc<CellRope>, meta: FileMeta) -> Self {
        ComposedFile { rope, meta }
    }

    pub fn rope(&self) -> ResolvedVc<CellRope> {
        self.rope
    }

    pub fn meta(&self) -> &FileMeta {
        &self.meta
    }

    /// A [`File`] with `bytes` (which must be the rope's) and this file's meta.
    pub(crate) fn file(&self, bytes: Rope) -> File {
        File::from(bytes).with_meta(self.meta.clone())
    }
}

#[turbo_tasks::value_impl]
impl ComposedFile {
    /// The file's bytes, read (tracked) from the rope, with its meta.
    #[turbo_tasks::function]
    pub async fn content(&self) -> Result<Vc<FileContent>> {
        Ok(FileContent::Content(self.file(self.rope.await?.read().await?)).cell())
    }
}

#[cfg(test)]
mod tests {
    use anyhow::{Result, bail};
    use turbo_rcstr::RcStr;
    use turbo_tasks::{State, Vc};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

    use super::*;
    use crate::Permissions;

    /// The number of cells `rope` references directly (not counting nested ropes' cells).
    fn cell_count(rope: &CellRope) -> usize {
        rope.parts()
            .iter()
            .filter(|segment| {
                matches!(
                    segment,
                    CellRopeSegment::Cell(_) | CellRopeSegment::Skippable { .. }
                )
            })
            .count()
    }

    #[turbo_tasks::value]
    struct Switch {
        fail: State<bool>,
    }

    #[turbo_tasks::function(operation, root)]
    fn switch_operation() -> Vc<Switch> {
        Switch {
            fail: State::new(false),
        }
        .cell()
    }

    /// A cell owned by another task, which can be made to fail.
    #[turbo_tasks::function(operation, root)]
    async fn item_operation(switch: ResolvedVc<Switch>, text: RcStr) -> Result<Vc<Rope>> {
        if *switch.await?.fail.get() {
            bail!("item {text} failed");
        }
        Ok(Rope::from(text.to_string()).cell())
    }

    /// Composes `a<first>d<second>` without reading the items, so the rope keeps referencing the
    /// item cells even after they change.
    #[turbo_tasks::function(operation, root)]
    fn compose_operation(first: ResolvedVc<Rope>, second: ResolvedVc<Rope>) -> Vc<CellRope> {
        let mut builder = CellRopeBuilder::default();
        builder += "a";
        builder.push_cell(first);
        builder += "d";
        builder.push_cell(second);
        builder.build_cell()
    }

    #[turbo_tasks::function(operation, root)]
    async fn read_operation(rope: ResolvedVc<CellRope>) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(rope.await?.read().await?.to_str()?.into()))
    }

    #[turbo_tasks::function(operation, root)]
    async fn read_untracked_operation(rope: ResolvedVc<CellRope>) -> Result<Vc<RcStr>> {
        // INVALIDATION: the test reads the bytes without depending on the rope or its cells on
        // purpose, to exercise the untracked read path.
        Ok(Vc::cell(
            rope.untracked()
                .await?
                .read_untracked()
                .await?
                .to_str()?
                .into(),
        ))
    }

    #[turbo_tasks::function]
    async fn item(switch: ResolvedVc<Switch>, text: RcStr) -> Result<Vc<Rope>> {
        if *switch.await?.fail.get() {
            bail!("item {text} failed");
        }
        Ok(Rope::from(text.to_string()).cell())
    }

    /// Composes like a real producer (e.g. a chunk): it reads every item's task output while
    /// composing, so an item error fails the composition.
    #[turbo_tasks::function]
    async fn compose(switch: ResolvedVc<Switch>) -> Result<Vc<CellRope>> {
        let mut builder = CellRopeBuilder::default();
        builder += "a";
        for (text, separator) in [("bc", "d"), ("ef", "")] {
            let cell = item(*switch, text.into()).to_resolved().await?;
            // Producers read the items to lay them out (e.g. source map offsets).
            cell.await?;
            builder.push_cell(cell);
            builder.push_static_bytes(separator.as_bytes());
        }
        Ok(builder.build_cell())
    }

    #[turbo_tasks::function(operation, root)]
    async fn read_composed_operation(switch: ResolvedVc<Switch>) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            compose(*switch).await?.read().await?.to_str()?.into(),
        ))
    }

    macro_rules! turbo_tasks {
        () => {
            turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
                BackendOptions::default(),
                noop_backing_storage(),
            ))
        };
    }

    /// The bytes and skip range a [`skippable_operation`] produces.
    #[turbo_tasks::value]
    struct SkippableInput {
        value: State<(RcStr, Option<(usize, usize)>)>,
    }

    #[turbo_tasks::function(operation, root)]
    fn skippable_input_operation(text: RcStr, skip: Option<(usize, usize)>) -> Vc<SkippableInput> {
        SkippableInput {
            value: State::new((text, skip)),
        }
        .cell()
    }

    /// A skippable cell owned by its own task, like the code cell a chunk item's producer
    /// computes together with its strict directive.
    #[turbo_tasks::function(operation, root)]
    async fn skippable_operation(input: ResolvedVc<SkippableInput>) -> Result<Vc<SkippableRope>> {
        let (text, skip) = input.await?.value.get().clone();
        Ok(SkippableRope::new(
            Rope::from(text.to_string()),
            skip.map(|(start, end)| start..end),
        )
        .cell())
    }

    /// `a<cell>|<cell without its skip range>d`: one cell referenced both whole and skipped,
    /// without reading it.
    #[turbo_tasks::function(operation, root)]
    fn compose_skippable_operation(cell: ResolvedVc<SkippableRope>) -> Vc<CellRope> {
        let mut builder = CellRopeBuilder::default();
        builder += "a";
        builder.push_skippable(cell, false);
        builder += "|";
        builder.push_skippable(cell, true);
        builder += "d";
        builder.build_cell()
    }

    /// The composition of [`compose_skippable_operation`] for `input`, read tracked and
    /// untracked (checking they agree), with the rope itself.
    async fn read_skippable(input: ResolvedVc<SkippableInput>) -> Result<(CellRope, RcStr)> {
        let (rope_cell, rope, tracked) = read_skippable_tracked(input).await?;
        let untracked = read_untracked_operation(rope_cell)
            .read_strongly_consistent()
            .await?;
        assert_eq!(tracked, *untracked);
        Ok((rope, tracked))
    }

    /// Like [`read_skippable`], with a tracked read only (and the rope's cell). An untracked read
    /// isn't invalidated when the cell changes, so it can't be compared after an update.
    async fn read_skippable_tracked(
        input: ResolvedVc<SkippableInput>,
    ) -> Result<(ResolvedVc<CellRope>, CellRope, RcStr)> {
        let cell = skippable_operation(input)
            .resolve()
            .strongly_consistent()
            .await?;
        let rope = compose_skippable_operation(cell)
            .resolve()
            .strongly_consistent()
            .await?;
        let tracked = read_operation(rope).read_strongly_consistent().await?;
        Ok((rope, (*rope.await?).clone(), (*tracked).clone()))
    }

    async fn read_skipping(text: &str, skip: Option<(usize, usize)>) -> Result<RcStr> {
        let input = skippable_input_operation(text.into(), skip)
            .resolve()
            .strongly_consistent()
            .await?;
        Ok(read_skippable(input).await?.1)
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn skippable_cells_are_read_whole_or_without_their_range() {
        turbo_tasks!()
            .run_once(async {
                let input = skippable_input_operation("bcxyef".into(), Some((2, 4)))
                    .resolve()
                    .strongly_consistent()
                    .await?;
                let (rope, text) = read_skippable(input).await?;
                assert_eq!(text.as_str(), "abcxyef|bcefd");
                assert_eq!(cell_count(&rope), 2);
                let cells: Vec<_> = rope
                    .parts()
                    .iter()
                    .filter_map(|segment| match segment {
                        CellRopeSegment::Skippable { cell, .. } => Some(*cell),
                        _ => None,
                    })
                    .collect();
                assert_eq!(cells[0], cells[1], "both references share one cell");

                assert_eq!(
                    read_skipping("bcxyef", None).await?.as_str(),
                    "abcxyef|bcxyefd"
                );
                assert_eq!(
                    read_skipping("bcxyef", Some((0, 6))).await?.as_str(),
                    "abcxyef|d"
                );
                anyhow::Ok(())
            })
            .await
            .unwrap();
    }

    /// Updating the skippable cell (bytes and range together) is followed by both references
    /// without rebuilding the composition.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn skippable_cell_updates_are_followed_without_recomposing() {
        turbo_tasks!()
            .run_once(async {
                let input_op = skippable_input_operation("bcxyef".into(), Some((2, 4)));
                let input = input_op.resolve().strongly_consistent().await?;
                let (rope, text) = read_skippable(input).await?;
                assert_eq!(text.as_str(), "abcxyef|bcefd");

                input_op
                    .read_strongly_consistent()
                    .await?
                    .value
                    .set(("123456".into(), Some((0, 2))));

                let (_, updated, text) = read_skippable_tracked(input).await?;
                assert_eq!(text.as_str(), "a123456|3456d");
                assert_eq!(updated, rope, "the composition doesn't change");
                anyhow::Ok(())
            })
            .await
            .unwrap();
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn skipped_ranges_out_of_bounds_fail_the_read() {
        turbo_tasks!()
            .run_once(async {
                let err = read_skipping("bcxyef", Some((4, 7)))
                    .await
                    .expect_err("a range past the cell's end must fail the read");
                assert!(
                    format!("{err:?}").contains("out of bounds"),
                    "unexpected error: {err:?}"
                );
                anyhow::Ok(())
            })
            .await
            .unwrap();
    }

    #[test]
    fn builder_merges_adjacent_inline_parts() {
        let mut builder = CellRopeBuilder::default();
        builder += "header";
        builder.concat(&Rope::from("+more".to_string()));
        builder += "";
        let rope = builder.build();
        assert_eq!(rope.segments.len(), 1);
        assert_eq!(cell_count(&rope), 0);
    }

    /// A non-default meta: a content type, executable permissions and atomic writes.
    fn special_meta() -> FileMeta {
        File::from("")
            .with_content_type(mime::TEXT_CSS)
            .with_permissions(Permissions::Executable)
            .with_atomic_write()
            .meta()
            .clone()
    }

    #[turbo_tasks::function(operation, root)]
    async fn composed_content_operation() -> Result<Vc<FileContent>> {
        let mut builder = CellRopeBuilder::default();
        builder += "body";
        let file = ComposedFile::new(builder.build_resolved_cell(), special_meta()).cell();
        Ok(file.content())
    }

    /// A composed file's content is a `File` with its meta, like a flat file's.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn composed_file_content_keeps_its_meta() {
        turbo_tasks!()
            .run_once(async {
                let content = composed_content_operation()
                    .read_strongly_consistent()
                    .await?;
                let FileContent::Content(file) = &*content else {
                    bail!("expected content");
                };
                assert_eq!(file.content().to_str()?, "body");
                assert_eq!(file.meta(), &special_meta());
                assert_eq!(file.content_type(), Some(&mime::TEXT_CSS));
                anyhow::Ok(())
            })
            .await
            .unwrap();
    }

    /// An item error surfaces when the composed content is read; no partial content is returned.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn item_errors_surface_when_the_composed_content_is_read() {
        turbo_tasks!()
            .run_once(async {
                let switch_op = switch_operation();
                let switch = switch_op.resolve().strongly_consistent().await?;
                let read = read_composed_operation(switch);
                assert_eq!(read.read_strongly_consistent().await?.as_str(), "abcdef");

                switch_op.read_strongly_consistent().await?.fail.set(true);

                let err = read
                    .read_strongly_consistent()
                    .await
                    .expect_err("reading must fail once an item fails");
                assert!(
                    format!("{err:?}").contains("item bc failed"),
                    "unexpected error: {err:?}"
                );
                anyhow::Ok(())
            })
            .await
            .unwrap();
    }

    /// Pins a turbo-tasks behavior the design relies on: a cell whose task later fails keeps its
    /// last successful value. A `CellRope` holding a stale reference therefore reads consistent
    /// (old) bytes, never an error or a partial result. Errors propagate through task outputs
    /// (see the test above); staleness is detected by comparing content hashes.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn stale_references_read_the_last_successful_value() {
        turbo_tasks!()
            .run_once(async {
                let switch_op = switch_operation();
                let switch = switch_op.resolve().strongly_consistent().await?;
                let first = item_operation(switch, "bc".into())
                    .resolve()
                    .strongly_consistent()
                    .await?;
                let second = item_operation(switch, "ef".into())
                    .resolve()
                    .strongly_consistent()
                    .await?;
                let rope = compose_operation(first, second)
                    .resolve()
                    .strongly_consistent()
                    .await?;
                let read = read_operation(rope);
                assert_eq!(read.read_strongly_consistent().await?.as_str(), "abcdef");

                switch_op.read_strongly_consistent().await?.fail.set(true);
                assert!(
                    item_operation(switch, "bc".into())
                        .read_strongly_consistent()
                        .await
                        .is_err()
                );

                assert_eq!(read.read_strongly_consistent().await?.as_str(), "abcdef");
                anyhow::Ok(())
            })
            .await
            .unwrap();
    }

    #[turbo_tasks::value]
    struct Text {
        text: State<RcStr>,
    }

    #[turbo_tasks::function(operation, root)]
    fn text_operation() -> Vc<Text> {
        Text {
            text: State::new("bc".into()),
        }
        .cell()
    }

    #[turbo_tasks::function]
    async fn text_file(text: ResolvedVc<Text>) -> Result<Vc<FileContent>> {
        Ok(FileContent::Content(crate::File::from(text.await?.text.get().to_string())).cell())
    }

    /// `[<escaped file content>]`, referencing the file without reading it.
    #[turbo_tasks::function]
    async fn escaped_rope(text: ResolvedVc<Text>) -> Result<Vc<CellRope>> {
        let mut builder = CellRopeBuilder::default();
        builder += "[";
        builder.push_escaped_file_content(text_file(*text).to_resolved().await?);
        builder += "]";
        Ok(builder.build_cell())
    }

    #[turbo_tasks::function(operation, root)]
    async fn read_escaped_operation(text: ResolvedVc<Text>) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            escaped_rope(*text).await?.read().await?.to_str()?.into(),
        ))
    }

    /// An escaped file content segment reads exactly as `serde_json` escapes the text (and as
    /// `escape_json_string`, which source maps use for inline contents, does), and follows
    /// edits to the file.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn escaped_file_content_matches_serde_json_and_follows_edits() {
        turbo_tasks!()
            .run_once(async {
                let controls: String = (0u8..=0x1f).chain([0x7f]).map(char::from).collect();
                let texts = [
                    "plain ascii",
                    "quote \" backslash \\ slash /",
                    &controls,
                    "line\u{2028}para\u{2029}",
                    "emoji 😀 and ü, astral 𝄞, BMP edge \u{d7ff}\u{e000}\u{ffff}",
                    "crlf\r\nnext",
                    "",
                ];
                let text_op = text_operation();
                let text = text_op.resolve().strongly_consistent().await?;
                let read = read_escaped_operation(text);
                for sample in texts {
                    text_op
                        .read_strongly_consistent()
                        .await?
                        .text
                        .set(sample.into());
                    let expected = format!("[{}]", serde_json::to_string(sample)?);
                    assert_eq!(read.read_strongly_consistent().await?.as_str(), expected);
                    assert_eq!(
                        escape_json_string(sample).to_str()?,
                        serde_json::to_string(sample)?
                    );
                }
                anyhow::Ok(())
            })
            .await
            .unwrap();
    }
}
