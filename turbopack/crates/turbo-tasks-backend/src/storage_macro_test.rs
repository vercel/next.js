//! Test file for the TaskStorage derive macro
//!
//! This validates that the macro correctly parses annotations and will eventually
//! generate the correct storage structures.

use turbo_tasks::TaskId;
use turbo_tasks_macros::TaskStorage;

use crate::{
    data::{AggregationNumber, Dirtyness, OutputValue},
    storage_types::{AutoSet, CounterMap},
};

// Temporary mock of InnerStorageState for testing
// In production, this will come from backend::storage
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

/// Test schema using the TaskStorage derive macro
///
/// This should generate structures similar to our hand-written prototype
#[derive(TaskStorage)]
pub struct TaskStorageSchema {
    // Specialized hot-path fields (outside groups for optimal memory layout)
    #[task_storage(storage = "direct", category = "meta", specialized)]
    pub aggregation_number: Option<AggregationNumber>,

    #[task_storage(storage = "auto_set", category = "data", specialized)]
    pub output_dependent: AutoSet<TaskId>,

    #[task_storage(storage = "direct", category = "data", specialized)]
    pub output: Option<OutputValue>,

    #[task_storage(storage = "counter_map", category = "data", specialized)]
    pub upper: CounterMap<TaskId, u32>,

    // Grouped fields with lazy allocation - dependencies group
    #[task_storage(storage = "auto_set", category = "data", group = "dependencies", lazy)]
    pub output_dependencies: AutoSet<TaskId>,

    #[task_storage(storage = "auto_set", category = "data", group = "dependencies", lazy)]
    pub children: AutoSet<TaskId>,

    // Grouped fields with lazy allocation - aggregation group
    #[task_storage(
        storage = "counter_map",
        category = "data",
        group = "aggregation",
        lazy
    )]
    pub followers: CounterMap<TaskId, u32>,

    // Meta category fields (non-specialized)
    #[task_storage(storage = "direct", category = "meta")]
    pub dirty: Option<Dirtyness>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_task_storage_generates_types() {
        // The macro generates TaskData, TaskMeta, and InnerStorage types
        let _data = TaskData::default();
        let _meta = TaskMeta::default();
        let storage = InnerStorage::new();

        // Verify the generated structure compiles
        drop(storage);
    }

    #[test]
    fn test_generated_accessors() {
        use turbo_tasks::TaskId;

        let mut storage = InnerStorage::new();

        // Test direct field accessors (data category)
        assert_eq!(storage.get_output(), &None);
        storage.set_output(Some(OutputValue::Output(unsafe {
            TaskId::new_unchecked(1)
        })));
        assert!(storage.get_output().is_some());

        // Test direct field accessors (meta category)
        assert_eq!(storage.get_aggregation_number(), &None);
        storage.set_aggregation_number(Some(AggregationNumber {
            base: 10,
            distance: 5,
            effective: 15,
        }));
        assert!(storage.get_aggregation_number().is_some());

        assert_eq!(storage.get_dirty(), &None);
        storage.set_dirty(Some(Dirtyness::Dirty));
        assert_eq!(storage.get_dirty(), &Some(Dirtyness::Dirty));

        // Test grouped field accessors (auto_set)
        let deps = storage.output_dependencies_mut();
        deps.insert(unsafe { TaskId::new_unchecked(10) });
        deps.insert(unsafe { TaskId::new_unchecked(20) });
        assert_eq!(deps.len(), 2);

        // Test grouped field accessors (counter_map)
        let upper = storage.upper_mut();
        upper.insert(unsafe { TaskId::new_unchecked(5) }, 3);
        assert_eq!(upper.get(&unsafe { TaskId::new_unchecked(5) }), Some(3));

        // Verify it compiles and drops correctly
        drop(storage);
    }

    #[test]
    fn test_memory_efficiency() {
        let empty_storage = InnerStorage::new();

        // Empty storage should not allocate the lazy groups
        // We can't directly test Option<Box<...>> internals without unsafe,
        // but we can verify the structure compiles and basic operations work
        assert_eq!(empty_storage.get_output(), &None);
        assert_eq!(empty_storage.get_aggregation_number(), &None);

        // Create a storage with some data
        let mut storage_with_data = InnerStorage::new();
        storage_with_data.set_output(Some(OutputValue::Output(unsafe {
            turbo_tasks::TaskId::new_unchecked(1)
        })));

        // Add some dependencies (should allocate the lazy group)
        let deps = storage_with_data.output_dependencies_mut();
        deps.insert(unsafe { turbo_tasks::TaskId::new_unchecked(1) });

        // Verify serialization/deserialization works
        let encoded = bincode::encode_to_vec(&storage_with_data.data, bincode::config::standard())
            .expect("encode should work");
        let (decoded, _): (TaskData, usize) =
            bincode::decode_from_slice(&encoded, bincode::config::standard())
                .expect("decode should work");

        assert!(decoded.output.is_some());
    }

    #[test]
    fn test_modification_tracking_spot_check() {
        let mut storage = InnerStorage::new();

        // Initially unmodified
        assert!(!storage.state().data_modified());
        assert!(!storage.state().meta_modified());

        // Spot check: data field modification
        storage.set_output(Some(OutputValue::Output(unsafe {
            TaskId::new_unchecked(1)
        })));
        assert!(storage.state().data_modified());
        assert!(!storage.state().meta_modified());

        // Reset for meta test
        storage = InnerStorage::new();

        // Spot check: meta field modification
        storage.set_dirty(Some(Dirtyness::Dirty));
        assert!(!storage.state().data_modified());
        assert!(storage.state().meta_modified());

        // Spot check: lazy group allocation triggers tracking
        storage = InnerStorage::new();
        storage
            .output_dependencies_mut()
            .insert(unsafe { TaskId::new_unchecked(1) });
        assert!(storage.state().data_modified());
        assert!(!storage.state().meta_modified());
    }

    #[test]
    fn test_reads_dont_modify() {
        let storage = InnerStorage::new();
        let _ = storage.get_output();
        let _ = storage.get_dirty();
        assert!(!storage.state().data_modified());
        assert!(!storage.state().meta_modified());
    }

    #[test]
    fn test_snapshot_round_trip() {
        let mut storage = InnerStorage::new();

        // Add some data
        storage.set_output(Some(OutputValue::Output(unsafe {
            TaskId::new_unchecked(42)
        })));
        storage
            .output_dependencies_mut()
            .insert(unsafe { TaskId::new_unchecked(1) });
        storage
            .output_dependencies_mut()
            .insert(unsafe { TaskId::new_unchecked(2) });

        // Add some meta
        storage.set_dirty(Some(Dirtyness::Dirty));
        storage.set_aggregation_number(Some(AggregationNumber {
            base: 10,
            distance: 5,
            effective: 15,
        }));

        // Verify modification flags are set
        assert!(storage.state().data_modified());
        assert!(storage.state().meta_modified());

        // Take snapshot
        let snapshot = storage.snapshot();

        // Verify snapshot captures modification flags
        assert!(snapshot.data_modified);
        assert!(snapshot.meta_modified);

        // Create new storage and restore
        let mut restored = InnerStorage::new();
        restored.restore(snapshot);

        // Verify data is restored
        assert!(restored.get_output().is_some());
        assert_eq!(restored.get_dirty(), &Some(Dirtyness::Dirty));
        assert!(restored.get_aggregation_number().is_some());

        // Verify modification flags are restored
        assert!(restored.state().data_modified());
        assert!(restored.state().meta_modified());
    }

    #[test]
    fn test_specialized_fields() {
        let mut storage = InnerStorage::new();

        // Test specialized data field (output)
        storage.set_output(Some(OutputValue::Output(unsafe {
            TaskId::new_unchecked(123)
        })));
        assert!(storage.get_output().is_some());
        assert!(storage.state().data_modified());

        // Test specialized counter_map field (upper)
        storage = InnerStorage::new();
        storage
            .upper_mut()
            .insert(unsafe { TaskId::new_unchecked(1) }, 10);
        assert!(storage.state().data_modified());

        // Test specialized auto_set field (output_dependent)
        storage = InnerStorage::new();
        storage
            .output_dependent_mut()
            .insert(unsafe { TaskId::new_unchecked(5) });
        assert!(storage.state().data_modified());

        // Test specialized meta field (aggregation_number)
        storage = InnerStorage::new();
        storage.set_aggregation_number(Some(AggregationNumber {
            base: 1,
            distance: 2,
            effective: 3,
        }));
        assert!(storage.state().meta_modified());
        assert!(!storage.state().data_modified());
    }

    #[test]
    fn test_serialization_round_trip() {
        let mut storage = InnerStorage::new();

        // Add some data to TaskData
        storage.set_output(Some(OutputValue::Output(unsafe {
            TaskId::new_unchecked(99)
        })));
        storage
            .output_dependencies_mut()
            .insert(unsafe { TaskId::new_unchecked(10) });
        storage
            .upper_mut()
            .insert(unsafe { TaskId::new_unchecked(20) }, 5);

        // Serialize TaskData
        let encoded_data = bincode::encode_to_vec(&storage.data, bincode::config::standard())
            .expect("encode data should work");

        // Deserialize TaskData
        let (decoded_data, _): (TaskData, usize) =
            bincode::decode_from_slice(&encoded_data, bincode::config::standard())
                .expect("decode data should work");

        // Spot check: verify some fields survived round-trip
        assert!(decoded_data.output.is_some());

        // Add some meta to TaskMeta
        storage.set_aggregation_number(Some(AggregationNumber {
            base: 100,
            distance: 50,
            effective: 150,
        }));

        // Serialize TaskMeta
        let encoded_meta = bincode::encode_to_vec(&storage.meta, bincode::config::standard())
            .expect("encode meta should work");

        // Deserialize TaskMeta
        let (decoded_meta, _): (TaskMeta, usize) =
            bincode::decode_from_slice(&encoded_meta, bincode::config::standard())
                .expect("decode meta should work");

        // Spot check: verify meta field survived round-trip
        assert!(decoded_meta.aggregation_number.is_some());
    }
}
