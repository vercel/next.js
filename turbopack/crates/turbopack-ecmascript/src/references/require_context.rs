use std::{collections::VecDeque, fmt::Write};

use anyhow::{Result, bail};
use bincode::{Decode, Encode};
use swc_core::{ecma::ast::Expr, quote};
use turbo_esregex::EsRegex;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexMap, NonLocalValue, ResolvedVc, ValueToString, Vc, debug::ValueDebugFormat,
};
use turbo_tasks_fs::{DirectoryContent, DirectoryEntry, File, FileContent, FileSystemPath};
use turbopack_core::{
    asset::AssetContent,
    chunk::{ChunkingContext, ChunkingType, ModuleChunkItemIdExt},
    context::AssetContext,
    ident::AssetIdent,
    issue::IssueSource,
    module::Module,
    reference::ModuleReference,
    reference_type::{InnerAssets, ReferenceType},
    resolve::{ModuleResolveResult, origin::ResolveOrigin},
    source::Source,
    virtual_source::VirtualSource,
};

use crate::{
    ast_path_trie::{AstPathId, AstPathTrie, AstPathTrieBuilder},
    code_gen::{CodeGen, CodeGeneration, IntoCodeGenReference},
    create_visitor,
    references::synthetic_source::SyntheticSource,
    runtime_functions::{TURBOPACK_MODULE_CONTEXT, TURBOPACK_REQUIRE},
    utils::{StringifyJs, module_id_to_lit},
};

#[turbo_tasks::value]
#[derive(Debug)]
pub(crate) enum DirListEntry {
    File(FileSystemPath),
    Dir(ResolvedVc<DirList>),
}

#[turbo_tasks::value(transparent)]
pub(crate) struct DirList(
    #[bincode(with = "turbo_bincode::indexmap")] FxIndexMap<RcStr, DirListEntry>,
);

#[turbo_tasks::value_impl]
impl DirList {
    #[turbo_tasks::function]
    pub(crate) fn read(dir: FileSystemPath, recursive: bool, filter: Vc<EsRegex>) -> Vc<Self> {
        Self::read_internal(dir.clone(), dir, recursive, filter)
    }

    #[turbo_tasks::function]
    async fn read_internal(
        root: FileSystemPath,
        dir: FileSystemPath,
        recursive: bool,
        filter: Vc<EsRegex>,
    ) -> Result<Vc<Self>> {
        let root_val = root.clone();
        let dir_val = dir.clone();
        let regex = &filter.await?;

        let mut list = FxIndexMap::default();

        let dir_content = dir.read_dir().await?;
        let entries = match &*dir_content {
            DirectoryContent::Entries(entries) => Some(entries),
            DirectoryContent::NotFound => None,
        };

        for (_, entry) in entries.iter().flat_map(|m| m.iter()) {
            match entry {
                DirectoryEntry::File(path) => {
                    // Webpack always checks the RegExp against a path prefixed with `./`
                    if let Some(relative_path) = root_val.get_relative_request_to(path)
                        && regex.is_match(&relative_path)
                    {
                        list.insert(relative_path, DirListEntry::File(path.clone()));
                    }
                }
                DirectoryEntry::Directory(path) if recursive => {
                    if let Some(relative_path) = dir_val.get_relative_path_to(path) {
                        list.insert(
                            relative_path,
                            DirListEntry::Dir(
                                DirList::read_internal(
                                    root.clone(),
                                    path.clone(),
                                    recursive,
                                    filter,
                                )
                                .to_resolved()
                                .await?,
                            ),
                        );
                    }
                }
                // ignore everything else
                _ => {}
            }
        }

        list.sort_keys();

        Ok(Vc::cell(list))
    }

    #[turbo_tasks::function]
    async fn flatten(self: Vc<Self>) -> Result<Vc<FlatDirList>> {
        let this = self.await?;

        let mut queue = VecDeque::from([this]);

        let mut list = FxIndexMap::default();

        while let Some(dir) = queue.pop_front() {
            for (k, entry) in &*dir {
                match entry {
                    DirListEntry::File(path) => {
                        list.insert(k.clone(), path.clone());
                    }
                    DirListEntry::Dir(d) => {
                        queue.push_back(d.await?);
                    }
                }
            }
        }

        Ok(Vc::cell(list))
    }
}

#[turbo_tasks::value(transparent)]
pub(crate) struct FlatDirList(
    #[bincode(with = "turbo_bincode::indexmap")] FxIndexMap<RcStr, FileSystemPath>,
);

#[turbo_tasks::value_impl]
impl FlatDirList {
    #[turbo_tasks::function]
    pub(crate) fn read(dir: FileSystemPath, recursive: bool, filter: Vc<EsRegex>) -> Vc<Self> {
        DirList::read(dir, recursive, filter).flatten()
    }
}

/// The files matched by a `require.context(..)` call, keyed by their path relative
/// to the context directory, with the request that imports each one from the
/// calling module.
#[turbo_tasks::value(transparent)]
pub struct RequireContextMap(#[bincode(with = "turbo_bincode::indexmap")] FxIndexMap<RcStr, RcStr>);

#[turbo_tasks::value_impl]
impl RequireContextMap {
    #[turbo_tasks::function]
    pub(crate) async fn generate(
        origin_path: FileSystemPath,
        dir: FileSystemPath,
        recursive: bool,
        filter: Vc<EsRegex>,
    ) -> Result<Vc<Self>> {
        let origin_dir = origin_path.parent();

        let list = &*FlatDirList::read(dir, recursive, filter).await?;

        let mut map = FxIndexMap::default();

        for (context_relative, path) in list {
            let Some(origin_relative) = origin_dir.get_relative_request_to(path) else {
                bail!("invariant error: this was already checked in `list_dir`");
            };

            map.insert(context_relative.clone(), origin_relative);
        }

        Ok(Vc::cell(map))
    }
}

/// A reference for `require.context()`. The call is replaced with a synthetic
/// module that requires every matched file, wrapped in
/// `__turbopack_module_context__`.
#[turbo_tasks::value]
#[derive(Hash, Debug, ValueToString)]
pub struct RequireContextAssetReference {
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    pub dir: RcStr,
    pub include_subdirs: bool,
    filter: ResolvedVc<EsRegex>,

    pub issue_source: Option<IssueSource>,
}

impl std::fmt::Display for RequireContextAssetReference {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "require.context {}/{}",
            self.dir,
            if self.include_subdirs { "**" } else { "*" },
        )
    }
}

impl RequireContextAssetReference {
    pub async fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        dir: RcStr,
        include_subdirs: bool,
        filter: Vc<EsRegex>,
        issue_source: Option<IssueSource>,
    ) -> Result<Self> {
        Ok(RequireContextAssetReference {
            origin,
            dir,
            include_subdirs,
            filter: filter.to_resolved().await?,
            issue_source,
        })
    }
}

/// Every argument of the `require.context()` call is part of the ident, so that two
/// calls in the same module only share a synthetic module when they match the same
/// files.
fn modifier(dir: &RcStr, include_subdirs: bool, filter: &EsRegex) -> RcStr {
    format!(
        "require.context {}/{} /{}/{}",
        dir,
        if include_subdirs { "**" } else { "*" },
        filter.pattern,
        filter.flags,
    )
    .into()
}

#[turbo_tasks::value_impl]
impl RequireContextAssetReference {
    /// The synthetic CommonJS module the `require.context()` call is replaced with.
    /// It maps every key of the context to the id and the exports of its module,
    /// which is the shape `__turbopack_module_context__` expects.
    #[turbo_tasks::function]
    async fn module(&self) -> Result<Vc<Box<dyn Module>>> {
        let origin = self.origin.into_trait_ref().await?;
        let origin_path = origin.origin_path();
        let filter = self.filter.await?;

        let map = RequireContextMap::generate(
            origin_path.clone(),
            origin_path.parent().join(&self.dir)?,
            self.include_subdirs,
            *self.filter,
        )
        .await?;

        let mut code = String::from("module.exports = {\n");
        for (key, request) in map.iter() {
            let key = StringifyJs(key);
            let request = StringifyJs(request);
            writeln!(
                code,
                "  {key}: {{ id: () => require.resolve({request}), module: () => \
                 require({request}) }},"
            )?;
        }
        code.push_str("};\n");

        // A sibling of the calling module, so that the requests resolve exactly as they
        // would from the calling module itself. Issues in it are reported at the call.
        let ident = AssetIdent::from_path(origin_path.append(".require-context.cjs")?)
            .with_modifier(modifier(&self.dir, self.include_subdirs, &filter))
            .into_vc()
            .to_resolved()
            .await?;
        let source: Vc<Box<dyn Source>> = match self.issue_source {
            Some(call_site) => Vc::upcast(SyntheticSource::new(*ident, code.into(), call_site)),
            None => Vc::upcast(VirtualSource::new_with_ident(
                *ident,
                AssetContent::file(FileContent::Content(File::from(code)).cell()),
            )),
        };

        let asset_context = *origin.asset_context();
        Ok(asset_context
            .process(
                source,
                ReferenceType::Internal(InnerAssets::empty().to_resolved().await?),
            )
            .module())
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for RequireContextAssetReference {
    #[turbo_tasks::function]
    async fn resolve_reference(self: Vc<Self>) -> Result<Vc<ModuleResolveResult>> {
        Ok(*ModuleResolveResult::module(
            self.module().to_resolved().await?,
        ))
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::Parallel {
            inherit_async: false,
            hoisted: false,
        })
    }

    fn source(&self) -> Option<IssueSource> {
        self.issue_source
    }
}

impl IntoCodeGenReference for RequireContextAssetReference {
    fn into_reference(self) -> ResolvedVc<Box<dyn ModuleReference>> {
        ResolvedVc::upcast(self.resolved_cell())
    }

    fn into_code_gen_reference(
        self,
        _trie: &AstPathTrieBuilder,
        path: AstPathId,
    ) -> (ResolvedVc<Box<dyn ModuleReference>>, CodeGen) {
        let reference = self.resolved_cell();
        (
            ResolvedVc::upcast(reference),
            CodeGen::RequireContextAssetReferenceCodeGen(RequireContextAssetReferenceCodeGen {
                reference,
                path,
            }),
        )
    }
}

#[derive(PartialEq, Eq, ValueDebugFormat, NonLocalValue, Hash, Debug, Encode, Decode)]
pub struct RequireContextAssetReferenceCodeGen {
    path: AstPathId,
    reference: ResolvedVc<RequireContextAssetReference>,
}

impl RequireContextAssetReferenceCodeGen {
    pub async fn code_generation(
        &self,
        trie: &AstPathTrie,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let module_id = self
            .reference
            .module()
            .chunk_item_id(chunking_context)
            .await?;

        let mut visitors = Vec::new();

        visitors.push(create_visitor!(
            trie,
            self.path,
            visit_mut_expr,
            |expr: &mut Expr| {
                if let Expr::Call(_) = expr {
                    *expr = quote!(
                        "$turbopack_module_context($turbopack_require($id))" as Expr,
                        turbopack_module_context: Expr = TURBOPACK_MODULE_CONTEXT.into(),
                        turbopack_require: Expr = TURBOPACK_REQUIRE.into(),
                        id: Expr = module_id_to_lit(&module_id)
                    );
                }
            }
        ));

        Ok(CodeGeneration::visitors(visitors))
    }
}
