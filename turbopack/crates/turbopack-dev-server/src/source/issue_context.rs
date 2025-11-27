use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::introspect::{Introspectable, IntrospectableChildren};

use super::{
    ContentSource, ContentSourceContent, ContentSourceData, ContentSourceDataVary, ContentSources,
    GetContentSourceContent,
    route_tree::{MapGetContentSourceContent, RouteTree},
};

#[turbo_tasks::value]
pub struct IssueFilePathContentSource {
    file_path: Option<FileSystemPath>,
    description: RcStr,
    source: ResolvedVc<Box<dyn ContentSource>>,
}

#[turbo_tasks::value_impl]
impl IssueFilePathContentSource {
    #[turbo_tasks::function]
    pub fn new_file_path(
        file_path: FileSystemPath,
        description: RcStr,
        source: ResolvedVc<Box<dyn ContentSource>>,
    ) -> Vc<Self> {
        IssueFilePathContentSource {
            file_path: Some(file_path),
            description,
            source,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn new_description(
        description: RcStr,
        source: ResolvedVc<Box<dyn ContentSource>>,
    ) -> Vc<Self> {
        IssueFilePathContentSource {
            file_path: None,
            description,
            source,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl ContentSource for IssueFilePathContentSource {
    #[turbo_tasks::function]
    async fn get_routes(self: ResolvedVc<Self>) -> Result<Vc<RouteTree>> {
        let this = self.await?;
        let routes = this.source.get_routes();
        Ok(routes.map_routes(Vc::upcast(
            IssueContextContentSourceMapper { source: self }.cell(),
        )))
    }

    #[turbo_tasks::function]
    fn get_children(&self) -> Vc<ContentSources> {
        Vc::cell(vec![self.source])
    }
}

#[turbo_tasks::value]
struct IssueContextContentSourceMapper {
    source: ResolvedVc<IssueFilePathContentSource>,
}

#[turbo_tasks::value_impl]
impl MapGetContentSourceContent for IssueContextContentSourceMapper {
    #[turbo_tasks::function]
    fn map_get_content(
        &self,
        get_content: ResolvedVc<Box<dyn GetContentSourceContent>>,
    ) -> Vc<Box<dyn GetContentSourceContent>> {
        Vc::upcast(
            IssueContextGetContentSourceContent {
                get_content,
                source: self.source,
            }
            .cell(),
        )
    }
}

#[turbo_tasks::value]
struct IssueContextGetContentSourceContent {
    get_content: ResolvedVc<Box<dyn GetContentSourceContent>>,
    source: ResolvedVc<IssueFilePathContentSource>,
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for IssueContextGetContentSourceContent {
    #[turbo_tasks::function]
    async fn vary(&self) -> Result<Vc<ContentSourceDataVary>> {
        Ok(self.get_content.vary())
    }

    #[turbo_tasks::function]
    async fn get(&self, path: RcStr, data: ContentSourceData) -> Result<Vc<ContentSourceContent>> {
        Ok(self.get_content.get(path, data))
    }
}

#[turbo_tasks::value_impl]
impl Introspectable for IssueFilePathContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> Result<Vc<RcStr>> {
        Ok(
            if let Some(source) = ResolvedVc::try_sidecast::<Box<dyn Introspectable>>(self.source) {
                source.ty()
            } else {
                Vc::cell(rcstr!("IssueContextContentSource"))
            },
        )
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<RcStr>> {
        Ok(
            if let Some(source) = ResolvedVc::try_sidecast::<Box<dyn Introspectable>>(self.source) {
                let title = source.title().await?;
                Vc::cell(format!("{}: {}", self.description, title).into())
            } else {
                Vc::cell(self.description.clone())
            },
        )
    }

    #[turbo_tasks::function]
    fn details(&self) -> Result<Vc<RcStr>> {
        Ok(
            if let Some(source) = ResolvedVc::try_sidecast::<Box<dyn Introspectable>>(self.source) {
                source.details()
            } else {
                Vc::cell(RcStr::default())
            },
        )
    }

    #[turbo_tasks::function]
    fn children(&self) -> Result<Vc<IntrospectableChildren>> {
        Ok(
            if let Some(source) = ResolvedVc::try_sidecast::<Box<dyn Introspectable>>(self.source) {
                source.children()
            } else {
                Vc::cell(Default::default())
            },
        )
    }
}
