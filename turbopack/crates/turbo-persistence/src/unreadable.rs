//! A typed marker for errors that mean a database file can't be read anymore.

use std::{error::Error, fmt};

/// Marks an error caused by a database file that can't be read while the database is in use: an
/// SST or blob file that is missing or can't be opened or read, or that fails its checksum.
///
/// The database reads SST and blob files lazily, so such a file can become unreadable after the
/// database was opened, e.g. when it is deleted or modified by another process. The error of such
/// a read is wrapped in this marker, so that callers can tell this case apart from other errors
/// using [`CacheFileUnreadable::find`].
///
/// The marker is transparent: it displays as the error it wraps, and its [`Error::source`] is that
/// error's source, so marking an error doesn't change how it's printed.
#[derive(Debug)]
pub struct CacheFileUnreadable {
    file_name: String,
    error: anyhow::Error,
}

impl CacheFileUnreadable {
    /// Marks `error` as being caused by the file `file_name` in the database directory being
    /// unreadable.
    pub fn new(file_name: impl Into<String>, error: anyhow::Error) -> Self {
        Self {
            file_name: file_name.into(),
            error,
        }
    }

    /// The name of the file that can't be read, relative to the database directory, e.g.
    /// `00000007.sst`.
    pub fn file_name(&self) -> &str {
        &self.file_name
    }

    /// Finds the marker in the chain of `error`, if any.
    pub fn find(error: &anyhow::Error) -> Option<&Self> {
        error
            .downcast_ref::<Self>()
            .or_else(|| error.chain().find_map(|cause| cause.downcast_ref::<Self>()))
    }
}

impl fmt::Display for CacheFileUnreadable {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Only the outermost message: the causes are reported through `source`. (Forwarding `f`
        // would print the whole chain of the wrapped error for `{:#}`.)
        write!(f, "{}", self.error)
    }
}

impl Error for CacheFileUnreadable {
    fn source(&self) -> Option<&(dyn Error + 'static)> {
        self.error.source()
    }
}

/// Extension to mark the error of a [`Result`] as [`CacheFileUnreadable`].
pub(crate) trait MarkUnreadable<T> {
    /// Marks an error as being caused by `file_name` being unreadable, unless it's already marked.
    fn mark_unreadable(self, file_name: impl FnOnce() -> String) -> anyhow::Result<T>;
}

impl<T, E: Into<anyhow::Error>> MarkUnreadable<T> for Result<T, E> {
    fn mark_unreadable(self, file_name: impl FnOnce() -> String) -> anyhow::Result<T> {
        self.map_err(|error| {
            let error = error.into();
            if CacheFileUnreadable::find(&error).is_some() {
                error
            } else {
                anyhow::Error::new(CacheFileUnreadable::new(file_name(), error))
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use anyhow::{Context, anyhow};

    use super::*;

    fn error() -> anyhow::Error {
        anyhow!("No such file or directory").context("Unable to open 00000001.sst")
    }

    /// The `{:?}` output of `error` without its backtrace (if `RUST_BACKTRACE` is set), which
    /// differs depending on where it was captured.
    fn debug_without_backtrace(error: &anyhow::Error) -> String {
        let debug = format!("{error:?}");
        match debug.find("\n\nStack backtrace:") {
            Some(index) => debug[..index].to_string(),
            None => debug,
        }
    }

    #[test]
    fn marking_does_not_change_how_an_error_is_printed() {
        let marked = Err::<(), _>(error())
            .mark_unreadable(|| "00000001.sst".to_string())
            .context("Looking up a key failed")
            .unwrap_err();
        let unmarked = error().context("Looking up a key failed");
        assert_eq!(format!("{marked}"), format!("{unmarked}"));
        assert_eq!(format!("{marked:#}"), format!("{unmarked:#}"));
        assert_eq!(
            debug_without_backtrace(&marked),
            debug_without_backtrace(&unmarked)
        );
        assert_eq!(
            CacheFileUnreadable::find(&marked).map(CacheFileUnreadable::file_name),
            Some("00000001.sst")
        );
        assert!(CacheFileUnreadable::find(&unmarked).is_none());
    }

    #[test]
    fn marking_twice_keeps_the_first_file() {
        let marked = Err::<(), _>(error())
            .mark_unreadable(|| "00000001.sst".to_string())
            .mark_unreadable(|| "00000002.sst".to_string())
            .unwrap_err();
        assert_eq!(
            CacheFileUnreadable::find(&marked).map(CacheFileUnreadable::file_name),
            Some("00000001.sst")
        );
    }
}
