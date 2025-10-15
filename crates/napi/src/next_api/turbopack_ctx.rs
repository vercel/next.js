//! Utilities for constructing and using the [`NextTurbopackContext`] type.

use std::{
    env,
    fs::OpenOptions,
    io::{self, BufRead, Write},
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Instant,
};

use anyhow::Result;
use either::Either;
use napi::{JsFunction, threadsafe_function::ThreadsafeFunction};
use once_cell::sync::Lazy;
use owo_colors::OwoColorize;
use serde::Serialize;
use terminal_hyperlink::Hyperlink;
use turbo_tasks::{
    TurboTasks, TurboTasksApi,
    backend::TurboTasksExecutionError,
    message_queue::{CompilationEvent, Severity},
};
use turbo_tasks_backend::{
    BackendOptions, DefaultBackingStorage, GitVersionInfo, NoopBackingStorage, StartupCacheState,
    TurboTasksBackend, db_invalidation::invalidation_reasons, default_backing_storage,
    noop_backing_storage,
};
use turbopack_core::error::PrettyPrintError;

pub type NextTurboTasks =
    Arc<TurboTasks<TurboTasksBackend<Either<DefaultBackingStorage, NoopBackingStorage>>>>;

/// A value often wrapped in [`napi::bindgen_prelude::External`] that retains the [TurboTasks]
/// instance used by Next.js, and [various napi helpers that are passed to us from
/// JavaScript][NapiNextTurbopackCallbacks].
///
/// This is not a [`turbo_tasks::value`], and should only be used within the top-level napi layer.
/// It should not be passed to a [`turbo_tasks::function`]. For serializable information about the
/// project, use the [`next_api::project::Project`] type instead.
///
/// This type is a wrapper around an [`Arc`] and is therefore cheaply clonable. It is [`Send`] and
/// [`Sync`].
#[derive(Clone)]
pub struct NextTurbopackContext {
    inner: Arc<NextTurboContextInner>,
}

struct NextTurboContextInner {
    turbo_tasks: NextTurboTasks,
    napi_callbacks: NapiNextTurbopackCallbacks,
}

impl NextTurbopackContext {
    pub fn new(turbo_tasks: NextTurboTasks, napi_callbacks: NapiNextTurbopackCallbacks) -> Self {
        NextTurbopackContext {
            inner: Arc::new(NextTurboContextInner {
                turbo_tasks,
                napi_callbacks,
            }),
        }
    }

    pub fn turbo_tasks(&self) -> &NextTurboTasks {
        &self.inner.turbo_tasks
    }

    /// Constructs and throws a `TurbopackInternalError` from within JavaScript. This type is
    /// defined within Next.js, and passed via [`NapiNextTurbopackCallbacks`]. This should be called
    /// at the top level (a `napi` function) and only for errors that are not expected to occur an
    /// indicate a bug in Turbopack or Next.js.
    ///
    /// This may log anonymized information about the error to our telemetry service (via the
    /// JS callback). It may log to stderr and write a log file to disk (in Rust), subject to
    /// throttling.
    ///
    /// The caller should exit immediately with the returned [`napi::Error`] after calling this, as
    /// it sets a pending exception.
    ///
    /// The returned future does not depend on the lifetime of `&self` or `&err`, making it easier
    /// to compose with [`futures_util::TryFutureExt`] and similar utilities.
    pub fn throw_turbopack_internal_error(
        &self,
        err: &anyhow::Error,
    ) -> impl Future<Output = napi::Error> + use<> {
        let this = self.clone();
        let message = PrettyPrintError(err).to_string();
        let downcast_root_cause_err = err.root_cause().downcast_ref::<TurboTasksExecutionError>();
        let panic_location =
            if let Some(TurboTasksExecutionError::Panic(p)) = downcast_root_cause_err {
                p.location.clone()
            } else {
                None
            };

        log_internal_error_and_inform(err);

        async move {
            this.inner
                .napi_callbacks
                .throw_turbopack_internal_error
                .call_async::<()>(Ok(TurbopackInternalErrorOpts {
                    message,
                    anonymized_location: panic_location,
                }))
                .await
                .expect_err("throwTurbopackInternalError must throw an error")
        }
    }

    /// A utility method that calls [`NextTurbopackContext::throw_turbopack_internal_error`] and
    /// wraps the [`napi::Error`] in a [`napi::Result`].
    ///
    /// The returned future does not depend on the lifetime of `&self` or `&err`, making it easier
    /// to compose with [`futures_util::TryFutureExt::or_else`].
    ///
    /// The returned type uses a generic (`T`), but should be a never type (`!`) once that nightly
    /// feature is stabilized.
    pub fn throw_turbopack_internal_result<T>(
        &self,
        err: &anyhow::Error,
    ) -> impl Future<Output = napi::Result<T>> + use<T> {
        let err_fut = self.throw_turbopack_internal_error(err);
        async move { Err(err_fut.await) }
    }
}

/// A version of [`NapiNextTurbopackCallbacks`] that can accepted as an argument to a napi function.
///
/// This can be converted into a [`NapiNextTurbopackCallbacks`] with
/// [`NapiNextTurbopackCallbacks::from_js`].
#[napi(object)]
pub struct NapiNextTurbopackCallbacksJsObject {
    /// Called when we've encountered a bug in Turbopack and not in the user's code. Constructs and
    /// throws a `TurbopackInternalError` type. Logs to anonymized telemetry.
    ///
    /// As a result of the use of `ErrorStrategy::CalleeHandled`, the first argument is an error if
    /// there's a runtime conversion error. This should never happen, but if it does, the function
    /// can throw it instead.
    #[napi(ts_type = "(conversionError: Error | null, opts: TurbopackInternalErrorOpts) => never")]
    pub throw_turbopack_internal_error: JsFunction,
}

/// A collection of helper JavaScript functions passed into
/// [`crate::next_api::project::project_new`] and stored in the [`NextTurbopackContext`].
///
/// This type is [`Send`] and [`Sync`]. Callbacks are wrapped in [`ThreadsafeFunction`].
pub struct NapiNextTurbopackCallbacks {
    // It's a little nasty to use a `ThreadsafeFunction` for this, but we don't expect exceptions
    // to be a hot codepath.
    //
    // More ideally, we'd convert the error type in the JS thread after the execution of the future
    // when resolving the JS `Promise` object. However, doing that would add a lot more boilerplate
    // to all of our async entrypoints, and would be complicated by `FunctionRef` being `!Send` (I
    // think it could be `Send`, as long as `napi::Env` is checked at call-time, which it should be
    // anyways).
    throw_turbopack_internal_error: ThreadsafeFunction<TurbopackInternalErrorOpts>,
}

/// Arguments for [`NapiNextTurbopackCallbacks::throw_turbopack_internal_error`].
#[napi(object)]
pub struct TurbopackInternalErrorOpts {
    pub message: String,
    pub anonymized_location: Option<String>,
}

impl NapiNextTurbopackCallbacks {
    pub fn from_js(obj: NapiNextTurbopackCallbacksJsObject) -> napi::Result<Self> {
        Ok(NapiNextTurbopackCallbacks {
            throw_turbopack_internal_error: obj
                .throw_turbopack_internal_error
                .create_threadsafe_function(0, |ctx| {
                    // Avoid unpacking the struct into positional arguments, we really want to make
                    // sure we don't incorrectly order arguments and accidentally log a potentially
                    // PII-containing message in anonymized telemetry.
                    Ok(vec![ctx.value])
                })?,
        })
    }
}

pub fn create_turbo_tasks(
    output_path: PathBuf,
    persistent_caching: bool,
    _memory_limit: usize,
    dependency_tracking: bool,
    is_ci: bool,
    is_short_session: bool,
) -> Result<NextTurboTasks> {
    Ok(if persistent_caching {
        let version_info = GitVersionInfo {
            describe: env!("VERGEN_GIT_DESCRIBE"),
            dirty: option_env!("CI").is_none_or(|value| value.is_empty())
                && env!("VERGEN_GIT_DIRTY") == "true",
        };
        let (backing_storage, cache_state) = default_backing_storage(
            &output_path.join("cache/turbopack"),
            &version_info,
            is_ci,
            is_short_session,
        )?;
        let tt = TurboTasks::new(TurboTasksBackend::new(
            BackendOptions {
                storage_mode: Some(if std::env::var("TURBO_ENGINE_READ_ONLY").is_ok() {
                    turbo_tasks_backend::StorageMode::ReadOnly
                } else {
                    turbo_tasks_backend::StorageMode::ReadWrite
                }),
                dependency_tracking,
                num_workers: Some(tokio::runtime::Handle::current().metrics().num_workers()),
                ..Default::default()
            },
            Either::Left(backing_storage),
        ));
        if let StartupCacheState::Invalidated { reason_code } = cache_state {
            tt.send_compilation_event(Arc::new(StartupCacheInvalidationEvent { reason_code }));
        }
        tt
    } else {
        TurboTasks::new(TurboTasksBackend::new(
            BackendOptions {
                storage_mode: None,
                dependency_tracking,
                ..Default::default()
            },
            Either::Right(noop_backing_storage()),
        ))
    })
}

#[derive(Serialize)]
struct StartupCacheInvalidationEvent {
    reason_code: Option<String>,
}

impl CompilationEvent for StartupCacheInvalidationEvent {
    fn type_name(&self) -> &'static str {
        "StartupCacheInvalidationEvent"
    }

    fn severity(&self) -> Severity {
        Severity::Warning
    }

    fn message(&self) -> String {
        let reason_msg = match self.reason_code.as_deref() {
            Some(invalidation_reasons::PANIC) => {
                " because we previously detected an internal error in Turbopack"
            }
            Some(invalidation_reasons::USER_REQUEST) => " as the result of a user request",
            _ => "", // ignore unknown reasons
        };
        format!(
            "Turbopack's filesystem cache has been deleted{reason_msg}. Builds or page loads may \
             be slower as a result."
        )
    }

    fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap()
    }
}

static LOG_THROTTLE: Mutex<Option<Instant>> = Mutex::new(None);
static LOG_DIVIDER: &str = "---------------------------";
static PANIC_LOG: Lazy<PathBuf> = Lazy::new(|| {
    let mut path = env::temp_dir();
    path.push(format!("next-panic-{:x}.log", rand::random::<u128>()));
    path
});

/// Log the error to stderr and write a log file to disk, subject to throttling.
//
// TODO: Now that we're passing the error to a JS callback, handle this logic in Next.js using the
// logger there instead of writing directly to stderr.
pub fn log_internal_error_and_inform(internal_error: &anyhow::Error) {
    if cfg!(debug_assertions)
        || env::var("SWC_DEBUG") == Ok("1".to_string())
        || env::var("CI").is_ok_and(|v| !v.is_empty())
        // Next's run-tests unsets CI and sets NEXT_TEST_CI
        || env::var("NEXT_TEST_CI").is_ok_and(|v| !v.is_empty())
    {
        eprintln!(
            "{}: An unexpected Turbopack error occurred:\n{}",
            "FATAL".red().bold(),
            PrettyPrintError(internal_error)
        );
        return;
    }

    // hold open this mutex guard to prevent concurrent writes to the file!
    let mut last_error_time = LOG_THROTTLE.lock().unwrap();
    if let Some(last_error_time) = last_error_time.as_ref()
        && last_error_time.elapsed().as_secs() < 1
    {
        // Throttle panic logging to once per second
        return;
    }
    *last_error_time = Some(Instant::now());

    let size = std::fs::metadata(PANIC_LOG.as_path()).map(|m| m.len());
    if let Ok(size) = size
        && size > 512 * 1024
    {
        // Truncate the earliest error from log file if it's larger than 512KB
        let new_lines = {
            let log_read = OpenOptions::new()
                .read(true)
                .open(PANIC_LOG.as_path())
                .unwrap_or_else(|_| panic!("Failed to open {}", PANIC_LOG.to_string_lossy()));

            io::BufReader::new(&log_read)
                .lines()
                .skip(1)
                .skip_while(|line| match line {
                    Ok(line) => !line.starts_with(LOG_DIVIDER),
                    Err(_) => false,
                })
                .collect::<Vec<_>>()
        };

        let mut log_write = OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(PANIC_LOG.as_path())
            .unwrap_or_else(|_| panic!("Failed to open {}", PANIC_LOG.to_string_lossy()));

        for line in new_lines {
            match line {
                Ok(line) => {
                    writeln!(log_write, "{line}").unwrap();
                }
                Err(_) => {
                    break;
                }
            }
        }
    }

    let mut log_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(PANIC_LOG.as_path())
        .unwrap_or_else(|_| panic!("Failed to open {}", PANIC_LOG.to_string_lossy()));

    let internal_error_str: String = PrettyPrintError(internal_error).to_string();
    writeln!(log_file, "{}\n{}", LOG_DIVIDER, &internal_error_str).unwrap();

    let title = format!(
        "Turbopack Error: {}",
        internal_error_str.lines().next().unwrap_or("Unknown")
    );
    let version_str = format!(
        "Turbopack version: `{}`\nNext.js version: `{}`",
        env!("VERGEN_GIT_DESCRIBE"),
        env!("NEXTJS_VERSION")
    );
    let new_discussion_url = if supports_hyperlinks::supports_hyperlinks() {
        "clicking here.".hyperlink(
            format!(
                "https://github.com/vercel/next.js/discussions/new?category=turbopack-error-report&title={}&body={}&labels=Turbopack,Turbopack%20Panic%20Backtrace",
                &urlencoding::encode(&title),
                &urlencoding::encode(&format!("{}\n\nError message:\n```\n{}\n```", &version_str, &internal_error_str))
            )
        )
    } else {
        format!(
            "clicking here: https://github.com/vercel/next.js/discussions/new?category=turbopack-error-report&title={}&body={}&labels=Turbopack,Turbopack%20Panic%20Backtrace",
            &urlencoding::encode(&title),
            &urlencoding::encode(&format!("{}\n\nError message:\n```\n{}\n```", &version_str, &title))
        )
    };

    eprintln!(
        "\n-----\n{}: An unexpected Turbopack error occurred. A panic log has been written to \
         {}.\n\nTo help make Turbopack better, report this error by {}\n-----\n",
        "FATAL".red().bold(),
        PANIC_LOG.to_string_lossy(),
        &new_discussion_url
    );
}
