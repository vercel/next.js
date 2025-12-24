//! Integration test for TaskStorage macro

use turbo_tasks_macros::TaskStorage;

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
