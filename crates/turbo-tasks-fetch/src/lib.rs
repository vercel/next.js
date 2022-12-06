#![feature(min_specialization)]

use anyhow::Result;
use turbo_tasks::primitives::{OptionStringVc, StringVc};

pub fn register() {
    turbo_tasks::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}

#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub struct HttpResponse {
    pub status: u16,
    pub body: HttpResponseBodyVc,
}

#[turbo_tasks::value(shared)]
#[derive(Debug)]
pub struct HttpResponseBody(pub Vec<u8>);

#[turbo_tasks::value_impl]
impl HttpResponseBodyVc {
    #[turbo_tasks::function]
    pub async fn to_string(self) -> Result<StringVc> {
        let this = &*self.await?;
        Ok(StringVc::cell(std::str::from_utf8(&this.0)?.to_owned()))
    }
}

#[turbo_tasks::function]
pub async fn fetch(url: StringVc, user_agent: OptionStringVc) -> Result<HttpResponseVc> {
    let url = url.await?.clone();
    let user_agent = &*user_agent.await?;
    let client = reqwest::Client::new();

    let mut builder = client.get(url);
    if let Some(user_agent) = user_agent {
        builder = builder.header("User-Agent", user_agent);
    }

    let response = builder.send().await?;
    let status = response.status().as_u16();
    let body = response.bytes().await?.to_vec();

    Ok(HttpResponse {
        status,
        body: HttpResponseBodyVc::cell(HttpResponseBody(body)),
    }
    .into())
}
