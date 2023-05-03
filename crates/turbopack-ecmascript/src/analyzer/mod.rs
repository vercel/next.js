use std::{
    borrow::Cow,
    cmp::Ordering,
    fmt::Display,
    future::Future,
    hash::{Hash, Hasher},
    mem::take,
    pin::Pin,
    sync::Arc,
};

use anyhow::{bail, Context, Result};
use indexmap::{IndexMap, IndexSet};
use num_bigint::BigInt;
use num_traits::identities::Zero;
use once_cell::sync::Lazy;
use regex::Regex;
use swc_core::{
    common::Mark,
    ecma::{
        ast::{Id, Ident, Lit},
        atoms::{Atom, JsWord},
    },
};
use turbopack_core::compile_time_info::CompileTimeDefineValue;
use url::Url;

use self::imports::ImportAnnotations;
pub(crate) use self::imports::ImportMap;
use crate::{references::require_context::RequireContextMapVc, utils::StringifyJs};

pub mod builtin;
pub mod graph;
pub mod imports;
pub mod linker;
pub mod well_known;

type PinnedAsyncUntilSettledBox<'a, E> =
    Pin<Box<dyn Future<Output = Result<(JsValue, bool), E>> + Send + 'a>>;

type PinnedAsyncBox<'a, E> = Pin<Box<dyn Future<Output = Result<(JsValue, bool), E>> + 'a>>;

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

#[derive(Debug, Clone)]
pub struct ConstantNumber(pub f64);

fn integer_decode(val: f64) -> (u64, i16, i8) {
    let bits: u64 = val.to_bits();
    let sign: i8 = if bits >> 63 == 0 { 1 } else { -1 };
    let mut exponent: i16 = ((bits >> 52) & 0x7ff) as i16;
    let mantissa = if exponent == 0 {
        (bits & 0xfffffffffffff) << 1
    } else {
        (bits & 0xfffffffffffff) | 0x10000000000000
    };

    exponent -= 1023 + 52;
    (mantissa, exponent, sign)
}

impl ConstantNumber {
    pub fn as_u32_index(&self) -> Option<usize> {
        let index: u32 = self.0 as u32;
        (index as f64 == self.0).then_some(index as usize)
    }
}

impl Hash for ConstantNumber {
    fn hash<H: Hasher>(&self, state: &mut H) {
        integer_decode(self.0).hash(state);
    }
}

impl PartialEq for ConstantNumber {
    fn eq(&self, other: &Self) -> bool {
        integer_decode(self.0) == integer_decode(other.0)
    }
}

impl Eq for ConstantNumber {}

#[derive(Debug, Clone)]
pub enum ConstantString {
    Word(JsWord),
    Atom(Atom),
}

impl ConstantString {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Word(s) => s,
            Self::Atom(s) => s,
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

impl From<JsWord> for ConstantString {
    fn from(v: JsWord) -> Self {
        ConstantString::Word(v)
    }
}

impl From<Atom> for ConstantString {
    fn from(v: Atom) -> Self {
        ConstantString::Atom(v)
    }
}

impl From<&'static str> for ConstantString {
    fn from(v: &'static str) -> Self {
        ConstantString::Word(v.into())
    }
}

impl From<String> for ConstantString {
    fn from(v: String) -> Self {
        ConstantString::Atom(v.into())
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
    BigInt(BigInt),
    Regex(Atom, Atom),
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
            Self::Num(ConstantNumber(n)) => *n != 0.0,
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
        ConstantValue::Str(ConstantString::Word(v.into()))
    }
}

impl From<Lit> for ConstantValue {
    fn from(v: Lit) -> Self {
        match v {
            Lit::Str(v) => ConstantValue::Str(ConstantString::Word(v.value)),
            Lit::Bool(v) => {
                if v.value {
                    ConstantValue::True
                } else {
                    ConstantValue::False
                }
            }
            Lit::Null(_) => ConstantValue::Null,
            Lit::Num(v) => ConstantValue::Num(ConstantNumber(v.value)),
            Lit::BigInt(v) => ConstantValue::BigInt(*v.value),
            Lit::Regex(v) => ConstantValue::Regex(v.exp, v.flags),
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
            ConstantValue::Regex(exp, flags) => write!(f, "/{exp}/{flags}"),
        }
    }
}

#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub struct ModuleValue {
    pub module: JsWord,
    pub annotations: ImportAnnotations,
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

/// TODO: Use `Arc`
/// There are 4 kinds of values: Leaves, Nested, Operations, and Placeholders
/// (see [JsValueMetaKind] for details). Values are processed in two phases:
/// - Analyze phase: We convert AST into [JsValue]s. We don't have contextual
///   information so we need to insert placeholders to represent that.
/// - Link phase: We try to reduce a value to a constant value. The link phase
///   has 5 substeps that are executed on each node in the graph depth-first.
///   When a value is modified, we need to visit the new children again.
/// - Replace variables with their values. This replaces [JsValue::Variable]. No
///   variable should be remaining after that.
/// - Replace placeholders with contextual information. This usually replaces
///   [JsValue::FreeVar] and [JsValue::Module]. Some [JsValue::Call] on well-
///   known functions might also be replaced. No free vars or modules should be
///   remaining after that.
/// - Replace operations on well-known objects and functions. This handles
///   [JsValue::Call] and [JsValue::Member] on well-known objects and functions.
/// - Replace all built-in functions with their values when they are
///   compile-time constant.
/// - For optimization, any nested operations are replaced with
///   [JsValue::Unknown]. So only one layer of operation remains.
/// Any remaining operation or placeholder can be treated as unknown.
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub enum JsValue {
    // LEAF VALUES
    // ----------------------------
    /// A constant primitive value.
    Constant(ConstantValue),
    /// An constant URL object.
    Url(Url),
    /// Some kind of well-known object
    /// (must not be an array, otherwise Array.concat needs to be changed)
    WellKnownObject(WellKnownObjectKind),
    /// Some kind of well-known function
    WellKnownFunction(WellKnownFunctionKind),
    /// Not-analyzable value. Might contain the original value for additional
    /// info. Has a reason string for explanation.
    Unknown(Option<Arc<JsValue>>, Cow<'static, str>),

    // NESTED VALUES
    // ----------------------------
    /// An array of nested values
    Array {
        total_nodes: usize,
        items: Vec<JsValue>,
        mutable: bool,
    },
    /// An object of nested values
    Object {
        total_nodes: usize,
        parts: Vec<ObjectPart>,
        mutable: bool,
    },
    /// A list of alternative values
    Alternatives(usize, Vec<JsValue>),
    /// A function reference. The return value might contain [JsValue::Argument]
    /// placeholders that need to be replaced when calling this function.
    /// `(total_node_count, func_ident, return_value)`
    Function(usize, u32, Box<JsValue>),

    // OPERATIONS
    // ----------------------------
    /// A string concatenation of values.
    /// `foo.${unknownVar}.js` => 'foo' + Unknown + '.js'
    Concat(usize, Vec<JsValue>),
    /// An addition of values.
    /// This can be converted to [JsValue::Concat] if the type of the variable
    /// is string.
    Add(usize, Vec<JsValue>),
    /// Logical negation `!expr`
    Not(usize, Box<JsValue>),
    /// Logical operator chain e. g. `expr && expr`
    Logical(usize, LogicalOperator, Vec<JsValue>),
    /// Binary expression e. g. `expr == expr`
    Binary(usize, Box<JsValue>, BinaryOperator, Box<JsValue>),
    /// A function call without a this context.
    /// `(total_node_count, callee, args)`
    Call(usize, Box<JsValue>, Vec<JsValue>),
    /// A function call with a this context.
    /// `(total_node_count, obj, prop, args)`
    MemberCall(usize, Box<JsValue>, Box<JsValue>, Vec<JsValue>),
    /// A member access `obj[prop]`
    /// `(total_node_count, obj, prop)`
    Member(usize, Box<JsValue>, Box<JsValue>),

    // PLACEHOLDERS
    // ----------------------------
    /// A reference to a variable.
    Variable(Id),
    /// A reference to an function argument.
    /// (func_ident, arg_index)
    Argument(u32, usize),
    // TODO no predefined kinds, only JsWord
    /// A reference to a free variable.
    FreeVar(JsWord),
    /// This is a reference to a imported module.
    Module(ModuleValue),
}

impl From<&'_ str> for JsValue {
    fn from(v: &str) -> Self {
        ConstantValue::Str(ConstantString::Word(v.into())).into()
    }
}

impl From<JsWord> for JsValue {
    fn from(v: JsWord) -> Self {
        ConstantValue::Str(ConstantString::Word(v)).into()
    }
}

impl From<Atom> for JsValue {
    fn from(v: Atom) -> Self {
        ConstantValue::Str(ConstantString::Atom(v)).into()
    }
}

impl From<BigInt> for JsValue {
    fn from(v: BigInt) -> Self {
        ConstantValue::BigInt(v).into()
    }
}

impl From<f64> for JsValue {
    fn from(v: f64) -> Self {
        ConstantValue::Num(ConstantNumber(v)).into()
    }
}

impl From<String> for JsValue {
    fn from(v: String) -> Self {
        ConstantValue::Str(v.into()).into()
    }
}

impl From<swc_core::ecma::ast::Str> for JsValue {
    fn from(v: swc_core::ecma::ast::Str) -> Self {
        ConstantValue::Str(v.value.into()).into()
    }
}

impl From<ConstantValue> for JsValue {
    fn from(v: ConstantValue) -> Self {
        JsValue::Constant(v)
    }
}

impl From<&CompileTimeDefineValue> for JsValue {
    fn from(v: &CompileTimeDefineValue) -> Self {
        match v {
            CompileTimeDefineValue::String(s) => JsValue::Constant(s.as_str().into()),
            CompileTimeDefineValue::Bool(b) => JsValue::Constant((*b).into()),
        }
    }
}

impl Default for JsValue {
    fn default() -> Self {
        JsValue::unknown_empty("")
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
            JsValue::Url(url) => write!(f, "{}", url),
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
            JsValue::Alternatives(_, list) => write!(
                f,
                "({})",
                list.iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(" | ")
            ),
            JsValue::FreeVar(name) => write!(f, "FreeVar({:?})", name),
            JsValue::Variable(name) => write!(f, "Variable({}#{:?})", name.0, name.1),
            JsValue::Concat(_, list) => write!(
                f,
                "`{}`",
                list.iter()
                    .map(|v| v
                        .as_str()
                        .map_or_else(|| format!("${{{}}}", v), |str| str.to_string()))
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
            JsValue::Not(_, value) => write!(f, "!({})", value),
            JsValue::Logical(_, op, list) => write!(
                f,
                "({})",
                list.iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(op.joiner())
            ),
            JsValue::Binary(_, a, op, b) => write!(f, "({}{}{})", a, op.joiner(), b),
            JsValue::Call(_, callee, list) => write!(
                f,
                "{}({})",
                callee,
                list.iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            JsValue::MemberCall(_, obj, prop, list) => write!(
                f,
                "{}[{}]({})",
                obj,
                prop,
                list.iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            JsValue::Member(_, obj, prop) => write!(f, "{}[{}]", obj, prop),
            JsValue::Module(ModuleValue {
                module: name,
                annotations,
            }) => {
                write!(f, "Module({}, {})", name, annotations)
            }
            JsValue::Unknown(..) => write!(f, "???"),
            JsValue::WellKnownObject(obj) => write!(f, "WellKnownObject({:?})", obj),
            JsValue::WellKnownFunction(func) => write!(f, "WellKnownFunction({:?})", func),
            JsValue::Function(_, func_ident, return_value) => {
                write!(f, "Function#{}(return = {:?})", func_ident, return_value)
            }
            JsValue::Argument(func_ident, index) => {
                write!(f, "arguments[{}#{}]", index, func_ident)
            }
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

fn total_nodes(vec: &[JsValue]) -> usize {
    vec.iter().map(|v| v.total_nodes()).sum::<usize>()
}

// Private meta methods
impl JsValue {
    fn meta_type(&self) -> JsValueMetaKind {
        match self {
            JsValue::Constant(..)
            | JsValue::Url(..)
            | JsValue::WellKnownObject(..)
            | JsValue::WellKnownFunction(..)
            | JsValue::Unknown(..) => JsValueMetaKind::Leaf,
            JsValue::Array { .. }
            | JsValue::Object { .. }
            | JsValue::Alternatives(..)
            | JsValue::Function(..)
            | JsValue::Member(..) => JsValueMetaKind::Nested,
            JsValue::Concat(..)
            | JsValue::Add(..)
            | JsValue::Not(..)
            | JsValue::Logical(..)
            | JsValue::Binary(..)
            | JsValue::Call(..)
            | JsValue::MemberCall(..) => JsValueMetaKind::Operation,
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
        Self::Alternatives(1 + total_nodes(&list), list)
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

    pub fn equal(a: JsValue, b: JsValue) -> Self {
        Self::Binary(
            1 + a.total_nodes() + b.total_nodes(),
            Box::new(a),
            BinaryOperator::Equal,
            Box::new(b),
        )
    }

    pub fn not_equal(a: JsValue, b: JsValue) -> Self {
        Self::Binary(
            1 + a.total_nodes() + b.total_nodes(),
            Box::new(a),
            BinaryOperator::NotEqual,
            Box::new(b),
        )
    }

    pub fn strict_equal(a: JsValue, b: JsValue) -> Self {
        Self::Binary(
            1 + a.total_nodes() + b.total_nodes(),
            Box::new(a),
            BinaryOperator::StrictEqual,
            Box::new(b),
        )
    }

    pub fn strict_not_equal(a: JsValue, b: JsValue) -> Self {
        Self::Binary(
            1 + a.total_nodes() + b.total_nodes(),
            Box::new(a),
            BinaryOperator::StrictNotEqual,
            Box::new(b),
        )
    }

    pub fn logical_not(inner: Box<JsValue>) -> Self {
        Self::Not(1 + inner.total_nodes(), inner)
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

    pub fn function(func_ident: u32, return_value: Box<JsValue>) -> Self {
        Self::Function(1 + return_value.total_nodes(), func_ident, return_value)
    }

    pub fn object(list: Vec<ObjectPart>) -> Self {
        Self::Object {
            total_nodes: 1 + list
                .iter()
                .map(|v| match v {
                    ObjectPart::KeyValue(k, v) => k.total_nodes() + v.total_nodes(),
                    ObjectPart::Spread(s) => s.total_nodes(),
                })
                .sum::<usize>(),
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
                .sum::<usize>(),
            parts: list,
            mutable: false,
        }
    }

    pub fn call(f: Box<JsValue>, args: Vec<JsValue>) -> Self {
        Self::Call(1 + f.total_nodes() + total_nodes(&args), f, args)
    }

    pub fn member_call(o: Box<JsValue>, p: Box<JsValue>, args: Vec<JsValue>) -> Self {
        Self::MemberCall(
            1 + o.total_nodes() + p.total_nodes() + total_nodes(&args),
            o,
            p,
            args,
        )
    }

    pub fn member(o: Box<JsValue>, p: Box<JsValue>) -> Self {
        Self::Member(1 + o.total_nodes() + p.total_nodes(), o, p)
    }

    pub fn unknown(value: impl Into<Arc<JsValue>>, reason: impl Into<Cow<'static, str>>) -> Self {
        Self::Unknown(Some(value.into()), reason.into())
    }

    pub fn unknown_empty(reason: impl Into<Cow<'static, str>>) -> Self {
        Self::Unknown(None, reason.into())
    }
}

// Methods regarding node count
impl JsValue {
    pub fn total_nodes(&self) -> usize {
        match self {
            JsValue::Constant(_)
            | JsValue::Url(_)
            | JsValue::FreeVar(_)
            | JsValue::Variable(_)
            | JsValue::Module(..)
            | JsValue::WellKnownObject(_)
            | JsValue::WellKnownFunction(_)
            | JsValue::Unknown(_, _)
            | JsValue::Argument(..) => 1,

            JsValue::Array { total_nodes: c, .. }
            | JsValue::Object { total_nodes: c, .. }
            | JsValue::Alternatives(c, _)
            | JsValue::Concat(c, _)
            | JsValue::Add(c, _)
            | JsValue::Not(c, _)
            | JsValue::Logical(c, _, _)
            | JsValue::Binary(c, _, _, _)
            | JsValue::Call(c, _, _)
            | JsValue::MemberCall(c, _, _, _)
            | JsValue::Member(c, _, _)
            | JsValue::Function(c, _, _) => *c,
        }
    }

    fn update_total_nodes(&mut self) {
        match self {
            JsValue::Constant(_)
            | JsValue::Url(_)
            | JsValue::FreeVar(_)
            | JsValue::Variable(_)
            | JsValue::Module(..)
            | JsValue::WellKnownObject(_)
            | JsValue::WellKnownFunction(_)
            | JsValue::Unknown(_, _)
            | JsValue::Argument(..) => {}

            JsValue::Array {
                total_nodes: c,
                items: list,
                ..
            }
            | JsValue::Alternatives(c, list)
            | JsValue::Concat(c, list)
            | JsValue::Add(c, list)
            | JsValue::Logical(c, _, list) => {
                *c = 1 + total_nodes(list);
            }

            JsValue::Binary(c, a, _, b) => {
                *c = 1 + a.total_nodes() + b.total_nodes();
            }
            JsValue::Not(c, r) => {
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
                    .sum::<usize>();
            }
            JsValue::Call(c, f, list) => {
                *c = 1 + f.total_nodes() + total_nodes(list);
            }
            JsValue::MemberCall(c, o, m, list) => {
                *c = 1 + o.total_nodes() + m.total_nodes() + total_nodes(list);
            }
            JsValue::Member(c, o, p) => {
                *c = 1 + o.total_nodes() + p.total_nodes();
            }
            JsValue::Function(c, _, r) => {
                *c = 1 + r.total_nodes();
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
            "total nodes not up to date {:?}",
            self
        );
    }

    #[cfg(not(debug_assertions))]
    pub fn debug_assert_total_nodes_up_to_date(&mut self) {}

    pub fn ensure_node_limit(&mut self, limit: usize) {
        fn cmp_nodes(a: &JsValue, b: &JsValue) -> Ordering {
            a.total_nodes().cmp(&b.total_nodes())
        }
        fn make_max_unknown<'a>(iter: impl Iterator<Item = &'a mut JsValue>) {
            if let Some(item) = iter.max_by(|a, b| cmp_nodes(a, b)) {
                item.make_unknown_without_content("node limit reached");
            }
        }
        if self.total_nodes() > limit {
            match self {
                JsValue::Constant(_)
                | JsValue::Url(_)
                | JsValue::FreeVar(_)
                | JsValue::Variable(_)
                | JsValue::Module(..)
                | JsValue::WellKnownObject(_)
                | JsValue::WellKnownFunction(_)
                | JsValue::Unknown(_, _)
                | JsValue::Argument(..) => self.make_unknown_without_content("node limit reached"),

                JsValue::Array { items: list, .. }
                | JsValue::Alternatives(_, list)
                | JsValue::Concat(_, list)
                | JsValue::Logical(_, _, list)
                | JsValue::Add(_, list) => {
                    make_max_unknown(list.iter_mut());
                    self.update_total_nodes();
                }
                JsValue::Not(_, r) => {
                    r.make_unknown_without_content("node limit reached");
                }
                JsValue::Binary(_, a, _, b) => {
                    if a.total_nodes() > b.total_nodes() {
                        a.make_unknown_without_content("node limit reached");
                    } else {
                        b.make_unknown_without_content("node limit reached");
                    }
                    self.update_total_nodes();
                }
                JsValue::Object { parts, .. } => {
                    make_max_unknown(parts.iter_mut().flat_map(|v| match v {
                        // TODO this probably can avoid heap allocation somehow
                        ObjectPart::KeyValue(k, v) => vec![k, v].into_iter(),
                        ObjectPart::Spread(s) => vec![s].into_iter(),
                    }));
                    self.update_total_nodes();
                }
                JsValue::Call(_, f, args) => {
                    make_max_unknown([&mut **f].into_iter().chain(args.iter_mut()));
                    self.update_total_nodes();
                }
                JsValue::MemberCall(_, o, p, args) => {
                    make_max_unknown([&mut **o, &mut **p].into_iter().chain(args.iter_mut()));
                    self.update_total_nodes();
                }
                JsValue::Member(_, o, p) => {
                    make_max_unknown([&mut **o, &mut **p].into_iter());
                    self.update_total_nodes();
                }
                JsValue::Function(_, _, r) => {
                    r.make_unknown_without_content("node limit reached");
                }
            }
        }
    }
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
            hints
                .into_iter()
                .map(|h| format!("\n{h}"))
                .collect::<String>(),
        )
    }

    pub fn explain(&self, depth: usize, unknown_depth: usize) -> (String, String) {
        let mut hints = Vec::new();
        let explainer = self.explain_internal(&mut hints, 0, depth, unknown_depth);
        (
            explainer,
            hints
                .into_iter()
                .map(|h| format!("\n{h}"))
                .collect::<String>(),
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
            JsValue::Url(url) => format!("{}", url),
            JsValue::Alternatives(_, list) => format!(
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
                    " | ",
                    "",
                    "| "
                )
            ),
            JsValue::FreeVar(name) => format!("FreeVar({})", &*name),
            JsValue::Variable(name) => {
                format!("{}", name.0)
            }
            JsValue::Argument(_, index) => {
                format!("arguments[{}]", index)
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
            JsValue::Not(_, value) => format!(
                "!({})",
                value.explain_internal_inner(hints, indent_depth, depth, unknown_depth)
            ),
            JsValue::Call(_, callee, list) => {
                format!(
                    "{}({})",
                    callee.explain_internal_inner(hints, indent_depth, depth, unknown_depth),
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
                        ", ",
                        ",",
                        ""
                    )
                )
            }
            JsValue::MemberCall(_, obj, prop, list) => {
                format!(
                    "{}[{}]({})",
                    obj.explain_internal_inner(hints, indent_depth, depth, unknown_depth),
                    prop.explain_internal_inner(hints, indent_depth, depth, unknown_depth),
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
                        ", ",
                        ",",
                        ""
                    )
                )
            }
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
                format!("module<{}, {}>", name, annotations)
            }
            JsValue::Unknown(inner, explainer) => {
                if unknown_depth == 0 || explainer.is_empty() {
                    "???".to_string()
                } else if let Some(inner) = inner {
                    let i = hints.len();
                    hints.push(String::new());
                    hints[i] = format!(
                        "- *{}* {}\n  ⚠️  {}",
                        i,
                        inner.explain_internal(hints, 1, depth, unknown_depth - 1),
                        explainer,
                    );
                    format!("???*{}*", i)
                } else {
                    let i = hints.len();
                    hints.push(String::new());
                    hints[i] = format!("- *{}* {}", i, explainer);
                    format!("???*{}*", i)
                }
            }
            JsValue::WellKnownObject(obj) => {
                let (name, explainer) = match obj {
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
                    WellKnownObjectKind::FsModulePromises => (
                        "fs/promises",
                        "The Node.js fs module: https://nodejs.org/api/fs.html#promises-api",
                    ),
                    WellKnownObjectKind::UrlModule | WellKnownObjectKind::UrlModuleDefault => (
                        "url",
                        "The Node.js url module: https://nodejs.org/api/url.html",
                    ),
                    WellKnownObjectKind::ChildProcess | WellKnownObjectKind::ChildProcessDefault => (
                        "child_process",
                        "The Node.js child_process module: https://nodejs.org/api/child_process.html",
                    ),
                    WellKnownObjectKind::OsModule | WellKnownObjectKind::OsModuleDefault => (
                        "os",
                        "The Node.js os module: https://nodejs.org/api/os.html",
                    ),
                    WellKnownObjectKind::NodeProcess => (
                        "process",
                        "The Node.js process module: https://nodejs.org/api/process.html",
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
                    WellKnownFunctionKind::PathToFileUrl => (
                        "url.pathToFileURL".to_string(),
                        "The Node.js url.pathToFileURL method: https://nodejs.org/api/url.html#urlpathtofileurlpath",
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
                        "find".to_string(),
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
    pub fn make_unknown(&mut self, reason: impl Into<Cow<'static, str>>) {
        *self = JsValue::unknown(take(self), reason);
    }

    /// Convert the owned value into unknown with a specific reason.
    pub fn into_unknown(mut self, reason: impl Into<Cow<'static, str>>) -> Self {
        self.make_unknown(reason);
        self
    }

    /// Convert the value into unknown with a specific reason, but don't retain
    /// the original value.
    pub fn make_unknown_without_content(&mut self, reason: impl Into<Cow<'static, str>>) {
        *self = JsValue::unknown_empty(reason);
    }

    /// Make all nested operations unknown when the value is an operation.
    pub fn make_nested_operations_unknown(&mut self) -> bool {
        fn inner(this: &mut JsValue) -> bool {
            if matches!(this.meta_type(), JsValueMetaKind::Operation) {
                this.make_unknown("nested operation");
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

    pub fn add_unknown_mutations(&mut self) {
        self.add_alt(JsValue::unknown_empty("unknown mutation"));
    }
}

// Defineable name management
impl JsValue {
    /// When the value has a user-defineable name, return the length of it (in
    /// segments). Otherwise returns None.
    /// - any free var has itself as user-defineable name.
    /// - any member access adds the identifier as segement to the name of the
    ///   object.
    /// - some well-known objects/functions have a user-defineable names.
    /// - member calls without arguments also have a user-defineable name which
    ///   is the property with `()` appended.
    pub fn get_defineable_name_len(&self) -> Option<usize> {
        match self {
            JsValue::FreeVar(_) => Some(1),
            JsValue::Member(_, obj, prop) if prop.as_str().is_some() => {
                Some(obj.get_defineable_name_len()? + 1)
            }
            JsValue::WellKnownObject(obj) => obj.as_define_name().map(|d| d.len()),
            JsValue::WellKnownFunction(func) => func.as_define_name().map(|d| d.len()),
            JsValue::MemberCall(_, callee, prop, args)
                if args.is_empty() && prop.as_str().is_some() =>
            {
                Some(callee.get_defineable_name_len()? + 1)
            }

            _ => None,
        }
    }

    /// Returns a reverse iterator over the segments of the user-defineable
    /// name. e. g. `foo.bar().baz` would yield `baz`, `bar()`, `foo`.
    /// `(1+2).foo.baz` would also yield `baz`, `foo` even while the value is
    /// not a complete user-defineable name. Before calling this method you must
    /// use [JsValue::get_defineable_name_len] to determine if the value has a
    /// user-defineable name at all.
    pub fn iter_defineable_name_rev(&self) -> DefineableNameIter<'_> {
        DefineableNameIter {
            next: Some(self),
            index: 0,
        }
    }
}

pub struct DefineableNameIter<'a> {
    next: Option<&'a JsValue>,
    index: usize,
}

impl<'a> Iterator for DefineableNameIter<'a> {
    type Item = Cow<'a, str>;

    fn next(&mut self) -> Option<Self::Item> {
        let value = self.next.take()?;
        Some(match value {
            JsValue::FreeVar(kind) => (&**kind).into(),
            JsValue::Member(_, obj, prop) => {
                self.next = Some(obj);
                prop.as_str()?.into()
            }
            JsValue::WellKnownObject(obj) => {
                let name = obj.as_define_name()?;
                let i = self.index;
                self.index += 1;
                if self.index < name.len() {
                    self.next = Some(value);
                }
                name[name.len() - i - 1].into()
            }
            JsValue::WellKnownFunction(func) => {
                let name = func.as_define_name()?;
                let i = self.index;
                self.index += 1;
                if self.index < name.len() {
                    self.next = Some(value);
                }
                name[name.len() - i - 1].into()
            }
            JsValue::MemberCall(_, callee, prop, args) if args.is_empty() => {
                self.next = Some(callee);
                format!("{}()", prop.as_str()?).into()
            }
            _ => return None,
        })
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
            JsValue::Alternatives(_, list) => merge_if_known(list, JsValue::is_truthy),
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
                        if same_type {
                            Some(a == b)
                        } else {
                            None
                        }
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
            JsValue::Alternatives(_, list) => merge_if_known(list, JsValue::is_nullish),
            JsValue::Logical(_, op, list) => match op {
                LogicalOperator::And => {
                    shortcircuit_if_known(list, JsValue::is_truthy, JsValue::is_nullish)
                }
                LogicalOperator::Or => {
                    shortcircuit_if_known(list, JsValue::is_falsy, JsValue::is_nullish)
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
            JsValue::Alternatives(_, list) => merge_if_known(list, JsValue::is_empty_string),
            JsValue::Logical(_, op, list) => match op {
                LogicalOperator::And => {
                    shortcircuit_if_known(list, JsValue::is_truthy, JsValue::is_empty_string)
                }
                LogicalOperator::Or => {
                    shortcircuit_if_known(list, JsValue::is_falsy, JsValue::is_empty_string)
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
            JsValue::Unknown(..) => true,
            JsValue::Alternatives(_, list) => list.iter().any(|x| x.is_unknown()),
            _ => false,
        }
    }

    /// Checks if we know that the value is a string. Returns None if we
    /// don't know. Returns Some if we know if or if not the value is a string.
    pub fn is_string(&self) -> Option<bool> {
        match self {
            JsValue::Constant(ConstantValue::Str(..)) | JsValue::Concat(..) => Some(true),

            // Objects are not strings
            JsValue::Constant(..)
            | JsValue::Array { .. }
            | JsValue::Object { .. }
            | JsValue::Url(..)
            | JsValue::Module(..)
            | JsValue::Function(..)
            | JsValue::WellKnownObject(_)
            | JsValue::WellKnownFunction(_) => Some(false),

            // Booleans are not strings
            JsValue::Not(..) | JsValue::Binary(..) => Some(false),

            JsValue::Add(_, list) => any_if_known(list, JsValue::is_string),
            JsValue::Logical(_, op, list) => match op {
                LogicalOperator::And => {
                    shortcircuit_if_known(list, JsValue::is_truthy, JsValue::is_string)
                }
                LogicalOperator::Or => {
                    shortcircuit_if_known(list, JsValue::is_falsy, JsValue::is_string)
                }
                LogicalOperator::NullishCoalescing => {
                    shortcircuit_if_known(list, JsValue::is_not_nullish, JsValue::is_string)
                }
            },

            JsValue::Alternatives(_, v) => merge_if_known(v, JsValue::is_string),

            JsValue::Call(
                _,
                box JsValue::WellKnownFunction(
                    WellKnownFunctionKind::RequireResolve
                    | WellKnownFunctionKind::PathJoin
                    | WellKnownFunctionKind::PathResolve(..)
                    | WellKnownFunctionKind::OsArch
                    | WellKnownFunctionKind::OsPlatform
                    | WellKnownFunctionKind::PathDirname
                    | WellKnownFunctionKind::PathToFileUrl
                    | WellKnownFunctionKind::ProcessCwd,
                ),
                _,
            ) => Some(true),

            JsValue::FreeVar(..)
            | JsValue::Variable(_)
            | JsValue::Unknown(..)
            | JsValue::Argument(..)
            | JsValue::Call(..)
            | JsValue::MemberCall(..)
            | JsValue::Member(..) => None,
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
            JsValue::Alternatives(_, alts) => merge_if_known(alts, |a| a.starts_with(str)),
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
            JsValue::Alternatives(_, alts) => merge_if_known(alts, |alt| alt.ends_with(str)),
            JsValue::Concat(_, list) => {
                if let Some(item) = list.last() {
                    if item.ends_with(str) == Some(true) {
                        Some(true)
                    } else if let Some(s) = item.as_str() {
                        if str.ends_with(s) {
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
    if unknown {
        None
    } else {
        Some(true)
    }
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

/// Macro to visit all children of a node with an async function
macro_rules! for_each_children_async {
    ($value:expr, $visit_fn:expr, $($args:expr),+) => {
        Ok(match &mut $value {
            JsValue::Alternatives(_, list)
            | JsValue::Concat(_, list)
            | JsValue::Add(_, list)
            | JsValue::Logical(_, _, list)
            | JsValue::Array{ items: list, ..} => {
                let mut modified = false;
                for item in list.iter_mut() {
                    let (v, m) = $visit_fn(take(item), $($args),+).await?;
                    *item = v;
                    if m {
                        modified = true
                    }
                }
                $value.update_total_nodes();
                ($value, modified)
            }
            JsValue::Object{ parts, ..} => {
                let mut modified = false;
                for item in parts.iter_mut() {
                    match item {
                        ObjectPart::KeyValue(key, value) => {
                            let (v, m) = $visit_fn(take(key), $($args),+).await?;
                            *key = v;
                            if m {
                                modified = true
                            }
                            let (v, m) = $visit_fn(take(value), $($args),+).await?;
                            *value = v;
                            if m {
                                modified = true
                            }
                        }
                        ObjectPart::Spread(value) => {
                            let (v, m) = $visit_fn(take(value), $($args),+).await?;
                            *value = v;
                            if m {
                                modified = true
                            }
                        }
                    }

                }
                $value.update_total_nodes();
                ($value, modified)
            }
            JsValue::Call(_, box callee, list) => {
                let (new_callee, mut modified) = $visit_fn(take(callee), $($args),+).await?;
                *callee = new_callee;
                for item in list.iter_mut() {
                    let (v, m) = $visit_fn(take(item), $($args),+).await?;
                    *item = v;
                    if m {
                        modified = true
                    }
                }
                $value.update_total_nodes();
                ($value, modified)
            }
            JsValue::MemberCall(_, box obj, box prop, list) => {
                let (new_callee, m1) = $visit_fn(take(obj), $($args),+).await?;
                *obj = new_callee;
                let (new_member, m2) = $visit_fn(take(prop), $($args),+).await?;
                *prop = new_member;
                let mut modified = m1 || m2;
                for item in list.iter_mut() {
                    let (v, m) = $visit_fn(take(item), $($args),+).await?;
                    *item = v;
                    if m {
                        modified = true
                    }
                }
                $value.update_total_nodes();
                ($value, modified)
            }

            JsValue::Function(_, _, box return_value) => {
                let (new_return_value, modified) = $visit_fn(take(return_value), $($args),+).await?;
                *return_value = new_return_value;

                $value.update_total_nodes();
                ($value, modified)
            }
            JsValue::Not(_, box value) => {
                let (new_value, modified) = $visit_fn(take(value), $($args),+).await?;
                *value = new_value;

                $value.update_total_nodes();
                ($value, modified)
            }
            JsValue::Binary(_, box a, _, box b) => {
                let (v, m1) = $visit_fn(take(a), $($args),+).await?;
                *a = v;
                let (v, m2) = $visit_fn(take(b), $($args),+).await?;
                *b = v;
                $value.update_total_nodes();
                ($value, m1 || m2)
            }
            JsValue::Member(_, box obj, box prop) => {
                let (v, m1) = $visit_fn(take(obj), $($args),+).await?;
                *obj = v;
                let (v, m2) = $visit_fn(take(prop), $($args),+).await?;
                *prop = v;
                $value.update_total_nodes();
                ($value, m1 || m2)
            }
            JsValue::Constant(_)
            | JsValue::FreeVar(_)
            | JsValue::Variable(_)
            | JsValue::Module(..)
            | JsValue::Url(_)
            | JsValue::WellKnownObject(_)
            | JsValue::WellKnownFunction(_)
            | JsValue::Unknown(..)
            | JsValue::Argument(..) => ($value, false),
        })
    }
}

// Visiting
impl JsValue {
    /// Visit the node and all its children with a function in a loop until the
    /// visitor returns false for the node and all children
    pub async fn visit_async_until_settled<'a, F, R, E>(
        self,
        visitor: &mut F,
    ) -> Result<(Self, bool), E>
    where
        R: 'a + Future<Output = Result<(Self, bool), E>> + Send,
        F: 'a + FnMut(JsValue) -> R + Send,
    {
        let mut modified = false;
        let mut v = self;
        loop {
            let m;
            (v, m) = visitor(take(&mut v)).await?;
            if !m {
                break;
            }
            modified = true;
            v = take(&mut v)
                .visit_each_children_async_until_settled(visitor)
                .await?;
        }
        Ok((v, modified))
    }

    /// Visit all children of the node with an async function in a loop until
    /// the visitor returns false
    pub async fn visit_each_children_async_until_settled<'a, F, R, E>(
        mut self,
        visitor: &mut F,
    ) -> Result<Self, E>
    where
        R: 'a + Future<Output = Result<(Self, bool), E>> + Send,
        F: 'a + FnMut(JsValue) -> R + Send,
    {
        fn visit_async_until_settled_box<'a, F, R, E>(
            value: JsValue,
            visitor: &'a mut F,
        ) -> PinnedAsyncUntilSettledBox<E>
        where
            R: 'a + Future<Output = Result<(JsValue, bool), E>> + Send,
            F: 'a + FnMut(JsValue) -> R + Send,
            E: 'a,
        {
            Box::pin(value.visit_async_until_settled(visitor))
        }
        let (v, _) = for_each_children_async!(self, visit_async_until_settled_box, visitor)?;
        Ok(v)
    }

    /// Visit the node and all its children with an async function.
    pub async fn visit_async<'a, F, R, E>(self, visitor: &mut F) -> Result<(Self, bool), E>
    where
        R: 'a + Future<Output = Result<(Self, bool), E>>,
        F: 'a + FnMut(JsValue) -> R,
    {
        let (v, modified) = self.visit_each_children_async(visitor).await?;
        let (v, m) = visitor(v).await?;
        if m {
            Ok((v, true))
        } else {
            Ok((v, modified))
        }
    }

    /// Visit all children of the node with an async function.
    pub async fn visit_each_children_async<'a, F, R, E>(
        mut self,
        visitor: &mut F,
    ) -> Result<(Self, bool), E>
    where
        R: 'a + Future<Output = Result<(Self, bool), E>>,
        F: 'a + FnMut(JsValue) -> R,
    {
        fn visit_async_box<'a, F, R, E>(value: JsValue, visitor: &'a mut F) -> PinnedAsyncBox<E>
        where
            R: 'a + Future<Output = Result<(JsValue, bool), E>>,
            F: 'a + FnMut(JsValue) -> R,
            E: 'a,
        {
            Box::pin(value.visit_async(visitor))
        }
        for_each_children_async!(self, visit_async_box, visitor)
    }

    /// Call an async function for each child of the node.
    pub async fn for_each_children_async<'a, F, R, E>(
        mut self,
        visitor: &mut F,
    ) -> Result<(Self, bool), E>
    where
        R: 'a + Future<Output = Result<(Self, bool), E>>,
        F: 'a + FnMut(JsValue) -> R,
    {
        for_each_children_async!(self, |v, ()| visitor(v), ())
    }

    /// Visit the node and all its children with a function in a loop until the
    /// visitor returns false
    pub fn visit_mut_until_settled(&mut self, visitor: &mut impl FnMut(&mut JsValue) -> bool) {
        while visitor(self) {
            self.for_each_children_mut(&mut |value| {
                value.visit_mut_until_settled(visitor);
                false
            });
        }
    }

    /// Visit the node and all its children with a function.
    pub fn visit_mut(&mut self, visitor: &mut impl FnMut(&mut JsValue) -> bool) -> bool {
        let modified = self.for_each_children_mut(&mut |value| value.visit_mut(visitor));
        if visitor(self) {
            true
        } else {
            modified
        }
    }

    /// Visit all children of the node with a function. Only visits nodes where
    /// the condition is true.
    pub fn visit_mut_conditional(
        &mut self,
        condition: impl Fn(&JsValue) -> bool,
        visitor: &mut impl FnMut(&mut JsValue) -> bool,
    ) -> bool {
        if condition(self) {
            let modified = self.for_each_children_mut(&mut |value| value.visit_mut(visitor));
            if visitor(self) {
                true
            } else {
                modified
            }
        } else {
            false
        }
    }

    /// Calls a function for each child of the node. Allows mutating the node.
    /// Updates the total nodes count after mutation.
    pub fn for_each_children_mut(
        &mut self,
        visitor: &mut impl FnMut(&mut JsValue) -> bool,
    ) -> bool {
        match self {
            JsValue::Alternatives(_, list)
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
            JsValue::Call(_, callee, list) => {
                let mut modified = visitor(callee);
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
            JsValue::MemberCall(_, obj, prop, list) => {
                let m1 = visitor(obj);
                let m2 = visitor(prop);
                let mut modified = m1 || m2;
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
            JsValue::Member(_, obj, prop) => {
                let m1 = visitor(obj);
                let m2 = visitor(prop);
                let modified = m1 || m2;
                if modified {
                    self.update_total_nodes();
                }
                modified
            }
            JsValue::Constant(_)
            | JsValue::FreeVar(_)
            | JsValue::Variable(_)
            | JsValue::Module(..)
            | JsValue::Url(_)
            | JsValue::WellKnownObject(_)
            | JsValue::WellKnownFunction(_)
            | JsValue::Unknown(..)
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
            JsValue::Call(_, callee, list) if !list.is_empty() => {
                let m = visitor(callee);
                if m {
                    self.update_total_nodes();
                }
                m
            }
            JsValue::MemberCall(_, obj, prop, list) if !list.is_empty() => {
                let m1 = visitor(obj);
                let m2 = visitor(prop);
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
            JsValue::Call(_, _, list) if !list.is_empty() => {
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
            JsValue::MemberCall(_, _, _, list) if !list.is_empty() => {
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
            JsValue::Alternatives(_, list)
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
            JsValue::Call(_, callee, list) => {
                visitor(callee);
                for item in list.iter() {
                    visitor(item);
                }
            }
            JsValue::MemberCall(_, obj, prop, list) => {
                visitor(obj);
                visitor(prop);
                for item in list.iter() {
                    visitor(item);
                }
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
            JsValue::Constant(_)
            | JsValue::FreeVar(_)
            | JsValue::Variable(_)
            | JsValue::Module(..)
            | JsValue::Url(_)
            | JsValue::WellKnownObject(_)
            | JsValue::WellKnownFunction(_)
            | JsValue::Unknown(..)
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

        if let JsValue::Alternatives(c, list) = self {
            if !list.contains(&v) {
                *c += v.total_nodes();
                list.push(v);
            }
        } else {
            let l = take(self);
            *self = JsValue::Alternatives(1 + l.total_nodes() + v.total_nodes(), vec![l, v]);
        }
    }
}

// Normalization
impl JsValue {
    /// Normalizes only the current node. Nested alternatives, concatenations,
    /// or operations are collapsed.
    pub fn normalize_shallow(&mut self) {
        match self {
            JsValue::Alternatives(_, v) => {
                if v.len() == 1 {
                    *self = take(&mut v[0]);
                } else {
                    let mut set = IndexSet::with_capacity(v.len());
                    for v in take(v) {
                        match v {
                            JsValue::Alternatives(_, v) => {
                                for v in v {
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
                        *v = set.into_iter().map(|v| v.0).collect();
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
                                1 + added.iter().map(|v| v.total_nodes()).sum::<usize>(),
                                added,
                            )],
                        };
                        concat.push(item);
                        for item in iter.by_ref() {
                            concat.push(item);
                        }
                        *self = JsValue::Concat(
                            1 + concat.iter().map(|v| v.total_nodes()).sum::<usize>(),
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
            JsValue::Logical(_, op, list) => {
                // Nested logical expressions can be normalized: e. g. `a && (b && c)` => `a &&
                // b && c`
                if list.iter().any(|v| {
                    if let JsValue::Logical(_, inner_op, _) = v {
                        inner_op == op
                    } else {
                        false
                    }
                }) {
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
    /// Check if the values are equal up to the given depth. Might return false
    /// even if the values are equal when hitting the depth limit.
    fn similar(&self, other: &JsValue, depth: usize) -> bool {
        if depth == 0 {
            return false;
        }
        fn all_similar(a: &[JsValue], b: &[JsValue], depth: usize) -> bool {
            if a.len() != b.len() {
                return false;
            }
            a.iter().zip(b.iter()).all(|(a, b)| a.similar(b, depth))
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
            ) => lc == rc && lm == rm && all_similar(li, ri, depth - 1),
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
            (JsValue::Url(l), JsValue::Url(r)) => l == r,
            (JsValue::Alternatives(lc, l), JsValue::Alternatives(rc, r)) => {
                lc == rc && all_similar(l, r, depth - 1)
            }
            (JsValue::FreeVar(l), JsValue::FreeVar(r)) => l == r,
            (JsValue::Variable(l), JsValue::Variable(r)) => l == r,
            (JsValue::Concat(lc, l), JsValue::Concat(rc, r)) => {
                lc == rc && all_similar(l, r, depth - 1)
            }
            (JsValue::Add(lc, l), JsValue::Add(rc, r)) => lc == rc && all_similar(l, r, depth - 1),
            (JsValue::Logical(lc, lo, l), JsValue::Logical(rc, ro, r)) => {
                lc == rc && lo == ro && all_similar(l, r, depth - 1)
            }
            (JsValue::Not(lc, l), JsValue::Not(rc, r)) => lc == rc && l.similar(r, depth - 1),
            (JsValue::Call(lc, lf, la), JsValue::Call(rc, rf, ra)) => {
                lc == rc && lf.similar(rf, depth - 1) && all_similar(la, ra, depth - 1)
            }
            (JsValue::MemberCall(lc, lo, lp, la), JsValue::MemberCall(rc, ro, rp, ra)) => {
                lc == rc
                    && lo.similar(ro, depth - 1)
                    && lp.similar(rp, depth - 1)
                    && all_similar(la, ra, depth - 1)
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
            (JsValue::Unknown(_, l), JsValue::Unknown(_, r)) => l == r,
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
            JsValue::Url(v) => Hash::hash(v, state),
            JsValue::FreeVar(v) => Hash::hash(v, state),
            JsValue::Variable(v) => Hash::hash(v, state),
            JsValue::Array { items: v, .. }
            | JsValue::Alternatives(_, v)
            | JsValue::Concat(_, v)
            | JsValue::Add(_, v)
            | JsValue::Logical(_, _, v) => all_similar_hash(v, state, depth - 1),
            JsValue::Not(_, v) => v.similar_hash(state, depth - 1),
            JsValue::Call(_, a, b) => {
                a.similar_hash(state, depth - 1);
                all_similar_hash(b, state, depth - 1);
            }
            JsValue::MemberCall(_, a, b, c) => {
                a.similar_hash(state, depth - 1);
                b.similar_hash(state, depth - 1);
                all_similar_hash(c, state, depth - 1);
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
            JsValue::Module(ModuleValue {
                module: v,
                annotations: a,
            }) => {
                Hash::hash(v, state);
                Hash::hash(a, state);
            }
            JsValue::WellKnownObject(v) => Hash::hash(v, state),
            JsValue::WellKnownFunction(v) => Hash::hash(v, state),
            JsValue::Unknown(_, v) => Hash::hash(v, state),
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
    UrlModule,
    UrlModuleDefault,
    ChildProcess,
    ChildProcessDefault,
    OsModule,
    OsModuleDefault,
    NodeProcess,
    NodeProcessEnv,
    NodePreGyp,
    NodeExpressApp,
    NodeProtobufLoader,
    NodeBuffer,
    RequireCache,
}

impl WellKnownObjectKind {
    pub fn as_define_name(&self) -> Option<&[&str]> {
        match self {
            Self::GlobalObject => Some(&["global"]),
            Self::PathModule => Some(&["path"]),
            Self::FsModule => Some(&["fs"]),
            Self::UrlModule => Some(&["url"]),
            Self::ChildProcess => Some(&["child_process"]),
            Self::OsModule => Some(&["os"]),
            Self::NodeProcess => Some(&["process"]),
            Self::NodeProcessEnv => Some(&["process", "env"]),
            Self::NodeBuffer => Some(&["Buffer"]),
            Self::RequireCache => Some(&["require", "cache"]),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct RequireContextOptions {
    pub dir: String,
    pub include_subdirs: bool,
    /// this is a regex (pattern, flags)
    pub filter: Regex,
}

/// Convert an ECMAScript regex to a Rust regex.
fn regex_from_js(pattern: &str, flags: &str) -> Result<Regex> {
    // rust regex doesn't allow escaped slashes, but they are necessary in js
    let pattern = pattern.replace("\\/", "/");

    let mut applied_flags = String::new();
    for flag in flags.chars() {
        match flag {
            // indices for substring matches: not relevant for the regex itself
            'd' => {}
            // global: default in rust, ignore
            'g' => {}
            // case-insensitive: letters match both upper and lower case
            'i' => applied_flags.push('i'),
            // multi-line mode: ^ and $ match begin/end of line
            'm' => applied_flags.push('m'),
            // allow . to match \n
            's' => applied_flags.push('s'),
            // Unicode support (enabled by default)
            'u' => applied_flags.push('u'),
            // sticky search: not relevant for the regex itself
            'y' => {}
            _ => bail!("unsupported flag `{}` in regex", flag),
        }
    }

    let regex = if !applied_flags.is_empty() {
        format!("(?{}){}", applied_flags, pattern)
    } else {
        pattern
    };

    Regex::new(&regex).context("could not convert ECMAScript regex to Rust regex")
}

/// Parse the arguments passed to a require.context invocation, validate them
/// and convert them to the appropriate rust values.
pub fn parse_require_context(args: &Vec<JsValue>) -> Result<RequireContextOptions> {
    if !(1..=3).contains(&args.len()) {
        // https://linear.app/vercel/issue/WEB-910/add-support-for-requirecontexts-mode-argument
        bail!("require.context() only supports 1-3 arguments (mode is not supported)");
    }

    let Some(dir) = args[0].as_str().map(|s| s.to_string()) else {
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
        if let JsValue::Constant(ConstantValue::Regex(pattern, flags)) = filter {
            regex_from_js(pattern, flags)?
        } else {
            bail!("require.context(..., ..., filter) requires filter to be a regex");
        }
    } else {
        // https://webpack.js.org/api/module-methods/#requirecontext
        // > optional, default /^\.\/.*$/, any file
        static DEFAULT_REGEX: Lazy<Regex> = Lazy::new(|| Regex::new(r"^\\./.*$").unwrap());

        DEFAULT_REGEX.clone()
    };

    Ok(RequireContextOptions {
        dir,
        include_subdirs,
        filter,
    })
}

#[turbo_tasks::value(transparent)]
#[derive(Debug, Clone)]
pub struct RequireContextValue(IndexMap<String, String>);

#[turbo_tasks::value_impl]
impl RequireContextValueVc {
    #[turbo_tasks::function]
    pub async fn from_context_map(map: RequireContextMapVc) -> Result<Self> {
        let mut context_map = IndexMap::new();

        for (key, entry) in map.await?.iter() {
            context_map.insert(key.clone(), entry.origin_relative.clone());
        }

        Ok(Self::cell(context_map))
    }
}

impl From<RequireContextMapVc> for RequireContextValueVc {
    fn from(map: RequireContextMapVc) -> Self {
        Self::from_context_map(map)
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
    ObjectAssign,
    PathJoin,
    PathDirname,
    /// `0` is the current working directory.
    PathResolve(Box<JsValue>),
    Import,
    Require,
    RequireResolve,
    RequireContext,
    RequireContextRequire(RequireContextValueVc),
    RequireContextRequireKeys(RequireContextValueVc),
    RequireContextRequireResolve(RequireContextValueVc),
    Define,
    FsReadMethod(JsWord),
    PathToFileUrl,
    ChildProcessSpawnMethod(JsWord),
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
}

impl WellKnownFunctionKind {
    pub fn as_define_name(&self) -> Option<&[&str]> {
        match self {
            Self::Import => Some(&["import"]),
            Self::Require => Some(&["require"]),
            Self::RequireResolve => Some(&["require", "resolve"]),
            Self::RequireContext => Some(&["require", "context"]),
            Self::Define => Some(&["define"]),
            _ => None,
        }
    }
}

fn is_unresolved(i: &Ident, unresolved_mark: Mark) -> bool {
    i.span.ctxt.outer() == unresolved_mark
}

#[doc(hidden)]
pub mod test_utils {
    use anyhow::Result;
    use indexmap::IndexMap;
    use turbopack_core::{compile_time_info::CompileTimeInfoVc, error::PrettyPrintError};

    use super::{
        builtin::early_replace_builtin, well_known::replace_well_known, JsValue, ModuleValue,
        WellKnownFunctionKind, WellKnownObjectKind,
    };
    use crate::analyzer::{builtin::replace_builtin, parse_require_context, RequireContextValueVc};

    pub async fn early_visitor(mut v: JsValue) -> Result<(JsValue, bool)> {
        let m = early_replace_builtin(&mut v);
        Ok((v, m))
    }

    pub async fn visitor(
        v: JsValue,
        compile_time_info: CompileTimeInfoVc,
    ) -> Result<(JsValue, bool)> {
        let mut new_value = match v {
            JsValue::Call(
                _,
                box JsValue::WellKnownFunction(WellKnownFunctionKind::RequireResolve),
                ref args,
            ) => match &args[0] {
                JsValue::Constant(v) => (v.to_string() + "/resolved/lib/index.js").into(),
                _ => v.into_unknown("require.resolve non constant"),
            },
            JsValue::Call(
                _,
                box JsValue::WellKnownFunction(WellKnownFunctionKind::RequireContext),
                ref args,
            ) => match parse_require_context(args) {
                Ok(options) => {
                    let mut map = IndexMap::new();

                    map.insert("./a".into(), format!("[context: {}]/a", options.dir));
                    map.insert("./b".into(), format!("[context: {}]/b", options.dir));
                    map.insert("./c".into(), format!("[context: {}]/c", options.dir));

                    JsValue::WellKnownFunction(WellKnownFunctionKind::RequireContextRequire(
                        RequireContextValueVc::cell(map),
                    ))
                }
                Err(err) => v.into_unknown(PrettyPrintError(&err).to_string()),
            },
            JsValue::FreeVar(ref var) => match &**var {
                "require" => JsValue::WellKnownFunction(WellKnownFunctionKind::Require),
                "define" => JsValue::WellKnownFunction(WellKnownFunctionKind::Define),
                "__dirname" => "__dirname".into(),
                "__filename" => "__filename".into(),
                "process" => JsValue::WellKnownObject(WellKnownObjectKind::NodeProcess),
                _ => v.into_unknown("unknown global"),
            },
            JsValue::Module(ModuleValue {
                module: ref name, ..
            }) => match name.as_ref() {
                "path" => JsValue::WellKnownObject(WellKnownObjectKind::PathModule),
                "os" => JsValue::WellKnownObject(WellKnownObjectKind::OsModule),
                "process" => JsValue::WellKnownObject(WellKnownObjectKind::NodeProcess),
                "@mapbox/node-pre-gyp" => JsValue::WellKnownObject(WellKnownObjectKind::NodePreGyp),
                "node-pre-gyp" => JsValue::WellKnownFunction(WellKnownFunctionKind::NodeGypBuild),
                _ => return Ok((v, false)),
            },
            _ => {
                let (mut v, m1) = replace_well_known(v, compile_time_info).await?;
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

    use swc_core::{
        common::Mark,
        ecma::{
            ast::EsVersion, parser::parse_file_as_program, transforms::base::resolver,
            visit::VisitMutWith,
        },
        testing::{fixture, run_test, NormalizedOutput},
    };
    use turbo_tasks::{util::FormatDuration, Value};
    use turbopack_core::{
        compile_time_info::CompileTimeInfo,
        environment::{
            EnvironmentIntention, EnvironmentVc, ExecutionEnvironment, NodeJsEnvironment,
        },
        target::{Arch, CompileTarget, Endianness, Libc, Platform},
    };

    use super::{
        graph::{create_graph, ConditionalKind, Effect, EffectArg, EvalContext, VarGraph},
        linker::link,
        JsValue,
    };

    #[fixture("tests/analyzer/graph/**/input.js")]
    fn fixture(input: PathBuf) {
        crate::register();
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

                let mut m = parse_file_as_program(
                    &fm,
                    Default::default(),
                    EsVersion::latest(),
                    None,
                    &mut vec![],
                )
                .map_err(|err| err.into_diagnostic(handler).emit())?;

                let unresolved_mark = Mark::new();
                let top_level_mark = Mark::new();
                m.visit_mut_with(&mut resolver(unresolved_mark, top_level_mark, false));

                let eval_context = EvalContext::new(&m, unresolved_mark);

                let mut var_graph = create_graph(&m, &eval_context);

                let mut named_values = var_graph
                    .values
                    .clone()
                    .into_iter()
                    .map(|((id, ctx), value)| {
                        let unique = var_graph.values.keys().filter(|(i, _)| &id == i).count() == 1;
                        if unique {
                            (id.to_string(), value)
                        } else {
                            (format!("{id}{ctx:?}"), value)
                        }
                    })
                    .collect::<Vec<_>>();
                named_values.sort_by(|a, b| a.0.cmp(&b.0));

                fn explain_all(values: &[(String, JsValue)]) -> String {
                    values
                        .iter()
                        .map(|(id, value)| {
                            let (explainer, hints) = value.explain(10, 5);
                            format!("{id} = {explainer}{hints}")
                        })
                        .collect::<Vec<_>>()
                        .join("\n\n")
                }

                {
                    // Dump snapshot of graph

                    let large = large_marker.exists();

                    if !large {
                        NormalizedOutput::from(format!("{:#?}", named_values))
                            .compare_to_file(&graph_snapshot_path)
                            .unwrap();
                    }
                    NormalizedOutput::from(explain_all(&named_values))
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
                    for (id, val) in named_values.iter() {
                        let val = val.clone();
                        let start = Instant::now();
                        let res = resolve(&var_graph, val).await;
                        let time = start.elapsed();
                        if time.as_millis() > 1 {
                            println!(
                                "linking {} {id} took {}",
                                input.display(),
                                FormatDuration(time)
                            );
                        }

                        resolved.push((id.clone(), res));
                    }
                    let time = start.elapsed();
                    if time.as_millis() > 1 {
                        println!("linking {} took {}", input.display(), FormatDuration(time));
                    }

                    let start = Instant::now();
                    let explainer = explain_all(&resolved);
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
                            i: usize,
                        ) -> Vec<JsValue> {
                            let mut new_args = Vec::new();
                            for arg in args {
                                match arg {
                                    EffectArg::Value(v) => {
                                        new_args.push(resolve(var_graph, v).await);
                                    }
                                    EffectArg::Closure(v, effects) => {
                                        new_args.push(resolve(var_graph, v).await);
                                        queue.extend(
                                            effects.effects.into_iter().rev().map(|e| (i, e)),
                                        );
                                    }
                                    EffectArg::Spread => {
                                        new_args.push(JsValue::unknown_empty("spread"));
                                    }
                                }
                            }
                            new_args
                        }
                        match effect {
                            Effect::Conditional {
                                condition, kind, ..
                            } => {
                                let condition = resolve(&var_graph, condition).await;
                                resolved.push((format!("{parent} -> {i} conditional"), condition));
                                match *kind {
                                    ConditionalKind::If { then } => {
                                        queue
                                            .extend(then.effects.into_iter().rev().map(|e| (i, e)));
                                    }
                                    ConditionalKind::IfElse { then, r#else }
                                    | ConditionalKind::Ternary { then, r#else } => {
                                        queue.extend(
                                            r#else.effects.into_iter().rev().map(|e| (i, e)),
                                        );
                                        queue
                                            .extend(then.effects.into_iter().rev().map(|e| (i, e)));
                                    }
                                    ConditionalKind::And { expr }
                                    | ConditionalKind::Or { expr }
                                    | ConditionalKind::NullishCoalescing { expr } => {
                                        queue
                                            .extend(expr.effects.into_iter().rev().map(|e| (i, e)));
                                    }
                                };
                            }
                            Effect::Call { func, args, .. } => {
                                let func = resolve(&var_graph, func).await;
                                let new_args = handle_args(args, &mut queue, &var_graph, i).await;
                                resolved.push((
                                    format!("{parent} -> {i} call"),
                                    JsValue::call(Box::new(func), new_args),
                                ));
                            }
                            Effect::FreeVar { var, .. } => {
                                resolved.push((format!("{parent} -> {i} free var"), var));
                            }
                            Effect::MemberCall {
                                obj, prop, args, ..
                            } => {
                                let obj = resolve(&var_graph, obj).await;
                                let prop = resolve(&var_graph, prop).await;
                                let new_args = handle_args(args, &mut queue, &var_graph, i).await;
                                resolved.push((
                                    format!("{parent} -> {i} member call"),
                                    JsValue::member_call(Box::new(obj), Box::new(prop), new_args),
                                ));
                            }
                            _ => {}
                        }
                        let time = start.elapsed();
                        if time.as_millis() > 1 {
                            println!(
                                "linking effect {} took {}",
                                input.display(),
                                FormatDuration(time)
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
                    let explainer = explain_all(&resolved);
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

    async fn resolve(var_graph: &VarGraph, val: JsValue) -> JsValue {
        turbo_tasks_testing::VcStorage::with(async {
            let compile_time_info = CompileTimeInfo::builder(EnvironmentVc::new(
                Value::new(ExecutionEnvironment::NodeJsLambda(
                    NodeJsEnvironment {
                        compile_target: CompileTarget {
                            arch: Arch::X64,
                            platform: Platform::Linux,
                            endianness: Endianness::Little,
                            libc: Libc::Glibc,
                        }
                        .into(),
                        ..Default::default()
                    }
                    .into(),
                )),
                Value::new(EnvironmentIntention::ServerRendering),
            ))
            .cell();
            link(
                var_graph,
                val,
                &super::test_utils::early_visitor,
                &(|val| Box::pin(super::test_utils::visitor(val, compile_time_info))),
                Default::default(),
            )
            .await
        })
        .await
        .unwrap()
    }
}
