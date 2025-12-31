# Phase 4: Prefactoring Approach - Migrate API First, Implementation Later

## Overview

Instead of creating a compatibility bridge, we'll **migrate the public API first** while keeping the internal implementation unchanged. This inverts the typical migration order and provides cleaner, safer migration.

## Core Concept: Prefactoring

**Traditional Approach (Bridge):**

1. Change internal implementation (macro-generated storage)
2. Add compatibility layer (bridge trait)
3. Gradually migrate call sites
4. Remove bridge

**Prefactoring Approach:**

1. Add new typed APIs that delegate to existing implementation
2. Migrate all call sites to new APIs
3. Swap internal implementation (macro-generated storage)
4. Remove old implementation

**Key Insight:** We can add typed accessor methods to the **existing** `InnerStorage` that internally use `CachedDataItem`. Once all callers use typed APIs, we swap the implementation underneath.

## Current State

### Existing InnerStorage (backend/storage.rs)

```rust
pub struct InnerStorage {
    aggregation_number: OptionStorage<AggregationNumber>,
    output_dependent: AutoMapStorage<TaskId, ()>,
    output: OptionStorage<OutputValue>,
    upper: AutoMapStorage<TaskId, u32>,
    dynamic: DynamicStorage,
    state: InnerStorageState,
}

impl InnerStorage {
    // Current generic API (used everywhere)
    pub fn insert(&mut self, item: CachedDataItem) -> Option<CachedDataItemValue>;
    pub fn get(&self, key: &CachedDataItemKey) -> Option<CachedDataItemValueRef<'_>>;
    pub fn remove(&mut self, key: &CachedDataItemKey) -> Option<CachedDataItemValue>;
    // ... etc
}
```

### Current Usage Pattern (100+ call sites)

```rust
// In backend/mod.rs and elsewhere
storage.insert(CachedDataItem::Output { value });
storage.insert(CachedDataItem::Child { task, value: () });

if let Some(output) = storage.get(&CachedDataItemKey::Output) {
    // use output
}

storage.remove(&CachedDataItemKey::Child { task });
```

## Phase 4: Prefactoring Strategy

### Step 1: Add Typed Accessor APIs (Week 1)

Add new typed methods to **existing** `InnerStorage` that delegate to current implementation:

```rust
// In backend/storage.rs - ADD these methods (don't remove old ones!)

impl InnerStorage {
    // ============ NEW TYPED APIS (Week 1) ============

    // Output field
    pub fn get_output(&self) -> Option<&OutputValue> {
        self.get(&CachedDataItemKey::Output)
            .and_then(|v| match v {
                CachedDataItemValueRef::Output { value } => Some(value),
                _ => None,
            })
    }

    pub fn set_output(&mut self, value: Option<OutputValue>) -> Option<OutputValue> {
        match value {
            Some(v) => {
                self.insert(CachedDataItem::Output { value: v })
                    .and_then(|old| match old {
                        CachedDataItemValue::Output { value } => Some(value),
                        _ => None,
                    })
            }
            None => {
                self.remove(&CachedDataItemKey::Output)
                    .and_then(|old| match old {
                        CachedDataItemValue::Output { value } => Some(value),
                        _ => None,
                    })
            }
        }
    }

    // Children (set operations)
    pub fn children(&self) -> ChildrenView<'_> {
        ChildrenView { storage: self }
    }

    pub fn children_mut(&mut self) -> ChildrenViewMut<'_> {
        ChildrenViewMut { storage: self }
    }

    // Upper (counter map operations)
    pub fn upper(&self) -> UpperView<'_> {
        UpperView { storage: self }
    }

    pub fn upper_mut(&mut self) -> UpperViewMut<'_> {
        UpperViewMut { storage: self }
    }

    // ... similar for all 40+ CachedDataItem types

    // ============ OLD GENERIC API (keep for now) ============
    pub fn insert(&mut self, item: CachedDataItem) -> Option<CachedDataItemValue> {
        // existing implementation unchanged
    }
    // ... etc
}
```

### Step 2: Create View Types for Collections (Week 1)

For collection-like fields (AutoSet, CounterMap, IndexedVec), create view types:

```rust
// In backend/storage.rs

pub struct ChildrenView<'a> {
    storage: &'a InnerStorage,
}

impl<'a> ChildrenView<'a> {
    pub fn contains(&self, task: &TaskId) -> bool {
        self.storage
            .get(&CachedDataItemKey::Child { task: *task })
            .is_some()
    }

    pub fn iter(&self) -> impl Iterator<Item = TaskId> + 'a {
        self.storage
            .iter(CachedDataItemType::Child)
            .filter_map(|item| match item {
                CachedDataItem::Child { task, .. } => Some(task),
                _ => None,
            })
    }

    pub fn len(&self) -> usize {
        self.iter().count()
    }
}

pub struct ChildrenViewMut<'a> {
    storage: &'a mut InnerStorage,
}

impl<'a> ChildrenViewMut<'a> {
    pub fn insert(&mut self, task: TaskId) -> bool {
        self.storage
            .insert(CachedDataItem::Child { task, value: () })
            .is_none()
    }

    pub fn remove(&mut self, task: &TaskId) -> bool {
        self.storage
            .remove(&CachedDataItemKey::Child { task: *task })
            .is_some()
    }

    pub fn clear(&mut self) {
        // Remove all children
        let children: Vec<_> = self.storage
            .iter(CachedDataItemType::Child)
            .filter_map(|item| match item {
                CachedDataItem::Child { task, .. } => Some(task),
                _ => None,
            })
            .collect();

        for task in children {
            self.remove(&task);
        }
    }
}

// Similar for UpperView, UpperViewMut (counter operations)
pub struct UpperViewMut<'a> {
    storage: &'a mut InnerStorage,
}

impl<'a> UpperViewMut<'a> {
    pub fn get(&self, task: &TaskId) -> Option<u32> {
        self.storage
            .get(&CachedDataItemKey::Upper { task: *task })
            .and_then(|v| match v {
                CachedDataItemValueRef::Upper { value } => Some(*value),
                _ => None,
            })
    }

    pub fn insert(&mut self, task: TaskId, value: u32) -> Option<u32> {
        self.storage
            .insert(CachedDataItem::Upper { task, value })
            .and_then(|old| match old {
                CachedDataItemValue::Upper { value } => Some(value),
                _ => None,
            })
    }

    pub fn increment(&mut self, task: TaskId, delta: u32) {
        self.storage.update(&CachedDataItemKey::Upper { task }, |old| {
            let current = old
                .and_then(|v| match v {
                    CachedDataItemValue::Upper { value } => Some(value),
                    _ => None,
                })
                .unwrap_or(0);
            let new_value = current + delta;
            if new_value > 0 {
                Some(CachedDataItemValue::Upper { value: new_value })
            } else {
                None // Auto-remove on zero
            }
        });
    }

    pub fn decrement(&mut self, task: TaskId, delta: u32) {
        // Similar to increment
    }
}
```

### Step 3: Migrate Call Sites (Weeks 2-8)

**Automated Search & Replace Pattern:**

```bash
# Find all usages of old API
rg 'storage\.(insert|get|remove|update)\(CachedDataItem' --type rust

# For each pattern, replace with typed API
```

**Migration Examples:**

**Pattern 1: Direct field insert/get**

```rust
// BEFORE
storage.insert(CachedDataItem::Output { value });
let output = storage.get(&CachedDataItemKey::Output);

// AFTER
storage.set_output(Some(value));
let output = storage.get_output();
```

**Pattern 2: Set operations (children, dependencies)**

```rust
// BEFORE
storage.insert(CachedDataItem::Child { task, value: () });
let has = storage.get(&CachedDataItemKey::Child { task }).is_some();
storage.remove(&CachedDataItemKey::Child { task });

// AFTER
storage.children_mut().insert(task);
let has = storage.children().contains(&task);
storage.children_mut().remove(&task);
```

**Pattern 3: Counter operations (upper, followers)**

```rust
// BEFORE
storage.update(&CachedDataItemKey::Upper { task }, |old| {
    let current = old.map(|v| v.value).unwrap_or(0);
    Some(CachedDataItemValue::Upper { value: current + delta })
});

// AFTER
storage.upper_mut().increment(task, delta);
```

**Pattern 4: Iteration**

```rust
// BEFORE
for item in storage.iter(CachedDataItemType::Child) {
    if let CachedDataItem::Child { task, .. } = item {
        process(task);
    }
}

// AFTER
for task in storage.children().iter() {
    process(task);
}
```

### Step 4: Verify All Call Sites Migrated (Week 8)

```bash
# Should return zero results
rg 'storage\.(insert|get|remove)\(CachedDataItem' --type rust

# Mark old methods as deprecated
#[deprecated(note = "Use typed accessors instead")]
pub fn insert(&mut self, item: CachedDataItem) -> Option<CachedDataItemValue> {
    // ...
}
```

### Step 5: Swap Implementation (Weeks 9-10)

Once all call sites use typed APIs, replace internal implementation:

```rust
// BEFORE (current implementation)
pub struct InnerStorage {
    aggregation_number: OptionStorage<AggregationNumber>,
    output_dependent: AutoMapStorage<TaskId, ()>,
    output: OptionStorage<OutputValue>,
    upper: AutoMapStorage<TaskId, u32>,
    dynamic: DynamicStorage,
    state: InnerStorageState,
}

impl InnerStorage {
    pub fn get_output(&self) -> Option<&OutputValue> {
        // Delegates to generic API
        self.get(&CachedDataItemKey::Output)
            .and_then(|v| match v { ... })
    }
}

// AFTER (macro-generated implementation)
#[derive(TaskStorage)]
pub struct InnerStorageSchema {
    #[task_storage(storage = "direct", category = "data", specialized)]
    pub output: Option<OutputValue>,

    #[task_storage(storage = "auto_set", category = "data", group = "dependencies")]
    pub children: AutoSet<TaskId>,

    #[task_storage(storage = "counter_map", category = "data", specialized)]
    pub upper: CounterMap<TaskId, u32>,
    // ... all 40+ fields
}

// Generated InnerStorage - typed accessors become direct field access
impl InnerStorage {
    pub fn get_output(&self) -> Option<&OutputValue> {
        // Now directly accesses field!
        self.data.output.as_ref()
    }

    pub fn set_output(&mut self, value: Option<OutputValue>) -> Option<OutputValue> {
        let old = self.data.output.take();
        self.data.output = value;
        self.state.set_data_modified(true);
        old
    }

    pub fn children(&self) -> &AutoSet<TaskId> {
        &self.data.children
    }

    pub fn children_mut(&mut self) -> &mut AutoSet<TaskId> {
        self.state.set_data_modified(true);
        &mut self.data.children
    }

    // View types no longer needed - direct collection access
}
```

### Step 6: Remove Old Implementation (Week 10)

```rust
// Remove deprecated methods
// Remove CachedDataItem usage from InnerStorage
// Remove DynamicStorage
// Remove view wrapper types (use collections directly)
// Update tests
```

## Implementation Timeline

### Week 1: API Layer (Days 1-5)

- **Day 1-2**: Design typed API surface
  - List all 40+ CachedDataItem types
  - Decide accessor pattern for each (direct, view, counter)
  - Document API for each type

- **Day 3-4**: Implement typed accessors
  - Add direct field accessors (get*\*, set*\*)
  - Create view types for collections
  - Implement counter operations

- **Day 5**: Write API tests
  - Test each typed accessor
  - Verify delegation to old implementation works
  - Ensure modification tracking works

### Weeks 2-3: High Priority Migration (Days 6-15)

Migrate hot-path call sites (most frequently used):

- **Output, OutputDependency, OutputDependent** (~15 call sites)
- **Child operations** (~20 call sites)
- **Upper, AggregationNumber** (~10 call sites)
- **Dirty state** (~8 call sites)

### Weeks 4-5: Medium Priority Migration (Days 16-25)

- **Cell operations** (CellData, CellDependency, CellDependent)
- **Collectibles** (Collectible, CollectiblesDependency, CollectiblesDependent)
- **Followers, aggregation graph operations**

### Weeks 6-7: Low Priority Migration (Days 26-35)

- **Rare operations** (CellTypeMaxIndex, CurrentSessionClean)
- **Special cases** (TransientCellData, ActivenessState)
- **Edge cases and tests**

### Week 8: Verification (Days 36-40)

- **Day 36-37**: Audit codebase for remaining old API usage
- **Day 38**: Deprecate old methods, fix compiler warnings
- **Day 39**: Run full test suite, benchmark performance
- **Day 40**: Code review, documentation

### Weeks 9-10: Implementation Swap (Days 41-50)

- **Day 41-42**: Finalize TaskStorage schema (all 40+ fields)
- **Day 43-45**: Update macro to generate matching typed APIs
- **Day 46-47**: Swap InnerStorage implementation
- **Day 48**: Remove view wrapper types (use collections directly)
- **Day 49**: Remove old CachedDataItem methods
- **Day 50**: Final testing and cleanup

## Benefits of Prefactoring

### ✅ Safer Migration

- No internal implementation changes until API fully migrated
- Each call site migration is independent and testable
- Easy to revert individual changes

### ✅ Incremental Progress

- Can migrate one module at a time
- Progress is visible (fewer old API calls)
- Can pause migration anytime

### ✅ Better API Design

- Design API with real usage patterns in mind
- Discover pain points before committing to macro
- Can iterate on API before implementation

### ✅ No Compatibility Layer

- No bridge trait needed
- No performance overhead
- Cleaner final code

### ✅ Automated Migration

- Search & replace patterns are straightforward
- Can create codemod scripts if needed
- Easy to track progress with grep

## Comparison: Bridge vs Prefactoring

| Aspect                  | Bridge Approach                       | Prefactoring Approach                |
| ----------------------- | ------------------------------------- | ------------------------------------ |
| **API Changes**         | Add bridge trait, keep old API        | Add typed APIs, deprecate old API    |
| **Migration Order**     | Implementation first, then callers    | Callers first, then implementation   |
| **Risk**                | New implementation could break things | Old implementation stays until ready |
| **Compatibility Layer** | Bridge trait (temporary)              | None needed                          |
| **Performance**         | Match overhead during migration       | Zero overhead                        |
| **Complexity**          | Medium (bridge generation)            | Low (simple delegation)              |
| **Reversibility**       | Hard (bridge removal is big change)   | Easy (each call site independent)    |
| **Timeline**            | 8-10 weeks                            | 8-10 weeks                           |

## Testing Strategy

### Phase 1: API Delegation Tests (Week 1)

```rust
#[test]
fn test_output_accessor_delegates() {
    let mut storage = InnerStorage::new();

    // New API
    storage.set_output(Some(value));

    // Verify old API sees same data
    assert!(storage.get(&CachedDataItemKey::Output).is_some());

    // Vice versa
    storage.insert(CachedDataItem::Output { value: value2 });
    assert_eq!(storage.get_output(), Some(&value2));
}
```

### Phase 2: Migration Verification (Weeks 2-8)

After each module migration:

```bash
# Run tests for migrated module
cargo test -p turbo-tasks-backend backend::test_module_name

# Run full backend tests
cargo test -p turbo-tasks-backend

# Verify no old API usage remains in module
rg 'CachedDataItem' backend/module_name.rs
```

### Phase 3: Implementation Swap Tests (Weeks 9-10)

```rust
#[test]
fn test_implementation_equivalence() {
    let mut old_storage = InnerStorageOld::new();
    let mut new_storage = InnerStorage::new();

    // Perform same operations on both
    old_storage.insert(CachedDataItem::Output { value });
    new_storage.set_output(Some(value));

    // Compare states
    assert_eq!(old_storage.serialize(), new_storage.serialize());
}
```

## Migration Automation

### Script 1: Find Migration Candidates

```bash
#!/bin/bash
# find_old_api_usage.sh

echo "=== Old API Usage by Module ==="
for file in $(find turbopack/crates/turbo-tasks-backend/src -name "*.rs"); do
    count=$(rg 'storage\.(insert|get|remove)\(CachedDataItem' "$file" -c 2>/dev/null || echo "0")
    if [ "$count" -gt "0" ]; then
        echo "$file: $count usages"
    fi
done
```

### Script 2: Migration Progress Tracker

```bash
#!/bin/bash
# migration_progress.sh

total=$(rg 'storage\.(insert|get|remove)\(CachedDataItem' --type rust -c | awk '{sum+=$1} END {print sum}')
echo "Remaining old API calls: $total"
echo "Progress: $((100 - total))% complete"
```

## Risks and Mitigation

### Risk 1: Typed API Design Issues

**Problem**: Discover API doesn't work well after migrating many call sites

**Mitigation**:

- Design API with thorough review in Week 1
- Migrate a few diverse call sites first (Week 2)
- Get feedback before bulk migration
- Can still iterate on API since implementation hasn't changed

### Risk 2: Missed Call Sites

**Problem**: Some old API usage remains hidden

**Mitigation**:

- Deprecation warnings catch all usages
- Grep search finds all call sites
- Compiler errors if old methods removed
- Code review before implementation swap

### Risk 3: Performance Regression

**Problem**: New implementation is slower than old

**Mitigation**:

- Benchmark both implementations before swap
- Profile hot paths
- Can easily revert implementation while keeping new API
- Typed API should be faster (direct field access)

### Risk 4: Behavioral Differences

**Problem**: New implementation has subtle differences

**Mitigation**:

- Run full test suite continuously
- Compare serialized states (old vs new)
- Integration tests with real workloads
- Extensive testing before swap

## Success Criteria

### Phase Complete When:

1. ✅ All 40+ CachedDataItem types have typed accessor APIs
2. ✅ All call sites migrated to typed APIs (zero old API usage)
3. ✅ Old API methods deprecated
4. ✅ All tests pass with old implementation
5. ✅ Implementation swapped to macro-generated storage
6. ✅ All tests pass with new implementation
7. ✅ Performance benchmarks show no regression
8. ✅ Old CachedDataItem methods removed

## Next Steps

1. **Week 1, Days 1-2**: Design typed API surface
   - Review all CachedDataItem variants
   - Design accessor pattern for each
   - Create API specification document

2. **Week 1, Days 3-4**: Implement typed accessors
   - Add methods to existing InnerStorage
   - Create view types for collections
   - Ensure proper delegation to old implementation

3. **Week 1, Day 5**: Write comprehensive API tests
   - Test each accessor delegates correctly
   - Verify bidirectional compatibility
   - Test modification tracking

4. **Week 2+**: Begin incremental migration
   - Start with small, isolated modules
   - Verify each migration with tests
   - Track progress with automation scripts

This approach is much cleaner than the bridge pattern - we're just adding a better API on top, migrating callers, then swapping the implementation underneath. No compatibility layers, no performance overhead, and much safer!
