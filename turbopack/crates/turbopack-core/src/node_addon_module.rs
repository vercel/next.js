use std::sync::LazyLock;

use anyhow::{Result, bail};
use regex::Regex;
use turbo_rcstr::rcstr;
use turbo_tasks::{FxIndexSet, ResolvedVc, TryJoinIterExt, Vc};
use turbo_tasks_fs::{FileSystemEntryType, FileSystemPath};

use crate::{
    asset::{Asset, AssetContent},
    file_source::FileSource,
    ident::AssetIdent,
    module::Module,
    raw_module::RawModule,
    reference::{ModuleReferences, TracedModuleReference},
    resolve::pattern::{Pattern, PatternMatch, read_matches},
    source::Source,
};

/// A module corresponding to `.node` files.
#[turbo_tasks::value]
pub struct NodeAddonModule {
    source: ResolvedVc<Box<dyn Source>>,
}

#[turbo_tasks::value_impl]
impl NodeAddonModule {
    #[turbo_tasks::function]
    pub fn new(source: ResolvedVc<Box<dyn Source>>) -> Vc<NodeAddonModule> {
        NodeAddonModule { source }.cell()
    }
}

#[turbo_tasks::value_impl]
impl Module for NodeAddonModule {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source.ident().with_modifier(rcstr!("node addon"))
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        static SHARP_BINARY_REGEX: LazyLock<Regex> =
            LazyLock::new(|| Regex::new("/sharp-(\\w+-\\w+).node$").unwrap());
        let module_path = self.source.ident().path().await?;

        // For most .node binaries, we usually assume that they are standalone dynamic library
        // binaries that get loaded by some `require` call. So the binary itself doesn't read any
        // files by itself, but only when instructed to from the JS side.
        //
        // For sharp, that is not the case:
        // 1. `node_modules/sharp/lib/sharp.js` does `require("@img/sharp-${arch}/sharp.node")`
        //    which ends up resolving to ...
        // 2. @img/sharp-darwin-arm64/lib/sharp-darwin-arm64.node. That is however a dynamic library
        //    that uses the OS loader to load yet another binary (you can view these via `otool -L`
        //    on macOS or `ldd` on Linux):
        // 3. @img/sharp-libvips-darwin-arm64/libvips.dylib
        //
        // We could either try to parse the binary and read these dependencies, or (as we do in the
        // following) special case sharp and hardcode this dependency.
        //
        // The JS @vercel/nft implementation has a similar special case:
        // https://github.com/vercel/nft/blob/7e915aa02073ec57dc0d6528c419a4baa0f03d40/src/utils/special-cases.ts#L151-L181
        if SHARP_BINARY_REGEX.is_match(&module_path.path) {
            // module_path might be something like
            // node_modules/@img/sharp-darwin-arm64/lib/sharp-darwin-arm64.node
            let arch = SHARP_BINARY_REGEX
                .captures(&module_path.path)
                .unwrap()
                .get(1)
                .unwrap()
                .as_str();

            let package_name = format!("@img/sharp-libvips-{arch}");
            for folder in [
                // This is the list of rpaths (lookup paths) of the shared library, at least on
                // macOS and Linux https://github.com/lovell/sharp/blob/c01e272db522a8b7d174bd3be7400a4a87f08702/src/binding.gyp#L158-L201
                "../..",
                "../../..",
                "../../node_modules",
                "../../../node_modules",
            ]
            .iter()
            .filter_map(|p| module_path.parent().join(p).ok()?.join(&package_name).ok())
            {
                if matches!(
                    &*folder.get_type().await?,
                    FileSystemEntryType::Directory | FileSystemEntryType::Symlink
                ) {
                    return Ok(dir_references(folder));
                }
            }
        };

        // Most addon modules don't have references to other modules.
        Ok(ModuleReferences::empty())
    }
}

#[turbo_tasks::value_impl]
impl Asset for NodeAddonModule {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}

#[turbo_tasks::function]
async fn dir_references(package_dir: FileSystemPath) -> Result<Vc<ModuleReferences>> {
    let matches = read_matches(
        package_dir.clone(),
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
                match &realpath.path_result {
                    Ok(path) => {
                        results.insert(path.clone());
                    }
                    Err(e) => bail!(e.as_error_message(file, &realpath)),
                }
            }
            PatternMatch::Directory(..) => {}
        }
    }

    Ok(Vc::cell(
        results
            .into_iter()
            .map(async |p| {
                Ok(ResolvedVc::upcast(
                    TracedModuleReference::new(Vc::upcast(RawModule::new(Vc::upcast(
                        FileSource::new(p),
                    ))))
                    .to_resolved()
                    .await?,
                ))
            })
            .try_join()
            .await?,
    ))
}
