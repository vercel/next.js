use std::{
    fmt::Display,
    future::Future,
    hash::{Hash, Hasher},
    mem::{self, take},
    pin::Pin,
    sync::Arc,
};

pub(crate) use self::imports::ImportMap;
use indexmap::IndexSet;
use num_bigint::BigInt;
use swc_atoms::{js_word, JsWord};
use swc_common::{collections::AHashSet, Mark};
use swc_ecmascript::{
    ast::{Ident, Lit},
    utils::{ident::IdentLike, Id},
};
use url::Url;

pub mod builtin;
pub mod graph;
mod imports;
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
    let bits: u64 = unsafe { mem::transmute(val) };
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
    Str(JsWord),
    Num(ConstantNumber),
    True,
    False,
    Null,
    BigInt(BigInt),
    Regex(JsWord, JsWord),
}

impl Default for ConstantValue {
    fn default() -> Self {
        ConstantValue::Undefined
    }
}

impl From<Lit> for ConstantValue {
    fn from(v: Lit) -> Self {
        match v {
            Lit::Str(v) => ConstantValue::Str(v.value),
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
            Lit::Regex(v) => ConstantValue::Regex(v.exp, v.flags),
            Lit::JSXText(v) => ConstantValue::Str(v.value),
        }
    }
}

impl Display for ConstantValue {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConstantValue::Undefined => write!(f, "undefined"),
            ConstantValue::Str(str) => write!(f, "\"{str}\""),
            ConstantValue::True => write!(f, "true"),
            ConstantValue::False => write!(f, "false"),
            ConstantValue::Null => write!(f, "null"),
            ConstantValue::Num(ConstantNumber(n)) => write!(f, "{n}"),
            ConstantValue::BigInt(n) => write!(f, "{n}"),
            ConstantValue::Regex(exp, flags) => write!(f, "/{exp}/{flags}"),
        }
    }
}

/// TODO: Use `Arc`
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub enum JsValue {
    /// Denotes a single string literal, which does not have any unknown value.
    ///
    /// TODO: Use a type without span
    Constant(ConstantValue),

    Array(Vec<JsValue>),

    Object(Vec<ObjectPart>),

    Url(Url),

    Alternatives(Vec<JsValue>),

    // TODO no predefined kinds, only JsWord
    FreeVar(FreeVarKind),

    Variable(Id),

    /// `foo.${unknownVar}.js` => 'foo' + Unknown + '.js'
    Concat(Vec<JsValue>),

    /// This can be converted to [JsValue::Concat] if the type of the variable
    /// is string.
    Add(Vec<JsValue>),

    /// `(callee, args)`
    Call(Box<JsValue>, Vec<JsValue>),

    /// `(obj, prop, args)`
    MemberCall(Box<JsValue>, Box<JsValue>, Vec<JsValue>),

    /// `obj[prop]`
    Member(Box<JsValue>, Box<JsValue>),

    /// This is a reference to a imported module
    Module(JsWord),

    /// Some kind of well known object
    /// (must not be an array, otherwise Array.concat need to be changed)
    WellKnownObject(WellKnownObjectKind),

    /// Some kind of well known function
    WellKnownFunction(WellKnownFunctionKind),

    /// Not analyzable.
    Unknown(Option<Arc<JsValue>>, &'static str),

    /// `(return_value)`
    Function(Box<JsValue>),

    Argument(usize),
}

impl From<&'_ str> for JsValue {
    fn from(v: &str) -> Self {
        ConstantValue::Str(v.into()).into()
    }
}

impl From<JsWord> for JsValue {
    fn from(v: JsWord) -> Self {
        ConstantValue::Str(v.into()).into()
    }
}

impl From<BigInt> for JsValue {
    fn from(v: BigInt) -> Self {
        ConstantValue::BigInt(v.into()).into()
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

impl From<swc_ecmascript::ast::Str> for JsValue {
    fn from(v: swc_ecmascript::ast::Str) -> Self {
        ConstantValue::Str(v.value).into()
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
            JsValue::Array(elems) => write!(
                f,
                "[{}]",
                elems
                    .iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            JsValue::Object(parts) => write!(
                f,
                "{{{}}}",
                parts
                    .iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            JsValue::Alternatives(list) => write!(
                f,
                "({})",
                list.iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(" | ")
            ),
            JsValue::FreeVar(name) => write!(f, "FreeVar({:?})", name),
            JsValue::Variable(name) => write!(f, "Variable({}#{:?})", name.0, name.1),
            JsValue::Concat(list) => write!(
                f,
                "`{}`",
                list.iter()
                    .map(|v| match v {
                        JsValue::Constant(ConstantValue::Str(str)) => str.to_string(),
                        _ => format!("${{{}}}", v),
                    })
                    .collect::<Vec<_>>()
                    .join("")
            ),
            JsValue::Add(list) => write!(
                f,
                "({})",
                list.iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(" + ")
            ),
            JsValue::Call(callee, list) => write!(
                f,
                "{}({})",
                callee,
                list.iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            JsValue::MemberCall(obj, prop, list) => write!(
                f,
                "{}[{}]({})",
                obj,
                prop,
                list.iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            JsValue::Member(obj, prop) => write!(f, "{}[{}]", obj, prop),
            JsValue::Module(name) => write!(f, "Module({})", name),
            JsValue::Unknown(..) => write!(f, "???"),
            JsValue::WellKnownObject(obj) => write!(f, "WellKnownObject({:?})", obj),
            JsValue::WellKnownFunction(func) => write!(f, "WellKnownFunction({:?})", func),
            JsValue::Function(return_value) => write!(f, "Function(return = {:?})", return_value),
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

impl JsValue {
    pub fn explain_args(
        args: &Vec<JsValue>,
        depth: usize,
        unknown_depth: usize,
    ) -> (String, String) {
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
        let explainer = self.explain_internal(hints, indent_depth, depth - 1, unknown_depth);
        // if explainer.len() < 100 {
        return explainer;
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
            JsValue::Array(elems) => format!(
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
            JsValue::Object(parts) => format!(
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
            JsValue::Alternatives(list) => format!(
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
            JsValue::Concat(list) => format!(
                "`{}`",
                list.iter()
                    .map(|v| match v {
                        JsValue::Constant(ConstantValue::Str(str)) => str.to_string(),
                        _ => format!(
                            "${{{}}}",
                            v.explain_internal_inner(hints, indent_depth + 1, depth, unknown_depth)
                        ),
                    })
                    .collect::<Vec<_>>()
                    .join("")
            ),
            JsValue::Add(list) => format!(
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
            JsValue::Call(callee, list) => {
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
            JsValue::MemberCall(obj, prop, list) => {
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
            JsValue::Member(obj, prop) => {
                format!(
                    "{}[{}]",
                    obj.explain_internal_inner(hints, indent_depth, depth, unknown_depth),
                    prop.explain_internal_inner(hints, indent_depth, depth, unknown_depth)
                )
            }
            JsValue::Module(name) => {
                format!("module<{}>", name)
            }
            JsValue::Unknown(inner, explainer) => {
                if unknown_depth == 0 || explainer.is_empty() {
                    format!("???")
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
                    WellKnownObjectKind::PathModule => (
                        "path",
                        "The Node.js path module: https://nodejs.org/api/path.html",
                    ),
                    WellKnownObjectKind::FsModule => (
                        "fs",
                        "The Node.js fs module: https://nodejs.org/api/fs.html",
                    ),
                    WellKnownObjectKind::UrlModule => (
                        "url",
                        "The Node.js url module: https://nodejs.org/api/url.html",
                    ),
                    WellKnownObjectKind::ChildProcess => (
                        "child_process",
                        "The Node.js child_process module: https://nodejs.org/api/child_process.html",
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
                    WellKnownFunctionKind::PathJoin => (
                        format!("path.join"),
                        "The Node.js path.join method: https://nodejs.org/api/path.html#pathjoinpaths",
                    ),
                    WellKnownFunctionKind::PathDirname => (
                        format!("path.dirname"),
                        "The Node.js path.dirname method: https://nodejs.org/api/path.html#pathdirnamepath",
                    ),
                    WellKnownFunctionKind::Import => (
                        format!("import"),
                        "The dynamic import() method from the ESM specification: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import#dynamic_imports"
                    ),
                    WellKnownFunctionKind::Require => (format!("require"), "The require method from CommonJS"),
                    WellKnownFunctionKind::RequireResolve => (format!("require.resolve"), "The require.resolve method from CommonJS"),
                    WellKnownFunctionKind::FsReadMethod(name) => (
                        format!("fs.{name}"),
                        "A file reading method from the Node.js fs module: https://nodejs.org/api/fs.html",
                    ),
                    WellKnownFunctionKind::PathToFileUrl => (
                        format!("url.pathToFileURL"),
                        "The Node.js url.pathToFileURL method: https://nodejs.org/api/url.html#urlpathtofileurlpath",
                    ),
                    WellKnownFunctionKind::ChildProcessSpawnMethod(name) => (
                        format!("child_process.{name}"),
                        "A process spawning method from the Node.js child_process module: https://nodejs.org/api/child_process.html",
                    ),
                    WellKnownFunctionKind::ChildProcessFork => (
                        format!("child_process.fork"),
                        "The Node.js child_process.fork method: https://nodejs.org/api/child_process.html#child_processforkmodulepath-args-options",
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
            JsValue::Function(return_value) => {
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
                    format!("(...) => ...")
                }
            }
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        if let JsValue::Constant(ConstantValue::Str(str)) = self {
            Some(&*str)
        } else {
            None
        }
    }

    pub fn as_word(&self) -> Option<&JsWord> {
        if let JsValue::Constant(ConstantValue::Str(str)) = self {
            Some(&str)
        } else {
            None
        }
    }
}

macro_rules! for_each_children_async {
    ($value:expr, $visit_fn:expr, $($args:expr),+) => {
        Ok(match &mut $value {
            JsValue::Alternatives(list)
            | JsValue::Concat(list)
            | JsValue::Add(list)
            | JsValue::Array(list) => {
                let mut modified = false;
                for item in list.iter_mut() {
                    let (v, m) = $visit_fn(take(item), $($args),+).await?;
                    *item = v;
                    if m {
                        modified = true
                    }
                }
                ($value, modified)
            }
            JsValue::Object(list) => {
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
                ($value, modified)
            }
            JsValue::Call(box callee, list) => {
                let (new_callee, mut modified) = $visit_fn(take(callee), $($args),+).await?;
                *callee = new_callee;
                for item in list.iter_mut() {
                    let (v, m) = $visit_fn(take(item), $($args),+).await?;
                    *item = v;
                    if m {
                        modified = true
                    }
                }
                ($value, modified)
            }
            JsValue::MemberCall(box obj, box prop, list) => {
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
                ($value, modified)
            }

            JsValue::Function(box return_value) => {
                let (new_return_value, modified) = $visit_fn(take(return_value), $($args),+).await?;
                *return_value = new_return_value;

                ($value, modified)
            }
            JsValue::Member(box obj, box prop) => {
                let (v, m1) = $visit_fn(take(obj), $($args),+).await?;
                *obj = v;
                let (v, m2) = $visit_fn(take(prop), $($args),+).await?;
                *prop = v;
                ($value, m1 || m2)
            }
            JsValue::Constant(_)
            | JsValue::FreeVar(_)
            | JsValue::Variable(_)
            | JsValue::Module(_)
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
        Ok(match &mut self {
            JsValue::Alternatives(list)
            | JsValue::Concat(list)
            | JsValue::Add(list)
            | JsValue::Array(list) => {
                let mut modified = false;
                for item in list.iter_mut() {
                    let (v, m) = visitor(take(item)).await?;
                    *item = v;
                    if m {
                        modified = true
                    }
                }
                (self, modified)
            }
            JsValue::Object(list) => {
                let mut modified = false;
                for item in list.iter_mut() {
                    match item {
                        ObjectPart::KeyValue(key, value) => {
                            let (v, m) = visitor(take(key)).await?;
                            *key = v;
                            if m {
                                modified = true
                            }
                            let (v, m) = visitor(take(value)).await?;
                            *value = v;
                            if m {
                                modified = true
                            }
                        }
                        ObjectPart::Spread(value) => {
                            let (v, m) = visitor(take(value)).await?;
                            *value = v;
                            if m {
                                modified = true
                            }
                        }
                    }
                }
                (self, modified)
            }
            JsValue::Call(box callee, list) => {
                let (new_callee, mut modified) = visitor(take(callee)).await?;
                *callee = new_callee;
                for item in list.iter_mut() {
                    let (v, m) = visitor(take(item)).await?;
                    *item = v;
                    if m {
                        modified = true
                    }
                }
                (self, modified)
            }
            JsValue::MemberCall(box obj, box prop, list) => {
                let (new_callee, m1) = visitor(take(obj)).await?;
                *obj = new_callee;
                let (new_member, m2) = visitor(take(prop)).await?;
                *prop = new_member;
                let mut modified = m1 || m2;
                for item in list.iter_mut() {
                    let (v, m) = visitor(take(item)).await?;
                    *item = v;
                    if m {
                        modified = true
                    }
                }
                (self, modified)
            }

            JsValue::Function(box return_value) => {
                let (new_return_value, modified) = visitor(take(return_value)).await?;
                *return_value = new_return_value;

                (self, modified)
            }
            JsValue::Member(box obj, box prop) => {
                let (v, m1) = visitor(take(obj)).await?;
                *obj = v;
                let (v, m2) = visitor(take(prop)).await?;
                *prop = v;
                (self, m1 || m2)
            }
            JsValue::Constant(_)
            | JsValue::FreeVar(_)
            | JsValue::Variable(_)
            | JsValue::Module(_)
            | JsValue::Url(_)
            | JsValue::WellKnownObject(_)
            | JsValue::WellKnownFunction(_)
            | JsValue::Unknown(..)
            | JsValue::Argument(..) => (self, false),
        })
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
        if condition(&self) {
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
            JsValue::Alternatives(list)
            | JsValue::Concat(list)
            | JsValue::Add(list)
            | JsValue::Array(list) => {
                let mut modified = false;
                for item in list.iter_mut() {
                    if visitor(item) {
                        modified = true
                    }
                }
                modified
            }
            JsValue::Object(list) => {
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
                modified
            }
            JsValue::Call(callee, list) => {
                let mut modified = visitor(callee);
                for item in list.iter_mut() {
                    if visitor(item) {
                        modified = true
                    }
                }
                modified
            }
            JsValue::MemberCall(obj, prop, list) => {
                let m1 = visitor(obj);
                let m2 = visitor(prop);
                let mut modified = m1 || m2;
                for item in list.iter_mut() {
                    if visitor(item) {
                        modified = true
                    }
                }
                modified
            }
            JsValue::Function(return_value) => {
                let modified = visitor(return_value);

                modified
            }
            JsValue::Member(obj, prop) => {
                let modified = visitor(obj);
                visitor(prop) || modified
            }
            JsValue::Constant(_)
            | JsValue::FreeVar(_)
            | JsValue::Variable(_)
            | JsValue::Module(_)
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
            JsValue::Alternatives(list)
            | JsValue::Concat(list)
            | JsValue::Add(list)
            | JsValue::Array(list) => {
                for item in list.iter() {
                    visitor(item);
                }
            }
            JsValue::Object(list) => {
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
            JsValue::Call(callee, list) => {
                visitor(callee);
                for item in list.iter() {
                    visitor(item);
                }
            }
            JsValue::MemberCall(obj, prop, list) => {
                visitor(obj);
                visitor(prop);
                for item in list.iter() {
                    visitor(item);
                }
            }
            JsValue::Function(return_value) => {
                visitor(return_value);
            }
            JsValue::Member(obj, prop) => {
                visitor(obj);
                visitor(prop);
            }
            JsValue::Constant(_)
            | JsValue::FreeVar(_)
            | JsValue::Variable(_)
            | JsValue::Module(_)
            | JsValue::Url(_)
            | JsValue::WellKnownObject(_)
            | JsValue::WellKnownFunction(_)
            | JsValue::Unknown(..)
            | JsValue::Argument(..) => {}
        }
    }

    pub fn is_string(&self) -> bool {
        match self {
            JsValue::Constant(ConstantValue::Str(..)) | JsValue::Concat(_) => true,

            JsValue::Constant(..)
            | JsValue::Array(..)
            | JsValue::Object(..)
            | JsValue::Url(..)
            | JsValue::Module(..)
            | JsValue::Function(..) => false,

            JsValue::FreeVar(FreeVarKind::Dirname) => true,
            JsValue::FreeVar(
                FreeVarKind::Require | FreeVarKind::Import | FreeVarKind::RequireResolve,
            ) => false,
            JsValue::FreeVar(FreeVarKind::Other(_)) => false,

            JsValue::Add(v) => v.iter().any(|v| v.is_string()),

            JsValue::Alternatives(v) => v.iter().all(|v| v.is_string()),

            JsValue::Variable(_) | JsValue::Unknown(..) | JsValue::Argument(..) => false,

            JsValue::Call(box JsValue::FreeVar(FreeVarKind::RequireResolve), _) => true,
            JsValue::Call(..) | JsValue::MemberCall(..) | JsValue::Member(..) => false,
            JsValue::WellKnownObject(_) | JsValue::WellKnownFunction(_) => false,
        }
    }

    pub fn starts_with(&self, str: &str) -> bool {
        match self {
            JsValue::Constant(ConstantValue::Str(_)) => {
                if let Some(s) = self.as_str() {
                    s.starts_with(str)
                } else {
                    false
                }
            }
            JsValue::Alternatives(alts) => alts.iter().all(|alt| alt.starts_with(str)),
            JsValue::Concat(list) => {
                if let Some(item) = list.iter().next() {
                    item.starts_with(str)
                } else {
                    false
                }
            }

            // TODO: JsValue::Url(_) => todo!(),
            JsValue::WellKnownObject(_) | JsValue::WellKnownFunction(_) | JsValue::Function(_) => {
                false
            }

            _ => false,
        }
    }

    pub fn starts_not_with(&self, str: &str) -> bool {
        match self {
            JsValue::Constant(ConstantValue::Str(_)) => {
                if let Some(s) = self.as_str() {
                    !s.starts_with(str)
                } else {
                    false
                }
            }
            JsValue::Alternatives(alts) => alts.iter().all(|alt| alt.starts_not_with(str)),
            JsValue::Concat(list) => {
                if let Some(item) = list.iter().next() {
                    item.starts_not_with(str)
                } else {
                    false
                }
            }

            // TODO: JsValue::Url(_) => todo!(),
            JsValue::WellKnownObject(_) | JsValue::WellKnownFunction(_) | JsValue::Function(_) => {
                false
            }

            _ => false,
        }
    }

    pub fn ends_with(&self, str: &str) -> bool {
        match self {
            JsValue::Constant(ConstantValue::Str(_)) => {
                if let Some(s) = self.as_str() {
                    s.ends_with(str)
                } else {
                    false
                }
            }
            JsValue::Alternatives(alts) => alts.iter().all(|alt| alt.ends_with(str)),
            JsValue::Concat(list) => {
                if let Some(item) = list.last() {
                    item.ends_with(str)
                } else {
                    false
                }
            }

            // TODO: JsValue::Url(_) => todo!(),
            JsValue::WellKnownObject(_) | JsValue::WellKnownFunction(_) | JsValue::Function(_) => {
                false
            }

            _ => false,
        }
    }

    pub fn ends_not_with(&self, str: &str) -> bool {
        match self {
            JsValue::Constant(ConstantValue::Str(_)) => {
                if let Some(s) = self.as_str() {
                    !s.ends_with(str)
                } else {
                    false
                }
            }
            JsValue::Alternatives(alts) => alts.iter().all(|alt| alt.ends_not_with(str)),
            JsValue::Concat(list) => {
                if let Some(item) = list.last() {
                    item.ends_not_with(str)
                } else {
                    false
                }
            }

            // TODO: JsValue::Url(_) => todo!(),
            JsValue::WellKnownObject(_) | JsValue::WellKnownFunction(_) | JsValue::Function(_) => {
                false
            }

            _ => false,
        }
    }

    fn add_alt(&mut self, v: Self) {
        if self == &v {
            return;
        }

        if let JsValue::Alternatives(list) = self {
            if !list.contains(&v) {
                list.push(v)
            }
        } else {
            let l = take(self);
            *self = JsValue::Alternatives(vec![l, v]);
        }
    }

    pub fn normalize_shallow(&mut self) {
        match self {
            JsValue::Alternatives(v) => {
                let mut set = IndexSet::new();
                for v in take(v) {
                    match v {
                        JsValue::Alternatives(v) => {
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
                }
            }
            JsValue::Concat(v) => {
                // Remove empty strings
                v.retain(|v| match v {
                    JsValue::Constant(ConstantValue::Str(js_word!(""))) => false,
                    _ => true,
                });

                // TODO(kdy1): Remove duplicate
                let mut new = vec![];
                for v in take(v) {
                    match v {
                        JsValue::Concat(v) => new.extend(v),
                        JsValue::Constant(ConstantValue::Str(ref str)) => {
                            if let Some(JsValue::Constant(ConstantValue::Str(last))) =
                                new.last_mut()
                            {
                                *last = [&**last, &**str].concat().into();
                            } else {
                                new.push(v);
                            }
                        }
                        v => new.push(v),
                    }
                }
                if new.len() == 1 {
                    *self = new.into_iter().next().unwrap();
                } else {
                    *v = new;
                }
            }
            JsValue::Add(v) => {
                let mut added: Vec<JsValue> = Vec::new();
                let mut iter = take(v).into_iter();
                while let Some(item) = iter.next() {
                    if item.is_string() {
                        let mut concat = match added.len() {
                            0 => Vec::new(),
                            1 => vec![added.into_iter().next().unwrap()],
                            _ => vec![JsValue::Add(added)],
                        };
                        concat.push(item);
                        while let Some(item) = iter.next() {
                            concat.push(item);
                        }
                        *self = JsValue::Concat(concat);
                        return;
                    } else {
                        added.push(item);
                    }
                }
                if added.len() == 1 {
                    *self = added.into_iter().next().unwrap();
                } else {
                    *v = added;
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
            (JsValue::Array(l), JsValue::Array(r)) => all_similar(l, r, depth - 1),
            (JsValue::Object(l), JsValue::Object(r)) => all_parts_similar(l, r, depth - 1),
            (JsValue::Url(l), JsValue::Url(r)) => l == r,
            (JsValue::Alternatives(l), JsValue::Alternatives(r)) => all_similar(l, r, depth - 1),
            (JsValue::FreeVar(l), JsValue::FreeVar(r)) => l == r,
            (JsValue::Variable(l), JsValue::Variable(r)) => l == r,
            (JsValue::Concat(l), JsValue::Concat(r)) => all_similar(l, r, depth - 1),
            (JsValue::Add(l), JsValue::Add(r)) => all_similar(l, r, depth - 1),
            (JsValue::Call(lf, la), JsValue::Call(rf, ra)) => {
                lf.similar(rf, depth - 1) && all_similar(la, ra, depth - 1)
            }
            (JsValue::MemberCall(lo, lp, la), JsValue::MemberCall(ro, rp, ra)) => {
                lo.similar(ro, depth - 1)
                    && lp.similar(rp, depth - 1)
                    && all_similar(la, ra, depth - 1)
            }
            (JsValue::Member(lo, lp), JsValue::Member(ro, rp)) => {
                lo.similar(ro, depth - 1) && lp.similar(rp, depth - 1)
            }
            (JsValue::Module(l), JsValue::Module(r)) => l == r,
            (JsValue::WellKnownObject(l), JsValue::WellKnownObject(r)) => l == r,
            (JsValue::WellKnownFunction(l), JsValue::WellKnownFunction(r)) => l == r,
            (JsValue::Unknown(_, l), JsValue::Unknown(_, r)) => l == r,
            (JsValue::Function(l), JsValue::Function(r)) => l.similar(r, depth - 1),
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
            JsValue::Array(v) => all_similar_hash(v, state, depth - 1),
            JsValue::Object(v) => all_parts_similar_hash(v, state, depth - 1),
            JsValue::Url(v) => Hash::hash(v, state),
            JsValue::Alternatives(v) => all_similar_hash(v, state, depth - 1),
            JsValue::FreeVar(v) => Hash::hash(v, state),
            JsValue::Variable(v) => Hash::hash(v, state),
            JsValue::Concat(v) => all_similar_hash(v, state, depth - 1),
            JsValue::Add(v) => all_similar_hash(v, state, depth - 1),
            JsValue::Call(a, b) => {
                a.similar_hash(state, depth - 1);
                all_similar_hash(b, state, depth - 1);
            }
            JsValue::MemberCall(a, b, c) => {
                a.similar_hash(state, depth - 1);
                b.similar_hash(state, depth - 1);
                all_similar_hash(c, state, depth - 1);
            }
            JsValue::Member(o, p) => {
                o.similar_hash(state, depth - 1);
                p.similar_hash(state, depth - 1);
            }
            JsValue::Module(v) => Hash::hash(v, state),
            JsValue::WellKnownObject(v) => Hash::hash(v, state),
            JsValue::WellKnownFunction(v) => Hash::hash(v, state),
            JsValue::Unknown(_, v) => Hash::hash(v, state),
            JsValue::Function(v) => v.similar_hash(state, depth - 1),
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

#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub enum FreeVarKind {
    /// `__dirname`
    Dirname,

    /// A reference to global `require`
    Require,

    /// A reference to `import`
    Import,

    /// A reference to global `require.resolve`
    RequireResolve,

    /// `abc` `some_global`
    Other(JsWord),
}

#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub enum WellKnownObjectKind {
    PathModule,
    FsModule,
    UrlModule,
    ChildProcess,
}

#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub enum WellKnownFunctionKind {
    PathJoin,
    PathDirname,
    Import,
    Require,
    RequireResolve,
    FsReadMethod(JsWord),
    PathToFileUrl,
    ChildProcessSpawnMethod(JsWord),
    ChildProcessFork,
}

/// TODO(kdy1): Remove this once resolver distinguish between top-level bindings
/// and unresolved references https://github.com/swc-project/swc/issues/2956
///
/// Once the swc issue is resolved, it means we can know unresolved references
/// just by comparing [Mark]
fn is_unresolved(i: &Ident, bindings: &AHashSet<Id>, top_level_mark: Mark) -> bool {
    // resolver resolved `i` to non-top-level binding
    if i.span.ctxt.outer() != top_level_mark {
        return false;
    }

    // Check if there's a top level binding for `i`.
    // If it exists, `i` is reference to the binding.
    !bindings.contains(&i.to_id())
}

#[doc(hidden)]
pub mod test_utils {
    use std::sync::Arc;

    use super::{
        well_known::replace_well_known, FreeVarKind, JsValue, WellKnownFunctionKind,
        WellKnownObjectKind,
    };
    use crate::analyzer::builtin::replace_builtin;
    use anyhow::Result;

    pub async fn visitor(v: JsValue) -> Result<(JsValue, bool)> {
        let mut new_value = match v {
            JsValue::Call(
                box JsValue::WellKnownFunction(WellKnownFunctionKind::RequireResolve),
                ref args,
            ) => match &args[0] {
                JsValue::Constant(v) => (v.to_string() + "/resolved/lib/index.js").into(),
                _ => JsValue::Unknown(Some(Arc::new(v)), "resolve.resolve non constant"),
            },
            JsValue::FreeVar(FreeVarKind::Require) => {
                JsValue::WellKnownFunction(WellKnownFunctionKind::Require)
            }
            JsValue::FreeVar(FreeVarKind::Dirname) => "__dirname".into(),
            JsValue::FreeVar(kind) => {
                JsValue::Unknown(Some(Arc::new(JsValue::FreeVar(kind))), "unknown global")
            }
            JsValue::Module(ref name) => match &**name {
                "path" => JsValue::WellKnownObject(WellKnownObjectKind::PathModule),
                _ => return Ok((v, false)),
            },
            _ => {
                let (v, m1) = replace_well_known(v);
                let (v, m2) = replace_builtin(v);
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

    use async_std::task::block_on;
    use swc_common::Mark;
    use swc_ecma_transforms_base::resolver::resolver_with_mark;
    use swc_ecmascript::{
        ast::EsVersion,
        parser::{parse_file_as_module, parse_file_as_program},
        visit::VisitMutWith,
    };
    use testing::NormalizedOutput;

    use super::{
        graph::{create_graph, EvalContext},
        linker::{link, LinkCache},
        JsValue,
    };

    #[testing::fixture("tests/analyzer/graph/**/input.js")]
    fn fixture(input: PathBuf) {
        let graph_snapshot_path = input.with_file_name("graph.snapshot");
        let graph_explained_snapshot_path = input.with_file_name("graph-explained.snapshot");
        let resolved_snapshot_path = input.with_file_name("resolved.snapshot");
        let resolved_explained_snapshot_path = input.with_file_name("resolved-explained.snapshot");

        testing::run_test(false, |cm, handler| {
            let fm = cm.load_file(&input).unwrap();

            let mut m = parse_file_as_program(
                &fm,
                Default::default(),
                EsVersion::latest(),
                None,
                &mut vec![],
            )
            .map_err(|err| err.into_diagnostic(&handler).emit())?;

            let top_level_mark = Mark::fresh(Mark::root());
            m.visit_mut_with(&mut resolver_with_mark(top_level_mark));

            let eval_context = EvalContext::new(&m, top_level_mark);

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

            fn explain_all(values: &Vec<(String, JsValue)>) -> String {
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
                let resolved = named_values
                    .iter()
                    .map(|(id, val)| {
                        let val = val.clone();
                        let start = Instant::now();
                        let mut res = block_on(link(
                            &var_graph,
                            val,
                            &(|val| Box::pin(super::test_utils::visitor(val))),
                            &cache,
                        ))
                        .unwrap();
                        let time = start.elapsed().as_millis();
                        if time > 1 {
                            println!("linking {} {id} took {} ms", input.display(), time);
                        }
                        res.normalize();

                        (id.clone(), res)
                    })
                    .collect::<Vec<_>>();
                let time = start.elapsed().as_millis();
                if time > 1 {
                    println!("linking {} took {} ms", input.display(), time);
                }

                let start = Instant::now();
                let time = start.elapsed().as_millis();
                let explainer = explain_all(&resolved);
                if time > 1 {
                    println!("explaining {} took {} ms", input.display(), time);
                }

                NormalizedOutput::from(explainer)
                    .compare_to_file(&resolved_explained_snapshot_path)
                    .unwrap();
            }

            Ok(())
        })
        .unwrap();
    }
}
