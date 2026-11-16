//! Toolchain/target invariants and process-local compiler-session ownership.
use std::{collections::HashMap, path::Path};

use anyhow::{Result, ensure};
use bincode::{Decode, Encode};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};

use crate::{GoBuildContext, GoBuildOptions, GoBuildSession, filesystem_with_poll_interval};

#[turbo_tasks::task_input]
#[derive(Clone, Debug, Hash, PartialEq, Eq, Encode, Decode)]
pub struct GoTarget {
    os: RcStr,
    arch: RcStr,
}
impl GoTarget {
    /// Go validates availability for the selected SDK; the target keeps its suffix consistent.
    pub fn new(os: RcStr, arch: RcStr) -> Result<Self> {
        ensure!(
            [&os, &arch].into_iter().all(|s| !s.is_empty()
                && s.bytes()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())),
            "invalid Go target"
        );
        Ok(Self { os, arch })
    }
    pub fn executable_suffix(&self) -> RcStr {
        if self.os == "windows" {
            rcstr!(".exe")
        } else {
            rcstr!("")
        }
    }
}
impl GoBuildContext {
    pub fn for_target(&self, target: &GoTarget) -> Self {
        let mut go_context = self.clone();
        go_context.goos = target.os.clone();
        go_context.goarch = target.arch.clone();
        go_context.exe_suffix = target.executable_suffix();
        go_context
    }
    pub async fn module_cache_filesystem(
        &self,
    ) -> Result<ResolvedVc<turbo_tasks_fs::DiskFileSystem>> {
        filesystem_with_poll_interval(self.module_cache.clone(), self.poll_interval_ms)
            .resolve()
            .strongly_consistent()
            .await
    }

    /// Acquire one watcher lease per cancellation context. Independent consumers sharing
    /// this module cache can release their leases without stopping each other's watches.
    pub async fn start_module_cache_watching(&self) -> Result<()> {
        let mut watching = self.cancellation.module_cache_watching.lock().await;
        if *watching || self.is_cancelled() {
            return Ok(());
        }
        let owners = module_cache_owners(self.module_cache.clone(), self.poll_interval_ms)
            .read_strongly_consistent()
            .await?;
        let mut count = owners.count.lock().await;
        if *count == 0 {
            self.module_cache_filesystem()
                .await?
                .await?
                .start_watching()
                .await?;
        }
        *count += 1;
        *watching = true;
        if self.is_cancelled() {
            *watching = false;
            *count -= 1;
            if *count == 0 {
                self.module_cache_filesystem()
                    .await?
                    .await?
                    .stop_watching()
                    .await;
            }
        }
        Ok(())
    }

    pub async fn stop_module_cache_watching(&self) -> Result<()> {
        let mut watching = self.cancellation.module_cache_watching.lock().await;
        if !*watching {
            return Ok(());
        }
        let owners = module_cache_owners(self.module_cache.clone(), self.poll_interval_ms)
            .read_strongly_consistent()
            .await?;
        let mut count = owners.count.lock().await;
        *watching = false;
        *count -= 1;
        if *count == 0 {
            self.module_cache_filesystem()
                .await?
                .await?
                .stop_watching()
                .await;
        }
        Ok(())
    }
}

#[turbo_tasks::task_input]
#[derive(Clone, Debug, Hash, PartialEq, Eq, Encode, Decode)]
pub struct GoToolchainOptions {
    pub go: RcStr,
    pub tags: RcStr,
    pub poll_interval_ms: Option<u64>,
}
#[derive(Default)]
struct State {
    probes: HashMap<GoToolchainOptions, GoBuildOptions>,
    contexts: HashMap<(RcStr, GoBuildOptions), GoBuildContext>,
    closed: bool,
}

#[turbo_tasks::value(evict = "never", eq = "manual")]
pub struct GoSessionPool {
    // Only process-local options, counters and cancellation handles; no task references.
    #[turbo_tasks(debug_ignore, unsafe_ignore)]
    #[bincode(skip)]
    state: tokio::sync::Mutex<State>,
}
impl PartialEq for GoSessionPool {
    fn eq(&self, other: &Self) -> bool {
        std::ptr::eq(self, other)
    }
}
impl Eq for GoSessionPool {}
impl GoSessionPool {
    pub fn new() -> ResolvedVc<Self> {
        Self {
            state: Default::default(),
        }
        .resolved_cell()
    }

    /// Call from a session-dependent task. Probe lazily, then retain the resident session's
    /// actual cancellation handle, including after persistent task restoration.
    pub async fn session(
        &self,
        scope: RcStr,
        options: GoToolchainOptions,
        target: Option<GoTarget>,
        watch: bool,
    ) -> Result<ResolvedVc<GoBuildSession>> {
        let mut state = self.state.lock().await;
        ensure!(!state.closed, "Go compiler session owner has shut down");
        let host = if let Some(host) = state.probes.get(&options) {
            host.clone()
        } else {
            let mut host =
                GoBuildContext::host(Path::new(options.go.as_str()), None, &options.tags).await?;
            host.poll_interval_ms = options.poll_interval_ms;
            state.probes.insert(options.clone(), host.options.clone());
            host.options
        };
        let selected = if let Some(target) = target {
            GoBuildContext {
                options: host,
                cancellation: crate::fresh_cancellation(),
            }
            .for_target(&target)
            .options
        } else {
            host
        };
        let session = GoBuildSession::persistent(scope.clone(), selected.clone())
            .to_resolved()
            .await?;
        let go_context = session.await?.go_context.clone();
        state.contexts.insert((scope, selected), go_context.clone());
        if watch {
            go_context.start_module_cache_watching().await?;
        }
        Ok(session)
    }

    /// Cancel every target and release this owner's module-cache watcher leases. The host
    /// application owns its project filesystem and must stop its task engine afterwards.
    pub async fn shutdown(&self) -> Result<()> {
        let mut state = self.state.lock().await;
        state.closed = true;
        for go_context in state.contexts.values() {
            go_context.cancel();
        }
        let mut failure = None;
        for go_context in state.contexts.values() {
            let release = go_context.stop_module_cache_watching().await;
            if let Err(error) = release {
                failure = Some(error);
            }
        }
        state.contexts.clear();
        if let Some(error) = failure {
            return Err(error);
        }
        Ok(())
    }
}

#[turbo_tasks::value(evict = "never", eq = "manual")]
struct ModuleCacheOwners {
    #[turbo_tasks(debug_ignore, unsafe_ignore)]
    #[bincode(skip)]
    count: tokio::sync::Mutex<usize>,
}
impl PartialEq for ModuleCacheOwners {
    fn eq(&self, other: &Self) -> bool {
        std::ptr::eq(self, other)
    }
}
impl Eq for ModuleCacheOwners {}
#[turbo_tasks::function(operation, root)]
fn module_cache_owners(path: RcStr, poll: Option<u64>) -> Vc<ModuleCacheOwners> {
    let _ = (path, poll);
    ModuleCacheOwners {
        count: Default::default(),
    }
    .cell()
}
