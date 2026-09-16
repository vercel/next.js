//! `HtmlAsset` — take the user's own `index.html` as the entry, discover its local
//! `<script type="module">` / `<link rel="stylesheet">` tags, compile them, and rewrite those
//! tags to point at the hashed chunks while preserving all other markup byte-for-byte.
//!
//! Parsing and rewriting use the SWC HTML crates (`swc_html_*`), so the whole toolchain shares
//! one parser family.

use std::sync::Arc;

use anyhow::{Result, bail};
use mime::TEXT_HTML_UTF_8;
use swc_core::common::{FileName, SourceMap};
use swc_html_ast::{Child, Document, Element};
use swc_html_parser::{parse_file_as_document, parser::ParserConfig};
use turbo_rcstr::RcStr;
use turbo_tasks::{ReadRef, ResolvedVc, TryJoinIterExt, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbo_tasks_hash::{Xxh3Hash64Hasher, encode_base64};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        ChunkableModule, ChunkingContext, ChunkingContextExt, EvaluatableAssets,
        availability_info::AvailabilityInfo,
    },
    module::Module,
    module_graph::{ModuleGraph, chunk_group_info::ChunkGroup},
    output::{OutputAsset, OutputAssets, OutputAssetsReference, OutputAssetsWithReferenced},
    source::Source,
    version::{Version, VersionedContent},
};

// ---------------------------------------------------------------------------
// Pure HTML parse / discover / rewrite (SWC). No turbo-tasks here.
// ---------------------------------------------------------------------------

/// Discovered local entry references + the byte spans of the elements that carry them, so the
/// rewrite can splice them out/replace them without disturbing the rest of the document.
#[derive(Default)]
struct DiscoveredEntries {
    scripts: Vec<RcStr>,
    stylesheets: Vec<RcStr>,
    /// (lo, hi) absolute `BytePos` ranges of discovered local `<script type=module>` elements.
    script_spans: Vec<(u32, u32)>,
    /// (lo, hi) absolute `BytePos` ranges of discovered local `<link rel=stylesheet>` elements.
    link_spans: Vec<(u32, u32)>,
}

fn discover(children: &[Child], out: &mut DiscoveredEntries) {
    for child in children {
        if let Child::Element(el) = child {
            if let Some(src) = is_local_module_script(el) {
                out.scripts.push(src.into());
                out.script_spans.push((el.span.lo.0, el.span.hi.0));
            } else if let Some(href) = is_local_stylesheet_link(el) {
                out.stylesheets.push(href.into());
                out.link_spans.push((el.span.lo.0, el.span.hi.0));
            }
            discover(&el.children, out);
            if let Some(content) = &el.content {
                discover(&content.children, out);
            }
        }
    }
}

/// A local reference is a project-relative URL, not a remote/absolute/data/anchor one.
fn is_local(url: &str) -> bool {
    !(url.starts_with("http://")
        || url.starts_with("https://")
        || url.starts_with("//")
        || url.starts_with("data:")
        || url.starts_with('#'))
}

fn attr_value<'a>(el: &'a Element, name: &str) -> Option<&'a str> {
    el.attributes
        .iter()
        .find(|a| &*a.name == name)
        .and_then(|a| a.value.as_deref())
}

/// Is this a local `<script type="module" src=...>`?
fn is_local_module_script(el: &Element) -> Option<&str> {
    if &*el.tag_name != "script" {
        return None;
    }
    let ty = attr_value(el, "type").unwrap_or("");
    if ty != "module" {
        return None;
    }
    attr_value(el, "src").filter(|s| is_local(s))
}

/// Is this a local `<link rel="stylesheet" href=...>`?
fn is_local_stylesheet_link(el: &Element) -> Option<&str> {
    if &*el.tag_name != "link" {
        return None;
    }
    let rel = attr_value(el, "rel").unwrap_or("");
    if rel != "stylesheet" {
        return None;
    }
    attr_value(el, "href").filter(|h| is_local(h))
}

/// Parse `html` and return its local (project-relative) `<script type=module src>` and
/// `<link rel=stylesheet href>` references, in document order. Pure, no turbo-tasks.
pub fn local_html_entries(html: &str) -> Result<(Vec<RcStr>, Vec<RcStr>)> {
    let (_base, document) = parse_document(html)?;
    let mut found = DiscoveredEntries::default();
    discover(&document.children, &mut found);
    Ok((found.scripts, found.stylesheets))
}

/// Parse the template, returning the file's base `BytePos` (to translate spans into string byte
/// offsets) and the `Document`.
fn parse_document(html: &str) -> Result<(u32, Document)> {
    let cm: Arc<SourceMap> = Default::default();
    let fm = cm.new_source_file(
        FileName::Custom("index.html".into()).into(),
        html.to_string(),
    );
    let base = fm.start_pos.0;
    let mut errors = Vec::new();
    let document = parse_file_as_document(&fm, ParserConfig::default(), &mut errors)
        .map_err(|e| anyhow::anyhow!("failed to parse HTML template: {e:?}"))?;
    Ok((base, document))
}

/// Insert `insert` immediately before the last case-insensitive occurrence of `needle`.
fn inject_before(html: &str, needle: &str, insert: &str) -> Option<String> {
    let pos = html
        .to_ascii_lowercase()
        .rfind(&needle.to_ascii_lowercase())?;
    let mut out = String::with_capacity(html.len() + insert.len() + 1);
    out.push_str(&html[..pos]);
    out.push_str(insert);
    out.push('\n');
    out.push_str(&html[pos..]);
    Some(out)
}

/// Rewrite the user's HTML by **surgical byte-span splicing** -- everything but the
/// discovered entry tags is byte-for-byte preserved).
/// The first discovered `<script>`/`<link>` is replaced with the hashed chunk tags,
/// any additional discovered ones are removed, and if a chunk kind has no tag to
/// carry it, it is injected before `</body>` / `</head>`.
fn rewrite_html(template: &str, js_paths: &[RcStr], css_paths: &[RcStr]) -> Result<RcStr> {
    let (base, document) = parse_document(template)?;
    let mut found = DiscoveredEntries::default();
    discover(&document.children, &mut found);

    let js_tags = js_paths
        .iter()
        .map(|p| format!("<script src=\"{p}\"></script>"))
        .collect::<Vec<_>>()
        .join("\n");
    let css_tags = css_paths
        .iter()
        .map(|p| format!("<link rel=\"stylesheet\" href=\"{p}\">"))
        .collect::<Vec<_>>()
        .join("\n");

    // Translate swc `BytePos` to a byte offset in `template`. The spans come from parsing
    // `template` itself, so `p >= base` always holds; a violation means the span is corrupt, which
    // we surface rather than silently underflowing or clamping.
    let to_idx = |p: u32| -> Result<usize> {
        p.checked_sub(base)
            .map(|d| d as usize)
            .ok_or_else(|| anyhow::anyhow!("HTML element span pos {p} precedes source base {base}"))
    };
    let mut edits: Vec<(usize, usize, String)> = Vec::new();

    let mut js_placed = false;
    for (i, (lo, hi)) in found.script_spans.iter().enumerate() {
        let repl = if i == 0 && !js_tags.is_empty() {
            js_placed = true;
            js_tags.clone()
        } else {
            String::new()
        };
        edits.push((to_idx(*lo)?, to_idx(*hi)?, repl));
    }
    let mut css_placed = false;
    for (i, (lo, hi)) in found.link_spans.iter().enumerate() {
        let repl = if i == 0 && !css_tags.is_empty() {
            css_placed = true;
            css_tags.clone()
        } else {
            String::new()
        };
        edits.push((to_idx(*lo)?, to_idx(*hi)?, repl));
    }

    // Apply edits from the end so earlier byte offsets stay valid. If a span isn't a valid byte
    // range on `template`, our discovery/splice logic is out of sync with the parse — error loudly
    // rather than skipping the edit, which (with `js_placed`/`css_placed` already set) would emit a
    // page that silently references no chunks.
    edits.sort_by_key(|e| std::cmp::Reverse(e.0));
    let mut html = template.to_string();
    for (s, e, repl) in edits {
        if !(s <= e && e <= html.len() && html.is_char_boundary(s) && html.is_char_boundary(e)) {
            bail!(
                "cannot splice chunk tags: invalid HTML element span {s}..{e} on a {}-byte \
                 document",
                html.len()
            );
        }
        html.replace_range(s..e, &repl);
    }

    // Carry chunks that had no discovered tag to replace.
    if !js_placed && !js_tags.is_empty() {
        html = inject_before(&html, "</body>", &js_tags).unwrap_or_else(|| {
            let mut s = html.clone();
            s.push_str(&js_tags);
            s
        });
    }
    if !css_placed && !css_tags.is_empty() {
        html = inject_before(&html, "</head>", &css_tags).unwrap_or_else(|| {
            let mut s = html.clone();
            s.push_str(&css_tags);
            s
        });
    }

    Ok(html.into())
}

// ---------------------------------------------------------------------------
// Template rewriting and asset generation
// ---------------------------------------------------------------------------

/// Generated from a parsed HTML entry point, rewriting script and style tags to point at the
/// hashed chunks the entry compiles to.
#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub struct HtmlAsset {
    path: FileSystemPath,
    /// The URL root (dev server root / build out dir). Chunk URLs are computed relative to
    /// this and begin with `asset_prefix`, so they are depth-independent. A nested page
    /// (`/blog/post.html`) references the same `<prefix>/_chunks/x.js` as a root page.
    server_root: FileSystemPath,
    /// Asset base path prepended to each chunk/asset URL. Must be normalized to a
    /// trailing `/` by the caller.
    asset_prefix: RcStr,
    /// Parsed HTML source from the original entrypoint
    template: ResolvedVc<Box<dyn Source>>,
    chunkable_modules: Vec<ResolvedVc<Box<dyn ChunkableModule>>>,
    module_graph: ResolvedVc<ModuleGraph>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    runtime_entries: Option<ResolvedVc<EvaluatableAssets>>,
}

impl HtmlAsset {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        path: FileSystemPath,
        server_root: FileSystemPath,
        asset_prefix: RcStr,
        template: ResolvedVc<Box<dyn Source>>,
        chunkable_modules: Vec<ResolvedVc<Box<dyn ChunkableModule>>>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        runtime_entries: Option<ResolvedVc<EvaluatableAssets>>,
    ) -> Vc<Self> {
        HtmlAsset {
            path,
            server_root,
            asset_prefix,
            template,
            chunkable_modules,
            module_graph,
            chunking_context,
            runtime_entries,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for HtmlAsset {
    #[turbo_tasks::function]
    fn references(self: Vc<Self>) -> Vc<OutputAssetsWithReferenced> {
        self.chunk_group()
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for HtmlAsset {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        self.path.clone().cell()
    }
}

#[turbo_tasks::value_impl]
impl Asset for HtmlAsset {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<AssetContent> {
        self.html_content().content()
    }

    #[turbo_tasks::function]
    fn versioned_content(self: Vc<Self>) -> Vc<Box<dyn VersionedContent>> {
        Vc::upcast(self.html_content())
    }
}

#[turbo_tasks::value_impl]
impl HtmlAsset {
    /// The evaluated chunk group(s) for this page's entries
    #[turbo_tasks::function]
    async fn chunk_group(&self) -> Result<Vc<OutputAssetsWithReferenced>> {
        let chunking_context = self.chunking_context;
        let module_graph = self.module_graph;
        let entry_runtime = self.runtime_entries;
        let groups = self
            .chunkable_modules
            .iter()
            .map(|&chunkable_module| async move {
                // Only an evaluatable module (JS) can be an *evaluated* chunk group: it runs on
                // load, after the runtime entries. A non-evaluatable one — a stylesheet — has
                // nothing to execute, so it gets a plain root chunk group instead. Routing it
                // through the evaluated path would silently drop it, because it cannot be added
                // to the runtime-entry list and the group would come out empty.
                let evaluatable = ResolvedVc::try_downcast(chunkable_module);
                let with_referenced = match (entry_runtime, evaluatable) {
                    (Some(runtime_entries), Some(evaluatable)) => {
                        let runtime_entries = runtime_entries
                            .with_entry(*evaluatable)
                            .to_resolved()
                            .await?;
                        chunking_context
                            .evaluated_chunk_group_assets(
                                chunkable_module.ident(),
                                ChunkGroup::Entry(
                                    runtime_entries
                                        .await?
                                        .iter()
                                        .map(|v| ResolvedVc::upcast(*v))
                                        .collect(),
                                ),
                                *module_graph,
                                OutputAssets::empty(),
                                AvailabilityInfo::root(),
                            )
                            .await?
                    }
                    _ => {
                        chunking_context
                            .root_chunk_group_assets(
                                chunkable_module.ident(),
                                ChunkGroup::Entry(vec![ResolvedVc::upcast(chunkable_module)]),
                                *module_graph,
                            )
                            .await?
                    }
                };
                Ok((
                    with_referenced.assets.await?,
                    with_referenced.referenced_assets.await?,
                    with_referenced.references.await?,
                ))
            })
            .try_join()
            .await?;

        let mut all_assets = Vec::new();
        let mut all_referenced = Vec::new();
        let mut all_references = Vec::new();
        for (assets, referenced, references) in groups {
            all_assets.extend(assets);
            all_referenced.extend(referenced);
            all_references.extend(references);
        }

        Ok(OutputAssetsWithReferenced {
            assets: ResolvedVc::cell(all_assets),
            referenced_assets: ResolvedVc::cell(all_referenced),
            references: ResolvedVc::cell(all_references),
        }
        .cell())
    }

    /// Recompose the parsed source into a static HTML file, replacing existing
    /// script / style link tags with compiled chunks.
    #[turbo_tasks::function]
    async fn html_content(self: Vc<Self>) -> Result<Vc<HtmlAssetContent>> {
        let this = self.await?;

        let mut js_paths = Vec::new();
        let mut css_paths = Vec::new();
        for chunk in &*self.chunk_group().await?.assets.await? {
            let chunk_path = &*chunk.path().await?;
            // Compute the chunk path relative to the SERVER ROOT (the URL root), then prefix the
            // absolute base path. This mirrors the runtime's `CHUNK_BASE_PATH + chunkPath` exactly
            // (chunkPath is the chunk's path relative to the chunking context's client/output root
            // = the server root), so with `DocumentCurrentScript` the runtime's sibling-chunk
            // cross-reference (`getAttribute("src")`) matches the emitted tag. Because it is
            // absolute and page-independent, a nested route (`/blog/post.html`) references the same
            // `/_chunks/x.js`
            if let Some(relative) = this.server_root.get_path_to(chunk_path) {
                let url: RcStr = format!("{}{relative}", this.asset_prefix).into();
                // A chunk can be reached through more than one entry — a stylesheet that is both
                // `<link>`ed in the template and `import`ed from the page's script shows up in
                // both chunk groups. Emit one tag per distinct URL, in first-seen order.
                if relative.ends_with(".js") {
                    if !js_paths.contains(&url) {
                        js_paths.push(url);
                    }
                } else if relative.ends_with(".css") && !css_paths.contains(&url) {
                    css_paths.push(url);
                }
            }
        }

        let template_content = this.template.content().file_content().await?;
        let template = match &*template_content {
            FileContent::Content(file) => file.content().to_str()?.into_owned(),
            FileContent::NotFound => bail!("HTML template not found: {:?}", this.path),
        };

        let html = rewrite_html(&template, &js_paths, &css_paths)?;
        Ok(HtmlAssetContent {
            html,
            js_paths,
            css_paths,
        }
        .cell())
    }
}

#[turbo_tasks::value(operation)]
struct HtmlAssetContent {
    html: RcStr,
    js_paths: Vec<RcStr>,
    css_paths: Vec<RcStr>,
}

#[turbo_tasks::value_impl]
impl HtmlAssetContent {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        AssetContent::file(
            FileContent::Content(File::from(self.html.clone()).with_content_type(TEXT_HTML_UTF_8))
                .cell(),
        )
    }

    #[turbo_tasks::function]
    async fn version(self: Vc<Self>) -> Result<Vc<HtmlAssetVersion>> {
        let this = self.await?;
        Ok(HtmlAssetVersion { content: this }.cell())
    }
}

#[turbo_tasks::value_impl]
impl VersionedContent for HtmlAssetContent {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<AssetContent> {
        self.content()
    }

    #[turbo_tasks::function]
    fn version(self: Vc<Self>) -> Vc<Box<dyn Version>> {
        Vc::upcast(self.version())
    }
}

#[turbo_tasks::value(operation)]
struct HtmlAssetVersion {
    content: ReadRef<HtmlAssetContent>,
}

#[turbo_tasks::value_impl]
impl Version for HtmlAssetVersion {
    #[turbo_tasks::function]
    fn id(&self) -> Vc<RcStr> {
        let mut hasher = Xxh3Hash64Hasher::new();
        hasher.write_ref(&self.content.html);
        for p in self
            .content
            .js_paths
            .iter()
            .chain(self.content.css_paths.iter())
        {
            hasher.write_ref(p);
        }
        let hash = encode_base64(hasher.finish());
        Vc::cell(hash.into())
    }
}
