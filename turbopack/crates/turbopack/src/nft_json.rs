use anyhow::Result;
use serde_json::json;
use turbo_tasks::{ValueToString, Vc};
use turbo_tasks_fs::{File, FileSystem};
use turbopack_core::{
    asset::{Asset, AssetContent},
    ident::AssetIdent,
    module::Module,
    output::OutputAsset,
    reference::all_modules_and_affecting_sources,
    source_map::SourceMapAsset,
};

#[turbo_tasks::value(shared)]
pub struct NftJsonAsset {
    entry: Vc<Box<dyn Module>>,
    chunk: Option<Vc<Box<dyn OutputAsset>>>,
}

#[turbo_tasks::value_impl]
impl NftJsonAsset {
    #[turbo_tasks::function]
    pub fn new(entry: Vc<Box<dyn Module>>, chunk: Option<Vc<Box<dyn OutputAsset>>>) -> Vc<Self> {
        NftJsonAsset { entry, chunk }.cell()
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for NftJsonAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        // TODO pass this as a parameter to NftJsonAsset
        let path = if let Some(chunk) = self.chunk {
            chunk.ident()
        } else {
            self.entry.ident()
        }
        .path()
        .await?;
        Ok(AssetIdent::from_path(
            path.fs
                .root()
                .join(format!("{}.nft.json", path.path).into()),
        ))
    }
}

#[turbo_tasks::value_impl]
impl Asset for NftJsonAsset {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        // The listed files should be relative to this directory
        let parent_dir = self.ident().path().parent().await?;
        println!("parent_dir: {:?}", parent_dir.path);

        let this = &*self.await?;
        let mut result = Vec::new();
        let set = all_modules_and_affecting_sources(this.entry);
        for asset in set.await? {
            let path = asset.ident().path().await?;
            if let Some(rel_path) = parent_dir.get_relative_path_to(&path) {
                // if rel_path != self_path {
                result.push(rel_path);
            } else {
                println!(
                    "skipped module! {}",
                    asset.ident().path().to_string().await?
                );
            }
        }

        if let Some(chunk) = this.chunk {
            for referenced_chunk in chunk.references().await? {
                // TODO or should it skip sourcemaps by checking path.endsWith(".map")?
                if (Vc::try_resolve_downcast_type::<SourceMapAsset>(*referenced_chunk).await?)
                    .is_some()
                {
                    continue;
                }

                let path = referenced_chunk.ident().path().await?;
                if let Some(rel_path) = parent_dir.get_relative_path_to(&path) {
                    result.push(rel_path);
                } else {
                    println!(
                        "skipped chunk! {}",
                        referenced_chunk.ident().path().to_string().await?
                    );
                }
            }
        }

        result.sort();
        result.dedup();
        let json = json!({
          "version": 1,
          "files": result
        });

        Ok(AssetContent::file(File::from(json.to_string()).into()))
    }
}
