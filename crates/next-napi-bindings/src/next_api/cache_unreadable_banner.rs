//! The message shown when Turbopack's filesystem cache couldn't be read while it was in use.
//!
//! Only depends on `std`, so that it can be tested on its own (`rustc --edition 2024 --test`): this
//! crate's test binary can't run outside of Node.js.

use std::path::Path;

/// The stderr message for a panic caused by Turbopack's filesystem cache being unreadable (see
/// `turbo_tasks::PersistentCacheUnreadablePanic`). `message` explains what couldn't be read and
/// what to do about it, `label` labels the summary (e.g. a colored "Error"), and `panic_log` is the
/// file the details were written to, if writing it succeeded.
///
/// The cache being unreadable doesn't necessarily indicate a bug (files are usually damaged from
/// outside), so unlike the message for other internal errors, this doesn't ask for a bug report.
pub fn cache_unreadable_banner(message: &str, label: &str, panic_log: Option<&Path>) -> String {
    let panic_log = panic_log
        .map(|path| format!(" A log has been written to {}.", path.to_string_lossy()))
        .unwrap_or_default();
    format!(
        "\n{message}\n\n-----\n{label}: Turbopack's filesystem cache could not be \
         read.{panic_log}\n\nStop and restart `next dev`, or run `next build` again, to rebuild \
         the cache.\n-----\n"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const MESSAGE: &str = "Turbopack's filesystem cache could not be read: the cache file \
                           00000007.sst is missing or corrupted.\nDelete /project/.next/cache and \
                           restart to continue.";

    #[test]
    fn includes_the_details_and_what_to_do() {
        let banner = cache_unreadable_banner(MESSAGE, "Error", Some(Path::new("/tmp/panic.log")));
        assert!(banner.contains(MESSAGE), "{banner}");
        assert!(
            banner.contains("Error: Turbopack's filesystem cache"),
            "{banner}"
        );
        assert!(banner.contains("/tmp/panic.log"), "{banner}");
        assert!(banner.contains("next dev"), "{banner}");
        assert!(banner.contains("next build"), "{banner}");
    }

    #[test]
    fn does_not_ask_for_a_bug_report() {
        let banner = cache_unreadable_banner(MESSAGE, "Error", Some(Path::new("/tmp/panic.log")));
        assert!(!banner.contains("bugs.nextjs.org"), "{banner}");
        assert!(!banner.contains("github.com"), "{banner}");
        assert!(!banner.contains("unexpected"), "{banner}");
        assert!(!banner.contains("report"), "{banner}");
    }

    #[test]
    fn omits_the_log_if_it_could_not_be_written() {
        let banner = cache_unreadable_banner(MESSAGE, "Error", None);
        assert!(!banner.contains("A log has been written"), "{banner}");
        assert!(banner.contains(MESSAGE), "{banner}");
    }
}
