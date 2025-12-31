//! Integration test for TaskStorage macro

use turbo_tasks_macros::TaskStorage;

// Temporary mock of InnerStorageState for testing
bitfield::bitfield! {
    #[derive(Clone, Default)]
    pub struct InnerStorageState(u32);
    impl Debug;
    pub meta_restored, set_meta_restored: 0;
    pub data_restored, set_data_restored: 1;
    pub meta_modified, set_meta_modified: 2;
    pub data_modified, set_data_modified: 3;
    pub meta_snapshot, set_meta_snapshot: 4;
    pub data_snapshot, set_data_snapshot: 5;
}

#[derive(TaskStorage)]
struct SimpleStorage {
    #[task_storage(storage = "direct", category = "data")]
    value: Option<u32>,
}

#[test]
fn test_macro_generates_types() {
    // Check that the macro ran and generated types
    let _data = TaskData::default();
    let _meta = TaskMeta::default();
    let _storage = InnerStorage::new();
}
