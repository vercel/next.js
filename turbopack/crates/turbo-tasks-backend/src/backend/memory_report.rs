use rustc_hash::FxHashMap;
use serde::Serialize;
use turbo_bincode::{TurboBincodeBuffer, TurboBincodeEncode, new_turbo_bincode_encoder};
use turbo_tasks::{ValueTypeId, registry};
use turbo_tasks_malloc::TurboMalloc;

use crate::backend::{SpecificTaskDataCategory, storage::Storage, storage_schema::TaskStorage};

#[derive(Debug, Serialize)]
pub struct MemoryReport {
    pub version: u32,
    pub tasks: TaskStats,
    pub cells: CellStats,
    pub allocator: AllocatorStats,
}

#[derive(Debug, Serialize)]
pub struct TaskStats {
    pub total_count: u64,
    pub total_estimated_size_bytes: u64,
    pub by_function: Vec<FunctionTaskStats>,
}

#[derive(Debug, Serialize)]
pub struct FunctionTaskStats {
    pub function: &'static str,
    pub count: u64,
    pub estimated_size_bytes: u64,
}

#[derive(Debug, Serialize)]
pub struct CellStats {
    pub total_count: u64,
    pub total_estimated_size_bytes: u64,
    pub by_type: Vec<TypeCellStats>,
}

#[derive(Debug, Serialize)]
pub struct TypeCellStats {
    #[serde(rename = "type")]
    pub type_name: &'static str,
    pub count: u64,
    /// Sum of bincode-encoded sizes for persistent cell types.
    /// `None` for transient cell types (size data unavailable).
    pub estimated_size_bytes: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct AllocatorStats {
    pub allocated_bytes: u64,
}

/// Accumulator for per-function task stats during collection.
#[derive(Default)]
struct TaskGroupAccum {
    count: u64,
    estimated_size_bytes: u64,
}

/// Accumulator for per-type cell stats during collection.
struct CellGroupAccum {
    type_name: &'static str,
    count: u64,
    estimated_size_bytes: Option<u64>,
}

/// Estimate the bincode-encoded size of a value by encoding into a reusable
/// scratch buffer. Returns 0 if encoding fails.
fn estimate_encoded_size(
    scratch: &mut TurboBincodeBuffer,
    encode: impl FnOnce(
        &mut turbo_bincode::TurboBincodeEncoder<'_>,
    ) -> Result<(), bincode::error::EncodeError>,
) -> u64 {
    scratch.clear();
    let mut encoder = new_turbo_bincode_encoder(scratch);
    if encode(&mut encoder).is_ok() {
        scratch.len() as u64
    } else {
        0
    }
}

/// Estimate the bincode-encoded size of a TaskStorage.
fn estimate_task_size(task: &TaskStorage, scratch: &mut TurboBincodeBuffer) -> u64 {
    estimate_encoded_size(scratch, |encoder| {
        task.encode(SpecificTaskDataCategory::Meta, encoder)?;
        task.encode(SpecificTaskDataCategory::Data, encoder)?;
        Ok(())
    })
}

/// Collect a memory report by iterating the task storage.
///
/// This iterates all in-memory tasks and cells, grouping by function name
/// and value type respectively. Size estimation uses bincode
/// encode-and-discard with a reusable scratch buffer.
///
/// This is not fast and could be parallelized, but as an on demand tool that might be fine.
pub fn collect_memory_report(storage: &Storage) -> MemoryReport {
    // Accumulate task stats grouped by function name
    let mut task_groups: FxHashMap<&'static str, TaskGroupAccum> = FxHashMap::default();
    // Accumulate cell stats grouped by value type
    let mut cell_groups: FxHashMap<ValueTypeId, CellGroupAccum> = FxHashMap::default();

    let mut total_task_count: u64 = 0;
    let mut total_task_size: u64 = 0;
    let mut total_cell_count: u64 = 0;
    let mut total_cell_size: u64 = 0;

    // Reusable scratch buffer for size estimation (avoids per-task allocation)
    let mut scratch = TurboBincodeBuffer::new();

    for entry in storage.iter_all() {
        total_task_count += 1;

        // Determine function name from the cached task type
        let function_name: &'static str = if let Some(task_type) = entry.get_persistent_task_type()
        {
            task_type.get_name()
        } else {
            "(transient)"
        };

        // Estimate task size via encode-and-discard
        let task_size = estimate_task_size(&entry, &mut scratch);
        total_task_size += task_size;

        let group = task_groups.entry(function_name).or_default();
        group.count += 1;
        group.estimated_size_bytes += task_size;

        // Count and estimate sizes for persistent cells by value type
        for (cell_id, data) in entry.iter_persistent_cells() {
            total_cell_count += 1;
            let cell_size = estimate_encoded_size(&mut scratch, |encoder| data.encode(encoder));
            let type_entry = cell_groups.entry(cell_id.type_id).or_insert_with(|| {
                let vt = registry::get_value_type(cell_id.type_id);
                CellGroupAccum {
                    type_name: vt.name,
                    count: 0,
                    estimated_size_bytes: Some(0),
                }
            });
            total_cell_size += cell_size;
            type_entry.count += 1;
            *type_entry.estimated_size_bytes.as_mut().unwrap() += cell_size;
        }

        // Count transient cells (no size data available)
        for cell_id in entry.iter_transient_cells() {
            total_cell_count += 1;
            let type_entry = cell_groups.entry(cell_id.type_id).or_insert_with(|| {
                let vt = registry::get_value_type(cell_id.type_id);
                CellGroupAccum {
                    type_name: vt.name,
                    count: 0,
                    estimated_size_bytes: None,
                }
            });
            type_entry.count += 1;
        }
    }

    // Build sorted task stats (by estimated_size_bytes, descending)
    let mut by_function: Vec<FunctionTaskStats> = task_groups
        .into_iter()
        .map(|(function, accum)| FunctionTaskStats {
            function,
            count: accum.count,
            estimated_size_bytes: accum.estimated_size_bytes,
        })
        .collect();
    by_function.sort_unstable_by_key(|a| std::cmp::Reverse(a.estimated_size_bytes));

    // Build sorted cell stats (by estimated_size_bytes, descending)
    let mut by_type: Vec<TypeCellStats> = cell_groups
        .into_iter()
        .map(|(_, accum)| TypeCellStats {
            type_name: accum.type_name,
            count: accum.count,
            estimated_size_bytes: accum.estimated_size_bytes,
        })
        .collect();
    by_type.sort_unstable_by_key(|a| std::cmp::Reverse(a.estimated_size_bytes));

    let allocator = collect_allocator_stats();

    MemoryReport {
        version: 1,
        tasks: TaskStats {
            total_count: total_task_count,
            total_estimated_size_bytes: total_task_size,
            by_function,
        },
        cells: CellStats {
            total_count: total_cell_count,
            total_estimated_size_bytes: total_cell_size,
            by_type,
        },
        allocator,
    }
}

fn collect_allocator_stats() -> AllocatorStats {
    AllocatorStats {
        allocated_bytes: TurboMalloc::memory_usage() as u64,
    }
}
