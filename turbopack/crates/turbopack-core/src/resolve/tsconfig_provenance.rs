//! Private, typed observations from actual native TypeScript configuration probes.
//! This module does not resolve anything, issue a complete certificate, or read JSON authority.
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc, emit};
use turbo_tasks_fs::{FileContent, FileSystemEntryType, FileSystemPath, RealPathError};

use crate::{resolve::ResolveResult, source::Source};

/// Distinguishes actual option consumers; a transform cannot attest to alias discovery.
#[turbo_tasks::value]
#[derive(Clone, Copy, Debug, Hash)]
pub enum NativeTsConfigConsumer {
    TypeScript,
    Decorators,
    Jsx,
    Aliases,
}

/// Created by native option consumers, never deserialized from application data.
#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub struct NativeTsConfigProbeContext {
    pub filesystem_root: FileSystemPath,
    pub project_path: FileSystemPath,
    pub consumer: NativeTsConfigConsumer,
    pub configured_path: Option<FileSystemPath>,
    /// Stable identity of the actual option consumer; lookup_path may move along extends.
    pub consumer_path: FileSystemPath,
    pub lookup_path: FileSystemPath,
    pub request: RcStr,
    pub chain_index: u32,
    pub attempt_index: u32,
}

#[turbo_tasks::value]
#[derive(Clone, Copy, Debug, Hash)]
pub enum NativeTsConfigProbeRequest {
    /// read_matches accepts file or directory entries before selecting its next branch.
    Entry,
    Type(FileSystemEntryType),
}

#[turbo_tasks::value]
#[derive(Clone, Copy, Debug, Hash)]
pub enum NativeTsConfigReadStatus {
    Empty,
    Missing,
    Invalid,
    Parsed,
}

#[turbo_tasks::value]
#[derive(Clone, Debug)]
pub enum NativeTsConfigProbe {
    /// The exact branch used by the consuming option helper, including no-config defaults.
    Selection {
        path: FileSystemPath,
        selected: Option<FileSystemPath>,
    },
    /// Actual Fixed metadata result and explicit identity check at that same boundary.
    FixedMetadata {
        path: FileSystemPath,
        succeeded: bool,
        real_path: Result<FileSystemPath, RealPathError>,
        symlinks: Vec<FileSystemPath>,
        observed: FileSystemEntryType,
    },
    /// These exact source/content handles are also consumed by the native parser loop.
    ConfigRead {
        source: ResolvedVc<Box<dyn Source>>,
        path: FileSystemPath,
        content: ResolvedVc<FileContent>,
        status: NativeTsConfigReadStatus,
        /// Canonicality checks at this actual read boundary; not reconstructed resolver probes.
        real_path: Result<FileSystemPath, RealPathError>,
        symlinks: Vec<FileSystemPath>,
        observed: FileSystemEntryType,
    },
    /// The actual ordered native result, retained before first_source discards alternatives.
    Extends {
        path: FileSystemPath,
        request: RcStr,
        result: ResolvedVc<ResolveResult>,
    },
    /// The very realpath result used by the native directory read or selected source.
    RealPath {
        path: FileSystemPath,
        result: Result<FileSystemPath, RealPathError>,
        symlinks: Vec<FileSystemPath>,
    },
    /// The actual parent directory read used by finite candidate entry lookup.
    Directory { path: FileSystemPath, found: bool },
    /// The native entry/type observation that is also used for selection.
    Candidate {
        path: FileSystemPath,
        requested: NativeTsConfigProbeRequest,
        observed: FileSystemEntryType,
    },
    /// An actual branch for which this bounded producer cannot attest to completeness.
    Incomplete { path: FileSystemPath, reason: RcStr },
}

#[turbo_tasks::value(shared)]
#[derive(Clone)]
pub struct NativeTsConfigProbeData {
    pub context: ResolvedVc<NativeTsConfigProbeContext>,
    /// Native recursion/alternative order, not asynchronous completion order.
    pub order: Vec<u32>,
    pub probe: NativeTsConfigProbe,
}

#[turbo_tasks::value_trait]
pub trait NativeTsConfigObservation {
    #[turbo_tasks::function]
    fn data(self: Vc<Self>) -> Vc<NativeTsConfigProbeData>;
}

#[turbo_tasks::value_impl]
impl NativeTsConfigObservation for NativeTsConfigProbeData {
    #[turbo_tasks::function]
    fn data(self: Vc<Self>) -> Vc<NativeTsConfigProbeData> {
        self
    }
}

/// Optional native task input. None is the ordinary application path.
#[turbo_tasks::value(shared, task_input)]
#[derive(Clone, Debug, Hash)]
pub struct NativeTsConfigProbeScope {
    pub context: ResolvedVc<NativeTsConfigProbeContext>,
    pub order: Vec<u32>,
}

impl NativeTsConfigProbeScope {
    pub fn new(context: ResolvedVc<NativeTsConfigProbeContext>) -> Self {
        Self {
            context,
            order: Vec::new(),
        }
    }

    pub fn child(&self, index: usize) -> Self {
        let mut scope = self.clone();
        // A source algorithm cannot construct this many real alternatives.
        scope
            .order
            .push(u32::try_from(index).expect("native probe order overflow"));
        scope
    }

    pub fn record(&self, probe: NativeTsConfigProbe) {
        let value = NativeTsConfigProbeData {
            context: self.context,
            order: self.order.clone(),
            probe,
        }
        .resolved_cell();
        emit(ResolvedVc::upcast_non_strict::<
            Box<dyn NativeTsConfigObservation>,
        >(value));
    }
}
