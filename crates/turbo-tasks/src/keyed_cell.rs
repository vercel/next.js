use anyhow::Result;

use crate::{
    self as turbo_tasks, macro_helpers::find_cell_by_type, manager::current_task,
    ConcreteTaskInput, CurrentCellRef, RawVc, TaskId, TaskInput, ValueTypeId, Vc, VcValueType,
};

#[turbo_tasks::value]
struct KeyedCell {
    cell: RawVc,
    #[turbo_tasks(trace_ignore, debug_ignore)]
    cell_ref: CurrentCellRef,
}

#[turbo_tasks::value_impl]
impl KeyedCell {
    #[turbo_tasks::function]
    fn new_local(_task: TaskId, _key: ConcreteTaskInput, value_type_id: ValueTypeId) -> Vc<Self> {
        let cell_ref = find_cell_by_type(value_type_id);
        KeyedCell {
            cell: cell_ref.into(),
            cell_ref,
        }
        .cell()
    }

    #[turbo_tasks::function]
    fn new_global(_key: ConcreteTaskInput, value_type_id: ValueTypeId) -> Vc<Self> {
        let cell_ref = find_cell_by_type(value_type_id);
        KeyedCell {
            cell: cell_ref.into(),
            cell_ref,
        }
        .cell()
    }
}

/// Cells a value in a cell with a given key. A key MUST only be used once per
/// function.
///
/// Usually calling [Vc::cell] will create cells for a give type based on the
/// call order of [Vc::cell]. But this can yield to over-invalidation when the
/// number of cells changes. e. g. not doing the first [Vc::cell] call will move
/// all remaining values into different cells, causing invalidation of all of
/// them.
///
/// A keyed cell avoids this problem by not using call order, but a key instead.
///
/// Internally it creates a new Task based on the key and cells the value into
/// that task. This is a implementation detail and might change in the future.
pub async fn keyed_cell<T: PartialEq + Eq + VcValueType, K: TaskInput>(
    key: K,
    content: T,
) -> Result<Vc<T>> {
    let cell = KeyedCell::new_local(
        current_task("keyed_cell"),
        key.into_concrete(),
        T::get_value_type_id(),
    )
    .await?;
    cell.cell_ref.compare_and_update_shared(content);
    Ok(cell.cell.into())
}

/// Cells a value in a cell with a given key. A key MUST only be used once for
/// the whole application.
///
/// This allows to create singleton Vcs for values while avoiding to pass the
/// whole value as argument and creating a large task key.
pub async fn global_keyed_cell<T: PartialEq + Eq + VcValueType, K: TaskInput>(
    key: K,
    content: T,
) -> Result<Vc<T>> {
    let cell = KeyedCell::new_global(key.into_concrete(), T::get_value_type_id()).await?;
    cell.cell_ref.compare_and_update_shared(content);
    Ok(cell.cell.into())
}
