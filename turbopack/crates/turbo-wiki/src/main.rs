#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

//! turbo-wiki: an incremental wiki compiler built directly on turbo-tasks.
//!
//! Compiles a flat directory of Markdown files with `[[WikiLinks]]` into HTML
//! pages with resolved links and backlinks sections. Broken links are reported
//! as collectible diagnostics. In `--watch` mode the compilation is a standing
//! root task: edits re-execute only the tasks whose inputs changed.
//!
//! This crate deliberately depends only on `turbo-*` crates (the incremental
//! computation engine) and none of the `turbopack-*` crates (the bundler).

use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    process::exit,
    time::Instant,
};

use anyhow::{Context, Result, anyhow, bail};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{CollectiblesSource, Completion, FxIndexMap, ResolvedVc, TurboTasks, Vc, emit};
use turbo_tasks_backend::{
    BackendOptions, GitVersionInfo, StartupCacheState, StorageMode, TurboTasksBackend,
    noop_backing_storage, turbo_backing_storage,
};
use turbo_tasks_fs::{
    DirectoryContent, DirectoryEntry, DiskFileSystem, FileContent, FileSystem, FileSystemPath,
};
use turbo_tasks_malloc::TurboMalloc;

#[global_allocator]
static ALLOC: TurboMalloc = TurboMalloc;

// -----------------------------------------------------------------------------------------------
// Values
// -----------------------------------------------------------------------------------------------

/// A parsed wiki page: the first `# ` heading is the title, the rest is the
/// body. Parsing is a separate task from rendering so that a body edit that
/// doesn't change the title or links stops propagating early.
#[turbo_tasks::value]
struct Page {
    slug: RcStr,
    title: RcStr,
    body: RcStr,
}

/// Sorted list of the `.md` files in the wiki root.
#[turbo_tasks::value(transparent)]
struct PagePaths(Vec<FileSystemPath>);

/// Sorted, deduplicated `[[link]]` targets of one page. This is the
/// early-cutoff firewall for backlinks: editing prose without changing links
/// produces an equal value here, so backlink tasks are not invalidated.
#[turbo_tasks::value(transparent)]
struct LinkTitles(Vec<RcStr>);

/// Map from normalized page title to slug. Link resolution reads this with
/// `.get(&key)` — a keyed read: the reading task depends only on that one
/// key. `cell = "keyed"` makes updates diff the map key by key, so index
/// changes invalidate only the readers whose keys changed. Both halves are
/// needed: keyed reads without the keyed cell mode fall back to whole-cell
/// invalidation.
#[turbo_tasks::value(transparent, cell = "keyed")]
struct TitleIndex(#[bincode(with = "turbo_bincode::indexmap")] FxIndexMap<RcStr, RcStr>);

/// Backlinks of a page: map from linking page's slug to its title.
#[turbo_tasks::value(transparent)]
struct Backlinks(#[bincode(with = "turbo_bincode::indexmap")] FxIndexMap<RcStr, RcStr>);

#[turbo_tasks::value]
struct RenderedPage {
    slug: RcStr,
    html: RcStr,
}

#[turbo_tasks::value]
struct CompiledWiki {
    pages: Vec<ResolvedVc<RenderedPage>>,
}

/// Fully materialized compilation result: everything the driver needs, with no
/// further reads required. Top-level code may only do strongly consistent
/// reads (the engine panics on eventually-consistent reads there), so all
/// cell/output reads — including stringifying diagnostics — happen inside the
/// task graph.
#[turbo_tasks::value]
struct Report {
    pages: Vec<(RcStr, RcStr)>,
    diagnostics: Vec<RcStr>,
}

// -----------------------------------------------------------------------------------------------
// Diagnostics (collectibles)
// -----------------------------------------------------------------------------------------------

/// A diagnostic emitted during compilation. Diagnostics bubble up the task
/// graph as collectibles and are gathered at the top level; when the cause is
/// fixed, the emitting task re-executes and the diagnostic disappears without
/// any explicit cleanup.
#[turbo_tasks::value_trait]
pub trait WikiDiagnostic {
    #[turbo_tasks::function]
    fn message(self: Vc<Self>) -> Vc<RcStr>;
}

#[turbo_tasks::value]
struct BrokenLink {
    from_slug: RcStr,
    to_title: RcStr,
}

#[turbo_tasks::value_impl]
impl WikiDiagnostic for BrokenLink {
    #[turbo_tasks::function]
    fn message(&self) -> Vc<RcStr> {
        Vc::cell(
            format!(
                "broken link: [[{}]] in \"{}.md\" does not match any page title",
                self.to_title, self.from_slug
            )
            .into(),
        )
    }
}

#[turbo_tasks::value]
struct DuplicateTitle {
    title: RcStr,
    slug_a: RcStr,
    slug_b: RcStr,
}

#[turbo_tasks::value_impl]
impl WikiDiagnostic for DuplicateTitle {
    #[turbo_tasks::function]
    fn message(&self) -> Vc<RcStr> {
        Vc::cell(
            format!(
                "duplicate title: \"{}\" is used by both \"{}.md\" and \"{}.md\"",
                self.title, self.slug_a, self.slug_b
            )
            .into(),
        )
    }
}

// -----------------------------------------------------------------------------------------------
// Tasks
// -----------------------------------------------------------------------------------------------

// `session_dependent` so this re-executes when restored from the persistent
// cache: the OS file watcher is session-scoped state that must be re-armed.
#[turbo_tasks::function(session_dependent)]
async fn wiki_fs(root_dir: RcStr, watch: bool) -> Result<Vc<Box<dyn FileSystem>>> {
    let disk_fs = DiskFileSystem::new(rcstr!("wiki"), Vc::cell(root_dir));
    if watch {
        disk_fs.await?.start_watching(None).await?;
    }
    Ok(Vc::upcast(disk_fs))
}

#[turbo_tasks::function]
async fn page_paths(root: FileSystemPath) -> Result<Vc<PagePaths>> {
    let dir = root.read_dir().await?;
    let mut paths = Vec::new();
    if let DirectoryContent::Entries(entries) = &*dir {
        for (name, entry) in entries.iter() {
            if let DirectoryEntry::File(path) = entry
                && name.ends_with(".md")
            {
                paths.push(path.clone());
            }
        }
    }
    // AutoMap iteration order is nondeterministic; cells are keyed by
    // construction order, so downstream tasks need a stable order.
    paths.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(Vc::cell(paths))
}

#[turbo_tasks::function]
async fn parse_page(path: FileSystemPath) -> Result<Vc<Page>> {
    let slug: RcStr = path
        .file_name()
        .strip_suffix(".md")
        .unwrap_or(path.file_name())
        .into();
    let content = path.read().await?;
    let (title, body) = match &*content {
        FileContent::Content(file) => {
            let text = file.content().to_str()?;
            parse_markdown(&text, &slug)
        }
        FileContent::NotFound => (slug.to_string(), String::new()),
    };
    Ok(Page {
        slug,
        title: title.into(),
        body: body.into(),
    }
    .cell())
}

#[turbo_tasks::function]
async fn page_links(path: FileSystemPath) -> Result<Vc<LinkTitles>> {
    let page = parse_page(path).await?;
    let mut links = extract_wikilinks(&page.body);
    links.sort();
    links.dedup();
    Ok(Vc::cell(links))
}

#[turbo_tasks::function]
async fn title_index(root: FileSystemPath) -> Result<Vc<TitleIndex>> {
    let paths = page_paths(root).await?;
    let mut map: FxIndexMap<RcStr, RcStr> = FxIndexMap::default();
    for path in paths.iter() {
        let page = parse_page(path.clone()).await?;
        let key: RcStr = normalize_title(&page.title).into();
        if let Some(existing) = map.get(&key).cloned() {
            emit(ResolvedVc::upcast::<Box<dyn WikiDiagnostic>>(
                DuplicateTitle {
                    title: page.title.clone(),
                    slug_a: existing,
                    slug_b: page.slug.clone(),
                }
                .resolved_cell(),
            ));
        } else {
            map.insert(key, page.slug.clone());
        }
    }
    Ok(Vc::cell(map))
}

#[turbo_tasks::function]
async fn backlinks(root: FileSystemPath, title: RcStr) -> Result<Vc<Backlinks>> {
    let paths = page_paths(root.clone()).await?;
    let key = normalize_title(&title);
    let mut result: FxIndexMap<RcStr, RcStr> = FxIndexMap::default();
    for path in paths.iter() {
        let links = page_links(path.clone()).await?;
        if links.iter().any(|l| normalize_title(l) == key) {
            let page = parse_page(path.clone()).await?;
            result.insert(page.slug.clone(), page.title.clone());
        }
    }
    Ok(Vc::cell(result))
}

/// Renders just the article body. Separate from `render_backlinks_html` so
/// that a change to one doesn't recompute the other: prose edits don't touch
/// backlinks sections, and gaining a backlink doesn't re-render the body.
#[turbo_tasks::function]
async fn render_body_html(root: FileSystemPath, path: FileSystemPath) -> Result<Vc<RcStr>> {
    let page = parse_page(path).await?;

    // Log actual executions so incremental behavior is observable in watch
    // mode: unchanged bodies must not re-render.
    eprintln!("  [render body]      {}.md", page.slug);

    // Resolve every distinct link with a keyed read of the title index: this
    // task depends only on the keys it looked up, not on the whole index, so
    // unrelated index changes don't invalidate it. Reading an *absent* key
    // also registers a dependency, which is what makes broken links heal when
    // the missing page is created.
    let index = title_index(root.clone());
    let mut resolved: HashMap<String, Option<RcStr>> = HashMap::new();
    for link in extract_wikilinks(&page.body) {
        let key = normalize_title(&link);
        if resolved.contains_key(&key) {
            continue;
        }
        let query: RcStr = key.clone().into();
        let resolution: Option<RcStr> = index.get(&query).await?.map(|slug| (*slug).clone());
        if resolution.is_none() {
            emit(ResolvedVc::upcast::<Box<dyn WikiDiagnostic>>(
                BrokenLink {
                    from_slug: page.slug.clone(),
                    to_title: link.clone(),
                }
                .resolved_cell(),
            ));
        }
        resolved.insert(key, resolution);
    }

    Ok(Vc::cell(render_body(&page.body, &resolved).into()))
}

/// Renders just the backlinks section (empty string if there are none).
/// `slug` is only used for logging.
#[turbo_tasks::function]
async fn render_backlinks_html(
    root: FileSystemPath,
    title: RcStr,
    slug: RcStr,
) -> Result<Vc<RcStr>> {
    eprintln!("  [render backlinks] {slug}.md");
    let backlinks = backlinks(root, title).await?;
    if backlinks.is_empty() {
        return Ok(Vc::cell(RcStr::default()));
    }
    let mut html = String::new();
    html.push_str("<hr>\n<h2>Backlinks</h2>\n<ul>\n");
    for (slug, title) in backlinks.iter() {
        html.push_str(&format!(
            "<li><a href=\"./{}.html\">{}</a></li>\n",
            escape_html(slug),
            escape_html(title)
        ));
    }
    html.push_str("</ul>\n");
    Ok(Vc::cell(html.into()))
}

/// Assembles the full page from the independently cached body and backlinks
/// fragments. This task is cheap: when only one fragment changed, the other
/// is read from cache.
#[turbo_tasks::function]
async fn render_page(root: FileSystemPath, path: FileSystemPath) -> Result<Vc<RenderedPage>> {
    let page = parse_page(path.clone()).await?;
    let body = render_body_html(root.clone(), path).await?;
    let backlinks = render_backlinks_html(root, page.title.clone(), page.slug.clone()).await?;

    let mut html = String::new();
    html.push_str("<!doctype html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n<title>");
    html.push_str(&escape_html(&page.title));
    html.push_str("</title>\n</head>\n<body>\n<h1>");
    html.push_str(&escape_html(&page.title));
    html.push_str("</h1>\n");
    html.push_str(&body);
    html.push_str(&backlinks);
    html.push_str("</body>\n</html>\n");

    Ok(RenderedPage {
        slug: page.slug.clone(),
        html: html.into(),
    }
    .cell())
}

#[turbo_tasks::function(operation, root)]
async fn compile_wiki(root_dir: RcStr, watch: bool) -> Result<Vc<CompiledWiki>> {
    let fs = wiki_fs(root_dir, watch);
    let root = fs.root().owned().await?;
    let paths = page_paths(root.clone()).await?;
    let mut pages = Vec::new();
    for path in paths.iter() {
        pages.push(
            render_page(root.clone(), path.clone())
                .to_resolved()
                .await?,
        );
    }
    Ok(CompiledWiki { pages }.cell())
}

#[turbo_tasks::function(operation, root)]
async fn compile_report(root_dir: RcStr, watch: bool) -> Result<Vc<Report>> {
    let compilation = compile_wiki(root_dir, watch);
    let wiki = compilation.connect().await?;

    let mut diagnostics = Vec::new();
    for diagnostic in compilation.peek_collectibles::<Box<dyn WikiDiagnostic>>() {
        diagnostics.push(diagnostic.message().owned().await?);
    }
    diagnostics.sort();

    let mut pages = Vec::new();
    for &page in &wiki.pages {
        let page = page.await?;
        pages.push((page.slug.clone(), page.html.clone()));
    }

    Ok(Report { pages, diagnostics }.cell())
}

// -----------------------------------------------------------------------------------------------
// Pure helpers (no turbo-tasks)
// -----------------------------------------------------------------------------------------------

fn normalize_title(title: &str) -> String {
    title.trim().to_lowercase()
}

/// Returns (title, body). The title is the first `# ` heading, which is
/// removed from the body; pages without one use the slug as title.
fn parse_markdown(text: &str, slug: &str) -> (String, String) {
    let mut title = None;
    let mut body = String::new();
    for line in text.lines() {
        if title.is_none()
            && let Some(heading) = line.strip_prefix("# ")
        {
            title = Some(heading.trim().to_string());
            continue;
        }
        body.push_str(line);
        body.push('\n');
    }
    (title.unwrap_or_else(|| slug.to_string()), body)
}

fn extract_wikilinks(text: &str) -> Vec<RcStr> {
    let mut links = Vec::new();
    let mut rest = text;
    while let Some(start) = rest.find("[[") {
        rest = &rest[start + 2..];
        let Some(end) = rest.find("]]") else {
            break;
        };
        let target = rest[..end].trim();
        if !target.is_empty() {
            links.push(RcStr::from(target.to_string()));
        }
        rest = &rest[end + 2..];
    }
    links
}

fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Renders the body: `# `/`## ` headings, blank-line-separated paragraphs, and
/// `[[link]]`s replaced with anchors (or a `broken-link` span if unresolved).
fn render_body(body: &str, resolved: &HashMap<String, Option<RcStr>>) -> String {
    let mut html = String::new();
    let mut paragraph = String::new();

    let flush_paragraph = |html: &mut String, paragraph: &mut String| {
        if !paragraph.trim().is_empty() {
            html.push_str("<p>");
            html.push_str(paragraph.trim());
            html.push_str("</p>\n");
        }
        paragraph.clear();
    };

    for line in body.lines() {
        if line.trim().is_empty() {
            flush_paragraph(&mut html, &mut paragraph);
        } else if let Some(heading) = line.strip_prefix("## ") {
            flush_paragraph(&mut html, &mut paragraph);
            html.push_str("<h2>");
            html.push_str(&escape_html(heading.trim()));
            html.push_str("</h2>\n");
        } else if let Some(heading) = line.strip_prefix("# ") {
            flush_paragraph(&mut html, &mut paragraph);
            html.push_str("<h1>");
            html.push_str(&escape_html(heading.trim()));
            html.push_str("</h1>\n");
        } else {
            if !paragraph.is_empty() {
                paragraph.push(' ');
            }
            paragraph.push_str(&render_inline(line, resolved));
        }
    }
    flush_paragraph(&mut html, &mut paragraph);
    html
}

fn render_inline(line: &str, resolved: &HashMap<String, Option<RcStr>>) -> String {
    let mut out = String::new();
    let mut rest = line;
    loop {
        let Some(start) = rest.find("[[") else {
            out.push_str(&escape_html(rest));
            break;
        };
        out.push_str(&escape_html(&rest[..start]));
        rest = &rest[start + 2..];
        let Some(end) = rest.find("]]") else {
            out.push_str("[[");
            out.push_str(&escape_html(rest));
            break;
        };
        let target = rest[..end].trim();
        match resolved
            .get(&normalize_title(target))
            .and_then(|s| s.as_ref())
        {
            Some(slug) => {
                out.push_str(&format!(
                    "<a href=\"./{}.html\">{}</a>",
                    escape_html(slug),
                    escape_html(target)
                ));
            }
            None => {
                out.push_str(&format!(
                    "<span class=\"broken-link\">{}</span>",
                    escape_html(target)
                ));
            }
        }
        rest = &rest[end + 2..];
    }
    out
}

// -----------------------------------------------------------------------------------------------
// Driver
// -----------------------------------------------------------------------------------------------

/// A settled compilation result, materialized outside of turbo-tasks.
struct Snapshot {
    pages: Vec<(String, String)>,
    diagnostics: Vec<String>,
}

fn main() {
    let mut rt = tokio::runtime::Builder::new_multi_thread();
    rt.enable_all()
        .on_thread_stop(|| {
            TurboMalloc::thread_stop();
        })
        .on_thread_park(|| {
            TurboMalloc::thread_park();
        });
    let result = rt.build().unwrap().block_on(main_inner());
    if let Err(err) = result {
        eprintln!("error: {err:?}");
        exit(1);
    }
}

fn usage() -> ! {
    eprintln!("usage: turbo-wiki <input-dir> [output-dir] [--watch] [--persist] [--serve]");
    exit(2);
}

async fn main_inner() -> Result<()> {
    let mut input: Option<PathBuf> = None;
    let mut output: Option<PathBuf> = None;
    let mut watch = false;
    let mut persist = false;
    let mut serve = false;
    for arg in std::env::args().skip(1) {
        match arg.as_str() {
            "--watch" => watch = true,
            "--persist" => persist = true,
            "--serve" => serve = true,
            "--help" | "-h" => usage(),
            _ if input.is_none() => input = Some(PathBuf::from(&arg)),
            _ if output.is_none() => output = Some(PathBuf::from(&arg)),
            _ => usage(),
        }
    }
    // Serving is a standing query over the wiki; it requires the watcher.
    if serve {
        watch = true;
    }
    let Some(input) = input else { usage() };
    let input = std::fs::canonicalize(&input)
        .with_context(|| format!("input directory {} not found", input.display()))?;
    let output = output.unwrap_or_else(|| {
        let name = input.file_name().and_then(|n| n.to_str()).unwrap_or("wiki");
        input
            .parent()
            .unwrap_or(Path::new("."))
            .join(format!("{name}-html"))
    });
    if output.starts_with(&input) {
        bail!(
            "output directory {} must not be inside the (watched) input directory {}",
            output.display(),
            input.display()
        );
    }

    let tt = if persist {
        let cache_dir = output.join(".turbo-wiki-cache");
        // A fixed version string: the cache survives across runs of the same
        // binary version. (A dirty git state disables caching in turbopack's
        // setup, so we deliberately report a clean, constant version here.)
        let version_info = GitVersionInfo {
            describe: "turbo-wiki-0",
            dirty: false,
        };
        let (backing_storage, cache_state) =
            turbo_backing_storage(&cache_dir, &version_info, false, !watch, false)?;
        if let StartupCacheState::Invalidated { reason_code } = cache_state {
            eprintln!(
                "note: persistent cache was invalidated{}",
                reason_code
                    .as_deref()
                    .map(|s| format!(" ({s})"))
                    .unwrap_or_default()
            );
        }
        let storage_mode = if watch {
            StorageMode::ReadWrite
        } else {
            // Short session: persist everything once, on shutdown.
            StorageMode::ReadWriteOnShutdown
        };
        TurboTasks::new(TurboTasksBackend::new(
            BackendOptions {
                storage_mode: Some(storage_mode),
                ..Default::default()
            },
            backing_storage,
        ))
    } else {
        TurboTasks::new(TurboTasksBackend::new(
            BackendOptions {
                storage_mode: None,
                ..Default::default()
            },
            noop_backing_storage(),
        ))
    };

    let root_dir: RcStr = input
        .to_str()
        .ok_or_else(|| anyhow!("input path is not valid UTF-8"))?
        .to_string()
        .into();

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<Snapshot>();

    let start = Instant::now();
    let task = tt.spawn_root_task(move || {
        let tx = tx.clone();
        let root_dir = root_dir.clone();
        async move {
            let report = compile_report(root_dir, watch)
                .read_strongly_consistent()
                .await?;
            let _ = tx.send(Snapshot {
                pages: report
                    .pages
                    .iter()
                    .map(|(slug, html)| (slug.to_string(), html.to_string()))
                    .collect(),
                diagnostics: report.diagnostics.iter().map(|d| d.to_string()).collect(),
            });
            Ok(Completion::new())
        }
    });

    if serve {
        serve_loop(rx, start).await?;
        tt.dispose_root_task(task);
        tt.stop_and_wait().await;
        return Ok(());
    }

    // Content of the files we've written, to skip and count unchanged outputs.
    let mut written: HashMap<String, String> = HashMap::new();
    let mut first = true;
    while let Some(snapshot) = rx.recv().await {
        std::fs::create_dir_all(&output)
            .with_context(|| format!("failed to create {}", output.display()))?;

        let mut wrote = 0usize;
        let mut unchanged = 0usize;
        for (slug, html) in &snapshot.pages {
            if written.get(slug) == Some(html) {
                unchanged += 1;
                continue;
            }
            std::fs::write(output.join(format!("{slug}.html")), html)?;
            written.insert(slug.clone(), html.clone());
            wrote += 1;
        }
        // Remove outputs for deleted pages.
        let live: std::collections::HashSet<&String> =
            snapshot.pages.iter().map(|(slug, _)| slug).collect();
        let stale: Vec<String> = written
            .keys()
            .filter(|slug| !live.contains(slug))
            .cloned()
            .collect();
        for slug in stale {
            let _ = std::fs::remove_file(output.join(format!("{slug}.html")));
            written.remove(&slug);
        }

        if first {
            println!(
                "compiled {} pages in {:?} ({} written) -> {}",
                snapshot.pages.len(),
                start.elapsed(),
                wrote,
                output.display()
            );
            first = false;
        } else {
            println!(
                "recompiled: {} pages ({} written, {} unchanged)",
                snapshot.pages.len(),
                wrote,
                unchanged
            );
        }
        for diagnostic in &snapshot.diagnostics {
            println!("  warning: {diagnostic}");
        }

        if !watch {
            break;
        }
        println!("watching for changes...");
    }

    tt.dispose_root_task(task);
    tt.stop_and_wait().await;
    Ok(())
}

// -----------------------------------------------------------------------------------------------
// Dev server (--serve)
// -----------------------------------------------------------------------------------------------
//
// A miniature version of the dev-server shape: the compilation is a standing
// query, pages are served from the latest settled snapshot in memory, and a
// server-sent-events stream tells open browser tabs which pages changed so
// they can refetch and patch themselves without a full reload. Hand-rolled
// HTTP to keep the crate dependency-free.

const SERVE_ADDR: &str = "127.0.0.1:3080";

type PageMap = std::sync::Arc<std::sync::RwLock<HashMap<String, String>>>;

async fn serve_loop(
    mut rx: tokio::sync::mpsc::UnboundedReceiver<Snapshot>,
    start: Instant,
) -> Result<()> {
    let pages: PageMap = Default::default();
    let (events_tx, _) = tokio::sync::broadcast::channel::<String>(16);

    let listener = tokio::net::TcpListener::bind(SERVE_ADDR)
        .await
        .with_context(|| format!("failed to bind {SERVE_ADDR}"))?;
    {
        let pages = pages.clone();
        let events_tx = events_tx.clone();
        tokio::spawn(async move {
            loop {
                let Ok((stream, _)) = listener.accept().await else {
                    continue;
                };
                tokio::spawn(handle_connection(
                    stream,
                    pages.clone(),
                    events_tx.subscribe(),
                ));
            }
        });
    }

    let mut first = true;
    while let Some(snapshot) = rx.recv().await {
        let mut changed: Vec<String> = Vec::new();
        {
            let mut pages = pages.write().unwrap();
            for (slug, html) in &snapshot.pages {
                if pages.get(slug) != Some(html) {
                    pages.insert(slug.clone(), html.clone());
                    changed.push(slug.clone());
                }
            }
            let live: std::collections::HashSet<&String> =
                snapshot.pages.iter().map(|(slug, _)| slug).collect();
            let stale: Vec<String> = pages
                .keys()
                .filter(|slug| !live.contains(slug))
                .cloned()
                .collect();
            for slug in stale {
                pages.remove(&slug);
                changed.push(slug);
            }
        }

        if first {
            println!(
                "compiled {} pages in {:?} — serving at http://{SERVE_ADDR}/",
                snapshot.pages.len(),
                start.elapsed(),
            );
            first = false;
        } else {
            println!(
                "recompiled: {} of {} pages",
                changed.len(),
                snapshot.pages.len()
            );
        }
        for diagnostic in &snapshot.diagnostics {
            println!("  warning: {diagnostic}");
        }

        if !changed.is_empty() {
            let payload = format!(
                "[{}]",
                changed
                    .iter()
                    .map(|slug| format!("{slug:?}"))
                    .collect::<Vec<_>>()
                    .join(",")
            );
            let _ = events_tx.send(payload);
        }
    }
    Ok(())
}

async fn handle_connection(
    mut stream: tokio::net::TcpStream,
    pages: PageMap,
    mut events: tokio::sync::broadcast::Receiver<String>,
) {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    let mut buf = Vec::new();
    let mut tmp = [0u8; 1024];
    loop {
        let Ok(n) = stream.read(&mut tmp).await else {
            return;
        };
        if n == 0 {
            return;
        }
        buf.extend_from_slice(&tmp[..n]);
        if buf.windows(4).any(|w| w == b"\r\n\r\n") || buf.len() > 8192 {
            break;
        }
    }
    let head = String::from_utf8_lossy(&buf);
    let path = head
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .unwrap_or("/");
    let path = path.split('?').next().unwrap_or("/");

    if path == "/__events" {
        let _ = stream
            .write_all(
                b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\nConnection: keep-alive\r\n\r\nretry: 500\n\n",
            )
            .await;
        loop {
            match events.recv().await {
                Ok(payload) => {
                    if stream
                        .write_all(format!("data: {payload}\n\n").as_bytes())
                        .await
                        .is_err()
                    {
                        return;
                    }
                    let _ = stream.flush().await;
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(_) => return,
            }
        }
    }

    let slug = path.trim_start_matches('/').trim_end_matches(".html");
    let slug = if slug.is_empty() { "index" } else { slug };
    let body = {
        let pages = pages.read().unwrap();
        pages.get(slug).map(|html| inject_live_script(html, slug))
    };
    match body {
        Some(body) => {
            let head = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: \
                 {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            let _ = stream.write_all(head.as_bytes()).await;
            let _ = stream.write_all(body.as_bytes()).await;
        }
        None => {
            let body = "not found";
            let head = format!(
                "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nContent-Length: \
                 {}\r\nConnection: close\r\n\r\n",
                body.len()
            );
            let _ = stream.write_all(head.as_bytes()).await;
            let _ = stream.write_all(body.as_bytes()).await;
        }
    }
}

/// Injects the live-update client: listen for changed slugs over SSE and,
/// when this page is affected, refetch it and patch the document in place.
fn inject_live_script(html: &str, slug: &str) -> String {
    let script = format!(
        "<script>\nconst slug = {slug:?};\nconst es = new \
         EventSource(\"/__events\");\nes.onmessage = async (e) => {{\nif \
         (!JSON.parse(e.data).includes(slug)) return;\nconst html = await (await \
         fetch(location.pathname)).text();\nconst doc = new DOMParser().parseFromString(html, \
         \"text/html\");\ndocument.body.innerHTML = doc.body.innerHTML;\ndocument.title = \
         doc.title;\n}};\n</script>\n"
    );
    match html.rfind("</body>") {
        Some(i) => format!("{}{}{}", &html[..i], script, &html[i..]),
        None => format!("{html}{script}"),
    }
}
