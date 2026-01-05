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

    #[test]
    fn test_flag_fields() {
        use crate::backend::storage_schema::TaskFlags;

        let mut storage = TypedStorage::new();

        // Test that flags are default false
        assert!(!storage.flags.stateful());
        assert!(!storage.flags.invalidator());
        assert!(!storage.flags.immutable());
        assert!(!storage.flags.current_session_clean());

        // Test setting flags
        storage.flags.set_stateful(true);
        assert!(storage.flags.stateful());
        assert!(!storage.flags.invalidator()); // Other flags unchanged

        storage.flags.set_invalidator(true);
        storage.flags.set_immutable(true);
        assert!(storage.flags.stateful());
        assert!(storage.flags.invalidator());
        assert!(storage.flags.immutable());

        // Test transient flag (current_session_clean)
        storage.flags.set_current_session_clean(true);
        assert!(storage.flags.current_session_clean());

        // Test persisted_bits only includes non-transient flags
        // stateful=bit 0, invalidator=bit 1, immutable=bit 2 (persisted)
        // current_session_clean=bit 3 (transient)
        let persisted = storage.flags.persisted_bits();
        assert_eq!(persisted, 0b0111); // Only bits 0, 1, 2

        // Test TaskFlags constants
        assert_eq!(TaskFlags::PERSISTED_MASK, 0b111); // 3 persisted flags

        // Test set_persisted_bits preserves transient flags
        let mut storage2 = TypedStorage::new();
        storage2.flags.set_current_session_clean(true); // Set transient flag
        storage2.flags.set_persisted_bits(0b101); // Set stateful and immutable
        assert!(storage2.flags.stateful());
        assert!(!storage2.flags.invalidator());
        assert!(storage2.flags.immutable());
        assert!(storage2.flags.current_session_clean()); // Transient flag preserved
    }

    #[test]
    fn test_internal_state_flags() {
        // Test the new internal state flags (formerly InnerStorageState)
        let mut storage = TypedStorage::new();

        // All internal state flags should be default false
        assert!(!storage.flags.meta_restored());
        assert!(!storage.flags.data_restored());
        assert!(!storage.flags.meta_modified());
        assert!(!storage.flags.data_modified());
        assert!(!storage.flags.meta_snapshot());
        assert!(!storage.flags.data_snapshot());
        assert!(!storage.flags.prefetched());

        // Test setting restored flags
        storage.flags.set_meta_restored(true);
        storage.flags.set_data_restored(true);
        assert!(storage.flags.meta_restored());
        assert!(storage.flags.data_restored());

        // Test setting modified flags
        storage.flags.set_meta_modified(true);
        storage.flags.set_data_modified(true);
        assert!(storage.flags.meta_modified());
        assert!(storage.flags.data_modified());

        // Test setting snapshot flags
        storage.flags.set_meta_snapshot(true);
        storage.flags.set_data_snapshot(true);
        assert!(storage.flags.meta_snapshot());
        assert!(storage.flags.data_snapshot());

        // Test prefetched flag
        storage.flags.set_prefetched(true);
        assert!(storage.flags.prefetched());

        // Verify these are all transient (not in persisted_bits)
        // Only stateful, invalidator, immutable should be persisted
        let persisted = storage.flags.persisted_bits();
        assert_eq!(persisted, 0b000); // No persisted flags set

        // Set a persisted flag and verify internal state flags are still transient
        storage.flags.set_stateful(true);
        let persisted = storage.flags.persisted_bits();
        assert_eq!(persisted, 0b001); // Only stateful
    }

    // Helper to create encoder
    fn new_encoder(
        buffer: &mut turbo_bincode::TurboBincodeBuffer,
    ) -> turbo_bincode::TurboBincodeEncoder<'_> {
        bincode::enc::EncoderImpl::new(
            turbo_bincode::TurboBincodeWriter::new(buffer),
            turbo_bincode::TURBO_BINCODE_CONFIG,
        )
    }

    // Helper to create decoder
    fn new_decoder(buffer: &[u8]) -> turbo_bincode::TurboBincodeDecoder<'_> {
        bincode::de::DecoderImpl::new(
            turbo_bincode::TurboBincodeReader::new(buffer),
            turbo_bincode::TURBO_BINCODE_CONFIG,
            (),
        )
    }

    #[test]
    fn test_encode_decode_meta_roundtrip() {
        let mut original = TypedStorage::new();

        // Set inline meta fields
        original.set_aggregation_number(Some(AggregationNumber {
            base: 10,
            distance: 5,
            effective: 15,
        }));
        original.set_output(Some(OutputValue::Output(unsafe {
            TaskId::new_unchecked(42)
        })));
        original
            .upper_mut()
            .insert(unsafe { TaskId::new_unchecked(100) }, 7);
        original
            .upper_mut()
            .insert(unsafe { TaskId::new_unchecked(200) }, 3);
        original.set_dirty(Some(Dirtyness::Dirty));
        original.set_aggregated_dirty_container_count(Some(5));
        original
            .aggregated_dirty_containers_mut()
            .insert(unsafe { TaskId::new_unchecked(50) }, 2);

        // Set flags (persisted)
        original.flags.set_stateful(true);
        original.flags.set_immutable(true);
        // Set transient flag (should NOT be serialized)
        original.flags.set_current_session_clean(true);

        // Set lazy meta fields (persisted)
        original
            .children_mut()
            .insert(unsafe { TaskId::new_unchecked(1000) });
        original
            .children_mut()
            .insert(unsafe { TaskId::new_unchecked(1001) });
        original
            .followers_mut()
            .insert(unsafe { TaskId::new_unchecked(2000) }, 4);

        // Encode meta fields using turbo_bincode
        let mut buffer = turbo_bincode::TurboBincodeBuffer::new();
        {
            let mut encoder = new_encoder(&mut buffer);
            original.encode_meta(&mut encoder).expect("encode failed");
        }

        // Decode into new storage
        let mut decoded = TypedStorage::new();
        // Set transient flag before decode to verify it's preserved
        decoded.flags.set_current_session_clean(true);

        {
            let mut decoder = new_decoder(&buffer);
            decoded.decode_meta(&mut decoder).expect("decode failed");
        }

        // Verify inline meta fields
        assert_eq!(
            decoded.get_aggregation_number(),
            original.get_aggregation_number()
        );
        assert_eq!(decoded.get_output(), original.get_output());
        assert_eq!(decoded.upper, original.upper);
        assert_eq!(decoded.get_dirty(), original.get_dirty());
        assert_eq!(
            decoded.get_aggregated_dirty_container_count(),
            original.get_aggregated_dirty_container_count()
        );
        assert_eq!(
            decoded.aggregated_dirty_containers,
            original.aggregated_dirty_containers
        );

        // Verify flags (persisted bits should match)
        assert!(decoded.flags.stateful());
        assert!(!decoded.flags.invalidator());
        assert!(decoded.flags.immutable());
        // Transient flag should be preserved (was set to true before decode)
        assert!(decoded.flags.current_session_clean());

        // Verify lazy meta fields
        assert_eq!(decoded.children().unwrap().len(), 2);
        assert!(
            decoded
                .children()
                .unwrap()
                .contains(&unsafe { TaskId::new_unchecked(1000) })
        );
        assert!(
            decoded
                .children()
                .unwrap()
                .contains(&unsafe { TaskId::new_unchecked(1001) })
        );
        assert_eq!(
            *decoded
                .followers()
                .unwrap()
                .get(&unsafe { TaskId::new_unchecked(2000) })
                .unwrap(),
            4
        );
    }

    #[test]
    fn test_encode_decode_data_roundtrip() {
        use turbo_tasks::CellId;

        use crate::data::CellRef;

        let mut original = TypedStorage::new();

        // Set inline data field
        original
            .output_dependent_mut()
            .insert(unsafe { TaskId::new_unchecked(10) });
        original
            .output_dependent_mut()
            .insert(unsafe { TaskId::new_unchecked(20) });

        // Set lazy data fields (persisted)
        original
            .output_dependencies_mut()
            .insert(unsafe { TaskId::new_unchecked(100) });
        original
            .output_dependencies_mut()
            .insert(unsafe { TaskId::new_unchecked(200) });
        original.cell_dependencies_mut().insert(CellRef {
            task: unsafe { TaskId::new_unchecked(1) },
            cell: CellId {
                type_id: unsafe { turbo_tasks::ValueTypeId::new_unchecked(1) },
                index: 0,
            },
        });

        // Set lazy data transient field (should NOT be serialized)
        original
            .outdated_output_dependencies_mut()
            .insert(unsafe { TaskId::new_unchecked(999) });

        // Encode data fields
        let mut buffer = turbo_bincode::TurboBincodeBuffer::new();
        {
            let mut encoder = new_encoder(&mut buffer);
            original.encode_data(&mut encoder).expect("encode failed");
        }

        // Decode into new storage
        let mut decoded = TypedStorage::new();

        {
            let mut decoder = new_decoder(&buffer);
            decoded.decode_data(&mut decoder).expect("decode failed");
        }

        // Verify inline data field
        assert_eq!(decoded.output_dependent.len(), 2);
        assert!(
            decoded
                .output_dependent
                .contains(&unsafe { TaskId::new_unchecked(10) })
        );
        assert!(
            decoded
                .output_dependent
                .contains(&unsafe { TaskId::new_unchecked(20) })
        );

        // Verify lazy data fields
        assert_eq!(decoded.output_dependencies().unwrap().len(), 2);
        assert!(
            decoded
                .output_dependencies()
                .unwrap()
                .contains(&unsafe { TaskId::new_unchecked(100) })
        );
        assert!(
            decoded
                .output_dependencies()
                .unwrap()
                .contains(&unsafe { TaskId::new_unchecked(200) })
        );
        assert_eq!(decoded.cell_dependencies().unwrap().len(), 1);

        // Verify transient fields were NOT decoded
        assert!(decoded.outdated_output_dependencies().is_none());
    }

    #[test]
    fn test_encode_decode_empty_storage() {
        // Test that empty storage can be encoded/decoded
        let original = TypedStorage::new();

        // Encode meta
        let mut meta_buffer = turbo_bincode::TurboBincodeBuffer::new();
        {
            let mut encoder = new_encoder(&mut meta_buffer);
            original
                .encode_meta(&mut encoder)
                .expect("encode meta failed");
        }

        // Encode data
        let mut data_buffer = turbo_bincode::TurboBincodeBuffer::new();
        {
            let mut encoder = new_encoder(&mut data_buffer);
            original
                .encode_data(&mut encoder)
                .expect("encode data failed");
        }

        // Decode meta
        let mut decoded = TypedStorage::new();
        {
            let mut decoder = new_decoder(&meta_buffer);
            decoded
                .decode_meta(&mut decoder)
                .expect("decode meta failed");
        }

        // Decode data
        {
            let mut decoder = new_decoder(&data_buffer);
            decoded
                .decode_data(&mut decoder)
                .expect("decode data failed");
        }

        // Verify empty
        assert!(decoded.get_aggregation_number().is_none());
        assert!(decoded.get_output().is_none());
        assert!(decoded.upper.is_empty());
        assert!(!decoded.flags.stateful());
        assert!(decoded.output_dependent.is_empty());
        assert!(decoded.children().is_none());
        assert!(decoded.output_dependencies().is_none());
    }
}
