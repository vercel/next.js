use std::{hash::BuildHasherDefault, mem::take};

use rustc_hash::FxHasher;
use turbo_tasks::FxIndexSet;

use crate::analyzer::{JsValue, jsvalue::similar::SimilarJsValue};

// Alternatives management
impl JsValue {
    /// Add an alternative to the current value. Might be a no-op if the value
    /// already contains this alternative. Potentially expensive operation
    /// as it has to compare the value with all existing alternatives.
    pub(crate) fn add_alt(&mut self, v: Self) {
        if self == &v {
            return;
        }

        if let JsValue::Alternatives {
            total_nodes: c,
            values,
            logical_property: _,
        } = self
        {
            if !values.contains(&v) {
                *c += v.total_nodes();
                values.push(v);
            }
        } else {
            let l = take(self);
            *self = JsValue::Alternatives {
                total_nodes: 1 + l.total_nodes() + v.total_nodes(),
                values: vec![l, v],
                logical_property: None,
            };
        }
    }
}

// Normalization
impl JsValue {
    /// Normalizes only the current node. Nested alternatives, concatenations,
    /// or operations are collapsed.
    pub fn normalize_shallow(&mut self) {
        match self {
            JsValue::Alternatives {
                total_nodes: _,
                values,
                logical_property: _,
            } => {
                if values.len() == 1 {
                    *self = take(&mut values[0]);
                } else {
                    let mut set = FxIndexSet::with_capacity_and_hasher(
                        values.len(),
                        BuildHasherDefault::<FxHasher>::default(),
                    );
                    for v in take(values) {
                        match v {
                            JsValue::Alternatives {
                                total_nodes: _,
                                values,
                                logical_property: _,
                            } => {
                                for v in values {
                                    set.insert(SimilarJsValue(v));
                                }
                            }
                            v => {
                                set.insert(SimilarJsValue(v));
                            }
                        }
                    }
                    if set.len() == 1 {
                        *self = set.into_iter().next().unwrap().0;
                    } else {
                        *values = set.into_iter().map(|v| v.0).collect();
                        self.update_total_nodes();
                    }
                }
            }
            JsValue::Concat(_, v) => {
                // Remove empty strings
                v.retain(|v| v.as_str() != Some(""));

                // TODO(kdy1): Remove duplicate
                let mut new: Vec<JsValue> = vec![];
                for v in take(v) {
                    if let Some(str) = v.as_str() {
                        if let Some(last) = new.last_mut() {
                            if let Some(last_str) = last.as_str() {
                                *last = [last_str, str].concat().into();
                            } else {
                                new.push(v);
                            }
                        } else {
                            new.push(v);
                        }
                    } else if let JsValue::Concat(_, v) = v {
                        new.extend(v);
                    } else {
                        new.push(v);
                    }
                }
                if new.len() == 1 {
                    *self = new.into_iter().next().unwrap();
                } else {
                    *v = new;
                    self.update_total_nodes();
                }
            }
            JsValue::Add(_, v) => {
                let mut added: Vec<JsValue> = Vec::new();
                let mut iter = take(v).into_iter();
                while let Some(item) = iter.next() {
                    if item.is_string() == Some(true) {
                        let mut concat = match added.len() {
                            0 => Vec::new(),
                            1 => vec![added.into_iter().next().unwrap()],
                            _ => vec![JsValue::Add(
                                1 + added.iter().map(|v| v.total_nodes()).sum::<u32>(),
                                added,
                            )],
                        };
                        concat.push(item);
                        for item in iter.by_ref() {
                            concat.push(item);
                        }
                        *self = JsValue::Concat(
                            1 + concat.iter().map(|v| v.total_nodes()).sum::<u32>(),
                            concat,
                        );
                        return;
                    } else {
                        added.push(item);
                    }
                }
                if added.len() == 1 {
                    *self = added.into_iter().next().unwrap();
                } else {
                    *v = added;
                    self.update_total_nodes();
                }
            }
            JsValue::Logical(_, op, list)
                // Nested logical expressions can be normalized: e. g. `a && (b && c)` => `a &&
                // b && c`
                if list.iter().any(|v| {
                    if let JsValue::Logical(_, inner_op, _) = v {
                        inner_op == op
                    } else {
                        false
                    }
                }) => {
                    // Taking the old list and constructing a new merged list
                    for mut v in take(list).into_iter() {
                        if let JsValue::Logical(_, inner_op, inner_list) = &mut v {
                            if inner_op == op {
                                list.append(inner_list);
                            } else {
                                list.push(v);
                            }
                        } else {
                            list.push(v);
                        }
                    }
                    self.update_total_nodes();
                }
            _ => {}
        }
    }

    /// Normalizes the current node and all nested nodes.
    pub fn normalize(&mut self) {
        self.for_each_children_mut(&mut |child| {
            child.normalize();
            true
        });
        self.normalize_shallow();
    }
}

// Similarity
