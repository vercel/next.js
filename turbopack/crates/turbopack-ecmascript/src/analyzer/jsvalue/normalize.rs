use std::{hash::BuildHasherDefault, mem::take};

use rustc_hash::FxHasher;
use turbo_tasks::FxIndexSet;

use crate::analyzer::{
    JsValue,
    arena::{Arena, BumpVec},
    jsvalue::similar::SimilarJsValue,
};

// Alternatives management
impl<'a> JsValue<'a> {
    /// Add an alternative to the current value. Might be a no-op if the value
    /// already contains this alternative. Potentially expensive operation
    /// as it has to compare the value with all existing alternatives.
    pub(crate) fn add_alt(&mut self, arena: &'a Arena, v: Self) {
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
                values: arena.vec_from_iter([l, v]),
                logical_property: None,
            };
        }
    }
}

// Normalization
impl<'a> JsValue<'a> {
    /// Normalizes only the current node. Nested alternatives, concatenations,
    /// or operations are collapsed.
    pub fn normalize_shallow(&mut self, arena: &'a Arena) {
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
                    // Detach the children, leaving an empty (allocation-free) arena vec behind so
                    // we can rebuild `values` in place without a temporary system `Vec`.
                    let taken = std::mem::replace(values, arena.vec());
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
                        values.extend_in(arena, set.into_iter().map(|v| v.0));
                        self.update_total_nodes();
                    }
                }
            }
            JsValue::Concat(_, v) => {
                // TODO(kdy1): Remove duplicate
                // Detach the children (allocation-free) and rebuild, merging adjacent string
                // literals and dropping empty strings (the latter used to be a separate `retain`).
                let taken = std::mem::replace(v, arena.vec());
                let mut new: BumpVec<'a, JsValue<'a>> = arena.vec();
                for value in taken {
                    if value.as_str() == Some("") {
                        continue;
                    }
                    if let Some(str) = value.as_str() {
                        if let Some(last) = new.last_mut() {
                            if let Some(last_str) = last.as_str() {
                                *last = [last_str, str].concat().into();
                            } else {
                                new.push(arena, value);
                            }
                        } else {
                            new.push(arena, value);
                        }
                    } else if let JsValue::Concat(_, inner) = value {
                        new.extend_in(arena, inner);
                    } else {
                        new.push(arena, value);
                    }
                }
                if new.len() == 1 {
                    *self = new.into_iter().next().unwrap();
                } else {
                    v.extend_in(arena, new);
                    self.update_total_nodes();
                }
            }
            JsValue::Add(_, v) => {
                let taken = std::mem::replace(v, arena.vec());
                let mut added: BumpVec<'a, JsValue<'a>> = arena.vec();
                let mut iter = taken.into_iter();
                while let Some(item) = iter.next() {
                    if item.is_string() == Some(true) {
                        let mut concat: BumpVec<'a, JsValue<'a>> = match added.len() {
                            0 => arena.vec(),
                            1 => arena.vec_from_iter([added.into_iter().next().unwrap()]),
                            _ => {
                                let nodes = 1 + added.iter().map(|v| v.total_nodes()).sum::<u32>();
                                arena.vec_from_iter([JsValue::Add(nodes, added)])
                            }
                        };
                        concat.push(arena, item);
                        for item in iter.by_ref() {
                            concat.push(arena, item);
                        }
                        let nodes = 1 + concat.iter().map(|v| v.total_nodes()).sum::<u32>();
                        *self = JsValue::Concat(nodes, concat);
                        return;
                    } else {
                        added.push(arena, item);
                    }
                }
                if added.len() == 1 {
                    *self = added.into_iter().next().unwrap();
                } else {
                    v.extend_in(arena, added);
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
                    // Taking the old list (allocation-free) and constructing a new merged list
                    let taken = std::mem::replace(list, arena.vec());
                    for mut v in taken {
                        if let JsValue::Logical(_, inner_op, inner_list) = &mut v {
                            if inner_op == op {
                                let inner = std::mem::replace(inner_list, arena.vec());
                                list.extend_in(arena, inner);
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
    pub fn normalize(&mut self, arena: &'a Arena) {
        self.for_each_children_mut(&mut |child| {
            child.normalize(arena);
            true
        });
        self.normalize_shallow(arena);
    }
}

// Similarity
