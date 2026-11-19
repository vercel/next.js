//! [`CellRope`]: a rope whose contents are partly owned by other cells, and [`ComposedFile`]: a
//! file made of one.

use std::io::Write;

use anyhow::{Result, ensure};
use bincode::{Decode, Encode};
use turbo_tasks::{NonLocalValue, ReadRef, ResolvedVc, Vc};

use crate::{
    File, FileContent,
    rope::{Rope, RopeBuilder},
};

/// A rope made of inline bytes and references to [`Rope`] cells owned by other tasks.
///
/// Composite outputs (e.g. a chunk made of many module factories) can be described by a
/// `CellRope` instead of a flat [`Rope`]. When such a value is persisted, the referenced bytes are
/// stored once, by the tasks that own them, and the `CellRope` only stores the inline bytes plus
/// one reference per cell.
///
/// The cells can change independently of the `CellRope`, so it stores nothing derived from their
/// contents (not even its total length). Anything derived from them (e.g. source map offsets) is
/// computed by whoever reads the rope's bytes. A `CellRope` describes whatever the cells currently
/// hold; consumers that need its bytes to match a value they computed earlier compare a content
/// hash (writing a [`ComposedFile`] does).
///
/// A referenced cell's bytes can be patched when the rope is read: see
/// [`CellRopeBuilder::push_cell_skipping`]. The patch is itself a reference to a cell, so it stays
/// as independent of the cells' contents as the rest of the rope.
#[turbo_tasks::value(shared)]
#[derive(Clone, Debug, Default)]
pub struct CellRope {
    segments: Vec<CellRopeSegment>,
}

#[derive(Clone, Debug, PartialEq, Eq, NonLocalValue, Encode, Decode)]
enum CellRopeSegment {
    /// Bytes owned by the `CellRope` itself (scaffolding between cells). Never empty.
    Inline(Rope),
    /// Bytes owned (and persisted) by another cell.
    Cell(ResolvedVc<Rope>),
    /// Bytes owned by another cell, without the range held by `skip` (if any), see
    /// [`CellRopeBuilder::push_cell_skipping`].
    SkippedCell {
        cell: ResolvedVc<Rope>,
        skip: ResolvedVc<OptionByteRange>,
    },
    /// All of another `CellRope`'s bytes. Lets a rope extend another one (e.g. append a footer)
    /// without copying its segments.
    Nested(ResolvedVc<CellRope>),
}

/// An optional range of bytes, as `(start, end)` offsets. Left out of a cell's bytes by
/// [`CellRopeBuilder::push_cell_skipping`].
#[turbo_tasks::value(shared)]
#[derive(Clone, Copy, Debug)]
pub struct OptionByteRange {
    range: Option<(usize, usize)>,
}

impl OptionByteRange {
    pub fn new(range: Option<std::ops::Range<usize>>) -> Self {
        OptionByteRange {
            range: range.map(|range| (range.start, range.end)),
        }
    }

    pub fn range(&self) -> Option<std::ops::Range<usize>> {
        self.range.map(|(start, end)| start..end)
    }
}

/// `rope` without the bytes in `skip`. Errors if `skip` doesn't lie within `rope`.
fn skip_range(rope: Rope, skip: &OptionByteRange) -> Result<Rope> {
    let Some(range) = skip.range() else {
        return Ok(rope);
    };
    ensure!(
        range.start <= range.end && range.end <= rope.len(),
        "skipped range {range:?} is out of bounds for a cell of {} bytes",
        rope.len()
    );
    Ok(rope.skip(range))
}

impl CellRope {
    /// Reads every referenced cell (and nested rope) and concatenates the segments into a flat
    /// [`Rope`].
    ///
    /// This doesn't copy any bytes: the result shares the cells' buffers, and skipped ranges are
    /// left out with [`Rope::skip`]. If any cell fails to read (or a skipped range doesn't fit its
    /// cell), this fails too; a partial rope is never returned.
    pub fn read(&self) -> impl IntoFuture<Output = Result<Rope>, IntoFuture: Send> + '_ {
        self.read_segments(true)
    }

    /// Like [`CellRope::read`], but reads the cells without tracking a dependency on them.
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
                        cell.untracked().await?
                    };
                    builder.concat(&cell);
                }
                CellRopeSegment::SkippedCell { cell, skip } => {
                    let (cell, skip) = if tracked {
                        (cell.await?, skip.await?)
                    } else {
                        (cell.untracked().await?, skip.untracked().await?)
                    };
                    builder.concat(&skip_range((*cell).clone(), &skip)?);
                }
                CellRopeSegment::Nested(rope) => {
                    let rope = if tracked {
                        rope.await?
                    } else {
                        rope.untracked().await?
                    };
                    nested.push((rope, 0));
                }
            }
        }
        Ok(builder.build())
    }

    /// The rope's segments, in order, without reading any cells.
    pub fn parts(&self) -> impl Iterator<Item = CellRopePart> + '_ {
        self.segments.iter().map(|segment| match segment {
            CellRopeSegment::Inline(inline) => CellRopePart::Inline(inline.clone()),
            CellRopeSegment::Cell(cell) => CellRopePart::Cell {
                cell: *cell,
                skip: None,
            },
            CellRopeSegment::SkippedCell { cell, skip } => CellRopePart::Cell {
                cell: *cell,
                skip: Some(*skip),
            },
            CellRopeSegment::Nested(rope) => CellRopePart::Nested(*rope),
        })
    }
}

/// A segment of a [`CellRope`], see [`CellRope::parts`].
pub enum CellRopePart {
    /// Bytes owned by the rope itself.
    Inline(Rope),
    /// A reference to a cell owned by another task, and to the range of its bytes to leave out
    /// (see [`CellRopeBuilder::push_cell_skipping`]).
    Cell {
        cell: ResolvedVc<Rope>,
        skip: Option<ResolvedVc<OptionByteRange>>,
    },
    /// A reference to all of another `CellRope`'s bytes.
    Nested(ResolvedVc<CellRope>),
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

    /// Appends a reference to a cell owned by another task, leaving out the range of its bytes
    /// that `skip` holds (nothing if it holds `None`).
    ///
    /// Both are only read when the rope is read, so the range can follow the cell's contents:
    /// e.g. a cell and a range computed from it by the same task. Reading fails if the range
    /// doesn't lie within the cell's bytes.
    pub fn push_cell_skipping(
        &mut self,
        cell: ResolvedVc<Rope>,
        skip: ResolvedVc<OptionByteRange>,
    ) {
        self.flush_inline();
        self.segments
            .push(CellRopeSegment::SkippedCell { cell, skip });
    }

    /// Appends a reference to all of another `CellRope`'s bytes, without copying its segments.
    pub fn push_rope(&mut self, rope: ResolvedVc<CellRope>) {
        self.flush_inline();
        self.segments.push(CellRopeSegment::Nested(rope));
    }

    /// Appends copies of all of `rope`'s segments.
    pub fn append(&mut self, rope: &CellRope) {
        for segment in &rope.segments {
            match segment {
                CellRopeSegment::Inline(inline) => self.inline.concat(inline),
                CellRopeSegment::Cell(cell) => self.push_cell(*cell),
                CellRopeSegment::SkippedCell { cell, skip } => {
                    self.push_cell_skipping(*cell, *skip)
                }
                CellRopeSegment::Nested(nested) => self.push_rope(*nested),
            }
        }
    }

    fn flush_inline(&mut self) {
        let inline = std::mem::take(&mut self.inline).build();
        if !inline.is_empty() {
            self.segments.push(CellRopeSegment::Inline(inline));
        }
    }

    pub fn build(mut self) -> CellRope {
        self.flush_inline();
        self.segments.shrink_to_fit();
        CellRope {
            segments: self.segments,
        }
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

/// A file whose content is a [`CellRope`], i.e. composed from cells owned by other tasks.
///
/// Creating one doesn't read the rope. Readers that need the bytes use [`ComposedFile::content`];
/// [`crate::FileSystemPath::write_composed`] writes it without persisting the bytes as a whole,
/// since the referenced cells persist them already.
#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub struct ComposedFile {
    rope: ResolvedVc<CellRope>,
}

impl ComposedFile {
    pub fn new(rope: ResolvedVc<CellRope>) -> Self {
        ComposedFile { rope }
    }

    pub fn rope(&self) -> ResolvedVc<CellRope> {
        self.rope
    }
}

#[turbo_tasks::value_impl]
impl ComposedFile {
    /// The file's bytes, read (tracked) from the rope.
    #[turbo_tasks::function]
    pub async fn content(&self) -> Result<Vc<FileContent>> {
        Ok(FileContent::Content(File::from(self.rope.await?.read().await?)).cell())
    }
}

#[cfg(test)]
mod tests {
    use anyhow::{Result, bail};
    use turbo_rcstr::RcStr;
    use turbo_tasks::{State, Vc};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

    use super::*;

    /// The number of cells `rope` references directly (not counting nested ropes' cells).
    fn cell_count(rope: &CellRope) -> usize {
        rope.parts()
            .filter(|part| matches!(part, CellRopePart::Cell { .. }))
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
        builder.build().cell()
    }

    #[turbo_tasks::function(operation, root)]
    async fn read_operation(rope: ResolvedVc<CellRope>) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(rope.await?.read().await?.to_str()?.into()))
    }

    #[turbo_tasks::function(operation, root)]
    async fn read_untracked_operation(rope: ResolvedVc<CellRope>) -> Result<Vc<RcStr>> {
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
        Ok(builder.build().cell())
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

    /// A range owned by its own task, like the range a code cell's producer computes.
    #[turbo_tasks::function(operation, root)]
    fn range_operation(range: Option<(usize, usize)>) -> Vc<OptionByteRange> {
        OptionByteRange::new(range.map(|(start, end)| start..end)).cell()
    }

    /// `a<cell without skip>d`, referencing both without reading them.
    #[turbo_tasks::function(operation, root)]
    fn compose_skipping_operation(
        cell: ResolvedVc<Rope>,
        skip: ResolvedVc<OptionByteRange>,
    ) -> Vc<CellRope> {
        let mut builder = CellRopeBuilder::default();
        builder += "a";
        builder.push_cell_skipping(cell, skip);
        builder += "d";
        builder.build().cell()
    }

    /// Reads `a<"bcxyef" without range>d`, tracked and untracked, checking they agree.
    async fn read_skipping(range: Option<(usize, usize)>) -> Result<(CellRope, RcStr)> {
        let switch = switch_operation().resolve().strongly_consistent().await?;
        let cell = item_operation(switch, "bcxyef".into())
            .resolve()
            .strongly_consistent()
            .await?;
        let skip = range_operation(range)
            .resolve()
            .strongly_consistent()
            .await?;
        let rope = compose_skipping_operation(cell, skip)
            .resolve()
            .strongly_consistent()
            .await?;
        let tracked = read_operation(rope).read_strongly_consistent().await?;
        let untracked = read_untracked_operation(rope)
            .read_strongly_consistent()
            .await?;
        assert_eq!(tracked, untracked);
        Ok(((*rope.await?).clone(), (*tracked).clone()))
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn skipped_cells_leave_out_their_range_when_read() {
        turbo_tasks!()
            .run_once(async {
                let (rope, text) = read_skipping(Some((2, 4))).await?;
                assert_eq!(text.as_str(), "abcefd");
                assert_eq!(cell_count(&rope), 1);
                assert!(
                    rope.parts()
                        .any(|part| matches!(part, CellRopePart::Cell { skip: Some(_), .. }))
                );

                let (_, text) = read_skipping(None).await?;
                assert_eq!(text.as_str(), "abcxyefd");
                let (_, text) = read_skipping(Some((0, 6))).await?;
                assert_eq!(text.as_str(), "ad");
                anyhow::Ok(())
            })
            .await
            .unwrap();
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn skipped_ranges_out_of_bounds_fail_the_read() {
        turbo_tasks!()
            .run_once(async {
                let err = read_skipping(Some((4, 7)))
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
}
