Utilities for lexical manipulation of unix-style (`/`-separated) paths represented as unicode
strings.

These paths types are frequently used for JS imports, and are used within Turbopack to represent
platform-agnostic relative paths.

This crate does not perform any IO, and does not depend on turbo-tasks. Most users should prefer the
`turbo-tasks-fs` crate.
