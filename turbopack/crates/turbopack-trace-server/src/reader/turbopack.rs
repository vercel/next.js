use std::{
    collections::{hash_map::Entry, HashMap, HashSet},
    sync::Arc,
};

use anyhow::Result;
use indexmap::IndexMap;
use turbopack_trace_utils::tracing::TraceRow;

use super::TraceFormat;
use crate::{
    span::SpanIndex,
    store_container::{StoreContainer, StoreWriteGuard},
};

#[derive(Default)]
struct AllocationInfo {
    allocations: u64,
    deallocations: u64,
    allocation_count: u64,
    deallocation_count: u64,
}

pub struct TurbopackFormat {
    store: Arc<StoreContainer>,
    active_ids: HashMap<u64, SpanIndex>,
    queued_rows: HashMap<u64, Vec<TraceRow<'static>>>,
    outdated_spans: HashSet<SpanIndex>,
    thread_stacks: HashMap<u64, Vec<SpanIndex>>,
    thread_allocation_counters: HashMap<u64, AllocationInfo>,
    self_time_started: HashMap<(SpanIndex, u64), u64>,
}

impl TurbopackFormat {
    pub fn new(store: Arc<StoreContainer>) -> Self {
        Self {
            store,
            active_ids: HashMap::new(),
            queued_rows: HashMap::new(),
            outdated_spans: HashSet::new(),
            thread_stacks: HashMap::new(),
            thread_allocation_counters: HashMap::new(),
            self_time_started: HashMap::new(),
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
                let parent = if let Some(parent) = parent {
                    if let Some(parent) = self.active_ids.get(&parent) {
                        Some(*parent)
                    } else {
                        self.queued_rows
                            .entry(parent)
                            .or_default()
                            .push(TraceRow::Start {
                                ts,
                                id,
                                parent: Some(parent),
                                name: name.into_owned().into(),
                                target: target.into_owned().into(),
                                values: values
                                    .into_iter()
                                    .map(|(k, v)| (k.into_owned().into(), v.into_static()))
                                    .collect(),
                            });
                        return;
                    }
                } else {
                    None
                };
                let span_id = store.add_span(
                    parent,
                    ts,
                    target.into_owned(),
                    name.into_owned(),
                    values
                        .iter()
                        .map(|(k, v)| (k.to_string(), v.to_string()))
                        .collect(),
                    &mut self.outdated_spans,
                );
                self.active_ids.insert(id, span_id);
            }
            TraceRow::Record { id, values } => {
                let Some(&id) = self.active_ids.get(&id) else {
                    self.queued_rows
                        .entry(id)
                        .or_default()
                        .push(TraceRow::Record {
                            id,
                            values: values
                                .into_iter()
                                .map(|(k, v)| (k.into_owned().into(), v.into_static()))
                                .collect(),
                        });
                    return;
                };
                store.add_args(
                    id,
                    values
                        .iter()
                        .map(|(k, v)| (k.to_string(), v.to_string()))
                        .collect(),
                    &mut self.outdated_spans,
                );
            }
            TraceRow::End { ts: _, id } => {
                // id might be reused
                let index = self.active_ids.remove(&id);
                if let Some(index) = index {
                    store.complete_span(index);
                }
            }
            TraceRow::Enter { ts, id, thread_id } => {
                let Some(&id) = self.active_ids.get(&id) else {
                    self.queued_rows
                        .entry(id)
                        .or_default()
                        .push(TraceRow::Enter { ts, id, thread_id });
                    return;
                };
                let stack = self.thread_stacks.entry(thread_id).or_default();
                if let Some(&parent) = stack.last() {
                    if let Some(parent_start) = self.self_time_started.remove(&(parent, thread_id))
                    {
                        store.add_self_time(parent, parent_start, ts, &mut self.outdated_spans);
                    }
                }
                stack.push(id);
                self.self_time_started.insert((id, thread_id), ts);
            }
            TraceRow::Exit { ts, id, thread_id } => {
                let Some(&id) = self.active_ids.get(&id) else {
                    self.queued_rows
                        .entry(id)
                        .or_default()
                        .push(TraceRow::Exit { ts, id, thread_id });
                    return;
                };
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
                    store.add_self_time(id, start, ts, &mut self.outdated_spans);
                }
            }
            TraceRow::Event { ts, parent, values } => {
                let parent = if let Some(parent) = parent {
                    if let Some(parent) = self.active_ids.get(&parent) {
                        Some(*parent)
                    } else {
                        self.queued_rows
                            .entry(parent)
                            .or_default()
                            .push(TraceRow::Event {
                                ts,
                                parent: Some(parent),
                                values: values
                                    .into_iter()
                                    .map(|(k, v)| (k.into_owned().into(), v.into_static()))
                                    .collect(),
                            });
                        return;
                    }
                } else {
                    None
                };
                let mut values = values.into_iter().collect::<IndexMap<_, _>>();
                let duration = values
                    .remove("duration")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                let name = values
                    .remove("name")
                    .and_then(|v| v.as_str().map(|s| s.to_string()))
                    .unwrap_or("event".into());

                let id = store.add_span(
                    parent,
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
                        store.add_allocation(
                            id,
                            allocations,
                            allocation_count,
                            &mut self.outdated_spans,
                        );
                    }
                    if deallocations > 0 {
                        store.add_deallocation(
                            id,
                            deallocations,
                            deallocation_count,
                            &mut self.outdated_spans,
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
                        store.add_allocation(
                            id,
                            diff.allocations,
                            diff.allocation_count,
                            &mut self.outdated_spans,
                        );
                    }
                    if diff.deallocations > 0 {
                        store.add_deallocation(
                            id,
                            diff.deallocations,
                            diff.deallocation_count,
                            &mut self.outdated_spans,
                        );
                    }
                }
            }
        }
    }
}

impl TraceFormat for TurbopackFormat {
    fn read(&mut self, mut buffer: &[u8]) -> Result<usize> {
        let mut rows = Vec::new();
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
            let mut iter = rows.into_iter();
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
