use std::collections::HashMap;

use turbopack_binding::turbo::tasks_fs::FileSystemPathVc;

pub mod next_layout_entry_transition;

#[turbo_tasks::value(shared)]
pub struct LayoutSegment {
    pub files: HashMap<String, FileSystemPathVc>,
    pub target: FileSystemPathVc,
}

#[turbo_tasks::value(transparent)]
pub struct LayoutSegments(Vec<LayoutSegmentVc>);
