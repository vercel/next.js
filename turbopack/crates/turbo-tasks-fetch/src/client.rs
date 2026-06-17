use std::{
    cmp::max,
    fmt::{Display, Formatter},
    hash::Hash,
    sync::LazyLock,
    time::{Duration, SystemTime},
};

use anyhow::Result;
use quick_cache::sync::Cache;
use turbo_rcstr::RcStr;
use turbo_tasks::{
    Completion, FxIndexSet, InvalidationReason, InvalidationReasonKind, Invalidator, ReadRef,
    ResolvedVc, Vc, duration_span, util::StaticOrArc,
};

use crate::{FetchError, FetchResult, HttpResponse, HttpResponseBody};

const MAX_CLIENTS: usize = 16;
static CLIENT_CACHE: LazyLock<Cache<ReadRef<FetchClientConfig>, reqwest::Client>> =
    LazyLock::new(|| Cache::new(MAX_CLIENTS));

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
    /// Minimum cache TTL in seconds. Responses with a `Cache-Control: max-age` shorter than this
    /// will be clamped to this value. This prevents pathologically short timeouts from causing an
    /// invalidation bomb. Defaults to 1 hour.
    pub min_cache_control: Duration,
}

impl Default for FetchClientConfig {
    fn default() -> Self {
        Self {
            min_cache_control: Duration::from_secs(60 * 60),
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
    /// [`turbo_tasks::function(session_dependent)`]).
    pub fn try_get_cached_reqwest_client(
        self: ReadRef<FetchClientConfig>,
    ) -> reqwest::Result<reqwest::Client> {
        CLIENT_CACHE.get_or_insert_with(&self, {
            let this = ReadRef::clone(&self);
            move || this.try_build_uncached_reqwest_client()
        })
    }

    fn try_build_uncached_reqwest_client(&self) -> reqwest::Result<reqwest::Client> {
        #[allow(unused_mut)]
        let mut builder = reqwest::Client::builder();
        #[cfg(any(target_os = "linux", all(windows, not(target_arch = "aarch64"))))]
        {
            use std::sync::Once;
            static ONCE: Once = Once::new();
            ONCE.call_once(|| {
                rustls::crypto::ring::default_provider()
                    .install_default()
                    .unwrap()
            });
            builder = builder.tls_backend_rustls();
        }
        #[cfg(all(windows, target_arch = "aarch64"))]
        {
            builder = builder.tls_backend_native();
        }
        #[cfg(target_os = "linux")]
        {
            // Add webpki_root_certs on Linux (in addition to reqwest's default
            // `rustls-platform-verifier`), in case the user is building in a bare-bones docker
            // image that does not contain any root certs (e.g. `oven/bun:slim`).
            builder = builder.tls_certs_merge(webpki_root_certs::TLS_SERVER_ROOT_CERTS.iter().map(
                |der| {
                    reqwest::Certificate::from_der(der)
                        .expect("webpki_root_certs should parse correctly")
                },
            ))
        }
        builder.build()
    }
}

/// Invalidation was caused by a max-age deadline returned by a server
#[derive(PartialEq, Eq, Hash)]
pub(crate) struct HttpTimeout;

impl InvalidationReason for HttpTimeout {
    fn kind(&self) -> Option<StaticOrArc<dyn InvalidationReasonKind>> {
        Some(StaticOrArc::Static(&HTTP_TIMEOUT_KIND))
    }
}

impl Display for HttpTimeout {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "http max-age timeout")
    }
}

/// Invalidation kind for [HttpTimeout]
#[derive(PartialEq, Eq, Hash)]
struct HttpTimeoutKind;

static HTTP_TIMEOUT_KIND: HttpTimeoutKind = HttpTimeoutKind;

impl InvalidationReasonKind for HttpTimeoutKind {
    fn fmt(
        &self,
        reasons: &FxIndexSet<StaticOrArc<dyn InvalidationReason>>,
        f: &mut Formatter<'_>,
    ) -> std::fmt::Result {
        write!(f, "{} fetches timed out", reasons.len())
    }
}

/// Internal result from `fetch_inner` that includes the invalidator for TTL-based re-fetching.
#[turbo_tasks::value(shared)]
struct FetchInnerResult {
    result: ResolvedVc<FetchResult>,
    /// Invalidator for the `fetch_inner` task. Used by the outer `fetch` to set up a timer that
    /// triggers re-fetching when the Cache-Control max-age expires.
    invalidator: Option<Invalidator>,
    /// Absolute deadline (seconds since UNIX epoch) after which the cached response should be
    /// re-fetched. Computed as `now + max-age` at fetch time. An absolute timestamp is used
    /// instead of a relative duration so that the remaining TTL is correct on warm cache restore.
    deadline_secs: Option<u64>,
}

#[turbo_tasks::value_impl]
impl FetchClientConfig {
    /// Performs the actual HTTP request. This task is `network` but NOT `session_dependent`, so
    /// its cached result survives restarts. The outer `fetch` task (which IS `session_dependent`)
    /// reads the cached invalidator and sets up a timer for TTL-based re-fetching.
    #[turbo_tasks::function(network)]
    async fn fetch_inner(
        self: Vc<FetchClientConfig>,
        url: RcStr,
        user_agent: Option<RcStr>,
    ) -> Result<Vc<FetchInnerResult>> {
        let url_ref = &*url;
        let this = self.await?;
        let min_cache_control_secs = this.min_cache_control;
        let response_result: reqwest::Result<(HttpResponse, Option<u64>)> = async move {
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
            let max_age = parse_cache_control(response.headers());

            let body = {
                let _span = duration_span!("fetch response", url = url_ref);
                response.bytes().await?
            }
            .to_vec();

            Ok((
                HttpResponse {
                    status,
                    body: HttpResponseBody(body).resolved_cell(),
                },
                max_age,
            ))
        }
        .await;

        match response_result {
            Ok((resp, max_age_secs)) => {
                if let Some(max_age_secs) = max_age_secs {
                    let max_age_secs = max(max_age_secs, min_cache_control_secs.as_secs());
                    // Transform the relative offset to an absolute deadline so it can be
                    // cached.
                    let deadline_secs = SystemTime::now()
                        .duration_since(SystemTime::UNIX_EPOCH)
                        // If the system clock is borked, just don't respect deadlines
                        .ok()
                        .map(|d| d.as_secs() + max_age_secs);
                    let invalidator = turbo_tasks::get_invalidator();
                    Ok(FetchInnerResult {
                        result: ResolvedVc::cell(Ok(resp.resolved_cell())),
                        invalidator,
                        deadline_secs,
                    }
                    .cell())
                } else {
                    Completion::session_dependent().await?;
                    Ok(FetchInnerResult {
                        result: ResolvedVc::cell(Ok(resp.resolved_cell())),
                        invalidator: None,
                        deadline_secs: None,
                    }
                    .cell())
                }
            }
            Err(err) => {
                // Read session_dependent_completion so that this task is re-dirtied on session
                // restore. This ensures transient errors (network down, DNS failure) are retried
                // on the next session without a timer or busy-loop.
                Completion::session_dependent().await?;
                Ok(FetchInnerResult {
                    result: ResolvedVc::cell(Err(
                        FetchError::from_reqwest_error(&err, &url).resolved_cell()
                    )),
                    invalidator: None,
                    deadline_secs: None,
                }
                .cell())
            }
        }
    }

    /// Fetches the given URL and returns the response. Results are cached across sessions using
    /// TTL from the response's `Cache-Control: max-age` header.
    ///
    /// This is the outer task in a two-task pattern:
    /// - `fetch` (session_dependent): always re-executes on restore, reads the cached inner result,
    ///   and spawns a timer for mid-session TTL expiry.
    /// - `fetch_inner` (network, NOT session_dependent): performs the actual HTTP request and stays
    ///   cached across restarts. Returns an `Invalidator` that the outer task uses to trigger
    ///   re-fetching when the TTL expires.
    #[turbo_tasks::function(network, session_dependent)]
    pub async fn fetch(
        self: Vc<FetchClientConfig>,
        url: RcStr,
        user_agent: Option<RcStr>,
    ) -> Result<Vc<FetchResult>> {
        let FetchInnerResult {
            result,
            deadline_secs,
            invalidator,
        } = *self.fetch_inner(url, user_agent).await?;

        // Set up a timer to invalidate fetch_inner when the TTL expires.
        // On warm cache restore, this re-executes (session_dependent), reads the persisted
        // deadline from fetch_inner's cached result, and starts a timer for the remaining time.
        //
        // Skip when dependency tracking is disabled (e.g. one-shot `next build`) since
        // invalidation panics without dependency tracking and the timer would be wasted work.
        if turbo_tasks::turbo_tasks().is_tracking_dependencies()
            && let (Some(deadline_secs), Some(invalidator)) = (deadline_secs, invalidator)
        {
            // transform absolute deadline back to a relative duration for the sleep call
            // IF the system clock is broken, just don't bother.
            if let Ok(now) = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH) {
                let remaining = Duration::from_secs(deadline_secs.saturating_sub(now.as_secs()));
                // NOTE: in the case where the deadline is expired on session start this timeout
                // will immediately invalidate and race with us returning.  This is
                // basically fine since in the most common case the actual fetch
                // result is identical so this gives us a kind of 'stale while
                // revalidate' feature. alternatively we could synchronously
                // invalidate and re-execute `fetch-inner` but that simply adds
                // latency in the common case where our fetch is identical. NOTE(2):
                // if for some reason `fetch` is re-executed but `fetch-inner` isn't we could
                // end up with multiple timers.  Currently there is no known case where this could
                // happen, if it somehow does we could end up with redundant invalidations and
                // re-fetches.  The solution is to detect this with a mutable hash map on
                // FetchClientConfig to track outstanding timers and cancel them.
                turbo_tasks::spawn(async move {
                    tokio::time::sleep(remaining).await;
                    invalidator
                        .invalidate_with_reason(&*turbo_tasks::turbo_tasks(), HttpTimeout {});
                });
            }
        }

        Ok(*result)
    }
}

/// Parses the `max-age` directive from a `Cache-Control` header value.
/// Returns the max-age in seconds, or `None` if not present or unparseable.
/// None means we shouldn't cache longer than the current session
fn parse_cache_control(headers: &reqwest::header::HeaderMap) -> Option<u64> {
    let value = headers.get(reqwest::header::CACHE_CONTROL)?.to_str().ok()?;
    let mut max_age = None;
    for directive in value.split(',') {
        let (key, val) = {
            if let Some(index) = directive.find('=') {
                (directive[0..index].trim(), Some(&directive[index + 1..]))
            } else {
                (directive.trim(), None)
            }
        };
        if key.eq_ignore_ascii_case("max-age")
            && let Some(val) = val
        {
            max_age = val.trim().parse().ok();
        } else if key.eq_ignore_ascii_case("no-cache") || key.eq_ignore_ascii_case("no-store") {
            return None;
        }
    }
    max_age
}

#[doc(hidden)]
pub fn __test_only_reqwest_client_cache_clear() {
    CLIENT_CACHE.clear()
}

#[doc(hidden)]
pub fn __test_only_reqwest_client_cache_len() -> usize {
    CLIENT_CACHE.len()
}

#[cfg(test)]
mod tests {
    use reqwest::header::{CACHE_CONTROL, HeaderMap, HeaderValue};

    use super::parse_cache_control;

    fn headers(value: &str) -> HeaderMap {
        let mut h = HeaderMap::new();
        h.insert(CACHE_CONTROL, HeaderValue::from_str(value).unwrap());
        h
    }

    #[test]
    fn max_age() {
        assert_eq!(parse_cache_control(&headers("max-age=300")), Some(300));
        assert_eq!(parse_cache_control(&headers("MAX-AGE = 300")), Some(300));
        assert_eq!(
            parse_cache_control(&headers("public, max-age=3600, must-revalidate")),
            Some(3600)
        );
    }

    #[test]
    fn no_cache_headers() {
        assert_eq!(parse_cache_control(&headers("NO-CACHE")), None);
        assert_eq!(parse_cache_control(&headers("no-cache")), None);
        assert_eq!(parse_cache_control(&headers("no-store")), None);
        assert_eq!(parse_cache_control(&headers("max-age=300, no-store")), None);
        assert_eq!(parse_cache_control(&HeaderMap::new()), None);
    }
}
