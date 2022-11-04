use std::{
    borrow::Cow,
    cmp::min,
    fmt::Debug,
    io::{self, BufRead, Read, Result as IoResult, Write},
    mem, ops,
    pin::Pin,
    sync::Arc,
    task::{Context as TaskContext, Poll},
};

use anyhow::{Context, Result};
use bytes::{Buf, Bytes};
use futures::Stream;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use tokio::io::{AsyncRead, ReadBuf};
use turbo_tasks_hash::{DeterministicHash, DeterministicHasher};
use RopeElem::{Local, Shared};

static EMPTY_BUF: &[u8] = &[];

/// A Rope provides an efficient structure for sharing bytes/strings between
/// multiple sources. Cloning a Rope is extremely cheap (Arc and usize), and
/// the sharing contents of one Rope can be shared by just cloning an Arc.
///
/// Ropes are immutable, in order to construct one see [RopeBuilder].
#[turbo_tasks::value(shared, serialization = "custom")]
#[derive(Clone, Debug, Default)]
pub struct Rope {
    /// Total length of all held bytes.
    length: usize,

    /// A shareable container holding the rope's bytes.
    data: InnerRope,
}

/// An Arc container for ropes. This indirection allows for easily sharing the
/// contents between Ropes (and also RopeBuilders/RopeReaders).
#[turbo_tasks::value(shared, serialization = "none", eq = "manual")]
#[derive(Clone, Debug, Default)]
struct InnerRope(#[turbo_tasks(debug_ignore, trace_ignore)] Arc<Vec<RopeElem>>);

/// Differentiates the types of stored bytes in a rope.
#[derive(Clone, Debug)]
enum RopeElem {
    /// Local bytes are owned directly by this rope.
    Local(Bytes),

    /// Shared holds the Arc container of another rope.
    Shared(InnerRope),
}

/// RopeBuilder provides a mutable container to append bytes/strings. This can
/// also append _other_ Rope instances cheaply, allowing efficient sharing of
/// the contents without a full clone of the bytes.
#[derive(Default)]
pub struct RopeBuilder {
    /// Total length of all previously committed bytes.
    length: usize,

    /// Immutable bytes references that have been appended to this builder. The
    /// rope's is the combination of all these committed bytes.
    committed: Vec<RopeElem>,

    /// Mutable bytes collection where non-static/non-shared bytes are written.
    /// This builds until the next time a static or shared bytes is
    /// appended, in which case we split the buffer and commit. Finishing
    /// the builder also commits these bytes.
    writable: Vec<u8>,
}

impl Rope {
    pub fn len(&self) -> usize {
        self.length
    }

    pub fn is_empty(&self) -> bool {
        self.length == 0
    }

    /// Returns a Read/AsyncRead/Stream/Iterator instance over all bytes.
    pub fn read(&self) -> RopeReader {
        RopeReader::new(&self.data)
    }

    /// Returns a String instance of all bytes.
    pub fn to_str(&self) -> Result<Cow<'_, str>> {
        if self.data.len() == 1 {
            if let Local(bytes) = &self.data[0] {
                let utf8 = std::str::from_utf8(bytes);
                return utf8
                    .context("failed to convert rope into string")
                    .map(Cow::Borrowed);
            }
        }

        let mut read = self.read();
        let mut string = String::with_capacity(self.len());
        let res = read.read_to_string(&mut string);
        res.context("failed to convert rope into string")?;
        Ok(Cow::Owned(string))
    }
}

impl<T: Into<Bytes>> From<T> for Rope {
    fn from(bytes: T) -> Self {
        let bytes = bytes.into();
        Rope {
            length: bytes.len(),
            data: InnerRope::from(bytes),
        }
    }
}

impl RopeBuilder {
    /// Push owned bytes into the Rope.
    ///
    /// If possible use [push_static_bytes] or `+=` operation instead, as they
    /// will create a reference to shared memory instead of cloning the bytes.
    pub fn push_bytes(&mut self, bytes: &[u8]) {
        self.length += bytes.len();
        self.writable.extend(bytes);
    }

    /// Push static lifetime bytes into the Rope.
    ///
    /// This is more efficient than pushing owned bytes, because the internal
    /// data does not need to be copied when the rope is read.
    pub fn push_static_bytes(&mut self, bytes: &'static [u8]) {
        // If the string is smaller than the cost of a Bytes reference (4 usizes), then
        // it's more efficient to own the bytes in a new buffer. We may be able to reuse
        // that buffer when more bytes are pushed.
        if bytes.len() < mem::size_of::<Bytes>() {
            return self.push_bytes(bytes);
        }

        // We may have pending bytes from a prior push.
        self.finish();

        self.length += bytes.len();
        self.committed.push(Local(bytes.into()));
    }

    /// Concatenate another Rope instance into our builder.
    ///
    /// This is much more efficient than pushing actual bytes, since we can
    /// share the other Rope's references without copying the underlying data.
    pub fn concat(&mut self, other: &Rope) {
        // We may have pending bytes from a prior push.
        self.finish();

        self.length += other.len();
        self.committed.push(Shared(other.data.clone()));
    }

    /// Writes any pending bytes into our committed queue.
    ///
    /// This may be called multiple times without issue.
    pub fn finish(&mut self) {
        if !self.writable.is_empty() {
            let writable = mem::take(&mut self.writable);
            self.committed.push(Local(writable.into()));
        }
    }

    pub fn len(&self) -> usize {
        self.length
    }

    pub fn is_empty(&self) -> bool {
        self.length == 0
    }

    /// Constructs our final, immutable Rope instance.
    pub fn build(mut self) -> Rope {
        self.finish();
        Rope {
            length: self.length,
            data: self.committed.into(),
        }
    }
}

impl From<&'static str> for RopeBuilder {
    default fn from(bytes: &'static str) -> Self {
        let mut r = RopeBuilder::default();
        r.push_static_bytes(bytes.as_bytes());
        r
    }
}

impl From<Vec<u8>> for RopeBuilder {
    fn from(bytes: Vec<u8>) -> Self {
        RopeBuilder {
            length: bytes.len(),
            committed: vec![],
            writable: bytes,
        }
    }
}

impl Write for RopeBuilder {
    fn write(&mut self, bytes: &[u8]) -> IoResult<usize> {
        self.push_bytes(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> IoResult<()> {
        self.finish();
        Ok(())
    }
}

impl ops::AddAssign<&'static str> for RopeBuilder {
    /// Pushes a reference to static memory onto the rope.
    ///
    /// This is more efficient than pushing owned bytes, because the internal
    /// data does not need to be copied when the rope is read.
    fn add_assign(&mut self, rhs: &'static str) {
        self.push_static_bytes(rhs.as_bytes());
    }
}

impl ops::AddAssign<&Rope> for RopeBuilder {
    fn add_assign(&mut self, rhs: &Rope) {
        self.concat(rhs);
    }
}

impl DeterministicHash for Rope {
    /// Ropes with similar contents hash the same, regardless of their
    /// structure.
    fn deterministic_hash<H: DeterministicHasher>(&self, state: &mut H) {
        state.write_usize(self.len());
        self.data.deterministic_hash(state);
    }
}

impl Serialize for Rope {
    /// Ropes are always serialized into contiguous strings, because
    /// deserialization won't deduplicate and share the Arcs (being the only
    /// possible owner of a individual "shared" data doesn't make sense).
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::Error;
        let s = self.to_str().map_err(Error::custom)?;
        serializer.serialize_str(&s)
    }
}

impl<'de> Deserialize<'de> for Rope {
    /// Deserializes strings into a contiguous, immutable Rope.
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let bytes = <Vec<u8>>::deserialize(deserializer)?;
        Ok(Rope::from(bytes))
    }
}

impl DeterministicHash for InnerRope {
    /// Ropes with similar contents hash the same, regardless of their
    /// structure. Notice the InnerRope does not contain a length (and any
    /// shared InnerRopes won't either), so the exact structure isn't
    /// relevant at this point.
    fn deterministic_hash<H: DeterministicHasher>(&self, state: &mut H) {
        for v in self.0.iter() {
            v.deterministic_hash(state);
        }
    }
}

impl From<Bytes> for InnerRope {
    fn from(bytes: Bytes) -> Self {
        InnerRope::from(vec![Local(bytes)])
    }
}

impl From<Vec<RopeElem>> for InnerRope {
    fn from(els: Vec<RopeElem>) -> Self {
        InnerRope(Arc::new(els))
    }
}

impl PartialEq for InnerRope {
    /// Ropes with similar contents are equals, regardless of their structure.
    fn eq(&self, other: &Self) -> bool {
        let mut left = RopeReader::new(self);
        let mut right = RopeReader::new(other);

        loop {
            match (left.fill_buf(), right.fill_buf()) {
                // fill_buf should always return Ok, with either some number of bytes or 0 bytes
                // when consumed.
                (Ok(a), Ok(b)) => {
                    let len = min(a.len(), b.len());

                    // When one buffer is consumed, both must be consumed.
                    if len == 0 {
                        return a.len() == b.len();
                    }

                    if a[0..len] != b[0..len] {
                        return false;
                    }

                    left.consume(len);
                    right.consume(len);
                }

                // If an error is ever returned (which shouldn't happen for us) for either/both,
                // then we can't prove equality.
                _ => return false,
            }
        }
    }
}
impl Eq for InnerRope {}

impl ops::Deref for InnerRope {
    type Target = Arc<Vec<RopeElem>>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl DeterministicHash for RopeElem {
    /// Ropes with similar contents hash the same, regardless of their
    /// structure. Notice the Bytes length is not hashed, and shared InnerRopes
    /// do not contain a length.
    fn deterministic_hash<H: DeterministicHasher>(&self, state: &mut H) {
        match self {
            Local(bytes) => state.write_bytes(bytes),
            Shared(inner) => inner.deterministic_hash(state),
        }
    }
}

/// Implements the Read/AsyncRead/Stream/Iterator trait over a Rope.
pub struct RopeReader {
    /// The Rope's tree is kept as a cloned stack, allowing us to accomplish
    /// incremental yielding.
    stack: Vec<StackElem>,
}

/// A StackElem holds the current index into either a Bytes or a shared Rope.
/// When the index reaches the end of the associated data, it is removed and we
/// continue onto the next item in the stack.
enum StackElem {
    Local(Bytes),
    Shared(InnerRope, usize),
}

impl RopeReader {
    fn new(rope: &InnerRope) -> Self {
        RopeReader {
            stack: vec![StackElem::from(rope)],
        }
    }

    /// A shared implementation for reading bytes. This takes the basic
    /// operations needed for both Read and AsyncRead.
    fn read_internal(&mut self, want: usize, buf: &mut ReadBuf<'_>) -> usize {
        let mut remaining = want;

        while remaining > 0 {
            let mut bytes = match self.next() {
                None => break,
                Some(b) => b,
            };

            let amount = min(bytes.len(), remaining);

            buf.put_slice(&bytes[0..amount]);

            if amount < bytes.len() {
                bytes.advance(amount);
                self.stack.push(StackElem::Local(bytes))
            }
            remaining -= amount;
        }

        want - remaining
    }
}

impl Iterator for RopeReader {
    type Item = Bytes;

    /// Iterates the rope's elements recursively until we find the next Local
    /// section, returning its Bytes.
    fn next(&mut self) -> Option<Self::Item> {
        loop {
            let (inner, mut index) = match self.stack.pop() {
                None => return None,
                Some(StackElem::Local(b)) => return Some(b),
                Some(StackElem::Shared(r, i)) => (r, i),
            };

            let el = inner[index].clone();
            index += 1;
            if index < inner.len() {
                self.stack.push(StackElem::Shared(inner, index));
            }

            self.stack.push(StackElem::from(el));
        }
    }
}

impl Read for RopeReader {
    /// Reads the Rope into the provided buffer.
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        Ok(self.read_internal(buf.len(), &mut ReadBuf::new(buf)))
    }
}

impl AsyncRead for RopeReader {
    /// Reads the Rope into the provided buffer, asynchronously.
    fn poll_read(
        self: Pin<&mut Self>,
        _cx: &mut TaskContext<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        let this = self.get_mut();
        this.read_internal(buf.remaining(), buf);
        Poll::Ready(Ok(()))
    }
}

impl BufRead for RopeReader {
    /// Returns the full buffer without coping any data. The same bytes will
    /// continue to be returned until [consume] is called to either consume a
    /// partial amount of bytes (in which case the Bytes will advance beyond
    /// them) or the full amount of bytes (in which case the next Bytes will be
    /// returned).
    fn fill_buf(&mut self) -> IoResult<&[u8]> {
        let bytes = match self.next() {
            None => return Ok(EMPTY_BUF),
            Some(b) => b,
        };

        self.stack.push(StackElem::Local(bytes));
        let bytes = match self.stack.last() {
            Some(StackElem::Local(b)) => b,
            _ => unreachable!(),
        };
        Ok(bytes)
    }

    /// Consumes some amount of bytes from the current Bytes instance, ensuring
    /// those bytes are not returned on the next call to [fill_buf].
    fn consume(&mut self, amt: usize) {
        if let Some(StackElem::Local(b)) = self.stack.last_mut() {
            if amt == b.len() {
                self.stack.pop();
            } else {
                b.advance(amt);
            }
        }
    }
}

impl Stream for RopeReader {
    /// The Result<Bytes> item type is required for this to be streamable into a
    /// [Hyper::Body].
    type Item = Result<Bytes>;

    /// Returns a "result" of reading the next shared bytes reference. This
    /// differs from [Read::read] by not copying any memory.
    fn poll_next(self: Pin<&mut Self>, _cx: &mut TaskContext<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();

        let bytes = match this.next() {
            None => return Poll::Ready(None),
            Some(b) => b,
        };

        Poll::Ready(Some(Ok(bytes)))
    }
}

impl From<&InnerRope> for StackElem {
    fn from(rope: &InnerRope) -> Self {
        Self::Shared(rope.clone(), 0)
    }
}

impl From<RopeElem> for StackElem {
    fn from(el: RopeElem) -> Self {
        match el {
            Local(bytes) => Self::Local(bytes),
            Shared(inner) => Self::Shared(inner, 0),
        }
    }
}
