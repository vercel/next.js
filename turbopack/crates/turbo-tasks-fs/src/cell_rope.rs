//! [`CellRope`]: a rope whose contents are partly owned by other cells.

use std::{future::Future, io::Write, pin::Pin};

use anyhow::{Result, ensure};
use bincode::{
    Decode, Encode,
    de::{Decoder, read::Reader as _},
    enc::{Encoder, write::Writer as _},
    error::{DecodeError, EncodeError},
    impl_borrow_decode,
};
use turbo_tasks::{NonLocalValue, ResolvedVc, TryJoinIterExt};

use crate::rope::{InnerRope, Rope, RopeBuilder};

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
/// hash (writing a [`crate::File::from_cell_rope`] file does).
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
    Inline(InlineRope),
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

/// The contents of an inline segment. Stored without its length, which is recomputed when the
/// rope is read.
#[derive(Clone, Debug, NonLocalValue)]
struct InlineRope(#[turbo_tasks(unsafe_ignore)] InnerRope);

impl PartialEq for InlineRope {
    fn eq(&self, other: &Self) -> bool {
        Rope::from_inner(self.0.clone()) == Rope::from_inner(other.0.clone())
    }
}

impl Eq for InlineRope {}

/// Encoded like a [`Rope`]: the length followed by the raw bytes.
impl Encode for InlineRope {
    fn encode<E: Encoder>(&self, encoder: &mut E) -> Result<(), EncodeError> {
        let rope = Rope::from_inner(self.0.clone());
        rope.len().encode(encoder)?;
        for chunk in &mut rope.read() {
            encoder.writer().write(chunk)?;
        }
        Ok(())
    }
}

impl<Context> Decode<Context> for InlineRope {
    fn decode<D: Decoder<Context = Context>>(decoder: &mut D) -> Result<Self, DecodeError> {
        let length = usize::decode(decoder)?;
        decoder.claim_bytes_read(length)?;
        let mut bytes = vec![0; length];
        decoder.reader().read(&mut bytes)?;
        Ok(InlineRope(Rope::from(bytes).into_inner()))
    }
}

impl_borrow_decode!(InlineRope);

impl CellRope {
    /// Reads every referenced cell (and nested rope) and concatenates the segments into a flat
    /// [`Rope`].
    ///
    /// This doesn't copy any bytes: the result shares the cells' buffers, and skipped ranges are
    /// left out with [`Rope::skip`]. If any cell fails to read (or a skipped range doesn't fit its
    /// cell), this fails too; a partial rope is never returned.
    pub async fn read(&self) -> Result<Rope> {
        self.read_segments(true).await
    }

    /// Like [`CellRope::read`], but reads the cells without tracking a dependency on them.
    pub async fn read_untracked(&self) -> Result<Rope> {
        self.read_segments(false).await
    }

    fn read_segments(
        &self,
        tracked: bool,
    ) -> Pin<Box<dyn Future<Output = Result<Rope>> + Send + '_>> {
        Box::pin(async move {
            let parts = self
                .segments
                .iter()
                .map(async |segment| -> Result<Rope> {
                    Ok(match segment {
                        CellRopeSegment::Inline(inline) => Rope::from_inner(inline.0.clone()),
                        CellRopeSegment::Cell(cell) => {
                            if tracked {
                                (*cell.await?).clone()
                            } else {
                                (*cell.untracked().await?).clone()
                            }
                        }
                        CellRopeSegment::SkippedCell { cell, skip } => {
                            let (rope, skip) = if tracked {
                                ((*cell.await?).clone(), *skip.await?)
                            } else {
                                ((*cell.untracked().await?).clone(), *skip.untracked().await?)
                            };
                            skip_range(rope, &skip)?
                        }
                        CellRopeSegment::Nested(rope) => {
                            let rope = if tracked {
                                rope.await?
                            } else {
                                rope.untracked().await?
                            };
                            rope.read_segments(tracked).await?
                        }
                    })
                })
                .try_join()
                .await?;
            let mut builder = RopeBuilder::default();
            for part in &parts {
                builder.concat(part);
            }
            Ok(builder.build())
        })
    }

    /// The number of cells this rope references directly (not counting nested ropes' cells).
    pub fn cell_count(&self) -> usize {
        self.segments
            .iter()
            .filter(|segment| {
                matches!(
                    segment,
                    CellRopeSegment::Cell(_) | CellRopeSegment::SkippedCell { .. }
                )
            })
            .count()
    }

    /// The rope's segments, in order, without reading any cells.
    pub fn parts(&self) -> impl Iterator<Item = CellRopePart> + '_ {
        self.segments.iter().map(|segment| match segment {
            CellRopeSegment::Inline(inline) => {
                CellRopePart::Inline(Rope::from_inner(inline.0.clone()))
            }
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
                CellRopeSegment::Inline(inline) => {
                    self.inline.concat(&Rope::from_inner(inline.0.clone()));
                }
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
            self.segments
                .push(CellRopeSegment::Inline(InlineRope(inline.into_inner())));
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

#[cfg(test)]
mod tests {
    use anyhow::{Result, bail};
    use turbo_rcstr::RcStr;
    use turbo_tasks::{State, Vc};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};

    use super::*;

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

    /// `<inner>` wrapped as `[` + nested(inner) + `]`, without copying `inner`'s segments.
    #[turbo_tasks::function(operation, root)]
    fn wrap_operation(inner: ResolvedVc<CellRope>) -> Vc<CellRope> {
        let mut builder = CellRopeBuilder::default();
        builder += "[";
        builder.push_rope(inner);
        builder += "]";
        builder.build().cell()
    }

    /// Like [`read_composed_operation`], but through a rope nesting the composed one.
    #[turbo_tasks::function(operation, root)]
    async fn read_nested_composed_operation(switch: ResolvedVc<Switch>) -> Result<Vc<RcStr>> {
        let mut builder = CellRopeBuilder::default();
        builder.push_rope(compose(*switch).to_resolved().await?);
        builder += "!";
        Ok(Vc::cell(builder.build().read().await?.to_str()?.into()))
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
    async fn text_item(text: ResolvedVc<Text>) -> Result<Vc<Rope>> {
        Ok(Rope::from(text.await?.text.get().to_string()).cell())
    }

    /// `a<text>d`, referencing the text item without reading it.
    #[turbo_tasks::function]
    async fn inner_rope(text: ResolvedVc<Text>) -> Result<Vc<CellRope>> {
        let mut builder = CellRopeBuilder::default();
        builder += "a";
        builder.push_cell(text_item(*text).to_resolved().await?);
        builder += "d";
        Ok(builder.build().cell())
    }

    /// `[` + nested(inner) + `]`.
    #[turbo_tasks::function]
    async fn outer_rope(text: ResolvedVc<Text>) -> Result<Vc<CellRope>> {
        let mut builder = CellRopeBuilder::default();
        builder += "[";
        builder.push_rope(inner_rope(*text).to_resolved().await?);
        builder += "]";
        Ok(builder.build().cell())
    }

    #[turbo_tasks::function(operation, root)]
    async fn read_outer_operation(text: ResolvedVc<Text>) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            outer_rope(*text).await?.read().await?.to_str()?.into(),
        ))
    }

    /// Reads untracked; `nonce` makes each call a fresh task, so its result isn't a cached one.
    #[turbo_tasks::function(operation, root)]
    async fn read_outer_untracked_operation(
        text: ResolvedVc<Text>,
        nonce: u32,
    ) -> Result<Vc<RcStr>> {
        let _ = nonce;
        let outer = outer_rope(*text).to_resolved().await?;
        Ok(Vc::cell(
            outer
                .untracked()
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
                assert_eq!(rope.cell_count(), 1);
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

    /// The skip is stored as a reference too, and survives encoding.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn skipped_cells_round_trip_through_encoding() {
        turbo_tasks!()
            .run_once(async {
                let (rope, _) = read_skipping(Some((2, 4))).await?;
                let config = bincode::config::standard();
                let encoded = bincode::encode_to_vec(&rope, config)?;
                assert!(encoded.len() < 32, "encoded to {} bytes", encoded.len());
                let (decoded, _): (CellRope, _) = bincode::decode_from_slice(&encoded, config)?;
                assert_eq!(decoded, rope);
                assert_eq!(decoded.read().await?.to_str()?, "abcefd");
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
        assert_eq!(rope.cell_count(), 0);
    }

    #[test]
    fn inline_segments_round_trip_through_encoding() {
        let segment = InlineRope(Rope::from("scaffolding".to_string()).into_inner());
        let config = bincode::config::standard();
        let bytes = bincode::encode_to_vec(&segment, config).unwrap();
        let (decoded, _): (InlineRope, _) = bincode::decode_from_slice(&bytes, config).unwrap();
        assert_eq!(decoded, segment);
        assert_eq!(Rope::from_inner(decoded.0).to_str().unwrap(), "scaffolding");
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn read_concatenates_inline_and_cell_segments() {
        turbo_tasks!()
            .run_once(async {
                let switch = switch_operation().resolve().strongly_consistent().await?;
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
                assert_eq!(rope.await?.cell_count(), 2);
                let text = read_operation(rope).read_strongly_consistent().await?;
                assert_eq!(text.as_str(), "abcdef");
                anyhow::Ok(())
            })
            .await
            .unwrap();
    }

    /// The point of a `CellRope`: persisting it stores references, not the referenced bytes.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn encoding_stores_references_not_bytes() {
        turbo_tasks!()
            .run_once(async {
                let switch = switch_operation().resolve().strongly_consistent().await?;
                let big = "x".repeat(100_000);
                let first = item_operation(switch, big.clone().into())
                    .resolve()
                    .strongly_consistent()
                    .await?;
                let second = item_operation(switch, big.into())
                    .resolve()
                    .strongly_consistent()
                    .await?;
                let rope = compose_operation(first, second)
                    .resolve()
                    .strongly_consistent()
                    .await?;
                let rope = rope.await?;
                assert_eq!(rope.read().await?.len(), 200_002);
                let encoded = bincode::encode_to_vec(&*rope, bincode::config::standard())?;
                assert!(encoded.len() < 64, "encoded to {} bytes", encoded.len());
                anyhow::Ok(())
            })
            .await
            .unwrap();
    }

    /// A nested rope reads as the concatenation, tracked and untracked, and an outer rope that
    /// nests a large one still persists only references.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn nested_ropes_read_flat_and_encode_as_references() {
        turbo_tasks!()
            .run_once(async {
                let switch = switch_operation().resolve().strongly_consistent().await?;
                let first = item_operation(switch, "bc".into())
                    .resolve()
                    .strongly_consistent()
                    .await?;
                let big = "x".repeat(100_000);
                let second = item_operation(switch, big.into())
                    .resolve()
                    .strongly_consistent()
                    .await?;
                let inner = compose_operation(first, second)
                    .resolve()
                    .strongly_consistent()
                    .await?;
                let outer = wrap_operation(inner)
                    .resolve()
                    .strongly_consistent()
                    .await?;

                let expected = format!("[abcd{}]", "x".repeat(100_000));
                let tracked = read_operation(outer).read_strongly_consistent().await?;
                assert_eq!(tracked.as_str(), expected);
                let untracked = read_untracked_operation(outer)
                    .read_strongly_consistent()
                    .await?;
                assert_eq!(untracked.as_str(), expected);

                let outer = outer.await?;
                assert_eq!(outer.cell_count(), 0);
                let encoded = bincode::encode_to_vec(&*outer, bincode::config::standard())?;
                assert!(encoded.len() < 32, "encoded to {} bytes", encoded.len());
                anyhow::Ok(())
            })
            .await
            .unwrap();
    }

    /// A tracked read through a nested rope is invalidated by a change of a cell inside the
    /// nested rope, even though neither rope changes; an untracked read sees the current bytes.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn nested_reads_follow_inner_cell_changes() {
        turbo_tasks!()
            .run_once(async {
                let text_op = text_operation();
                let text = text_op.resolve().strongly_consistent().await?;
                let tracked = read_outer_operation(text);
                assert_eq!(tracked.read_strongly_consistent().await?.as_str(), "[abcd]");
                assert_eq!(
                    read_outer_untracked_operation(text, 0)
                        .read_strongly_consistent()
                        .await?
                        .as_str(),
                    "[abcd]"
                );

                text_op
                    .read_strongly_consistent()
                    .await?
                    .text
                    .set("xyz".into());

                assert_eq!(
                    tracked.read_strongly_consistent().await?.as_str(),
                    "[axyzd]"
                );
                assert_eq!(
                    read_outer_untracked_operation(text, 1)
                        .read_strongly_consistent()
                        .await?
                        .as_str(),
                    "[axyzd]"
                );
                anyhow::Ok(())
            })
            .await
            .unwrap();
    }

    /// An item error inside a nested rope surfaces when the outer rope is read.
    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn item_errors_surface_through_nested_ropes() {
        turbo_tasks!()
            .run_once(async {
                let switch_op = switch_operation();
                let switch = switch_op.resolve().strongly_consistent().await?;
                let read = read_nested_composed_operation(switch);
                assert_eq!(read.read_strongly_consistent().await?.as_str(), "abcdef!");

                switch_op.read_strongly_consistent().await?.fail.set(true);

                let err = read
                    .read_strongly_consistent()
                    .await
                    .expect_err("reading must fail once a nested item fails");
                assert!(
                    format!("{err:?}").contains("item bc failed"),
                    "unexpected error: {err:?}"
                );
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
}
