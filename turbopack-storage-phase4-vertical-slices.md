# Phase 4: Vertical Slice Migration - One CachedDataItem at a Time

## Overview

Instead of building all APIs upfront, we'll migrate **one CachedDataItem type at a time vertically**:

1. Add typed API for that type
2. Migrate all call sites for that type
3. Verify and commit
4. Repeat for next type

This provides faster feedback and allows us to discover threading issues incrementally.

## Threading Complexity

### The Challenge: Multiple Accessor Structs

The backend uses several accessor structs that all need to interact with `InnerStorage`:

```rust
// In backend/mod.rs
pub struct TaskGuard<'a> {
    // Provides access to a task's InnerStorage
}

pub struct TaskGuardMut<'a> {
    // Mutable access to InnerStorage
}

pub struct Task {
    // Operations on tasks
}

// Multiple guards can access the same InnerStorage through different paths
impl<'a> TaskGuard<'a> {
    pub fn insert(&mut self, item: CachedDataItem) { ... }
}

impl Task {
    pub fn with_storage<T>(&self, f: impl FnOnce(&InnerStorage) -> T) -> T { ... }
}
```

**Threading Work Required:**

- Find all accessor types that expose `InnerStorage` APIs
- Add typed methods to each accessor
- Ensure consistent API across all accessors
- Handle lifetime and borrowing constraints

## Vertical Slice Strategy

### Template: Migrate One Type End-to-End

For each CachedDataItem type:

**Step 1:** Find all accessor structs that expose this type
**Step 2:** Add typed API to InnerStorage
**Step 3:** Thread API through all accessor structs
**Step 4:** Migrate all call sites
**Step 5:** Test and verify
**Step 6:** Commit and move to next type

### Example: Migrating `Child` Type

#### Step 1: Find Accessors (30 min)

```bash
# Find all places that expose InnerStorage operations
rg "impl.*TaskGuard|impl.*Task[^a-z]" -A 20 | grep "pub fn"

# Find all usages of Child operations
rg "CachedDataItem::Child|CachedDataItemKey::Child" --type rust
```

Discovered accessors:

- `InnerStorage` - direct access
- `TaskGuardMut` - wraps InnerStorage
- `Task` - provides closure-based access
- Snapshot operations

#### Step 2: Add API to InnerStorage (1 hour)

```rust
// In backend/storage.rs

impl InnerStorage {
    /// Get read-only view of children
    pub fn children(&self) -> ChildrenView<'_> {
        ChildrenView { storage: self }
    }

    /// Get mutable view of children
    pub fn children_mut(&mut self) -> ChildrenViewMut<'_> {
        ChildrenViewMut { storage: self }
    }
}

// View types that delegate to current implementation
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
        // Iterate over CachedDataItemType::Child
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

    pub fn is_empty(&self) -> bool {
        !self.storage.has(CachedDataItemType::Child)
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

    // Reborrow to get immutable view
    pub fn as_view(&self) -> ChildrenView<'_> {
        ChildrenView {
            storage: self.storage,
        }
    }
}
```

#### Step 3: Thread Through Accessors (2 hours)

```rust
// In backend/mod.rs

impl<'a> TaskGuard<'a> {
    // OLD API - keep for now but mark internal
    #[doc(hidden)]
    pub fn insert(&mut self, item: CachedDataItem) -> Option<CachedDataItemValue> {
        self.storage.insert(item)
    }

    // NEW API - expose through same pattern
    pub fn children(&self) -> ChildrenView<'_> {
        self.storage.children()
    }

    pub fn children_mut(&mut self) -> ChildrenViewMut<'_> {
        self.storage.children_mut()
    }
}

impl<'a> TaskGuardMut<'a> {
    pub fn children(&self) -> ChildrenView<'_> {
        self.storage.children()
    }

    pub fn children_mut(&mut self) -> ChildrenViewMut<'_> {
        self.storage.children_mut()
    }
}

impl Task {
    pub fn with_children<T>(&self, f: impl FnOnce(ChildrenView<'_>) -> T) -> T {
        self.with_storage(|storage| f(storage.children()))
    }

    pub fn with_children_mut<T>(&self, f: impl FnOnce(ChildrenViewMut<'_>) -> T) -> T {
        self.with_storage_mut(|storage| f(storage.children_mut()))
    }
}
```

**Challenge: Different borrow patterns**

Some code uses:

```rust
// Pattern A: Direct access
let mut guard = task.guard_mut();
guard.insert(CachedDataItem::Child { task, value: () });

// Pattern B: Closure-based
task.with_storage_mut(|storage| {
    storage.insert(CachedDataItem::Child { task, value: () });
});

// Pattern C: Multi-step
let mut guard = task.guard_mut();
if guard.get(&CachedDataItemKey::Child { task }).is_some() {
    guard.remove(&CachedDataItemKey::Child { task });
}
```

Each needs appropriate threading:

```rust
// Pattern A -> direct
let mut guard = task.guard_mut();
guard.children_mut().insert(task);

// Pattern B -> helper method
task.with_children_mut(|children| {
    children.insert(task);
});

// Pattern C -> reborrow pattern
let mut guard = task.guard_mut();
if guard.children().contains(&task) {
    guard.children_mut().remove(&task);
}
```

#### Step 4: Migrate Call Sites (4-8 hours depending on usage)

```bash
# Find all Child usages
rg "CachedDataItem::Child" --type rust -l | wc -l
# Example output: 23 files

# Migrate one file at a time
```

**Migration patterns:**

```rust
// BEFORE
storage.insert(CachedDataItem::Child { task, value: () });

// AFTER
storage.children_mut().insert(task);

// ----

// BEFORE
if storage.get(&CachedDataItemKey::Child { task }).is_some() {
    // task is a child
}

// AFTER
if storage.children().contains(&task) {
    // task is a child
}

// ----

// BEFORE
storage.remove(&CachedDataItemKey::Child { task });

// AFTER
storage.children_mut().remove(&task);

// ----

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

#### Step 5: Test and Verify (1 hour)

```rust
#[test]
fn test_children_api_equivalence() {
    let mut storage = InnerStorage::new();

    // Test insert via new API
    storage.children_mut().insert(task1);

    // Verify old API sees it
    assert!(storage
        .get(&CachedDataItemKey::Child { task: task1 })
        .is_some());

    // Test insert via old API
    storage.insert(CachedDataItem::Child {
        task: task2,
        value: (),
    });

    // Verify new API sees it
    assert!(storage.children().contains(&task2));

    // Test iteration
    let children: Vec<_> = storage.children().iter().collect();
    assert_eq!(children.len(), 2);
    assert!(children.contains(&task1));
    assert!(children.contains(&task2));
}

#[test]
fn test_children_threading() {
    let task = /* create test task */;

    // Test through TaskGuard
    {
        let mut guard = task.guard_mut();
        guard.children_mut().insert(child_task);
    }

    // Verify through different accessor
    task.with_children(|children| {
        assert!(children.contains(&child_task));
    });
}
```

```bash
# Run tests
cargo test -p turbo-tasks-backend

# Verify no old API usage for Child remains
rg "CachedDataItem::Child|CachedDataItemKey::Child" --type rust
# Should only show in compatibility layer, not call sites
```

#### Step 6: Commit (15 min)

```bash
git add -A
git commit -m "[turbo-tasks] Migrate Child operations to typed API

- Add children() and children_mut() APIs to InnerStorage
- Thread through TaskGuard, TaskGuardMut, and Task accessors
- Migrate all 23 call sites to use new typed API
- Old CachedDataItem::Child API marked as internal but still functional

Tests: All backend tests pass, Child operations fully migrated"
```

## Migration Order: By Complexity and Usage

### Phase 1: Simple Set Types (Week 1-2)

**Rationale:** Simple insert/remove/contains pattern, high usage, good learning opportunity

1. **Child** (~20 call sites)
   - Simple set operations
   - Tests threading pattern
   - Lessons: handling different accessor patterns

2. **OutputDependency** (~15 call sites)
   - Similar to Child
   - Already specialized field
   - Lessons: optimized field access

3. **CellDependency** (~12 call sites)
   - More complex key (CellRef)
   - Lessons: multi-field keys

### Phase 2: Direct Fields (Week 3)

**Rationale:** Simplest pattern, direct get/set

4. **Output** (~25 call sites)
   - Direct Option<OutputValue>
   - Already specialized
   - Lessons: Option handling

5. **Dirty** (~15 call sites)
   - Direct Option<Dirtyness>
   - State management
   - Lessons: meta category tracking

6. **AggregationNumber** (~10 call sites)
   - Direct Option<AggregationNumber>
   - Already specialized
   - Lessons: none (straightforward)

### Phase 3: Counter Types (Week 4-5)

**Rationale:** More complex operations (increment/decrement), medium usage

7. **Upper** (~18 call sites)
   - Counter operations
   - Already specialized
   - Lessons: auto-zero removal, increment/decrement API

8. **Follower** (~14 call sites)
   - Similar to Upper
   - Lessons: reuse patterns from Upper

9. **Collectible** (~10 call sites)
   - Counter with different key
   - Lessons: variation on counter pattern

### Phase 4: Complex Types (Week 6-7)

**Rationale:** More complex operations, moderate usage

10. **CellData** (~20 call sites)
    - Indexed storage
    - Type information
    - Lessons: heterogeneous value types

11. **OutputDependent** (~12 call sites)
    - Already specialized
    - Lessons: dependent tracking patterns

12. **CellDependent** (~10 call sites)
    - More complex dependent tracking
    - Lessons: multi-level dependencies

### Phase 5: Remaining Types (Week 8-9)

**Rationale:** Low usage, special cases

13-40. All remaining types (~50 call sites total) - CollectiblesDependency, CollectiblesDependent - CellTypeMaxIndex - CurrentSessionClean - TransientCellData - Various aggregation graph types - etc.

### Phase 6: Cleanup (Week 10)

- Remove old API methods
- Remove view wrapper types (after implementation swap)
- Update documentation
- Final verification

## Threading Patterns to Watch For

### Pattern 1: Multiple Operations in Sequence

**Challenge:** Multiple borrows of same storage

```rust
// BEFORE - works fine
let mut guard = task.guard_mut();
guard.insert(CachedDataItem::Child { task: child1, value: () });
guard.insert(CachedDataItem::Child { task: child2, value: () });
guard.insert(CachedDataItem::OutputDependency { target, value: () });

// AFTER - needs reborrow
let mut guard = task.guard_mut();
guard.children_mut().insert(child1);
guard.children_mut().insert(child2);  // Reborrow works
guard.output_dependencies_mut().insert(target);  // Different accessor, also works
```

**Solution:** View types are lightweight, reborrowing works naturally.

### Pattern 2: Read Then Write

**Challenge:** Need immutable then mutable access

```rust
// BEFORE
if guard.get(&CachedDataItemKey::Child { task }).is_some() {
    guard.remove(&CachedDataItemKey::Child { task });
}

// AFTER - WRONG (borrow conflict)
if guard.children().contains(&task) {
    guard.children_mut().remove(&task);  // ERROR: can't borrow mutably
}

// AFTER - CORRECT (drop view first)
let has_child = guard.children().contains(&task);
if has_child {
    guard.children_mut().remove(&task);  // OK
}

// OR use entry pattern
guard.children_mut().remove(&task);  // Just remove, returns bool
```

**Solution:** Design APIs to avoid read-then-write patterns. Use entry-like APIs.

### Pattern 3: Closures with Multiple Accessors

**Challenge:** Closure borrows prevent subsequent access

```rust
// BEFORE
task.with_storage_mut(|storage| {
    storage.insert(CachedDataItem::Child { task: child, value: () });
    storage.insert(CachedDataItem::OutputDependency { target, value: () });
});

// AFTER - WRONG (verbose)
task.with_children_mut(|children| {
    children.insert(child);
});
task.with_output_dependencies_mut(|deps| {
    deps.insert(target);
});

// AFTER - BETTER (keep storage-level closure)
task.with_storage_mut(|storage| {
    storage.children_mut().insert(child);
    storage.output_dependencies_mut().insert(target);
});
```

**Solution:** Keep `with_storage_mut` pattern, don't create per-accessor closures.

### Pattern 4: Conditional Access Across Types

**Challenge:** Need to check one type to decide on another

```rust
// BEFORE
if guard.get(&CachedDataItemKey::Dirty).is_some() {
    guard.insert(CachedDataItem::Child { task, value: () });
}

// AFTER - natural
if guard.get_dirty().is_some() {
    guard.children_mut().insert(task);
}
```

**Solution:** Cross-type access works naturally with typed APIs.

## Automation Tools

### Tool 1: Find Next Type to Migrate

```bash
#!/bin/bash
# find_next_type.sh

echo "=== CachedDataItem Usage Count ==="
for type in Child OutputDependency CellDependency Output Dirty Upper Follower; do
    count=$(rg "CachedDataItem::$type|CachedDataItemKey::$type" --type rust -c 2>/dev/null | \
        awk '{sum+=$1} END {print sum}')
    echo "$type: $count call sites"
done | sort -t: -k2 -rn
```

### Tool 2: Track Migration Progress

```bash
#!/bin/bash
# migration_progress.sh

migrated="Child OutputDependency CellDependency"
total=40

echo "=== Migration Progress ==="
echo "Migrated types: $(echo $migrated | wc -w)/$total"
echo ""
echo "Remaining old API usage:"
for type in Child OutputDependency CellDependency Output Dirty; do
    if ! echo "$migrated" | grep -q "$type"; then
        count=$(rg "CachedDataItem::$type|CachedDataItemKey::$type" --type rust -c 2>/dev/null | \
            awk '{sum+=$1} END {print sum}')
        echo "  $type: $count call sites"
    fi
done
```

### Tool 3: Verify Type Migration

```bash
#!/bin/bash
# verify_type.sh TYPE

TYPE=$1
echo "Verifying $TYPE migration..."

# Should only appear in storage.rs (compatibility layer)
results=$(rg "CachedDataItem::$TYPE|CachedDataItemKey::$TYPE" --type rust -l | \
    grep -v "storage.rs" | grep -v "test")

if [ -z "$results" ]; then
    echo "✓ $TYPE fully migrated (only in compatibility layer)"
    exit 0
else
    echo "✗ $TYPE still has call sites:"
    echo "$results"
    exit 1
fi
```

## Lessons Learned Template

After each type migration, document:

```markdown
## Migration: Child Type

**Duration:** 8 hours
**Call Sites:** 23
**Complexity:** Medium

### Challenges Encountered:

1. TaskGuard had implicit borrow in loop - fixed by collecting first
2. Snapshot code needed special handling for iteration
3. Three different accessor patterns required consistent threading

### Solutions:

1. Collect children into Vec before iteration
2. Added children_snapshot() method for snapshot compatibility
3. Created helper macro for accessor threading

### API Design Decisions:

1. Used contains() instead of has() - more intuitive
2. clear() returns count of removed items - useful for logging
3. Kept iter() instead of into_iter() - avoid ownership issues

### Testing Insights:

1. Needed bidirectional compatibility tests
2. Threading tests caught lifetime issue early
3. Integration tests found performance regression (fixed by inlining)

### Recommendations for Next Type:

1. OutputDependency should be simpler (similar pattern)
2. Watch for same borrow pattern in aggregation code
3. Consider adding batch insert API
```

## Decision Log

Track key decisions as we discover patterns:

```markdown
## Decision: View Type Lifetime Strategy

**Date:** 2024-01-15
**Context:** ChildrenViewMut has lifetime issues in loops
**Decision:** View types are temporary, always reborrow from guard
**Alternatives Considered:**

- Store view in variable: causes lifetime conflicts
- Use entry API: too different from current pattern
  **Rationale:** Matches Rust conventions (like HashMap), minimal changes

## Decision: Closure-Based API Surface

**Date:** 2024-01-16
**Context:** TaskGuard has both direct and closure access patterns
**Decision:** Keep with_storage_mut(), don't add per-type closures
**Alternatives Considered:**

- with_children_mut(): too verbose for multiple operations
- Remove closures: breaks existing patterns
  **Rationale:** Closure API is for multi-operation transactions, typed API works inside

## Decision: Error Handling Strategy

**Date:** 2024-01-17
**Context:** Some operations can fail (e.g., insert when full)
**Decision:** Return Option/bool, don't use Result
**Alternatives Considered:**

- Result<(), Error>: too heavyweight
- Panic: not appropriate for expected failures
  **Rationale:** Matches current API conventions, simpler for common cases
```

## Success Criteria Per Type

Before marking a type as "migrated":

1. ✅ Typed API added to InnerStorage
2. ✅ API threaded through all accessors (TaskGuard, Task, etc.)
3. ✅ All call sites migrated (verified with grep)
4. ✅ Bidirectional compatibility tests pass
5. ✅ Threading tests pass for all accessor patterns
6. ✅ Integration tests pass
7. ✅ Performance benchmarks show no regression
8. ✅ Code review approved
9. ✅ Documented in lessons learned
10. ✅ Committed with clear message

## Timeline Per Type

**Simple types (set operations):** 1-2 days each

- 4 hours implementation
- 6 hours migration
- 2 hours testing and review

**Medium types (direct fields):** 1 day each

- 2 hours implementation
- 4 hours migration
- 2 hours testing and review

**Complex types (counters, indexed):** 2-3 days each

- 6 hours implementation
- 10 hours migration
- 4 hours testing and review

**Overall: 8-10 weeks for ~40 types**

This vertical slice approach is much better - we'll discover threading issues early, build patterns incrementally, and have working code after each iteration!
