use std::{hash::Hash, sync::LazyLock};

use anyhow::Result;
use quick_cache::sync::Cache;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    NonLocalValue, ReadRef, Vc, duration_span, mark_session_dependent, trace::TraceRawVcs,
};

use crate::{FetchError, FetchResult, HttpResponse, HttpResponseBody};

const MAX_CLIENTS: usize = 16;
static CLIENT_CACHE: LazyLock<Cache<ReadRef<FetchClientConfig>, reqwest::Client>> =
    LazyLock::new(|| Cache::new(MAX_CLIENTS));

#[derive(Hash, PartialEq, Eq, Serialize, Deserialize, NonLocalValue, Debug, TraceRawVcs)]
pub enum ProxyConfig {
    Http(RcStr),
    Https(RcStr),
}

/// Represents the configuration needed to construct a [`reqwest::Client`].
///
/// This is used to cache clients keyed by their configuration, so the configuration should contain
/// as few fields as possible and change infrequently.
///
/// This is needed because [`reqwest::ClientBuilder`] does not implement the required traits. This
/// factory cannot be a closure because closures do not implement `Eq` or `Hash`.
#[turbo_tasks::value(shared)]
#[derive(Hash)]
pub struct FetchClientConfig {
    /// Whether to load embedded webpki root certs with rustls. Default is true.
    ///
    /// Ignored for:
    /// - Windows on ARM, which uses `native-tls` instead of `rustls-tls`.
    /// - Ignored for WASM targets, which use the runtime's TLS implementation.
    pub tls_built_in_webpki_certs: bool,
    /// Whether to load native root certs using the `rustls-native-certs` crate. This may make
    /// reqwest client initialization slower, so it's not used by default.
    ///
    /// Ignored for:
    /// - Windows on ARM, which uses `native-tls` instead of `rustls-tls`.
    /// - Ignored for WASM targets, which use the runtime's TLS implementation.
    pub tls_built_in_native_certs: bool,
}

impl Default for FetchClientConfig {
    fn default() -> Self {
        Self {
            tls_built_in_webpki_certs: true,
            tls_built_in_native_certs: false,
        }
    }
}

impl FetchClientConfig {
    /// Returns a cached instance of `reqwest::Client` it exists, otherwise constructs a new one.
    ///
    /// The cache is bound in size to prevent accidental blowups or leaks. However, in practice,
    /// very few clients should be created, likely only when the bundler configuration changes.
    ///
    /// Client construction is largely deterministic, aside from changes to system TLS
    /// configuration.
    ///
    /// The reqwest client fails to construct if the TLS backend cannot be initialized, or the
    /// resolver cannot load the system configuration. These failures should be treated as
    /// cached for some amount of time, but ultimately transient (e.g. using
    /// [`turbo_tasks::mark_session_dependent`]).
    pub fn try_get_cached_reqwest_client(
        self: ReadRef<FetchClientConfig>,
    ) -> reqwest::Result<reqwest::Client> {
        CLIENT_CACHE.get_or_insert_with(&self, {
            let this = ReadRef::clone(&self);
            move || this.try_build_uncached_reqwest_client()
        })
    }

    fn try_build_uncached_reqwest_client(&self) -> reqwest::Result<reqwest::Client> {
        let client_builder = reqwest::Client::builder();

        // make sure this cfg matches the one in `Cargo.toml`!
        #[cfg(not(any(
            all(target_os = "windows", target_arch = "aarch64"),
            target_arch = "wasm32"
        )))]
        let client_builder = client_builder
            .use_rustls_tls()
            .tls_built_in_root_certs(false)
            .tls_built_in_webpki_certs(self.tls_built_in_webpki_certs)
            .tls_built_in_native_certs(self.tls_built_in_native_certs);

        client_builder.build()
    }
}

#[turbo_tasks::value_impl]
impl FetchClientConfig {
    #[turbo_tasks::function(network)]
    pub async fn fetch(
        self: Vc<FetchClientConfig>,
        url: RcStr,
        user_agent: Option<RcStr>,
    ) -> Result<Vc<FetchResult>> {
        let url_ref = &*url;
        let this = self.await?;
        let tls_built_in_native_certs = this.tls_built_in_native_certs;
        let response_result: reqwest::Result<HttpResponse> = async move {
            let reqwest_client = this.try_get_cached_reqwest_client()?;

            let mut builder = reqwest_client.get(url_ref);
            if let Some(user_agent) = user_agent {
                builder = builder.header("User-Agent", user_agent.as_str());
            }

            let response = {
                let _span = duration_span!("fetch request", url = url_ref);
                builder.send().await
            }
            .and_then(|r| r.error_for_status())?;

            let status = response.status().as_u16();

            let body = {
                let _span = duration_span!("fetch response", url = url_ref);
                response.bytes().await?
            }
            .to_vec();

            Ok(HttpResponse {
                status,
                body: HttpResponseBody(body).resolved_cell(),
            })
        }
        .await;

        match response_result {
            Ok(resp) => Ok(Vc::cell(Ok(resp.resolved_cell()))),
            Err(err) => {
                // the client failed to construct or the HTTP request failed
                mark_session_dependent();
                Ok(Vc::cell(Err(FetchError::from_reqwest_error(
                    &err,
                    &url,
                    tls_built_in_native_certs,
                )
                .resolved_cell())))
            }
        }
    }
}

#[doc(hidden)]
pub fn __test_only_reqwest_client_cache_clear() {
    CLIENT_CACHE.clear()
}

#[doc(hidden)]
pub fn __test_only_reqwest_client_cache_len() -> usize {
    CLIENT_CACHE.len()
}
