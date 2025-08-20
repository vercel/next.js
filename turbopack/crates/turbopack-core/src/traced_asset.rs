use std::sync::LazyLock;

use anyhow::Result;
use regex::Regex;
use turbo_rcstr::rcstr;
use turbo_tasks::{FxIndexSet, ResolvedVc, TryFlatJoinIterExt, TryJoinIterExt, Vc};
use turbo_tasks_fs::FileSystemPath;

use crate::{
    asset::{Asset, AssetContent},
    file_source::FileSource,
    module::{Module, Modules},
    output::{OutputAsset, OutputAssets},
    raw_module::RawModule,
    reference::referenced_modules_and_affecting_sources,
    resolve::pattern::{Pattern, PatternMatch, read_matches},
};

/// Converts a traced external [Module] graph into a graph consisting of [TracedAsset]s.
#[turbo_tasks::value]
pub struct TracedAsset {
    module: ResolvedVc<Box<dyn Module>>,
}

#[turbo_tasks::value_impl]
impl TracedAsset {
    #[turbo_tasks::function]
    pub fn new(module: ResolvedVc<Box<dyn Module>>) -> Vc<Self> {
        Self::cell(TracedAsset { module })
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for TracedAsset {
    #[turbo_tasks::function]
    fn path(&self) -> Vc<FileSystemPath> {
        self.module.ident().path()
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<OutputAssets>> {
        static SHARP_BINARY_REGEX: LazyLock<Regex> = LazyLock::new(|| {
            Regex::new("node_modules/@img/sharp-\\w+-\\w+/lib/sharp-(\\w+-\\w+).node$").unwrap()
        });
        let module_path = self.module.ident().path().await?;

        // so sharp does require("@img/sharp-${arch}/sharp.node")
        // @img/sharp-darwin-arm64/lib/sharp-darwin-arm64.node uses the dylib loading mechanism to
        // load @img/sharp-libvips-darwin-arm64/libvips.dylib

        let additional = if SHARP_BINARY_REGEX.is_match(&module_path.path) {
            let arch = SHARP_BINARY_REGEX
                .captures(&module_path.path)
                .unwrap()
                .get(1)
                .unwrap()
                .as_str();

            let package_name = format!("@img/sharp-libvips-{arch}");
            let additional: Vec<&ResolvedVc<Box<dyn Module>>> = [
                // This is the list of rpaths (lookup paths) of the macOS dylib
                "../..",
                "../../..",
                "../../node_modules",
                "../../../node_modules",
            ]
            .iter()
            .filter_map(|p| module_path.parent().join(p).ok()?.join(&package_name).ok())
            .map(resolve_reference_from_dir)
            .try_flat_join()
            .await?;
            Some(additional)
        } else {
            None
        };

        let references = referenced_modules_and_affecting_sources(*self.module)
            .await?
            .iter()
            .chain(additional.into_iter().flatten())
            .map(async |module| {
                Ok(ResolvedVc::upcast(
                    TracedAsset::new(**module).to_resolved().await?,
                ))
            })
            .try_join()
            .await?;
        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Asset for TracedAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        panic!("TracedAsset::content() should never be called");
    }
}

#[turbo_tasks::function]
async fn resolve_reference_from_dir(parent_path: FileSystemPath) -> Result<Vc<Modules>> {
    let matches = read_matches(
        parent_path.clone(),
        rcstr!(""),
        true,
        Pattern::new(Pattern::Dynamic),
    )
    .await?;

    let mut results: FxIndexSet<FileSystemPath> = FxIndexSet::default();
    for pat_match in matches.into_iter() {
        match pat_match {
            PatternMatch::File(_, file) => {
                let realpath = file.realpath_with_links().await?;
                results.extend(realpath.symlinks.iter().cloned());
                results.insert(realpath.path.clone());
            }
            PatternMatch::Directory(..) => {}
        }
    }

    Ok(Vc::cell(
        results
            .into_iter()
            .map(async |p| {
                Ok(ResolvedVc::upcast(
                    RawModule::new(Vc::upcast(FileSource::new(p)))
                        .to_resolved()
                        .await?,
                ))
            })
            .try_join()
            .await?,
    ))
}
