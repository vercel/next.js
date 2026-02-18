use turbo_rcstr::RcStr;
use turbo_tasks_fs::FileSystemPath;

/// Metadata describing a module boundary (e.g., server component, server utility, dynamic entry).
///
/// This allows detection of boundary types without downcasting to concrete module types,
/// decoupling the detection mechanism from the wrapper module implementation.
#[turbo_tasks::value(shared)]
#[derive(Clone, Debug)]
pub struct BoundaryInfo {
    /// The type of boundary (e.g., "server-component", "server-utility", "dynamic-entry").
    pub boundary_type: RcStr,
    /// Optional original source path before transformations (e.g., page.mdx before page.mdx.tsx).
    pub source_path: Option<FileSystemPath>,
}

impl BoundaryInfo {
    pub fn new(boundary_type: RcStr) -> Self {
        BoundaryInfo {
            boundary_type,
            source_path: None,
        }
    }

    pub fn with_source_path(boundary_type: RcStr, source_path: FileSystemPath) -> Self {
        BoundaryInfo {
            boundary_type,
            source_path: Some(source_path),
        }
    }
}

#[turbo_tasks::value(transparent)]
pub struct OptionBoundaryInfo(Option<BoundaryInfo>);
