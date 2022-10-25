use std::{
    cmp::Ordering,
    fmt::Display,
    future::Future,
    hash::{Hash, Hasher},
    mem::take,
    pin::Pin,
    sync::Arc,
};

use indexmap::IndexSet;
use num_bigint::BigInt;
use swc_core::{
    common::Mark,
    ecma::{
        ast::{Id, Ident, Lit},
        atoms::{Atom, JsWord},
    },
};
use url::Url;

use self::imports::ImportAnnotations;
pub(crate) use self::imports::ImportMap;

pub mod builtin;
pub mod graph;
pub mod imports;
pub mod linker;
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

#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub enum ConstantValue {
    Undefined,
    StrWord(JsWord),
    StrAtom(Atom),
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
            Self::StrWord(s) => Some(s),
            Self::StrAtom(s) => Some(s),
            _ => None,
        }
    }
}

impl Default for ConstantValue {
    fn default() -> Self {
        ConstantValue::Undefined
    }
}

impl From<Lit> for ConstantValue {
    fn from(v: Lit) -> Self {
        match v {
            Lit::Str(v) => ConstantValue::StrWord(v.value),
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
            Lit::JSXText(v) => ConstantValue::StrAtom(v.value),
        }
    }
}

impl Display for ConstantValue {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConstantValue::Undefined => write!(f, "undefined"),
            ConstantValue::StrWord(str) => write!(f, "\"{str}\""),
            ConstantValue::StrAtom(str) => write!(f, "\"{str}\""),
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

/// TODO: Use `Arc`
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub enum JsValue {
    /// Denotes a single string literal, which does not have any unknown value.
    ///
    /// TODO: Use a type without span
    Constant(ConstantValue),

    Array(usize, Vec<JsValue>),

    Object(usize, Vec<ObjectPart>),

    Url(Url),

    Alternatives(usize, Vec<JsValue>),

    // TODO no predefined kinds, only JsWord
    FreeVar(FreeVarKind),

    Variable(Id),

    /// `foo.${unknownVar}.js` => 'foo' + Unknown + '.js'
    Concat(usize, Vec<JsValue>),

    /// This can be converted to [JsValue::Concat] if the type of the variable
    /// is string.
    Add(usize, Vec<JsValue>),

    /// `(callee, args)`
    Call(usize, Box<JsValue>, Vec<JsValue>),

    /// `(obj, prop, args)`
    MemberCall(usize, Box<JsValue>, Box<JsValue>, Vec<JsValue>),

    /// `obj[prop]`
    Member(usize, Box<JsValue>, Box<JsValue>),

    /// This is a reference to a imported module
    Module(ModuleValue),

    /// Some kind of well known object
    /// (must not be an array, otherwise Array.concat need to be changed)
    WellKnownObject(WellKnownObjectKind),

    /// Some kind of well known function
    WellKnownFunction(WellKnownFunctionKind),

    /// Not analyzable.
    Unknown(Option<Arc<JsValue>>, &'static str),

    /// `(return_value)`
    Function(usize, Box<JsValue>),

    Argument(usize),
}

impl From<&'_ str> for JsValue {
    fn from(v: &str) -> Self {
        ConstantValue::StrWord(v.into()).into()
    }
}

impl From<JsWord> for JsValue {
    fn from(v: JsWord) -> Self {
        ConstantValue::StrWord(v).into()
    }
}

impl From<Atom> for JsValue {
    fn from(v: Atom) -> Self {
        ConstantValue::StrAtom(v).into()
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
        ConstantValue::StrWord(v.into()).into()
    }
}

impl From<swc_core::ecma::ast::Str> for JsValue {
    fn from(v: swc_core::ecma::ast::Str) -> Self {
        ConstantValue::StrWord(v.value).into()
    }
}

impl From<ConstantValue> for JsValue {
    fn from(v: ConstantValue) -> Self {
        JsValue::Constant(v)
    }
}

impl Default for JsValue {
    fn default() -> Self {
        JsValue::Unknown(None, "")
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
            JsValue::Array(_, elems) => write!(
                f,
                "[{}]",
                elems
                    .iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            JsValue::Object(_, parts) => write!(
                f,
                "{{{}}}",
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
            JsValue::Function(_, return_value) => {
                write!(f, "Function(return = {:?})", return_value)
            }
            JsValue::Argument(index) => write!(f, "arguments[{}]", index),
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

impl JsValue {
    pub fn as_str(&self) -> Option<&str> {
        match self {
            JsValue::Constant(c) => c.as_str(),
            _ => None,
        }
    }

    pub fn alternatives(list: Vec<JsValue>) -> Self {
        Self::Alternatives(1 + total_nodes(&list), list)
    }

    pub fn concat(list: Vec<JsValue>) -> Self {
        Self::Concat(1 + total_nodes(&list), list)
    }

    pub fn add(list: Vec<JsValue>) -> Self {
        Self::Add(1 + total_nodes(&list), list)
    }

    pub fn array(list: Vec<JsValue>) -> Self {
        Self::Array(1 + total_nodes(&list), list)
    }

    pub fn function(return_value: Box<JsValue>) -> Self {
        Self::Function(1 + return_value.total_nodes(), return_value)
    }

    pub fn object(list: Vec<ObjectPart>) -> Self {
        Self::Object(
            1 + list
                .iter()
                .map(|v| match v {
                    ObjectPart::KeyValue(k, v) => k.total_nodes() + v.total_nodes(),
                    ObjectPart::Spread(s) => s.total_nodes(),
                })
                .sum::<usize>(),
            list,
        )
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
            | JsValue::Argument(_) => 1,

            JsValue::Array(c, _)
            | JsValue::Object(c, _)
            | JsValue::Alternatives(c, _)
            | JsValue::Concat(c, _)
            | JsValue::Add(c, _)
            | JsValue::Call(c, _, _)
            | JsValue::MemberCall(c, _, _, _)
            | JsValue::Member(c, _, _)
            | JsValue::Function(c, _) => *c,
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
            | JsValue::Argument(_) => {}

            JsValue::Array(c, list)
            | JsValue::Alternatives(c, list)
            | JsValue::Concat(c, list)
            | JsValue::Add(c, list) => {
                *c = 1 + total_nodes(list);
            }

            JsValue::Object(c, props) => {
                *c = 1 + props
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
            JsValue::Function(c, r) => {
                *c = 1 + r.total_nodes();
            }
        }
    }

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
                | JsValue::Argument(_) => self.make_unknown_without_content("node limit reached"),

                JsValue::Array(_, list)
                | JsValue::Alternatives(_, list)
                | JsValue::Concat(_, list)
                | JsValue::Add(_, list) => {
                    make_max_unknown(list.iter_mut());
                    self.update_total_nodes();
                }
                JsValue::Object(_, list) => {
                    make_max_unknown(list.iter_mut().flat_map(|v| match v {
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
                JsValue::Function(_, r) => {
                    r.make_unknown_without_content("node limit reached");
                }
            }
        }
    }

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
            JsValue::Array(_, elems) => format!(
                "[{}]",
                pretty_join(
                    &elems
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
            JsValue::Object(_, parts) => format!(
                "{{{}}}",
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
            JsValue::FreeVar(FreeVarKind::Other(name)) => format!("FreeVar({})", name),
            JsValue::FreeVar(name) => format!("FreeVar({:?})", name),
            JsValue::Variable(name) => {
                format!("{}", name.0)
            }
            JsValue::Argument(index) => {
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
            JsValue::Function(_, return_value) => {
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

    pub fn make_unknown(&mut self, reason: &'static str) {
        *self = JsValue::Unknown(Some(Arc::new(take(self))), reason);
    }

    pub fn make_unknown_without_content(&mut self, reason: &'static str) {
        *self = JsValue::Unknown(None, reason);
    }

    pub fn has_placeholder(&self) -> bool {
        match self {
            JsValue::WellKnownObject(WellKnownObjectKind::GlobalObject) => true,
            // These are leafs and not placeholders
            JsValue::Constant(_)
            | JsValue::Url(_)
            | JsValue::WellKnownObject(_)
            | JsValue::WellKnownFunction(_)
            | JsValue::Unknown(_, _)
            | JsValue::Function(..) => false,

            // These must be optimized reduced if they don't contain placeholders
            // So when we see them, they contain placeholders
            JsValue::Call(..) | JsValue::MemberCall(..) | JsValue::Member(..) => true,

            // These are nested structures, where we look into children
            // to see placeholders
            JsValue::Array(..)
            | JsValue::Object(..)
            | JsValue::Alternatives(..)
            | JsValue::Concat(..)
            | JsValue::Add(..) => {
                let mut result = false;
                self.for_each_children(&mut |child| {
                    result = result || child.has_placeholder();
                });
                result
            }

            // These are placeholders
            JsValue::Argument(_)
            | JsValue::Variable(_)
            | JsValue::Module(..)
            | JsValue::FreeVar(_) => true,
        }
    }
}

macro_rules! for_each_children_async {
    ($value:expr, $visit_fn:expr, $($args:expr),+) => {
        Ok(match &mut $value {
            JsValue::Alternatives(_, list)
            | JsValue::Concat(_, list)
            | JsValue::Add(_, list)
            | JsValue::Array(_, list) => {
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
            JsValue::Object(_, list) => {
                let mut modified = false;
                for item in list.iter_mut() {
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

            JsValue::Function(_, box return_value) => {
                let (new_return_value, modified) = $visit_fn(take(return_value), $($args),+).await?;
                *return_value = new_return_value;

                $value.update_total_nodes();
                ($value, modified)
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

impl JsValue {
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
        ) -> Pin<Box<dyn Future<Output = Result<(JsValue, bool), E>> + Send + 'a>>
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

    pub async fn visit_each_children_async<'a, F, R, E>(
        mut self,
        visitor: &mut F,
    ) -> Result<(Self, bool), E>
    where
        R: 'a + Future<Output = Result<(Self, bool), E>>,
        F: 'a + FnMut(JsValue) -> R,
    {
        fn visit_async_box<'a, F, R, E>(
            value: JsValue,
            visitor: &'a mut F,
        ) -> Pin<Box<dyn Future<Output = Result<(JsValue, bool), E>> + 'a>>
        where
            R: 'a + Future<Output = Result<(JsValue, bool), E>>,
            F: 'a + FnMut(JsValue) -> R,
            E: 'a,
        {
            Box::pin(value.visit_async(visitor))
        }
        for_each_children_async!(self, visit_async_box, visitor)
    }

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

    pub fn visit_mut_until_settled(&mut self, visitor: &mut impl FnMut(&mut JsValue) -> bool) {
        while visitor(self) {
            self.for_each_children_mut(&mut |value| {
                value.visit_mut_until_settled(visitor);
                false
            });
        }
    }

    pub fn visit_mut(&mut self, visitor: &mut impl FnMut(&mut JsValue) -> bool) -> bool {
        let modified = self.for_each_children_mut(&mut |value| value.visit_mut(visitor));
        if visitor(self) {
            true
        } else {
            modified
        }
    }

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

    pub fn for_each_children_mut(
        &mut self,
        visitor: &mut impl FnMut(&mut JsValue) -> bool,
    ) -> bool {
        match self {
            JsValue::Alternatives(_, list)
            | JsValue::Concat(_, list)
            | JsValue::Add(_, list)
            | JsValue::Array(_, list) => {
                let mut modified = false;
                for item in list.iter_mut() {
                    if visitor(item) {
                        modified = true
                    }
                }
                self.update_total_nodes();
                modified
            }
            JsValue::Object(_, list) => {
                let mut modified = false;
                for item in list.iter_mut() {
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
                self.update_total_nodes();
                modified
            }
            JsValue::Call(_, callee, list) => {
                let mut modified = visitor(callee);
                for item in list.iter_mut() {
                    if visitor(item) {
                        modified = true
                    }
                }
                self.update_total_nodes();
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
                self.update_total_nodes();
                modified
            }
            JsValue::Function(_, return_value) => {
                let modified = visitor(return_value);

                self.update_total_nodes();
                modified
            }
            JsValue::Member(_, obj, prop) => {
                let m1 = visitor(obj);
                let m2 = visitor(prop);
                self.update_total_nodes();
                m1 || m2
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

    pub fn visit(&self, visitor: &mut impl FnMut(&JsValue)) {
        self.for_each_children(&mut |value| value.visit(visitor));
        visitor(self);
    }

    pub fn for_each_children(&self, visitor: &mut impl FnMut(&JsValue)) {
        match self {
            JsValue::Alternatives(_, list)
            | JsValue::Concat(_, list)
            | JsValue::Add(_, list)
            | JsValue::Array(_, list) => {
                for item in list.iter() {
                    visitor(item);
                }
            }
            JsValue::Object(_, list) => {
                for item in list.iter() {
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
            JsValue::Function(_, return_value) => {
                visitor(return_value);
            }
            JsValue::Member(_, obj, prop) => {
                visitor(obj);
                visitor(prop);
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

    pub fn is_string(&self) -> bool {
        match self {
            JsValue::Constant(ConstantValue::StrWord(..))
            | JsValue::Constant(ConstantValue::StrAtom(..))
            | JsValue::Concat(..) => true,

            JsValue::Constant(..)
            | JsValue::Array(..)
            | JsValue::Object(..)
            | JsValue::Url(..)
            | JsValue::Module(..)
            | JsValue::Function(..) => false,

            JsValue::FreeVar(FreeVarKind::Dirname | FreeVarKind::Filename) => true,
            JsValue::FreeVar(
                FreeVarKind::Object
                | FreeVarKind::Require
                | FreeVarKind::Define
                | FreeVarKind::Import
                | FreeVarKind::NodeProcess,
            ) => false,
            JsValue::FreeVar(FreeVarKind::Other(_)) => false,

            JsValue::Add(_, v) => v.iter().any(|v| v.is_string()),

            JsValue::Alternatives(_, v) => v.iter().all(|v| v.is_string()),

            JsValue::Variable(_) | JsValue::Unknown(..) | JsValue::Argument(..) => false,

            JsValue::Call(
                _,
                box JsValue::WellKnownFunction(WellKnownFunctionKind::RequireResolve),
                _,
            ) => true,
            JsValue::Call(..) | JsValue::MemberCall(..) | JsValue::Member(..) => false,
            JsValue::WellKnownObject(_) | JsValue::WellKnownFunction(_) => false,
        }
    }

    pub fn starts_with(&self, str: &str) -> bool {
        if let Some(s) = self.as_str() {
            return s.starts_with(str);
        }
        match self {
            JsValue::Alternatives(_, alts) => alts.iter().all(|alt| alt.starts_with(str)),
            JsValue::Concat(_, list) => {
                if let Some(item) = list.iter().next() {
                    item.starts_with(str)
                } else {
                    false
                }
            }

            // TODO: JsValue::Url(_) => todo!(),
            JsValue::WellKnownObject(_) | JsValue::WellKnownFunction(_) | JsValue::Function(..) => {
                false
            }

            _ => false,
        }
    }

    pub fn starts_not_with(&self, str: &str) -> bool {
        if let Some(s) = self.as_str() {
            return !s.starts_with(str);
        }
        match self {
            JsValue::Alternatives(_, alts) => alts.iter().all(|alt| alt.starts_not_with(str)),
            JsValue::Concat(_, list) => {
                if let Some(item) = list.iter().next() {
                    item.starts_not_with(str)
                } else {
                    false
                }
            }

            // TODO: JsValue::Url(_) => todo!(),
            JsValue::WellKnownObject(_) | JsValue::WellKnownFunction(_) | JsValue::Function(..) => {
                false
            }

            _ => false,
        }
    }

    pub fn ends_with(&self, str: &str) -> bool {
        if let Some(s) = self.as_str() {
            return s.ends_with(str);
        }
        match self {
            JsValue::Alternatives(_, alts) => alts.iter().all(|alt| alt.ends_with(str)),
            JsValue::Concat(_, list) => {
                if let Some(item) = list.last() {
                    item.ends_with(str)
                } else {
                    false
                }
            }

            // TODO: JsValue::Url(_) => todo!(),
            JsValue::WellKnownObject(_) | JsValue::WellKnownFunction(_) | JsValue::Function(..) => {
                false
            }

            _ => false,
        }
    }

    pub fn ends_not_with(&self, str: &str) -> bool {
        if let Some(s) = self.as_str() {
            return !s.ends_with(str);
        }
        match self {
            JsValue::Alternatives(_, alts) => alts.iter().all(|alt| alt.ends_not_with(str)),
            JsValue::Concat(_, list) => {
                if let Some(item) = list.last() {
                    item.ends_not_with(str)
                } else {
                    false
                }
            }

            // TODO: JsValue::Url(_) => todo!(),
            JsValue::WellKnownObject(_) | JsValue::WellKnownFunction(_) | JsValue::Function(..) => {
                false
            }

            _ => false,
        }
    }

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

    pub fn normalize_shallow(&mut self) {
        match self {
            JsValue::Alternatives(_, v) => {
                let mut set = IndexSet::new();
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
                    if item.is_string() {
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
            _ => {}
        }
    }

    pub fn normalize(&mut self) {
        self.for_each_children_mut(&mut |child| {
            child.normalize();
            true
        });
        self.normalize_shallow();
    }

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
            (JsValue::Array(lc, l), JsValue::Array(rc, r)) => {
                lc == rc && all_similar(l, r, depth - 1)
            }
            (JsValue::Object(lc, l), JsValue::Object(rc, r)) => {
                lc == rc && all_parts_similar(l, r, depth - 1)
            }
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
            (JsValue::Function(lc, l), JsValue::Function(rc, r)) => {
                lc == rc && l.similar(r, depth - 1)
            }
            (JsValue::Argument(l), JsValue::Argument(r)) => l == r,
            _ => false,
        }
    }

    fn similar_hash<H: std::hash::Hasher>(&self, state: &mut H, depth: usize) {
        if depth == 0 {
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
            JsValue::Array(_, v) => all_similar_hash(v, state, depth - 1),
            JsValue::Object(_, v) => all_parts_similar_hash(v, state, depth - 1),
            JsValue::Url(v) => Hash::hash(v, state),
            JsValue::Alternatives(_, v) => all_similar_hash(v, state, depth - 1),
            JsValue::FreeVar(v) => Hash::hash(v, state),
            JsValue::Variable(v) => Hash::hash(v, state),
            JsValue::Concat(_, v) => all_similar_hash(v, state, depth - 1),
            JsValue::Add(_, v) => all_similar_hash(v, state, depth - 1),
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
            JsValue::Function(_, v) => v.similar_hash(state, depth - 1),
            JsValue::Argument(v) => Hash::hash(v, state),
        }
    }
}

struct SimilarJsValue(JsValue);

impl PartialEq for SimilarJsValue {
    fn eq(&self, other: &Self) -> bool {
        self.0.similar(&other.0, 3)
    }
}

impl Eq for SimilarJsValue {}

impl Hash for SimilarJsValue {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.0.similar_hash(state, 3)
    }
}

// TODO get rid of that and only use `JsWord` in `FreeVar(...)`
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub enum FreeVarKind {
    // Object
    Object,
    /// `__dirname`
    Dirname,

    /// `__filename`
    Filename,

    /// A reference to global `require`
    Require,

    /// A reference to global `define` (AMD)
    Define,

    /// A reference to `import`
    Import,

    /// Node.js process
    NodeProcess,

    /// `abc` `some_global`
    Other(JsWord),
}

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
    NodePreGyp,
    NodeExpressApp,
    NodeProtobufLoader,
    RequireCache,
}

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

fn is_unresolved(i: &Ident, unresolved_mark: Mark) -> bool {
    i.span.ctxt.outer() == unresolved_mark
}

#[doc(hidden)]
pub mod test_utils {
    use std::sync::Arc;

    use anyhow::Result;
    use turbopack_core::environment::EnvironmentVc;

    use super::{
        well_known::replace_well_known, FreeVarKind, JsValue, ModuleValue, WellKnownFunctionKind,
        WellKnownObjectKind,
    };
    use crate::analyzer::builtin::replace_builtin;

    pub async fn visitor(v: JsValue, environment: EnvironmentVc) -> Result<(JsValue, bool)> {
        let mut new_value = match v {
            JsValue::Call(
                _,
                box JsValue::WellKnownFunction(WellKnownFunctionKind::RequireResolve),
                ref args,
            ) => match &args[0] {
                JsValue::Constant(v) => (v.to_string() + "/resolved/lib/index.js").into(),
                _ => JsValue::Unknown(Some(Arc::new(v)), "resolve.resolve non constant"),
            },
            JsValue::FreeVar(FreeVarKind::Require) => {
                JsValue::WellKnownFunction(WellKnownFunctionKind::Require)
            }
            JsValue::FreeVar(FreeVarKind::Define) => {
                JsValue::WellKnownFunction(WellKnownFunctionKind::Define)
            }
            JsValue::FreeVar(FreeVarKind::Dirname) => "__dirname".into(),
            JsValue::FreeVar(FreeVarKind::Filename) => "__filename".into(),
            JsValue::FreeVar(FreeVarKind::NodeProcess) => {
                JsValue::WellKnownObject(WellKnownObjectKind::NodeProcess)
            }
            JsValue::FreeVar(kind) => {
                JsValue::Unknown(Some(Arc::new(JsValue::FreeVar(kind))), "unknown global")
            }
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
                let (mut v, m1) = replace_well_known(v, environment).await?;
                let m2 = replace_builtin(&mut v);
                return Ok((v, m1 || m2));
            }
        };
        new_value.normalize_shallow();
        Ok((new_value, true))
    }
}

#[cfg(test)]
mod tests {
    use std::{path::PathBuf, sync::Mutex, time::Instant};

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
        environment::{
            EnvironmentIntention, EnvironmentVc, ExecutionEnvironment, NodeJsEnvironment,
        },
        target::{Arch, CompileTarget, Endianness, Libc, Platform},
    };

    use super::{
        graph::{create_graph, EvalContext},
        linker::{link, LinkCache},
        JsValue,
    };

    #[fixture("tests/analyzer/graph/**/input.js")]
    fn fixture(input: PathBuf) {
        crate::register();
        let graph_snapshot_path = input.with_file_name("graph.snapshot");
        let graph_explained_snapshot_path = input.with_file_name("graph-explained.snapshot");
        let resolved_explained_snapshot_path = input.with_file_name("resolved-explained.snapshot");

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

                let var_graph = create_graph(&m, &eval_context);

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

                    NormalizedOutput::from(format!("{:#?}", named_values))
                        .compare_to_file(&graph_snapshot_path)
                        .unwrap();
                    NormalizedOutput::from(explain_all(&named_values))
                        .compare_to_file(&graph_explained_snapshot_path)
                        .unwrap();
                }

                {
                    // Dump snapshot of resolved

                    let start = Instant::now();
                    let cache = Mutex::new(LinkCache::new());
                    let mut resolved = Vec::new();
                    for (id, val) in named_values.iter() {
                        let val = val.clone();
                        println!("linking {} {id}", input.display());
                        let start = Instant::now();
                        let mut res = turbo_tasks_testing::VcStorage::with(link(
                            &var_graph,
                            val,
                            &(|val| {
                                Box::pin(super::test_utils::visitor(
                                    val,
                                    EnvironmentVc::new(
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
                                    ),
                                ))
                            }),
                            &cache,
                        ))
                        .await
                        .unwrap();
                        let time = start.elapsed();
                        if time.as_millis() > 1 {
                            println!(
                                "linking {} {id} took {}",
                                input.display(),
                                FormatDuration(time)
                            );
                        }
                        res.normalize();

                        resolved.push((id.clone(), res));
                    }
                    let time = start.elapsed();
                    if time.as_millis() > 1 {
                        println!("linking {} took {}", input.display(), FormatDuration(time));
                    }

                    let start = Instant::now();
                    let time = start.elapsed();
                    let explainer = explain_all(&resolved);
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

                Ok(())
            })
        })
        .unwrap();
    }
}
