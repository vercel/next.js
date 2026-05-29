use std::hash::Hash;

use crate::analyzer::{CallList, JsValue, MemberCallList, ModuleValue, ObjectPart};

// Like equality, but with depth limit
impl<'a> JsValue<'a> {
    pub(super) fn all_similar(a: &[JsValue<'a>], b: &[JsValue<'a>], depth: usize) -> bool {
        if a.len() != b.len() {
            return false;
        }
        a.iter().zip(b.iter()).all(|(a, b)| a.similar(b, depth))
    }
    /// Check if the values are equal up to the given depth. Might return false
    /// even if the values are equal when hitting the depth limit.
    fn similar(&self, other: &JsValue<'a>, depth: usize) -> bool {
        if depth == 0 {
            return false;
        }

        fn all_parts_similar<'b>(a: &[ObjectPart<'b>], b: &[ObjectPart<'b>], depth: usize) -> bool {
            if a.len() != b.len() {
                return false;
            }
            a.iter().zip(b.iter()).all(|(a, b)| match (a, b) {
                (ObjectPart::KeyValue(lk, lv), ObjectPart::KeyValue(rk, rv)) => {
                    lk.similar(rk, depth) && lv.similar(rv, depth)
                }
                (ObjectPart::Spread(l), ObjectPart::Spread(r)) => l.similar(r, depth),
                _ => false,
            })
        }
        match (self, other) {
            (JsValue::Constant(l), JsValue::Constant(r)) => l == r,
            (
                JsValue::Array {
                    total_nodes: lc,
                    items: li,
                    mutable: lm,
                },
                JsValue::Array {
                    total_nodes: rc,
                    items: ri,
                    mutable: rm,
                },
            ) => lc == rc && lm == rm && Self::all_similar(li, ri, depth - 1),
            (
                JsValue::Object {
                    total_nodes: lc,
                    parts: lp,
                    mutable: lm,
                },
                JsValue::Object {
                    total_nodes: rc,
                    parts: rp,
                    mutable: rm,
                },
            ) => lc == rc && lm == rm && all_parts_similar(lp, rp, depth - 1),
            (JsValue::Url(l, kl), JsValue::Url(r, kr)) => l == r && kl == kr,
            (
                JsValue::Alternatives {
                    total_nodes: lc,
                    values: l,
                    logical_property: lp,
                },
                JsValue::Alternatives {
                    total_nodes: rc,
                    values: r,
                    logical_property: rp,
                },
            ) => lc == rc && Self::all_similar(l, r, depth - 1) && lp == rp,
            (JsValue::FreeVar(l), JsValue::FreeVar(r)) => l == r,
            (JsValue::Variable(l), JsValue::Variable(r)) => l == r,
            (JsValue::Concat(lc, l), JsValue::Concat(rc, r)) => {
                lc == rc && Self::all_similar(l, r, depth - 1)
            }
            (JsValue::Add(lc, l), JsValue::Add(rc, r)) => {
                lc == rc && Self::all_similar(l, r, depth - 1)
            }
            (JsValue::Logical(lc, lo, l), JsValue::Logical(rc, ro, r)) => {
                lc == rc && lo == ro && Self::all_similar(l, r, depth - 1)
            }
            (JsValue::Not(lc, l), JsValue::Not(rc, r)) => lc == rc && l.similar(r, depth - 1),
            (JsValue::New(lc, ll), JsValue::New(rc, rl)) => {
                lc == rc && CallList::all_similar(ll, rl, depth - 1)
            }
            (JsValue::Call(lc, ll), JsValue::Call(rc, rl)) => {
                lc == rc && CallList::all_similar(ll, rl, depth - 1)
            }
            (JsValue::MemberCall(lc, ll), JsValue::MemberCall(rc, rl)) => {
                lc == rc && MemberCallList::all_similar(ll, rl, depth - 1)
            }
            (JsValue::Member(lc, lo, lp), JsValue::Member(rc, ro, rp)) => {
                lc == rc && lo.similar(ro, depth - 1) && lp.similar(rp, depth - 1)
            }
            (JsValue::Binary(lc, la, lo, lb), JsValue::Binary(rc, ra, ro, rb)) => {
                lc == rc && lo == ro && la.similar(ra, depth - 1) && lb.similar(rb, depth - 1)
            }
            (
                JsValue::Module(ModuleValue {
                    module: l,
                    annotations: la,
                }),
                JsValue::Module(ModuleValue {
                    module: r,
                    annotations: ra,
                }),
            ) => l == r && la == ra,
            (JsValue::WellKnownObject(l), JsValue::WellKnownObject(r)) => l == r,
            (JsValue::WellKnownFunction(l), JsValue::WellKnownFunction(r)) => l == r,
            (
                JsValue::Unknown {
                    original_value: _,
                    reason: l,
                    has_side_effects: ls,
                },
                JsValue::Unknown {
                    original_value: _,
                    reason: r,
                    has_side_effects: rs,
                },
            ) => l == r && ls == rs,
            (JsValue::Function(lc, _, l), JsValue::Function(rc, _, r)) => {
                lc == rc && l.similar(r, depth - 1)
            }
            (JsValue::Argument(li, l), JsValue::Argument(ri, r)) => li == ri && l == r,
            _ => false,
        }
    }

    /// Hashes the value up to the given depth.
    fn similar_hash<H: std::hash::Hasher>(&self, state: &mut H, depth: usize) {
        if depth == 0 {
            self.total_nodes().hash(state);
            return;
        }

        fn all_similar_hash<H: std::hash::Hasher>(
            slice: &[JsValue<'_>],
            state: &mut H,
            depth: usize,
        ) {
            for item in slice {
                item.similar_hash(state, depth);
            }
        }

        fn all_parts_similar_hash<H: std::hash::Hasher>(
            slice: &[ObjectPart<'_>],
            state: &mut H,
            depth: usize,
        ) {
            for item in slice {
                match item {
                    ObjectPart::KeyValue(key, value) => {
                        key.similar_hash(state, depth);
                        value.similar_hash(state, depth);
                    }
                    ObjectPart::Spread(value) => {
                        value.similar_hash(state, depth);
                    }
                }
            }
        }

        match self {
            JsValue::Constant(v) => Hash::hash(v, state),
            JsValue::Object { parts, .. } => all_parts_similar_hash(parts, state, depth - 1),
            JsValue::Url(v, kind) => {
                Hash::hash(v, state);
                Hash::hash(kind, state);
            }
            JsValue::FreeVar(v) => Hash::hash(v, state),
            JsValue::Variable(v) => Hash::hash(v, state),
            JsValue::Array { items: v, .. }
            | JsValue::Alternatives {
                total_nodes: _,
                values: v,
                logical_property: _,
            }
            | JsValue::Concat(_, v)
            | JsValue::Add(_, v)
            | JsValue::Logical(_, _, v) => all_similar_hash(v, state, depth - 1),
            JsValue::Not(_, v) => v.similar_hash(state, depth - 1),
            JsValue::New(_, call) => {
                call.for_each_children(&mut |child: &JsValue<'_>| {
                    child.similar_hash(state, depth - 1);
                });
            }
            JsValue::Call(_, call) => {
                call.for_each_children(&mut |child: &JsValue<'_>| {
                    child.similar_hash(state, depth - 1);
                });
            }
            JsValue::SuperCall(_, args) => {
                all_similar_hash(args, state, depth - 1);
            }
            JsValue::MemberCall(_, call) => {
                call.for_each_children(&mut |child: &JsValue<'_>| {
                    child.similar_hash(state, depth - 1);
                });
            }
            JsValue::Member(_, o, p) => {
                o.similar_hash(state, depth - 1);
                p.similar_hash(state, depth - 1);
            }
            JsValue::Binary(_, a, o, b) => {
                a.similar_hash(state, depth - 1);
                o.hash(state);
                b.similar_hash(state, depth - 1);
            }
            JsValue::Tenary(_, test, cons, alt) => {
                test.similar_hash(state, depth - 1);
                cons.similar_hash(state, depth - 1);
                alt.similar_hash(state, depth - 1);
            }
            JsValue::Iterated(_, operand)
            | JsValue::TypeOf(_, operand)
            | JsValue::Promise(_, operand)
            | JsValue::Awaited(_, operand) => {
                operand.similar_hash(state, depth - 1);
            }
            JsValue::Module(ModuleValue {
                module: v,
                annotations: a,
            }) => {
                Hash::hash(v, state);
                Hash::hash(a, state);
            }
            JsValue::WellKnownObject(v) => Hash::hash(v, state),
            JsValue::WellKnownFunction(v) => Hash::hash(v, state),
            JsValue::Unknown {
                original_value: _,
                reason: v,
                has_side_effects,
            } => {
                Hash::hash(v, state);
                Hash::hash(has_side_effects, state);
            }
            JsValue::Function(_, _, v) => v.similar_hash(state, depth - 1),
            JsValue::Argument(i, v) => {
                Hash::hash(i, state);
                Hash::hash(v, state);
            }
        }
    }
}

/// The depth to use when comparing values for similarity.
const SIMILAR_EQ_DEPTH: usize = 3;
/// The depth to use when hashing values for similarity.
const SIMILAR_HASH_DEPTH: usize = 2;

/// A wrapper around `JsValue` that implements `PartialEq` and `Hash` by
/// comparing the values with a depth of [SIMILAR_EQ_DEPTH] and hashing values
/// with a depth of [SIMILAR_HASH_DEPTH].
pub(super) struct SimilarJsValue<'a>(pub(super) JsValue<'a>);

impl PartialEq for SimilarJsValue<'_> {
    fn eq(&self, other: &Self) -> bool {
        self.0.similar(&other.0, SIMILAR_EQ_DEPTH)
    }
}

impl Eq for SimilarJsValue<'_> {}

impl Hash for SimilarJsValue<'_> {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.0.similar_hash(state, SIMILAR_HASH_DEPTH)
    }
}
