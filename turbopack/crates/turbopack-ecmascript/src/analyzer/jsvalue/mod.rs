use std::{
    fmt::{self},
    hash::Hash,
    mem::take,
    sync::Arc,
};

use anyhow::Result;
use num_bigint::BigInt;
use smallvec::SmallVec;
use swc_core::ecma::{ast::Id, atoms::Atom};
use turbo_rcstr::{RcStr, rcstr};
use turbopack_core::compile_time_info::{
    CompileTimeDefineValue, DefinableNameSegmentRef, DefinableNameSegmentRefs, FreeVarReference,
};

use crate::analyzer::{
    WellKnownFunctionKind, WellKnownObjectKind,
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
fn total_nodes(vec: &[JsValue]) -> u32 {
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
#[derive(Debug, Clone, Hash, PartialEq)]
pub enum JsValue {
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
    WellKnownFunction(WellKnownFunctionKind),
    /// Not-analyzable value. Might contain the original value for additional
    /// info. Has a reason string for explanation.
    Unknown {
        original_value: Option<Arc<JsValue>>,
        reason: RcStr,
        has_side_effects: bool,
    },

    // NESTED VALUES
    // ----------------------------
    /// An array of nested values
    Array {
        total_nodes: u32,
        items: Vec<JsValue>,
        mutable: bool,
    },
    /// An object of nested values
    Object {
        total_nodes: u32,
        parts: Vec<ObjectPart>,
        mutable: bool,
    },
    /// A list of alternative values
    Alternatives {
        total_nodes: u32,
        values: Vec<JsValue>,
        logical_property: Option<LogicalProperty>,
    },
    /// A function reference. The return value might contain [JsValue::Argument]
    /// placeholders that need to be replaced when calling this function.
    /// `(total_node_count, func_ident, return_value)`
    Function(u32, u32, Box<JsValue>),

    // OPERATIONS
    // ----------------------------
    /// A string concatenation of values.
    /// `foo.${unknownVar}.js` => 'foo' + Unknown + '.js'
    Concat(u32, Vec<JsValue>),
    /// An addition of values.
    /// This can be converted to [JsValue::Concat] if the type of the variable
    /// is string.
    Add(u32, Vec<JsValue>),
    /// Logical negation `!expr`
    Not(u32, Box<JsValue>),
    /// Logical operator chain e. g. `expr && expr`
    Logical(u32, LogicalOperator, Vec<JsValue>),
    /// Binary expression e. g. `expr == expr`
    Binary(u32, Box<JsValue>, BinaryOperator, Box<JsValue>),
    /// A constructor call. `(total_node_count, list)` — see [`CallList`].
    New(u32, CallList),
    /// A function call without a `this` context. `(total_node_count, list)` — see [`CallList`].
    Call(u32, CallList),
    /// A super call to the parent constructor.
    /// `(total_node_count, args)`
    SuperCall(u32, Vec<JsValue>),
    /// A function call with a `this` context. `(total_node_count, list)` — see [`MemberCallList`].
    MemberCall(u32, MemberCallList),
    /// A member access `obj[prop]`
    /// `(total_node_count, obj, prop)`
    Member(u32, Box<JsValue>, Box<JsValue>),
    /// A tenary operator `test ? cons : alt`
    /// `(total_node_count, test, cons, alt)`
    Tenary(u32, Box<JsValue>, Box<JsValue>, Box<JsValue>),
    /// A promise resolving to some value
    /// `(total_node_count, value)`
    Promise(u32, Box<JsValue>),
    /// An await call (potentially) unwrapping a promise.
    /// `(total_node_count, value)`
    Awaited(u32, Box<JsValue>),

    /// A for-of loop
    ///
    /// `(total_node_count, iterable)`
    Iterated(u32, Box<JsValue>),

    /// A `typeof` expression.
    ///
    /// `(total_node_count, operand)`
    TypeOf(u32, Box<JsValue>),

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
#[derive(Default, Clone, Hash, PartialEq)]
pub struct MemberCallList(Vec<JsValue>);

impl fmt::Debug for MemberCallList {
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

impl MemberCallList {
    fn from_parts(obj: JsValue, prop: JsValue, args: Vec<JsValue>) -> Self {
        let mut list = args;
        list.reserve_exact(2);
        list.push(prop);
        list.push(obj);
        Self(list)
    }

    fn from_iter<I>(obj: JsValue, prop: JsValue, args: I) -> Self
    where
        I: IntoIterator<Item = JsValue>,
        I::IntoIter: ExactSizeIterator,
    {
        let args = args.into_iter();
        let mut list = Vec::with_capacity(args.len() + 2);
        list.extend(args);
        list.push(prop);
        list.push(obj);
        Self(list)
    }

    /// The receiver object. Lives at the tail of the underlying `Vec`.
    pub fn obj(&self) -> &JsValue {
        &self.0[self.0.len() - 1]
    }

    pub fn obj_mut(&mut self) -> &mut JsValue {
        let n = self.0.len();
        &mut self.0[n - 1]
    }

    /// The accessed property. Lives one slot before `obj`.
    pub fn prop(&self) -> &JsValue {
        &self.0[self.0.len() - 2]
    }

    pub fn prop_mut(&mut self) -> &mut JsValue {
        let n = self.0.len();
        &mut self.0[n - 2]
    }

    /// The call arguments — everything before `prop` and `obj`.
    pub fn args(&self) -> &[JsValue] {
        let n = self.0.len();
        &self.0[..n - 2]
    }

    pub fn args_mut(&mut self) -> &mut [JsValue] {
        let n = self.0.len();
        &mut self.0[..n - 2]
    }

    /// Borrow `args`, `prop`, and `obj` simultaneously as mutable references. The single
    /// `Vec` storage means callers can't get these via separate accessor calls.
    pub fn as_parts_mut(&mut self) -> (&mut [JsValue], &mut JsValue, &mut JsValue) {
        let n = self.0.len();
        let (args, tail) = self.0.split_at_mut(n - 2);
        let (prop_slot, obj_slot) = tail.split_at_mut(1);
        (args, &mut prop_slot[0], &mut obj_slot[0])
    }

    /// Take everything out. The returned `args` `Vec` reuses the original allocation — no
    /// copy. That's the point of storing obj/prop at the tail.
    pub fn into_parts(mut self) -> (JsValue, JsValue, Vec<JsValue>) {
        let obj = self.0.pop().unwrap();
        let prop = self.0.pop().unwrap();
        (obj, prop, self.0)
    }

    fn total_nodes(&self) -> u32 {
        total_nodes(&self.0)
    }

    fn for_each_children(&self, visitor: &mut impl FnMut(&JsValue)) {
        self.0.iter().for_each(visitor)
    }
    fn for_each_children_mut(&mut self, visitor: &mut impl FnMut(&mut JsValue) -> bool) -> bool {
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
#[derive(Default, Clone, Hash, PartialEq)]
pub struct CallList(Vec<JsValue>);

impl fmt::Debug for CallList {
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

impl CallList {
    fn from_parts(callee: JsValue, args: Vec<JsValue>) -> Self {
        let mut list = args;
        list.reserve_exact(1);
        list.push(callee);
        Self(list)
    }

    fn from_iter<I>(callee: JsValue, args: I) -> Self
    where
        I: IntoIterator<Item = JsValue>,
        I::IntoIter: ExactSizeIterator,
    {
        let args = args.into_iter();
        let mut list = Vec::with_capacity(args.len() + 1);
        list.extend(args);
        list.push(callee);
        Self(list)
    }

    /// The callee. Lives at the tail of the underlying `Vec`.
    pub fn callee(&self) -> &JsValue {
        self.0.last().expect("CallList must always have a callee")
    }

    pub fn callee_mut(&mut self) -> &mut JsValue {
        self.0
            .last_mut()
            .expect("CallList must always have a callee")
    }

    /// The call arguments — everything before the callee.
    pub fn args(&self) -> &[JsValue] {
        let n = self.0.len();
        &self.0[..n - 1]
    }

    pub fn args_mut(&mut self) -> &mut [JsValue] {
        let n = self.0.len();
        &mut self.0[..n - 1]
    }

    /// Borrow `args` and `callee` simultaneously as mutable references. The single `Vec`
    /// storage means callers can't get these via separate accessor calls.
    pub fn as_parts_mut(&mut self) -> (&mut [JsValue], &mut JsValue) {
        let n = self.0.len();
        let (args, callee_slot) = self.0.split_at_mut(n - 1);
        (args, &mut callee_slot[0])
    }

    /// Take everything out. The returned `args` `Vec` reuses the original allocation — no
    /// copy. That's the point of storing the callee at the tail.
    pub fn into_parts(mut self) -> (JsValue, Vec<JsValue>) {
        let callee = self.0.pop().unwrap();
        (callee, self.0)
    }

    fn total_nodes(&self) -> u32 {
        total_nodes(&self.0)
    }

    fn for_each_children(&self, visitor: &mut impl FnMut(&JsValue)) {
        self.0.iter().for_each(visitor)
    }
    fn for_each_children_mut(&mut self, visitor: &mut impl FnMut(&mut JsValue) -> bool) -> bool {
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

impl From<&'_ str> for JsValue {
    fn from(v: &str) -> Self {
        ConstantValue::Str(ConstantString::Atom(v.into())).into()
    }
}

impl From<Atom> for JsValue {
    fn from(v: Atom) -> Self {
        ConstantValue::Str(ConstantString::Atom(v)).into()
    }
}

impl From<BigInt> for JsValue {
    fn from(v: BigInt) -> Self {
        Self::from(Box::new(v))
    }
}

impl From<Box<BigInt>> for JsValue {
    fn from(v: Box<BigInt>) -> Self {
        ConstantValue::BigInt(v).into()
    }
}

impl From<f64> for JsValue {
    fn from(v: f64) -> Self {
        ConstantValue::Num(ConstantNumber(v)).into()
    }
}

impl From<RcStr> for JsValue {
    fn from(v: RcStr) -> Self {
        ConstantValue::Str(v.into()).into()
    }
}

impl From<String> for JsValue {
    fn from(v: String) -> Self {
        RcStr::from(v).into()
    }
}

impl From<swc_core::ecma::ast::Str> for JsValue {
    fn from(v: swc_core::ecma::ast::Str) -> Self {
        ConstantValue::Str(ConstantString::Atom(v.value.to_atom_lossy().into_owned())).into()
    }
}

impl From<ConstantValue> for JsValue {
    fn from(v: ConstantValue) -> Self {
        JsValue::Constant(v)
    }
}

impl TryFrom<&CompileTimeDefineValue> for JsValue {
    type Error = anyhow::Error;

    fn try_from(value: &CompileTimeDefineValue) -> Result<Self> {
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
                let mut js_value = JsValue::Array {
                    total_nodes: a.len() as u32,
                    items: a.iter().map(|i| i.try_into()).collect::<Result<Vec<_>>>()?,
                    mutable: false,
                };
                js_value.update_total_nodes();
                return Ok(js_value);
            }
            CompileTimeDefineValue::Object(m) => {
                let mut js_value = JsValue::Object {
                    total_nodes: m.len() as u32,
                    parts: m
                        .iter()
                        .map(|(k, v)| {
                            Ok::<ObjectPart, anyhow::Error>(ObjectPart::KeyValue(
                                k.clone().into(),
                                v.try_into()?,
                            ))
                        })
                        .collect::<Result<Vec<_>>>()?,
                    mutable: false,
                };
                js_value.update_total_nodes();
                return Ok(js_value);
            }
            CompileTimeDefineValue::Evaluate(s) => {
                return EvalContext::eval_single_expr_lit(s);
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

impl TryFrom<&FreeVarReference> for JsValue {
    type Error = anyhow::Error;

    fn try_from(value: &FreeVarReference) -> Result<Self> {
        match value {
            FreeVarReference::Value(v) => v.try_into(),
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
                    inner.as_ref().try_into()
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

impl Default for JsValue {
    fn default() -> Self {
        JsValue::unknown_empty(false, rcstr!(""))
    }
}

// Private meta methods
impl JsValue {
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
impl JsValue {
    pub fn alternatives(list: Vec<JsValue>) -> Self {
        Self::Alternatives {
            total_nodes: 1 + total_nodes(&list),
            values: list,
            logical_property: None,
        }
    }

    pub fn alternatives_with_additional_property(
        list: Vec<JsValue>,
        logical_property: LogicalProperty,
    ) -> Self {
        Self::Alternatives {
            total_nodes: 1 + total_nodes(&list),
            values: list,
            logical_property: Some(logical_property),
        }
    }

    pub fn concat(list: Vec<JsValue>) -> Self {
        Self::Concat(1 + total_nodes(&list), list)
    }

    pub fn add(list: Vec<JsValue>) -> Self {
        Self::Add(1 + total_nodes(&list), list)
    }

    pub fn logical_and(list: Vec<JsValue>) -> Self {
        Self::Logical(1 + total_nodes(&list), LogicalOperator::And, list)
    }

    pub fn logical_or(list: Vec<JsValue>) -> Self {
        Self::Logical(1 + total_nodes(&list), LogicalOperator::Or, list)
    }

    pub fn nullish_coalescing(list: Vec<JsValue>) -> Self {
        Self::Logical(
            1 + total_nodes(&list),
            LogicalOperator::NullishCoalescing,
            list,
        )
    }

    pub fn tenary(test: Box<JsValue>, cons: Box<JsValue>, alt: Box<JsValue>) -> Self {
        Self::Tenary(
            1 + test.total_nodes() + cons.total_nodes() + alt.total_nodes(),
            test,
            cons,
            alt,
        )
    }

    pub fn iterated(iterable: Box<JsValue>) -> Self {
        Self::Iterated(1 + iterable.total_nodes(), iterable)
    }

    pub fn equal(a: Box<JsValue>, b: Box<JsValue>) -> Self {
        Self::Binary(
            1 + a.total_nodes() + b.total_nodes(),
            a,
            BinaryOperator::Equal,
            b,
        )
    }

    pub fn not_equal(a: Box<JsValue>, b: Box<JsValue>) -> Self {
        Self::Binary(
            1 + a.total_nodes() + b.total_nodes(),
            a,
            BinaryOperator::NotEqual,
            b,
        )
    }

    pub fn strict_equal(a: Box<JsValue>, b: Box<JsValue>) -> Self {
        Self::Binary(
            1 + a.total_nodes() + b.total_nodes(),
            a,
            BinaryOperator::StrictEqual,
            b,
        )
    }

    pub fn strict_not_equal(a: Box<JsValue>, b: Box<JsValue>) -> Self {
        Self::Binary(
            1 + a.total_nodes() + b.total_nodes(),
            a,
            BinaryOperator::StrictNotEqual,
            b,
        )
    }

    pub fn logical_not(inner: Box<JsValue>) -> Self {
        Self::Not(1 + inner.total_nodes(), inner)
    }

    pub fn type_of(operand: Box<JsValue>) -> Self {
        Self::TypeOf(1 + operand.total_nodes(), operand)
    }

    pub fn array(items: Vec<JsValue>) -> Self {
        Self::Array {
            total_nodes: 1 + total_nodes(&items),
            items,
            mutable: true,
        }
    }

    pub fn frozen_array(items: Vec<JsValue>) -> Self {
        Self::Array {
            total_nodes: 1 + total_nodes(&items),
            items,
            mutable: false,
        }
    }

    pub fn function(
        func_ident: u32,
        is_async: bool,
        is_generator: bool,
        return_value: JsValue,
    ) -> Self {
        // Check generator first to handle async generators
        let return_value = if is_generator {
            JsValue::WellKnownObject(WellKnownObjectKind::Generator)
        } else if is_async {
            JsValue::promise(return_value)
        } else {
            return_value
        };
        Self::Function(
            1 + return_value.total_nodes(),
            func_ident,
            Box::new(return_value),
        )
    }

    pub fn object(list: Vec<ObjectPart>) -> Self {
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

    pub fn frozen_object(list: Vec<ObjectPart>) -> Self {
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
    pub fn new_from_parts(f: JsValue, args: Vec<JsValue>) -> Self {
        let total = 1 + f.total_nodes() + total_nodes(&args);
        Self::New(total, CallList::from_parts(f, args))
    }

    /// Build a `JsValue::New` from a callee and an args iterator with a known length.
    ///
    /// Allocates the underlying `Vec` with exact capacity (`args.len() + 1`), so no realloc
    /// occurs.
    pub fn new_from_iter<I>(f: JsValue, args: I) -> Self
    where
        I: IntoIterator<Item = JsValue>,
        I::IntoIter: ExactSizeIterator,
    {
        let list = CallList::from_iter(f, args);
        let total = 1 + total_nodes(&list.0);
        Self::New(total, list)
    }

    /// Build a `JsValue::Call` from a callee and an owned args `Vec`.
    ///
    /// See [`JsValue::new_from_parts`] for the realloc caveat — only use this when the
    /// caller already has a `Vec` that is likely to be correctly sized (typically one
    /// obtained from [`CallList::into_parts`] / [`MemberCallList::into_parts`]). For
    /// from-scratch construction use [`JsValue::call_from_iter`].
    pub fn call_from_parts(f: JsValue, args: Vec<JsValue>) -> Self {
        let total = 1 + f.total_nodes() + total_nodes(&args);
        Self::Call(total, CallList::from_parts(f, args))
    }

    /// Build a `JsValue::Call` from a callee and an args iterator with a known length.
    ///
    /// Allocates the underlying `Vec` with exact capacity (`args.len() + 1`), so no realloc
    /// occurs.
    pub fn call_from_iter<I>(f: JsValue, args: I) -> Self
    where
        I: IntoIterator<Item = JsValue>,
        I::IntoIter: ExactSizeIterator,
    {
        let list = CallList::from_iter(f, args);
        let total = 1 + total_nodes(&list.0);
        Self::Call(total, list)
    }

    pub fn super_call(args: Vec<JsValue>) -> Self {
        Self::SuperCall(1 + total_nodes(&args), args)
    }

    /// Build a `JsValue::MemberCall` from `obj`, `prop`, and an owned args `Vec`.
    ///
    /// See [`JsValue::new_from_parts`] for the realloc caveat — only use this when the
    /// caller already has a `Vec` that is likely to be correctly sized (typically one
    /// obtained from [`MemberCallList::into_parts`]). For from-scratch construction use
    /// [`JsValue::member_call_from_iter`].
    pub fn member_call_from_parts(o: JsValue, p: JsValue, args: Vec<JsValue>) -> Self {
        let total = 1 + o.total_nodes() + p.total_nodes() + total_nodes(&args);
        Self::MemberCall(total, MemberCallList::from_parts(o, p, args))
    }

    /// Build a `JsValue::MemberCall` from `obj`, `prop`, and an args iterator with a known
    /// length.
    ///
    /// Allocates the underlying `Vec` with exact capacity (`args.len() + 2`), so no realloc
    /// occurs.
    pub fn member_call_from_iter<I>(o: JsValue, p: JsValue, args: I) -> Self
    where
        I: IntoIterator<Item = JsValue>,
        I::IntoIter: ExactSizeIterator,
    {
        let list = MemberCallList::from_iter(o, p, args);
        let total = 1 + total_nodes(&list.0);
        Self::MemberCall(total, list)
    }

    pub fn member(o: Box<JsValue>, p: Box<JsValue>) -> Self {
        Self::Member(1 + o.total_nodes() + p.total_nodes(), o, p)
    }

    pub fn promise(operand: JsValue) -> Self {
        // In ecmascript Promise<Promise<T>> is equivalent to Promise<T>
        if let JsValue::Promise(_, _) = operand {
            return operand;
        }
        Self::Promise(1 + operand.total_nodes(), Box::new(operand))
    }

    pub fn awaited(operand: Box<JsValue>) -> Self {
        Self::Awaited(1 + operand.total_nodes(), operand)
    }

    pub fn unknown(value: impl Into<Arc<JsValue>>, side_effects: bool, reason: RcStr) -> Self {
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

    pub fn unknown_if(is_unknown: bool, value: JsValue, side_effects: bool, reason: RcStr) -> Self {
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
impl JsValue {
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
impl JsValue {
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

    pub fn add_unknown_mutations(&mut self, side_effects: bool) {
        self.add_alt(JsValue::unknown_empty(
            side_effects,
            rcstr!("unknown mutation"),
        ));
    }
}

// Definable name management
impl JsValue {
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
        var_graph: Option<&VarGraph>,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(target_pointer_width = "64")]
    fn jsvalue_size() {
        assert_eq!(32, size_of::<JsValue>());
    }
}
