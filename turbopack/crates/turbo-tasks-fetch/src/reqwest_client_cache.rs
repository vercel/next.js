use std::{hash::Hash, sync::LazyLock};

use quick_cache::sync::Cache;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, ReadRef, trace::TraceRawVcs};

const MAX_CLIENTS: usize = 16;
static CLIENT_CACHE: LazyLock<Cache<ReadRef<ReqwestClientConfig>, reqwest::Client>> =
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
pub struct ReqwestClientConfig {
    pub proxy: Option<ProxyConfig>,
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

impl Default for ReqwestClientConfig {
    fn default() -> Self {
        Self {
            proxy: None,
            tls_built_in_webpki_certs: true,
            tls_built_in_native_certs: false,
        }
    }
}

impl ReqwestClientConfig {
    fn try_build(&self) -> reqwest::Result<reqwest::Client> {
        let mut client_builder = reqwest::Client::builder();
        match &self.proxy {
            Some(ProxyConfig::Http(proxy)) => {
                client_builder = client_builder.proxy(reqwest::Proxy::http(proxy.as_str())?)
            }
            Some(ProxyConfig::Https(proxy)) => {
                client_builder = client_builder.proxy(reqwest::Proxy::https(proxy.as_str())?)
            }
            None => {}
        };

        // make sure this cfg matches the one in `Cargo.toml`!
        #[cfg(not(any(
            all(target_os = "windows", target_arch = "aarch64"),
            target_arch = "wasm32"
        )))]
        let client_builder = client_builder
            .tls_built_in_root_certs(false)
            .tls_built_in_webpki_certs(self.tls_built_in_webpki_certs)
            .tls_built_in_native_certs(self.tls_built_in_native_certs);

        client_builder.build()
    }
}

/// Given a config, returns a cached instance if it exists, otherwise constructs a new one.
///
/// The cache is bound in size to prevent accidental blowups or leaks. However, in practice, very
/// few clients should be created, likely only when the bundler configuration changes.
///
/// Client construction is largely deterministic, aside from changes to system TLS configuration.
///
/// The reqwest client fails to construct if the TLS backend cannot be initialized, or the resolver
/// cannot load the system configuration. These failures should be treated as cached for some amount
/// of time, but ultimately transient (e.g. using [`turbo_tasks::mark_session_dependent`]).
pub fn try_get_cached_reqwest_client(
    config: ReadRef<ReqwestClientConfig>,
) -> reqwest::Result<reqwest::Client> {
    CLIENT_CACHE.get_or_insert_with(&config, {
        let config = ReadRef::clone(&config);
        move || config.try_build()
    })
}

#[doc(hidden)]
pub fn __test_only_reqwest_client_cache_clear() {
    CLIENT_CACHE.clear()
}

#[doc(hidden)]
pub fn __test_only_reqwest_client_cache_len() -> usize {
    CLIENT_CACHE.len()
}
