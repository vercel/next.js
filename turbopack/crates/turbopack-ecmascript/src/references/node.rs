use anyhow::Result;
use either::Either;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    chunk::{ChunkableModuleReference, ChunkingType, ChunkingTypeOption},
    file_source::FileSource,
    raw_module::RawModule,
    reference::ModuleReference,
    resolve::{
        pattern::{read_matches, Pattern, PatternMatch},
        ModuleResolveResult, RequestKey,
    },
    source::Source,
};

#[turbo_tasks::value]
#[derive(Hash, Clone, Debug)]
pub struct PackageJsonReference {
    pub package_json: ResolvedVc<FileSystemPath>,
}

#[turbo_tasks::value_impl]
impl PackageJsonReference {
    #[turbo_tasks::function]
    pub fn new(package_json: ResolvedVc<FileSystemPath>) -> Vc<Self> {
        Self::cell(PackageJsonReference { package_json })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for PackageJsonReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        Ok(ModuleResolveResult::module(ResolvedVc::upcast(
            RawModule::new(Vc::upcast(FileSource::new(*self.package_json)))
                .to_resolved()
                .await?,
        ))
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for PackageJsonReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("package.json {}", self.package_json.to_string().await?,).into(),
        ))
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct DirAssetReference {
    pub source: ResolvedVc<Box<dyn Source>>,
    pub path: ResolvedVc<Pattern>,
}

#[turbo_tasks::value_impl]
impl DirAssetReference {
    #[turbo_tasks::function]
    pub fn new(source: ResolvedVc<Box<dyn Source>>, path: ResolvedVc<Pattern>) -> Vc<Self> {
        Self::cell(DirAssetReference { source, path })
    }
}

#[turbo_tasks::function]
async fn resolve_reference_from_dir(
    parent_path: Vc<FileSystemPath>,
    path: Vc<Pattern>,
) -> Result<Vc<ModuleResolveResult>> {
    let path_ref = path.await?;
    let (abs_path, rel_path) = path_ref.split_could_match("/ROOT/");
    let matches = match (abs_path, rel_path) {
        (Some(abs_path), Some(rel_path)) => Either::Right(
            read_matches(
                parent_path.root().resolve().await?,
                "/ROOT/".into(),
                true,
                Pattern::new(abs_path.or_any_nested_file()),
            )
            .await?
            .into_iter()
            .chain(
                read_matches(
                    parent_path,
                    "".into(),
                    true,
                    Pattern::new(rel_path.or_any_nested_file()),
                )
                .await?
                .into_iter(),
            ),
        ),
        (Some(abs_path), None) => Either::Left(
            // absolute path only
            read_matches(
                parent_path.root().resolve().await?,
                "/ROOT/".into(),
                true,
                Pattern::new(abs_path.or_any_nested_file()),
            )
            .await?
            .into_iter(),
        ),
        (None, Some(rel_path)) => Either::Left(
            // relative path only
            read_matches(
                parent_path,
                "".into(),
                true,
                Pattern::new(rel_path.or_any_nested_file()),
            )
            .await?
            .into_iter(),
        ),
        (None, None) => return Ok(ModuleResolveResult::unresolvable().cell()),
    };
    let mut affecting_sources = Vec::new();
    let mut results = Vec::new();
    for pat_match in matches {
        match pat_match {
            PatternMatch::File(matched_path, file) => {
                let realpath = file.realpath_with_links().await?;
                for &symlink in &realpath.symlinks {
                    affecting_sources.push(ResolvedVc::upcast(
                        FileSource::new(*symlink).to_resolved().await?,
                    ));
                }
                results.push((
                    RequestKey::new(matched_path.clone()),
                    ResolvedVc::upcast(
                        RawModule::new(Vc::upcast(FileSource::new(*realpath.path)))
                            .to_resolved()
                            .await?,
                    ),
                ));
            }
            PatternMatch::Directory(..) => {}
        }
    }
    Ok(ModuleResolveResult::modules_with_affecting_sources(results, affecting_sources).cell())
}

#[turbo_tasks::value_impl]
impl ModuleReference for DirAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let parent_path = self.source.ident().path().parent();
        Ok(resolve_reference_from_dir(
            parent_path.resolve().await?,
            *self.path,
        ))
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModuleReference for DirAssetReference {
    #[turbo_tasks::function]
    fn chunking_type(&self) -> Vc<ChunkingTypeOption> {
        Vc::cell(Some(ChunkingType::Traced))
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for DirAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("directory assets {}", self.path.to_string().await?,).into(),
        ))
    }
}
