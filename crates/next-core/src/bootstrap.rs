use anyhow::{bail, Context, Result};
use turbo_tasks::{FxIndexMap, ResolvedVc, Value, ValueToString, Vc};
use turbo_tasks_fs::{File, FileSystemPath};
use turbopack_core::{
    asset::AssetContent,
    chunk::EvaluatableAsset,
    context::AssetContext,
    module::Module,
    reference_type::{InnerAssets, ReferenceType},
    source::Source,
    virtual_source::VirtualSource,
};
use turbopack_ecmascript::utils::StringifyJs;

#[turbo_tasks::function]
pub fn route_bootstrap(
    asset: Vc<Box<dyn Module>>,
    asset_context: Vc<Box<dyn AssetContext>>,
    base_path: Vc<FileSystemPath>,
    bootstrap_asset: Vc<Box<dyn Source>>,
    config: Vc<BootstrapConfig>,
) -> Vc<Box<dyn EvaluatableAsset>> {
    bootstrap(
        asset,
        asset_context,
        base_path,
        bootstrap_asset,
        Vc::cell(FxIndexMap::default()),
        config,
    )
}

#[turbo_tasks::value(transparent)]
pub struct BootstrapConfig(FxIndexMap<String, String>);

#[turbo_tasks::value_impl]
impl BootstrapConfig {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Vc::cell(FxIndexMap::default())
    }
}

#[turbo_tasks::function]
pub async fn bootstrap(
    asset: ResolvedVc<Box<dyn Module>>,
    asset_context: Vc<Box<dyn AssetContext>>,
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

    let mut config = config.owned().await?;
    config.insert("PAGE".to_string(), path.to_string());
    config.insert("PATHNAME".to_string(), pathname);

    let config_asset = asset_context
        .process(
            Vc::upcast(VirtualSource::new(
                asset.ident().path().join("bootstrap-config.ts".into()),
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
            Value::new(ReferenceType::Internal(
                InnerAssets::empty().to_resolved().await?,
            )),
        )
        .module()
        .to_resolved()
        .await?;

    let mut inner_assets = inner_assets.owned().await?;
    inner_assets.insert("ENTRY".into(), asset);
    inner_assets.insert("BOOTSTRAP_CONFIG".into(), config_asset);

    let asset = asset_context
        .process(
            bootstrap_asset,
            Value::new(ReferenceType::Internal(ResolvedVc::cell(inner_assets))),
        )
        .module()
        .to_resolved()
        .await?;

    let asset = ResolvedVc::try_sidecast::<Box<dyn EvaluatableAsset>>(asset)
        .context("internal module must be evaluatable")?;

    Ok(*asset)
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
