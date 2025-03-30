use std::{env, sync::Arc};

use rustc_hash::FxHashMap;

use crate::{
    span::{SpanBottomUp, SpanIndex},
    span_ref::SpanRef,
};

pub struct SpanBottomUpBuilder {
    // These values won't change after creation:
    pub self_spans: Vec<SpanIndex>,
    pub children: FxHashMap<String, SpanBottomUpBuilder>,
    pub example_span: SpanIndex,
}

impl SpanBottomUpBuilder {
    pub fn new(example_span: SpanIndex) -> Self {
        Self {
            self_spans: vec![],
            children: FxHashMap::default(),
            example_span,
        }
    }

    pub fn build(self) -> SpanBottomUp {
        SpanBottomUp::new(
            self.self_spans,
            self.example_span,
            self.children
                .into_values()
                .map(|child| Arc::new(child.build()))
                .collect(),
        )
    }
}

pub fn build_bottom_up_graph<'a>(
    spans: impl Iterator<Item = SpanRef<'a>>,
) -> Vec<Arc<SpanBottomUp>> {
    let max_depth = env::var("BOTTOM_UP_DEPTH")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(usize::MAX);
    let mut roots = FxHashMap::default();

    // unfortunately there is a rustc bug that fails the typechecking here
    // when using Either<impl Iterator, impl Iterator>. This error appears
    // in certain cases when building next-swc.
    //
    // see here: https://github.com/rust-lang/rust/issues/124891
    let mut current_iterators: Vec<Box<dyn Iterator<Item = SpanRef<'_>>>> =
        vec![Box::new(spans.flat_map(|span| span.children()))];

    let mut current_path: Vec<(&'_ str, SpanIndex)> = vec![];
    while let Some(mut iter) = current_iterators.pop() {
        if let Some(child) = iter.next() {
            current_iterators.push(iter);

            let name = child.group_name();
            let (_, mut bottom_up) = roots
                .raw_entry_mut()
                .from_key(name)
                .or_insert_with(|| (name.to_string(), SpanBottomUpBuilder::new(child.index())));
            bottom_up.self_spans.push(child.index());
            let mut prev = None;
            for &(name, example_span) in current_path.iter().rev().take(max_depth) {
                if prev == Some(name) {
                    continue;
                }
                let (_, child_bottom_up) = bottom_up
                    .children
                    .raw_entry_mut()
                    .from_key(name)
                    .or_insert_with(|| (name.to_string(), SpanBottomUpBuilder::new(example_span)));
                child_bottom_up.self_spans.push(child.index());
                bottom_up = child_bottom_up;
                prev = Some(name);
            }

            current_path.push((child.group_name(), child.index()));
            current_iterators.push(Box::new(child.children()));
        } else {
            current_path.pop();
        }
    }
    roots.into_values().map(|b| Arc::new(b.build())).collect()
}
