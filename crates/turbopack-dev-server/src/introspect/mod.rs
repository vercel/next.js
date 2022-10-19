use std::{collections::HashSet, fmt::Display};

use anyhow::Result;
use turbo_tasks::{primitives::StringVc, TryJoinIterExt};
use turbo_tasks_fs::{File, FileContent};
use turbopack_core::{
    asset::AssetContent,
    introspect::{Introspectable, IntrospectableChildrenVc, IntrospectableVc},
};
use turbopack_ecmascript::utils::FormatIter;

use crate::source::{
    ContentSource, ContentSourceData, ContentSourceResult, ContentSourceResultVc, ContentSourceVc,
};

#[turbo_tasks::value(shared)]
pub struct IntrospectionSource {
    pub roots: HashSet<IntrospectableVc>,
}

#[turbo_tasks::value_impl]
impl Introspectable for IntrospectionSource {
    #[turbo_tasks::function]
    fn ty(&self) -> StringVc {
        StringVc::cell("introspection-source".to_string())
    }

    #[turbo_tasks::function]
    fn title(&self) -> StringVc {
        StringVc::cell("introspection-source".to_string())
    }

    #[turbo_tasks::function]
    fn children(&self) -> IntrospectableChildrenVc {
        let name = StringVc::cell("root".to_string());
        IntrospectableChildrenVc::cell(self.roots.iter().map(|root| (name, *root)).collect())
    }
}

struct HtmlEscaped<T>(T);

impl<T: Display> Display for HtmlEscaped<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(
            &self
                .0
                .to_string()
                // TODO this is pretty inefficient
                .replace('&', "&amp;")
                .replace('>', "&gt;")
                .replace('<', "&lt;"),
        )
    }
}

struct HtmlStringEscaped<T>(T);

impl<T: Display> Display for HtmlStringEscaped<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(
            &self
                .0
                .to_string()
                // TODO this is pretty inefficient
                .replace('&', "&amp;")
                .replace('"', "&quot;")
                .replace('>', "&gt;")
                .replace('<', "&lt;"),
        )
    }
}

#[turbo_tasks::value_impl]
impl ContentSource for IntrospectionSource {
    #[turbo_tasks::function]
    async fn get(
        self_vc: IntrospectionSourceVc,
        path: &str,
        _data: turbo_tasks::Value<ContentSourceData>,
    ) -> Result<ContentSourceResultVc> {
        let introspectable = if path.is_empty() {
            let roots = &self_vc.await?.roots;
            if roots.len() == 1 {
                *roots.iter().next().unwrap()
            } else {
                self_vc.as_introspectable()
            }
        } else {
            serde_json::from_str(path)?
        };
        let ty = introspectable.ty().await?;
        let title = introspectable.title().await?;
        let details = introspectable.details().await?;
        let children = introspectable.children().await?;
        let has_children = !children.is_empty();
        let mut children = children
            .iter()
            .map(|&(name, child)| async move {
                let name = name.await?;
                let ty = child.ty().await?;
                let title = child.title().await?;
                let path = serde_json::to_string(&child)?;
                Ok(format!(
                    "<li>{name} <!-- {title} --><a href=\"./{path}\">[{ty}] {title}</a></li>",
                    name = HtmlEscaped(name),
                    title = HtmlEscaped(title),
                    path = HtmlStringEscaped(urlencoding::encode(&path)),
                    ty = HtmlEscaped(ty),
                ))
            })
            .try_join()
            .await?;
        children.sort();
        let details = if details.is_empty() {
            String::new()
        } else if has_children {
            format!(
                "<details><summary><h3 style=\"display: \
                 inline;\">Details</h3></summary><pre>{details}</pre></details>",
                details = HtmlEscaped(details)
            )
        } else {
            format!(
                "<h3>Details</h3><pre>{details}</pre>",
                details = HtmlEscaped(details)
            )
        };
        let html = format!(
            "<!DOCTYPE html>
<html><head><title>{title}</title></head>
<body>
  <h2>{ty}</h2>
  <h1>{title}</h1>
  {details}
  <ul>{children}</ul>
</body>
</html>",
            title = HtmlEscaped(title),
            ty = HtmlEscaped(ty),
            children = FormatIter(|| children.iter())
        );
        Ok(ContentSourceResult::Static(
            AssetContent::File(
                FileContent::Content(File::from(html).with_content_type(mime::TEXT_HTML_UTF_8))
                    .cell(),
            )
            .cell()
            .into(),
        )
        .cell())
    }
}
