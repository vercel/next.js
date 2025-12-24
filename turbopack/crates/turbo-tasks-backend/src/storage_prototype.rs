//! Prototype of the new storage design using specialized storage types.
//!
//! This is a hand-written example to validate the approach before building the macro.
//! We'll implement a subset of the full storage to test:
//! 1. Direct access fields (output, aggregation_number)
//! 2. SmallSet fields (output_dependencies, children)
//! 3. CounterMap fields (upper, followers)
//! 4. Bitfield flags (stateful, immutable)

use bincode::{Decode, Encode};
use turbo_tasks::{CellId, TaskId, TypedSharedReference};

use crate::{
    data::{AggregationNumber, Dirtyness, OutputValue},
    storage_types::{AutoSet, CounterMap, IndexKey, IndexedVec},
};

// ============================================================================
// Storage Structure (Prototype)
// ============================================================================

/// Data fields - change frequently, bulk of disk I/O
#[derive(Debug, Clone, Default, Encode, Decode)]
pub struct TaskDataPrototype {
    // Common - always present
    pub output: Option<OutputValue>,

    // Sparse - lazy allocation
    pub dependencies: Option<Box<DependencyData>>,
    pub aggregation: Option<Box<AggregationData>>,
    pub cells: Option<Box<CellData>>,
}

#[derive(Debug, Clone, Default, Encode, Decode)]
pub struct DependencyData {
    pub output_dependencies: AutoSet<TaskId>,
    pub children: AutoSet<TaskId>,
}

#[derive(Debug, Clone, Default, Encode, Decode)]
pub struct AggregationData {
    pub upper: CounterMap<TaskId, u32>,
    pub followers: CounterMap<TaskId, u32>,
}

#[derive(Debug, Clone, Default)]
pub struct CellData {
    pub cells: IndexedVec<CellId, TypedSharedReference>,
}

// Manual Encode/Decode for CellData since IndexedVec needs it
impl Encode for CellData {
    fn encode<E: bincode::enc::Encoder>(
        &self,
        encoder: &mut E,
    ) -> Result<(), bincode::error::EncodeError> {
        self.cells.encode(encoder)
    }
}

impl<Context> Decode<Context> for CellData {
    fn decode<D: bincode::de::Decoder<Context = Context>>(
        decoder: &mut D,
    ) -> Result<Self, bincode::error::DecodeError> {
        Ok(Self {
            cells: IndexedVec::decode(decoder)?,
        })
    }
}

impl<'de, Context> bincode::BorrowDecode<'de, Context> for CellData {
    fn borrow_decode<D: bincode::de::BorrowDecoder<'de, Context = Context>>(
        decoder: &mut D,
    ) -> Result<Self, bincode::error::DecodeError> {
        Ok(Self {
            cells: IndexedVec::borrow_decode(decoder)?,
        })
    }
}

// Implement IndexKey for CellId
impl IndexKey for CellId {
    fn index(&self) -> u32 {
        self.index
    }
}

/// Meta fields - change rarely
#[derive(Debug, Clone, Default, Encode, Decode)]
pub struct TaskMetaPrototype {
    pub aggregation_number: Option<AggregationNumber>,
    pub dirty: Option<Dirtyness>,
    // Bitfield flags are stored in InnerStorageState, not here
}

/// Complete prototype storage
#[derive(Debug, Clone)]
pub struct InnerStoragePrototype {
    pub data: TaskDataPrototype,
    pub meta: TaskMetaPrototype,
    // In real version, would also have:
    // - transient: TransientTaskData
    // - state: InnerStorageState (bitfield)
}

impl Default for InnerStoragePrototype {
    fn default() -> Self {
        Self::new()
    }
}

// ============================================================================
// Accessor Methods (What the macro would generate)
// ============================================================================

impl InnerStoragePrototype {
    pub fn new() -> Self {
        Self {
            data: TaskDataPrototype::default(),
            meta: TaskMetaPrototype::default(),
        }
    }

    // === OUTPUT (direct, data category) ===

    pub fn get_output(&self) -> Option<&OutputValue> {
        self.data.output.as_ref()
    }

    pub fn set_output(&mut self, value: OutputValue) {
        self.data.output = Some(value);
    }

    pub fn take_output(&mut self) -> Option<OutputValue> {
        self.data.output.take()
    }

    // === OUTPUT_DEPENDENCIES (small_set, data category, lazy) ===

    pub fn add_output_dependency(&mut self, target: TaskId) -> bool {
        let deps = self
            .data
            .dependencies
            .get_or_insert_with(|| Box::new(DependencyData::default()));
        deps.output_dependencies.insert(target)
    }

    pub fn remove_output_dependency(&mut self, target: &TaskId) -> bool {
        self.data
            .dependencies
            .as_mut()
            .map(|deps| deps.output_dependencies.remove(target))
            .unwrap_or(false)
    }

    pub fn contains_output_dependency(&self, target: &TaskId) -> bool {
        self.data
            .dependencies
            .as_ref()
            .map(|deps| deps.output_dependencies.contains(target))
            .unwrap_or(false)
    }

    pub fn iter_output_dependencies(&self) -> Box<dyn Iterator<Item = TaskId> + '_> {
        match &self.data.dependencies {
            Some(deps) => Box::new(deps.output_dependencies.iter().copied()),
            None => Box::new(std::iter::empty()),
        }
    }

    pub fn output_dependencies_count(&self) -> usize {
        self.data
            .dependencies
            .as_ref()
            .map(|deps| deps.output_dependencies.len())
            .unwrap_or(0)
    }

    // === CHILDREN (small_set, data category, lazy) ===

    pub fn add_child(&mut self, task: TaskId) -> bool {
        let deps = self
            .data
            .dependencies
            .get_or_insert_with(|| Box::new(DependencyData::default()));
        deps.children.insert(task)
    }

    pub fn remove_child(&mut self, task: &TaskId) -> bool {
        self.data
            .dependencies
            .as_mut()
            .map(|deps| deps.children.remove(task))
            .unwrap_or(false)
    }

    pub fn contains_child(&self, task: &TaskId) -> bool {
        self.data
            .dependencies
            .as_ref()
            .map(|deps| deps.children.contains(task))
            .unwrap_or(false)
    }

    pub fn iter_children(&self) -> Box<dyn Iterator<Item = TaskId> + '_> {
        match &self.data.dependencies {
            Some(deps) => Box::new(deps.children.iter().copied()),
            None => Box::new(std::iter::empty()),
        }
    }

    // === UPPER (counter_map, data category, lazy) ===

    pub fn get_upper(&self, task: TaskId) -> Option<u32> {
        self.data.aggregation.as_ref()?.upper.get(&task)
    }

    /// Update upper count and return whether it crossed zero boundary
    pub fn update_upper_count(&mut self, task: TaskId, delta: i32) -> bool {
        let agg = self
            .data
            .aggregation
            .get_or_insert_with(|| Box::new(AggregationData::default()));
        // Note: CounterMap<TaskId, u32> but we pass i32 delta
        // This is intentional - negative deltas are subtracted
        if delta >= 0 {
            agg.upper.update_count(task, delta as u32)
        } else {
            // For negative delta, we need custom logic
            let old = agg.upper.get(&task).unwrap_or(0);
            let new_val = old.saturating_sub((-delta) as u32);
            let crossed = (old > 0 && new_val == 0) || (old == 0 && new_val > 0);
            if new_val == 0 {
                agg.upper.remove(&task);
            } else {
                agg.upper.insert(task, new_val);
            }
            crossed
        }
    }

    pub fn remove_upper(&mut self, task: TaskId) -> Option<u32> {
        self.data.aggregation.as_mut()?.upper.remove(&task)
    }

    pub fn iter_uppers(&self) -> Box<dyn Iterator<Item = (TaskId, u32)> + '_> {
        match &self.data.aggregation {
            Some(agg) => Box::new(agg.upper.iter().map(|(k, v)| (*k, v))),
            None => Box::new(std::iter::empty()),
        }
    }

    // === FOLLOWERS (counter_map, data category, lazy) ===

    pub fn get_follower(&self, task: TaskId) -> Option<u32> {
        self.data.aggregation.as_ref()?.followers.get(&task)
    }

    pub fn update_follower_count(&mut self, task: TaskId, delta: i32) -> bool {
        let agg = self
            .data
            .aggregation
            .get_or_insert_with(|| Box::new(AggregationData::default()));
        if delta >= 0 {
            agg.followers.update_count(task, delta as u32)
        } else {
            let old = agg.followers.get(&task).unwrap_or(0);
            let new_val = old.saturating_sub((-delta) as u32);
            let crossed = (old > 0 && new_val == 0) || (old == 0 && new_val > 0);
            if new_val == 0 {
                agg.followers.remove(&task);
            } else {
                agg.followers.insert(task, new_val);
            }
            crossed
        }
    }

    pub fn iter_followers(&self) -> Box<dyn Iterator<Item = (TaskId, u32)> + '_> {
        match &self.data.aggregation {
            Some(agg) => Box::new(agg.followers.iter().map(|(k, v)| (*k, v))),
            None => Box::new(std::iter::empty()),
        }
    }

    // === CELLS (indexed_vec, data category, lazy) ===

    pub fn get_cell(&self, cell: CellId) -> Option<&TypedSharedReference> {
        self.data.cells.as_ref()?.cells.get(&cell)
    }

    pub fn insert_cell(
        &mut self,
        cell: CellId,
        value: TypedSharedReference,
    ) -> Option<TypedSharedReference> {
        let cells = self
            .data
            .cells
            .get_or_insert_with(|| Box::new(CellData::default()));
        cells.cells.insert(cell, value)
    }

    pub fn remove_cell(&mut self, cell: CellId) -> Option<TypedSharedReference> {
        self.data.cells.as_mut()?.cells.remove(&cell)
    }

    pub fn iter_cells(&self) -> Box<dyn Iterator<Item = (CellId, &TypedSharedReference)> + '_> {
        match &self.data.cells {
            Some(cells) => Box::new(cells.cells.iter().map(|(idx, typed_ref)| {
                let cell = CellId {
                    type_id: typed_ref.type_id,
                    index: idx as u32,
                };
                (cell, typed_ref)
            })),
            None => Box::new(std::iter::empty()),
        }
    }

    // === AGGREGATION_NUMBER (direct, meta category) ===

    pub fn get_aggregation_number(&self) -> Option<&AggregationNumber> {
        self.meta.aggregation_number.as_ref()
    }

    pub fn set_aggregation_number(&mut self, value: AggregationNumber) {
        self.meta.aggregation_number = Some(value);
    }

    pub fn take_aggregation_number(&mut self) -> Option<AggregationNumber> {
        self.meta.aggregation_number.take()
    }

    // === DIRTY (direct, meta category) ===

    pub fn get_dirty(&self) -> Option<Dirtyness> {
        self.meta.dirty
    }

    pub fn set_dirty(&mut self, value: Option<Dirtyness>) {
        self.meta.dirty = value;
    }

    // === Memory statistics ===

    /// Calculate approximate memory usage
    pub fn memory_usage(&self) -> MemoryStats {
        let mut stats = MemoryStats::default();

        // Data fields
        stats.output_bytes = std::mem::size_of::<Option<OutputValue>>();

        if let Some(deps) = &self.data.dependencies {
            stats.dependencies_bytes = std::mem::size_of::<DependencyData>()
                + deps.output_dependencies.len() * std::mem::size_of::<TaskId>()
                + deps.children.len() * std::mem::size_of::<TaskId>();
            stats.dependency_count = deps.output_dependencies.len() + deps.children.len();
        }

        if let Some(agg) = &self.data.aggregation {
            stats.aggregation_bytes = std::mem::size_of::<AggregationData>()
                + agg.upper.len() * (std::mem::size_of::<TaskId>() + std::mem::size_of::<u32>())
                + agg.followers.len()
                    * (std::mem::size_of::<TaskId>() + std::mem::size_of::<u32>());
            stats.aggregation_count = agg.upper.len() + agg.followers.len();
        }

        if let Some(cells) = &self.data.cells {
            let cell_overhead = cells
                .cells
                .max_allocated_index()
                .map(|max| max + 1)
                .unwrap_or(0)
                * std::mem::size_of::<Option<TypedSharedReference>>();
            let cell_data = cells.cells.len() * std::mem::size_of::<TypedSharedReference>();
            stats.cell_bytes = cell_overhead + cell_data;
            stats.cell_count = cells.cells.len();
            stats.cell_density = cells.cells.density();
        }

        // Meta fields
        stats.meta_bytes = std::mem::size_of::<TaskMetaPrototype>();

        stats
    }
}

#[derive(Debug, Default, Clone, Copy)]
pub struct MemoryStats {
    pub output_bytes: usize,
    pub dependencies_bytes: usize,
    pub aggregation_bytes: usize,
    pub cell_bytes: usize,
    pub meta_bytes: usize,
    pub dependency_count: usize,
    pub aggregation_count: usize,
    pub cell_count: usize,
    pub cell_density: f32,
}

impl MemoryStats {
    pub fn total_bytes(&self) -> usize {
        self.output_bytes
            + self.dependencies_bytes
            + self.aggregation_bytes
            + self.cell_bytes
            + self.meta_bytes
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_operations() {
        let mut storage = InnerStoragePrototype::new();

        // Set output
        storage.set_output(OutputValue::Output(unsafe { TaskId::new_unchecked(42) }));
        assert!(storage.get_output().is_some());

        // Add dependencies
        let dep1 = unsafe { TaskId::new_unchecked(1) };
        let dep2 = unsafe { TaskId::new_unchecked(2) };

        assert!(storage.add_output_dependency(dep1));
        assert!(!storage.add_output_dependency(dep1)); // Duplicate
        assert!(storage.add_output_dependency(dep2));

        assert_eq!(storage.output_dependencies_count(), 2);
        assert!(storage.contains_output_dependency(&dep1));
        assert!(storage.contains_output_dependency(&dep2));

        // Remove dependency
        assert!(storage.remove_output_dependency(&dep1));
        assert!(!storage.remove_output_dependency(&dep1)); // Already removed
        assert_eq!(storage.output_dependencies_count(), 1);
    }

    #[test]
    fn test_counter_operations() {
        let mut storage = InnerStoragePrototype::new();

        let task1 = unsafe { TaskId::new_unchecked(1) };
        let task2 = unsafe { TaskId::new_unchecked(2) };

        // First increment crosses zero
        assert!(storage.update_upper_count(task1, 1));
        assert_eq!(storage.get_upper(task1), Some(1));

        // Regular increment doesn't cross
        assert!(!storage.update_upper_count(task1, 1));
        assert_eq!(storage.get_upper(task1), Some(2));

        // Decrement back to zero
        assert!(!storage.update_upper_count(task1, -1));
        assert!(storage.update_upper_count(task1, -1)); // Crosses to zero
        assert_eq!(storage.get_upper(task1), None); // Auto-removed

        // Multiple tasks
        storage.update_upper_count(task1, 5);
        storage.update_upper_count(task2, 3);

        let uppers: Vec<_> = storage.iter_uppers().collect();
        assert_eq!(uppers.len(), 2);
    }

    // Note: Cell tests are skipped because creating TypedSharedReference in tests
    // requires triomphe::Arc which is not a direct dependency of this crate.
    // The IndexedVec type itself is tested in storage_types.rs
    // #[test]
    // fn test_indexed_vec_cells() {
    //     // Test omitted - would need triomphe dependency for TypedSharedReference
    // }

    #[test]
    fn test_lazy_allocation() {
        let storage = InnerStoragePrototype::new();

        // Initially, lazy boxes should be None
        assert!(storage.data.dependencies.is_none());
        assert!(storage.data.aggregation.is_none());
        assert!(storage.data.cells.is_none());

        let stats = storage.memory_usage();
        println!("Empty storage: {} bytes", stats.total_bytes());

        // After adding dependencies
        let mut storage = storage;
        storage.add_output_dependency(unsafe { TaskId::new_unchecked(1) });
        assert!(storage.data.dependencies.is_some());

        let stats = storage.memory_usage();
        println!(
            "With 1 dependency: {} bytes (deps: {} bytes)",
            stats.total_bytes(),
            stats.dependencies_bytes
        );
    }

    #[test]
    fn test_serialization() {
        let mut storage = InnerStoragePrototype::new();

        // Add some data
        storage.set_output(OutputValue::Output(unsafe { TaskId::new_unchecked(100) }));

        storage.add_output_dependency(unsafe { TaskId::new_unchecked(1) });
        storage.add_output_dependency(unsafe { TaskId::new_unchecked(2) });

        storage.update_upper_count(unsafe { TaskId::new_unchecked(10) }, 5);

        // Serialize
        let encoded = bincode::encode_to_vec(&storage.data, bincode::config::standard()).unwrap();
        println!("Serialized size: {} bytes", encoded.len());

        // Deserialize
        let (decoded, _): (TaskDataPrototype, _) =
            bincode::decode_from_slice(&encoded, bincode::config::standard()).unwrap();

        // Verify
        assert!(decoded.output.is_some());
        assert_eq!(
            decoded
                .dependencies
                .as_ref()
                .unwrap()
                .output_dependencies
                .len(),
            2
        );
        assert_eq!(
            decoded
                .aggregation
                .as_ref()
                .unwrap()
                .upper
                .get(&unsafe { TaskId::new_unchecked(10) }),
            Some(5)
        );
    }

    #[test]
    fn test_memory_efficiency() {
        let mut storage = InnerStoragePrototype::new();

        // Scenario 1: Task with just output (most common)
        storage.set_output(OutputValue::Output(unsafe { TaskId::new_unchecked(1) }));

        let stats1 = storage.memory_usage();
        println!("Task with output only: {} bytes", stats1.total_bytes());

        // Scenario 2: Add 10 dependencies
        for i in 1..=10 {
            storage.add_output_dependency(unsafe { TaskId::new_unchecked(i) });
        }

        let stats2 = storage.memory_usage();
        println!(
            "Task with output + 10 deps: {} bytes (+{} bytes)",
            stats2.total_bytes(),
            stats2.total_bytes() - stats1.total_bytes()
        );

        // Scenario 3: Add aggregation data
        for i in 20..=25 {
            storage.update_upper_count(unsafe { TaskId::new_unchecked(i) }, 1);
        }

        let stats3 = storage.memory_usage();
        println!(
            "Task with output + deps + aggregation: {} bytes (+{} bytes)",
            stats3.total_bytes(),
            stats3.total_bytes() - stats2.total_bytes()
        );
    }
}
