use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};

use crate::FetchError;

#[turbo_tasks::value(transparent)]
pub struct FetchResult(Result<ResolvedVc<HttpResponse>, ResolvedVc<FetchError>>);

#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub struct HttpResponse {
    pub status: u16,
    pub body: ResolvedVc<HttpResponseBody>,
}

#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub struct HttpResponseBody(pub Vec<u8>);

#[turbo_tasks::value_impl]
impl HttpResponseBody {
    #[turbo_tasks::function]
    pub async fn to_string(self: Vc<Self>) -> Result<Vc<RcStr>> {
        let this = &*self.await?;
        Ok(Vc::cell(std::str::from_utf8(&this.0)?.into()))
    }
}
