use std::{
    borrow::Cow,
    cmp::{Ordering, min},
    fmt,
    io::{BufRead, Read, Result as IoResult, Write},
    mem,
    ops::{AddAssign, Deref},
    pin::Pin,
    task::{Context as TaskContext, Poll},
};

use RopeElem::{Local, Shared};
use anyhow::{Context, Result};
use bincode::{
    Decode, Encode,
    de::{Decoder, read::Reader as _},
    enc::{Encoder, write::Writer as _},
    error::{DecodeError, EncodeError},
    impl_borrow_decode,
};
use bytes::Bytes;
use futures::Stream;
use tokio::io::{AsyncRead, ReadBuf};
use triomphe::Arc;
use turbo_tasks_hash::{DeterministicHash, DeterministicHasher};

static EMPTY_BUF: &[u8] = &[];

/// An efficient structure for sharing bytes/strings between multiple sources.
///
/// Cloning a Rope is extremely cheap (Arc and usize), and
/// sharing the contents of one Rope can be done by just cloning an Arc.
///
/// Ropes are immutable, in order to construct one see [RopeBuilder].
#[turbo_tasks::value(shared, serialization = "custom", eq = "manual", operation)]
#[derive(Clone, Debug, Default)]
pub struct Rope {
    /// Total length of all held bytes.
    length: usize,

    /// A shareable container holding the rope's bytes.
    #[turbo_tasks(debug_ignore, trace_ignore)]
    data: InnerRope,
}

/// An Arc container for ropes. This indirection allows for easily sharing the
/// contents between Ropes (and also RopeBuilders/RopeReaders).
#[derive(Clone, Debug)]
struct InnerRope(Arc<Vec<RopeElem>>);

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
#[derive(Default, Debug)]
pub struct RopeBuilder {
    /// Total length of all previously committed bytes.
    length: usize,

    /// Immutable bytes references that have been appended to this builder. The
    /// rope is the combination of all these committed bytes.
    committed: Vec<RopeElem>,

    /// Stores bytes that have been pushed, but are not yet committed. This is
    /// either an attempt to push a static lifetime, or a push of owned bytes.
    /// When the builder is flushed, we will commit these bytes into a real
    /// Bytes instance.
    uncommitted: Uncommitted,
}

/// Stores any bytes which have been pushed, but we haven't decided to commit
/// yet. Uncommitted bytes allow us to build larger buffers out of possibly
/// small pushes.
#[derive(Default)]
enum Uncommitted {
    #[default]
    None,

    /// Stores our attempt to push static lifetime bytes into the rope. If we
    /// build the Rope or concatenate another Rope, we can commit a static
    /// Bytes reference and save memory. If not, we'll concatenate this into
    /// writable bytes to be committed later.
    Static(&'static [u8]),

    /// Mutable bytes collection where non-static/non-shared bytes are written.
    /// This builds until the next time a static or shared bytes is
    /// appended, in which case we split the buffer and commit. Finishing
    /// the builder also commits these bytes.
    Owned(Vec<u8>),
}

impl Rope {
    pub fn len(&self) -> usize {
        self.length
    }

    pub fn is_empty(&self) -> bool {
        self.length == 0
    }

    /// Returns a [Read]/[AsyncRead]/[Iterator] instance over all bytes.
    pub fn read(&self) -> RopeReader<'_> {
        RopeReader::new(&self.data, 0)
    }

    /// Returns a String instance of all bytes.
    pub fn to_str(&self) -> Result<Cow<'_, str>> {
        self.data.to_str(self.length)
    }

    /// Returns a slice of all bytes
    pub fn to_bytes(&self) -> Cow<'_, [u8]> {
        self.data.to_bytes(self.length)
    }

    pub fn into_bytes(self) -> Bytes {
        self.data.into_bytes(self.length)
    }
}

impl From<Vec<u8>> for Rope {
    fn from(mut bytes: Vec<u8>) -> Self {
        bytes.shrink_to_fit();
        Rope::from(Bytes::from(bytes))
    }
}

impl From<String> for Rope {
    fn from(mut bytes: String) -> Self {
        bytes.shrink_to_fit();
        Rope::from(Bytes::from(bytes))
    }
}

impl<T: Into<Bytes>> From<T> for Rope {
    default fn from(bytes: T) -> Self {
        let bytes = bytes.into();
        // We can't have an InnerRope which contains an empty Local section.
        if bytes.is_empty() {
            Default::default()
        } else {
            Rope {
                length: bytes.len(),
                data: InnerRope(Arc::from(vec![Local(bytes)])),
            }
        }
    }
}

impl RopeBuilder {
    /// Push owned bytes into the Rope.
    ///
    /// If possible use [push_static_bytes] or `+=` operation instead, as they
    /// will create a reference to shared memory instead of cloning the bytes.
    pub fn push_bytes(&mut self, bytes: &[u8]) {
        if bytes.is_empty() {
            return;
        }

        self.uncommitted.push_bytes(bytes);
    }

    /// Reserve additional capacity for owned bytes in the Rope.
    ///
    /// This is useful to call before multiple `push_bytes` calls to avoid
    /// multiple allocations.
    pub fn reserve_bytes(&mut self, additional: usize) {
        self.uncommitted.reserve_bytes(additional);
    }

    /// Push static lifetime bytes into the Rope.
    ///
    /// This is more efficient than pushing owned bytes, because the internal
    /// data does not need to be copied when the rope is read.
    pub fn push_static_bytes(&mut self, bytes: &'static [u8]) {
        if bytes.is_empty() {
            return;
        }

        // If the string is smaller than the cost of a Bytes reference (4 usizes), then
        // it's more efficient to own the bytes in a new buffer. We may be able to reuse
        // that buffer when more bytes are pushed.
        if bytes.len() < mem::size_of::<Bytes>() {
            return self.uncommitted.push_static_bytes(bytes);
        }

        // We may have pending bytes from a prior push.
        self.finish();

        self.length += bytes.len();
        self.committed.push(Local(Bytes::from_static(bytes)));
    }

    /// Concatenate another Rope instance into our builder.
    ///
    /// This is much more efficient than pushing actual bytes, since we can
    /// share the other Rope's references without copying the underlying data.
    pub fn concat(&mut self, other: &Rope) {
        if other.is_empty() {
            return;
        }

        // We may have pending bytes from a prior push.
        self.finish();

        self.length += other.len();
        self.committed.push(Shared(other.data.clone()));
    }

    /// Writes any pending bytes into our committed queue. This is called automatically by other
    /// `RopeBuilder` methods.
    ///
    /// This may be called multiple times without issue.
    fn finish(&mut self) {
        if let Some(b) = self.uncommitted.finish() {
            debug_assert!(!b.is_empty(), "must not have empty uncommitted bytes");
            self.length += b.len();
            self.committed.push(Local(b));
        }
    }

    pub fn len(&self) -> usize {
        self.length + self.uncommitted.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Constructs our final, immutable Rope instance.
    pub fn build(mut self) -> Rope {
        self.finish();
        Rope {
            length: self.length,
            data: InnerRope::from(self.committed),
        }
    }
}

impl From<&'static str> for RopeBuilder {
    default fn from(bytes: &'static str) -> Self {
        let mut r = RopeBuilder::default();
        r += bytes;
        r
    }
}

impl From<Vec<u8>> for RopeBuilder {
    fn from(bytes: Vec<u8>) -> Self {
        RopeBuilder {
            // Directly constructing the Uncommitted allows us to skip copying the bytes.
            uncommitted: Uncommitted::from(bytes),
            ..Default::default()
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

impl AddAssign<&'static str> for RopeBuilder {
    /// Pushes a reference to static memory onto the rope.
    ///
    /// This is more efficient than pushing owned bytes, because the internal
    /// data does not need to be copied when the rope is read.
    fn add_assign(&mut self, rhs: &'static str) {
        self.push_static_bytes(rhs.as_bytes());
    }
}

impl AddAssign<&Rope> for RopeBuilder {
    fn add_assign(&mut self, rhs: &Rope) {
        self.concat(rhs);
    }
}

impl Uncommitted {
    fn len(&self) -> usize {
        match self {
            Uncommitted::None => 0,
            Uncommitted::Static(s) => s.len(),
            Uncommitted::Owned(v) => v.len(),
        }
    }

    /// Pushes owned bytes, converting the current representation to an Owned if
    /// it's not already.
    fn push_bytes(&mut self, bytes: &[u8]) {
        debug_assert!(!bytes.is_empty(), "must not push empty uncommitted bytes");
        match self {
            Self::None => *self = Self::Owned(bytes.to_vec()),
            Self::Static(s) => {
                // If we'd previously pushed static bytes, we instead concatenate those bytes
                // with the new bytes in an attempt to use less memory rather than committing 2
                // Bytes references (2 * 4 usizes).
                let v = [s, bytes].concat();
                *self = Self::Owned(v);
            }
            Self::Owned(v) => v.extend(bytes),
        }
    }

    /// Reserves additional capacity for owned bytes, converting the current
    /// representation to an Owned if it's not already.
    fn reserve_bytes(&mut self, additional: usize) {
        match self {
            Self::None => {
                *self = Self::Owned(Vec::with_capacity(additional));
            }
            Self::Static(s) => {
                let mut v = Vec::with_capacity(s.len() + additional);
                v.extend_from_slice(s);
                *self = Self::Owned(v);
            }
            Self::Owned(v) => {
                v.reserve(additional);
            }
        }
    }

    /// Pushes static lifetime bytes, but only if the current representation is
    /// None. Else, it coverts to an Owned.
    fn push_static_bytes(&mut self, bytes: &'static [u8]) {
        debug_assert!(!bytes.is_empty(), "must not push empty uncommitted bytes");
        match self {
            // If we've not already pushed static bytes, we attempt to store the bytes for later. If
            // we push owned bytes or another static bytes, then this attempt will fail and we'll
            // instead concatenate into a single owned Bytes. But if we don't push anything (build
            // the Rope), or concatenate another Rope (we can't join our bytes with the InnerRope of
            // another Rope), we'll be able to commit a static Bytes reference and save overall
            // memory (a small static Bytes reference is better than a small owned Bytes reference).
            Self::None => *self = Self::Static(bytes),
            _ => self.push_bytes(bytes),
        }
    }

    /// Converts the current uncommitted bytes into a Bytes, resetting our
    /// representation to None.
    fn finish(&mut self) -> Option<Bytes> {
        match mem::take(self) {
            Self::None => None,
            Self::Static(s) => Some(Bytes::from_static(s)),
            Self::Owned(mut v) => {
                v.shrink_to_fit();
                Some(v.into())
            }
        }
    }
}

impl fmt::Debug for Uncommitted {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Uncommitted::None => f.write_str("None"),
            Uncommitted::Static(s) => f
                .debug_tuple("Static")
                .field(&Bytes::from_static(s))
                .finish(),
            Uncommitted::Owned(v) => f
                .debug_tuple("Owned")
                .field(&Bytes::from(v.clone()))
                .finish(),
        }
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

/// Encode as a len + raw bytes format using the encoder's [`bincode::enc::write::Writer`]. Encoding
/// [`Rope::to_bytes`] instead would be easier, but would require copying to an intermediate buffer.
///
/// This len + bytes format is similar to how bincode would normally encode a `&[u8]`:
/// https://docs.rs/bincode/latest/bincode/spec/index.html#collections
impl Encode for Rope {
    fn encode<E: Encoder>(&self, encoder: &mut E) -> Result<(), EncodeError> {
        self.length.encode(encoder)?;
        let mut reader = self.read();
        for chunk in &mut reader {
            encoder.writer().write(chunk)?;
        }

        Ok(())
    }
}

impl<Context> Decode<Context> for Rope {
    #[allow(clippy::uninit_vec)]
    fn decode<D: Decoder<Context = Context>>(decoder: &mut D) -> Result<Self, DecodeError> {
        let length = usize::decode(decoder)?;
        let mut bytes = Vec::with_capacity(length);

        // SAFETY:
        // - `bytes` has capacity of `length` already
        // - `read` writes to (does not read) `bytes` and will return an error if exactly `length`
        //   bytes is not written, so no uninitialized memory ever escapes this function.
        // We can't use `MaybeUninit` here because `read` doesn't support it.
        unsafe {
            bytes.set_len(length);
        }
        // the decoder API requires that we claim a length *before* reading (not after)
        decoder.claim_bytes_read(length)?;
        decoder.reader().read(&mut bytes)?;

        Ok(Rope::from(bytes))
    }
}

impl_borrow_decode!(Rope);

pub mod ser_as_string {
    use serde::{Serializer, ser::Error};

    use super::Rope;

    /// Serializes a Rope into a string.
    pub fn serialize<S: Serializer>(rope: &Rope, serializer: S) -> Result<S::Ok, S::Error> {
        let s = rope.to_str().map_err(Error::custom)?;
        serializer.serialize_str(&s)
    }
}

pub mod ser_option_as_string {
    use serde::{Serializer, ser::Error};

    use super::Rope;

    /// Serializes a Rope into a string.
    pub fn serialize<S: Serializer>(rope: &Option<Rope>, serializer: S) -> Result<S::Ok, S::Error> {
        if let Some(rope) = rope {
            let s = rope.to_str().map_err(Error::custom)?;
            serializer.serialize_some(&s)
        } else {
            serializer.serialize_none()
        }
    }
}

impl PartialEq for Rope {
    // Ropes with similar contents are equals, regardless of their structure.
    fn eq(&self, other: &Self) -> bool {
        if self.len() != other.len() {
            return false;
        }
        self.cmp(other) == Ordering::Equal
    }
}

impl Eq for Rope {}

impl Ord for Rope {
    fn cmp(&self, other: &Self) -> Ordering {
        if Arc::ptr_eq(&self.data, &other.data) {
            return Ordering::Equal;
        }

        // Fast path for structurally equal Ropes. With this, we can do memory reference
        // checks and skip some contents equality.
        let left = &self.data;
        let right = &other.data;
        let len = min(left.len(), right.len());
        let mut index = 0;
        while index < len {
            let a = &left[index];
            let b = &right[index];

            match a.maybe_cmp(b) {
                // Bytes or InnerRope point to the same memory, or Bytes are contents equal.
                Some(Ordering::Equal) => index += 1,
                // Bytes are not contents equal.
                Some(ordering) => return ordering,
                // InnerRopes point to different memory, or the Ropes weren't structurally equal.
                None => break,
            }
        }
        // If we reach the end of iteration without finding a mismatch (or early
        // breaking), then we know the ropes are either equal or not equal.
        if index == len {
            // We know that any remaining RopeElem in the InnerRope must contain content, so
            // if either one contains more RopeElem than they cannot be equal.
            return left.len().cmp(&right.len());
        }

        // At this point, we need to do slower contents equality. It's possible we'll
        // still get some memory reference equality for Bytes.
        let mut left = RopeReader::new(left, index);
        let mut right = RopeReader::new(right, index);
        loop {
            match (left.fill_buf(), right.fill_buf()) {
                // fill_buf should always return Ok, with either some number of bytes or 0 bytes
                // when consumed.
                (Ok(a), Ok(b)) => {
                    let len = min(a.len(), b.len());

                    // When one buffer is consumed, both must be consumed.
                    if len == 0 {
                        return a.len().cmp(&b.len());
                    }

                    match a[0..len].cmp(&b[0..len]) {
                        Ordering::Equal => {
                            left.consume(len);
                            right.consume(len);
                        }
                        ordering => return ordering,
                    }
                }

                // If an error is ever returned (which shouldn't happen for us) for either/both,
                // then we can't prove equality.
                _ => unreachable!(),
            }
        }
    }
}

impl PartialOrd for Rope {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl From<Vec<u8>> for Uncommitted {
    fn from(bytes: Vec<u8>) -> Self {
        if bytes.is_empty() {
            Uncommitted::None
        } else {
            Uncommitted::Owned(bytes)
        }
    }
}

impl InnerRope {
    /// Returns a String instance of all bytes.
    fn to_str(&self, len: usize) -> Result<Cow<'_, str>> {
        match &self[..] {
            [] => Ok(Cow::Borrowed("")),
            [Shared(inner)] => inner.to_str(len),
            [Local(bytes)] => {
                let utf8 = std::str::from_utf8(bytes);
                utf8.context("failed to convert rope into string")
                    .map(Cow::Borrowed)
            }
            _ => {
                let mut read = RopeReader::new(self, 0);
                let mut string = String::with_capacity(len);
                let res = read.read_to_string(&mut string);
                res.context("failed to convert rope into string")?;
                Ok(Cow::Owned(string))
            }
        }
    }

    /// Returns a slice of all bytes.
    fn to_bytes(&self, len: usize) -> Cow<'_, [u8]> {
        match &self[..] {
            [] => Cow::Borrowed(EMPTY_BUF),
            [Shared(inner)] => inner.to_bytes(len),
            [Local(bytes)] => Cow::Borrowed(bytes),
            _ => {
                let mut read = RopeReader::new(self, 0);
                let mut buf = Vec::with_capacity(len);
                read.read_to_end(&mut buf)
                    .expect("rope reader should not fail");
                buf.into()
            }
        }
    }

    fn into_bytes(mut self, len: usize) -> Bytes {
        if self.0.is_empty() {
            return Bytes::default();
        } else if self.0.len() == 1 {
            let data = Arc::try_unwrap(self.0);
            match data {
                Ok(data) => {
                    return data.into_iter().next().unwrap().into_bytes(len);
                }
                Err(data) => {
                    // If we have a single element, we can return it directly.
                    if let Local(bytes) = &data[0] {
                        return bytes.clone();
                    }
                    self.0 = data;
                }
            }
        }

        let mut read = RopeReader::new(&self, 0);
        let mut buf = Vec::with_capacity(len);
        read.read_to_end(&mut buf)
            .expect("read of rope cannot fail");
        buf.into()
    }
}

impl Default for InnerRope {
    fn default() -> Self {
        InnerRope(Arc::new(vec![]))
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

impl From<Vec<RopeElem>> for InnerRope {
    fn from(mut els: Vec<RopeElem>) -> Self {
        if cfg!(debug_assertions) {
            // It's important that an InnerRope never contain an empty Bytes section.
            for el in els.iter() {
                match el {
                    Local(b) => debug_assert!(!b.is_empty(), "must not have empty Bytes"),
                    Shared(s) => {
                        // We check whether the shared slice is empty, and not its elements. The
                        // only way to construct the Shared's InnerRope is
                        // in this mod, and we have already checked that
                        // none of its elements are empty.
                        debug_assert!(!s.is_empty(), "must not have empty InnerRope");
                    }
                }
            }
        }
        els.shrink_to_fit();
        InnerRope(Arc::from(els))
    }
}

impl Deref for InnerRope {
    type Target = Arc<Vec<RopeElem>>;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl RopeElem {
    fn maybe_cmp(&self, other: &Self) -> Option<Ordering> {
        match (self, other) {
            (Local(a), Local(b)) => {
                if a.len() == b.len() {
                    return Some(a.cmp(b));
                }

                // But if not, the rope may still be contents equal if a following section
                // contains the missing bytes.
                None
            }
            (Shared(a), Shared(b)) => {
                if Arc::ptr_eq(&a.0, &b.0) {
                    return Some(Ordering::Equal);
                }

                // But if not, they might still be equal and we need to fallback to slower
                // equality.
                None
            }
            _ => None,
        }
    }

    fn into_bytes(self, len: usize) -> Bytes {
        match self {
            Local(bytes) => bytes,
            Shared(inner) => inner.into_bytes(len),
        }
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

#[derive(Debug, Default)]
/// Implements the [Read]/[AsyncRead]/[Iterator] trait over a [Rope].
pub struct RopeReader<'a> {
    /// The Rope's tree is kept as a stack, allowing us to accomplish incremental yielding.
    stack: Vec<StackElem<'a>>,
    /// An offset in the current buffer, used by the `read` implementation.
    offset: usize,
}

/// A StackElem holds the current index into either a Bytes or a shared Rope.
/// When the index reaches the end of the associated data, it is removed and we
/// continue onto the next item in the stack.
#[derive(Debug)]
enum StackElem<'a> {
    Local(&'a Bytes),
    Shared(&'a InnerRope, usize),
}

impl<'a> RopeReader<'a> {
    fn new(inner: &'a InnerRope, index: usize) -> Self {
        if index >= inner.len() {
            Default::default()
        } else {
            RopeReader {
                stack: vec![StackElem::Shared(inner, index)],
                offset: 0,
            }
        }
    }

    /// A shared implementation for reading bytes. This takes the basic
    /// operations needed for both Read and AsyncRead.
    fn read_internal(&mut self, want: usize, buf: &mut ReadBuf<'_>) -> usize {
        let mut remaining = want;

        while remaining > 0 {
            let bytes = match self.next_internal() {
                None => break,
                Some(b) => b,
            };

            let lower = self.offset;
            let upper = min(bytes.len(), lower + remaining);

            buf.put_slice(&bytes[self.offset..upper]);

            if upper < bytes.len() {
                self.offset = upper;
                self.stack.push(StackElem::Local(bytes))
            } else {
                self.offset = 0;
            }
            remaining -= upper - lower;
        }

        want - remaining
    }

    /// Returns the next item in the iterator without modifying `self.offset`.
    fn next_internal(&mut self) -> Option<&'a Bytes> {
        // Iterates the rope's elements recursively until we find the next Local
        // section, returning its Bytes.
        loop {
            let (inner, mut index) = match self.stack.pop() {
                None => return None,
                Some(StackElem::Local(b)) => {
                    debug_assert!(!b.is_empty(), "must not have empty Bytes section");
                    return Some(b);
                }
                Some(StackElem::Shared(r, i)) => (r, i),
            };

            let el = &inner[index];
            index += 1;
            if index < inner.len() {
                self.stack.push(StackElem::Shared(inner, index));
            }

            self.stack.push(StackElem::from(el));
        }
    }
}

impl<'a> Iterator for RopeReader<'a> {
    type Item = &'a Bytes;

    fn next(&mut self) -> Option<Self::Item> {
        self.offset = 0;
        self.next_internal()
    }
}

impl Read for RopeReader<'_> {
    fn read(&mut self, buf: &mut [u8]) -> IoResult<usize> {
        Ok(self.read_internal(buf.len(), &mut ReadBuf::new(buf)))
    }
}

impl AsyncRead for RopeReader<'_> {
    fn poll_read(
        self: Pin<&mut Self>,
        _cx: &mut TaskContext<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<IoResult<()>> {
        let this = self.get_mut();
        this.read_internal(buf.remaining(), buf);
        Poll::Ready(Ok(()))
    }
}

impl BufRead for RopeReader<'_> {
    /// Never returns an error.
    fn fill_buf(&mut self) -> IoResult<&[u8]> {
        // Returns the full buffer without coping any data. The same bytes will
        // continue to be returned until [consume] is called.
        let bytes = match self.next_internal() {
            None => return Ok(EMPTY_BUF),
            Some(b) => b,
        };

        // This is just so we can get a reference to the asset that is kept alive by the
        // RopeReader itself. We can then auto-convert that reference into the needed u8
        // slice reference.
        self.stack.push(StackElem::Local(bytes));
        let Some(StackElem::Local(bytes)) = self.stack.last() else {
            unreachable!()
        };

        Ok(&bytes[self.offset..])
    }

    fn consume(&mut self, amt: usize) {
        if let Some(StackElem::Local(b)) = self.stack.last_mut() {
            // https://doc.rust-lang.org/std/io/trait.BufRead.html#tymethod.consume
            debug_assert!(
                self.offset + amt <= b.len(),
                "It is a logic error if `amount` exceeds the number of unread bytes in the \
                 internal buffer, which is returned by `fill_buf`."
            );
            // Consume some amount of bytes from the current Bytes instance, ensuring those bytes
            // are not returned on the next call to `fill_buf`.
            self.offset += amt;
            if self.offset == b.len() {
                // whole Bytes instance was consumed
                self.stack.pop();
                self.offset = 0;
            }
        }
    }
}

impl<'a> Stream for RopeReader<'a> {
    /// This is efficiently streamable into a [`Hyper::Body`] if each item is cloned into an owned
    /// `Bytes` instance.
    type Item = Result<&'a Bytes>;

    /// Returns a "result" of reading the next shared bytes reference. This
    /// differs from [`Read::read`] by not copying any memory.
    fn poll_next(self: Pin<&mut Self>, _cx: &mut TaskContext<'_>) -> Poll<Option<Self::Item>> {
        let this = self.get_mut();
        Poll::Ready(this.next().map(Ok))
    }
}

impl<'a> From<&'a RopeElem> for StackElem<'a> {
    fn from(el: &'a RopeElem) -> Self {
        match el {
            Local(bytes) => Self::Local(bytes),
            Shared(inner) => Self::Shared(inner, 0),
        }
    }
}

#[cfg(test)]
mod test {
    use std::{
        borrow::Cow,
        cmp::min,
        io::{BufRead, Read},
    };

    use anyhow::Result;

    use super::{InnerRope, Rope, RopeBuilder, RopeElem};

    // These are intentionally not exposed, because they do inefficient conversions
    // in order to fully test cases.
    impl From<&str> for RopeElem {
        fn from(value: &str) -> Self {
            RopeElem::Local(value.to_string().into())
        }
    }
    impl From<Vec<RopeElem>> for RopeElem {
        fn from(value: Vec<RopeElem>) -> Self {
            RopeElem::Shared(InnerRope::from(value))
        }
    }
    impl From<Rope> for RopeElem {
        fn from(value: Rope) -> Self {
            RopeElem::Shared(value.data)
        }
    }
    impl Rope {
        fn new(value: Vec<RopeElem>) -> Self {
            let data = InnerRope::from(value);
            Rope {
                length: data.len(),
                data,
            }
        }
    }
    impl InnerRope {
        fn len(&self) -> usize {
            self.iter().map(|v| v.len()).sum()
        }
    }
    impl RopeElem {
        fn len(&self) -> usize {
            match self {
                RopeElem::Local(b) => b.len(),
                RopeElem::Shared(r) => r.len(),
            }
        }
    }

    #[test]
    fn empty_build_without_pushes() {
        let empty = RopeBuilder::default().build();
        let mut reader = empty.read();
        assert!(reader.next().is_none());
    }

    #[test]
    fn empty_build_with_empty_static_push() {
        let mut builder = RopeBuilder::default();
        builder += "";

        let empty = builder.build();
        let mut reader = empty.read();
        assert!(reader.next().is_none());
    }

    #[test]
    fn empty_build_with_empty_bytes_push() {
        let mut builder = RopeBuilder::default();
        builder.push_bytes(&[]);

        let empty = builder.build();
        let mut reader = empty.read();
        assert!(reader.next().is_none());
    }

    #[test]
    fn empty_build_with_empty_concat() {
        let mut builder = RopeBuilder::default();
        builder += &RopeBuilder::default().build();

        let empty = builder.build();
        let mut reader = empty.read();
        assert!(reader.next().is_none());
    }

    #[test]
    fn empty_from_empty_static_str() {
        let empty = Rope::from("");
        let mut reader = empty.read();
        assert!(reader.next().is_none());
    }

    #[test]
    fn empty_from_empty_string() {
        let empty = Rope::from("".to_string());
        let mut reader = empty.read();
        assert!(reader.next().is_none());
    }

    #[test]
    fn empty_equality() {
        let a = Rope::from("");
        let b = Rope::from("");

        assert_eq!(a, b);
    }

    #[test]
    fn cloned_equality() {
        let a = Rope::from("abc");
        let b = a.clone();

        assert_eq!(a, b);
    }

    #[test]
    fn value_equality() {
        let a = Rope::from("abc".to_string());
        let b = Rope::from("abc".to_string());

        assert_eq!(a, b);
    }

    #[test]
    fn value_inequality() {
        let a = Rope::from("abc".to_string());
        let b = Rope::from("def".to_string());

        assert_ne!(a, b);
    }

    #[test]
    fn value_equality_shared_1() {
        let shared = Rope::from("def");
        let a = Rope::new(vec!["abc".into(), shared.clone().into(), "ghi".into()]);
        let b = Rope::new(vec!["abc".into(), shared.into(), "ghi".into()]);

        assert_eq!(a, b);
    }

    #[test]
    fn value_equality_shared_2() {
        let a = Rope::new(vec!["abc".into(), vec!["def".into()].into(), "ghi".into()]);
        let b = Rope::new(vec!["abc".into(), vec!["def".into()].into(), "ghi".into()]);

        assert_eq!(a, b);
    }

    #[test]
    fn value_equality_splits_1() {
        let a = Rope::new(vec!["a".into(), "aa".into()]);
        let b = Rope::new(vec!["aa".into(), "a".into()]);

        assert_eq!(a, b);
    }

    #[test]
    fn value_equality_splits_2() {
        let a = Rope::new(vec![vec!["a".into()].into(), "aa".into()]);
        let b = Rope::new(vec![vec!["aa".into()].into(), "a".into()]);

        assert_eq!(a, b);
    }

    #[test]
    fn value_inequality_shared_1() {
        let shared = Rope::from("def");
        let a = Rope::new(vec!["aaa".into(), shared.clone().into(), "ghi".into()]);
        let b = Rope::new(vec!["bbb".into(), shared.into(), "ghi".into()]);

        assert_ne!(a, b);
    }

    #[test]
    fn value_inequality_shared_2() {
        let a = Rope::new(vec!["abc".into(), vec!["ddd".into()].into(), "ghi".into()]);
        let b = Rope::new(vec!["abc".into(), vec!["eee".into()].into(), "ghi".into()]);

        assert_ne!(a, b);
    }

    #[test]
    fn value_inequality_shared_3() {
        let shared = Rope::from("def");
        let a = Rope::new(vec!["abc".into(), shared.clone().into(), "ggg".into()]);
        let b = Rope::new(vec!["abc".into(), shared.into(), "hhh".into()]);

        assert_ne!(a, b);
    }

    #[test]
    fn iteration() {
        let shared = Rope::from("def");
        let rope = Rope::new(vec!["abc".into(), shared.into(), "ghi".into()]);

        let chunks = rope.read().collect::<Vec<_>>();

        assert_eq!(chunks, vec!["abc", "def", "ghi"]);
    }

    #[test]
    fn read() {
        let shared = Rope::from("def");
        let rope = Rope::new(vec!["abc".into(), shared.into(), "ghi".into()]);

        let mut chunks = vec![];
        let mut buf = [0_u8; 2];
        let mut reader = rope.read();
        loop {
            let amt = reader.read(&mut buf).unwrap();
            if amt == 0 {
                break;
            }
            chunks.push(Vec::from(&buf[0..amt]));
        }

        assert_eq!(
            chunks,
            vec![
                Vec::from(*b"ab"),
                Vec::from(*b"cd"),
                Vec::from(*b"ef"),
                Vec::from(*b"gh"),
                Vec::from(*b"i")
            ]
        );
    }

    #[test]
    fn fill_buf() {
        let shared = Rope::from("def");
        let rope = Rope::new(vec!["abc".into(), shared.into(), "ghi".into()]);

        let mut chunks = vec![];
        let mut reader = rope.read();
        loop {
            let buf = reader.fill_buf().unwrap();
            if buf.is_empty() {
                break;
            }
            let c = min(2, buf.len());
            chunks.push(Vec::from(buf));
            reader.consume(c);
        }

        assert_eq!(
            chunks,
            // We're receiving a full buf, then only consuming 2 bytes, so we'll still get the
            // third.
            vec![
                Vec::from(*b"abc"),
                Vec::from(*b"c"),
                Vec::from(*b"def"),
                Vec::from(*b"f"),
                Vec::from(*b"ghi"),
                Vec::from(*b"i")
            ]
        );
    }

    #[test]
    fn test_to_bytes() -> Result<()> {
        let rope = Rope::from("abc");
        assert_eq!(rope.to_bytes(), Cow::Borrowed::<[u8]>(&[0x61, 0x62, 0x63]));
        Ok(())
    }
}
