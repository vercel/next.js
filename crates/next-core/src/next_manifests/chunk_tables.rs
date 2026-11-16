//! Shares chunk paths and chunk lists in the JavaScript emitted for client reference manifests.
//!
//! There is lots of natural redundancy that we are eliminating:
//! - path prefixes for URLs and files (extracted into constants and reused)
//! - file paths and URLs themselves are repeated too (interned into an array and reused by index)
//! - lists of file paths are often repeated (interned into an array and reused by index)
//!
//! Finally, even when we don't get perfect reuse, we do observe repeated construction patterns, so
//! there are factory functions for constructing common arrays and objects.
//!
//! The factory functions are both a code size and a performance win, since they are trivial to JIT.
//!
//! ```js
//! const p0 = "server/chunks/ssr/";
//! const s = [p0+"a.js",p0+"b.js",p0+"c.js"];
//! const l = [[s[0],s[1],s[2]]];
//! ({"x": {"chunks": l[0]}, "y": {"chunks": l[0]}, "z": {"chunks": [s[1]]}})
//! ```
//!
//! Besides being smaller, this evaluates faster and retains less memory in V8 than a JSON-like
//! object literal.
//!
//! Lists of paths are written as `[s[i],...]` array literals. Only when a list contains long runs
//! of consecutive string indices, and writing them as runs saves at least [`RUN_MIN_SAVING`]
//! bytes, is it written as `r(start,length,...)` instead, see [`ChunkTables::finish`]. Most lists
//! are short, so most manifests don't declare `r` at all, which makes small manifests faster to
//! compile and run.
//!
//! Lists used several times evaluate to the *same* array object rather than equal copies, so
//! consumers must not mutate them.

use std::{fmt::Write, num::NonZeroU32};

use rustc_hash::FxHashSet;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, FxIndexSet};

/// One entry of a client reference's `chunks` list, as consumed by React's Flight client via
/// `__turbopack_load_by_url__`.
///
/// Most chunks are a plain URL string. A *merged* chunk (one that bundles several component
/// chunks) is instead emitted as a `[url, componentChunkPaths, componentChunkSizes]` array. This
/// lets the runtime dynamically choose to load the whole chunk or individual components of it,
/// as needed. The sizes (bytes of the emitted files) feed the runtime's split-vs-whole cost
/// heuristic.
pub enum ClientChunk {
    Path(RcStr),
    Merged {
        url: RcStr,
        component_paths: Vec<RcStr>,
        component_sizes: Vec<u64>,
    },
}

/// One entry of an `entryCSSFiles` list.
#[derive(Debug, Clone, Eq, Hash, PartialEq)]
pub struct CssResource {
    pub path: RcStr,
    pub inlined: bool,
    /// The stylesheet, when it is inlined.
    pub content: Option<RcStr>,
}

/// The minimum number of bytes writing a list of paths as runs (`r(...)`) must save over an array
/// literal (`[s[i],...]`) for the runs to be used. Calling `r` is slower than evaluating a short
/// array literal, so runs are only worth it for long lists.
const RUN_MIN_SAVING: usize = 16;

/// Declares `r`, see [`ChunkTables::finish`]. Only emitted when a list is written as runs.
const R_DECLARATION: &str = "const r = (...a) => { const parts = []; for (let i = 0; i < \
                             a.length; i += 2) parts.push(s.slice(a[i], a[i] + a[i + 1])); return \
                             parts.length === 1 ? parts[0] : [].concat(...parts); };\n";

/// A list interned in [`ChunkTables`].
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct ChunkList(u32);

#[derive(PartialEq, Eq, Hash)]
enum Item {
    /// Index into [`ChunkTables::strings`].
    Path(u32),
    /// A [`ClientChunk::Merged`], with the URL and component paths as indices into
    /// [`ChunkTables::strings`]. The component paths are written inline rather than shared, since
    /// `l` cannot refer to its own entries.
    Merged {
        url: u32,
        component_paths: Box<[u32]>,
        component_sizes: Box<[u64]>,
    },
    /// A [`CssResource`], with the path and content as indices into [`ChunkTables::strings`].
    Css {
        path: u32,
        inlined: bool,
        content: Option<u32>,
    },
}

#[derive(Default)]
pub struct ChunkTables {
    strings: FxIndexSet<RcStr>,
    /// Strings that are not paths (inlined stylesheets), which are not split into prefixes.
    non_paths: FxHashSet<u32>,
    /// Every distinct list, with the number of times it is used.
    lists: FxIndexMap<Box<[Item]>, NonZeroU32>,
}

impl ChunkTables {
    pub fn chunk_paths(&mut self, paths: impl IntoIterator<Item = RcStr>) -> ChunkList {
        let items = paths
            .into_iter()
            .map(|path| Item::Path(self.intern_string(path)))
            .collect();
        self.intern_chunk_list(items)
    }

    pub fn chunks_urls(&mut self, chunks: impl IntoIterator<Item = ClientChunk>) -> ChunkList {
        let mut items = Vec::new();
        for chunk in chunks {
            items.push(match chunk {
                ClientChunk::Path(path) => Item::Path(self.intern_string(path)),
                ClientChunk::Merged {
                    url,
                    component_paths,
                    component_sizes,
                } => Item::Merged {
                    url: self.intern_string(url),
                    component_paths: component_paths
                        .into_iter()
                        .map(|path| self.intern_string(path))
                        .collect(),
                    component_sizes: component_sizes.into(),
                },
            });
        }
        self.intern_chunk_list(items.into())
    }

    pub fn css(&mut self, resources: impl IntoIterator<Item = CssResource>) -> ChunkList {
        let mut items = Vec::new();
        for CssResource {
            path,
            inlined,
            content,
        } in resources
        {
            let path = self.intern_string(path);
            let content = content.map(|content| {
                let index = self.intern_string(content);
                self.non_paths.insert(index);
                index
            });
            items.push(Item::Css {
                path,
                inlined,
                content,
            });
        }
        self.intern_chunk_list(items.into())
    }

    /// This is used for all strings, paths, chunk urls and even css content
    fn intern_string(&mut self, string: RcStr) -> u32 {
        self.strings.insert_full(string).0 as u32
    }

    /// Interns a list of chunk items, typically filepaths or urls.
    fn intern_chunk_list(&mut self, items: Box<[Item]>) -> ChunkList {
        let entry = self.lists.entry(items);
        let list = ChunkList(entry.index() as u32);
        entry
            .and_modify(|uses| *uses = uses.saturating_add(1))
            .or_insert(NonZeroU32::MIN);
        list
    }

    /// Decides which lists to share and writes the declarations of the tables.
    pub fn finish(self) -> EncodedChunkTables {
        let mut declarations = String::new();

        let prefixes = directory_prefixes(
            self.strings
                .iter()
                .enumerate()
                .filter(|(index, _)| !self.non_paths.contains(&(*index as u32)))
                .map(|(_, string)| &**string),
        );
        if !prefixes.is_empty() {
            declarations.push_str("const ");
            for (index, prefix) in prefixes.iter().enumerate() {
                if index > 0 {
                    declarations.push_str(", ");
                }
                write!(declarations, "p{index} = {}", json_string(prefix)).unwrap();
            }
            declarations.push_str(";\n");
        }

        if !self.strings.is_empty() {
            declarations.push_str("const s = [");
            for (index, string) in self.strings.iter().enumerate() {
                if index > 0 {
                    declarations.push(',');
                }
                match split_directory(string)
                    .filter(|_| !self.non_paths.contains(&(index as u32)))
                    .and_then(|(dir, rest)| Some((prefixes.get_index_of(dir)?, rest)))
                {
                    Some((prefix, rest)) => {
                        write!(declarations, "p{prefix}+{}", json_string(rest)).unwrap()
                    }
                    None => declarations.push_str(&json_string(string)),
                }
            }
            declarations.push_str("];\n");
        }

        if self.lists.keys().any(|items| uses_runs(items)) {
            // `r(start, length, start, length, ...)` concatenates the runs
            // `s[start..start + length]` into a new array. A list that is a single run is
            // returned as one `slice`. `slice` + `concat` evaluates faster and retains less memory
            // than pushing elements one by one.
            declarations.push_str(R_DECLARATION);
        }

        let mut shared = Vec::with_capacity(self.lists.len());
        let mut lists = Vec::with_capacity(self.lists.len());
        let mut shared_count = 0;
        for (items, uses) in self.lists {
            if uses.get() > 1 {
                declarations.push_str(if shared_count == 0 {
                    "const l = ["
                } else {
                    ","
                });
                write_items(&mut declarations, &items);
                shared.push(Some(shared_count));
                shared_count += 1;
            } else {
                shared.push(None);
            }
            lists.push(items);
        }
        if shared_count > 0 {
            declarations.push_str("];\n");
        }

        EncodedChunkTables {
            declarations,
            shared,
            lists,
        }
    }
}

pub struct EncodedChunkTables {
    declarations: String,
    /// Per list, its index in `l` if it is shared.
    shared: Vec<Option<u32>>,
    lists: Vec<Box<[Item]>>,
}

impl EncodedChunkTables {
    /// `const` statements that [`Self::write`]'s output refers to. Emit them in the same scope,
    /// typically an IIFE, to keep them out of the global scope.
    pub fn declarations(&self) -> &str {
        &self.declarations
    }

    /// Writes an expression that evaluates to `list`.
    pub fn write(&self, out: &mut String, list: ChunkList) {
        let index = list.0 as usize;
        match self.shared[index] {
            Some(shared) => write!(out, "l[{shared}]").unwrap(),
            None => write_items(out, &self.lists[index]),
        }
    }
}

/// Whether [`write_items`] writes `items` with a call to `r`.
fn uses_runs(items: &[Item]) -> bool {
    if let Some(paths) = all_paths(items) {
        return paths_use_runs(paths);
    }
    items.iter().any(|item| match item {
        Item::Path(_) | Item::Css { .. } => false,
        Item::Merged {
            component_paths, ..
        } => paths_use_runs(component_paths.iter().copied()),
    })
}

/// The string indices of `items`, if they are all plain paths.
fn all_paths(items: &[Item]) -> Option<impl Iterator<Item = u32> + Clone + '_> {
    items
        .iter()
        .all(|item| matches!(item, Item::Path(_)))
        .then(|| {
            items.iter().map(|item| match item {
                Item::Path(path) => *path,
                Item::Merged { .. } | Item::Css { .. } => unreachable!(),
            })
        })
}

fn write_items(out: &mut String, items: &[Item]) {
    // Lists of plain paths, the common case, are written by `write_paths`. Lists with merged
    // chunks are written as array literals, with each merged chunk's component paths written by
    // `write_paths`.
    if let Some(paths) = all_paths(items) {
        write_paths(out, paths);
        return;
    }
    out.push('[');
    for (index, item) in items.iter().enumerate() {
        if index > 0 {
            out.push(',');
        }
        match item {
            Item::Path(path) => write!(out, "s[{path}]").unwrap(),
            Item::Merged {
                url,
                component_paths,
                component_sizes,
            } => {
                write!(out, "[s[{url}],").unwrap();
                write_paths(out, component_paths.iter().copied());
                out.push_str(",[");
                for (index, size) in component_sizes.iter().enumerate() {
                    if index > 0 {
                        out.push(',');
                    }
                    write!(out, "{size}").unwrap();
                }
                out.push_str("]]");
            }
            Item::Css {
                path,
                inlined,
                content,
            } => {
                write!(out, "{{\"path\":s[{path}],\"inlined\":{inlined}").unwrap();
                if let Some(content) = content {
                    write!(out, ",\"content\":s[{content}]").unwrap();
                }
                out.push('}');
            }
        }
    }
    out.push(']');
}

/// Writes `paths` as `r(start,length,...)` if [`paths_use_runs`], otherwise as `[s[i],...]`.
fn write_paths(out: &mut String, paths: impl Iterator<Item = u32> + Clone) {
    if !paths_use_runs(paths.clone()) {
        out.push('[');
        for (index, path) in paths.enumerate() {
            if index > 0 {
                out.push(',');
            }
            write!(out, "s[{path}]").unwrap();
        }
        out.push(']');
        return;
    }
    out.push_str("r(");
    for (index, (start, length)) in runs(paths).enumerate() {
        if index > 0 {
            out.push(',');
        }
        write!(out, "{start},{length}").unwrap();
    }
    out.push(')');
}

/// Whether writing `paths` as runs, `r(start,length,...)`, is at least [`RUN_MIN_SAVING`] bytes
/// shorter than writing them as `[s[i],...]`.
fn paths_use_runs(paths: impl Iterator<Item = u32> + Clone) -> bool {
    // `[` + `s[i]` per path, comma-separated + `]`
    let (count, digit_count) = paths.clone().fold((0, 0), |(count, digit_count), i| {
        (count + 1, digit_count + digits(i))
    });
    if count == 0 {
        return false;
    }
    let literal: usize = 2 + (count - 1) + 3 * count + digit_count;
    // `r(` + `start,length` per run, comma-separated + `)`
    let (count, numbers) = runs(paths).fold((0, 0), |(count, numbers), (start, length)| {
        (count + 1, numbers + digits(start) + digits(length))
    });
    let runs = 3 + (2 * count - 1) + numbers;
    literal >= runs + RUN_MIN_SAVING
}

/// The runs of consecutive indices in `paths`, as `(start, length)`.
fn runs(paths: impl Iterator<Item = u32>) -> impl Iterator<Item = (u32, u32)> {
    let mut paths = paths.peekable();
    std::iter::from_fn(move || {
        let start = paths.next()?;
        let mut length = 1;
        while paths.next_if_eq(&(start + length)).is_some() {
            length += 1;
        }
        Some((start, length))
    })
}

/// The number of decimal digits of `n`.
fn digits(n: u32) -> usize {
    n.checked_ilog10().unwrap_or(0) as usize + 1
}

/// Splits `"a/b/c.js"` into `("a/b/", "c.js")`.
fn split_directory(string: &str) -> Option<(&str, &str)> {
    let index = string.rfind('/')? + 1;
    (index < string.len()).then(|| string.split_at(index))
}

/// Directories that more than one string starts with, in first-seen order.
fn directory_prefixes<'a>(strings: impl Iterator<Item = &'a str>) -> FxIndexSet<&'a str> {
    let mut counts: FxIndexMap<&str, u32> = FxIndexMap::default();
    for string in strings {
        if let Some((dir, _)) = split_directory(string) {
            *counts.entry(dir).or_default() += 1;
        }
    }
    counts
        .into_iter()
        .filter(|(_, count)| *count > 1)
        .map(|(dir, _)| dir)
        .collect()
}

pub fn json_string(string: &str) -> String {
    serde_json::to_string(string).unwrap()
}

#[cfg(test)]
mod tests {
    use turbo_rcstr::{RcStr, rcstr};

    use super::{ChunkTables, ClientChunk, CssResource};

    #[test]
    fn shares_repeated_lists_and_paths() {
        let mut tables = ChunkTables::default();
        let a = tables.chunk_paths([rcstr!("dir/x.js"), rcstr!("dir/y.js")]);
        let b = tables.chunk_paths([rcstr!("dir/x.js"), rcstr!("dir/y.js")]);
        let d = tables.chunk_paths([rcstr!("dir/y.js"), rcstr!("dir/x.js")]);
        let c = tables.chunks_urls([
            ClientChunk::Path(rcstr!("dir/y.js")),
            ClientChunk::Merged {
                url: rcstr!("m.js"),
                component_paths: vec![rcstr!("dir/x.js")],
                component_sizes: vec![42],
            },
        ]);
        let empty1 = tables.chunk_paths([]);
        let empty2 = tables.chunk_paths([]);
        let tables = tables.finish();

        // Short lists are array literals, so `r` is not declared.
        assert_eq!(
            tables.declarations(),
            concat!(
                r#"const p0 = "dir/";"#,
                "\n",
                r#"const s = [p0+"x.js",p0+"y.js","m.js"];"#,
                "\n",
                r#"const l = [[s[0],s[1]],[]];"#,
                "\n",
            )
        );
        let mut out = String::new();
        for list in [a, b, c, d, empty1, empty2] {
            tables.write(&mut out, list);
            out.push(' ');
        }
        assert_eq!(
            out,
            "l[0] l[0] [s[1],[s[2],[s[0]],[42]]] [s[1],s[0]] l[1] l[1] "
        );
    }

    #[test]
    fn writes_long_lists_as_runs() {
        let paths = |range: std::ops::Range<u32>| {
            range
                .map(|i| RcStr::from(format!("d/{i}.js")))
                .collect::<Vec<_>>()
        };
        let mut tables = ChunkTables::default();
        // `r(0,20)` is much shorter than `[s[0],...,s[19]]`.
        let long = tables.chunk_paths(paths(0..20));
        // `r(0,3)` saves only 10 bytes over `[s[0],s[1],s[2]]`.
        let short = tables.chunk_paths(paths(0..3));
        let merged = tables.chunks_urls([ClientChunk::Merged {
            url: rcstr!("m.js"),
            component_paths: paths(0..20),
            component_sizes: vec![1],
        }]);
        let tables = tables.finish();

        assert!(
            tables
                .declarations()
                .ends_with(&format!("];\n{}", super::R_DECLARATION))
        );
        let mut out = String::new();
        for list in [long, short, merged] {
            tables.write(&mut out, list);
            out.push(' ');
        }
        assert_eq!(out, "r(0,20) [s[0],s[1],s[2]] [[s[20],r(0,20),[1]]] ");
    }

    #[test]
    fn chooses_runs_by_saved_bytes() {
        use super::paths_use_runs;

        assert!(!paths_use_runs([].into_iter()));
        // `[s[0],...,s[15]]` (87 bytes) vs `r(0,16)` (7 bytes).
        assert!(paths_use_runs(0..16));
        // `[s[0],s[1],s[2]]` (16 bytes) vs `r(0,3)` (6 bytes): saves 10 bytes.
        assert!(!paths_use_runs([0, 1, 2].into_iter()));
        // `[s[0],...,s[4]]` (26 bytes) vs `r(0,5)` (6 bytes): saves 20 bytes.
        assert!(paths_use_runs([0, 1, 2, 3, 4].into_iter()));
        // Non-consecutive indices: `[s[9],s[7],s[5]]` (16 bytes) vs `r(9,1,7,1,5,1)` (14 bytes).
        assert!(!paths_use_runs([9, 7, 5].into_iter()));
    }

    #[test]
    fn shares_css_lists_without_splitting_contents() {
        let mut tables = ChunkTables::default();
        let resources = || {
            [
                CssResource {
                    path: rcstr!("dir/a.css"),
                    inlined: false,
                    content: None,
                },
                CssResource {
                    path: rcstr!("dir/b.css"),
                    inlined: true,
                    content: Some(rcstr!("a{background:url(dir/x.png)}")),
                },
            ]
        };
        let a = tables.css(resources());
        let b = tables.css(resources());
        let tables = tables.finish();

        assert_eq!(
            tables.declarations(),
            concat!(
                r#"const p0 = "dir/";"#,
                "\n",
                r#"const s = [p0+"a.css",p0+"b.css","a{background:url(dir/x.png)}"];"#,
                "\n",
                r#"const l = [[{"path":s[0],"inlined":false},"#,
                r#"{"path":s[1],"inlined":true,"content":s[2]}]];"#,
                "\n",
            )
        );
        let mut out = String::new();
        tables.write(&mut out, a);
        tables.write(&mut out, b);
        assert_eq!(out, "l[0]l[0]");
    }
}
