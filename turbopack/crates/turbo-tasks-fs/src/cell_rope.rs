//! [`CellRope`]: a rope whose contents are partly owned by other cells.

use std::io::Write;

use anyhow::Result;
use bincode::{
    Decode, Encode,
    de::{Decoder, read::Reader as _},
    enc::{Encoder, write::Writer as _},
    error::{DecodeError, EncodeError},
    impl_borrow_decode,
};
use turbo_tasks::{NonLocalValue, ReadRef, ResolvedVc, TryJoinIterExt};

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
/// the responsibility of whoever composes the rope, which reads the cells (tracked) while doing
/// so. A `CellRope` is therefore only *consistent* for the cell values observed when it was
/// composed; consumers that need to detect staleness compare a content hash (writing a
/// [`crate::File::from_cell_rope`] file does).
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
    /// Reads every referenced cell and concatenates the segments into a flat [`Rope`].
    ///
    /// This doesn't copy any bytes: the result shares the cells' buffers. If any cell fails to
    /// read, this fails too; a partial rope is never returned.
    pub async fn read(&self) -> Result<Rope> {
        let cells = self
            .segments
            .iter()
            .filter_map(|segment| match segment {
                CellRopeSegment::Cell(cell) => Some(async move { cell.await }),
                CellRopeSegment::Inline(_) => None,
            })
            .try_join()
            .await?;
        Ok(self.concat(cells))
    }

    /// Like [`CellRope::read`], but reads the cells without tracking a dependency on them.
    pub async fn read_untracked(&self) -> Result<Rope> {
        let cells = self
            .segments
            .iter()
            .filter_map(|segment| match segment {
                CellRopeSegment::Cell(cell) => Some(async move { cell.untracked().await }),
                CellRopeSegment::Inline(_) => None,
            })
            .try_join()
            .await?;
        Ok(self.concat(cells))
    }

    fn concat(&self, cells: Vec<ReadRef<Rope>>) -> Rope {
        let mut cells = cells.into_iter();
        let mut builder = RopeBuilder::default();
        for segment in &self.segments {
            match segment {
                CellRopeSegment::Inline(inline) => {
                    builder.concat(&Rope::from_inner(inline.0.clone()));
                }
                CellRopeSegment::Cell(_) => {
                    let cell = cells.next().expect("one read per cell segment");
                    builder.concat(&cell);
                }
            }
        }
        builder.build()
    }

    /// The number of cells this rope references.
    pub fn cell_count(&self) -> usize {
        self.segments
            .iter()
            .filter(|segment| matches!(segment, CellRopeSegment::Cell(_)))
            .count()
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

    /// Appends a reference to a cell owned by another task. `cell` must not be empty: the
    /// composer is expected to skip empty cells, so that the rope's segments line up with the
    /// bytes it describes.
    pub fn push_cell(&mut self, cell: ResolvedVc<Rope>) {
        self.flush_inline();
        self.segments.push(CellRopeSegment::Cell(cell));
    }

    /// Appends all of `rope`'s segments.
    pub fn append(&mut self, rope: &CellRope) {
        for segment in &rope.segments {
            match segment {
                CellRopeSegment::Inline(inline) => {
                    self.inline.concat(&Rope::from_inner(inline.0.clone()));
                }
                CellRopeSegment::Cell(cell) => self.push_cell(*cell),
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
