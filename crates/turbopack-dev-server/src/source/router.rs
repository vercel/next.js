use anyhow::Result;
use turbo_tasks::{primitives::StringVc, TryJoinIterExt, Value};
use turbopack_core::introspect::{Introspectable, IntrospectableChildrenVc, IntrospectableVc};

use super::{ContentSource, ContentSourceData, ContentSourceResultVc, ContentSourceVc};

/// Binds different ContentSources to different subpaths. A fallback
/// ContentSource will serve all other subpaths.
#[turbo_tasks::value(shared)]
pub struct RouterContentSource {
    pub routes: Vec<(String, ContentSourceVc)>,
    pub fallback: ContentSourceVc,
}

impl RouterContentSource {
    fn get_source<'s, 'a>(&'s self, path: &'a str) -> (&'s ContentSourceVc, &'a str) {
        for (route, source) in self.routes.iter() {
            if path.starts_with(route) {
                let path = &path[route.len()..];
                return (source, path);
            }
        }
        (&self.fallback, path)
    }
}

#[turbo_tasks::value_impl]
impl ContentSource for RouterContentSource {
    #[turbo_tasks::function]
    fn get(&self, path: &str, data: Value<ContentSourceData>) -> ContentSourceResultVc {
        let (source, path) = self.get_source(path);
        source.get(path, data)
    }
}

#[turbo_tasks::function]
fn introspectable_type() -> StringVc {
    StringVc::cell("router content source".to_string())
}

#[turbo_tasks::value_impl]
impl Introspectable for RouterContentSource {
    #[turbo_tasks::function]
    fn ty(&self) -> StringVc {
        introspectable_type()
    }

    #[turbo_tasks::function]
    async fn children(&self) -> Result<IntrospectableChildrenVc> {
        Ok(IntrospectableChildrenVc::cell(
            self.routes
                .iter()
                .cloned()
                .chain(std::iter::once((String::new(), self.fallback)))
                .map(|(path, source)| (StringVc::cell(path), source))
                .map(|(path, source)| async move {
                    Ok(IntrospectableVc::resolve_from(source)
                        .await?
                        .map(|i| (path, i)))
                })
                .try_join()
                .await?
                .into_iter()
                .flatten()
                .collect(),
        ))
    }
}
