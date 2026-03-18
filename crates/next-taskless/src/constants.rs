// SAFETY: This has to be sorted alphabetically since we are doing binary search on it
pub const NODE_EXTERNALS: [&str; 68] = [
    "_http_agent",
    "_http_client",
    "_http_common",
    "_http_incoming",
    "_http_outgoing",
    "_http_server",
    "_stream_duplex",
    "_stream_passthrough",
    "_stream_readable",
    "_stream_transform",
    "_stream_wrap",
    "_stream_writable",
    "_tls_common",
    "_tls_wrap",
    "assert",
    "assert/strict",
    "async_hooks",
    "buffer",
    "child_process",
    "cluster",
    "console",
    "constants",
    "crypto",
    "dgram",
    "diagnostics_channel",
    "dns",
    "dns/promises",
    "domain",
    "events",
    "fs",
    "fs/promises",
    "http",
    "http2",
    "https",
    "inspector",
    "module",
    "net",
    "os",
    "path",
    "path/posix",
    "path/win32",
    "perf_hooks",
    "pnpapi",
    "process",
    "punycode",
    "querystring",
    "readline",
    "readline/promises",
    "repl",
    "stream",
    "stream/consumers",
    "stream/promises",
    "stream/web",
    "string_decoder",
    "sys",
    "timers",
    "timers/promises",
    "tls",
    "trace_events",
    "tty",
    "url",
    "util",
    "util/types",
    "v8",
    "vm",
    "wasi",
    "worker_threads",
    "zlib",
];

/// The Node.js built-in modules that are supported by edge runtime.
///
/// If any Node.js builtin module apart from these these imports are used and the user does not
/// provide an alias for it (i.e. a polyfill), a runtime error will be thrown.
///
/// See <https://vercel.com/docs/functions/runtimes/edge-runtime#compatible-node.js-modules>
//
// SAFETY: This has to be sorted alphabetically since we are doing binary search on it
pub const EDGE_NODE_EXTERNALS: [&str; 7] = [
    "assert",
    "assert/strict",
    "async_hooks",
    "buffer",
    "events",
    "util",
    "util/types",
];

pub const BUN_EXTERNALS: [&str; 6] = [
    "bun",
    "bun:ffi",
    "bun:jsc",
    "bun:sqlite",
    "bun:test",
    "bun:wrap",
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_node_externals_sorted() {
        assert!(NODE_EXTERNALS.is_sorted())
    }

    #[test]
    fn test_edge_node_externals_sorted() {
        assert!(EDGE_NODE_EXTERNALS.is_sorted())
    }

    #[test]
    fn test_bun_externals_sorted() {
        assert!(BUN_EXTERNALS.is_sorted())
    }
}
