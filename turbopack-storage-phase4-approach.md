# Phase 4: DynamicStorage Compatibility Layer - Detailed Approach

## Overview

Phase 4 bridges the gap between the new macro-generated storage system and the existing `CachedDataItem` API used throughout the codebase. This allows incremental migration without breaking existing code.

## Current State Analysis

### Existing Architecture

**InnerStorage (Current):**

```rust
pub struct InnerStorage {
    // 4 specialized hot-path fields
    aggregation_number: OptionStorage<AggregationNumber>,
    output_dependent: AutoMapStorage<TaskId, ()>,
    output: OptionStorage<OutputValue>,
    upper: AutoMapStorage<TaskId, u32>,

    // Dynamic storage for 40+ other CachedDataItem types
    dynamic: DynamicStorage,

    state: InnerStorageState,
}
```

**CachedDataItem enum (40+ variants):**

- Output, Collectible, Dirty, CurrentSessionClean
- Child, CellData, TransientCellData, CellTypeMaxIndex
- OutputDependency, CellDependency, CollectiblesDependency
- OutputDependent, CellDependent, CollectiblesDependent
- AggregationNumber, Follower, Upper
- ... and many more

**Current Access Pattern:**

```rust
impl InnerStorage {
    pub fn insert(&mut self, item: CachedDataItem) -> Option<CachedDataItemValue> {
        // Macro dispatches to specialized fields OR dynamic storage
        match item {
            CachedDataItem::Output { value } => self.output.insert((), value),
            CachedDataItem::Upper { task, value } => self.upper.insert(task, value),
            _ => self.dynamic.insert(item)  // Everything else goes to DynamicStorage
        }
    }

    pub fn get(&self, key: &CachedDataItemKey) -> Option<CachedDataItemValueRef<'_>> {
        // Similar dispatch pattern
    }
}
```

### Macro-Generated Storage (Phase 1-3)

**TaskStorage Schema:**

```rust
#[derive(TaskStorage)]
pub struct TaskStorageSchema {
    #[task_storage(storage = "direct", category = "meta", specialized)]
    pub aggregation_number: Option<AggregationNumber>,

    #[task_storage(storage = "auto_set", category = "data", specialized)]
    pub output_dependent: AutoSet<TaskId>,

    // ... 40+ more fields in various groups
}
```

**Generated InnerStorage:**

```rust
pub struct InnerStorage {
    pub data: TaskData,
    pub meta: TaskMeta,
    state: InnerStorageState,
}

pub struct TaskData {
    // Specialized fields first
    pub output_dependent: AutoSet<TaskId>,
    pub output: Option<OutputValue>,
    pub upper: CounterMap<TaskId, u32>,

    // Grouped fields
    pub dependencies: Option<Box<DependenciesDataGroup>>,
    pub aggregation: Option<Box<AggregationDataGroup>>,
}
```

**Generated Accessors:**

```rust
impl InnerStorage {
    pub fn get_output(&self) -> &Option<OutputValue>
    pub fn set_output(&mut self, value: Option<OutputValue>)
    pub fn output_dependent_mut(&mut self) -> &mut AutoSet<TaskId>
    // ... specific accessors for each field
}
```

## The Challenge

**Problem**: Existing code expects `CachedDataItem` API, but macro generates typed accessors.

**Current Code (100+ locations):**

```rust
storage.insert(CachedDataItem::Output { value });
storage.get(&CachedDataItemKey::Output);
storage.remove(&CachedDataItemKey::Upper { task });
```

**Macro-Generated API:**

```rust
storage.set_output(Some(value));
storage.get_output();
storage.upper_mut().remove(&task);
```

**Migration Constraint**: Cannot rewrite all call sites at once (too risky, too large).

## Phase 4 Solution: Bridge Trait Pattern

### Core Idea

Create a **bridge trait** that provides the old `CachedDataItem` API on top of the new macro-generated storage. This allows:

1. **Zero code changes** to existing call sites initially
2. **Incremental migration** module by module
3. **Type safety** maintained throughout
4. **Performance parity** with current implementation
5. **Clear migration path** to remove bridge eventually

### Implementation Strategy

#### Step 1: Define Bridge Trait (Week 1, Days 1-2)

```rust
// In backend/storage_bridge.rs

/// Bridge trait providing CachedDataItem compatibility for macro-generated storage
pub trait CachedDataItemBridge {
    fn insert_item(&mut self, item: CachedDataItem) -> Option<CachedDataItemValue>;
    fn remove_item(&mut self, key: &CachedDataItemKey) -> Option<CachedDataItemValue>;
    fn get_item(&self, key: &CachedDataItemKey) -> Option<CachedDataItemValueRef<'_>>;
    fn get_item_mut(&mut self, key: &CachedDataItemKey) -> Option<CachedDataItemValueRefMut<'_>>;
    fn update_item(&mut self, key: &CachedDataItemKey, update: impl FnOnce(Option<CachedDataItemValue>) -> Option<CachedDataItemValue>);
    fn has_item(&self, key: &CachedDataItemKey) -> bool;
    fn iter_items(&self, ty: CachedDataItemType) -> Box<dyn Iterator<Item = CachedDataItem> + '_>;
}
```

#### Step 2: Generate Bridge Implementation via Macro (Week 1, Days 3-5)

**Extend TaskStorage macro** to generate bridge implementation:

```rust
// In task_storage_macro.rs

fn generate_bridge_impl(grouped_fields: &GroupedFields) -> TokenStream {
    quote! {
        impl CachedDataItemBridge for InnerStorage {
            fn insert_item(&mut self, item: CachedDataItem) -> Option<CachedDataItemValue> {
                use CachedDataItem::*;
                match item {
                    // Specialized fields - direct mapping
                    Output { value } => {
                        let old = self.get_output().clone();
                        self.set_output(Some(value.clone()));
                        self.state.set_data_modified(true);
                        old.map(|v| CachedDataItemValue::Output { value: v })
                    }

                    Upper { task, value } => {
                        let old = self.upper_mut().insert(task, value);
                        self.state.set_data_modified(true);
                        old.map(|v| CachedDataItemValue::Upper { value: v })
                    }

                    OutputDependency { target, value } => {
                        let deps = self.output_dependencies_mut();
                        let had = deps.insert(target);
                        self.state.set_data_modified(true);
                        if had {
                            Some(CachedDataItemValue::OutputDependency { value: () })
                        } else {
                            None
                        }
                    }

                    // ... generate for all 40+ CachedDataItem variants

                    // Fallback: items not yet migrated go to dynamic storage
                    _ => self.dynamic.insert(item)
                }
            }

            fn get_item(&self, key: &CachedDataItemKey) -> Option<CachedDataItemValueRef<'_>> {
                use CachedDataItemKey::*;
                match key {
                    Output => {
                        self.get_output().as_ref().map(|v| {
                            CachedDataItemValueRef::Output { value: v }
                        })
                    }

                    Upper { task } => {
                        self.upper.get(task).map(|v| {
                            CachedDataItemValueRef::Upper { value: v }
                        })
                    }

                    // ... similar for all variants

                    _ => self.dynamic.get(key)
                }
            }

            // Similar implementations for remove_item, get_item_mut, update_item
        }
    }
}
```

**Macro annotation for mapping:**

```rust
#[task_storage(
    storage = "auto_set",
    category = "data",
    group = "dependencies",
    lazy,
    cached_data_item = "OutputDependency"  // NEW: maps to CachedDataItem variant
)]
pub output_dependencies: AutoSet<TaskId>,
```

#### Step 3: Maintain DynamicStorage for Unmigrated Fields (Week 1)

Keep `dynamic: DynamicStorage` field in generated code for fields not yet in the schema:

```rust
impl InnerStorage {
    // Generated by macro
    pub data: TaskData,
    pub meta: TaskMeta,
    state: InnerStorageState,

    // Added by macro when bridge feature is enabled
    dynamic: DynamicStorage,
}
```

Bridge implementation falls back to dynamic for unmigrated items:

```rust
match item {
    // Migrated items...
    Output { value } => /* use typed accessor */,

    // NOT YET MIGRATED - use DynamicStorage
    _ => self.dynamic.insert(item)
}
```

#### Step 4: Incremental Schema Migration (Weeks 2-8)

**Migration Process per CachedDataItem variant:**

1. **Add to schema** with bridge annotation:

   ```rust
   #[task_storage(
       storage = "auto_set",
       category = "data",
       group = "dependencies",
       cached_data_item = "CellDependency"
   )]
   pub cell_dependencies: AutoSet<CellRef>,
   ```

2. **Macro generates** bridge mapping automatically
3. **Test** that CachedDataItem API still works
4. **(Optional) Migrate call sites** to use typed accessors
5. **Repeat** for next variant

**Migration Order (by usage frequency):**

Priority 1 (Weeks 2-3): Hot path items

- Output, OutputDependency, OutputDependent (already specialized)
- Upper, AggregationNumber (already specialized)
- Child, CellData, Dirty

Priority 2 (Weeks 4-5): Medium frequency

- Collectible, CellDependency, CollectiblesDependency
- Follower, CellDependent, CollectiblesDependent

Priority 3 (Weeks 6-7): Low frequency

- CellTypeMaxIndex, CurrentSessionClean
- ActivenessState, RootState
- (Other infrequent variants)

Priority 4 (Week 8): Transient variants

- TransientCellData
- (Handle special cases)

#### Step 5: Remove Bridge & DynamicStorage (Weeks 9-10)

Once all CachedDataItem variants are in schema:

1. **Remove bridge trait** usage from call sites (can do incrementally)
2. **Remove `dynamic: DynamicStorage`** field from generated code
3. **Remove bridge generation** from macro
4. **Update tests** to use typed accessors
5. **Performance verification** - ensure no regression

## Testing Strategy

### Phase 4.1: Bridge Trait Tests (Week 1)

```rust
#[test]
fn test_bridge_insert() {
    let mut storage = InnerStorage::new();

    // Old API still works
    storage.insert_item(CachedDataItem::Output { value });

    // New API also works
    storage.set_output(Some(value));

    // Both give same result
    assert_eq!(storage.get_output(), &Some(value));
}

#[test]
fn test_bridge_modification_tracking() {
    let mut storage = InnerStorage::new();

    storage.insert_item(CachedDataItem::Output { value });
    assert!(storage.state().data_modified());

    storage.insert_item(CachedDataItem::Dirty { value });
    assert!(storage.state().meta_modified());
}
```

### Phase 4.2: Incremental Migration Tests (Weeks 2-8)

For each migrated variant:

```rust
#[test]
fn test_cell_dependency_migration() {
    let mut storage = InnerStorage::new();

    // CachedDataItem API
    storage.insert_item(CachedDataItem::CellDependency { target, value: () });
    assert!(storage.get_item(&CachedDataItemKey::CellDependency { target }).is_some());

    // Typed accessor API
    assert!(storage.cell_dependencies_mut().contains(&target));

    // Both work together
    storage.cell_dependencies_mut().insert(target2);
    assert!(storage.get_item(&CachedDataItemKey::CellDependency { target: target2 }).is_some());
}
```

### Phase 4.3: Integration Tests (Weeks 2-10)

Run full backend test suite after each variant migration:

```bash
cargo test -p turbo-tasks-backend
```

Ensure no regressions in:

- Task execution
- Dependency tracking
- Aggregation graph
- Cell storage
- Snapshot/restore

## Macro Extensions Required

### Add `cached_data_item` Attribute

```rust
struct StorageFieldAttributes {
    field_name: Ident,
    field_type: Type,
    storage_type: StorageType,
    category: Category,
    group: Option<String>,
    lazy: bool,
    specialized: bool,
    cached_data_item: Option<String>,  // NEW: "OutputDependency", "CellData", etc.
}
```

### Generate Bridge Mapping Table

Create compile-time mapping from CachedDataItem → field accessor:

```rust
// Generated by macro
const BRIDGE_MAPPINGS: &[(CachedDataItemType, &str)] = &[
    (CachedDataItemType::Output, "output"),
    (CachedDataItemType::Upper, "upper"),
    (CachedDataItemType::OutputDependency, "output_dependencies"),
    // ... all mapped variants
];
```

### Generate Bridge Implementation Methods

For each field with `cached_data_item` annotation, generate:

- Insert handler
- Get handler
- Get mut handler
- Remove handler
- Update handler
- Iterator handler

## Migration Path Examples

### Example 1: Simple Direct Field

**Before (using bridge):**

```rust
storage.insert(CachedDataItem::Dirty { value: Dirtyness::Dirty });
let dirty = storage.get(&CachedDataItemKey::Dirty);
```

**After (using typed accessor):**

```rust
storage.set_dirty(Some(Dirtyness::Dirty));
let dirty = storage.get_dirty();
```

### Example 2: Collection Field

**Before (using bridge):**

```rust
storage.insert(CachedDataItem::Child { task, value: () });
let has_child = storage.has(&CachedDataItemKey::Child { task });
storage.remove(&CachedDataItemKey::Child { task });
```

**After (using typed accessor):**

```rust
storage.children_mut().insert(task);
let has_child = storage.children().contains(&task);
storage.children_mut().remove(&task);
```

### Example 3: Counter Field

**Before (using bridge):**

```rust
storage.update(&CachedDataItemKey::Upper { task }, |old| {
    Some(CachedDataItemValue::Upper {
        value: old.map(|v| v.value + delta).unwrap_or(delta)
    })
});
```

**After (using typed accessor):**

```rust
let map = storage.upper_mut();
map.increment(task, delta);  // Auto-removes on zero
```

## Performance Considerations

### Bridge Overhead

**Match Statement Cost:**

- 40+ branch match → ~10-20ns overhead per operation
- Acceptable for migration phase
- Removed in final phase

**Memory Overhead:**

- DynamicStorage remains during migration
- ~24 bytes (Vec overhead)
- Freed when migration complete

### Optimization: Inline Bridge Methods

```rust
#[inline(always)]
fn insert_item(&mut self, item: CachedDataItem) -> Option<CachedDataItemValue> {
    // Match gets optimized to jump table
    match item {
        // Each branch inlines to direct field access
    }
}
```

Compiler should optimize bridge away completely when inlined.

## Risk Mitigation

### Risk 1: Bridge Implementation Bugs

**Mitigation:**

- Comprehensive test suite for each variant
- Dual-API validation tests (both APIs must agree)
- Run full backend test suite continuously

### Risk 2: Performance Regression

**Mitigation:**

- Benchmark before/after each migration step
- Profile hot paths (task execution, dependency tracking)
- Compare with baseline (current main branch)

### Risk 3: Incomplete Migration

**Mitigation:**

- Track progress: 0/43 variants migrated
- Compiler errors if dynamic fallback accessed after removal
- Clear documentation of remaining work

### Risk 4: Breaking Changes

**Mitigation:**

- Bridge maintains 100% API compatibility
- No behavioral changes during bridge phase
- Explicit opt-in to new API
- Deprecation warnings guide migration

## Success Criteria

### Phase 4 Complete When:

1. ✅ All 40+ CachedDataItem variants in schema
2. ✅ Bridge trait implementation generated by macro
3. ✅ All backend tests pass with bridge
4. ✅ No performance regression (<5% overhead acceptable)
5. ✅ Clear migration guide for each call site
6. ✅ At least 3 modules migrated to typed accessors (proof of concept)

### Phase 4.5 (Optional): Complete Migration

- All call sites use typed accessors
- Bridge trait removed
- DynamicStorage removed
- Documentation updated

## Timeline

**Week 1:** Bridge trait + initial implementation
**Weeks 2-3:** Migrate hot path items (Priority 1)
**Weeks 4-5:** Migrate medium frequency items (Priority 2)
**Weeks 6-7:** Migrate low frequency items (Priority 3)
**Week 8:** Handle special cases (Priority 4)
**Weeks 9-10:** Remove bridge (optional, can defer)

**Total: 8-10 weeks (2-2.5 months)**

## Next Steps

Once you approve this approach:

1. Extend macro to parse `cached_data_item` attribute
2. Create `storage_bridge.rs` with trait definition
3. Implement bridge generation in macro
4. Add first few mappings as proof of concept
5. Write comprehensive bridge tests
6. Begin incremental migration

This approach allows us to move forward without breaking anything while maintaining a clear path to full migration.
