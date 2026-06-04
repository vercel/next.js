use std::{hash::BuildHasherDefault, mem::take};

use rustc_hash::FxHasher;
use turbo_tasks::FxIndexSet;

use crate::analyzer::{Bump, BumpVec, JsValue, jsvalue::similar::SimilarJsValue};

// Alternatives management
impl<'a> JsValue<'a> {
    /// Add an alternative to the current value. Might be a no-op if the value
    /// already contains this alternative. Potentially expensive operation
    /// as it has to compare the value with all existing alternatives.
    pub(crate) fn add_alt(&mut self, arena: &'a Bump, v: Self) {
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
                values.push(arena, v);
            }
        } else {
            let l = take(self);
            *self = JsValue::Alternatives {
                total_nodes: 1 + l.total_nodes() + v.total_nodes(),
                values: BumpVec::from_iter_in(arena, [l, v]),
                logical_property: None,
            };
        }
    }
}

// Normalization
impl<'a> JsValue<'a> {
    /// Normalizes only the current node. Nested alternatives, concatenations,
    /// or operations are collapsed.
    pub fn normalize_shallow(&mut self, arena: &'a Bump) {
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
                    // Take the children out so we can rebuild `values` in place.
                    let taken = take(values);
                    for v in taken {
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
                        *values = BumpVec::from_iter_in(arena, set.into_iter().map(|v| v.0));
                        self.update_total_nodes();
                    }
                }
            }
            JsValue::Concat(_, v) => {
                // TODO(kdy1): Remove duplicate
                let taken = take(v);
                let mut new: BumpVec<JsValue> = BumpVec::with_capacity_in(arena, taken.len());
                for v in taken {
                    // Remove empty strings
                    if v.as_str() == Some("") {
                        continue;
                    }
                    if let Some(str) = v.as_str() {
                        if let Some(last) = new.last_mut() {
                            if let Some(last_str) = last.as_str() {
                                *last = [last_str, str].concat().into();
                            } else {
                                new.push(arena, v);
                            }
                        } else {
                            new.push(arena, v);
                        }
                    } else if let JsValue::Concat(_, v) = v {
                        new.extend(arena, v);
                    } else {
                        new.push(arena, v);
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
                let taken = take(v);
                let mut added: BumpVec<JsValue> = BumpVec::with_capacity_in(arena, taken.len());
                let mut iter = taken.into_iter();
                while let Some(item) = iter.next() {
                    if item.is_string() == Some(true) {
                        let mut concat: BumpVec<JsValue> = match added.len() {
                            0 => BumpVec::new(),
                            1 => BumpVec::from_iter_in(arena, [added.into_iter().next().unwrap()]),
                            _ => BumpVec::from_iter_in(
                                arena,
                                [JsValue::Add(
                                    1 + added.iter().map(|v| v.total_nodes()).sum::<u32>(),
                                    added,
                                )],
                            ),
                        };
                        concat.push(arena, item);
                        concat.extend(arena, iter);
                        *self = JsValue::Concat(
                            1 + concat.iter().map(|v| v.total_nodes()).sum::<u32>(),
                            concat,
                        );
                        return;
                    } else {
                        added.push(arena, item);
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
                    let taken = take(list);
                    for mut v in taken {
                        if let JsValue::Logical(_, inner_op, inner_list) = &mut v {
                            if inner_op == op {
                                list.extend(arena, take(inner_list));
                            } else {
                                list.push(arena, v);
                            }
                        } else {
                            list.push(arena, v);
                        }
                    }
                    self.update_total_nodes();
                }
            _ => {}
        }
    }

    /// Normalizes the current node and all nested nodes.
    pub fn normalize(&mut self, arena: &'a Bump) {
        self.for_each_children_mut(&mut |child| {
            child.normalize(arena);
            true
        });
        self.normalize_shallow(arena);
    }
}

// Similarity
