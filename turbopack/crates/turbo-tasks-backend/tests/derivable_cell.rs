//! Verifies that `#[turbo_tasks::value(serialization = "...")]` maps to the
//! right [`ValueTypePersistence`] variant:
//!
//! - `"derivable"` / `"hash"` → `Derivable` (evictable, no bincode).
//! - `"none"` → `SessionStateful` (not evictable, no bincode).
//! - `"auto"` / `"custom"` → `Bincodable(_, _)` (evictable, restored from disk).
//!
//! The runtime behavior (reading/writing cells of each mode) is covered
//! transitively by every other test: the storage layer routes all modes
//! through the unified `CellData` map with identical semantics. Only the
//! persistence variant (and the macro's trait impls) differs.

#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![allow(clippy::needless_return)]

use turbo_tasks::{ValueTypePersistence, VcValueType, registry};
use turbo_tasks_testing::{Registration, register};

static REGISTRATION: Registration = register!();

#[turbo_tasks::value(serialization = "derivable")]
struct DerivedSum(u32);

#[turbo_tasks::value(serialization = "none", cell = "new", eq = "manual")]
struct StickyHandle;

#[turbo_tasks::value]
struct PersistedValue(u32);

/// Trigger registration of every value type in this test file by constructing
/// a turbo_tasks instance. The global registry is populated by the
/// `#[turbo_tasks::value]` macro expansion's `register!()`-driven init.
fn ensure_registered() {
    let _ = REGISTRATION.create_turbo_tasks("derivable_cell_test", true);
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn derivable_value_type_maps_to_derivable_variant() {
    ensure_registered();

    let type_id = DerivedSum::get_value_type_id();
    let value_type = registry::get_value_type(type_id);

    assert!(
        matches!(value_type.persistence, ValueTypePersistence::Derivable),
        "Derivable serialization must map to ValueTypePersistence::Derivable"
    );
    assert!(
        !DerivedSum::has_serialization(),
        "Derivable must report has_serialization() == false"
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn none_value_type_maps_to_session_stateful_variant() {
    ensure_registered();

    let type_id = StickyHandle::get_value_type_id();
    let value_type = registry::get_value_type(type_id);

    assert!(
        matches!(
            value_type.persistence,
            ValueTypePersistence::SessionStateful
        ),
        "None serialization must map to ValueTypePersistence::SessionStateful"
    );
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn auto_value_type_maps_to_bincodable_variant() {
    ensure_registered();

    let type_id = PersistedValue::get_value_type_id();
    let value_type = registry::get_value_type(type_id);

    assert!(
        matches!(
            value_type.persistence,
            ValueTypePersistence::Bincodable(_, _)
        ),
        "Auto serialization must map to ValueTypePersistence::Bincodable"
    );
}
