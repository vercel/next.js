use std::{
    borrow::Cow,
    fmt::{Display, Formatter},
    hash::{Hash, Hasher},
    num::NonZeroU32,
    sync::Arc,
};

use bincode::{
    Decode, Encode,
    de::Decoder,
    enc::Encoder,
    error::{DecodeError, EncodeError},
    impl_borrow_decode,
};
use num_bigint::BigInt;
use num_traits::Zero;
use swc_core::{
    atoms::Wtf8Atom,
    ecma::{ast::Lit, atoms::Atom},
};
use turbo_rcstr::RcStr;
use turbo_tasks::{NonLocalValue, trace::TraceRawVcs};

use crate::{
    analyzer::{Bump, JsValue, imports::ImportAnnotations},
    utils::StringifyJs,
};

#[derive(Debug, Hash, PartialEq)]
pub enum ObjectPart<'a> {
    KeyValue(JsValue<'a>, JsValue<'a>),
    Spread(JsValue<'a>),
}

impl Default for ObjectPart<'_> {
    fn default() -> Self {
        ObjectPart::Spread(Default::default())
    }
}

impl<'a> ObjectPart<'a> {
    /// Deep-clone this object part into `arena`. See [`JsValue::clone_in`].
    pub(crate) fn clone_in(&self, arena: &'a Bump) -> Self {
        match self {
            ObjectPart::KeyValue(k, v) => {
                ObjectPart::KeyValue(k.clone_in(arena), v.clone_in(arena))
            }
            ObjectPart::Spread(s) => ObjectPart::Spread(s.clone_in(arena)),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Encode, Decode, TraceRawVcs)]
pub struct ConstantNumber(pub f64);

impl ConstantNumber {
    pub fn as_u32_index(&self) -> Option<usize> {
        let index: u32 = self.0 as u32;
        (index as f64 == self.0).then_some(index as usize)
    }
}

impl Hash for ConstantNumber {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.0.to_ne_bytes().hash(state);
    }
}

impl From<f64> for ConstantNumber {
    fn from(value: f64) -> Self {
        ConstantNumber(value)
    }
}

#[derive(Debug, Clone, TraceRawVcs)]
pub enum ConstantString {
    Atom(#[turbo_tasks(trace_ignore)] Atom),
    RcStr(RcStr),
}
// SAFETY: ConstantString doesn't contain any Vcs
unsafe impl NonLocalValue for ConstantString {}
impl Encode for ConstantString {
    fn encode<E: Encoder>(&self, encoder: &mut E) -> Result<(), EncodeError> {
        match self {
            ConstantString::Atom(s) => s.as_str().encode(encoder),
            ConstantString::RcStr(s) => s.as_str().encode(encoder),
        }
    }
}
impl<Context> Decode<Context> for ConstantString {
    fn decode<D: Decoder<Context = Context>>(decoder: &mut D) -> Result<Self, DecodeError> {
        Ok(Self::RcStr(Decode::decode(decoder)?))
    }
}
impl_borrow_decode!(ConstantString);

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

#[derive(Debug, Clone, PartialEq, Default, Hash, TraceRawVcs, Encode, Decode)]
pub enum ConstantValue {
    #[default]
    Undefined,
    Str(ConstantString),
    Num(ConstantNumber),
    True,
    False,
    Null,
    BigInt(
        #[turbo_tasks(trace_ignore)]
        #[bincode(with_serde)]
        Box<BigInt>,
    ),
    Regex(
        #[turbo_tasks(trace_ignore)]
        #[bincode(with_serde)]
        Box<(Atom, Atom)>,
    ),
}
unsafe impl NonLocalValue for ConstantValue {}

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
            Lit::Num(v) => ConstantValue::Num(ConstantNumber(v.value)),
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
    /// Whether to analyze this module for constants
    // TODO this is a hack: ideally we'd have truly "bidirectional linking" instead of the current
    // `early_visitor` plus `visitor` setup. Then this could just be implemented with a rewrite
    // rule for `Member(ModuleValue, prop) if prop.as_str().is_upper_case() => { ... }`
    pub analyze_for_constants: bool,
    // This is an Option<NonZeroU32> to JsValue to only be 32 bytes in size.
    pub reference: Option<ModuleReferenceIndex>,
}

#[derive(Copy, Debug, Clone, Hash, PartialEq, Eq)]
pub struct ModuleReferenceIndex(NonZeroU32);

impl From<u32> for ModuleReferenceIndex {
    fn from(value: u32) -> Self {
        // The only way this can overflow is if value == u32::MAX, which is unlikely since it would
        // require us to have that many module references.
        ModuleReferenceIndex(NonZeroU32::new(value + 1).unwrap())
    }
}
impl ModuleReferenceIndex {
    pub fn get(&self) -> usize {
        (self.0.get() - 1) as usize
    }
}

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq)]
pub enum LogicalOperator {
    And,
    Or,
    NullishCoalescing,
}

impl LogicalOperator {
    pub(super) fn joiner(&self) -> &'static str {
        match self {
            LogicalOperator::And => " && ",
            LogicalOperator::Or => " || ",
            LogicalOperator::NullishCoalescing => " ?? ",
        }
    }
    pub(super) fn multi_line_joiner(&self) -> &'static str {
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
    pub(super) fn joiner(&self) -> &'static str {
        match self {
            BinaryOperator::Equal => " == ",
            BinaryOperator::NotEqual => " != ",
            BinaryOperator::StrictEqual => " === ",
            BinaryOperator::StrictNotEqual => " !== ",
        }
    }

    pub(super) fn positive_op(&self) -> (PositiveBinaryOperator, bool) {
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
pub(super) enum JsValueMetaKind {
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

#[derive(Debug, Clone, Copy, Hash, PartialEq, Eq, PartialOrd, Ord)]
pub enum ObjectMutability {
    // Don't reorder these variants, as their order is used in `merge_with`.
    /// Known properties: frozen (= <value>)
    /// Missing properties: frozen (= Undefined)
    Frozen,
    /// Known properties: frozen (= <value>)
    /// Missing properties: mutable (= Unknown)
    FrozenSubset,
    /// Known properties: mutable (= <value> | Unknown)
    /// Missing properties: mutable (= Unknown)
    Mutable,
}

impl ObjectMutability {
    pub fn merge_with(&mut self, other: Self) {
        *self = std::cmp::max(*self, other)
    }

    pub fn is_mutable(&self) -> bool {
        matches!(self, ObjectMutability::Mutable)
    }
    pub fn is_missing_unknown(&self) -> bool {
        matches!(self, ObjectMutability::FrozenSubset)
    }
}

impl Display for ObjectMutability {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ObjectMutability::Frozen => write!(f, "frozen"),
            ObjectMutability::FrozenSubset => write!(f, "frozen subset"),
            ObjectMutability::Mutable => write!(f, ""),
        }
    }
}
