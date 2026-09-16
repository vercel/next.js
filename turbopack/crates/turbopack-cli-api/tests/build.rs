//! Integration tests for the `build` command.
//!
//! These drive the real `build_project` against the fixtures in `tests/fixtures/` and assert on
//! what lands in the output directory. They deliberately do not snapshot chunk *contents*: chunk
//! filenames are content-hashed, so a snapshot would churn on unrelated codegen changes without
//! saying anything about the behaviour under test. What each test pins is the shape of the
//! output — which kinds of asset were emitted, and whether the rewritten HTML points at them.
//!
//! That level matters because every bug these cover shared one symptom: the build exited
//! successfully while quietly producing the wrong thing. Only an assertion on the emitted asset
//! set can tell those apart from a good build.

#![cfg(test)]

use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use tempfile::TempDir;
use turbo_rcstr::RcStr;
use turbo_tasks::TurboTasks;
use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
use turbopack_cli_api::{
    build::build_project,
    project::{ProjectContainer, ProjectOptions},
};
use turbopack_cli_core::entry::EntryRequest;

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/// Copy a fixture into a fresh temp directory. The build writes its output under the project
/// root, so each test needs its own copy to stay isolated and leave the fixture clean.
fn stage_fixture(name: &str) -> Result<TempDir> {
    let src = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/fixtures")
        .join(name);
    anyhow::ensure!(src.is_dir(), "no such fixture: {name}");

    let temp = TempDir::new()?;
    copy_dir(&src, temp.path())?;
    Ok(temp)
}

fn copy_dir(from: &Path, to: &Path) -> Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let target = to.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &target)?;
        } else {
            fs::copy(entry.path(), &target)?;
        }
    }
    Ok(())
}

/// Build `entries` in `project_dir`. Mirrors how the napi layer drives a build, so the tests
/// exercise the same path the CLI does.
///
/// Returns the error already rendered to a string rather than as an `Error`. A turbo-tasks
/// `TaskContext` error resolves its task name *lazily, while being formatted*, by asking the
/// backend — so it has to be rendered before the backend is torn down. Formatting it after
/// `stop_and_wait` reads dismantled state and trips a debug assertion deep in the backend,
/// which looks like a turbo-tasks bug but is just use-after-shutdown.
#[tokio::main(flavor = "multi_thread", worker_threads = 2)]
async fn build(project_dir: RcStr, entries: Vec<RcStr>) -> Result<(), String> {
    let options = ProjectOptions {
        root_path: project_dir.clone(),
        entries: entries.into_iter().map(EntryRequest::Relative).collect(),
        dist_dir: RcStr::from("dist"),
    };

    let turbo_tasks = TurboTasks::new(TurboTasksBackend::new(
        BackendOptions {
            storage_mode: None,
            dependency_tracking: false,
            ..Default::default()
        },
        noop_backing_storage(),
    ));

    let container_op = turbo_tasks
        .run(async move {
            let container_op = ProjectContainer::new_operation();
            ProjectContainer::initialize(container_op, options).await?;
            container_op.resolve().strongly_consistent().await?;
            Ok(container_op)
        })
        .await
        .map_err(|err| format!("{err:?}"))?;
    let container = turbo_tasks
        .run(async move { container_op.resolve().strongly_consistent().await })
        .await
        .map_err(|err| format!("{err:?}"))?;

    let result = build_project(turbo_tasks.clone(), container, project_dir)
        .await
        // `Debug` renders the whole `anyhow` cause chain; `Display` would show only the
        // outermost message, which is the generic turbo-tasks wrapper.
        .map_err(|err| format!("{err:?}"));
    turbo_tasks.stop_and_wait().await;
    result
}

/// The staged project root, canonicalized. Turbopack's `DiskFileSystem` refuses to read through
/// a symlink, and on macOS `TempDir` hands back `/var/folders/…`, which is a symlink to
/// `/private/var/folders/…`. The CLI canonicalizes its `--root` for the same reason.
fn project_root(temp: &TempDir) -> RcStr {
    let canonical = fs::canonicalize(temp.path()).unwrap();
    RcStr::from(canonical.to_str().unwrap())
}

/// Stage a fixture, build `index.html`, and return the output directory. Panics on build failure,
/// so a test body can get straight to its assertions.
fn build_ok(fixture: &str) -> (TempDir, PathBuf) {
    let temp = stage_fixture(fixture).unwrap();
    let root = project_root(&temp);
    build(root, vec![RcStr::from("index.html")])
        .unwrap_or_else(|err| panic!("{fixture} should build, but failed:\n{err}"));
    let dist = temp.path().join("dist");
    (temp, dist)
}

/// Stage a fixture, build it, and return the error it is expected to produce.
fn build_err(fixture: &str, entries: &[&str]) -> String {
    let temp = stage_fixture(fixture).unwrap();
    let root = project_root(&temp);
    let entries = entries.iter().map(|e| RcStr::from(*e)).collect();
    match build(root, entries) {
        Ok(()) => panic!("{fixture} should have failed the build, but it succeeded"),
        Err(err) => err,
    }
}

// ---------------------------------------------------------------------------
// Assertions on the output directory
// ---------------------------------------------------------------------------

/// Every emitted file under `dist`, as paths relative to it.
fn emitted(dist: &Path) -> Vec<String> {
    fn walk(dir: &Path, base: &Path, out: &mut Vec<String>) {
        for entry in fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                walk(&path, base, out);
            } else {
                out.push(
                    path.strip_prefix(base)
                        .unwrap()
                        .to_str()
                        .unwrap()
                        .replace('\\', "/"),
                );
            }
        }
    }
    let mut out = Vec::new();
    walk(dist, dist, &mut out);
    out.sort();
    out
}

fn emitted_with_extension(dist: &Path, ext: &str) -> Vec<String> {
    emitted(dist)
        .into_iter()
        .filter(|p| p.ends_with(ext))
        .collect()
}

/// The value of every `attr="…"` in `html`, in document order. Naive on purpose — the fixtures
/// are small and fully controlled, so a real parser would only add noise.
fn attr_values(html: &str, attr: &str) -> Vec<String> {
    let needle = format!("{attr}=\"");
    let mut out = Vec::new();
    let mut rest = html;
    while let Some(start) = rest.find(&needle) {
        rest = &rest[start + needle.len()..];
        match rest.find('"') {
            Some(end) => {
                out.push(rest[..end].to_string());
                rest = &rest[end + 1..];
            }
            None => break,
        }
    }
    out
}

/// Assert that every root-relative URL the page references was actually emitted. This is the
/// check that fails when a chunk goes missing but its tag survives, or vice versa.
fn assert_references_resolve(dist: &Path, html: &str) {
    let emitted = emitted(dist);
    for url in attr_values(html, "src")
        .into_iter()
        .chain(attr_values(html, "href"))
    {
        // Only URLs the build owns: the emitted chunks all live under the asset prefix.
        let Some(relative) = url.strip_prefix("/_chunks/") else {
            continue;
        };
        let relative = format!("_chunks/{relative}");
        assert!(
            emitted.contains(&relative),
            "index.html references {url}, which was not emitted.\nEmitted: {emitted:#?}"
        );
    }
}

fn read_index(dist: &Path) -> String {
    fs::read_to_string(dist.join("index.html"))
        .context("build did not emit index.html")
        .unwrap()
}

// ---------------------------------------------------------------------------
// A stylesheet must survive however it is referenced
// ---------------------------------------------------------------------------

/// A stylesheet reached only through the template's `<link>` — never imported from JS.
///
/// This is the regression that motivated the suite. A CSS module is not evaluatable, so routing
/// it through the *evaluated* chunk group path produced an empty group: no CSS was emitted, and
/// because the rewrite had no path to substitute, the `<link>` was deleted outright. The build
/// reported success and the page loaded unstyled.
#[test]
fn stylesheet_linked_from_html_is_emitted_and_linked() {
    let (_temp, dist) = build_ok("html-linked-css");
    let html = read_index(&dist);

    let css = emitted_with_extension(&dist, ".css");
    assert_eq!(
        css.len(),
        1,
        "expected exactly one stylesheet chunk, got {css:?}"
    );

    let links = attr_values(&html, "href");
    assert_eq!(
        links.len(),
        1,
        "expected the template's single <link> to be rewritten, got {links:?}"
    );
    assert!(
        links[0].ends_with(".css"),
        "the rewritten <link> should point at a stylesheet, got {}",
        links[0]
    );
    assert_references_resolve(&dist, &html);
}

/// The same stylesheet reached only through `import './app.css'`. This path always worked; the
/// test exists so a future change to the chunk-group dispatch cannot fix one path by breaking
/// the other.
#[test]
fn stylesheet_imported_from_js_is_emitted_and_linked() {
    let (_temp, dist) = build_ok("js-imported-css");
    let html = read_index(&dist);

    let css = emitted_with_extension(&dist, ".css");
    assert_eq!(
        css.len(),
        1,
        "expected exactly one stylesheet chunk, got {css:?}"
    );

    // The template has no `<link>` of its own, so the rewrite has to inject one.
    let links = attr_values(&html, "href");
    assert_eq!(
        links.len(),
        1,
        "expected a <link> to be injected for the imported stylesheet, got {links:?}"
    );
    assert_references_resolve(&dist, &html);
}

/// A stylesheet that is both `<link>`ed and `import`ed reaches the page through two chunk groups.
/// It must still produce one chunk and one tag.
#[test]
fn stylesheet_reached_twice_is_linked_once() {
    let (_temp, dist) = build_ok("linked-and-imported");
    let html = read_index(&dist);

    let css = emitted_with_extension(&dist, ".css");
    assert_eq!(css.len(), 1, "expected one stylesheet chunk, got {css:?}");

    let links = attr_values(&html, "href");
    assert_eq!(
        links.len(),
        1,
        "the stylesheet is reachable twice but must be linked once, got {links:?}"
    );
    assert_references_resolve(&dist, &html);
}

// ---------------------------------------------------------------------------
// The rewrite must not touch what it does not own
// ---------------------------------------------------------------------------

/// The inverse guarantee: the rewrite replaces local module scripts and local stylesheet links,
/// and leaves every other tag exactly as the author wrote it.
#[test]
fn unowned_tags_are_left_alone() {
    let (_temp, dist) = build_ok("passthrough");
    let html = read_index(&dist);

    for untouched in [
        // Non-stylesheet `rel`s are not entry references.
        r#"<link rel="icon" href="/favicon.ico" />"#,
        r#"<link rel="preload" href="/src/big.woff2" as="font" />"#,
        r#"<link rel="manifest" href="/manifest.webmanifest" />"#,
        // Remote URLs are not ours to bundle.
        r#"<link rel="stylesheet" href="https://cdn.example.com/remote.css" />"#,
        r#"<script type="module" src="https://cdn.example.com/remote.js"></script>"#,
        // A classic (non-module) script is not an entry.
        r#"<script src="/src/classic.js"></script>"#,
    ] {
        assert!(
            html.contains(untouched),
            "the rewrite should have left this untouched:\n  {untouched}\nGot:\n{html}"
        );
    }

    // Inline script bodies must survive too.
    assert!(
        html.contains("window.INLINE = 1"),
        "inline script body was lost:\n{html}"
    );

    // And the local entries it does own were still rewritten.
    assert_eq!(emitted_with_extension(&dist, ".css").len(), 1);
    assert!(
        !html.contains(r#"src="/src/main.js""#),
        "the local module entry should have been rewritten to a chunk:\n{html}"
    );
    assert_references_resolve(&dist, &html);
}

// ---------------------------------------------------------------------------
// Failures must be loud
// ---------------------------------------------------------------------------

/// A `<script src>` that does not resolve used to be dropped: the tag was deleted, no chunk was
/// emitted, and the build still exited successfully, leaving a page that loads nothing.
#[test]
fn unresolved_entry_reference_fails_the_build() {
    let err = build_err("unresolved-script", &["index.html"]);
    assert!(
        err.contains("could not resolve") && err.contains("does-not-exist.js"),
        "the error should name the unresolved reference, got:\n{err}"
    );
    assert!(
        err.contains("index.html"),
        "the error should name the file the reference came from, got:\n{err}"
    );
}

/// Only HTML entries can be built so far. Skipping anything else silently produced an empty
/// output directory and a successful exit.
#[test]
fn unsupported_entry_fails_the_build() {
    let err = build_err("non-html-entry", &["src/main.js"]);
    assert!(
        err.contains("unsupported entry") && err.contains("src/main.js"),
        "the error should name the unsupported entry, got:\n{err}"
    );
}
