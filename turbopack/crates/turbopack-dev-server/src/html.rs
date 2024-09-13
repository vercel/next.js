use anyhow::{anyhow, Result};
use mime_guess::mime::TEXT_HTML_UTF_8;
use turbo_tasks::{RcStr, ReadRef, TryJoinIterExt, Value, Vc};
use turbo_tasks_fs::{File, FileSystemPath};
use turbo_tasks_hash::{encode_hex, Xxh3Hash64Hasher};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        availability_info::AvailabilityInfo, ChunkableModule, ChunkingContext, ChunkingContextExt,
        EvaluatableAssets,
    },
    ident::AssetIdent,
    module::Module,
    output::{OutputAsset, OutputAssets},
    version::{Version, VersionedContent},
};

// TODO(WEB-945) This should become a struct once we have a
// `turbo_tasks::input` attribute macro/`Input` derive macro.
type DevHtmlEntry = (
    Vc<Box<dyn ChunkableModule>>,
    Vc<Box<dyn ChunkingContext>>,
    Option<Vc<EvaluatableAssets>>,
);

/// The HTML entry point of the dev server.
///
/// Generates an HTML page that includes the ES and CSS chunks.
#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub struct DevHtmlAsset {
    path: Vc<FileSystemPath>,
    entries: Vec<DevHtmlEntry>,
    body: Option<RcStr>,
}

#[turbo_tasks::function]
fn dev_html_chunk_reference_description() -> Vc<RcStr> {
    Vc::cell("dev html chunk".into())
}

#[turbo_tasks::value_impl]
impl OutputAsset for DevHtmlAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        AssetIdent::from_path(self.path)
    }

    #[turbo_tasks::function]
    fn references(self: Vc<Self>) -> Vc<OutputAssets> {
        self.chunks()
    }
}

#[turbo_tasks::value_impl]
impl Asset for DevHtmlAsset {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<AssetContent> {
        self.html_content().content()
    }

    #[turbo_tasks::function]
    fn versioned_content(self: Vc<Self>) -> Vc<Box<dyn VersionedContent>> {
        Vc::upcast(self.html_content())
    }
}

impl DevHtmlAsset {
    /// Create a new dev HTML asset.
    pub fn new(path: Vc<FileSystemPath>, entries: Vec<DevHtmlEntry>) -> Vc<Self> {
        DevHtmlAsset {
            path,
            entries,
            body: None,
        }
        .cell()
    }

    /// Create a new dev HTML asset.
    pub fn new_with_body(
        path: Vc<FileSystemPath>,
        entries: Vec<DevHtmlEntry>,
        body: RcStr,
    ) -> Vc<Self> {
        DevHtmlAsset {
            path,
            entries,
            body: Some(body),
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl DevHtmlAsset {
    #[turbo_tasks::function]
    pub async fn with_path(self: Vc<Self>, path: Vc<FileSystemPath>) -> Result<Vc<Self>> {
        let mut html: DevHtmlAsset = self.await?.clone_value();
        html.path = path;
        Ok(html.cell())
    }

    #[turbo_tasks::function]
    pub async fn with_body(self: Vc<Self>, body: RcStr) -> Result<Vc<Self>> {
        let mut html: DevHtmlAsset = self.await?.clone_value();
        html.body = Some(body);
        Ok(html.cell())
    }
}

#[turbo_tasks::value_impl]
impl DevHtmlAsset {
    #[turbo_tasks::function]
    async fn html_content(self: Vc<Self>) -> Result<Vc<DevHtmlAssetContent>> {
        let this = self.await?;
        let context_path = this.path.parent().await?;
        let mut chunk_paths = vec![];
        for chunk in &*self.chunks().await? {
            let chunk_path = &*chunk.ident().path().await?;
            if let Some(relative_path) = context_path.get_path_to(chunk_path) {
                chunk_paths.push(format!("/{relative_path}").into());
            }
        }

        Ok(DevHtmlAssetContent::new(chunk_paths, this.body.clone()))
    }

    #[turbo_tasks::function]
    async fn chunks(self: Vc<Self>) -> Result<Vc<OutputAssets>> {
        let this = self.await?;

        let all_assets = this
            .entries
            .iter()
            .map(|entry| async move {
                let &(chunkable_module, chunking_context, runtime_entries) = entry;

                let assets = if let Some(runtime_entries) = runtime_entries {
                    let runtime_entries = if let Some(evaluatable) =
                        Vc::try_resolve_downcast(chunkable_module).await?
                    {
                        runtime_entries.with_entry(evaluatable)
                    } else {
                        runtime_entries
                    };
                    chunking_context.evaluated_chunk_group_assets(
                        chunkable_module.ident(),
                        runtime_entries,
                        Value::new(AvailabilityInfo::Root),
                    )
                } else {
                    chunking_context.root_chunk_group_assets(Vc::upcast(chunkable_module))
                };

                assets.await
            })
            .try_join()
            .await?
            .iter()
            .flatten()
            .copied()
            .collect();

        Ok(Vc::cell(all_assets))
    }
}

#[turbo_tasks::value]
struct DevHtmlAssetContent {
    chunk_paths: Vec<RcStr>,
    body: Option<RcStr>,
}

impl DevHtmlAssetContent {
    fn new(chunk_paths: Vec<RcStr>, body: Option<RcStr>) -> Vc<Self> {
        DevHtmlAssetContent { chunk_paths, body }.cell()
    }
}

#[turbo_tasks::value_impl]
impl DevHtmlAssetContent {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let this = self.await?;

        let mut scripts = Vec::new();
        let mut stylesheets = Vec::new();

        for relative_path in &*this.chunk_paths {
            if relative_path.ends_with(".js") {
                scripts.push(format!("<script src=\"{}\"></script>", relative_path));
            } else if relative_path.ends_with(".css") {
                stylesheets.push(format!(
                    "<link data-turbopack rel=\"stylesheet\" href=\"{}\">",
                    relative_path
                ));
            } else {
                return Err(anyhow!("chunk with unknown asset type: {}", relative_path));
            }
        }

        let body = match &this.body {
            Some(body) => body.as_str(),
            None => "",
        };

        let html: RcStr = format!(
            "<!DOCTYPE html>\n<html>\n<head>\n{}\n</head>\n<body>\n{}\n{}\n</body>\n</html>",
            stylesheets.join("\n"),
            body,
            scripts.join("\n"),
        )
        .into();

        Ok(AssetContent::file(
            File::from(html).with_content_type(TEXT_HTML_UTF_8).into(),
        ))
    }

    #[turbo_tasks::function]
    async fn version(self: Vc<Self>) -> Result<Vc<DevHtmlAssetVersion>> {
        let this = self.await?;
        Ok(DevHtmlAssetVersion { content: this }.cell())
    }
}

#[turbo_tasks::value_impl]
impl VersionedContent for DevHtmlAssetContent {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<AssetContent> {
        self.content()
    }

    #[turbo_tasks::function]
    fn version(self: Vc<Self>) -> Vc<Box<dyn Version>> {
        Vc::upcast(self.version())
    }
}

#[turbo_tasks::value]
struct DevHtmlAssetVersion {
    content: ReadRef<DevHtmlAssetContent>,
}

#[turbo_tasks::value_impl]
impl Version for DevHtmlAssetVersion {
    #[turbo_tasks::function]
    async fn id(&self) -> Result<Vc<RcStr>> {
        let mut hasher = Xxh3Hash64Hasher::new();
        for relative_path in &*self.content.chunk_paths {
            hasher.write_ref(relative_path);
        }
        if let Some(body) = &self.content.body {
            hasher.write_ref(body);
        }
        let hash = hasher.finish();
        let hex_hash = encode_hex(hash);
        Ok(Vc::cell(hex_hash.into()))
    }
}
