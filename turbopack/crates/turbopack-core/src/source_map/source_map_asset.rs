use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    FxIndexSet, NonLocalValue, ResolvedVc, ValueToString, Vc, debug::ValueDebugFormat,
    trace::TraceRawVcs,
};
use turbo_tasks_fs::{File, FileSystemPath};

use crate::{
    asset::{Asset, AssetContent},
    chunk::ChunkingContext,
    ident::AssetIdent,
    introspect::{Introspectable, IntrospectableChildren},
    output::OutputAsset,
    source_map::{GenerateSourceMap, SourceMap},
};

#[derive(PartialEq, Eq, Serialize, Deserialize, NonLocalValue, TraceRawVcs, ValueDebugFormat)]
enum PathType {
    Fixed {
        path: ResolvedVc<FileSystemPath>,
    },
    FromIdent {
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        ident_for_path: ResolvedVc<AssetIdent>,
    },
}

/// Represents the source map of an ecmascript asset.
#[turbo_tasks::value]
pub struct SourceMapAsset {
    path_ty: PathType,
    generate_source_map: ResolvedVc<Box<dyn GenerateSourceMap>>,
}

#[turbo_tasks::value_impl]
impl SourceMapAsset {
    #[turbo_tasks::function]
    pub fn new(
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        ident_for_path: ResolvedVc<AssetIdent>,
        generate_source_map: ResolvedVc<Box<dyn GenerateSourceMap>>,
    ) -> Vc<Self> {
        SourceMapAsset {
            path_ty: PathType::FromIdent {
                chunking_context,
                ident_for_path,
            },
            generate_source_map,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn new_fixed(
        path: ResolvedVc<FileSystemPath>,
        generate_source_map: ResolvedVc<Box<dyn GenerateSourceMap>>,
    ) -> Vc<Self> {
        SourceMapAsset {
            path_ty: PathType::Fixed { path },
            generate_source_map,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl OutputAsset for SourceMapAsset {
    #[turbo_tasks::function]
    async fn path(self: Vc<Self>) -> Result<Vc<FileSystemPath>> {
        // NOTE(alexkirsz) We used to include the asset's version id in the path,
        // but this caused `all_assets_map` to be recomputed on every change.
        let this = self.await?;
        Ok(match this.path_ty {
            PathType::FromIdent {
                chunking_context,
                ident_for_path,
            } => chunking_context
                .chunk_path(Some(Vc::upcast(self)), *ident_for_path, ".js".into())
                .append(".map".into()),
            PathType::Fixed { path } => path.append(".map".into()),
        })
    }
}

#[turbo_tasks::value_impl]
impl Asset for SourceMapAsset {
    #[turbo_tasks::function]
    async fn content(&self) -> Result<Vc<AssetContent>> {
        if let Some(sm) = &*self.generate_source_map.generate_source_map().await? {
            Ok(AssetContent::file(File::from(sm.clone()).into()))
        } else {
            Ok(AssetContent::file(
                File::from(SourceMap::empty_rope()).into(),
            ))
        }
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> Vc<RcStr> {
    Vc::cell("source map".into())
}

#[turbo_tasks::function]
fn introspectable_details() -> Vc<RcStr> {
    Vc::cell("source map of an asset".into())
}

#[turbo_tasks::value_impl]
impl Introspectable for SourceMapAsset {
    #[turbo_tasks::function]
    fn ty(&self) -> Vc<RcStr> {
        introspectable_type()
    }

    #[turbo_tasks::function]
    fn title(self: Vc<Self>) -> Vc<RcStr> {
        self.path().to_string()
    }

    #[turbo_tasks::function]
    fn details(&self) -> Vc<RcStr> {
        introspectable_details()
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<Vc<IntrospectableChildren>> {
        let mut children = FxIndexSet::default();
        if let Some(asset) =
            ResolvedVc::try_sidecast::<Box<dyn Introspectable>>(self.generate_source_map)
        {
            children.insert((ResolvedVc::cell("asset".into()), asset));
        }
        Ok(Vc::cell(children))
    }
}
