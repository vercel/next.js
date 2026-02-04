use std::{borrow::Cow, fmt::Display, sync::Arc};

use rustc_hash::{FxHashMap, FxHashSet};
use serde::Deserialize;

use super::TraceFormat;
use crate::{FxIndexMap, span::SpanIndex, store_container::StoreContainer, timestamp::Timestamp};

pub struct NextJsFormat {
    store: Arc<StoreContainer>,
    id_mapping: FxHashMap<u64, SpanIndex>,
    queued_children: FxHashMap<u64, Vec<SpanIndex>>,
}

impl NextJsFormat {
    pub fn new(store: Arc<StoreContainer>) -> Self {
        Self {
            store,
            id_mapping: FxHashMap::default(),
            queued_children: FxHashMap::default(),
        }
    }
}

impl TraceFormat for NextJsFormat {
    type Reused = ();

    fn read(&mut self, mut buffer: &[u8], _reuse: &mut Self::Reused) -> anyhow::Result<usize> {
        let mut bytes_read = 0;
        let mut outdated_spans = FxHashSet::default();
        loop {
            let Some(line_end) = buffer.iter().position(|b| *b == b'\n') else {
                break;
            };
            let line = &buffer[..line_end];
            buffer = &buffer[line_end + 1..];
            bytes_read += line.len() + 1;

            let spans: Vec<NextJsSpan> = serde_json::from_slice(line)?;

            let mut store = self.store.write();

            for span in spans {
                let NextJsSpan {
                    name,
                    duration,
                    timestamp,
                    id,
                    parent_id,
                    tags,
                    start_time: _,
                    trace_id: _,
                } = span;
                let timestamp = Timestamp::from_micros(timestamp);
                let duration = Timestamp::from_micros(duration);
                let (parent, queue_parent) = if let Some(parent) = parent_id {
                    if let Some(parent) = self.id_mapping.get(&parent) {
                        (Some(*parent), None)
                    } else {
                        (None, Some(parent))
                    }
                } else {
                    (None, None)
                };
                let index = store.add_span(
                    parent,
                    timestamp,
                    "nextjs".to_string(),
                    name.into_owned(),
                    tags.iter()
                        .map(|(k, v)| {
                            (
                                k.to_string(),
                                v.as_ref().map(|v| v.to_string()).unwrap_or_default(),
                            )
                        })
                        .collect(),
                    &mut outdated_spans,
                );
                self.id_mapping.insert(id, index);
                if let Some(parent) = queue_parent {
                    self.queued_children.entry(parent).or_default().push(index);
                }
                if let Some(children) = self.queued_children.remove(&id) {
                    for child in children {
                        store.set_parent(child, index, &mut outdated_spans);
                    }
                }
                store.set_total_time(index, timestamp, duration, &mut outdated_spans);
                store.complete_span(index);
            }
            store.invalidate_outdated_spans(&outdated_spans);
            drop(store);
        }
        Ok(bytes_read)
    }
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum TagValue<'a> {
    String(Cow<'a, str>),
    Number(f64),
    Bool(bool),
    Array(Vec<TagValue<'a>>),
}

impl Display for TagValue<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TagValue::String(s) => write!(f, "{s}"),
            TagValue::Number(n) => write!(f, "{n}"),
            TagValue::Bool(b) => write!(f, "{b}"),
            TagValue::Array(a) => {
                write!(f, "[")?;
                for (i, v) in a.iter().enumerate() {
                    if i > 0 {
                        write!(f, ", ")?;
                    }
                    write!(f, "{v}")?;
                }
                write!(f, "]")
            }
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NextJsSpan<'a> {
    name: Cow<'a, str>,
    duration: u64,
    timestamp: u64,
    id: u64,
    parent_id: Option<u64>,
    tags: FxIndexMap<Cow<'a, str>, Option<TagValue<'a>>>,
    #[allow(dead_code)]
    start_time: u64,
    #[allow(dead_code)]
    trace_id: Cow<'a, str>,
}
