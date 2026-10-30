use std::{io::Write, path::Path};

use anyhow::{Context, Result};
use serde_json::{Value as JsonValue, json};
use swc_sourcemap::DecodedMap;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc, turbofmt};
use turbo_tasks_fs::{
    DiskFileSystem, File, FileContent, FileSystemPath,
    rope::{Rope, RopeBuilder},
};

use crate::{
    SOURCE_URL_PROTOCOL_STR,
    asset::{Asset, AssetContent},
    output::{OutputAsset, OutputAssets, OutputAssetsReference, OutputAssetsWithReferenced},
    source_map::{GenerateSourceMap, SourceMapAsset},
};

/// Reported as a collectible so wrapping or tree-shaking a processed module doesn't lose its files.
#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub struct EmittedFile {
    /// The compiler that ran the transform.
    pub scope: RcStr,
    /// Relative to the compiler's output directory.
    pub name: RcStr,
    /// The resource whose transform emitted the file, for diagnostics.
    pub origin: FileSystemPath,
    pub content: ResolvedVc<FileContent>,
    /// Unprocessed until the destination's source map setting is known.
    pub source_map: Option<ResolvedVc<FileContent>>,
    pub minimized: bool,
}

#[turbo_tasks::value_trait]
pub trait EmittedFileCollectible {
    #[turbo_tasks::function]
    fn file(self: Vc<Self>) -> Vc<EmittedFile>;
}

#[turbo_tasks::value_impl]
impl EmittedFileCollectible for EmittedFile {
    #[turbo_tasks::function]
    fn file(self: Vc<Self>) -> Vc<EmittedFile> {
        self
    }
}

impl EmittedFile {
    pub fn emit(self: ResolvedVc<Self>) {
        turbo_tasks::emit::<Box<dyn EmittedFileCollectible>>(ResolvedVc::upcast(self));
    }
}

#[turbo_tasks::value]
pub struct EmittedOutputAsset {
    path: FileSystemPath,
    content: ResolvedVc<FileContent>,
    source_map: Option<ResolvedVc<FileContent>>,
}

#[turbo_tasks::value_impl]
impl EmittedOutputAsset {
    #[turbo_tasks::function]
    pub fn new(
        path: FileSystemPath,
        content: ResolvedVc<FileContent>,
        source_map: Option<ResolvedVc<FileContent>>,
    ) -> Vc<Self> {
        Self {
            path,
            content,
            source_map,
        }
        .cell()
    }
}

impl EmittedOutputAsset {
    fn emits_map(&self) -> bool {
        self.source_map.is_some()
            && matches!(self.path.extension(), Some("js" | "mjs" | "cjs" | "css"))
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for EmittedOutputAsset {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        self.path.clone().cell()
    }
}

#[turbo_tasks::value_impl]
impl GenerateSourceMap for EmittedOutputAsset {
    #[turbo_tasks::function]
    async fn generate_source_map(&self) -> Result<Vc<FileContent>> {
        let Some(map) = self.source_map else {
            return Ok(FileContent::NotFound.cell());
        };
        let FileContent::Content(file) = &*map.await? else {
            return Ok(*map);
        };
        let mut map: JsonValue = serde_json::from_slice(&file.content().to_bytes())?;
        map.as_object_mut()
            .context("emitted source map must be an object")?
            .insert(
                "file".into(),
                JsonValue::String(self.path.file_name().to_string()),
            );
        Ok(FileContent::Content(File::from(serde_json::to_vec(&map)?)).cell())
    }
}

#[turbo_tasks::value_impl]
impl OutputAssetsReference for EmittedOutputAsset {
    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<OutputAssetsWithReferenced>> {
        let this = self.await?;
        if !this.emits_map() {
            return Ok(OutputAssetsWithReferenced::from_assets(
                OutputAssets::empty(),
            ));
        }
        let map = SourceMapAsset::new_fixed(this.path.clone(), Vc::upcast(self))
            .to_resolved()
            .await?;
        Ok(OutputAssetsWithReferenced::from_assets(Vc::cell(vec![
            ResolvedVc::upcast(map),
        ])))
    }
}

#[turbo_tasks::value_impl]
impl Asset for EmittedOutputAsset {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        if !self.emits_map() {
            return Ok(AssetContent::file(*self.content));
        }
        let FileContent::Content(file) = &*self.content.await? else {
            return Ok(AssetContent::file(*self.content));
        };
        let mut bytes = RopeBuilder::default();
        bytes += file.content();
        let name = format!("{}.map", self.path.file_name());
        let url = urlencoding::encode(&name);
        if self.path.extension() == Some("css") {
            write!(bytes, "\n/*# sourceMappingURL={url} */")?;
        } else {
            write!(bytes, "\n//# sourceMappingURL={url}")?;
        }
        Ok(AssetContent::file(
            FileContent::Content(File::from(bytes.build())).cell(),
        ))
    }
}

/// A string map names the original source of unchanged content, as in webpack.
/// Never read source contents from disk: the map may be public.
pub async fn prepare_source_map(
    map: JsonValue,
    content: &File,
    source_path: &FileSystemPath,
) -> Result<Option<Rope>> {
    let mut map = match map {
        JsonValue::Object(map) => JsonValue::Object(map),
        JsonValue::String(source) if !source.is_empty() => {
            let Ok(text) = content.content().to_str() else {
                return Ok(None);
            };
            let mappings = std::iter::once("AAAA")
                .chain(std::iter::repeat("AACA"))
                .take(text.split('\n').count())
                .collect::<Vec<_>>()
                .join(";");
            json!({
                "version": 3,
                "sources": [source],
                "sourcesContent": [text],
                "names": [],
                "mappings": mappings,
            })
        }
        _ => return Ok(None),
    };
    let fs = source_path.fs().to_resolved().await?;
    let prefix = format!(
        "{SOURCE_URL_PROTOCOL_STR}///{}/",
        turbofmt!("[{fs}]").await?
    );
    let disk_fs = match ResolvedVc::try_downcast_type::<DiskFileSystem>(fs) {
        Some(disk_fs) => Some((disk_fs, disk_fs.await?)),
        None => None,
    };
    let resolve = |source: &str| -> Option<String> {
        let path = if Path::new(source).is_absolute() {
            let (disk_fs, disk) = disk_fs.as_ref()?;
            disk.try_from_sys_path(*disk_fs, Path::new(source), None)
        } else if let Ok(url) = url::Url::parse(source) {
            let sys_path = url.to_file_path().ok()?;
            let (disk_fs, disk) = disk_fs.as_ref()?;
            disk.try_from_sys_path(*disk_fs, &sys_path, None)
        } else {
            source_path.try_join(&urlencoding::decode(source).ok()?)
        }?;
        Some(format!("{prefix}{}", path.path))
    };
    resolve_sources(&mut map, &resolve)?;
    let map = serde_json::to_vec(&map)?;
    // Index maps are flattened, since consumers such as the minifier expect regular maps.
    Ok(Some(match DecodedMap::from_reader(&*map)? {
        DecodedMap::Index(index) => {
            let mut flattened = Vec::new();
            index.flatten()?.to_writer(&mut flattened)?;
            flattened.into()
        }
        _ => map.into(),
    }))
}

fn resolve_sources(map: &mut JsonValue, resolve: &impl Fn(&str) -> Option<String>) -> Result<()> {
    let map = map
        .as_object_mut()
        .context("source map must be an object")?;
    if let Some(sections) = map.get_mut("sections").and_then(JsonValue::as_array_mut) {
        for section in sections {
            if let Some(map) = section.get_mut("map") {
                resolve_sources(map, resolve)?;
            }
        }
    }
    let source_root = match map.remove("sourceRoot") {
        Some(JsonValue::String(root)) => root,
        _ => String::new(),
    };
    for source in map
        .get_mut("sources")
        .and_then(JsonValue::as_array_mut)
        .into_iter()
        .flatten()
    {
        let Some(name) = source.as_str() else {
            continue;
        };
        let name = if source_root.is_empty() || source_root.ends_with('/') || name.starts_with('/')
        {
            format!("{source_root}{name}")
        } else {
            format!("{source_root}/{name}")
        };
        *source = JsonValue::String(resolve(&name).unwrap_or(name));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use anyhow::Result;
    use serde_json::json;
    use turbo_rcstr::rcstr;
    use turbo_tasks::{Completion, Vc};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
    use turbo_tasks_fs::{File, FileContent, FileSystem, VirtualFileSystem};

    use crate::{
        asset::Asset,
        emitted_output::{EmittedOutputAsset, prepare_source_map},
        output::OutputAssetsReference,
        source_map::GenerateSourceMap,
    };

    #[turbo_tasks::function(operation, root)]
    async fn emitted_source_map_operation() -> Result<Vc<Completion>> {
        let root = VirtualFileSystem::new_with_name(rcstr!("emitted-source-map-test"))
            .root()
            .owned()
            .await?;
        let path = root.join("nested/emitted.js")?;
        let content = FileContent::Content(File::from("console.log('mapped');")).cell();
        let map = json!({ "version": 3, "sources": ["original.js"], "sourcesContent": ["original"], "names": [], "mappings": "AAAA" });
        let asset = EmittedOutputAsset::new(
            path,
            content,
            Some(FileContent::Content(File::from(serde_json::to_vec(&map)?)).cell()),
        );
        let content = asset.content().file_content().await?;
        assert!(
            content
                .as_content()
                .unwrap()
                .content()
                .to_str()?
                .ends_with("//# sourceMappingURL=emitted.js.map")
        );
        let map = asset.generate_source_map().await?;
        let map: serde_json::Value =
            serde_json::from_slice(&map.as_content().unwrap().content().to_bytes())?;
        assert_eq!(map["file"], "emitted.js");
        assert_eq!(map["sourcesContent"][0], "original");
        let references = asset.references().all_assets().await?;
        assert_eq!(references.len(), 1);
        Ok(Completion::new())
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn emitted_source_maps_survive_output_graph() {
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async {
            emitted_source_map_operation()
                .read_strongly_consistent()
                .await?;
            Ok(())
        })
        .await
        .unwrap();
    }

    #[turbo_tasks::function(operation, root)]
    async fn prepared_source_map_operation() -> Result<Vc<Completion>> {
        let root = VirtualFileSystem::new_with_name(rcstr!("project"))
            .root()
            .owned()
            .await?;
        let content = File::from("first();\nsecond();");
        let prepare = async |map| -> Result<Option<serde_json::Value>> {
            let map = prepare_source_map(map, &content, &root).await?;
            Ok(map.map(|map| serde_json::from_slice(&map.to_bytes()).unwrap()))
        };
        for (source_root, source, expected) in [
            ("", "original.js", "turbopack:///[project]/original.js"),
            (
                "sources",
                "/original.js",
                "turbopack:///[project]/sources/original.js",
            ),
            (
                "sources",
                "original.js",
                "turbopack:///[project]/sources/original.js",
            ),
            (
                "https://example.com/src",
                "/original.js",
                "https://example.com/src/original.js",
            ),
        ] {
            let map = prepare(json!({
                "version": 3, "sources": [source], "sourceRoot": source_root,
                "names": [], "mappings": "AAAA", "sourcesContent": ["original"],
            }))
            .await?
            .unwrap();
            assert_eq!(map["sources"][0], expected, "root={source_root}");
            assert!(map.get("sourceRoot").is_none());
            assert_eq!(map["sourcesContent"][0], "original");
        }
        let map = prepare(json!("original.js")).await?.unwrap();
        assert_eq!(map["sources"][0], "turbopack:///[project]/original.js");
        assert_eq!(map["sourcesContent"][0], "first();\nsecond();");
        assert_eq!(map["mappings"], "AAAA;AACA");
        for source in [
            "/outside/original.js",
            "../outside.js",
            "webpack://app/a.js",
        ] {
            let map = prepare(json!({
                "version": 3, "sources": [source], "names": [], "mappings": "AAAA",
            }))
            .await?
            .unwrap();
            assert_eq!(map["sources"][0], source);
            assert!(map.get("sourcesContent").is_none());
        }
        let map = prepare(json!({
            "version": 3,
            "sections": [{"offset": {"line": 0, "column": 0}, "map": {
                "version": 3, "sourceRoot": "sources", "sources": ["a.js"],
                "names": [], "mappings": "AAAA",
            }}],
        }))
        .await?
        .unwrap();
        assert!(map.get("sections").is_none());
        assert_eq!(map["sources"][0], "turbopack:///[project]/sources/a.js");
        assert!(prepare(json!(true)).await?.is_none());
        assert!(prepare(json!({ "mappings": 5 })).await.is_err());
        Ok(Completion::new())
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn emitted_source_maps_are_prepared() {
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async {
            prepared_source_map_operation()
                .read_strongly_consistent()
                .await?;
            Ok(())
        })
        .await
        .unwrap();
    }
}
