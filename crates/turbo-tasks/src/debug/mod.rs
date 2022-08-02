use crate as turbo_tasks;

#[doc(hidden)]
pub mod internal;

/// The return type of `ValueDebug::dbg`.
///
/// We don't use `StringVc` directly because we don't want the `Debug`/`Display`
/// representations to be escaped.
#[turbo_tasks::value]
pub struct ValueDebugString(String);

impl std::fmt::Debug for ValueDebugString {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::fmt::Display for ValueDebugString {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl ValueDebugString {
    /// Returns the underlying string.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl ValueDebugStringVc {
    /// Create a new `ValueDebugStringVc` from a string.
    pub fn new(s: String) -> Self {
        ValueDebugStringVc::cell(ValueDebugString(s))
    }
}

/// `Debug`-like trait for `Vc` types, automatically derived when using
/// `turbo_tasks::value` and `turbo_tasks::value_trait`.
///
/// # Usage
///
/// ```rust
/// dbg!(any_vc.dbg().await?);
/// ```
#[turbo_tasks::value_trait(no_debug)]
pub trait ValueDebug {
    fn dbg(&self) -> ValueDebugStringVc;
}
