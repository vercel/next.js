//! Types for working with [`File`].
//!
//! [`File`]: File

pub(crate) const MAX_BUF: usize = 2 * 1024 * 1024;

use std::{
    cmp, fmt,
    fs::{File as StdFile, Metadata, Permissions},
    future::Future,
    io::{self, Read, Seek, SeekFrom, Write},
    path::Path,
    pin::Pin,
    sync::Arc,
    task::{Context, Poll, Poll::*},
};

use tokio::{
    io::{AsyncRead, AsyncSeek, ReadBuf},
    sync::Mutex,
    task::{spawn_blocking, JoinHandle},
};

pub(crate) async fn asyncify<F, T>(f: F) -> io::Result<T>
where
    F: FnOnce() -> io::Result<T> + Send + 'static,
    T: Send + 'static,
{
    match spawn_blocking(f).await {
        Ok(res) => res,
        Err(_) => Err(io::Error::new(
            io::ErrorKind::Other,
            "background task failed",
        )),
    }
}

#[derive(Debug)]
pub(crate) struct Buf {
    buf: Vec<u8>,
    pos: usize,
}

/// Repeats operations that are interrupted.
macro_rules! uninterruptibly {
    ($e:expr) => {{
        loop {
            match $e {
                Err(ref e) if e.kind() == io::ErrorKind::Interrupted => {}
                res => break res,
            }
        }
    }};
}
macro_rules! ready {
    ($e:expr $(,)?) => {
        match $e {
            std::task::Poll::Ready(t) => t,
            std::task::Poll::Pending => return std::task::Poll::Pending,
        }
    };
}

impl Buf {
    pub(crate) fn with_capacity(n: usize) -> Buf {
        Buf {
            buf: Vec::with_capacity(n),
            pos: 0,
        }
    }

    pub(crate) fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub(crate) fn len(&self) -> usize {
        self.buf.len() - self.pos
    }

    pub(crate) fn copy_to(&mut self, dst: &mut ReadBuf<'_>) -> usize {
        let n = cmp::min(self.len(), dst.remaining());
        dst.put_slice(&self.bytes()[..n]);
        self.pos += n;

        if self.pos == self.buf.len() {
            self.buf.truncate(0);
            self.pos = 0;
        }

        n
    }

    pub(crate) fn copy_from(&mut self, src: &[u8]) -> usize {
        assert!(self.is_empty());

        let n = cmp::min(src.len(), MAX_BUF);

        self.buf.extend_from_slice(&src[..n]);
        n
    }

    pub(crate) fn bytes(&self) -> &[u8] {
        &self.buf[self.pos..]
    }

    pub(crate) fn ensure_capacity_for(&mut self, bytes: &ReadBuf<'_>) {
        assert!(self.is_empty());

        let len = cmp::min(bytes.remaining(), MAX_BUF);

        if self.buf.len() < len {
            self.buf.reserve(len - self.buf.len());
        }

        unsafe {
            self.buf.set_len(len);
        }
    }

    pub(crate) fn read_from<T: Read>(&mut self, rd: &mut T) -> io::Result<usize> {
        let res = uninterruptibly!(rd.read(&mut self.buf));

        if let Ok(n) = res {
            self.buf.truncate(n);
        } else {
            self.buf.clear();
        }

        assert_eq!(self.pos, 0);

        res
    }

    pub(crate) fn write_to<T: Write>(&mut self, wr: &mut T) -> io::Result<()> {
        assert_eq!(self.pos, 0);

        // `write_all` already ignores interrupts
        let res = wr.write_all(&self.buf);
        self.buf.clear();
        res
    }

    pub(crate) fn discard_read(&mut self) -> i64 {
        let ret = -(self.bytes().len() as i64);
        self.pos = 0;
        self.buf.truncate(0);
        ret
    }
}

use self::State::*;

/// A reference to an open file on the filesystem.
///
/// This is a specialized version of [`std::fs::File`][std] for usage from the
/// Tokio runtime.
///
/// An instance of a `File` can be read and/or written depending on what options
/// it was opened with. Files also implement [`AsyncSeek`] to alter the logical
/// cursor that the file contains internally.
///
/// A file will not be closed immediately when it goes out of scope if there
/// are any IO operations that have not yet completed. To ensure that a file is
/// closed immediately when it is dropped, you should call [`flush`] before
/// dropping it. Note that this does not ensure that the file has been fully
/// written to disk; the operating system might keep the changes around in an
/// in-memory buffer. See the [`sync_all`] method for telling the OS to write
/// the data to disk.
///
/// Reading and writing to a `File` is usually done using the convenience
/// methods found on the [`AsyncReadExt`] and [`AsyncWriteExt`] traits.
///
/// [std]: struct@std::fs::File
/// [`AsyncSeek`]: trait@crate::io::AsyncSeek
/// [`flush`]: fn@crate::io::AsyncWriteExt::flush
/// [`sync_all`]: fn@crate::fs::File::sync_all
/// [`AsyncReadExt`]: trait@crate::io::AsyncReadExt
/// [`AsyncWriteExt`]: trait@crate::io::AsyncWriteExt
///
/// # Examples
///
/// Create a new file and asynchronously write bytes to it:
///
/// ```no_run
/// use tokio::fs::File;
/// use tokio::io::AsyncWriteExt; // for write_all()
///
/// # async fn dox() -> std::io::Result<()> {
/// let mut file = File::create("foo.txt").await?;
/// file.write_all(b"hello, world!").await?;
/// # Ok(())
/// # }
/// ```
///
/// Read the contents of a file into a buffer:
///
/// ```no_run
/// use tokio::fs::File;
/// use tokio::io::AsyncReadExt; // for read_to_end()
///
/// # async fn dox() -> std::io::Result<()> {
/// let mut file = File::open("foo.txt").await?;
///
/// let mut contents = vec![];
/// file.read_to_end(&mut contents).await?;
///
/// println!("len = {}", contents.len());
/// # Ok(())
/// # }
/// ```
pub struct File {
    std: Arc<StdFile>,
    inner: Mutex<Inner>,
}

struct Inner {
    state: State,

    /// Errors from writes/flushes are returned in write/flush calls. If a write
    /// error is observed while performing a read, it is saved until the next
    /// write / flush call.
    last_write_err: Option<io::ErrorKind>,

    pos: u64,
}

#[derive(Debug)]
enum State {
    Idle(Option<Buf>),
    Busy(JoinHandle<(Operation, Buf)>),
}

#[derive(Debug)]
enum Operation {
    Read(io::Result<usize>),
    Write(io::Result<()>),
    Seek(io::Result<u64>),
}

impl File {
    /// Attempts to open a file in read-only mode.
    ///
    /// See [`OpenOptions`] for more details.
    ///
    /// [`OpenOptions`]: super::OpenOptions
    ///
    /// # Errors
    ///
    /// This function will return an error if called from outside of the Tokio
    /// runtime or if path does not already exist. Other errors may also be
    /// returned according to OpenOptions::open.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use tokio::fs::File;
    /// use tokio::io::AsyncReadExt;
    ///
    /// # async fn dox() -> std::io::Result<()> {
    /// let mut file = File::open("foo.txt").await?;
    ///
    /// let mut contents = vec![];
    /// file.read_to_end(&mut contents).await?;
    ///
    /// println!("len = {}", contents.len());
    /// # Ok(())
    /// # }
    /// ```
    ///
    /// The [`read_to_end`] method is defined on the [`AsyncReadExt`] trait.
    ///
    /// [`read_to_end`]: fn@crate::io::AsyncReadExt::read_to_end
    /// [`AsyncReadExt`]: trait@crate::io::AsyncReadExt
    pub async fn open(path: impl AsRef<Path>) -> io::Result<File> {
        let path = path.as_ref().to_owned();
        let std = asyncify(|| StdFile::open(path)).await?;

        Ok(File::from_std(std))
    }

    /// Opens a file in write-only mode.
    ///
    /// This function will create a file if it does not exist, and will truncate
    /// it if it does.
    ///
    /// See [`OpenOptions`] for more details.
    ///
    /// [`OpenOptions`]: super::OpenOptions
    ///
    /// # Errors
    ///
    /// Results in an error if called from outside of the Tokio runtime or if
    /// the underlying [`create`] call results in an error.
    ///
    /// [`create`]: std::fs::File::create
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use tokio::fs::File;
    /// use tokio::io::AsyncWriteExt;
    ///
    /// # async fn dox() -> std::io::Result<()> {
    /// let mut file = File::create("foo.txt").await?;
    /// file.write_all(b"hello, world!").await?;
    /// # Ok(())
    /// # }
    /// ```
    ///
    /// The [`write_all`] method is defined on the [`AsyncWriteExt`] trait.
    ///
    /// [`write_all`]: fn@crate::io::AsyncWriteExt::write_all
    /// [`AsyncWriteExt`]: trait@crate::io::AsyncWriteExt
    pub async fn create(path: impl AsRef<Path>) -> io::Result<File> {
        let path = path.as_ref().to_owned();
        let std_file = asyncify(move || StdFile::create(path)).await?;
        Ok(File::from_std(std_file))
    }

    /// Converts a [`std::fs::File`][std] to a [`tokio::fs::File`][file].
    ///
    /// [std]: std::fs::File
    /// [file]: File
    ///
    /// # Examples
    ///
    /// ```no_run
    /// // This line could block. It is not recommended to do this on the Tokio
    /// // runtime.
    /// let std_file = std::fs::File::open("foo.txt").unwrap();
    /// let file = tokio::fs::File::from_std(std_file);
    /// ```
    pub fn from_std(std: StdFile) -> File {
        File {
            std: Arc::new(std),
            inner: Mutex::new(Inner {
                state: State::Idle(Some(Buf::with_capacity(0))),
                last_write_err: None,
                pos: 0,
            }),
        }
    }

    /// Attempts to sync all OS-internal metadata to disk.
    ///
    /// This function will attempt to ensure that all in-core data reaches the
    /// filesystem before returning.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use tokio::fs::File;
    /// use tokio::io::AsyncWriteExt;
    ///
    /// # async fn dox() -> std::io::Result<()> {
    /// let mut file = File::create("foo.txt").await?;
    /// file.write_all(b"hello, world!").await?;
    /// file.sync_all().await?;
    /// # Ok(())
    /// # }
    /// ```
    ///
    /// The [`write_all`] method is defined on the [`AsyncWriteExt`] trait.
    ///
    /// [`write_all`]: fn@crate::io::AsyncWriteExt::write_all
    /// [`AsyncWriteExt`]: trait@crate::io::AsyncWriteExt
    pub async fn sync_all(&self) -> io::Result<()> {
        let mut inner = self.inner.lock().await;
        inner.complete_inflight().await;

        let std = self.std.clone();
        asyncify(move || std.sync_all()).await
    }

    /// This function is similar to `sync_all`, except that it may not
    /// synchronize file metadata to the filesystem.
    ///
    /// This is intended for use cases that must synchronize content, but don't
    /// need the metadata on disk. The goal of this method is to reduce disk
    /// operations.
    ///
    /// Note that some platforms may simply implement this in terms of
    /// `sync_all`.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use tokio::fs::File;
    /// use tokio::io::AsyncWriteExt;
    ///
    /// # async fn dox() -> std::io::Result<()> {
    /// let mut file = File::create("foo.txt").await?;
    /// file.write_all(b"hello, world!").await?;
    /// file.sync_data().await?;
    /// # Ok(())
    /// # }
    /// ```
    ///
    /// The [`write_all`] method is defined on the [`AsyncWriteExt`] trait.
    ///
    /// [`write_all`]: fn@crate::io::AsyncWriteExt::write_all
    /// [`AsyncWriteExt`]: trait@crate::io::AsyncWriteExt
    pub async fn sync_data(&self) -> io::Result<()> {
        let mut inner = self.inner.lock().await;
        inner.complete_inflight().await;

        let std = self.std.clone();
        asyncify(move || std.sync_data()).await
    }

    /// Truncates or extends the underlying file, updating the size of this file
    /// to become size.
    ///
    /// If the size is less than the current file's size, then the file will be
    /// shrunk. If it is greater than the current file's size, then the file
    /// will be extended to size and have all of the intermediate data filled in
    /// with 0s.
    ///
    /// # Errors
    ///
    /// This function will return an error if the file is not opened for
    /// writing.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use tokio::fs::File;
    /// use tokio::io::AsyncWriteExt;
    ///
    /// # async fn dox() -> std::io::Result<()> {
    /// let mut file = File::create("foo.txt").await?;
    /// file.write_all(b"hello, world!").await?;
    /// file.set_len(10).await?;
    /// # Ok(())
    /// # }
    /// ```
    ///
    /// The [`write_all`] method is defined on the [`AsyncWriteExt`] trait.
    ///
    /// [`write_all`]: fn@crate::io::AsyncWriteExt::write_all
    /// [`AsyncWriteExt`]: trait@crate::io::AsyncWriteExt
    pub async fn set_len(&self, size: u64) -> io::Result<()> {
        let mut inner = self.inner.lock().await;
        inner.complete_inflight().await;

        let mut buf = match inner.state {
            Idle(ref mut buf_cell) => buf_cell.take().unwrap(),
            _ => unreachable!(),
        };

        let seek = if !buf.is_empty() {
            Some(SeekFrom::Current(buf.discard_read()))
        } else {
            None
        };

        let std = self.std.clone();

        inner.state = Busy(spawn_blocking(move || {
            let res = if let Some(seek) = seek {
                (&*std).seek(seek).and_then(|_| std.set_len(size))
            } else {
                std.set_len(size)
            }
            .map(|_| 0); // the value is discarded later

            // Return the result as a seek
            (Operation::Seek(res), buf)
        }));

        let (op, buf) = match inner.state {
            Idle(_) => unreachable!(),
            Busy(ref mut rx) => rx.await?,
        };

        inner.state = Idle(Some(buf));

        match op {
            Operation::Seek(res) => res.map(|pos| {
                inner.pos = pos;
            }),
            _ => unreachable!(),
        }
    }

    /// Queries metadata about the underlying file.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use tokio::fs::File;
    ///
    /// # async fn dox() -> std::io::Result<()> {
    /// let file = File::open("foo.txt").await?;
    /// let metadata = file.metadata().await?;
    ///
    /// println!("{:?}", metadata);
    /// # Ok(())
    /// # }
    /// ```
    pub async fn metadata(&self) -> io::Result<Metadata> {
        let std = self.std.clone();
        asyncify(move || std.metadata()).await
    }

    /// Creates a new `File` instance that shares the same underlying file
    /// handle as the existing `File` instance. Reads, writes, and seeks
    /// will affect both File instances simultaneously.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use tokio::fs::File;
    ///
    /// # async fn dox() -> std::io::Result<()> {
    /// let file = File::open("foo.txt").await?;
    /// let file_clone = file.try_clone().await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn try_clone(&self) -> io::Result<File> {
        let std = self.std.clone();
        let std_file = asyncify(move || std.try_clone()).await?;
        Ok(File::from_std(std_file))
    }

    /// Destructures `File` into a [`std::fs::File`][std]. This function is
    /// async to allow any in-flight operations to complete.
    ///
    /// Use `File::try_into_std` to attempt conversion immediately.
    ///
    /// [std]: std::fs::File
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use tokio::fs::File;
    ///
    /// # async fn dox() -> std::io::Result<()> {
    /// let tokio_file = File::open("foo.txt").await?;
    /// let std_file = tokio_file.into_std().await;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn into_std(mut self) -> StdFile {
        self.inner.get_mut().complete_inflight().await;
        Arc::try_unwrap(self.std).expect("Arc::try_unwrap failed")
    }

    /// Tries to immediately destructure `File` into a [`std::fs::File`][std].
    ///
    /// [std]: std::fs::File
    ///
    /// # Errors
    ///
    /// This function will return an error containing the file if some
    /// operation is in-flight.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use tokio::fs::File;
    ///
    /// # async fn dox() -> std::io::Result<()> {
    /// let tokio_file = File::open("foo.txt").await?;
    /// let std_file = tokio_file.try_into_std().unwrap();
    /// # Ok(())
    /// # }
    /// ```
    pub fn try_into_std(mut self) -> Result<StdFile, Self> {
        match Arc::try_unwrap(self.std) {
            Ok(file) => Ok(file),
            Err(std_file_arc) => {
                self.std = std_file_arc;
                Err(self)
            }
        }
    }

    /// Changes the permissions on the underlying file.
    ///
    /// # Platform-specific behavior
    ///
    /// This function currently corresponds to the `fchmod` function on Unix and
    /// the `SetFileInformationByHandle` function on Windows. Note that, this
    /// [may change in the future][changes].
    ///
    /// [changes]: https://doc.rust-lang.org/std/io/index.html#platform-specific-behavior
    ///
    /// # Errors
    ///
    /// This function will return an error if the user lacks permission change
    /// attributes on the underlying file. It may also return an error in other
    /// os-specific unspecified cases.
    ///
    /// # Examples
    ///
    /// ```no_run
    /// use tokio::fs::File;
    ///
    /// # async fn dox() -> std::io::Result<()> {
    /// let file = File::open("foo.txt").await?;
    /// let mut perms = file.metadata().await?.permissions();
    /// perms.set_readonly(true);
    /// file.set_permissions(perms).await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn set_permissions(&self, perm: Permissions) -> io::Result<()> {
        let std = self.std.clone();
        asyncify(move || std.set_permissions(perm)).await
    }
}

impl AsyncRead for File {
    fn poll_read(
        self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        dst: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        let me = self.get_mut();
        let inner = me.inner.get_mut();

        loop {
            match inner.state {
                Idle(ref mut buf_cell) => {
                    let mut buf = buf_cell.take().unwrap();

                    if !buf.is_empty() {
                        buf.copy_to(dst);
                        *buf_cell = Some(buf);
                        return Ready(Ok(()));
                    }

                    buf.ensure_capacity_for(dst);
                    let std = me.std.clone();

                    inner.state = Busy(spawn_blocking(move || {
                        let res = buf.read_from(&mut &*std);
                        (Operation::Read(res), buf)
                    }));
                }
                Busy(ref mut rx) => {
                    let (op, mut buf) = ready!(Pin::new(rx).poll(cx))?;

                    match op {
                        Operation::Read(Ok(_)) => {
                            buf.copy_to(dst);
                            inner.state = Idle(Some(buf));
                            return Ready(Ok(()));
                        }
                        Operation::Read(Err(e)) => {
                            assert!(buf.is_empty());

                            inner.state = Idle(Some(buf));
                            return Ready(Err(e));
                        }
                        Operation::Write(Ok(_)) => {
                            assert!(buf.is_empty());
                            inner.state = Idle(Some(buf));
                            continue;
                        }
                        Operation::Write(Err(e)) => {
                            assert!(inner.last_write_err.is_none());
                            inner.last_write_err = Some(e.kind());
                            inner.state = Idle(Some(buf));
                        }
                        Operation::Seek(result) => {
                            assert!(buf.is_empty());
                            inner.state = Idle(Some(buf));
                            if let Ok(pos) = result {
                                inner.pos = pos;
                            }
                            continue;
                        }
                    }
                }
            }
        }
    }
}

impl AsyncSeek for File {
    fn start_seek(self: Pin<&mut Self>, mut pos: SeekFrom) -> io::Result<()> {
        let me = self.get_mut();
        let inner = me.inner.get_mut();

        match inner.state {
            Busy(_) => Err(io::Error::new(
                io::ErrorKind::Other,
                "other file operation is pending, call poll_complete before start_seek",
            )),
            Idle(ref mut buf_cell) => {
                let mut buf = buf_cell.take().unwrap();

                // Factor in any unread data from the buf
                if !buf.is_empty() {
                    let n = buf.discard_read();

                    if let SeekFrom::Current(ref mut offset) = pos {
                        *offset += n;
                    }
                }

                let std = me.std.clone();

                inner.state = Busy(spawn_blocking(move || {
                    let res = (&*std).seek(pos);
                    (Operation::Seek(res), buf)
                }));
                Ok(())
            }
        }
    }

    fn poll_complete(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<u64>> {
        let inner = self.inner.get_mut();

        loop {
            match inner.state {
                Idle(_) => return Poll::Ready(Ok(inner.pos)),
                Busy(ref mut rx) => {
                    let (op, buf) = ready!(Pin::new(rx).poll(cx))?;
                    inner.state = Idle(Some(buf));

                    match op {
                        Operation::Read(_) => {}
                        Operation::Write(Err(e)) => {
                            assert!(inner.last_write_err.is_none());
                            inner.last_write_err = Some(e.kind());
                        }
                        Operation::Write(_) => {}
                        Operation::Seek(res) => {
                            if let Ok(pos) = res {
                                inner.pos = pos;
                            }
                            return Ready(res);
                        }
                    }
                }
            }
        }
    }
}

impl From<StdFile> for File {
    fn from(std: StdFile) -> Self {
        Self::from_std(std)
    }
}

impl fmt::Debug for File {
    fn fmt(&self, fmt: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt.debug_struct("tokio::fs::File")
            .field("std", &self.std)
            .finish()
    }
}

#[cfg(unix)]
impl std::os::unix::io::AsRawFd for File {
    fn as_raw_fd(&self) -> std::os::unix::io::RawFd {
        self.std.as_raw_fd()
    }
}

#[cfg(unix)]
impl std::os::unix::io::FromRawFd for File {
    unsafe fn from_raw_fd(fd: std::os::unix::io::RawFd) -> Self {
        StdFile::from_raw_fd(fd).into()
    }
}

#[cfg(windows)]
impl std::os::windows::io::AsRawHandle for File {
    fn as_raw_handle(&self) -> std::os::windows::io::RawHandle {
        self.std.as_raw_handle()
    }
}

#[cfg(windows)]
impl std::os::windows::io::FromRawHandle for File {
    unsafe fn from_raw_handle(handle: std::os::windows::io::RawHandle) -> Self {
        StdFile::from_raw_handle(handle).into()
    }
}

pub struct PollFn<F> {
    f: F,
}

/// Creates a new future wrapping around a function returning [`Poll`].
pub fn poll_fn<T, F>(f: F) -> PollFn<F>
where
    F: FnMut(&mut Context<'_>) -> Poll<T>,
{
    PollFn { f }
}

impl<F> fmt::Debug for PollFn<F> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("PollFn").finish()
    }
}

impl<T, F> Future for PollFn<F>
where
    F: FnMut(&mut Context<'_>) -> Poll<T>,
{
    type Output = T;

    fn poll(self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<T> {
        // Safety: We never construct a `Pin<&mut F>` anywhere, so accessing `f`
        // mutably in an unpinned way is sound.
        //
        // This use of unsafe cannot be replaced with the pin-project macro
        // because:
        //  * If we put `#[pin]` on the field, then it gives us a `Pin<&mut F>`, which
        //    we can't use to call the closure.
        //  * If we don't put `#[pin]` on the field, then it makes `PollFn` be
        //    unconditionally `Unpin`, which we also don't want.
        let me = unsafe { Pin::into_inner_unchecked(self) };
        (me.f)(cx)
    }
}

impl Inner {
    async fn complete_inflight(&mut self) {
        if let Err(e) = poll_fn(|cx| Pin::new(&mut *self).poll_flush(cx)).await {
            self.last_write_err = Some(e.kind());
        }
    }

    fn poll_flush(&mut self, cx: &mut Context<'_>) -> Poll<Result<(), io::Error>> {
        if let Some(e) = self.last_write_err.take() {
            return Ready(Err(e.into()));
        }

        let (op, buf) = match self.state {
            Idle(_) => return Ready(Ok(())),
            Busy(ref mut rx) => ready!(Pin::new(rx).poll(cx))?,
        };

        // The buffer is not used here
        self.state = Idle(Some(buf));

        match op {
            Operation::Read(_) => Ready(Ok(())),
            Operation::Write(res) => Ready(res),
            Operation::Seek(_) => Ready(Ok(())),
        }
    }
}
