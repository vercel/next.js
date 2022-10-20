use anyhow::{anyhow, Result};
use turbopack::ecmascript::{chunk::EcmascriptChunkPlaceableVc, resolve::cjs_resolve};
use turbopack_core::resolve::{origin::ResolveOriginVc, parse::RequestVc, ResolveResult};

/// Resolves the turbopack runtime module from the given [AssetContextVc].
#[turbo_tasks::function]
pub async fn resolve_runtime_request(
    origin: ResolveOriginVc,
    path: &str,
) -> Result<EcmascriptChunkPlaceableVc> {
    let runtime_request_path = format!("@vercel/turbopack-next/{}", path);
    let request = RequestVc::parse_string(runtime_request_path.clone());

    match &*cjs_resolve(origin, request).await? {
        ResolveResult::Single(asset, _) => {
            if let Some(placeable) = EcmascriptChunkPlaceableVc::resolve_from(asset).await? {
                Ok(placeable)
            } else {
                Err(anyhow!("turbopack runtime asset is not placeable"))
            }
        }
        ResolveResult::Alternatives(assets, _) if !assets.is_empty() => {
            if let Some(placeable) = EcmascriptChunkPlaceableVc::resolve_from(assets[0]).await? {
                Ok(placeable)
            } else {
                Err(anyhow!("turbopack runtime asset is not placeable"))
            }
        }
        // The @vercel/turbopack-runtime module is not installed.
        ResolveResult::Unresolveable(_) => Err(anyhow!(
            "could not resolve the `{}` module",
            runtime_request_path
        )),
        _ => Err(anyhow!("invalid turbopack runtime asset")),
    }
}
