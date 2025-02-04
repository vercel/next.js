use std::{
    borrow::Cow,
    collections::hash_map::Entry,
    mem::transmute,
    ops::{Deref, DerefMut},
    sync::Arc,
};

use anyhow::Result;
use rustc_hash::{FxHashMap, FxHashSet};
use turbopack_trace_utils::tracing::{TraceRow, TraceValue};

use super::TraceFormat;
use crate::{
    span::SpanIndex,
    store_container::{StoreContainer, StoreWriteGuard},
    timestamp::Timestamp,
    FxIndexMap,
};

#[derive(Default)]
struct AllocationInfo {
    allocations: u64,
    deallocations: u64,
    allocation_count: u64,
    deallocation_count: u64,
}

struct InternalRow<'a> {
    id: Option<u64>,
    ty: InternalRowType<'a>,
}

impl InternalRow<'_> {
    fn into_static(self) -> InternalRow<'static> {
        InternalRow {
            id: self.id,
            ty: self.ty.into_static(),
        }
    }
}

enum InternalRowType<'a> {
    Start {
        new_id: u64,
        ts: Timestamp,
        name: Cow<'a, str>,
        target: Cow<'a, str>,
        values: Vec<(Cow<'a, str>, TraceValue<'a>)>,
    },
    End {
        ts: Timestamp,
    },
    SelfTime {
        start: Timestamp,
        end: Timestamp,
    },
    Event {
        ts: Timestamp,
        values: Vec<(Cow<'a, str>, TraceValue<'a>)>,
    },
    Record {
        values: Vec<(Cow<'a, str>, TraceValue<'a>)>,
    },
    Allocation {
        allocations: u64,
        allocation_count: u64,
    },
    Deallocation {
        deallocations: u64,
        deallocation_count: u64,
    },
}

impl InternalRowType<'_> {
    fn into_static(self) -> InternalRowType<'static> {
        match self {
            InternalRowType::Start {
                ts,
                new_id,
                name,
                target,
                values,
            } => InternalRowType::Start {
                ts,
                new_id,
                name: name.into_owned().into(),
                target: target.into_owned().into(),
                values: values
                    .into_iter()
                    .map(|(k, v)| (k.into_owned().into(), v.into_static()))
                    .collect(),
            },
            InternalRowType::End { ts } => InternalRowType::End { ts },
            InternalRowType::SelfTime { start, end } => InternalRowType::SelfTime { start, end },
            InternalRowType::Event { ts, values } => InternalRowType::Event {
                ts,
                values: values
                    .into_iter()
                    .map(|(k, v)| (k.into_owned().into(), v.into_static()))
                    .collect(),
            },
            InternalRowType::Record { values } => InternalRowType::Record {
                values: values
                    .into_iter()
                    .map(|(k, v)| (k.into_owned().into(), v.into_static()))
                    .collect(),
            },
            InternalRowType::Allocation {
                allocations,
                allocation_count,
            } => InternalRowType::Allocation {
                allocations,
                allocation_count,
            },
            InternalRowType::Deallocation {
                deallocations,
                deallocation_count,
            } => InternalRowType::Deallocation {
                deallocations,
                deallocation_count,
            },
        }
    }
}

#[derive(Default)]
struct QueuedRows {
    rows: Vec<InternalRow<'static>>,
}

pub struct TurbopackFormat {
    store: Arc<StoreContainer>,
    id_mapping: FxHashMap<u64, SpanIndex>,
    queued_rows: FxHashMap<u64, QueuedRows>,
    outdated_spans: FxHashSet<SpanIndex>,
    thread_stacks: FxHashMap<u64, Vec<u64>>,
    thread_allocation_counters: FxHashMap<u64, AllocationInfo>,
    self_time_started: FxHashMap<(u64, u64), Timestamp>,
}

impl TurbopackFormat {
    pub fn new(store: Arc<StoreContainer>) -> Self {
        Self {
            store,
            id_mapping: FxHashMap::default(),
            queued_rows: FxHashMap::default(),
            outdated_spans: FxHashSet::default(),
            thread_stacks: FxHashMap::default(),
            thread_allocation_counters: FxHashMap::default(),
            self_time_started: FxHashMap::default(),
        }
    }

    fn process(&mut self, store: &mut StoreWriteGuard, row: TraceRow<'_>) {
        match row {
            TraceRow::Start {
                ts,
                id,
                parent,
                name,
                target,
                values,
            } => {
                let ts = Timestamp::from_micros(ts);
                self.process_internal_row(
                    store,
                    InternalRow {
                        id: parent,
                        ty: InternalRowType::Start {
                            ts,
                            new_id: id,
                            name,
                            target,
                            values,
                        },
                    },
                );
            }
            TraceRow::Record { id, values } => {
                self.process_internal_row(
                    store,
                    InternalRow {
                        id: Some(id),
                        ty: InternalRowType::Record { values },
                    },
                );
            }
            TraceRow::End { ts, id } => {
                let ts = Timestamp::from_micros(ts);
                self.process_internal_row(
                    store,
                    InternalRow {
                        id: Some(id),
                        ty: InternalRowType::End { ts },
                    },
                );
            }
            TraceRow::Enter { ts, id, thread_id } => {
                let ts = Timestamp::from_micros(ts);
                let stack = self.thread_stacks.entry(thread_id).or_default();
                if let Some(&parent) = stack.last() {
                    if let Some(parent_start) = self.self_time_started.remove(&(parent, thread_id))
                    {
                        stack.push(id);
                        self.process_internal_row(
                            store,
                            InternalRow {
                                id: Some(parent),
                                ty: InternalRowType::SelfTime {
                                    start: parent_start,
                                    end: ts,
                                },
                            },
                        );
                    } else {
                        stack.push(id);
                    }
                } else {
                    stack.push(id);
                }
                self.self_time_started.insert((id, thread_id), ts);
            }
            TraceRow::Exit { ts, id, thread_id } => {
                let ts = Timestamp::from_micros(ts);
                let stack = self.thread_stacks.entry(thread_id).or_default();
                if let Some(pos) = stack.iter().rev().position(|&x| x == id) {
                    let stack_index = stack.len() - pos - 1;
                    stack.remove(stack_index);
                    if stack_index > 0 {
                        let parent = stack[stack_index - 1];
                        self.self_time_started.insert((parent, thread_id), ts);
                    }
                }
                if let Some(start) = self.self_time_started.remove(&(id, thread_id)) {
                    self.process_internal_row(
                        store,
                        InternalRow {
                            id: Some(id),
                            ty: InternalRowType::SelfTime { start, end: ts },
                        },
                    );
                }
            }
            TraceRow::Event { ts, parent, values } => {
                let ts = Timestamp::from_micros(ts);
                self.process_internal_row(
                    store,
                    InternalRow {
                        id: parent,
                        ty: InternalRowType::Event { ts, values },
                    },
                );
            }
            TraceRow::Allocation {
                ts: _,
                thread_id,
                allocations,
                allocation_count,
                deallocations,
                deallocation_count,
            } => {
                let stack = self.thread_stacks.entry(thread_id).or_default();
                if let Some(&id) = stack.last() {
                    if allocations > 0 {
                        self.process_internal_row(
                            store,
                            InternalRow {
                                id: Some(id),
                                ty: InternalRowType::Allocation {
                                    allocations,
                                    allocation_count,
                                },
                            },
                        );
                    }
                    if deallocations > 0 {
                        self.process_internal_row(
                            store,
                            InternalRow {
                                id: Some(id),
                                ty: InternalRowType::Deallocation {
                                    deallocations,
                                    deallocation_count,
                                },
                            },
                        );
                    }
                }
            }
            TraceRow::AllocationCounters {
                ts: _,
                thread_id,
                allocations,
                allocation_count,
                deallocations,
                deallocation_count,
            } => {
                let info = AllocationInfo {
                    allocations,
                    deallocations,
                    allocation_count,
                    deallocation_count,
                };
                let mut diff = AllocationInfo::default();
                match self.thread_allocation_counters.entry(thread_id) {
                    Entry::Occupied(mut entry) => {
                        let counter = entry.get_mut();
                        diff.allocations = info.allocations - counter.allocations;
                        diff.deallocations = info.deallocations - counter.deallocations;
                        diff.allocation_count = info.allocation_count - counter.allocation_count;
                        diff.deallocation_count =
                            info.deallocation_count - counter.deallocation_count;
                        counter.allocations = info.allocations;
                        counter.deallocations = info.deallocations;
                        counter.allocation_count = info.allocation_count;
                        counter.deallocation_count = info.deallocation_count;
                    }
                    Entry::Vacant(entry) => {
                        entry.insert(info);
                    }
                }
                let stack = self.thread_stacks.entry(thread_id).or_default();
                if let Some(&id) = stack.last() {
                    if diff.allocations > 0 {
                        self.process_internal_row(
                            store,
                            InternalRow {
                                id: Some(id),
                                ty: InternalRowType::Allocation {
                                    allocations: diff.allocations,
                                    allocation_count: diff.allocation_count,
                                },
                            },
                        );
                    }
                    if diff.deallocations > 0 {
                        self.process_internal_row(
                            store,
                            InternalRow {
                                id: Some(id),
                                ty: InternalRowType::Deallocation {
                                    deallocations: diff.deallocations,
                                    deallocation_count: diff.deallocation_count,
                                },
                            },
                        );
                    }
                }
            }
        }
    }

    fn process_internal_row(&mut self, store: &mut StoreWriteGuard, row: InternalRow<'_>) {
        let id = if let Some(id) = row.id {
            if let Some(id) = self.id_mapping.get(&id) {
                Some(*id)
            } else {
                self.queued_rows
                    .entry(id)
                    .or_default()
                    .rows
                    .push(row.into_static());
                return;
            }
        } else {
            None
        };
        match row.ty {
            InternalRowType::Start {
                ts,
                new_id,
                name,
                target,
                values,
            } => {
                let span_id = store.add_span(
                    id,
                    ts,
                    target.into_owned(),
                    name.into_owned(),
                    values
                        .iter()
                        .map(|(k, v)| (k.to_string(), v.to_string()))
                        .collect(),
                    &mut self.outdated_spans,
                );
                self.id_mapping.insert(new_id, span_id);
                if let Some(QueuedRows { rows }) = self.queued_rows.remove(&new_id) {
                    for row in rows {
                        self.process_internal_row(store, row);
                    }
                }
            }
            InternalRowType::Record { ref values } => {
                store.add_args(
                    id.unwrap(),
                    values
                        .iter()
                        .map(|(k, v)| (k.to_string(), v.to_string()))
                        .collect(),
                    &mut self.outdated_spans,
                );
            }
            InternalRowType::End { ts: _ } => {
                store.complete_span(id.unwrap());
            }
            InternalRowType::SelfTime { start, end } => {
                store.add_self_time(id.unwrap(), start, end, &mut self.outdated_spans);
            }
            InternalRowType::Event { ts, values } => {
                let mut values = values.into_iter().collect::<FxIndexMap<_, _>>();
                let duration = Timestamp::from_micros(
                    values
                        .swap_remove("duration")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0),
                );
                let name = values
                    .swap_remove("name")
                    .and_then(|v| v.as_str().map(|s| s.to_string()))
                    .unwrap_or("event".into());

                let id = store.add_span(
                    id,
                    ts.saturating_sub(duration),
                    "event".into(),
                    name,
                    values
                        .iter()
                        .map(|(k, v)| (k.to_string(), v.to_string()))
                        .collect(),
                    &mut self.outdated_spans,
                );
                store.add_self_time(
                    id,
                    ts.saturating_sub(duration),
                    ts,
                    &mut self.outdated_spans,
                );
                store.complete_span(id);
            }
            InternalRowType::Allocation {
                allocations,
                allocation_count,
            } => {
                store.add_allocation(
                    id.unwrap(),
                    allocations,
                    allocation_count,
                    &mut self.outdated_spans,
                );
            }
            InternalRowType::Deallocation {
                deallocations,
                deallocation_count,
            } => {
                store.add_deallocation(
                    id.unwrap(),
                    deallocations,
                    deallocation_count,
                    &mut self.outdated_spans,
                );
            }
        }
    }
}

impl TraceFormat for TurbopackFormat {
    type Reused = Vec<TraceRow<'static>>;

    fn read(&mut self, mut buffer: &[u8], reuse: &mut Self::Reused) -> Result<usize> {
        reuse.clear();
        let mut reuse = ClearOnDrop(reuse);
        // Safety: The Vec is empty and is cleared on leaving this scope, so it's safe to cast the
        // lifetime of data, since there is no data and data can't leave this function.
        let rows =
            unsafe { transmute::<&mut Vec<TraceRow<'_>>, &mut Vec<TraceRow<'_>>>(&mut *reuse) };
        let mut bytes_read = 0;
        loop {
            match postcard::take_from_bytes(buffer) {
                Ok((row, remaining)) => {
                    bytes_read += buffer.len() - remaining.len();
                    buffer = remaining;
                    rows.push(row);
                }
                Err(err) => {
                    if matches!(err, postcard::Error::DeserializeUnexpectedEnd) {
                        break;
                    }
                    return Err(err.into());
                }
            }
        }
        if !rows.is_empty() {
            let store = self.store.clone();
            let mut iter = rows.drain(..);
            {
                let mut store = store.write();
                for row in iter.by_ref() {
                    self.process(&mut store, row);
                }
                store.invalidate_outdated_spans(&self.outdated_spans);
                self.outdated_spans.clear();
            }
        }
        Ok(bytes_read)
    }
}

struct ClearOnDrop<'l, T>(&'l mut Vec<T>);

impl<T> Drop for ClearOnDrop<'_, T> {
    fn drop(&mut self) {
        self.0.clear();
    }
}

impl<T> Deref for ClearOnDrop<'_, T> {
    type Target = Vec<T>;

    fn deref(&self) -> &Self::Target {
        self.0
    }
}

impl<T> DerefMut for ClearOnDrop<'_, T> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.0
    }
}
