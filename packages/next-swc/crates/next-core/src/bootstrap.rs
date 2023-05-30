use anyhow::{bail, Result};
use indexmap::{indexmap, IndexMap};
use turbo_tasks::{Value, ValueToString};
use turbo_tasks_fs::{File, FileSystemPathVc};
use turbopack_binding::turbopack::{
    core::{
        asset::{Asset, AssetVc},
        chunk::EvaluatableAssetVc,
        context::{AssetContext, AssetContextVc},
        issue::{IssueSeverity, OptionIssueSourceVc},
        reference_type::{EcmaScriptModulesReferenceSubType, InnerAssetsVc, ReferenceType},
        resolve::parse::RequestVc,
        virtual_asset::VirtualAssetVc,
    },
    ecmascript::{resolve::esm_resolve, utils::StringifyJs, EcmascriptModuleAssetVc},
};

#[turbo_tasks::function]
pub async fn route_bootstrap(
    asset: AssetVc,
    context: AssetContextVc,
    base_path: FileSystemPathVc,
    bootstrap_asset: AssetVc,
    config: BootstrapConfigVc,
) -> Result<EvaluatableAssetVc> {
    let resolve_origin = if let Some(m) = EcmascriptModuleAssetVc::resolve_from(asset).await? {
        m.as_resolve_origin()
    } else {
        bail!("asset does not represent an ecmascript module");
    };

    // TODO: this is where you'd switch the route kind to the one you need
    let route_module_kind = "app-route";

    let resolved_route_module_asset = esm_resolve(
        resolve_origin,
        RequestVc::parse_string(format!(
            "next/dist/server/future/route-modules/{}/module",
            route_module_kind
        )),
        Value::new(EcmaScriptModulesReferenceSubType::Undefined),
        OptionIssueSourceVc::none(),
        IssueSeverity::Error.cell(),
    );
    let route_module_asset = match &*resolved_route_module_asset.first_asset().await? {
        Some(a) => *a,
        None => bail!("could not find app asset"),
    };

    Ok(bootstrap(
        asset,
        context,
        base_path,
        bootstrap_asset,
        InnerAssetsVc::cell(indexmap! {
            "ROUTE_MODULE".to_string() => route_module_asset,
        }),
        config,
    ))
}

#[turbo_tasks::value(transparent)]
pub struct BootstrapConfig(IndexMap<String, String>);

#[turbo_tasks::value_impl]
impl BootstrapConfigVc {
    #[turbo_tasks::function]
    pub fn empty() -> Self {
        BootstrapConfigVc::cell(IndexMap::new())
    }
}

#[turbo_tasks::function]
pub async fn bootstrap(
    asset: AssetVc,
    context: AssetContextVc,
    base_path: FileSystemPathVc,
    bootstrap_asset: AssetVc,
    inner_assets: InnerAssetsVc,
    config: BootstrapConfigVc,
) -> Result<EvaluatableAssetVc> {
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
    config.insert("KIND".to_string(), "APP_ROUTE".to_string());

    let config_asset = context.process(
        VirtualAssetVc::new(
            asset.ident().path().join("bootstrap-config.ts"),
            File::from(
                config
                    .iter()
                    .map(|(k, v)| format!("export const {} = {};\n", k, StringifyJs(v)))
                    .collect::<Vec<_>>()
                    .join(""),
            )
            .into(),
        )
        .as_asset(),
        Value::new(ReferenceType::Internal(InnerAssetsVc::empty())),
    );

    let mut inner_assets = inner_assets.await?.clone_value();
    inner_assets.insert("ENTRY".to_string(), asset);
    inner_assets.insert("BOOTSTRAP_CONFIG".to_string(), config_asset);

    let asset = context.process(
        bootstrap_asset,
        Value::new(ReferenceType::Internal(InnerAssetsVc::cell(inner_assets))),
    );

    let Some(asset) = EvaluatableAssetVc::resolve_from(asset).await? else {
        bail!("internal module must be evaluatable");
    };

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
