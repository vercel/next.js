use anyhow::Result;
use turbo_tasks::{primitives::StringVc, Value};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    introspect::{Introspectable, IntrospectableChildrenVc, IntrospectableVc},
    issue::IssueContextExt,
};

use super::{
    route_tree::{MapGetContentSourceContent, RouteTreeVc},
    ContentSource, ContentSourceContentVc, ContentSourceData, ContentSourceDataVaryVc,
    ContentSourceVc, ContentSourcesVc, GetContentSourceContent, GetContentSourceContentVc,
};
use crate::source::route_tree::MapGetContentSourceContentVc;

#[turbo_tasks::value]
pub struct IssueContextContentSource {
    context: Option<FileSystemPathVc>,
    description: String,
    source: ContentSourceVc,
}

#[turbo_tasks::value_impl]
impl IssueContextContentSourceVc {
    #[turbo_tasks::function]
    pub fn new_context(
        context: FileSystemPathVc,
        description: &str,
        source: ContentSourceVc,
    ) -> Self {
        IssueContextContentSource {
            context: Some(context),
            description: description.to_string(),
            source,
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub fn new_description(description: &str, source: ContentSourceVc) -> Self {
        IssueContextContentSource {
            context: None,
            description: description.to_string(),
            source,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl ContentSource for IssueContextContentSource {
    #[turbo_tasks::function]
    async fn get_routes(self_vc: IssueContextContentSourceVc) -> Result<RouteTreeVc> {
        let this = self_vc.await?;
        let routes = this
            .source
            .get_routes()
            .issue_context(this.context, &this.description)
            .await?;
        Ok(routes.map_routes(
            IssueContextContentSourceMapper { source: self_vc }
                .cell()
                .into(),
        ))
    }

    #[turbo_tasks::function]
    fn get_children(&self) -> ContentSourcesVc {
        ContentSourcesVc::cell(vec![self.source])
    }
}

#[turbo_tasks::value]
struct IssueContextContentSourceMapper {
    source: IssueContextContentSourceVc,
}

#[turbo_tasks::value_impl]
impl MapGetContentSourceContent for IssueContextContentSourceMapper {
    #[turbo_tasks::function]
    fn map_get_content(&self, get_content: GetContentSourceContentVc) -> GetContentSourceContentVc {
        IssueContextGetContentSourceContent {
            get_content,
            source: self.source,
        }
        .cell()
        .into()
    }
}

#[turbo_tasks::value]
struct IssueContextGetContentSourceContent {
    get_content: GetContentSourceContentVc,
    source: IssueContextContentSourceVc,
}

#[turbo_tasks::value_impl]
impl GetContentSourceContent for IssueContextGetContentSourceContent {
    #[turbo_tasks::function]
    async fn vary(&self) -> Result<ContentSourceDataVaryVc> {
        let source = self.source.await?;
        let result = self
            .get_content
            .vary()
            .issue_context(source.context, &source.description)
            .await?;
        Ok(result)
    }

    #[turbo_tasks::function]
    async fn get(
        &self,
        path: &str,
        data: Value<ContentSourceData>,
    ) -> Result<ContentSourceContentVc> {
        let source = self.source.await?;
        let result = self
            .get_content
            .get(path, data)
            .issue_context(source.context, &source.description)
            .await?;
        Ok(result)
    }
}

#[turbo_tasks::value_impl]
impl Introspectable for IssueContextContentSource {
    #[turbo_tasks::function]
    async fn ty(&self) -> Result<StringVc> {
        Ok(
            if let Some(source) = IntrospectableVc::resolve_from(self.source).await? {
                source.ty()
            } else {
                StringVc::cell("IssueContextContentSource".to_string())
            },
        )
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<StringVc> {
        Ok(
            if let Some(source) = IntrospectableVc::resolve_from(self.source).await? {
                let title = source.title().await?;
                StringVc::cell(format!("{}: {}", self.description, title))
            } else {
                StringVc::cell(self.description.clone())
            },
        )
    }

    #[turbo_tasks::function]
    async fn details(&self) -> Result<StringVc> {
        Ok(
            if let Some(source) = IntrospectableVc::resolve_from(self.source).await? {
                source.details()
            } else {
                StringVc::cell(String::new())
            },
        )
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<IntrospectableChildrenVc> {
        Ok(
            if let Some(source) = IntrospectableVc::resolve_from(self.source).await? {
                source.children()
            } else {
                IntrospectableChildrenVc::cell(Default::default())
            },
        )
    }
}
