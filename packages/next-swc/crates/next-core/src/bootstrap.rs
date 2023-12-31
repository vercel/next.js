use anyhow::{bail, Context, Result};
use indexmap::IndexMap;
use turbo_tasks::{Value, ValueToString, Vc};
use turbo_tasks_fs::{File, FileSystemPath};
use turbopack_binding::turbopack::{
    core::{
        asset::AssetContent,
        chunk::EvaluatableAsset,
        context::AssetContext,
        module::Module,
        reference_type::{InnerAssets, ReferenceType},
        source::Source,
        virtual_source::VirtualSource,
    },
    ecmascript::utils::StringifyJs,
};

#[turbo_tasks::function]
pub async fn route_bootstrap(
    asset: Vc<Box<dyn Module>>,
    context: Vc<Box<dyn AssetContext>>,
    base_path: Vc<FileSystemPath>,
    bootstrap_asset: Vc<Box<dyn Source>>,
    config: Vc<BootstrapConfig>,
) -> Result<Vc<Box<dyn EvaluatableAsset>>> {
    Ok(bootstrap(
        asset,
        context,
        base_path,
        bootstrap_asset,
        Vc::cell(IndexMap::new()),
        config,
    ))
}

#[turbo_tasks::value(transparent)]
pub struct BootstrapConfig(IndexMap<String, String>);

#[turbo_tasks::value_impl]
impl BootstrapConfig {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(IndexMap::new())
    }
}

#[turbo_tasks::function]
pub async fn bootstrap(
    asset: Vc<Box<dyn Module>>,
    context: Vc<Box<dyn AssetContext>>,
    base_path: Vc<FileSystemPath>,
    bootstrap_asset: Vc<Box<dyn Source>>,
    inner_assets: Vc<InnerAssets>,
    config: Vc<BootstrapConfig>,
) -> Result<Vc<Box<dyn EvaluatableAsset>>> {
    let path = asset.ident().path().await?;
    let Some(path) = base_path.await?.get_path_to(&path) else {
        bail!(
            "asset {} is not in base path {}",
            asset.ident().to_string().await?,
            base_path.to_string().await?
        );
    };
    let path = if let Some((name, ext)) = path.rsplit_once('.') {
        if !ext.contains('/') {
            name
        } else {
            path
        }
    } else {
        path
    };

    let pathname = normalize_app_page_to_pathname(path);

    let mut config = config.await?.clone_value();
    config.insert("PAGE".to_string(), path.to_string());
    config.insert("PATHNAME".to_string(), pathname);

    let config_asset = context
        .process(
            Vc::upcast(VirtualSource::new(
                asset.ident().path().join("bootstrap-config.ts".to_string()),
                AssetContent::file(
                    File::from(
                        config
                            .iter()
                            .map(|(k, v)| format!("export const {} = {};\n", k, StringifyJs(v)))
                            .collect::<Vec<_>>()
                            .join(""),
                    )
                    .into(),
                ),
            )),
            Value::new(ReferenceType::Internal(InnerAssets::empty())),
        )
        .module();

    let mut inner_assets = inner_assets.await?.clone_value();
    inner_assets.insert("ENTRY".to_string(), asset);
    inner_assets.insert("BOOTSTRAP_CONFIG".to_string(), config_asset);

    let asset = context
        .process(
            bootstrap_asset,
            Value::new(ReferenceType::Internal(Vc::cell(inner_assets))),
        )
        .module();

    let asset = Vc::try_resolve_sidecast::<Box<dyn EvaluatableAsset>>(asset)
        .await?
        .context("internal module must be evaluatable")?;

    Ok(asset)
}

/// This normalizes an app page to a pathname.
fn normalize_app_page_to_pathname(page: &str) -> String {
    // Split the page string by '/' and collect it into a Vec<&str>.
    let segments: Vec<&str> = page.split('/').collect();
    let segment_count = segments.len();
    let mut pathname = String::new();

    for (index, segment) in segments.into_iter().enumerate() {
        // If a segment is empty, return the current pathname without modification.
        if segment.is_empty()
            // If a segment starts with '(' and ends with ')', return the current pathname
            // without modification, effectively ignoring the segment.
            || (segment.starts_with('(') && segment.ends_with(')'))
            // If a segment starts with '@', return the current pathname without
            // modification, effectively ignoring the segment.
            || segment.starts_with('@')
            // If the segment is "page" or "route" and it's the last one, return the current
            // pathname without modification, effectively ignoring the segment.
            || ((segment == "page" || segment == "route") && index == segment_count - 1)
        {
            continue;
        }

        pathname.push('/');

        // Replace '%5F' with '_' in the segment only if it's present at the beginning
        // using the `replace` method.
        if let Some(rest) = segment.strip_prefix("%5F") {
            pathname.push('_');
            pathname.push_str(rest);
        } else {
            pathname.push_str(segment);
        }
    }

    pathname
}

#[cfg(test)]
mod tests {
    use super::normalize_app_page_to_pathname;

    #[test]
    fn test_normalize() {
        assert_eq!(
            normalize_app_page_to_pathname("/some/[route]/route"),
            "/some/[route]"
        );
        assert_eq!(
            normalize_app_page_to_pathname("/another/route/(dashboard)/inside/page"),
            "/another/route/inside"
        );
    }

    #[test]
    fn test_leading_slash() {
        assert_eq!(
            normalize_app_page_to_pathname("no/leading/slash"),
            "/no/leading/slash"
        );
    }

    #[test]
    fn test_ignore_empty_segments() {
        assert_eq!(
            normalize_app_page_to_pathname("/ignore//empty///segments"),
            "/ignore/empty/segments"
        );
    }

    #[test]
    fn test_ignore_groups() {
        assert_eq!(
            normalize_app_page_to_pathname("/ignore/(group)/segments"),
            "/ignore/segments"
        );
    }

    #[test]
    fn test_ignore_parallel_segments() {
        assert_eq!(
            normalize_app_page_to_pathname("/ignore/@parallel/segments"),
            "/ignore/segments"
        );
    }

    #[test]
    fn test_replace_percent_5f() {
        assert_eq!(
            normalize_app_page_to_pathname("/replace%5Fwith_underscore"),
            "/replace%5Fwith_underscore"
        );
        assert_eq!(
            normalize_app_page_to_pathname("/%5Freplace%5Fwith_underscore"),
            "/_replace%5Fwith_underscore"
        );
        assert_eq!(
            normalize_app_page_to_pathname(
                "/replace%5Fwith_underscore/%5Freplace%5Fwith_underscore"
            ),
            "/replace%5Fwith_underscore/_replace%5Fwith_underscore"
        );
    }

    #[test]
    fn test_complex_example() {
        assert_eq!(
            normalize_app_page_to_pathname("/test/@parallel/(group)//segments/page"),
            "/test/segments"
        );
    }
}
