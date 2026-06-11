use std::{
    fmt::{self},
    hash::Hash,
    mem::take,
    sync::Arc,
};

use anyhow::Result;
use bumpalo::boxed::Box as BumpBox;
use num_bigint::BigInt;
use smallvec::SmallVec;
use swc_core::ecma::{ast::Id, atoms::Atom};
use turbo_rcstr::{RcStr, rcstr};
use turbopack_core::compile_time_info::{
    CompileTimeDefineValue, DefinableNameSegmentRef, DefinableNameSegmentRefs, FreeVarReference,
};

use crate::analyzer::{
    Bump, BumpVec, WellKnownFunctionKind, WellKnownObjectKind,
    graph::{EvalContext, VarGraph},
};

mod constants;
mod display;
mod explain;
mod normalize;
mod predicates;
mod similar;
mod traverse;

use constants::JsValueMetaKind;
pub use constants::*;

/// Sum of [`JsValue::total_nodes`] across a slice of values.
fn total_nodes(vec: &[JsValue<'_>]) -> u32 {
    vec.iter().map(|v| v.total_nodes()).sum::<u32>()
}

/// Join `items` for display, switching to a multi-line layout when the content
/// is long. Shared by the `Display` impl and the `explain` formatting.
fn pretty_join(
    items: &[String],
    indent_depth: usize,
    single_line_separator: &str,
    multi_line_separator_end: &str,
    multi_line_separator_start: &str,
) -> String {
    let multi_line = items
        .iter()
        .any(|item| item.len() > 50 || item.contains('\n'))
        || items
            .iter()
            .map(|item| item.len() + single_line_separator.len())
            .sum::<usize>()
            > 100;
    if !multi_line {
        items.join(single_line_separator)
    } else if multi_line_separator_start.is_empty() {
        format!(
            "\n{}{}\n{}",
            "    ".repeat(indent_depth + 1),
            items.join(&format!(
                "{multi_line_separator_end}\n{}",
                "    ".repeat(indent_depth + 1)
            )),
            "    ".repeat(indent_depth)
        )
    } else {
        format!(
            "\n{}{multi_line_separator_start}{}\n{}",
            " ".repeat(indent_depth * 4 + 4 - multi_line_separator_start.len()),
            items.join(&format!(
                "{multi_line_separator_end}\n{}{multi_line_separator_start}",
                " ".repeat(indent_depth * 4 + 4 - multi_line_separator_start.len())
            )),
            "    ".repeat(indent_depth)
        )
    }
}

/// TODO: Use `Arc`
///
/// There are 4 kinds of values: Leaves, Nested, Operations, and Placeholders
/// (see `JsValueMetaKind` for details). Values are processed in two phases:
/// - Analyze phase: We convert AST into `JsValue`s. We don't have contextual information so we need
///   to insert placeholders to represent that.
/// - Link phase: We try to reduce a value to a constant value. The link phase has 5 substeps that
///   are executed on each node in the graph depth-first. When a value is modified, we need to visit
///   the new children again.
/// - Replace variables with their values. This replaces [JsValue::Variable]. No variable should be
///   remaining after that.
/// - Replace placeholders with contextual information. This usually replaces [JsValue::FreeVar] and
///   [JsValue::Module]. Some [JsValue::Call] on well- known functions might also be replaced. No
///   free vars or modules should be remaining after that.
/// - Replace operations on well-known objects and functions. This handles [JsValue::Call] and
///   [JsValue::Member] on well-known objects and functions.
/// - Replace all built-in functions with their values when they are compile-time constant.
/// - For optimization, any nested operations are replaced with [JsValue::Unknown]. So only one
///   layer of operation remains. Any remaining operation or placeholder can be treated as unknown.
#[derive(Debug, Hash, PartialEq)]
pub enum JsValue<'a> {
    // LEAF VALUES
    // ----------------------------
    /// A constant primitive value.
    Constant(ConstantValue),
    /// A constant URL object.
    Url(ConstantString, JsValueUrlKind),
    /// Some kind of well-known object
    /// (must not be an array, otherwise Array.concat needs to be changed)
    WellKnownObject(WellKnownObjectKind),
    /// Some kind of well-known function
    WellKnownFunction(WellKnownFunctionKind<'a>),
    /// Not-analyzable value. Might contain the original value for additional
    /// info. Has a reason string for explanation.
    Unknown {
        original_value: Option<Arc<JsValue<'a>>>,
        reason: RcStr,
        has_side_effects: bool,
    },

    // NESTED VALUES
    // ----------------------------
    /// An array of nested values
    Array {
        total_nodes: u32,
        items: BumpVec<'a, JsValue<'a>>,
        mutable: bool,
    },
    /// An object of nested values
    Object {
        total_nodes: u32,
        parts: BumpVec<'a, ObjectPart<'a>>,
        mutable: bool,
    },
    /// A list of alternative values
    Alternatives {
        total_nodes: u32,
        values: BumpVec<'a, JsValue<'a>>,
        logical_property: Option<LogicalProperty>,
    },
    /// A function reference. The return value might contain [JsValue::Argument]
    /// placeholders that need to be replaced when calling this function.
    /// `(total_node_count, func_ident, return_value)`
    Function(u32, u32, BumpBox<'a, JsValue<'a>>),

    // OPERATIONS
    // ----------------------------
    /// A string concatenation of values.
    /// `foo.${unknownVar}.js` => 'foo' + Unknown + '.js'
    Concat(u32, BumpVec<'a, JsValue<'a>>),
    /// An addition of values.
    /// This can be converted to [JsValue::Concat] if the type of the variable
    /// is string.
    Add(u32, BumpVec<'a, JsValue<'a>>),
    /// Logical negation `!expr`
    Not(u32, BumpBox<'a, JsValue<'a>>),
    /// Logical operator chain e. g. `expr && expr`
    Logical(u32, LogicalOperator, BumpVec<'a, JsValue<'a>>),
    /// Binary expression e. g. `expr == expr`
    Binary(
        u32,
        BumpBox<'a, JsValue<'a>>,
        BinaryOperator,
        BumpBox<'a, JsValue<'a>>,
    ),
    /// A constructor call. `(total_node_count, list)` — see [`CallList`].
    New(u32, CallList<'a>),
    /// A function call without a `this` context. `(total_node_count, list)` — see [`CallList`].
    Call(u32, CallList<'a>),
    /// A super call to the parent constructor.
    /// `(total_node_count, args)`
    SuperCall(u32, BumpBox<'a, [JsValue<'a>]>),
    /// A function call with a `this` context. `(total_node_count, list)` — see [`MemberCallList`].
    MemberCall(u32, MemberCallList<'a>),
    /// A member access `obj[prop]`
    /// `(total_node_count, obj, prop)`
    Member(u32, BumpBox<'a, JsValue<'a>>, BumpBox<'a, JsValue<'a>>),
    /// A tenary operator `test ? cons : alt`
    /// `(total_node_count, test, cons, alt)`
    Tenary(
        u32,
        BumpBox<'a, JsValue<'a>>,
        BumpBox<'a, JsValue<'a>>,
        BumpBox<'a, JsValue<'a>>,
    ),
    /// A promise resolving to some value
    /// `(total_node_count, value)`
    Promise(u32, BumpBox<'a, JsValue<'a>>),
    /// An await call (potentially) unwrapping a promise.
    /// `(total_node_count, value)`
    Awaited(u32, BumpBox<'a, JsValue<'a>>),

    /// A for-of loop
    ///
    /// `(total_node_count, iterable)`
    Iterated(u32, BumpBox<'a, JsValue<'a>>),

    /// A `typeof` expression.
    ///
    /// `(total_node_count, operand)`
    TypeOf(u32, BumpBox<'a, JsValue<'a>>),

    // PLACEHOLDERS
    // ----------------------------
    /// A reference to a variable.
    Variable(Id),
    /// A reference to an function argument.
    /// (func_ident, arg_index)
    Argument(u32, usize),
    // TODO no predefined kinds, only Atom
    /// A reference to a free variable.
    FreeVar(Atom),
    /// This is a reference to a imported module.
    Module(ModuleValue),
}

/// Storage for [`JsValue::MemberCall`]: `[args..., prop, obj]`.
///
/// The reversed layout (obj/prop at the tail) is what makes the `replace_builtin`
/// fallthrough path cheap: `pop` obj, `pop` prop, and the remaining `Vec` **is** the args
/// `Vec` with no reallocation.
///
/// The custom `Debug` impl re-emits the pre-refactor derived shape
/// (`MemberCall(total, obj, prop, [args])`) by writing obj/prop/args as siblings inside the
/// parent's `debug_tuple`. This keeps fixture snapshots identical to the 4-tuple-payload
/// version without forcing a hand-written `Debug` on every `JsValue` arm.
#[derive(Hash, PartialEq)]
pub struct MemberCallList<'a>(BumpVec<'a, JsValue<'a>>);

impl fmt::Debug for MemberCallList<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Layout: [args..., prop, obj]
        let n = self.0.len();
        let obj = &self.0[n - 1];
        let prop = &self.0[n - 2];
        let args = &self.0[..n - 2];
        if f.alternate() {
            // The parent `debug_tuple` writes the field's leading indent for us (via
            // PadAdapter) and appends `,\n` after we return. Emitting
            // `<obj>,\n<prop>,\n<args>` with no trailing comma makes us appear as three
            // sibling fields in the parent's pretty-print output.
            writeln!(f, "{obj:#?},")?;
            writeln!(f, "{prop:#?},")?;
            write!(f, "{args:#?}")
        } else {
            write!(f, "{obj:?}, {prop:?}, {args:?}")
        }
    }
}

impl<'a> MemberCallList<'a> {
    fn from_parts(
        arena: &'a Bump,
        obj: JsValue<'a>,
        prop: JsValue<'a>,
        args: BumpVec<'a, JsValue<'a>>,
    ) -> Self {
        let mut list = args;
        list.push(arena, prop);
        list.push(arena, obj);
        Self(list)
    }

    fn from_iter<I>(arena: &'a Bump, obj: JsValue<'a>, prop: JsValue<'a>, args: I) -> Self
    where
        I: IntoIterator<Item = JsValue<'a>>,
        I::IntoIter: ExactSizeIterator,
    {
        let args = args.into_iter();
        let mut list = BumpVec::with_capacity_in(arena, args.len() + 2);
        list.extend(arena, args);
        list.push(arena, prop);
        list.push(arena, obj);
        Self(list)
    }

    fn clone_in(&self, arena: &'a Bump) -> Self {
        Self(BumpVec::from_iter_in(
            arena,
            self.0.iter().map(|v| v.clone_in(arena)),
        ))
    }

    /// The receiver object. Lives at the tail of the underlying `Vec`.
    pub fn obj(&self) -> &JsValue<'a> {
        &self.0[self.0.len() - 1]
    }

    pub fn obj_mut(&mut self) -> &mut JsValue<'a> {
        let n = self.0.len();
        &mut self.0[n - 1]
    }

    /// The accessed property. Lives one slot before `obj`.
    pub fn prop(&self) -> &JsValue<'a> {
        &self.0[self.0.len() - 2]
    }

    pub fn prop_mut(&mut self) -> &mut JsValue<'a> {
        let n = self.0.len();
        &mut self.0[n - 2]
    }

    /// The call arguments — everything before `prop` and `obj`.
    pub fn args(&self) -> &[JsValue<'a>] {
        let n = self.0.len();
        &self.0[..n - 2]
    }

    pub fn args_mut(&mut self) -> &mut [JsValue<'a>] {
        let n = self.0.len();
        &mut self.0[..n - 2]
    }

    /// Borrow `args`, `prop`, and `obj` simultaneously as mutable references. The single
    /// `Vec` storage means callers can't get these via separate accessor calls.
    pub fn as_parts_mut(&mut self) -> (&mut [JsValue<'a>], &mut JsValue<'a>, &mut JsValue<'a>) {
        let n = self.0.len();
        let (args, tail) = self.0.split_at_mut(n - 2);
        let (prop_slot, obj_slot) = tail.split_at_mut(1);
        (args, &mut prop_slot[0], &mut obj_slot[0])
    }

    /// Take everything out. The returned `args` `Vec` reuses the original allocation — no
    /// copy. That's the point of storing obj/prop at the tail.
    pub fn into_parts(mut self) -> (JsValue<'a>, JsValue<'a>, BumpVec<'a, JsValue<'a>>) {
        let obj = self.0.pop().unwrap();
        let prop = self.0.pop().unwrap();
        (obj, prop, self.0)
    }

    fn total_nodes(&self) -> u32 {
        total_nodes(&self.0)
    }

    fn for_each_children(&self, visitor: &mut impl FnMut(&JsValue<'a>)) {
        self.0.iter().for_each(visitor)
    }
    fn for_each_children_mut(
        &mut self,
        visitor: &mut impl FnMut(&mut JsValue<'a>) -> bool,
    ) -> bool {
        let mut modified = false;
        for child in self.0.iter_mut() {
            if visitor(child) {
                modified = true;
            }
        }

        modified
    }

    fn all_similar(l: &Self, r: &Self, depth: usize) -> bool {
        JsValue::all_similar(&l.0, &r.0, depth)
    }
}

/// Storage for [`JsValue::Call`] and [`JsValue::New`]: `[args..., callee]`.
///
/// Same trick as [`MemberCallList`]: keeping the callee at the tail lets
/// `replace_builtin`-style fallthrough paths `pop` it off cheaply and reuse the remaining
/// `Vec` as the owned args with no reallocation.
///
/// The custom `Debug` impl re-emits the pre-refactor `(callee, [args])` shape so fixture
/// snapshots remain identical to the 3-tuple-payload version.
#[derive(Hash, PartialEq)]
pub struct CallList<'a>(BumpVec<'a, JsValue<'a>>);

impl fmt::Debug for CallList<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        // Layout: [args..., callee]
        let n = self.0.len();
        let callee = &self.0[n - 1];
        let args = &self.0[..n - 1];
        if f.alternate() {
            // Same trick as MemberCallList: emit two sibling fields inside the parent
            // `debug_tuple`'s pretty-print output.
            writeln!(f, "{callee:#?},")?;
            write!(f, "{args:#?}")
        } else {
            write!(f, "{callee:?}, {args:?}")
        }
    }
}

impl<'a> CallList<'a> {
    fn from_parts(arena: &'a Bump, callee: JsValue<'a>, args: BumpVec<'a, JsValue<'a>>) -> Self {
        let mut list = args;
        list.push(arena, callee);
        Self(list)
    }

    fn from_iter<I>(arena: &'a Bump, callee: JsValue<'a>, args: I) -> Self
    where
        I: IntoIterator<Item = JsValue<'a>>,
        I::IntoIter: ExactSizeIterator,
    {
        let args = args.into_iter();
        let mut list = BumpVec::with_capacity_in(arena, args.len() + 1);
        list.extend(arena, args);
        list.push(arena, callee);
        Self(list)
    }

    fn clone_in(&self, arena: &'a Bump) -> Self {
        Self(BumpVec::from_iter_in(
            arena,
            self.0.iter().map(|v| v.clone_in(arena)),
        ))
    }

    /// The callee. Lives at the tail of the underlying `Vec`.
    pub fn callee(&self) -> &JsValue<'a> {
        self.0.last().expect("CallList must always have a callee")
    }

    pub fn callee_mut(&mut self) -> &mut JsValue<'a> {
        self.0
            .last_mut()
            .expect("CallList must always have a callee")
    }

    /// The call arguments — everything before the callee.
    pub fn args(&self) -> &[JsValue<'a>] {
        let n = self.0.len();
        &self.0[..n - 1]
    }

    pub fn args_mut(&mut self) -> &mut [JsValue<'a>] {
        let n = self.0.len();
        &mut self.0[..n - 1]
    }

    /// Borrow `args` and `callee` simultaneously as mutable references. The single `Vec`
    /// storage means callers can't get these via separate accessor calls.
    pub fn as_parts_mut(&mut self) -> (&mut [JsValue<'a>], &mut JsValue<'a>) {
        let n = self.0.len();
        let (args, callee_slot) = self.0.split_at_mut(n - 1);
        (args, &mut callee_slot[0])
    }

    /// Take everything out. The returned `args` `Vec` reuses the original allocation — no
    /// copy. That's the point of storing the callee at the tail.
    pub fn into_parts(mut self) -> (JsValue<'a>, BumpVec<'a, JsValue<'a>>) {
        let callee = self.0.pop().unwrap();
        (callee, self.0)
    }

    fn total_nodes(&self) -> u32 {
        total_nodes(&self.0)
    }

    fn for_each_children(&self, visitor: &mut impl FnMut(&JsValue<'a>)) {
        self.0.iter().for_each(visitor)
    }
    fn for_each_children_mut(
        &mut self,
        visitor: &mut impl FnMut(&mut JsValue<'a>) -> bool,
    ) -> bool {
        let mut modified = false;
        for child in self.0.iter_mut() {
            if visitor(child) {
                modified = true;
            }
        }

        modified
    }

    fn all_similar(l: &Self, r: &Self, depth: usize) -> bool {
        JsValue::all_similar(&l.0, &r.0, depth)
    }
}

impl<'a> From<&'_ str> for JsValue<'a> {
    fn from(v: &str) -> Self {
        ConstantValue::Str(ConstantString::Atom(v.into())).into()
    }
}

impl<'a> From<Atom> for JsValue<'a> {
    fn from(v: Atom) -> Self {
        ConstantValue::Str(ConstantString::Atom(v)).into()
    }
}

impl<'a> From<BigInt> for JsValue<'a> {
    fn from(v: BigInt) -> Self {
        Self::from(Box::new(v))
    }
}

impl<'a> From<Box<BigInt>> for JsValue<'a> {
    fn from(v: Box<BigInt>) -> Self {
        ConstantValue::BigInt(v).into()
    }
}

impl<'a> From<f64> for JsValue<'a> {
    fn from(v: f64) -> Self {
        ConstantValue::Num(ConstantNumber(v)).into()
    }
}

impl<'a> From<RcStr> for JsValue<'a> {
    fn from(v: RcStr) -> Self {
        ConstantValue::Str(v.into()).into()
    }
}

impl<'a> From<String> for JsValue<'a> {
    fn from(v: String) -> Self {
        RcStr::from(v).into()
    }
}

impl<'a> From<swc_core::ecma::ast::Str> for JsValue<'a> {
    fn from(v: swc_core::ecma::ast::Str) -> Self {
        ConstantValue::Str(ConstantString::Atom(v.value.to_atom_lossy().into_owned())).into()
    }
}

impl<'a> From<ConstantValue> for JsValue<'a> {
    fn from(v: ConstantValue) -> Self {
        JsValue::Constant(v)
    }
}

impl<'a> JsValue<'a> {
    /// Build a [`JsValue`] from a [`CompileTimeDefineValue`], allocating any nested structure in
    /// `arena`. (Cannot be a `TryFrom` impl because the conversion needs the arena.)
    pub fn from_compile_time_define_value_in(
        arena: &'a Bump,
        value: &CompileTimeDefineValue,
    ) -> Result<Self> {
        Ok(JsValue::Constant(match value {
            CompileTimeDefineValue::Undefined => ConstantValue::Undefined,
            CompileTimeDefineValue::Null => ConstantValue::Null,
            CompileTimeDefineValue::Bool(b) => (*b).into(),
            CompileTimeDefineValue::Number(n) => ConstantValue::Num(ConstantNumber(
                n.as_f64()
                    .expect("unreachable: serde-json has arbitrary_precision disabled"),
            )),
            CompileTimeDefineValue::BigInt(n) => ConstantValue::BigInt(n.clone()),
            CompileTimeDefineValue::String(s) => s.as_str().into(),
            CompileTimeDefineValue::Regex(pattern, flags) => {
                ConstantValue::Regex(Box::new((pattern.as_str().into(), flags.as_str().into())))
            }
            CompileTimeDefineValue::Array(a) => {
                let mut items = BumpVec::with_capacity_in(arena, a.len());
                for i in a {
                    items.push(arena, JsValue::from_compile_time_define_value_in(arena, i)?);
                }
                let mut js_value = JsValue::Array {
                    total_nodes: a.len() as u32,
                    items,
                    mutable: false,
                };
                js_value.update_total_nodes();
                return Ok(js_value);
            }
            CompileTimeDefineValue::Object(m) => {
                let mut parts = BumpVec::with_capacity_in(arena, m.len());
                for (k, v) in m {
                    parts.push(
                        arena,
                        ObjectPart::KeyValue(
                            k.clone().into(),
                            JsValue::from_compile_time_define_value_in(arena, v)?,
                        ),
                    );
                }
                let mut js_value = JsValue::Object {
                    total_nodes: m.len() as u32,
                    parts,
                    mutable: false,
                };
                js_value.update_total_nodes();
                return Ok(js_value);
            }
            CompileTimeDefineValue::Evaluate(s) => {
                return EvalContext::eval_single_expr_lit(arena, s);
            }
        }))
    }
}

impl TryFrom<&ConstantValue> for CompileTimeDefineValue {
    type Error = anyhow::Error;

    fn try_from(value: &ConstantValue) -> Result<Self> {
        Ok(match value {
            ConstantValue::Undefined => CompileTimeDefineValue::Undefined,
            ConstantValue::Null => CompileTimeDefineValue::Null,
            ConstantValue::True => CompileTimeDefineValue::Bool(true),
            ConstantValue::False => CompileTimeDefineValue::Bool(false),
            ConstantValue::Num(n) => CompileTimeDefineValue::Number(
                serde_json::Number::from_f64(n.0)
                    .ok_or_else(|| anyhow::anyhow!("NaN and Infinity cannot be represented"))?,
            ),
            ConstantValue::Str(s) => CompileTimeDefineValue::String(s.as_rcstr()),
            ConstantValue::BigInt(n) => CompileTimeDefineValue::BigInt(n.clone()),
            ConstantValue::Regex(regex) => CompileTimeDefineValue::Regex(
                RcStr::from(regex.0.as_str()),
                RcStr::from(regex.1.as_str()),
            ),
        })
    }
}

impl<'a> JsValue<'a> {
    /// Build a [`JsValue`] from a [`FreeVarReference`], allocating any nested structure in `arena`.
    /// (Cannot be a `TryFrom` impl because the conversion needs the arena.)
    pub fn from_free_var_reference_in(arena: &'a Bump, value: &FreeVarReference) -> Result<Self> {
        match value {
            FreeVarReference::Value(v) => JsValue::from_compile_time_define_value_in(arena, v),
            FreeVarReference::Ident(_) => Ok(JsValue::unknown_empty(
                false,
                rcstr!("compile time injected ident"),
            )),
            FreeVarReference::Member(_, _) => Ok(JsValue::unknown_empty(
                false,
                rcstr!("compile time injected member"),
            )),
            FreeVarReference::EcmaScriptModule { .. } => Ok(JsValue::unknown_empty(
                false,
                rcstr!("compile time injected free var module"),
            )),
            FreeVarReference::ReportUsage { inner, .. } => {
                if let Some(inner) = &inner {
                    JsValue::from_free_var_reference_in(arena, inner.as_ref())
                } else {
                    Ok(JsValue::unknown_empty(
                        false,
                        rcstr!("compile time injected free var error"),
                    ))
                }
            }
            FreeVarReference::InputRelative(kind) => {
                use turbopack_core::compile_time_info::InputRelativeConstant;
                Ok(JsValue::unknown_empty(
                    false,
                    match kind {
                        InputRelativeConstant::DirName => {
                            rcstr!("compile time injected free var referencing the directory name")
                        }
                        InputRelativeConstant::FileName => {
                            rcstr!("compile time injected free var referencing the file name")
                        }
                    },
                ))
            }
        }
    }
}

impl Default for JsValue<'_> {
    fn default() -> Self {
        JsValue::unknown_empty(false, rcstr!(""))
    }
}

// Private meta methods
impl JsValue<'_> {
    fn meta_type(&self) -> JsValueMetaKind {
        match self {
            JsValue::Constant(..)
            | JsValue::Url(..)
            | JsValue::WellKnownObject(..)
            | JsValue::WellKnownFunction(..)
            | JsValue::Unknown { .. } => JsValueMetaKind::Leaf,
            JsValue::Array { .. }
            | JsValue::Object { .. }
            | JsValue::Alternatives { .. }
            | JsValue::Function(..)
            | JsValue::Promise(..)
            | JsValue::Member(..) => JsValueMetaKind::Nested,
            JsValue::Concat(..)
            | JsValue::Add(..)
            | JsValue::Not(..)
            | JsValue::Logical(..)
            | JsValue::Binary(..)
            | JsValue::New(..)
            | JsValue::Call(..)
            | JsValue::SuperCall(..)
            | JsValue::Tenary(..)
            | JsValue::MemberCall(..)
            | JsValue::Iterated(..)
            | JsValue::Awaited(..)
            | JsValue::TypeOf(..) => JsValueMetaKind::Operation,
            JsValue::Variable(..)
            | JsValue::Argument(..)
            | JsValue::FreeVar(..)
            | JsValue::Module(..) => JsValueMetaKind::Placeholder,
        }
    }
}

// Constructors
impl<'a> JsValue<'a> {
    pub fn alternatives(list: BumpVec<'a, JsValue<'a>>) -> Self {
        Self::Alternatives {
            total_nodes: 1 + total_nodes(&list),
            values: list,
            logical_property: None,
        }
    }

    pub fn alternatives_with_additional_property(
        list: BumpVec<'a, JsValue<'a>>,
        logical_property: LogicalProperty,
    ) -> Self {
        Self::Alternatives {
            total_nodes: 1 + total_nodes(&list),
            values: list,
            logical_property: Some(logical_property),
        }
    }

    pub fn concat(list: BumpVec<'a, JsValue<'a>>) -> Self {
        Self::Concat(1 + total_nodes(&list), list)
    }

    pub fn add(list: BumpVec<'a, JsValue<'a>>) -> Self {
        Self::Add(1 + total_nodes(&list), list)
    }

    pub fn logical_and(list: BumpVec<'a, JsValue<'a>>) -> Self {
        Self::Logical(1 + total_nodes(&list), LogicalOperator::And, list)
    }

    pub fn logical_or(list: BumpVec<'a, JsValue<'a>>) -> Self {
        Self::Logical(1 + total_nodes(&list), LogicalOperator::Or, list)
    }

    pub fn nullish_coalescing(list: BumpVec<'a, JsValue<'a>>) -> Self {
        Self::Logical(
            1 + total_nodes(&list),
            LogicalOperator::NullishCoalescing,
            list,
        )
    }

    pub fn tenary(arena: &'a Bump, test: JsValue<'a>, cons: JsValue<'a>, alt: JsValue<'a>) -> Self {
        Self::Tenary(
            1 + test.total_nodes() + cons.total_nodes() + alt.total_nodes(),
            BumpBox::new_in(test, arena),
            BumpBox::new_in(cons, arena),
            BumpBox::new_in(alt, arena),
        )
    }

    pub fn iterated(arena: &'a Bump, iterable: JsValue<'a>) -> Self {
        Self::Iterated(1 + iterable.total_nodes(), BumpBox::new_in(iterable, arena))
    }

    pub fn equal(arena: &'a Bump, a: JsValue<'a>, b: JsValue<'a>) -> Self {
        Self::Binary(
            1 + a.total_nodes() + b.total_nodes(),
            BumpBox::new_in(a, arena),
            BinaryOperator::Equal,
            BumpBox::new_in(b, arena),
        )
    }

    pub fn not_equal(arena: &'a Bump, a: JsValue<'a>, b: JsValue<'a>) -> Self {
        Self::Binary(
            1 + a.total_nodes() + b.total_nodes(),
            BumpBox::new_in(a, arena),
            BinaryOperator::NotEqual,
            BumpBox::new_in(b, arena),
        )
    }

    pub fn strict_equal(arena: &'a Bump, a: JsValue<'a>, b: JsValue<'a>) -> Self {
        Self::Binary(
            1 + a.total_nodes() + b.total_nodes(),
            BumpBox::new_in(a, arena),
            BinaryOperator::StrictEqual,
            BumpBox::new_in(b, arena),
        )
    }

    pub fn strict_not_equal(arena: &'a Bump, a: JsValue<'a>, b: JsValue<'a>) -> Self {
        Self::Binary(
            1 + a.total_nodes() + b.total_nodes(),
            BumpBox::new_in(a, arena),
            BinaryOperator::StrictNotEqual,
            BumpBox::new_in(b, arena),
        )
    }

    pub fn logical_not(arena: &'a Bump, inner: JsValue<'a>) -> Self {
        Self::Not(1 + inner.total_nodes(), BumpBox::new_in(inner, arena))
    }

    pub fn type_of(arena: &'a Bump, operand: JsValue<'a>) -> Self {
        Self::TypeOf(1 + operand.total_nodes(), BumpBox::new_in(operand, arena))
    }

    pub fn array(items: BumpVec<'a, JsValue<'a>>) -> Self {
        Self::Array {
            total_nodes: 1 + total_nodes(&items),
            items,
            mutable: true,
        }
    }

    pub fn frozen_array(items: BumpVec<'a, JsValue<'a>>) -> Self {
        Self::Array {
            total_nodes: 1 + total_nodes(&items),
            items,
            mutable: false,
        }
    }

    pub fn function(
        arena: &'a Bump,
        func_ident: u32,
        is_async: bool,
        is_generator: bool,
        return_value: JsValue<'a>,
    ) -> Self {
        // Check generator first to handle async generators
        let return_value = if is_generator {
            JsValue::WellKnownObject(WellKnownObjectKind::Generator)
        } else if is_async {
            JsValue::promise(arena, return_value)
        } else {
            return_value
        };
        Self::Function(
            1 + return_value.total_nodes(),
            func_ident,
            BumpBox::new_in(return_value, arena),
        )
    }

    pub fn object(list: BumpVec<'a, ObjectPart<'a>>) -> Self {
        Self::Object {
            total_nodes: 1 + list
                .iter()
                .map(|v| match v {
                    ObjectPart::KeyValue(k, v) => k.total_nodes() + v.total_nodes(),
                    ObjectPart::Spread(s) => s.total_nodes(),
                })
                .sum::<u32>(),
            parts: list,
            mutable: true,
        }
    }

    pub fn frozen_object(list: BumpVec<'a, ObjectPart<'a>>) -> Self {
        Self::Object {
            total_nodes: 1 + list
                .iter()
                .map(|v| match v {
                    ObjectPart::KeyValue(k, v) => k.total_nodes() + v.total_nodes(),
                    ObjectPart::Spread(s) => s.total_nodes(),
                })
                .sum::<u32>(),
            parts: list,
            mutable: false,
        }
    }

    /// Build a `JsValue::New` from a callee and an owned args `Vec`.
    ///
    /// Pushes `f` onto `args` to form the `[args..., callee]` layout. If `args.capacity()`
    /// equals `args.len()`, this triggers a Vec realloc — only use this overload when the
    /// caller already has a `Vec` that is likely to have spare capacity for the trailing
    /// slot (e.g. an `args` Vec returned from [`CallList::into_parts`] or
    /// [`MemberCallList::into_parts`]). For from-scratch construction use
    /// [`JsValue::new_from_iter`], which pre-sizes the underlying allocation exactly.
    pub fn new_from_parts(arena: &'a Bump, f: JsValue<'a>, args: BumpVec<'a, JsValue<'a>>) -> Self {
        let total = 1 + f.total_nodes() + total_nodes(&args);
        Self::New(total, CallList::from_parts(arena, f, args))
    }

    /// Build a `JsValue::New` from a callee and an args iterator with a known length.
    ///
    /// Allocates the underlying `Vec` with exact capacity (`args.len() + 1`), so no realloc
    /// occurs.
    pub fn new_from_iter<I>(arena: &'a Bump, f: JsValue<'a>, args: I) -> Self
    where
        I: IntoIterator<Item = JsValue<'a>>,
        I::IntoIter: ExactSizeIterator,
    {
        let list = CallList::from_iter(arena, f, args);
        let total = 1 + total_nodes(&list.0);
        Self::New(total, list)
    }

    /// Build a `JsValue::Call` from a callee and an owned args `Vec`.
    ///
    /// See [`JsValue::new_from_parts`] for the realloc caveat — only use this when the
    /// caller already has a `Vec` that is likely to be correctly sized (typically one
    /// obtained from [`CallList::into_parts`] / [`MemberCallList::into_parts`]). For
    /// from-scratch construction use [`JsValue::call_from_iter`].
    pub fn call_from_parts(
        arena: &'a Bump,
        f: JsValue<'a>,
        args: BumpVec<'a, JsValue<'a>>,
    ) -> Self {
        let total = 1 + f.total_nodes() + total_nodes(&args);
        Self::Call(total, CallList::from_parts(arena, f, args))
    }

    /// Build a `JsValue::Call` from a callee and an args iterator with a known length.
    ///
    /// Allocates the underlying `Vec` with exact capacity (`args.len() + 1`), so no realloc
    /// occurs.
    pub fn call_from_iter<I>(arena: &'a Bump, f: JsValue<'a>, args: I) -> Self
    where
        I: IntoIterator<Item = JsValue<'a>>,
        I::IntoIter: ExactSizeIterator,
    {
        let list = CallList::from_iter(arena, f, args);
        let total = 1 + total_nodes(&list.0);
        Self::Call(total, list)
    }

    pub fn super_call(args: BumpBox<'a, [JsValue<'a>]>) -> Self {
        Self::SuperCall(1 + total_nodes(&args), args)
    }

    /// Build a `JsValue::MemberCall` from `obj`, `prop`, and an owned args `Vec`.
    ///
    /// See [`JsValue::new_from_parts`] for the realloc caveat — only use this when the
    /// caller already has a `Vec` that is likely to be correctly sized (typically one
    /// obtained from [`MemberCallList::into_parts`]). For from-scratch construction use
    /// [`JsValue::member_call_from_iter`].
    pub fn member_call_from_parts(
        arena: &'a Bump,
        o: JsValue<'a>,
        p: JsValue<'a>,
        args: BumpVec<'a, JsValue<'a>>,
    ) -> Self {
        let total = 1 + o.total_nodes() + p.total_nodes() + total_nodes(&args);
        Self::MemberCall(total, MemberCallList::from_parts(arena, o, p, args))
    }

    /// Build a `JsValue::MemberCall` from `obj`, `prop`, and an args iterator with a known
    /// length.
    ///
    /// Allocates the underlying `Vec` with exact capacity (`args.len() + 2`), so no realloc
    /// occurs.
    pub fn member_call_from_iter<I>(
        arena: &'a Bump,
        o: JsValue<'a>,
        p: JsValue<'a>,
        args: I,
    ) -> Self
    where
        I: IntoIterator<Item = JsValue<'a>>,
        I::IntoIter: ExactSizeIterator,
    {
        let list = MemberCallList::from_iter(arena, o, p, args);
        let total = 1 + total_nodes(&list.0);
        Self::MemberCall(total, list)
    }

    pub fn member(arena: &'a Bump, o: JsValue<'a>, p: JsValue<'a>) -> Self {
        Self::Member(
            1 + o.total_nodes() + p.total_nodes(),
            BumpBox::new_in(o, arena),
            BumpBox::new_in(p, arena),
        )
    }

    pub fn promise(arena: &'a Bump, operand: JsValue<'a>) -> Self {
        // In ecmascript Promise<Promise<T>> is equivalent to Promise<T>
        if let JsValue::Promise(_, _) = operand {
            return operand;
        }
        Self::Promise(1 + operand.total_nodes(), BumpBox::new_in(operand, arena))
    }

    pub fn awaited(arena: &'a Bump, operand: JsValue<'a>) -> Self {
        Self::Awaited(1 + operand.total_nodes(), BumpBox::new_in(operand, arena))
    }

    pub fn unknown(value: impl Into<Arc<JsValue<'a>>>, side_effects: bool, reason: RcStr) -> Self {
        Self::Unknown {
            original_value: Some(value.into()),
            reason,
            has_side_effects: side_effects,
        }
    }

    pub fn unknown_empty(side_effects: bool, reason: RcStr) -> Self {
        Self::Unknown {
            original_value: None,
            reason,
            has_side_effects: side_effects,
        }
    }

    pub fn unknown_if(
        is_unknown: bool,
        value: JsValue<'a>,
        side_effects: bool,
        reason: RcStr,
    ) -> Self {
        if is_unknown {
            Self::Unknown {
                original_value: Some(value.into()),
                reason,
                has_side_effects: side_effects,
            }
        } else {
            value
        }
    }
}

// Methods regarding node count
impl JsValue<'_> {
    pub fn has_children(&self) -> bool {
        self.total_nodes() > 1
    }

    pub fn total_nodes(&self) -> u32 {
        match self {
            JsValue::Constant(_)
            | JsValue::Url(_, _)
            | JsValue::FreeVar(_)
            | JsValue::Variable(_)
            | JsValue::Module(..)
            | JsValue::WellKnownObject(_)
            | JsValue::WellKnownFunction(_)
            | JsValue::Unknown { .. }
            | JsValue::Argument(..) => 1,

            JsValue::Array { total_nodes: c, .. }
            | JsValue::Object { total_nodes: c, .. }
            | JsValue::Alternatives { total_nodes: c, .. }
            | JsValue::Concat(c, _)
            | JsValue::Add(c, _)
            | JsValue::Not(c, _)
            | JsValue::Logical(c, _, _)
            | JsValue::Binary(c, _, _, _)
            | JsValue::Tenary(c, _, _, _)
            | JsValue::New(c, _)
            | JsValue::Call(c, _)
            | JsValue::SuperCall(c, _)
            | JsValue::MemberCall(c, _)
            | JsValue::Member(c, _, _)
            | JsValue::Function(c, _, _)
            | JsValue::Iterated(c, ..)
            | JsValue::Promise(c, ..)
            | JsValue::Awaited(c, ..)
            | JsValue::TypeOf(c, ..) => *c,
        }
    }

    pub(crate) fn update_total_nodes(&mut self) {
        match self {
            JsValue::Constant(_)
            | JsValue::Url(_, _)
            | JsValue::FreeVar(_)
            | JsValue::Variable(_)
            | JsValue::Module(..)
            | JsValue::WellKnownObject(_)
            | JsValue::WellKnownFunction(_)
            | JsValue::Unknown { .. }
            | JsValue::Argument(..) => {}

            JsValue::Array {
                total_nodes: c,
                items: list,
                ..
            }
            | JsValue::Alternatives {
                total_nodes: c,
                values: list,
                ..
            }
            | JsValue::Concat(c, list)
            | JsValue::Add(c, list)
            | JsValue::Logical(c, _, list) => {
                *c = 1 + total_nodes(list);
            }

            JsValue::Binary(c, a, _, b) => {
                *c = 1 + a.total_nodes() + b.total_nodes();
            }
            JsValue::Tenary(c, test, cons, alt) => {
                *c = 1 + test.total_nodes() + cons.total_nodes() + alt.total_nodes();
            }
            JsValue::Not(c, r) => {
                *c = 1 + r.total_nodes();
            }
            JsValue::Promise(c, r) => {
                *c = 1 + r.total_nodes();
            }
            JsValue::Awaited(c, r) => {
                *c = 1 + r.total_nodes();
            }

            JsValue::Object {
                total_nodes: c,
                parts,
                mutable: _,
            } => {
                *c = 1 + parts
                    .iter()
                    .map(|v| match v {
                        ObjectPart::KeyValue(k, v) => k.total_nodes() + v.total_nodes(),
                        ObjectPart::Spread(s) => s.total_nodes(),
                    })
                    .sum::<u32>();
            }
            JsValue::New(c, call) => {
                *c = 1 + call.total_nodes();
            }
            JsValue::Call(c, call) => {
                *c = 1 + call.total_nodes();
            }
            JsValue::SuperCall(c, args) => {
                *c = 1 + total_nodes(args);
            }
            JsValue::MemberCall(c, call) => {
                *c = 1 + call.total_nodes();
            }
            JsValue::Member(c, o, p) => {
                *c = 1 + o.total_nodes() + p.total_nodes();
            }
            JsValue::Function(c, _, r) => {
                *c = 1 + r.total_nodes();
            }

            JsValue::Iterated(c, iterable) => {
                *c = 1 + iterable.total_nodes();
            }

            JsValue::TypeOf(c, operand) => {
                *c = 1 + operand.total_nodes();
            }
        }
    }

    #[cfg(debug_assertions)]
    pub fn debug_assert_total_nodes_up_to_date(&mut self) {
        let old = self.total_nodes();
        self.update_total_nodes();
        assert_eq!(
            old,
            self.total_nodes(),
            "total nodes not up to date {self:?}"
        );
    }

    #[cfg(not(debug_assertions))]
    pub fn debug_assert_total_nodes_up_to_date(&mut self) {}
}

// Unknown management
impl<'a> JsValue<'a> {
    /// Convert the value into unknown with a specific reason.
    pub fn make_unknown(&mut self, side_effects: bool, reason: RcStr) {
        *self = JsValue::unknown(take(self), side_effects || self.has_side_effects(), reason);
    }

    /// Convert the owned value into unknown with a specific reason.
    pub fn into_unknown(mut self, side_effects: bool, reason: RcStr) -> Self {
        self.make_unknown(side_effects, reason);
        self
    }

    /// Convert the value into unknown with a specific reason, but don't retain
    /// the original value.
    pub fn make_unknown_without_content(&mut self, side_effects: bool, reason: RcStr) {
        *self = JsValue::unknown_empty(side_effects || self.has_side_effects(), reason);
    }

    /// Make all nested operations unknown when the value is an operation.
    pub fn make_nested_operations_unknown(&mut self) -> bool {
        fn inner(this: &mut JsValue) -> bool {
            if matches!(this.meta_type(), JsValueMetaKind::Operation) {
                this.make_unknown(false, rcstr!("nested operation"));
                true
            } else {
                this.for_each_children_mut(&mut inner)
            }
        }
        if matches!(self.meta_type(), JsValueMetaKind::Operation) {
            self.for_each_children_mut(&mut inner)
        } else {
            false
        }
    }

    pub fn add_unknown_mutations(&mut self, arena: &'a Bump, side_effects: bool) {
        self.add_alt(
            arena,
            JsValue::unknown_empty(side_effects, rcstr!("unknown mutation")),
        );
    }
}

// Definable name management
impl JsValue<'_> {
    /// When the value has a user-definable name, return it in segments. Otherwise
    /// returns None.
    /// It also returns a boolean whether the variable was potentially reassigned.
    /// - any free var has itself as user-definable name: ["foo"]
    /// - any member access adds the identifier as segment after the object: ["foo", "prop"]
    /// - some well-known objects/functions have a user-definable names: ["import"]
    /// - member calls without arguments also have a user-definable name: ["foo", Call("func")]
    /// - typeof expressions add `typeof` after the argument's segments: ["foo", "typeof"]
    pub fn get_definable_name(
        &self,
        var_graph: Option<&VarGraph<'_>>,
    ) -> Option<(DefinableNameSegmentRefs<'_>, bool)> {
        let mut current = self;
        let mut segments = SmallVec::new();
        let mut potentially_reassigned = false;
        loop {
            match current {
                JsValue::FreeVar(name) => {
                    if var_graph.is_some_and(|var_graph| {
                        var_graph
                            .free_var_ids
                            .get(name)
                            .is_some_and(|id| var_graph.values.contains_key(id))
                    }) {
                        // `foo` was potentially reassigned
                        potentially_reassigned = true;
                    }
                    segments.push(DefinableNameSegmentRef::Name(name));
                    break;
                }
                JsValue::Member(_, obj, prop) => {
                    segments.push(DefinableNameSegmentRef::Name(prop.as_str()?));
                    current = obj;
                }
                JsValue::WellKnownObject(obj) => {
                    segments.extend(
                        obj.as_define_name()?
                            .iter()
                            .rev()
                            .copied()
                            .map(DefinableNameSegmentRef::Name),
                    );
                    break;
                }
                JsValue::WellKnownFunction(func) => {
                    segments.extend(
                        func.as_define_name()?
                            .iter()
                            .rev()
                            .copied()
                            .map(DefinableNameSegmentRef::Name),
                    );
                    break;
                }
                JsValue::MemberCall(_, call) if call.args().is_empty() => {
                    segments.push(DefinableNameSegmentRef::Call(call.prop().as_str()?));
                    current = call.obj();
                }
                JsValue::TypeOf(_, arg) => {
                    segments.push(DefinableNameSegmentRef::TypeOf);
                    current = arg;
                }
                _ => return None,
            }
        }
        segments.reverse();
        Some((DefinableNameSegmentRefs(segments), potentially_reassigned))
    }
}

// Arena-aware cloning (replaces the derived `Clone`, which is unavailable because the arena-backed
// `Box`/`Vec` children can't clone without the allocator).
impl<'a> JsValue<'a> {
    /// Deep-clone this value into `arena`, returning a fresh tree owned by that arena.
    pub fn clone_in(&self, arena: &'a Bump) -> JsValue<'a> {
        match self {
            JsValue::Constant(v) => JsValue::Constant(v.clone()),
            JsValue::Url(s, k) => JsValue::Url(s.clone(), *k),
            JsValue::WellKnownObject(k) => JsValue::WellKnownObject(k.clone()),
            JsValue::WellKnownFunction(k) => JsValue::WellKnownFunction(k.clone()),
            JsValue::Unknown {
                original_value,
                reason,
                has_side_effects,
            } => JsValue::Unknown {
                original_value: original_value.clone(),
                reason: reason.clone(),
                has_side_effects: *has_side_effects,
            },
            JsValue::Array {
                total_nodes,
                items,
                mutable,
            } => JsValue::Array {
                total_nodes: *total_nodes,
                items: BumpVec::from_iter_in(arena, items.iter().map(|v| v.clone_in(arena))),
                mutable: *mutable,
            },
            JsValue::Object {
                total_nodes,
                parts,
                mutable,
            } => JsValue::Object {
                total_nodes: *total_nodes,
                parts: BumpVec::from_iter_in(arena, parts.iter().map(|p| p.clone_in(arena))),
                mutable: *mutable,
            },
            JsValue::Alternatives {
                total_nodes,
                values,
                logical_property,
            } => JsValue::Alternatives {
                total_nodes: *total_nodes,
                values: BumpVec::from_iter_in(arena, values.iter().map(|v| v.clone_in(arena))),
                logical_property: *logical_property,
            },
            JsValue::Function(c, id, r) => {
                JsValue::Function(*c, *id, BumpBox::new_in(r.clone_in(arena), arena))
            }
            JsValue::Concat(c, list) => JsValue::Concat(
                *c,
                BumpVec::from_iter_in(arena, list.iter().map(|v| v.clone_in(arena))),
            ),
            JsValue::Add(c, list) => JsValue::Add(
                *c,
                BumpVec::from_iter_in(arena, list.iter().map(|v| v.clone_in(arena))),
            ),
            JsValue::Not(c, v) => JsValue::Not(*c, BumpBox::new_in(v.clone_in(arena), arena)),
            JsValue::Logical(c, op, list) => JsValue::Logical(
                *c,
                *op,
                BumpVec::from_iter_in(arena, list.iter().map(|v| v.clone_in(arena))),
            ),
            JsValue::Binary(c, a, op, b) => JsValue::Binary(
                *c,
                BumpBox::new_in(a.clone_in(arena), arena),
                *op,
                BumpBox::new_in(b.clone_in(arena), arena),
            ),
            JsValue::New(c, call) => JsValue::New(*c, call.clone_in(arena)),
            JsValue::Call(c, call) => JsValue::Call(*c, call.clone_in(arena)),
            JsValue::SuperCall(c, args) => JsValue::SuperCall(
                *c,
                bumpalo::collections::Vec::from_iter_in(
                    args.iter().map(|v| v.clone_in(arena)),
                    arena,
                )
                .into_boxed_slice(),
            ),
            JsValue::MemberCall(c, call) => JsValue::MemberCall(*c, call.clone_in(arena)),
            JsValue::Member(c, o, p) => JsValue::Member(
                *c,
                BumpBox::new_in(o.clone_in(arena), arena),
                BumpBox::new_in(p.clone_in(arena), arena),
            ),
            JsValue::Tenary(c, test, cons, alt) => JsValue::Tenary(
                *c,
                BumpBox::new_in(test.clone_in(arena), arena),
                BumpBox::new_in(cons.clone_in(arena), arena),
                BumpBox::new_in(alt.clone_in(arena), arena),
            ),
            JsValue::Promise(c, v) => {
                JsValue::Promise(*c, BumpBox::new_in(v.clone_in(arena), arena))
            }
            JsValue::Awaited(c, v) => {
                JsValue::Awaited(*c, BumpBox::new_in(v.clone_in(arena), arena))
            }
            JsValue::Iterated(c, v) => {
                JsValue::Iterated(*c, BumpBox::new_in(v.clone_in(arena), arena))
            }
            JsValue::TypeOf(c, v) => JsValue::TypeOf(*c, BumpBox::new_in(v.clone_in(arena), arena)),
            JsValue::Variable(id) => JsValue::Variable(id.clone()),
            JsValue::Argument(i, idx) => JsValue::Argument(*i, *idx),
            JsValue::FreeVar(a) => JsValue::FreeVar(a.clone()),
            JsValue::Module(m) => JsValue::Module(m.clone()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(target_pointer_width = "64")]
    fn jsvalue_size() {
        assert_eq!(32, size_of::<JsValue>());
    }
}
