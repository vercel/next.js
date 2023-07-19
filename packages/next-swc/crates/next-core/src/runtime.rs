use anyhow::{bail, Result};
use turbo_tasks::Vc;
use turbopack_binding::turbopack::{
    core::{
        issue::{IssueSeverity, OptionIssueSource},
        resolve::{origin::ResolveOrigin, parse::Request},
    },
    turbopack::ecmascript::{chunk::EcmascriptChunkPlaceable, resolve::cjs_resolve},
};

/// Resolves the turbopack runtime module from the given [Vc<Box<dyn
/// AssetContext>>].
#[turbo_tasks::function]
pub async fn resolve_runtime_request(
    origin: Vc<Box<dyn ResolveOrigin>>,
    path: String,
) -> Result<Vc<Box<dyn EcmascriptChunkPlaceable>>> {
    let runtime_request_path = format!("@vercel/turbopack-next/{}", path);
    let request = Request::parse_string(runtime_request_path.clone());

    if let Some(asset) = *cjs_resolve(
        origin,
        request,
        OptionIssueSource::none(),
        IssueSeverity::Error.cell(),
    )
    .first_asset()
    .await?
    {
        if let Some(placeable) =
            Vc::try_resolve_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(asset).await?
        {
            Ok(placeable)
        } else {
            bail!("turbopack runtime asset is not placeable")
        }
    } else {
        // The @vercel/turbopack-dev module is not installed.
        bail!("could not resolve the `{}` module", runtime_request_path)
    }
}
