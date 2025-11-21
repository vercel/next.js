use std::sync::LazyLock;

use regex::Regex;

// from https://github.com/vercel/next.js/blob/8d1c619ad650f5d147207f267441caf12acd91d1/packages/next/src/build/handle-externals.ts#L188
pub static NEVER_EXTERNAL_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new("^(?:private-next-pages\\/|next\\/(?:dist\\/pages\\/|(?:app|cache|document|link|form|head|image|legacy\\/image|constants|dynamic|script|navigation|headers|router|compat\\/router|server)$)|string-hash|private-next-rsc-action-validate|private-next-rsc-action-client-wrapper|private-next-rsc-server-reference|private-next-rsc-cache-wrapper|private-next-rsc-track-dynamic-import$)").unwrap()
});
