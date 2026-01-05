//! Test file for the TaskStorage derive macro
//!
//! This validates that the macro correctly parses annotations and generates
//! the correct TypedStorage structures.
//!
//! These tests use the actual TaskStorageSchema from storage_schema.rs to test
//! the generated TypedStorage.

#[cfg(test)]
mod tests {
    use turbo_tasks::TaskId;

    use crate::{
        backend::storage_schema::TypedStorage,
        data::{AggregationNumber, Dirtyness, OutputValue},
    };

    #[test]
    fn test_task_storage_generates_types() {
        // The macro generates a unified TypedStorage type
        let storage = TypedStorage::new();

        // Verify the generated structure compiles
        drop(storage);
    }

    #[test]
    fn test_generated_accessors() {
        let mut storage = TypedStorage::new();

        // Test inline direct field accessors (meta category)
        assert_eq!(storage.get_output(), &None);
        storage.set_output(Some(OutputValue::Output(unsafe {
            TaskId::new_unchecked(1)
        })));
        assert!(storage.get_output().is_some());

        // Test inline direct field accessors (meta category)
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

        // Test lazy field accessors (auto_set)
        let deps = storage.output_dependencies_mut();
        deps.insert(unsafe { TaskId::new_unchecked(10) });
        deps.insert(unsafe { TaskId::new_unchecked(20) });
        assert_eq!(deps.len(), 2);

        // Test inline field accessors (counter_map)
        let upper = storage.upper_mut();
        upper.insert(unsafe { TaskId::new_unchecked(5) }, 3);
        assert_eq!(upper.get(&unsafe { TaskId::new_unchecked(5) }), Some(&3));

        // Verify it compiles and drops correctly
        drop(storage);
    }

    #[test]
    fn test_memory_efficiency() {
        let empty_storage = TypedStorage::new();

        // Empty storage should not allocate the lazy fields
        // We can verify the structure compiles and basic operations work
        assert_eq!(empty_storage.get_output(), &None);
        assert_eq!(empty_storage.get_aggregation_number(), &None);

        // Create a storage with some data
        let mut storage_with_data = TypedStorage::new();
        storage_with_data.set_output(Some(OutputValue::Output(unsafe {
            TaskId::new_unchecked(1)
        })));

        // Add some dependencies (should allocate lazily)
        let deps = storage_with_data.output_dependencies_mut();
        deps.insert(unsafe { TaskId::new_unchecked(1) });

        assert!(storage_with_data.output.is_some());
    }

    #[test]
    fn test_inline_fields() {
        let mut storage = TypedStorage::new();

        // Test inline data field (output)
        storage.set_output(Some(OutputValue::Output(unsafe {
            TaskId::new_unchecked(123)
        })));
        assert!(storage.get_output().is_some());

        // Test inline counter_map field (upper)
        storage = TypedStorage::new();
        storage
            .upper_mut()
            .insert(unsafe { TaskId::new_unchecked(1) }, 10);
        assert_eq!(
            storage
                .upper_mut()
                .get(&unsafe { TaskId::new_unchecked(1) }),
            Some(&10)
        );

        // Test inline auto_set field (output_dependent)
        storage = TypedStorage::new();
        storage
            .output_dependent_mut()
            .insert(unsafe { TaskId::new_unchecked(5) });
        assert!(
            storage
                .output_dependent_mut()
                .contains(&unsafe { TaskId::new_unchecked(5) })
        );

        // Test inline meta field (aggregation_number)
        storage = TypedStorage::new();
        storage.set_aggregation_number(Some(AggregationNumber {
            base: 1,
            distance: 2,
            effective: 3,
        }));
        assert!(storage.get_aggregation_number().is_some());
    }

    #[test]
    fn test_lazy_fields() {
        let mut storage = TypedStorage::new();

        // Test lazy auto_set fields
        let deps = storage.output_dependencies_mut();
        deps.insert(unsafe { TaskId::new_unchecked(10) });
        assert!(storage.output_dependencies().is_some());
        assert_eq!(storage.output_dependencies().unwrap().len(), 1);

        let children = storage.children_mut();
        children.insert(unsafe { TaskId::new_unchecked(20) });
        assert!(storage.children().is_some());
        assert_eq!(storage.children().unwrap().len(), 1);

        // Test lazy counter_map field (followers)
        let followers = storage.followers_mut();
        followers.insert(unsafe { TaskId::new_unchecked(30) }, 5);
        assert!(storage.followers().is_some());
        assert_eq!(
            *storage
                .followers()
                .unwrap()
                .get(&unsafe { TaskId::new_unchecked(30) })
                .unwrap(),
            5
        );
    }
}
