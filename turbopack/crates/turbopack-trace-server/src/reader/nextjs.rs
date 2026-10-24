use std::{borrow::Cow, fmt::Display, sync::Arc};

use rustc_hash::{FxHashMap, FxHashSet};
use serde::Deserialize;
use turbo_rcstr::{RcStr, rcstr};

use super::TraceFormat;
use crate::{FxIndexMap, span::SpanIndex, store_container::StoreContainer, timestamp::Timestamp};

pub struct NextJsFormat {
    store: Arc<StoreContainer>,
    id_mapping: FxHashMap<NextJsSpanId, SpanIndex>,
    queued_children: FxHashMap<NextJsSpanId, Vec<SpanIndex>>,
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
        while let Some(line_end) = buffer.iter().position(|b| *b == b'\n') {
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
                    rcstr!("nextjs"),
                    RcStr::from(name.into_owned()),
                    tags.iter()
                        .map(|(k, v)| {
                            (
                                RcStr::from(k.as_ref()),
                                RcStr::from(v.as_ref().map(|v| v.to_string()).unwrap_or_default()),
                            )
                        })
                        .collect(),
                    &mut outdated_spans,
                );
                if let Some(parent) = queue_parent {
                    self.queued_children.entry(parent).or_default().push(index);
                }
                if let Some(children) = self.queued_children.remove(&id) {
                    for child in children {
                        store.set_parent(child, index, &mut outdated_spans);
                    }
                }
                self.id_mapping.insert(id, index);
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

#[derive(Debug, Deserialize, PartialEq, Eq, Hash)]
#[serde(untagged)]
enum NextJsSpanId {
    Number(u64),
    String(RcStr),
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NextJsSpan<'a> {
    name: Cow<'a, str>,
    duration: u64,
    timestamp: u64,
    id: NextJsSpanId,
    parent_id: Option<NextJsSpanId>,
    tags: FxIndexMap<Cow<'a, str>, Option<TagValue<'a>>>,
    // Emitted by Next.js trace and Vercel CLI trace
    // start_time: u64,
    // Emitted by Next.js trace
    // trace_id: Cow<'a, str>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{server::ViewRect, viewer::Viewer};

    #[test]
    fn timeline_uses_parent_self_time_gaps_and_live_json_updates() {
        let store = Arc::new(StoreContainer::new());
        let mut format = NextJsFormat::new(store.clone());
        // The parent arrives after its children, as in completed JSON spans.
        let data = b"[{\"name\":\"child-a\",\"timestamp\":120,\"duration\":20,\"id\":2,\"parentId\":1,\"tags\":{}},{\"name\":\"child-b\",\"timestamp\":160,\"duration\":20,\"id\":3,\"parentId\":1,\"tags\":{}},{\"name\":\"parent\",\"timestamp\":100,\"duration\":100,\"id\":1,\"tags\":{}}]\n";
        assert_eq!(format.read(data, &mut ()).unwrap(), data.len());
        let rect = ViewRect {
            x: 0,
            y: 0,
            width: 20000,
            height: 100,
            horizontal_pixels: 20000,
            query: String::new(),
            view_mode: "timeline".into(),
            value_mode: "duration".into(),
            value_filter: None,
            count_filter: None,
        };
        let mut viewer = Viewer::new();
        let update = viewer.compute_update(&store.read(), &rect);
        assert_eq!(update.count, 1); // children replace parent CPU time, not overlap it
        assert_eq!(update.max, 10000);
        let lines = serde_json::to_value(&update.lines).unwrap();
        let spans = lines[0]["spans"].as_array().unwrap();
        let mut segments: Vec<_> = spans
            .iter()
            .map(|s| {
                (
                    s["t"].as_str().unwrap(),
                    s["x"].as_u64().unwrap(),
                    s["w"].as_u64().unwrap(),
                )
            })
            .collect();
        segments.sort_unstable();
        assert_eq!(
            segments,
            [
                ("child-a", 2000, 2000),
                ("child-b", 6000, 2000),
                ("parent", 0, 2000),
                ("parent", 4000, 2000),
                ("parent", 8000, 2000),
            ]
        );
        let parent_ids: Vec<_> = spans
            .iter()
            .filter(|s| s["t"] == "parent")
            .map(|s| &s["id"])
            .collect();
        assert_eq!(parent_ids.len(), 3);
        assert!(parent_ids.iter().all(|id| *id == parent_ids[0]));
        let next =
            b"[{\"name\":\"later\",\"timestamp\":220,\"duration\":10,\"id\":4,\"tags\":{}}]\n";
        // An unfinished JSON record cannot alter the tree.
        assert_eq!(format.read(&next[..next.len() - 1], &mut ()).unwrap(), 0);
        assert_eq!(format.read(next, &mut ()).unwrap(), next.len());
        viewer.invalidate_timeline();
        let update = viewer.compute_update(&store.read(), &rect);
        assert_eq!(update.max, 13000);
        let lines = serde_json::to_value(&update.lines).unwrap();
        assert_eq!(
            lines[0]["spans"].as_array().unwrap().last().unwrap()["x"],
            12000
        );
    }
}
