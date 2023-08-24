use std::collections::HashMap;

use turbo_tasks::Vc;
use turbopack_binding::turbo::tasks_fs::FileSystemPath;

pub mod next_server_component_transition;

#[turbo_tasks::value(shared)]
pub struct LayoutSegment {
    pub files: HashMap<String, Vc<FileSystemPath>>,
    pub target: Vc<FileSystemPath>,
}

#[turbo_tasks::value(transparent)]
pub struct LayoutSegments(Vec<Vc<LayoutSegment>>);
