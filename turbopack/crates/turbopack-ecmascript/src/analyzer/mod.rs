#![allow(clippy::redundant_closure_call)]

use std::{
    borrow::Cow,
    fmt::{self, Display, Formatter, Write},
    hash::{BuildHasherDefault, Hash, Hasher},
    mem::take,
    sync::{Arc, LazyLock},
};

use anyhow::{Result, bail};
use either::Either;
use num_bigint::BigInt;
use num_traits::identities::Zero;
use rustc_hash::FxHasher;
use smallvec::SmallVec;
use swc_core::{
    atoms::Wtf8Atom,
    common::Mark,
    ecma::{
        ast::{Id, Ident, Lit},
        atoms::Atom,
    },
};
use turbo_esregex::EsRegex;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexMap, FxIndexSet, Vc};
use turbopack_core::compile_time_info::{
    CompileTimeDefineValue, DefinableNameSegmentRef, DefinableNameSegmentRefs, FreeVarReference,
    TotalOrderF64,
};

use self::imports::ImportAnnotations;
pub(crate) use self::imports::ImportMap;
use crate::{
    analyzer::graph::{EvalContext, VarGraph},
    references::require_context::RequireContextMap,
    utils::StringifyJs,
};

pub mod builtin;
pub mod graph;
pub mod imports;
pub mod linker;
pub mod side_effects;
pub mod top_level_await;
pub mod well_known;

#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub enum ObjectPart {
    KeyValue(JsValue, JsValue),
    Spread(JsValue),
}

impl Default for ObjectPart {
    fn default() -> Self {
        ObjectPart::Spread(Default::default())
    }
}

#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub struct ConstantNumber(pub TotalOrderF64);

impl ConstantNumber {
    pub fn as_u32_index(&self) -> Option<usize> {
        let index: u32 = *self.0 as u32;
        (index as f64 == *self.0).then_some(index as usize)
    }
}
impl From<f64> for ConstantNumber {
    fn from(value: f64) -> Self {
        ConstantNumber(value.into())
    }
}

#[derive(Debug, Clone)]
pub enum ConstantString {
    Atom(Atom),
    RcStr(RcStr),
}

impl ConstantString {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Atom(s) => s,
            Self::RcStr(s) => s,
        }
    }

    pub fn as_rcstr(&self) -> RcStr {
        match self {
            Self::Atom(s) => RcStr::from(s.as_str()),
            Self::RcStr(s) => s.clone(),
        }
    }

    pub fn as_atom(&self) -> Cow<'_, Atom> {
        match self {
            Self::Atom(s) => Cow::Borrowed(s),
            Self::RcStr(s) => Cow::Owned(s.as_str().into()),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.as_str().is_empty()
    }
}

impl PartialEq for ConstantString {
    fn eq(&self, other: &Self) -> bool {
        self.as_str() == other.as_str()
    }
}

impl Eq for ConstantString {}

impl Hash for ConstantString {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.as_str().hash(state);
    }
}

impl Display for ConstantString {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.as_str().fmt(f)
    }
}

impl From<Atom> for ConstantString {
    fn from(v: Atom) -> Self {
        ConstantString::Atom(v)
    }
}

impl From<&'static str> for ConstantString {
    fn from(v: &'static str) -> Self {
        ConstantString::Atom(v.into())
    }
}

impl From<String> for ConstantString {
    fn from(v: String) -> Self {
        ConstantString::Atom(v.into())
    }
}

impl From<RcStr> for ConstantString {
    fn from(v: RcStr) -> Self {
        ConstantString::RcStr(v)
    }
}

#[derive(Debug, Clone, Hash, PartialEq, Eq, Default)]
pub enum ConstantValue {
    #[default]
    Undefined,
    Str(ConstantString),
    Num(ConstantNumber),
    True,
    False,
    Null,
    BigInt(Box<BigInt>),
    Regex(Box<(Atom, Atom)>),
}

impl ConstantValue {
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Self::Str(s) => Some(s.as_str()),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Self::True => Some(true),
            Self::False => Some(false),
            _ => None,
        }
    }

    pub fn is_truthy(&self) -> bool {
        match self {
            Self::Undefined | Self::False | Self::Null => false,
            Self::True | Self::Regex(..) => true,
            Self::Str(s) => !s.is_empty(),
            Self::Num(ConstantNumber(n)) => **n != 0.0,
            Self::BigInt(n) => !n.is_zero(),
        }
    }

    pub fn is_nullish(&self) -> bool {
        match self {
            Self::Undefined | Self::Null => true,
            Self::Str(..)
            | Self::Num(..)
            | Self::True
            | Self::False
            | Self::BigInt(..)
            | Self::Regex(..) => false,
        }
    }

    pub fn is_empty_string(&self) -> bool {
        match self {
            Self::Str(s) => s.is_empty(),
            _ => false,
        }
    }

    pub fn is_value_type(&self) -> bool {
        !matches!(self, Self::Regex(..))
    }
}

impl From<bool> for ConstantValue {
    fn from(v: bool) -> Self {
        match v {
            true => ConstantValue::True,
            false => ConstantValue::False,
        }
    }
}

impl From<&'_ str> for ConstantValue {
    fn from(v: &str) -> Self {
        ConstantValue::Str(ConstantString::Atom(v.into()))
    }
}

impl From<Lit> for ConstantValue {
    fn from(v: Lit) -> Self {
        match v {
            Lit::Str(v) => {
                ConstantValue::Str(ConstantString::Atom(v.value.to_atom_lossy().into_owned()))
            }
            Lit::Bool(v) => {
                if v.value {
                    ConstantValue::True
                } else {
                    ConstantValue::False
                }
            }
            Lit::Null(_) => ConstantValue::Null,
            Lit::Num(v) => ConstantValue::Num(ConstantNumber(v.value.into())),
            Lit::BigInt(v) => ConstantValue::BigInt(v.value),
            Lit::Regex(v) => ConstantValue::Regex(Box::new((v.exp, v.flags))),
            Lit::JSXText(v) => ConstantValue::Str(ConstantString::Atom(v.value)),
        }
    }
}

impl Display for ConstantValue {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConstantValue::Undefined => write!(f, "undefined"),
            ConstantValue::Str(str) => write!(f, "{}", StringifyJs(str.as_str())),
            ConstantValue::True => write!(f, "true"),
            ConstantValue::False => write!(f, "false"),
            ConstantValue::Null => write!(f, "null"),
            ConstantValue::Num(ConstantNumber(n)) => write!(f, "{n}"),
            ConstantValue::BigInt(n) => write!(f, "{n}"),
            ConstantValue::Regex(regex) => write!(f, "/{}/{}", regex.0, regex.1),
        }
    }
}

#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub struct ModuleValue {
    pub module: Wtf8Atom,
    pub annotations: Option<Arc<ImportAnnotations>>,
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq)]
pub enum LogicalOperator {
    And,
    Or,
    NullishCoalescing,
}

impl LogicalOperator {
    fn joiner(&self) -> &'static str {
        match self {
            LogicalOperator::And => " && ",
            LogicalOperator::Or => " || ",
            LogicalOperator::NullishCoalescing => " ?? ",
        }
    }
    fn multi_line_joiner(&self) -> &'static str {
        match self {
            LogicalOperator::And => "&& ",
            LogicalOperator::Or => "|| ",
            LogicalOperator::NullishCoalescing => "?? ",
        }
    }
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq)]
pub enum BinaryOperator {
    Equal,
    NotEqual,
    StrictEqual,
    StrictNotEqual,
}

impl BinaryOperator {
    fn joiner(&self) -> &'static str {
        match self {
            BinaryOperator::Equal => " == ",
            BinaryOperator::NotEqual => " != ",
            BinaryOperator::StrictEqual => " === ",
            BinaryOperator::StrictNotEqual => " !== ",
        }
    }

    fn positive_op(&self) -> (PositiveBinaryOperator, bool) {
        match self {
            BinaryOperator::Equal => (PositiveBinaryOperator::Equal, false),
            BinaryOperator::NotEqual => (PositiveBinaryOperator::Equal, true),
            BinaryOperator::StrictEqual => (PositiveBinaryOperator::StrictEqual, false),
            BinaryOperator::StrictNotEqual => (PositiveBinaryOperator::StrictEqual, true),
        }
    }
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq)]
pub enum PositiveBinaryOperator {
    Equal,
    StrictEqual,
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq)]
pub enum JsValueUrlKind {
    Absolute,
    Relative,
}

impl Display for JsValueUrlKind {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            JsValueUrlKind::Absolute => "absolute",
            JsValueUrlKind::Relative => "relative",
        })
    }
}

/// The four categories of [JsValue]s.
enum JsValueMetaKind {
    /// Doesn't contain nested values.
    Leaf,
    /// Contains nested values. Nested values represent some structure and can't
    /// be replaced during linking. They might contain placeholders.
    Nested,
    /// Contains nested values. Operations are replaced during linking. They
    /// might contain placeholders.
    Operation,
    /// These values are replaced during linking.
    Placeholder,
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq)]
pub enum LogicalProperty {
    Truthy,
    Falsy,
    Nullish,
    NonNullish,
}

impl Display for LogicalProperty {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LogicalProperty::Truthy => write!(f, "truthy"),
            LogicalProperty::Falsy => write!(f, "falsy"),
            LogicalProperty::Nullish => write!(f, "nullish"),
            LogicalProperty::NonNullish => write!(f, "non-nullish"),
        }
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
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
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
#[derive(Default, Clone, Hash, PartialEq, Eq)]
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
#[derive(Default, Clone, Hash, PartialEq, Eq)]
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
        ConstantValue::Num(ConstantNumber(v.into())).into()
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
            CompileTimeDefineValue::Number(n) => ConstantValue::Num(ConstantNumber(*n)),
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
            ConstantValue::Num(n) => CompileTimeDefineValue::Number(n.0),
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

impl Display for ObjectPart {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ObjectPart::KeyValue(key, value) => write!(f, "{key}: {value}"),
            ObjectPart::Spread(value) => write!(f, "...{value}"),
        }
    }
}

impl Display for JsValue {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            JsValue::Constant(v) => write!(f, "{v}"),
            JsValue::Url(url, kind) => write!(f, "{url} {kind}"),
            JsValue::Array { items, mutable, .. } => write!(
                f,
                "{}[{}]",
                if *mutable { "" } else { "frozen " },
                items
                    .iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            JsValue::Object { parts, mutable, .. } => write!(
                f,
                "{}{{{}}}",
                if *mutable { "" } else { "frozen " },
                parts
                    .iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            JsValue::Alternatives {
                total_nodes: _,
                values: list,
                logical_property,
            } => {
                let list = list
                    .iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(" | ");
                if let Some(logical_property) = logical_property {
                    write!(f, "({list}){{{logical_property}}}")
                } else {
                    write!(f, "({list})")
                }
            }
            JsValue::FreeVar(name) => write!(f, "FreeVar({name:?})"),
            JsValue::Variable(name) => write!(f, "Variable({}#{:?})", name.0, name.1),
            JsValue::Concat(_, list) => write!(
                f,
                "`{}`",
                list.iter()
                    .map(|v| v
                        .as_str()
                        .map_or_else(|| format!("${{{v}}}"), |str| str.to_string()))
                    .collect::<Vec<_>>()
                    .join("")
            ),
            JsValue::Add(_, list) => write!(
                f,
                "({})",
                list.iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(" + ")
            ),
            JsValue::Not(_, value) => write!(f, "!({value})"),
            JsValue::Logical(_, op, list) => write!(
                f,
                "({})",
                list.iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(op.joiner())
            ),
            JsValue::Binary(_, a, op, b) => write!(f, "({}{}{})", a, op.joiner(), b),
            JsValue::Tenary(_, test, cons, alt) => write!(f, "({test} ? {cons} : {alt})"),
            JsValue::New(_, call) => write!(
                f,
                "new {}({})",
                call.callee(),
                call.args()
                    .iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            JsValue::Call(_, call) => write!(
                f,
                "{}({})",
                call.callee(),
                call.args()
                    .iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            JsValue::SuperCall(_, args) => write!(
                f,
                "super({})",
                args.iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            JsValue::MemberCall(_, call) => write!(
                f,
                "{}[{}]({})",
                call.obj(),
                call.prop(),
                call.args()
                    .iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            JsValue::Member(_, obj, prop) => write!(f, "{obj}[{prop}]"),
            JsValue::Module(ModuleValue {
                module: name,
                annotations,
            }) => {
                write!(
                    f,
                    "Module({}, {})",
                    name.to_string_lossy(),
                    if let Some(annotations) = annotations {
                        Either::Left(annotations)
                    } else {
                        Either::Right("{}")
                    }
                )
            }
            JsValue::Unknown { .. } => write!(f, "???"),
            JsValue::WellKnownObject(obj) => write!(f, "WellKnownObject({obj:?})"),
            JsValue::WellKnownFunction(func) => write!(f, "WellKnownFunction({func:?})"),
            JsValue::Function(_, func_ident, return_value) => {
                write!(f, "Function#{func_ident}(return = {return_value:?})")
            }
            JsValue::Argument(func_ident, index) => {
                write!(f, "arguments[{index}#{func_ident}]")
            }
            JsValue::Iterated(_, iterable) => write!(f, "Iterated({iterable})"),
            JsValue::TypeOf(_, operand) => write!(f, "typeof({operand})"),
            JsValue::Promise(_, operand) => write!(f, "Promise<{operand}>"),
            JsValue::Awaited(_, operand) => write!(f, "await({operand})"),
        }
    }
}

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

fn total_nodes(vec: &[JsValue]) -> u32 {
    vec.iter().map(|v| v.total_nodes()).sum::<u32>()
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

    fn update_total_nodes(&mut self) {
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

// Methods for explaining a value
impl JsValue {
    pub fn explain_args(args: &[JsValue], depth: usize, unknown_depth: usize) -> (String, String) {
        let mut hints = Vec::new();
        let args = args
            .iter()
            .map(|arg| arg.explain_internal(&mut hints, 1, depth, unknown_depth))
            .collect::<Vec<_>>();
        let explainer = pretty_join(&args, 0, ", ", ",", "");
        (
            explainer,
            hints.into_iter().fold(String::new(), |mut out, h| {
                let _ = write!(out, "\n{h}");
                out
            }),
        )
    }

    pub fn explain(&self, depth: usize, unknown_depth: usize) -> (String, String) {
        let mut hints = Vec::new();
        let explainer = self.explain_internal(&mut hints, 0, depth, unknown_depth);
        (
            explainer,
            hints.into_iter().fold(String::new(), |mut out, h| {
                let _ = write!(out, "\n{h}");
                out
            }),
        )
    }

    fn explain_internal_inner(
        &self,
        hints: &mut Vec<String>,
        indent_depth: usize,
        depth: usize,
        unknown_depth: usize,
    ) -> String {
        if depth == 0 {
            return "...".to_string();
        }
        // let i = hints.len();

        // if explainer.len() < 100 {
        self.explain_internal(hints, indent_depth, depth - 1, unknown_depth)
        // }
        // hints.truncate(i);
        // hints.push(String::new());
        // hints[i] = format!(
        //     "- *{}* {}",
        //     i,
        //     self.explain_internal(hints, 1, depth - 1, unknown_depth)
        // );
        // format!("*{}*", i)
    }

    fn explain_internal(
        &self,
        hints: &mut Vec<String>,
        indent_depth: usize,
        depth: usize,
        unknown_depth: usize,
    ) -> String {
        match self {
            JsValue::Constant(v) => format!("{v}"),
            JsValue::Array { items, mutable, .. } => format!(
                "{}[{}]",
                if *mutable { "" } else { "frozen " },
                pretty_join(
                    &items
                        .iter()
                        .map(|v| v.explain_internal_inner(
                            hints,
                            indent_depth + 1,
                            depth,
                            unknown_depth
                        ))
                        .collect::<Vec<_>>(),
                    indent_depth,
                    ", ",
                    ",",
                    ""
                )
            ),
            JsValue::Object { parts, mutable, .. } => format!(
                "{}{{{}}}",
                if *mutable { "" } else { "frozen " },
                pretty_join(
                    &parts
                        .iter()
                        .map(|v| match v {
                            ObjectPart::KeyValue(key, value) => format!(
                                "{}: {}",
                                key.explain_internal_inner(
                                    hints,
                                    indent_depth + 1,
                                    depth,
                                    unknown_depth
                                ),
                                value.explain_internal_inner(
                                    hints,
                                    indent_depth + 1,
                                    depth,
                                    unknown_depth
                                )
                            ),
                            ObjectPart::Spread(value) => format!(
                                "...{}",
                                value.explain_internal_inner(
                                    hints,
                                    indent_depth + 1,
                                    depth,
                                    unknown_depth
                                )
                            ),
                        })
                        .collect::<Vec<_>>(),
                    indent_depth,
                    ", ",
                    ",",
                    ""
                )
            ),
            JsValue::Url(url, kind) => format!("{url} {kind}"),
            JsValue::Alternatives {
                total_nodes: _,
                values,
                logical_property,
            } => {
                let list = pretty_join(
                    &values
                        .iter()
                        .map(|v| {
                            v.explain_internal_inner(hints, indent_depth + 1, depth, unknown_depth)
                        })
                        .collect::<Vec<_>>(),
                    indent_depth,
                    " | ",
                    "",
                    "| ",
                );
                if let Some(logical_property) = logical_property {
                    format!("({list}){{{logical_property}}}")
                } else {
                    format!("({list})")
                }
            }
            JsValue::FreeVar(name) => format!("FreeVar({name})"),
            JsValue::Variable(name) => {
                format!("{}", name.0)
            }
            JsValue::Argument(_, index) => {
                format!("arguments[{index}]")
            }
            JsValue::Concat(_, list) => format!(
                "`{}`",
                list.iter()
                    .map(|v| v.as_str().map_or_else(
                        || format!(
                            "${{{}}}",
                            v.explain_internal_inner(hints, indent_depth + 1, depth, unknown_depth)
                        ),
                        |str| str.to_string()
                    ))
                    .collect::<Vec<_>>()
                    .join("")
            ),
            JsValue::Add(_, list) => format!(
                "({})",
                pretty_join(
                    &list
                        .iter()
                        .map(|v| v.explain_internal_inner(
                            hints,
                            indent_depth + 1,
                            depth,
                            unknown_depth
                        ))
                        .collect::<Vec<_>>(),
                    indent_depth,
                    " + ",
                    "",
                    "+ "
                )
            ),
            JsValue::Logical(_, op, list) => format!(
                "({})",
                pretty_join(
                    &list
                        .iter()
                        .map(|v| v.explain_internal_inner(
                            hints,
                            indent_depth + 1,
                            depth,
                            unknown_depth
                        ))
                        .collect::<Vec<_>>(),
                    indent_depth,
                    op.joiner(),
                    "",
                    op.multi_line_joiner()
                )
            ),
            JsValue::Binary(_, a, op, b) => format!(
                "({}{}{})",
                a.explain_internal_inner(hints, indent_depth, depth, unknown_depth),
                op.joiner(),
                b.explain_internal_inner(hints, indent_depth, depth, unknown_depth),
            ),
            JsValue::Tenary(_, test, cons, alt) => format!(
                "({} ? {} : {})",
                test.explain_internal_inner(hints, indent_depth, depth, unknown_depth),
                cons.explain_internal_inner(hints, indent_depth, depth, unknown_depth),
                alt.explain_internal_inner(hints, indent_depth, depth, unknown_depth),
            ),
            JsValue::Not(_, value) => format!(
                "!({})",
                value.explain_internal_inner(hints, indent_depth, depth, unknown_depth)
            ),
            JsValue::Iterated(_, iterable) => {
                format!(
                    "Iterated({})",
                    iterable.explain_internal_inner(hints, indent_depth, depth, unknown_depth)
                )
            }
            JsValue::TypeOf(_, operand) => {
                format!(
                    "typeof({})",
                    operand.explain_internal_inner(hints, indent_depth, depth, unknown_depth)
                )
            }
            JsValue::Promise(_, operand) => {
                format!(
                    "Promise<{}>",
                    operand.explain_internal_inner(hints, indent_depth, depth, unknown_depth)
                )
            }
            JsValue::Awaited(_, operand) => {
                format!(
                    "await({})",
                    operand.explain_internal_inner(hints, indent_depth, depth, unknown_depth)
                )
            }
            JsValue::New(_, call) => format!(
                "new {}({})",
                call.callee()
                    .explain_internal_inner(hints, indent_depth, depth, unknown_depth),
                pretty_join(
                    &call
                        .args()
                        .iter()
                        .map(|v| v.explain_internal_inner(
                            hints,
                            indent_depth + 1,
                            depth,
                            unknown_depth
                        ))
                        .collect::<Vec<_>>(),
                    indent_depth,
                    ", ",
                    ",",
                    ""
                )
            ),
            JsValue::Call(_, call) => format!(
                "{}({})",
                call.callee()
                    .explain_internal_inner(hints, indent_depth, depth, unknown_depth),
                pretty_join(
                    &call
                        .args()
                        .iter()
                        .map(|v| v.explain_internal_inner(
                            hints,
                            indent_depth + 1,
                            depth,
                            unknown_depth
                        ))
                        .collect::<Vec<_>>(),
                    indent_depth,
                    ", ",
                    ",",
                    ""
                )
            ),
            JsValue::SuperCall(_, args) => {
                format!(
                    "super({})",
                    pretty_join(
                        &args
                            .iter()
                            .map(|v| v.explain_internal_inner(
                                hints,
                                indent_depth + 1,
                                depth,
                                unknown_depth
                            ))
                            .collect::<Vec<_>>(),
                        indent_depth,
                        ", ",
                        ",",
                        ""
                    )
                )
            }
            JsValue::MemberCall(_, call) => format!(
                "{}[{}]({})",
                call.obj()
                    .explain_internal_inner(hints, indent_depth, depth, unknown_depth),
                call.prop()
                    .explain_internal_inner(hints, indent_depth, depth, unknown_depth),
                pretty_join(
                    &call
                        .args()
                        .iter()
                        .map(|v| v.explain_internal_inner(
                            hints,
                            indent_depth + 1,
                            depth,
                            unknown_depth
                        ))
                        .collect::<Vec<_>>(),
                    indent_depth,
                    ", ",
                    ",",
                    ""
                )
            ),
            JsValue::Member(_, obj, prop) => {
                format!(
                    "{}[{}]",
                    obj.explain_internal_inner(hints, indent_depth, depth, unknown_depth),
                    prop.explain_internal_inner(hints, indent_depth, depth, unknown_depth)
                )
            }
            JsValue::Module(ModuleValue {
                module: name,
                annotations,
            }) => {
                format!(
                    "module<{}, {}>",
                    name.to_string_lossy(),
                    if let Some(annotations) = annotations {
                        Either::Left(annotations)
                    } else {
                        Either::Right("{}")
                    }
                )
            }
            JsValue::Unknown {
                original_value: inner,
                reason: explainer,
                has_side_effects,
            } => {
                let has_side_effects = *has_side_effects;
                if unknown_depth == 0 || explainer.is_empty() {
                    "???".to_string()
                } else if let Some(inner) = inner {
                    let i = hints.len();
                    hints.push(String::new());
                    hints[i] = format!(
                        "- *{}* {}\n  ⚠️  {}{}",
                        i,
                        inner.explain_internal(hints, 1, depth, unknown_depth - 1),
                        explainer,
                        if has_side_effects {
                            "\n  ⚠️  This value might have side effects"
                        } else {
                            ""
                        }
                    );
                    format!("???*{i}*")
                } else {
                    let i = hints.len();
                    hints.push(String::new());
                    hints[i] = format!(
                        "- *{}* {}{}",
                        i,
                        explainer,
                        if has_side_effects {
                            "\n  ⚠️  This value might have side effects"
                        } else {
                            ""
                        }
                    );
                    format!("???*{i}*")
                }
            }
            JsValue::WellKnownObject(obj) => {
                let (name, explainer) = match obj {
                    WellKnownObjectKind::Generator => (
                        "Generator",
                        "A Generator or AsyncGenerator object: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Generator",
                    ),
                    WellKnownObjectKind::GlobalObject => (
                        "Object",
                        "The global Object variable",
                    ),
                    WellKnownObjectKind::PathModule | WellKnownObjectKind::PathModuleDefault => (
                        "path",
                        "The Node.js path module: https://nodejs.org/api/path.html",
                    ),
                    WellKnownObjectKind::FsModule | WellKnownObjectKind::FsModuleDefault => (
                        "fs",
                        "The Node.js fs module: https://nodejs.org/api/fs.html",
                    ),
                    WellKnownObjectKind::FsExtraModule | WellKnownObjectKind::FsExtraModuleDefault => (
                        "fs-extra",
                        "The Node.js fs-extra module: https://github.com/jprichardson/node-fs-extra",
                    ),
                    WellKnownObjectKind::FsModulePromises => (
                        "fs/promises",
                        "The Node.js fs module: https://nodejs.org/api/fs.html#promises-api",
                    ),
                    WellKnownObjectKind::UrlModule | WellKnownObjectKind::UrlModuleDefault => (
                        "url",
                        "The Node.js url module: https://nodejs.org/api/url.html",
                    ),
                    WellKnownObjectKind::ModuleModule | WellKnownObjectKind::ModuleModuleDefault => (
                        "module",
                        "The Node.js `module` module: https://nodejs.org/api/module.html",
                    ),
                    WellKnownObjectKind::WorkerThreadsModule | WellKnownObjectKind::WorkerThreadsModuleDefault => (
                        "worker_threads",
                        "The Node.js `worker_threads` module: https://nodejs.org/api/worker_threads.html",
                    ),
                    WellKnownObjectKind::ChildProcessModule | WellKnownObjectKind::ChildProcessModuleDefault => (
                        "child_process",
                        "The Node.js child_process module: https://nodejs.org/api/child_process.html",
                    ),
                    WellKnownObjectKind::OsModule | WellKnownObjectKind::OsModuleDefault => (
                        "os",
                        "The Node.js os module: https://nodejs.org/api/os.html",
                    ),
                    WellKnownObjectKind::NodeProcessModule => (
                        "process",
                        "The Node.js process module: https://nodejs.org/api/process.html",
                    ),
                    WellKnownObjectKind::NodeProcessArgv => (
                        "process.argv",
                        "The Node.js process.argv property: https://nodejs.org/api/process.html#processargv",
                    ),
                    WellKnownObjectKind::NodeProcessEnv => (
                        "process.env",
                        "The Node.js process.env property: https://nodejs.org/api/process.html#processenv",
                    ),
                    WellKnownObjectKind::NodePreGyp => (
                        "@mapbox/node-pre-gyp",
                        "The Node.js @mapbox/node-pre-gyp module: https://github.com/mapbox/node-pre-gyp",
                    ),
                    WellKnownObjectKind::NodeExpressApp => (
                        "express",
                        "The Node.js express package: https://github.com/expressjs/express"
                    ),
                    WellKnownObjectKind::NodeProtobufLoader => (
                        "@grpc/proto-loader",
                        "The Node.js @grpc/proto-loader package: https://github.com/grpc/grpc-node"
                    ),
                    WellKnownObjectKind::NodeBuffer => (
                        "Buffer",
                        "The Node.js Buffer object: https://nodejs.org/api/buffer.html#class-buffer"
                    ),
                    WellKnownObjectKind::RequireCache => (
                        "require.cache",
                        "The CommonJS require.cache object: https://nodejs.org/api/modules.html#requirecache"
                    ),
                    WellKnownObjectKind::ImportMeta => (
                        "import.meta",
                        "The import.meta object"
                    ),
                    WellKnownObjectKind::ModuleHot => (
                        "module.hot",
                        "The module.hot HMR API"
                    ),
                };
                if depth > 0 {
                    let i = hints.len();
                    hints.push(format!("- *{i}* {name}: {explainer}"));
                    format!("{name}*{i}*")
                } else {
                    name.to_string()
                }
            }
            JsValue::WellKnownFunction(func) => {
                let (name, explainer) = match func {
                    WellKnownFunctionKind::ArrayFilter => (
                      "Array.prototype.filter".to_string(),
                      "The standard Array.prototype.filter method: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter"
                    ),
                    WellKnownFunctionKind::ArrayForEach => (
                      "Array.prototype.forEach".to_string(),
                      "The standard Array.prototype.forEach method: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/forEach"
                    ),
                    WellKnownFunctionKind::ArrayMap => (
                      "Array.prototype.map".to_string(),
                      "The standard Array.prototype.map method: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map"
                    ),
                    WellKnownFunctionKind::ObjectAssign => (
                        "Object.assign".to_string(),
                        "Object.assign method: https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Object/assign",
                    ),
                    WellKnownFunctionKind::PathJoin => (
                        "path.join".to_string(),
                        "The Node.js path.join method: https://nodejs.org/api/path.html#pathjoinpaths",
                    ),
                    WellKnownFunctionKind::PathDirname => (
                        "path.dirname".to_string(),
                        "The Node.js path.dirname method: https://nodejs.org/api/path.html#pathdirnamepath",
                    ),
                    WellKnownFunctionKind::PathResolve(cwd) => (
                        format!("path.resolve({cwd})"),
                        "The Node.js path.resolve method: https://nodejs.org/api/path.html#pathresolvepaths",
                    ),
                    WellKnownFunctionKind::Import => (
                        "import".to_string(),
                        "The dynamic import() method from the ESM specification: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import#dynamic_imports"
                    ),
                    WellKnownFunctionKind::Require => ("require".to_string(), "The require method from CommonJS"),
                    WellKnownFunctionKind::RequireFrom(rel) => (
                        format!("createRequire('{rel}')"),
                        "The return value of Node.js module.createRequire: https://nodejs.org/api/module.html#modulecreaterequirefilename"
                    ),
                    WellKnownFunctionKind::RequireResolve => ("require.resolve".to_string(), "The require.resolve method from CommonJS"),
                    WellKnownFunctionKind::RequireContext => ("require.context".to_string(), "The require.context method from webpack"),
                    WellKnownFunctionKind::RequireContextRequire(..) => ("require.context(...)".to_string(), "The require.context(...) method from webpack: https://webpack.js.org/api/module-methods/#requirecontext"),
                    WellKnownFunctionKind::RequireContextRequireKeys(..) => ("require.context(...).keys".to_string(), "The require.context(...).keys method from webpack: https://webpack.js.org/guides/dependency-management/#requirecontext"),
                    WellKnownFunctionKind::RequireContextRequireResolve(..) => ("require.context(...).resolve".to_string(), "The require.context(...).resolve method from webpack: https://webpack.js.org/guides/dependency-management/#requirecontext"),
                    WellKnownFunctionKind::Define => ("define".to_string(), "The define method from AMD"),
                    WellKnownFunctionKind::FsReadMethod(name) => (
                        format!("fs.{name}"),
                        "A file reading method from the Node.js fs module: https://nodejs.org/api/fs.html",
                    ),
                    WellKnownFunctionKind::FsReadDir => (
                        "fs.readdir".to_string(),
                        "The Node.js fs.readdir method: https://nodejs.org/api/fs.html",
                    ),
                    WellKnownFunctionKind::PathToFileUrl => (
                        "url.pathToFileURL".to_string(),
                        "The Node.js url.pathToFileURL method: https://nodejs.org/api/url.html#urlpathtofileurlpath",
                    ),
                    WellKnownFunctionKind::CreateRequire => (
                        "module.createRequire".to_string(),
                        "The Node.js module.createRequire method: https://nodejs.org/api/module.html#modulecreaterequirefilename",
                    ),
                    WellKnownFunctionKind::ChildProcessSpawnMethod(name) => (
                        format!("child_process.{name}"),
                        "A process spawning method from the Node.js child_process module: https://nodejs.org/api/child_process.html",
                    ),
                    WellKnownFunctionKind::ChildProcessFork => (
                        "child_process.fork".to_string(),
                        "The Node.js child_process.fork method: https://nodejs.org/api/child_process.html#child_processforkmodulepath-args-options",
                    ),
                    WellKnownFunctionKind::OsArch => (
                        "os.arch".to_string(),
                        "The Node.js os.arch method: https://nodejs.org/api/os.html#os_os_arch",
                    ),
                    WellKnownFunctionKind::OsPlatform => (
                        "os.process".to_string(),
                        "The Node.js os.process method: https://nodejs.org/api/os.html#os_os_process",
                    ),
                    WellKnownFunctionKind::OsEndianness => (
                        "os.endianness".to_string(),
                        "The Node.js os.endianness method: https://nodejs.org/api/os.html#os_os_endianness",
                    ),
                    WellKnownFunctionKind::ProcessCwd => (
                        "process.cwd".to_string(),
                        "The Node.js process.cwd method: https://nodejs.org/api/process.html#processcwd",
                    ),
                    WellKnownFunctionKind::NodePreGypFind => (
                        "binary.find".to_string(),
                        "The Node.js @mapbox/node-pre-gyp module: https://github.com/mapbox/node-pre-gyp",
                    ),
                    WellKnownFunctionKind::NodeGypBuild => (
                        "node-gyp-build".to_string(),
                        "The Node.js node-gyp-build module: https://github.com/prebuild/node-gyp-build"
                    ),
                    WellKnownFunctionKind::NodeBindings => (
                        "bindings".to_string(),
                        "The Node.js bindings module: https://github.com/TooTallNate/node-bindings"
                    ),
                    WellKnownFunctionKind::NodeExpress => (
                        "express".to_string(),
                        "require('express')() : https://github.com/expressjs/express"
                    ),
                    WellKnownFunctionKind::NodeExpressSet => (
                        "set".to_string(),
                        "require('express')().set('view engine', 'jade')  https://github.com/expressjs/express"
                    ),
                    WellKnownFunctionKind::NodeStrongGlobalize => (
                      "SetRootDir".to_string(),
                      "require('strong-globalize')()  https://github.com/strongloop/strong-globalize"
                    ),
                    WellKnownFunctionKind::NodeStrongGlobalizeSetRootDir => (
                      "SetRootDir".to_string(),
                      "require('strong-globalize').SetRootDir(__dirname)  https://github.com/strongloop/strong-globalize"
                    ),
                    WellKnownFunctionKind::NodeResolveFrom => (
                      "resolveFrom".to_string(),
                      "require('resolve-from')(__dirname, 'node-gyp/bin/node-gyp')  https://github.com/sindresorhus/resolve-from"
                    ),
                    WellKnownFunctionKind::NodeProtobufLoad => (
                      "load/loadSync".to_string(),
                      "require('@grpc/proto-loader').load(filepath, { includeDirs: [root] }) https://github.com/grpc/grpc-node"
                    ),
                    WellKnownFunctionKind::NodeWorkerConstructor => (
                      "Worker".to_string(),
                      "The Node.js worker_threads Worker constructor: https://nodejs.org/api/worker_threads.html#worker_threads_class_worker"
                    ),
                    WellKnownFunctionKind::WorkerConstructor => (
                      "Worker".to_string(),
                      "The standard Worker constructor: https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker"
                    ),
                    WellKnownFunctionKind::SharedWorkerConstructor => (
                      "SharedWorker".to_string(),
                      "The standard SharedWorker constructor: https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker/SharedWorker"
                    ),
                    WellKnownFunctionKind::URLConstructor => (
                      "URL".to_string(),
                      "The standard URL constructor: https://developer.mozilla.org/en-US/docs/Web/API/URL/URL"
                    ),
                    WellKnownFunctionKind::ModuleHotAccept => (
                      "module.hot.accept".to_string(),
                      "The module.hot.accept HMR API: https://webpack.js.org/api/hot-module-replacement/#accept"
                    ),
                    WellKnownFunctionKind::ModuleHotDecline => (
                      "module.hot.decline".to_string(),
                      "The module.hot.decline HMR API: https://webpack.js.org/api/hot-module-replacement/#decline"
                    ),
                    WellKnownFunctionKind::ImportMetaGlob => (
                      "import.meta.glob".to_string(),
                      "The import.meta.glob() function from Vite: https://vite.dev/guide/features.html#glob-import"
                    ),
                };
                if depth > 0 {
                    let i = hints.len();
                    hints.push(format!("- *{i}* {name}: {explainer}"));
                    format!("{name}*{i}*")
                } else {
                    name
                }
            }
            JsValue::Function(_, _, return_value) => {
                if depth > 0 {
                    format!(
                        "(...) => {}",
                        return_value.explain_internal(
                            hints,
                            indent_depth,
                            depth - 1,
                            unknown_depth
                        )
                    )
                } else {
                    "(...) => ...".to_string()
                }
            }
        }
    }
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

// Compile-time information gathering
impl JsValue {
    /// Returns the constant string if the value represents a constant string.
    pub fn as_str(&self) -> Option<&str> {
        match self {
            JsValue::Constant(c) => c.as_str(),
            _ => None,
        }
    }

    /// Returns the constant bool if the value represents a constant boolean.
    pub fn as_bool(&self) -> Option<bool> {
        match self {
            JsValue::Constant(c) => c.as_bool(),
            _ => None,
        }
    }

    pub fn has_side_effects(&self) -> bool {
        match self {
            JsValue::Constant(_) => false,
            JsValue::Concat(_, values)
            | JsValue::Add(_, values)
            | JsValue::Logical(_, _, values)
            | JsValue::Alternatives {
                total_nodes: _,
                values,
                logical_property: _,
            } => values.iter().any(JsValue::has_side_effects),
            JsValue::Binary(_, a, _, b) => a.has_side_effects() || b.has_side_effects(),
            JsValue::Tenary(_, test, cons, alt) => {
                test.has_side_effects() || cons.has_side_effects() || alt.has_side_effects()
            }
            JsValue::Not(_, value) => value.has_side_effects(),
            JsValue::Array { items, .. } => items.iter().any(JsValue::has_side_effects),
            JsValue::Object { parts, .. } => parts.iter().any(|v| match v {
                ObjectPart::KeyValue(k, v) => k.has_side_effects() || v.has_side_effects(),
                ObjectPart::Spread(v) => v.has_side_effects(),
            }),
            // As function bodies aren't analyzed for side-effects, we have to assume every call can
            // have sideeffects as well.
            // Otherwise it would be
            // `func_body(callee).has_side_effects() ||
            //      callee.has_side_effects() || args.iter().any(JsValue::has_side_effects`
            JsValue::New(_, _call) => true,
            JsValue::Call(_, _call) => true,
            JsValue::SuperCall(_, _args) => true,
            JsValue::MemberCall(_, _call) => true,
            JsValue::Member(_, obj, prop) => obj.has_side_effects() || prop.has_side_effects(),
            JsValue::Function(_, _, _) => false,
            JsValue::Url(_, _) => false,
            JsValue::Variable(_) => false,
            JsValue::Module(_) => false,
            JsValue::WellKnownObject(_) => false,
            JsValue::WellKnownFunction(_) => false,
            JsValue::FreeVar(_) => false,
            JsValue::Unknown {
                has_side_effects, ..
            } => *has_side_effects,
            JsValue::Argument(_, _) => false,
            JsValue::Iterated(_, iterable) => iterable.has_side_effects(),
            JsValue::TypeOf(_, operand) => operand.has_side_effects(),
            JsValue::Promise(_, operand) => operand.has_side_effects(),
            JsValue::Awaited(_, operand) => operand.has_side_effects(),
        }
    }

    /// Checks if the value is truthy. Returns None if we don't know. Returns
    /// Some if we know if or if not the value is truthy.
    pub fn is_truthy(&self) -> Option<bool> {
        match self {
            JsValue::Constant(c) => Some(c.is_truthy()),
            JsValue::Concat(..) => self.is_empty_string().map(|x| !x),
            JsValue::Url(..)
            | JsValue::Array { .. }
            | JsValue::Object { .. }
            | JsValue::WellKnownObject(..)
            | JsValue::WellKnownFunction(..)
            | JsValue::Function(..) => Some(true),
            JsValue::Alternatives {
                total_nodes: _,
                values,
                logical_property,
            } => match logical_property {
                Some(LogicalProperty::Truthy) => Some(true),
                Some(LogicalProperty::Falsy) => Some(false),
                Some(LogicalProperty::Nullish) => Some(false),
                _ => merge_if_known(values, JsValue::is_truthy),
            },
            JsValue::Not(_, value) => value.is_truthy().map(|x| !x),
            JsValue::Logical(_, op, list) => match op {
                LogicalOperator::And => all_if_known(list, JsValue::is_truthy),
                LogicalOperator::Or => any_if_known(list, JsValue::is_truthy),
                LogicalOperator::NullishCoalescing => {
                    shortcircuit_if_known(list, JsValue::is_not_nullish, JsValue::is_truthy)
                }
            },
            JsValue::Binary(_, box a, op, box b) => {
                let (positive_op, negate) = op.positive_op();
                match (positive_op, a, b) {
                    (
                        PositiveBinaryOperator::StrictEqual,
                        JsValue::Constant(a),
                        JsValue::Constant(b),
                    ) if a.is_value_type() => Some(a == b),
                    (
                        PositiveBinaryOperator::StrictEqual,
                        JsValue::Constant(a),
                        JsValue::Constant(b),
                    ) if a.is_value_type() => {
                        let same_type = {
                            use ConstantValue::*;
                            matches!(
                                (a, b),
                                (Num(_), Num(_))
                                    | (Str(_), Str(_))
                                    | (BigInt(_), BigInt(_))
                                    | (True | False, True | False)
                                    | (Undefined, Undefined)
                                    | (Null, Null)
                            )
                        };
                        if same_type { Some(a == b) } else { None }
                    }
                    (
                        PositiveBinaryOperator::Equal,
                        JsValue::Constant(ConstantValue::Str(a)),
                        JsValue::Constant(ConstantValue::Str(b)),
                    ) => Some(a == b),
                    (
                        PositiveBinaryOperator::Equal,
                        JsValue::Constant(ConstantValue::Num(a)),
                        JsValue::Constant(ConstantValue::Num(b)),
                    ) => Some(a == b),
                    _ => None,
                }
                .map(|x| x ^ negate)
            }
            _ => None,
        }
    }

    /// Checks if the value is falsy. Returns None if we don't know. Returns
    /// Some if we know if or if not the value is falsy.
    pub fn is_falsy(&self) -> Option<bool> {
        self.is_truthy().map(|x| !x)
    }

    /// Checks if the value is nullish (null or undefined). Returns None if we
    /// don't know. Returns Some if we know if or if not the value is nullish.
    pub fn is_nullish(&self) -> Option<bool> {
        match self {
            JsValue::Constant(c) => Some(c.is_nullish()),
            JsValue::Concat(..)
            | JsValue::Url(..)
            | JsValue::Array { .. }
            | JsValue::Object { .. }
            | JsValue::WellKnownObject(..)
            | JsValue::WellKnownFunction(..)
            | JsValue::Not(..)
            | JsValue::Binary(..)
            | JsValue::Function(..) => Some(false),
            JsValue::Alternatives {
                total_nodes: _,
                values,
                logical_property,
            } => match logical_property {
                Some(LogicalProperty::Nullish) => Some(true),
                _ => merge_if_known(values, JsValue::is_nullish),
            },
            JsValue::Logical(_, op, list) => match op {
                LogicalOperator::And => {
                    shortcircuit_if_known(list, JsValue::is_falsy, JsValue::is_nullish)
                }
                LogicalOperator::Or => {
                    shortcircuit_if_known(list, JsValue::is_truthy, JsValue::is_nullish)
                }
                LogicalOperator::NullishCoalescing => all_if_known(list, JsValue::is_nullish),
            },
            _ => None,
        }
    }

    /// Checks if we know that the value is not nullish. Returns None if we
    /// don't know. Returns Some if we know if or if not the value is not
    /// nullish.
    pub fn is_not_nullish(&self) -> Option<bool> {
        self.is_nullish().map(|x| !x)
    }

    /// Checks if we know that the value is an empty string. Returns None if we
    /// don't know. Returns Some if we know if or if not the value is an empty
    /// string.
    pub fn is_empty_string(&self) -> Option<bool> {
        match self {
            JsValue::Constant(c) => Some(c.is_empty_string()),
            JsValue::Concat(_, list) => all_if_known(list, JsValue::is_empty_string),
            JsValue::Alternatives {
                total_nodes: _,
                values,
                logical_property: _,
            } => merge_if_known(values, JsValue::is_empty_string),
            JsValue::Logical(_, op, list) => match op {
                LogicalOperator::And => {
                    shortcircuit_if_known(list, JsValue::is_falsy, JsValue::is_empty_string)
                }
                LogicalOperator::Or => {
                    shortcircuit_if_known(list, JsValue::is_truthy, JsValue::is_empty_string)
                }
                LogicalOperator::NullishCoalescing => {
                    shortcircuit_if_known(list, JsValue::is_not_nullish, JsValue::is_empty_string)
                }
            },
            // Booleans are not empty strings
            JsValue::Not(..) | JsValue::Binary(..) => Some(false),
            // Objects are not empty strings
            JsValue::Url(..)
            | JsValue::Array { .. }
            | JsValue::Object { .. }
            | JsValue::WellKnownObject(..)
            | JsValue::WellKnownFunction(..)
            | JsValue::Function(..) => Some(false),
            _ => None,
        }
    }

    /// Returns true, if the value is unknown and storing it as condition
    /// doesn't make sense. This is for optimization purposes.
    pub fn is_unknown(&self) -> bool {
        match self {
            JsValue::Unknown { .. } => true,
            JsValue::Alternatives {
                total_nodes: _,
                values,
                logical_property: _,
            } => values.iter().any(|x| x.is_unknown()),
            _ => false,
        }
    }

    /// Checks if we know that the value is a string. Returns None if we
    /// don't know. Returns Some if we know if or if not the value is a string.
    pub fn is_string(&self) -> Option<bool> {
        match self {
            JsValue::Constant(ConstantValue::Str(..))
            | JsValue::Concat(..)
            | JsValue::TypeOf(..) => Some(true),

            // Objects are not strings
            JsValue::Constant(..)
            | JsValue::Array { .. }
            | JsValue::Object { .. }
            | JsValue::Url(..)
            | JsValue::Module(..)
            | JsValue::Function(..)
            | JsValue::WellKnownObject(_)
            | JsValue::WellKnownFunction(_)
            | JsValue::Promise(_, _) => Some(false),

            // Booleans are not strings
            JsValue::Not(..) | JsValue::Binary(..) => Some(false),

            JsValue::Add(_, list) => any_if_known(list, JsValue::is_string),
            JsValue::Logical(_, op, list) => match op {
                LogicalOperator::And => {
                    shortcircuit_if_known(list, JsValue::is_falsy, JsValue::is_string)
                }
                LogicalOperator::Or => {
                    shortcircuit_if_known(list, JsValue::is_truthy, JsValue::is_string)
                }
                LogicalOperator::NullishCoalescing => {
                    shortcircuit_if_known(list, JsValue::is_not_nullish, JsValue::is_string)
                }
            },

            JsValue::Alternatives {
                total_nodes: _,
                values,
                logical_property: _,
            } => merge_if_known(values, JsValue::is_string),

            JsValue::Call(_, call)
                if matches!(
                    call.callee(),
                    JsValue::WellKnownFunction(
                        WellKnownFunctionKind::RequireResolve
                            | WellKnownFunctionKind::PathJoin
                            | WellKnownFunctionKind::PathResolve(..)
                            | WellKnownFunctionKind::OsArch
                            | WellKnownFunctionKind::OsPlatform
                            | WellKnownFunctionKind::PathDirname
                            | WellKnownFunctionKind::PathToFileUrl
                            | WellKnownFunctionKind::ProcessCwd,
                    )
                ) =>
            {
                Some(true)
            }

            JsValue::Awaited(_, operand) => match &**operand {
                JsValue::Promise(_, v) => v.is_string(),
                v => v.is_string(),
            },

            JsValue::FreeVar(..)
            | JsValue::Variable(_)
            | JsValue::Unknown { .. }
            | JsValue::Argument(..)
            | JsValue::New(..)
            | JsValue::Call(..)
            | JsValue::MemberCall(..)
            | JsValue::Member(..)
            | JsValue::Tenary(..)
            | JsValue::SuperCall(..)
            | JsValue::Iterated(..) => None,
        }
    }

    /// Checks if we know that the value starts with a given string. Returns
    /// None if we don't know. Returns Some if we know if or if not the
    /// value starts with the given string.
    pub fn starts_with(&self, str: &str) -> Option<bool> {
        if let Some(s) = self.as_str() {
            return Some(s.starts_with(str));
        }
        match self {
            JsValue::Alternatives {
                total_nodes: _,
                values,
                logical_property: _,
            } => merge_if_known(values, |a| a.starts_with(str)),
            JsValue::Concat(_, list) => {
                if let Some(item) = list.iter().next() {
                    if item.starts_with(str) == Some(true) {
                        Some(true)
                    } else if let Some(s) = item.as_str() {
                        if str.starts_with(s) {
                            None
                        } else {
                            Some(false)
                        }
                    } else {
                        None
                    }
                } else {
                    Some(false)
                }
            }

            _ => None,
        }
    }

    /// Checks if we know that the value ends with a given string. Returns
    /// None if we don't know. Returns Some if we know if or if not the
    /// value ends with the given string.
    pub fn ends_with(&self, str: &str) -> Option<bool> {
        if let Some(s) = self.as_str() {
            return Some(s.ends_with(str));
        }
        match self {
            JsValue::Alternatives {
                total_nodes: _,
                values,
                logical_property: _,
            } => merge_if_known(values, |alt| alt.ends_with(str)),
            JsValue::Concat(_, list) => {
                if let Some(item) = list.last() {
                    if item.ends_with(str) == Some(true) {
                        Some(true)
                    } else if let Some(s) = item.as_str() {
                        if str.ends_with(s) { None } else { Some(false) }
                    } else {
                        None
                    }
                } else {
                    Some(false)
                }
            }

            _ => None,
        }
    }
}

/// Compute the compile-time value of all elements of the list. If all evaluate
/// to the same value return that. Otherwise return None.
fn merge_if_known<T: Copy>(
    list: impl IntoIterator<Item = T>,
    func: impl Fn(T) -> Option<bool>,
) -> Option<bool> {
    let mut current = None;
    for item in list.into_iter().map(func) {
        if item.is_some() {
            if current.is_none() {
                current = item;
            } else if current != item {
                return None;
            }
        } else {
            return None;
        }
    }
    current
}

/// Evaluates all elements of the list and returns Some(true) if all elements
/// are compile-time true. If any element is compile-time false, return
/// Some(false). Otherwise return None.
fn all_if_known<T: Copy>(
    list: impl IntoIterator<Item = T>,
    func: impl Fn(T) -> Option<bool>,
) -> Option<bool> {
    let mut unknown = false;
    for item in list.into_iter().map(func) {
        match item {
            Some(false) => return Some(false),
            None => unknown = true,
            _ => {}
        }
    }
    if unknown { None } else { Some(true) }
}

/// Evaluates all elements of the list and returns Some(true) if any element is
/// compile-time true. If all elements are compile-time false, return
/// Some(false). Otherwise return None.
fn any_if_known<T: Copy>(
    list: impl IntoIterator<Item = T>,
    func: impl Fn(T) -> Option<bool>,
) -> Option<bool> {
    all_if_known(list, |x| func(x).map(|x| !x)).map(|x| !x)
}

/// Selects the first element of the list where `use_item` is compile-time true.
/// For this element returns the result of `item_value`. Otherwise returns None.
fn shortcircuit_if_known<T: Copy>(
    list: impl IntoIterator<Item = T>,
    use_item: impl Fn(T) -> Option<bool>,
    item_value: impl FnOnce(T) -> Option<bool>,
) -> Option<bool> {
    let mut it = list.into_iter().peekable();
    while let Some(item) = it.next() {
        if it.peek().is_none() {
            return item_value(item);
        } else {
            match use_item(item) {
                Some(true) => return item_value(item),
                None => return None,
                _ => {}
            }
        }
    }
    None
}

// Visiting
impl JsValue {
    /// Calls a function for each child of the node. Allows mutating the node.
    /// Updates the total nodes count after mutation.
    pub fn for_each_children_mut(
        &mut self,
        visitor: &mut impl FnMut(&mut JsValue) -> bool,
    ) -> bool {
        match self {
            JsValue::Alternatives {
                total_nodes: _,
                values: list,
                logical_property: _,
            }
            | JsValue::Concat(_, list)
            | JsValue::Add(_, list)
            | JsValue::Logical(_, _, list)
            | JsValue::Array { items: list, .. } => {
                let mut modified = false;
                for item in list.iter_mut() {
                    if visitor(item) {
                        modified = true
                    }
                }
                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::Not(_, value) => {
                let modified = visitor(value);
                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::Object { parts, .. } => {
                let mut modified = false;
                for item in parts.iter_mut() {
                    match item {
                        ObjectPart::KeyValue(key, value) => {
                            if visitor(key) {
                                modified = true
                            }
                            if visitor(value) {
                                modified = true
                            }
                        }
                        ObjectPart::Spread(value) => {
                            if visitor(value) {
                                modified = true
                            }
                        }
                    }
                }
                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::New(_, call) => {
                let modified = call.for_each_children_mut(visitor);
                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::Call(_, call) => {
                let modified = call.for_each_children_mut(visitor);
                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::SuperCall(_, args) => {
                let mut modified = false;
                for item in args.iter_mut() {
                    if visitor(item) {
                        modified = true
                    }
                }
                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::MemberCall(_, call) => {
                let modified = call.for_each_children_mut(visitor);

                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::Function(_, _, return_value) => {
                let modified = visitor(return_value);

                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::Binary(_, a, _, b) => {
                let m1 = visitor(a);
                let m2 = visitor(b);
                let modified = m1 || m2;
                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::Tenary(_, test, cons, alt) => {
                let m1 = visitor(test);
                let m2 = visitor(cons);
                let m3 = visitor(alt);
                let modified = m1 || m2 || m3;
                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::Member(_, obj, prop) => {
                let m1 = visitor(obj);
                let m2 = visitor(prop);
                let modified = m1 || m2;
                if modified {
                    self.update_total_nodes();
                }
                modified
            }

            JsValue::Iterated(_, operand)
            | JsValue::TypeOf(_, operand)
            | JsValue::Promise(_, operand)
            | JsValue::Awaited(_, operand) => {
                let modified = visitor(operand);
                if modified {
                    self.update_total_nodes();
                }
                modified
            }

            JsValue::Constant(_)
            | JsValue::FreeVar(_)
            | JsValue::Variable(_)
            | JsValue::Module(..)
            | JsValue::Url(_, _)
            | JsValue::WellKnownObject(_)
            | JsValue::WellKnownFunction(_)
            | JsValue::Unknown { .. }
            | JsValue::Argument(..) => false,
        }
    }

    /// Calls a function for only early children. Allows mutating the
    /// node. Updates the total nodes count after mutation.
    pub fn for_each_early_children_mut(
        &mut self,
        visitor: &mut impl FnMut(&mut JsValue) -> bool,
    ) -> bool {
        match self {
            JsValue::New(_, call) if !call.args().is_empty() => {
                let m = visitor(call.callee_mut());
                if m {
                    self.update_total_nodes();
                }
                m
            }
            JsValue::Call(_, call) if !call.args().is_empty() => {
                let m = visitor(call.callee_mut());
                if m {
                    self.update_total_nodes();
                }
                m
            }
            JsValue::MemberCall(_, call) if !call.args().is_empty() => {
                let m1 = visitor(call.prop_mut());
                let m2 = visitor(call.obj_mut());
                let modified = m1 || m2;
                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::Member(_, obj, _) => {
                let m = visitor(obj);
                if m {
                    self.update_total_nodes();
                }
                m
            }
            _ => false,
        }
    }

    /// Calls a function for only late children. Allows mutating the
    /// node. Updates the total nodes count after mutation.
    pub fn for_each_late_children_mut(
        &mut self,
        visitor: &mut impl FnMut(&mut JsValue) -> bool,
    ) -> bool {
        match self {
            JsValue::New(_, call) if !call.args().is_empty() => {
                let mut modified = false;
                for item in call.args_mut().iter_mut() {
                    if visitor(item) {
                        modified = true
                    }
                }
                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::Call(_, call) if !call.args().is_empty() => {
                let mut modified = false;
                for item in call.args_mut().iter_mut() {
                    if visitor(item) {
                        modified = true
                    }
                }
                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::MemberCall(_, call) if !call.args().is_empty() => {
                let mut modified = false;
                for item in call.args_mut().iter_mut() {
                    if visitor(item) {
                        modified = true
                    }
                }
                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::Member(_, _, prop) => {
                let m = visitor(prop);
                if m {
                    self.update_total_nodes();
                }
                m
            }
            _ => self.for_each_children_mut(visitor),
        }
    }

    /// Visit the node and all its children with a function.
    pub fn visit(&self, visitor: &mut impl FnMut(&JsValue)) {
        self.for_each_children(&mut |value| value.visit(visitor));
        visitor(self);
    }

    /// Calls a function for all children of the node.
    pub fn for_each_children(&self, visitor: &mut impl FnMut(&JsValue)) {
        match self {
            JsValue::Alternatives {
                total_nodes: _,
                values: list,
                logical_property: _,
            }
            | JsValue::Concat(_, list)
            | JsValue::Add(_, list)
            | JsValue::Logical(_, _, list)
            | JsValue::Array { items: list, .. } => {
                for item in list.iter() {
                    visitor(item);
                }
            }
            JsValue::Not(_, value) => {
                visitor(value);
            }
            JsValue::Object { parts, .. } => {
                for item in parts.iter() {
                    match item {
                        ObjectPart::KeyValue(key, value) => {
                            visitor(key);
                            visitor(value);
                        }
                        ObjectPart::Spread(value) => {
                            visitor(value);
                        }
                    }
                }
            }
            JsValue::New(_, call) => {
                call.for_each_children(visitor);
            }
            JsValue::Call(_, call) => {
                call.for_each_children(visitor);
            }
            JsValue::SuperCall(_, args) => {
                for item in args.iter() {
                    visitor(item);
                }
            }
            JsValue::MemberCall(_, call) => {
                call.for_each_children(visitor);
            }
            JsValue::Function(_, _, return_value) => {
                visitor(return_value);
            }
            JsValue::Member(_, obj, prop) => {
                visitor(obj);
                visitor(prop);
            }
            JsValue::Binary(_, a, _, b) => {
                visitor(a);
                visitor(b);
            }
            JsValue::Tenary(_, test, cons, alt) => {
                visitor(test);
                visitor(cons);
                visitor(alt);
            }

            JsValue::Iterated(_, operand)
            | JsValue::TypeOf(_, operand)
            | JsValue::Promise(_, operand)
            | JsValue::Awaited(_, operand) => {
                visitor(operand);
            }

            JsValue::Constant(_)
            | JsValue::FreeVar(_)
            | JsValue::Variable(_)
            | JsValue::Module(..)
            | JsValue::Url(_, _)
            | JsValue::WellKnownObject(_)
            | JsValue::WellKnownFunction(_)
            | JsValue::Unknown { .. }
            | JsValue::Argument(..) => {}
        }
    }
}

// Alternatives management
impl JsValue {
    /// Add an alternative to the current value. Might be a no-op if the value
    /// already contains this alternative. Potentially expensive operation
    /// as it has to compare the value with all existing alternatives.
    fn add_alt(&mut self, v: Self) {
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
// Like equality, but with depth limit
impl JsValue {
    fn all_similar(a: &[JsValue], b: &[JsValue], depth: usize) -> bool {
        if a.len() != b.len() {
            return false;
        }
        a.iter().zip(b.iter()).all(|(a, b)| a.similar(b, depth))
    }
    /// Check if the values are equal up to the given depth. Might return false
    /// even if the values are equal when hitting the depth limit.
    fn similar(&self, other: &JsValue, depth: usize) -> bool {
        if depth == 0 {
            return false;
        }

        fn all_parts_similar(a: &[ObjectPart], b: &[ObjectPart], depth: usize) -> bool {
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

        fn all_similar_hash<H: std::hash::Hasher>(slice: &[JsValue], state: &mut H, depth: usize) {
            for item in slice {
                item.similar_hash(state, depth);
            }
        }

        fn all_parts_similar_hash<H: std::hash::Hasher>(
            slice: &[ObjectPart],
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
                call.for_each_children(&mut |child: &JsValue| {
                    child.similar_hash(state, depth - 1);
                });
            }
            JsValue::Call(_, call) => {
                call.for_each_children(&mut |child: &JsValue| {
                    child.similar_hash(state, depth - 1);
                });
            }
            JsValue::SuperCall(_, args) => {
                all_similar_hash(args, state, depth - 1);
            }
            JsValue::MemberCall(_, call) => {
                call.for_each_children(&mut |child: &JsValue| {
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
struct SimilarJsValue(JsValue);

impl PartialEq for SimilarJsValue {
    fn eq(&self, other: &Self) -> bool {
        self.0.similar(&other.0, SIMILAR_EQ_DEPTH)
    }
}

impl Eq for SimilarJsValue {}

impl Hash for SimilarJsValue {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.0.similar_hash(state, SIMILAR_HASH_DEPTH)
    }
}

/// A list of well-known objects that have special meaning in the analysis.
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub enum WellKnownObjectKind {
    GlobalObject,
    PathModule,
    PathModuleDefault,
    FsModule,
    FsModuleDefault,
    FsModulePromises,
    FsExtraModule,
    FsExtraModuleDefault,
    ModuleModule,
    ModuleModuleDefault,
    UrlModule,
    UrlModuleDefault,
    WorkerThreadsModule,
    WorkerThreadsModuleDefault,
    ChildProcessModule,
    ChildProcessModuleDefault,
    OsModule,
    OsModuleDefault,
    NodeProcessModule,
    NodeProcessArgv,
    NodeProcessEnv,
    NodePreGyp,
    NodeExpressApp,
    NodeProtobufLoader,
    NodeBuffer,
    RequireCache,
    ImportMeta,
    /// An iterator object, used to model generator return values.
    Generator,
    /// The `module.hot` object providing HMR API.
    ModuleHot,
}

impl WellKnownObjectKind {
    pub fn as_define_name(&self) -> Option<&[&str]> {
        match self {
            Self::GlobalObject => Some(&["Object"]),
            Self::PathModule => Some(&["path"]),
            Self::FsModule => Some(&["fs"]),
            Self::UrlModule => Some(&["url"]),
            Self::ChildProcessModule => Some(&["child_process"]),
            Self::OsModule => Some(&["os"]),
            Self::WorkerThreadsModule => Some(&["worker_threads"]),
            Self::NodeProcessModule => Some(&["process"]),
            Self::NodeProcessArgv => Some(&["process", "argv"]),
            Self::NodeProcessEnv => Some(&["process", "env"]),
            Self::NodeBuffer => Some(&["Buffer"]),
            Self::RequireCache => Some(&["require", "cache"]),
            Self::ImportMeta => Some(&["import", "meta"]),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct RequireContextOptions {
    pub dir: RcStr,
    pub include_subdirs: bool,
    /// this is a regex (pattern, flags)
    pub filter: EsRegex,
}

/// Parse the arguments passed to a require.context invocation, validate them
/// and convert them to the appropriate rust values.
pub fn parse_require_context(args: &[JsValue]) -> Result<RequireContextOptions> {
    if !(1..=3).contains(&args.len()) {
        // https://linear.app/vercel/issue/WEB-910/add-support-for-requirecontexts-mode-argument
        bail!("require.context() only supports 1-3 arguments (mode is not supported)");
    }

    let Some(dir) = args[0].as_str().map(|s| s.into()) else {
        bail!("require.context(dir, ...) requires dir to be a constant string");
    };

    let include_subdirs = if let Some(include_subdirs) = args.get(1) {
        if let Some(include_subdirs) = include_subdirs.as_bool() {
            include_subdirs
        } else {
            bail!(
                "require.context(..., includeSubdirs, ...) requires includeSubdirs to be a \
                 constant boolean",
            );
        }
    } else {
        true
    };

    let filter = if let Some(filter) = args.get(2) {
        if let JsValue::Constant(ConstantValue::Regex(box (pattern, flags))) = filter {
            EsRegex::new(pattern, flags)?
        } else {
            bail!("require.context(..., ..., filter) requires filter to be a regex");
        }
    } else {
        // https://webpack.js.org/api/module-methods/#requirecontext
        // > optional, default /^\.\/.*$/, any file
        static DEFAULT_REGEX: LazyLock<EsRegex> =
            LazyLock::new(|| EsRegex::new(r"^\./.*$", "").unwrap());

        DEFAULT_REGEX.clone()
    };

    Ok(RequireContextOptions {
        dir,
        include_subdirs,
        filter,
    })
}

#[derive(Debug, Clone, Eq, PartialEq)]
pub struct RequireContextValue(FxIndexMap<RcStr, RcStr>);

impl RequireContextValue {
    pub async fn from_context_map(map: Vc<RequireContextMap>) -> Result<Self> {
        let mut context_map = FxIndexMap::default();

        for (key, entry) in map.await?.iter() {
            context_map.insert(key.clone(), entry.origin_relative.clone());
        }

        Ok(RequireContextValue(context_map))
    }
}

impl Hash for RequireContextValue {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.0.len().hash(state);
        for (i, (k, v)) in self.0.iter().enumerate() {
            i.hash(state);
            k.hash(state);
            v.hash(state);
        }
    }
}

/// A list of well-known functions that have special meaning in the analysis.
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub enum WellKnownFunctionKind {
    ArrayFilter,
    ArrayForEach,
    ArrayMap,
    ObjectAssign,
    PathJoin,
    PathDirname,
    /// `0` is the current working directory.
    PathResolve(Box<JsValue>),
    Import,
    Require,
    /// `0` is the path to resolve from (relative to the current module).
    RequireFrom(Box<ConstantString>),
    RequireResolve,
    RequireContext,
    // Boxed: `RequireContextValue` wraps a 56-byte `FxIndexMap`. Inlining it here dominates
    // `WellKnownFunctionKind`'s size (64 bytes) and by extension `JsValue`.
    RequireContextRequire(Box<RequireContextValue>),
    RequireContextRequireKeys(Box<RequireContextValue>),
    RequireContextRequireResolve(Box<RequireContextValue>),
    Define,
    FsReadMethod(Atom),
    FsReadDir,
    PathToFileUrl,
    CreateRequire,
    ChildProcessSpawnMethod(Atom),
    ChildProcessFork,
    OsArch,
    OsPlatform,
    OsEndianness,
    ProcessCwd,
    NodePreGypFind,
    NodeGypBuild,
    NodeBindings,
    NodeExpress,
    NodeExpressSet,
    NodeStrongGlobalize,
    NodeStrongGlobalizeSetRootDir,
    NodeResolveFrom,
    NodeProtobufLoad,
    WorkerConstructor,
    SharedWorkerConstructor,
    // The worker_threads Worker class
    NodeWorkerConstructor,
    URLConstructor,
    /// `module.hot.accept(deps, callback, errorHandler)` — accept HMR updates for dependencies.
    ModuleHotAccept,
    /// `module.hot.decline(deps)` — decline HMR updates for dependencies.
    ModuleHotDecline,
    /// `import.meta.glob(patterns, options?)` — Vite-compatible glob import.
    ImportMetaGlob,
}

impl WellKnownFunctionKind {
    pub fn as_define_name(&self) -> Option<&[&str]> {
        match self {
            Self::Import { .. } => Some(&["import"]),
            Self::Require { .. } => Some(&["require"]),
            Self::RequireResolve => Some(&["require", "resolve"]),
            Self::RequireContext => Some(&["require", "context"]),
            Self::Define => Some(&["define"]),
            _ => None,
        }
    }
}

fn is_unresolved(i: &Ident, unresolved_mark: Mark) -> bool {
    i.ctxt.outer() == unresolved_mark
}

fn is_unresolved_id(i: &Id, unresolved_mark: Mark) -> bool {
    i.1.outer() == unresolved_mark
}

#[doc(hidden)]
pub mod test_utils {
    use anyhow::Result;
    use turbo_rcstr::rcstr;
    use turbo_tasks::{FxIndexMap, PrettyPrintError, Vc};
    use turbopack_core::compile_time_info::CompileTimeInfo;

    use super::{
        ConstantValue, JsValue, JsValueUrlKind, ModuleValue, WellKnownFunctionKind,
        WellKnownObjectKind, builtin::early_replace_builtin, well_known::replace_well_known,
    };
    use crate::{
        analyzer::{
            RequireContextValue, builtin::replace_builtin, imports::ImportAttributes,
            parse_require_context,
        },
        utils::module_value_to_well_known_object,
    };

    pub async fn early_visitor(mut v: JsValue) -> Result<(JsValue, bool)> {
        let m = early_replace_builtin(&mut v);
        Ok((v, m))
    }

    /// Visitor that replaces well known functions and objects with their
    /// corresponding values. Returns the new value and whether it was modified.
    pub async fn visitor(
        v: JsValue,
        compile_time_info: Vc<CompileTimeInfo>,
        attributes: &ImportAttributes,
    ) -> Result<(JsValue, bool)> {
        let ImportAttributes { ignore, .. } = *attributes;
        let mut new_value = match v {
            JsValue::Call(_, ref call)
                if matches!(
                    call.callee(),
                    JsValue::WellKnownFunction(WellKnownFunctionKind::Import)
                ) =>
            {
                match &call.args()[0] {
                    JsValue::Constant(ConstantValue::Str(v)) => {
                        JsValue::promise(JsValue::Module(ModuleValue {
                            module: v.as_atom().into_owned().into(),
                            annotations: None,
                        }))
                    }
                    _ => v.into_unknown(true, rcstr!("import() non constant")),
                }
            }
            JsValue::Call(_, ref call)
                if matches!(
                    call.callee(),
                    JsValue::WellKnownFunction(WellKnownFunctionKind::CreateRequire)
                ) =>
            {
                if let [
                    JsValue::Member(
                        _,
                        box JsValue::WellKnownObject(WellKnownObjectKind::ImportMeta),
                        box JsValue::Constant(ConstantValue::Str(prop)),
                    ),
                ] = call.args()
                    && prop.as_str() == "url"
                {
                    JsValue::WellKnownFunction(WellKnownFunctionKind::Require)
                } else {
                    v.into_unknown(true, rcstr!("createRequire() non constant"))
                }
            }
            JsValue::Call(_, ref call)
                if matches!(
                    call.callee(),
                    JsValue::WellKnownFunction(WellKnownFunctionKind::RequireResolve)
                ) =>
            {
                match &call.args()[0] {
                    JsValue::Constant(v) => (v.to_string() + "/resolved/lib/index.js").into(),
                    _ => v.into_unknown(true, rcstr!("require.resolve non constant")),
                }
            }
            JsValue::Call(_, ref call)
                if matches!(
                    call.callee(),
                    JsValue::WellKnownFunction(WellKnownFunctionKind::ImportMetaGlob)
                ) =>
            {
                v.into_unknown(false, rcstr!("import.meta.glob()"))
            }
            JsValue::Call(_, ref call)
                if matches!(
                    call.callee(),
                    JsValue::WellKnownFunction(WellKnownFunctionKind::RequireContext)
                ) =>
            {
                match parse_require_context(call.args()) {
                    Ok(options) => {
                        let mut map = FxIndexMap::default();

                        map.insert(
                            rcstr!("./a"),
                            format!("[context: {}]/a", options.dir).into(),
                        );
                        map.insert(
                            rcstr!("./b"),
                            format!("[context: {}]/b", options.dir).into(),
                        );
                        map.insert(
                            rcstr!("./c"),
                            format!("[context: {}]/c", options.dir).into(),
                        );

                        JsValue::WellKnownFunction(WellKnownFunctionKind::RequireContextRequire(
                            Box::new(RequireContextValue(map)),
                        ))
                    }
                    Err(err) => v.into_unknown(true, PrettyPrintError(&err).to_string().into()),
                }
            }
            JsValue::New(_, ref call)
                if matches!(
                    call.callee(),
                    JsValue::WellKnownFunction(WellKnownFunctionKind::URLConstructor)
                ) =>
            {
                if let [
                    JsValue::Constant(ConstantValue::Str(url)),
                    JsValue::Member(
                        _,
                        box JsValue::WellKnownObject(WellKnownObjectKind::ImportMeta),
                        box JsValue::Constant(ConstantValue::Str(prop)),
                    ),
                ] = call.args()
                {
                    if prop.as_str() == "url" {
                        // TODO avoid clone
                        JsValue::Url(url.clone(), JsValueUrlKind::Relative)
                    } else {
                        v.into_unknown(true, rcstr!("new non constant"))
                    }
                } else {
                    v.into_unknown(true, rcstr!("new non constant"))
                }
            }
            JsValue::FreeVar(ref var) => match &**var {
                "__dirname" => rcstr!("__dirname").into(),
                "__filename" => rcstr!("__filename").into(),

                "require" => JsValue::unknown_if(
                    ignore,
                    JsValue::WellKnownFunction(WellKnownFunctionKind::Require),
                    true,
                    rcstr!("ignored require"),
                ),
                "import" => JsValue::unknown_if(
                    ignore,
                    JsValue::WellKnownFunction(WellKnownFunctionKind::Import),
                    true,
                    rcstr!("ignored import"),
                ),
                "Worker" => JsValue::unknown_if(
                    ignore,
                    JsValue::WellKnownFunction(WellKnownFunctionKind::WorkerConstructor),
                    true,
                    rcstr!("ignored Worker constructor"),
                ),
                "define" => JsValue::WellKnownFunction(WellKnownFunctionKind::Define),
                "URL" => JsValue::WellKnownFunction(WellKnownFunctionKind::URLConstructor),
                "process" => JsValue::WellKnownObject(WellKnownObjectKind::NodeProcessModule),
                "Object" => JsValue::WellKnownObject(WellKnownObjectKind::GlobalObject),
                "Buffer" => JsValue::WellKnownObject(WellKnownObjectKind::NodeBuffer),
                _ => v.into_unknown(true, rcstr!("unknown global")),
            },
            JsValue::Module(ref mv) => {
                if let Some(wko) = module_value_to_well_known_object(mv) {
                    wko
                } else {
                    return Ok((v, false));
                }
            }
            _ => {
                let (mut v, m1) = replace_well_known(v, compile_time_info, true).await?;
                let m2 = replace_builtin(&mut v);
                let m = m1 || m2 || v.make_nested_operations_unknown();
                return Ok((v, m));
            }
        };
        new_value.normalize_shallow();
        Ok((new_value, true))
    }
}

#[cfg(test)]
mod tests {
    use std::{mem::take, path::PathBuf, time::Instant};

    use parking_lot::Mutex;
    use rstest::rstest;
    use rustc_hash::FxHashMap;
    use swc_core::{
        common::{Mark, comments::SingleThreadedComments},
        ecma::{
            ast::{EsVersion, Id},
            parser::parse_file_as_program,
            transforms::base::resolver,
            visit::VisitMutWith,
        },
        testing::{NormalizedOutput, fixture, run_test},
    };
    use turbo_rcstr::rcstr;
    use turbo_tasks::{ResolvedVc, util::FormatDuration};
    use turbopack_core::{
        compile_time_info::CompileTimeInfo,
        environment::{Environment, ExecutionEnvironment, NodeJsEnvironment, NodeJsVersion},
        target::{Arch, CompileTarget, Endianness, Libc, Platform},
    };

    use super::{
        JsValue,
        graph::{ConditionalKind, Effect, EffectArg, EvalContext, VarGraph, create_graph},
        linker::link,
    };
    use crate::{
        AnalyzeMode,
        analyzer::{graph::AssignmentScopes, imports::ImportAttributes},
    };

    #[fixture("tests/analyzer/graph/**/input.js")]
    fn fixture(input: PathBuf) {
        let graph_snapshot_path = input.with_file_name("graph.snapshot");
        let graph_explained_snapshot_path = input.with_file_name("graph-explained.snapshot");
        let graph_effects_snapshot_path = input.with_file_name("graph-effects.snapshot");
        let resolved_explained_snapshot_path = input.with_file_name("resolved-explained.snapshot");
        let resolved_effects_snapshot_path = input.with_file_name("resolved-effects.snapshot");
        let large_marker = input.with_file_name("large");

        run_test(false, |cm, handler| {
            let r = tokio::runtime::Builder::new_current_thread()
                .build()
                .unwrap();
            r.block_on(async move {
                let fm = cm.load_file(&input).unwrap();

                let comments = SingleThreadedComments::default();
                let mut m = parse_file_as_program(
                    &fm,
                    Default::default(),
                    EsVersion::latest(),
                    Some(&comments),
                    &mut vec![],
                )
                .map_err(|err| err.into_diagnostic(handler).emit())?;

                let unresolved_mark = Mark::new();
                let top_level_mark = Mark::new();
                m.visit_mut_with(&mut resolver(unresolved_mark, top_level_mark, false));

                let eval_context = EvalContext::new(
                    Some(&m),
                    unresolved_mark,
                    top_level_mark,
                    Default::default(),
                    Some(&comments),
                );

                let mut var_graph = create_graph(
                    &m,
                    &eval_context,
                    AnalyzeMode::CodeGenerationAndTracing,
                    true,
                );
                let var_cache = Default::default();

                let mut named_values = var_graph
                    .values
                    .clone()
                    .into_iter()
                    .map(|((id, ctx), value)| {
                        let unique = var_graph.values.keys().filter(|(i, _)| &id == i).count() == 1;
                        if unique {
                            (id.to_string(), ((id, ctx), value))
                        } else {
                            (format!("{id}{ctx:?}"), ((id, ctx), value))
                        }
                    })
                    .collect::<Vec<_>>();
                named_values.sort_by(|a, b| a.0.cmp(&b.0));

                fn explain_all<'a>(
                    values: impl IntoIterator<
                        Item = (&'a String, &'a JsValue, Option<AssignmentScopes>),
                    >,
                ) -> String {
                    values
                        .into_iter()
                        .map(|(id, value, assignment_scopes)| {
                            let non_root_assignments = match assignment_scopes {
                                Some(AssignmentScopes::AllInModuleEvalScope) => {
                                    " (const after eval)"
                                }
                                _ => "",
                            };
                            let (explainer, hints) = value.explain(10, 5);
                            format!("{id}{non_root_assignments} = {explainer}{hints}")
                        })
                        .collect::<Vec<_>>()
                        .join("\n\n")
                }

                {
                    // Dump snapshot of graph

                    let large = large_marker.exists();

                    if !large {
                        NormalizedOutput::from(format!(
                            "{:#?}",
                            named_values
                                .iter()
                                .map(|(name, (_, value))| (name, value))
                                .collect::<Vec<_>>()
                        ))
                        .compare_to_file(&graph_snapshot_path)
                        .unwrap();
                    }
                    NormalizedOutput::from(explain_all(named_values.iter().map(
                        |(name, (id, value))| {
                            (
                                name,
                                value,
                                eval_context.imports.assignment_scopes.get(id).copied(),
                            )
                        },
                    )))
                    .compare_to_file(&graph_explained_snapshot_path)
                    .unwrap();
                    if !large {
                        NormalizedOutput::from(format!("{:#?}", var_graph.effects))
                            .compare_to_file(&graph_effects_snapshot_path)
                            .unwrap();
                    }
                }

                {
                    // Dump snapshot of resolved

                    let start = Instant::now();
                    let mut resolved = Vec::new();
                    for (name, (id, _)) in named_values.iter().cloned() {
                        let start = Instant::now();
                        // Ideally this would use eval_context.imports.get_attributes(span), but the
                        // span isn't available here
                        let (res, steps) = resolve(
                            &var_graph,
                            JsValue::Variable(id),
                            ImportAttributes::empty_ref(),
                            &var_cache,
                        )
                        .await;
                        let time = start.elapsed();
                        if time.as_millis() > 1 {
                            println!(
                                "linking {} {name} took {} in {} steps",
                                input.display(),
                                FormatDuration(time),
                                steps
                            );
                        }

                        resolved.push((name, res));
                    }
                    let time = start.elapsed();
                    if time.as_millis() > 1 {
                        println!("linking {} took {}", input.display(), FormatDuration(time));
                    }

                    let start = Instant::now();
                    let explainer =
                        explain_all(resolved.iter().map(|(name, value)| (name, value, None)));
                    let time = start.elapsed();
                    if time.as_millis() > 1 {
                        println!(
                            "explaining {} took {}",
                            input.display(),
                            FormatDuration(time)
                        );
                    }

                    NormalizedOutput::from(explainer)
                        .compare_to_file(&resolved_explained_snapshot_path)
                        .unwrap();
                }

                {
                    // Dump snapshot of resolved effects

                    let start = Instant::now();
                    let mut resolved = Vec::new();
                    let mut queue = take(&mut var_graph.effects)
                        .into_iter()
                        .map(|effect| (0, effect))
                        .rev()
                        .collect::<Vec<_>>();
                    let mut i = 0;
                    while let Some((parent, effect)) = queue.pop() {
                        i += 1;
                        let start = Instant::now();
                        async fn handle_args(
                            args: Vec<EffectArg>,
                            queue: &mut Vec<(usize, Effect)>,
                            var_graph: &VarGraph,
                            var_cache: &Mutex<FxHashMap<Id, JsValue>>,
                            i: usize,
                        ) -> Vec<JsValue> {
                            let mut new_args = Vec::with_capacity(args.len());
                            for arg in args {
                                match arg {
                                    EffectArg::Value(v) => {
                                        new_args.push(
                                            resolve(
                                                var_graph,
                                                v,
                                                ImportAttributes::empty_ref(),
                                                var_cache,
                                            )
                                            .await
                                            .0,
                                        );
                                    }
                                    EffectArg::Closure(v, effects) => {
                                        new_args.push(
                                            resolve(
                                                var_graph,
                                                v,
                                                ImportAttributes::empty_ref(),
                                                var_cache,
                                            )
                                            .await
                                            .0,
                                        );
                                        queue.extend(
                                            effects.effects.into_iter().rev().map(|e| (i, e)),
                                        );
                                    }
                                    EffectArg::Spread => {
                                        new_args
                                            .push(JsValue::unknown_empty(true, rcstr!("spread")));
                                    }
                                }
                            }
                            new_args
                        }
                        let steps = match effect {
                            Effect::Conditional {
                                condition, kind, ..
                            } => {
                                let (condition, steps) = resolve(
                                    &var_graph,
                                    *condition,
                                    ImportAttributes::empty_ref(),
                                    &var_cache,
                                )
                                .await;
                                resolved.push((format!("{parent} -> {i} conditional"), condition));
                                match *kind {
                                    ConditionalKind::If { then } => {
                                        queue
                                            .extend(then.effects.into_iter().rev().map(|e| (i, e)));
                                    }
                                    ConditionalKind::Else { r#else } => {
                                        queue.extend(
                                            r#else.effects.into_iter().rev().map(|e| (i, e)),
                                        );
                                    }
                                    ConditionalKind::IfElse { then, r#else }
                                    | ConditionalKind::Ternary { then, r#else } => {
                                        queue.extend(
                                            r#else.effects.into_iter().rev().map(|e| (i, e)),
                                        );
                                        queue
                                            .extend(then.effects.into_iter().rev().map(|e| (i, e)));
                                    }
                                    ConditionalKind::IfElseMultiple { then, r#else } => {
                                        for then in then {
                                            queue.extend(
                                                then.effects.into_iter().rev().map(|e| (i, e)),
                                            );
                                        }
                                        for r#else in r#else {
                                            queue.extend(
                                                r#else.effects.into_iter().rev().map(|e| (i, e)),
                                            );
                                        }
                                    }
                                    ConditionalKind::And { expr }
                                    | ConditionalKind::Or { expr }
                                    | ConditionalKind::NullishCoalescing { expr }
                                    | ConditionalKind::Labeled { body: expr } => {
                                        queue
                                            .extend(expr.effects.into_iter().rev().map(|e| (i, e)));
                                    }
                                };
                                steps
                            }
                            Effect::Call {
                                func,
                                args,
                                new,
                                span,
                                ..
                            } => {
                                let (func, steps) = resolve(
                                    &var_graph,
                                    *func,
                                    eval_context.imports.get_attributes(span),
                                    &var_cache,
                                )
                                .await;
                                let new_args =
                                    handle_args(args, &mut queue, &var_graph, &var_cache, i).await;
                                resolved.push((
                                    format!("{parent} -> {i} call"),
                                    if new {
                                        JsValue::new_from_iter(func, new_args)
                                    } else {
                                        JsValue::call_from_iter(func, new_args)
                                    },
                                ));
                                steps
                            }
                            Effect::FreeVar { var, .. } => {
                                resolved.push((
                                    format!("{parent} -> {i} free var"),
                                    JsValue::FreeVar(var),
                                ));
                                0
                            }
                            Effect::TypeOf { arg, .. } => {
                                let (arg, steps) = resolve(
                                    &var_graph,
                                    *arg,
                                    ImportAttributes::empty_ref(),
                                    &var_cache,
                                )
                                .await;
                                resolved.push((
                                    format!("{parent} -> {i} typeof"),
                                    JsValue::type_of(Box::new(arg)),
                                ));
                                steps
                            }
                            Effect::MemberCall {
                                obj, prop, args, ..
                            } => {
                                let (obj, obj_steps) = resolve(
                                    &var_graph,
                                    *obj,
                                    ImportAttributes::empty_ref(),
                                    &var_cache,
                                )
                                .await;
                                let (prop, prop_steps) = resolve(
                                    &var_graph,
                                    *prop,
                                    ImportAttributes::empty_ref(),
                                    &var_cache,
                                )
                                .await;
                                let new_args =
                                    handle_args(args, &mut queue, &var_graph, &var_cache, i).await;
                                resolved.push((
                                    format!("{parent} -> {i} member call"),
                                    JsValue::member_call_from_iter(obj, prop, new_args),
                                ));
                                obj_steps + prop_steps
                            }
                            Effect::DynamicImport { args, .. } => {
                                let new_args =
                                    handle_args(args, &mut queue, &var_graph, &var_cache, i).await;
                                resolved.push((
                                    format!("{parent} -> {i} dynamic import"),
                                    JsValue::call_from_iter(
                                        JsValue::FreeVar("import".into()),
                                        new_args,
                                    ),
                                ));
                                0
                            }
                            Effect::Unreachable { .. } => {
                                resolved.push((
                                    format!("{parent} -> {i} unreachable"),
                                    JsValue::unknown_empty(true, rcstr!("unreachable")),
                                ));
                                0
                            }
                            Effect::ImportMeta { .. }
                            | Effect::ImportedBinding { .. }
                            | Effect::Member { .. } => 0,
                        };
                        let time = start.elapsed();
                        if time.as_millis() > 1 {
                            println!(
                                "linking effect {} took {} in {} steps",
                                input.display(),
                                FormatDuration(time),
                                steps
                            );
                        }
                    }
                    let time = start.elapsed();
                    if time.as_millis() > 1 {
                        println!(
                            "linking effects {} took {}",
                            input.display(),
                            FormatDuration(time)
                        );
                    }

                    let start = Instant::now();
                    let explainer =
                        explain_all(resolved.iter().map(|(name, value)| (name, value, None)));
                    let time = start.elapsed();
                    if time.as_millis() > 1 {
                        println!(
                            "explaining effects {} took {}",
                            input.display(),
                            FormatDuration(time)
                        );
                    }

                    NormalizedOutput::from(explainer)
                        .compare_to_file(&resolved_effects_snapshot_path)
                        .unwrap();
                }

                Ok(())
            })
        })
        .unwrap();
    }

    async fn resolve(
        var_graph: &VarGraph,
        val: JsValue,
        attributes: &ImportAttributes,
        var_cache: &Mutex<FxHashMap<Id, JsValue>>,
    ) -> (JsValue, u32) {
        turbo_tasks_testing::VcStorage::with(async {
            let compile_time_info = CompileTimeInfo::builder(
                Environment::new(ExecutionEnvironment::NodeJsLambda(
                    NodeJsEnvironment {
                        compile_target: CompileTarget {
                            arch: Arch::X64,
                            platform: Platform::Linux,
                            endianness: Endianness::Little,
                            libc: Libc::Glibc,
                        }
                        .resolved_cell(),
                        node_version: NodeJsVersion::default().resolved_cell(),
                        cwd: ResolvedVc::cell(None),
                    }
                    .resolved_cell(),
                ))
                .to_resolved()
                .await?,
            )
            .cell()
            .await?;
            link(
                var_graph,
                val,
                &super::test_utils::early_visitor,
                &(|val| {
                    Box::pin(super::test_utils::visitor(
                        val,
                        compile_time_info,
                        attributes,
                    ))
                }),
                &Default::default(),
                var_cache,
            )
            .await
        })
        .await
        .unwrap()
    }

    #[test]
    #[cfg(target_pointer_width = "64")]
    fn jsvalue_size() {
        assert_eq!(32, size_of::<JsValue>());
    }

    #[test]
    fn is_string_constant() {
        let value = EvalContext::eval_single_expr_lit(&rcstr!("'hello'")).unwrap();
        assert_eq!(value.is_string(), Some(true));
    }

    #[rstest]
    #[case("1 && 'hello'")]
    #[case("'hello' || 'bye' || 2")]
    fn is_string_short_circuiting_positive(#[case] input: &str) {
        assert_eq!(
            EvalContext::eval_single_expr_lit(&input.into())
                .unwrap()
                .is_string(),
            Some(true),
            "expected '{}' to be a string",
            input
        );
    }

    #[rstest]
    #[case("'hello' && 2")]
    #[case("2 || 1 || 'hello' || 'bye'")]
    fn is_string_short_circuiting_negative(#[case] input: &str) {
        assert_eq!(
            EvalContext::eval_single_expr_lit(&input.into())
                .unwrap()
                .is_string(),
            Some(false),
            "expected '{}' not to be a string",
            input
        );
    }

    #[rstest]
    #[case("x && 2")]
    #[case("1 && x")]
    #[case("1 && 'a' && x")]
    #[case("x || 'bye'")]
    #[case("false || x")]
    fn is_string_short_circuiting_unknown(#[case] input: &str) {
        assert_eq!(
            EvalContext::eval_single_expr_lit(&input.into())
                .unwrap()
                .is_string(),
            None,
            "expected to be unable to determine whether '{}' is a string",
            input
        );
    }

    #[rstest]
    #[case("'' && 'string'")]
    #[case("false || ''")]
    #[case("1 && 'a' && ''")]
    fn is_empty_string_short_circuiting_positive(#[case] input: &str) {
        assert_eq!(
            EvalContext::eval_single_expr_lit(&input.into())
                .unwrap()
                .is_empty_string(),
            Some(true),
            "expected '{}' to be an empty string",
            input
        );
    }

    #[rstest]
    #[case("false && ''")]
    #[case("'' || 'string'")]
    #[case("'' || 0 || 'string'")]
    fn is_empty_string_short_circuiting_negative(#[case] input: &str) {
        assert_eq!(
            EvalContext::eval_single_expr_lit(&input.into())
                .unwrap()
                .is_empty_string(),
            Some(false),
            "expected '{}' not to be an empty string",
            input
        );
    }

    #[rstest]
    #[case("x && ''")]
    #[case("1 && x")]
    #[case("x || ''")]
    #[case("'' || x")]
    #[case("false || 0 || x")]
    fn is_empty_string_short_circuiting_unknown(#[case] input: &str) {
        assert_eq!(
            EvalContext::eval_single_expr_lit(&input.into())
                .unwrap()
                .is_empty_string(),
            None,
            "expected to be unable to determine whether '{}' is an empty string",
            input
        );
    }

    #[rstest]
    #[case("null && ''")]
    #[case("'' || null")]
    #[case("1 && 2 && null")]
    fn is_nullish_short_circuiting_positive(#[case] input: &str) {
        assert_eq!(
            EvalContext::eval_single_expr_lit(&input.into())
                .unwrap()
                .is_nullish(),
            Some(true),
            "expected '{}' to be nullish",
            input
        );
    }

    #[rstest]
    #[case("'' && null")]
    #[case("null || ''")]
    #[case("null || '' || 'a'")]
    fn is_nullish_short_circuiting_negative(#[case] input: &str) {
        assert_eq!(
            EvalContext::eval_single_expr_lit(&input.into())
                .unwrap()
                .is_nullish(),
            Some(false),
            "expected '{}' not to be nullish",
            input
        );
    }

    #[rstest]
    #[case("x && null")]
    #[case("1 && x")]
    #[case("x || null")]
    #[case("null || x")]
    #[case("false || x")]
    #[case("1 && x && null")]
    fn is_nullish_short_circuiting_unknown(#[case] input: &str) {
        assert_eq!(
            EvalContext::eval_single_expr_lit(&input.into())
                .unwrap()
                .is_nullish(),
            None,
            "expected to be unable to determine whether '{}' is nullish",
            input
        );
    }

    #[rstest]
    #[case("'' && null")]
    #[case("null || ''")]
    #[case("null || 0 || 'a'")]
    fn is_not_nullish_short_circuiting_positive(#[case] input: &str) {
        assert_eq!(
            EvalContext::eval_single_expr_lit(&input.into())
                .unwrap()
                .is_not_nullish(),
            Some(true),
            "expected '{}' to be not-nullish",
            input
        );
    }

    #[rstest]
    #[case("null && ''")]
    #[case("'' || null")]
    #[case("'' || 0 || null")]
    fn is_not_nullish_short_circuiting_negative(#[case] input: &str) {
        assert_eq!(
            EvalContext::eval_single_expr_lit(&input.into())
                .unwrap()
                .is_not_nullish(),
            Some(false),
            "expected '{}' not to be not-nullish",
            input
        );
    }

    #[rstest]
    #[case("x && null")]
    #[case("1 && x")]
    #[case("x || null")]
    #[case("null || x")]
    #[case("false || x")]
    #[case("false || x || ''")]
    fn is_not_nullish_short_circuiting_unknown(#[case] input: &str) {
        assert_eq!(
            EvalContext::eval_single_expr_lit(&input.into())
                .unwrap()
                .is_not_nullish(),
            None,
            "expected to be unable to determine whether '{}' is not-nullish",
            input
        );
    }
}
