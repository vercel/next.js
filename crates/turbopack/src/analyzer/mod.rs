use std::{
    collections::HashSet, fmt::Display, future::Future, hash::Hash, mem::take, pin::Pin, sync::Arc,
};

use crate::ecmascript::utils::lit_to_string;

pub(crate) use self::imports::ImportMap;
use indexmap::IndexSet;
use swc_atoms::{js_word, JsWord};
use swc_common::{collections::AHashSet, Mark};
use swc_ecmascript::{ast::*, utils::ident::IdentLike};
use url::Url;

pub mod builtin;
pub mod graph;
mod imports;
pub mod linker;
pub mod well_known;

/// TODO: Use `Arc`
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub enum JsValue {
    /// Denotes a single string literal, which does not have any unknown value.
    ///
    /// TODO: Use a type without span
    Constant(Lit),

    Array(Vec<JsValue>),

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

    /// `obj[prop]`
    Member(Box<JsValue>, Box<JsValue>),

    /// This is a reference to a imported module
    Module(JsWord),

    /// Some kind of well known object
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
        Str::from(v).into()
    }
}

impl From<String> for JsValue {
    fn from(v: String) -> Self {
        Str::from(v).into()
    }
}

impl From<Str> for JsValue {
    fn from(v: Str) -> Self {
        Lit::Str(v).into()
    }
}

impl From<Lit> for JsValue {
    fn from(v: Lit) -> Self {
        JsValue::Constant(v)
    }
}

impl Default for JsValue {
    fn default() -> Self {
        JsValue::Unknown(None, "")
    }
}

impl Display for JsValue {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            JsValue::Constant(lit) => write!(f, "{}", lit_to_string(lit)),
            JsValue::Url(url) => write!(f, "{}", url),
            JsValue::Array(elems) => write!(
                f,
                "[{}]",
                elems
                    .iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(". ")
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
                        JsValue::Constant(Lit::Str(str)) => str.value.to_string(),
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

impl JsValue {
    pub fn explain_args(
        args: &Vec<JsValue>,
        depth: usize,
        unknown_depth: usize,
    ) -> (String, String) {
        let mut hints = Vec::new();
        let explainer = args
            .iter()
            .map(|arg| arg.explain_internal(&mut hints, depth, unknown_depth))
            .collect::<Vec<_>>()
            .join(", ");
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
        let explainer = self.explain_internal(&mut hints, depth, unknown_depth);
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
        depth: usize,
        unknown_depth: usize,
    ) -> String {
        if depth == 0 {
            return "...".to_string();
        }
        let i = hints.len();
        let explainer = self.explain_internal(hints, depth - 1, unknown_depth);
        if explainer.len() < 100 {
            return explainer;
        }
        hints.truncate(i);
        hints.push(String::new());
        hints[i] = format!(
            "- *{}* {}",
            i,
            self.explain_internal(hints, depth - 1, unknown_depth)
        );
        format!("*{}*", i)
    }

    fn explain_internal(
        &self,
        hints: &mut Vec<String>,
        depth: usize,
        unknown_depth: usize,
    ) -> String {
        match self {
            JsValue::Constant(lit) => format!("{}", lit_to_string(lit)),
            JsValue::Array(elems) => format!(
                "[{}]",
                elems
                    .iter()
                    .map(|v| v.explain_internal_inner(hints, depth, unknown_depth))
                    .collect::<Vec<_>>()
                    .join(", ")
            ),
            JsValue::Url(url) => format!("{}", url),
            JsValue::Alternatives(list) => format!(
                "({})",
                list.iter()
                    .map(|v| v.explain_internal_inner(hints, depth, unknown_depth))
                    .collect::<Vec<_>>()
                    .join(" | ")
            ),
            JsValue::FreeVar(FreeVarKind::Other(name)) => format!("FreeVar({})", name),
            JsValue::FreeVar(name) => format!("FreeVar({:?})", name),
            JsValue::Variable(name) => {
                format!("{}", name.0)
            }
            JsValue::Argument(index) => {
                format!("Argument({})", index)
            }
            JsValue::Concat(list) => format!(
                "`{}`",
                list.iter()
                    .map(|v| match v {
                        JsValue::Constant(Lit::Str(str)) => str.value.to_string(),
                        _ => format!(
                            "${{{}}}",
                            v.explain_internal_inner(hints, depth, unknown_depth)
                        ),
                    })
                    .collect::<Vec<_>>()
                    .join("")
            ),
            JsValue::Add(list) => format!(
                "({})",
                list.iter()
                    .map(|v| v.explain_internal_inner(hints, depth, unknown_depth))
                    .collect::<Vec<_>>()
                    .join(" + ")
            ),
            JsValue::Call(callee, list) => {
                format!(
                    "{}({})",
                    callee.explain_internal_inner(hints, depth, unknown_depth),
                    list.iter()
                        .map(|v| v.explain_internal_inner(hints, depth, unknown_depth))
                        .collect::<Vec<_>>()
                        .join(", ")
                )
            }
            JsValue::Member(obj, prop) => {
                format!(
                    "{}[{}]",
                    obj.explain_internal_inner(hints, depth, unknown_depth),
                    prop.explain_internal_inner(hints, depth, unknown_depth)
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
                        inner.explain_internal(hints, depth, unknown_depth - 1),
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
                    WellKnownFunctionKind::ChildProcessSpawn => (
                        format!("child_process.spawn"),
                        "The Node.js child_process.spawn method: https://nodejs.org/api/child_process.html#child_processspawncommand-args-options",
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
                        "(...) => ({})",
                        return_value.explain_internal(hints, depth - 1, unknown_depth)
                    )
                } else {
                    format!("(...) => (...)")
                }
            }
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        if let JsValue::Constant(Lit::Str(str)) = self {
            Some(&*str.value)
        } else {
            None
        }
    }

    pub fn as_word(&self) -> Option<&JsWord> {
        if let JsValue::Constant(Lit::Str(str)) = self {
            Some(&str.value)
        } else {
            None
        }
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

    pub fn visit_async_box<'a, F, R, E>(
        self,
        visitor: &'a mut F,
    ) -> Pin<Box<dyn Future<Output = Result<(Self, bool), E>> + 'a>>
    where
        R: 'a + Future<Output = Result<(Self, bool), E>>,
        F: 'a + FnMut(JsValue) -> R,
        E: 'a,
    {
        Box::pin(self.visit_async(visitor))
    }

    pub async fn visit_each_children_async<'a, F, R, E>(
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
                    let (v, m) = take(item).visit_async_box(visitor).await?;
                    *item = v;
                    if m {
                        modified = true
                    }
                }
                (self, modified)
            }
            JsValue::Call(box callee, list) => {
                let (new_callee, mut modified) = take(callee).visit_async_box(visitor).await?;
                *callee = new_callee;
                for item in list.iter_mut() {
                    let (v, m) = take(item).visit_async_box(visitor).await?;
                    *item = v;
                    if m {
                        modified = true
                    }
                }
                (self, modified)
            }

            JsValue::Function(box return_value) => {
                let (new_return_value, modified) =
                    take(return_value).visit_async_box(visitor).await?;
                *return_value = new_return_value;

                (self, modified)
            }
            JsValue::Member(box obj, box prop) => {
                let (v, m1) = take(obj).visit_async_box(visitor).await?;
                *obj = v;
                let (v, m2) = take(prop).visit_async_box(visitor).await?;
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
            JsValue::Call(callee, list) => {
                let mut modified = visitor(callee);
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
            JsValue::Call(callee, list) => {
                visitor(callee);
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
            JsValue::Constant(Lit::Str(..)) | JsValue::Concat(_) => true,

            JsValue::Constant(..)
            | JsValue::Array(..)
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
            JsValue::Call(..) | JsValue::Member(..) => false,
            JsValue::WellKnownObject(_) | JsValue::WellKnownFunction(_) => false,
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
                    JsValue::Constant(Lit::Str(Str {
                        value: js_word!(""),
                        ..
                    })) => false,
                    _ => true,
                });

                // TODO(kdy1): Remove duplicate
                let mut new = vec![];
                for v in take(v) {
                    match v {
                        JsValue::Concat(v) => new.extend(v),
                        JsValue::Constant(Lit::Str(ref str)) => {
                            if let Some(JsValue::Constant(Lit::Str(last))) = new.last_mut() {
                                *last = [&*last.value, &*str.value].concat().into();
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

    fn similar(&self, other: &JsValue) -> bool {
        fn all_similar(a: &[JsValue], b: &[JsValue]) -> bool {
            if a.len() != b.len() {
                return false;
            }
            a.iter().zip(b.iter()).all(|(a, b)| a.similar(b))
        }
        match (self, other) {
            (JsValue::Constant(l), JsValue::Constant(r)) => l == r,
            (JsValue::Array(l), JsValue::Array(r)) => all_similar(l, r),
            (JsValue::Url(l), JsValue::Url(r)) => l == r,
            (JsValue::Alternatives(l), JsValue::Alternatives(r)) => all_similar(l, r),
            (JsValue::FreeVar(l), JsValue::FreeVar(r)) => l == r,
            (JsValue::Variable(l), JsValue::Variable(r)) => l == r,
            (JsValue::Concat(l), JsValue::Concat(r)) => all_similar(l, r),
            (JsValue::Add(l), JsValue::Add(r)) => all_similar(l, r),
            (JsValue::Call(lf, la), JsValue::Call(rf, ra)) => lf.similar(rf) && all_similar(la, ra),
            (JsValue::Member(lo, lp), JsValue::Member(ro, rp)) => lo.similar(ro) && lp.similar(rp),
            (JsValue::Module(l), JsValue::Module(r)) => l == r,
            (JsValue::WellKnownObject(l), JsValue::WellKnownObject(r)) => l == r,
            (JsValue::WellKnownFunction(l), JsValue::WellKnownFunction(r)) => l == r,
            (JsValue::Unknown(_, l), JsValue::Unknown(_, r)) => l == r,
            (JsValue::Function(l), JsValue::Function(r)) => l.similar(r),
            (JsValue::Argument(l), JsValue::Argument(r)) => l == r,
            _ => false,
        }
    }

    fn similar_hash<H: std::hash::Hasher>(&self, state: &mut H) {
        fn all_similar_hash<H: std::hash::Hasher>(slice: &[JsValue], state: &mut H) {
            for item in slice {
                item.similar_hash(state);
            }
        }

        match self {
            JsValue::Constant(v) => Hash::hash(v, state),
            JsValue::Array(v) => all_similar_hash(v, state),
            JsValue::Url(v) => Hash::hash(v, state),
            JsValue::Alternatives(v) => all_similar_hash(v, state),
            JsValue::FreeVar(v) => Hash::hash(v, state),
            JsValue::Variable(v) => Hash::hash(v, state),
            JsValue::Concat(v) => all_similar_hash(v, state),
            JsValue::Add(v) => all_similar_hash(v, state),
            JsValue::Call(a, b) => {
                a.similar_hash(state);
                all_similar_hash(b, state);
            }
            JsValue::Member(o, p) => {
                o.similar_hash(state);
                p.similar_hash(state);
            }
            JsValue::Module(v) => Hash::hash(v, state),
            JsValue::WellKnownObject(v) => Hash::hash(v, state),
            JsValue::WellKnownFunction(v) => Hash::hash(v, state),
            JsValue::Unknown(_, v) => Hash::hash(v, state),
            JsValue::Function(v) => v.similar_hash(state),
            JsValue::Argument(v) => Hash::hash(v, state),
        }
    }
}

struct SimilarJsValue(JsValue);

impl PartialEq for SimilarJsValue {
    fn eq(&self, other: &Self) -> bool {
        self.0.similar(&other.0)
    }
}

impl Eq for SimilarJsValue {}

impl Hash for SimilarJsValue {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.0.similar_hash(state)
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
    Import,
    Require,
    RequireResolve,
    FsReadMethod(JsWord),
    PathToFileUrl,
    ChildProcessSpawn,
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

#[cfg(test)]
mod tests {
    use std::{
        path::PathBuf,
        sync::{Arc, Mutex},
    };

    use anyhow::Result;
    use async_std::task::block_on;
    use swc_common::Mark;
    use swc_ecma_transforms_base::resolver::resolver_with_mark;
    use swc_ecmascript::{ast::EsVersion, parser::parse_file_as_module, visit::VisitMutWith};
    use testing::NormalizedOutput;

    use crate::{analyzer::builtin::replace_builtin, ecmascript::utils::lit_to_string};

    use super::{
        graph::{create_graph, EvalContext},
        linker::{link, LinkCache},
        well_known::replace_well_known,
        FreeVarKind, JsValue, WellKnownFunctionKind, WellKnownObjectKind,
    };

    #[testing::fixture("tests/analyzer/graph/**/input.js")]
    fn fixture(input: PathBuf) {
        let graph_snapshot_path = input.with_file_name("graph.snapshot");
        let graph_explained_snapshot_path = input.with_file_name("graph-explained.snapshot");
        let resolved_snapshot_path = input.with_file_name("resolved.snapshot");
        let resolved_explained_snapshot_path = input.with_file_name("resolved-explained.snapshot");

        testing::run_test(false, |cm, handler| {
            let fm = cm.load_file(&input).unwrap();

            let mut m = parse_file_as_module(
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
                        let (explainer, hints) = value.explain(usize::MAX, usize::MAX);
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

                async fn visitor(v: JsValue) -> Result<(JsValue, bool)> {
                    Ok((
                        match v {
                            JsValue::Call(
                                box JsValue::WellKnownFunction(
                                    WellKnownFunctionKind::RequireResolve,
                                ),
                                ref args,
                            ) => match &args[0] {
                                JsValue::Constant(lit) => {
                                    JsValue::Constant((lit_to_string(&lit) + " (resolved)").into())
                                }
                                _ => JsValue::Unknown(
                                    Some(Arc::new(v)),
                                    "resolve.resolve non constant",
                                ),
                            },
                            JsValue::FreeVar(FreeVarKind::Require) => {
                                JsValue::WellKnownFunction(WellKnownFunctionKind::Require)
                            }
                            JsValue::FreeVar(FreeVarKind::Dirname) => {
                                JsValue::Constant("__dirname".into())
                            }
                            JsValue::FreeVar(kind) => JsValue::Unknown(
                                Some(Arc::new(JsValue::FreeVar(kind))),
                                "unknown global",
                            ),
                            JsValue::Module(ref name) => match &**name {
                                "path" => JsValue::WellKnownObject(WellKnownObjectKind::PathModule),
                                _ => return Ok((v, false)),
                            },
                            _ => {
                                let (v, m1) = replace_well_known(v);
                                let (v, m2) = replace_builtin(v);
                                return Ok((v, m1 || m2));
                            }
                        },
                        true,
                    ))
                }

                let cache = Mutex::new(LinkCache::new());
                let resolved = named_values
                    .iter()
                    .map(|(id, val)| {
                        let val = val.clone();
                        let mut res = block_on(link(
                            &var_graph,
                            val,
                            &(|val| Box::pin(visitor(val))),
                            &cache,
                        ))
                        .unwrap();
                        res.normalize();

                        (id.clone(), res)
                    })
                    .collect::<Vec<_>>();

                NormalizedOutput::from(format!("{:#?}", resolved))
                    .compare_to_file(&resolved_snapshot_path)
                    .unwrap();
                NormalizedOutput::from(explain_all(&resolved))
                    .compare_to_file(&resolved_explained_snapshot_path)
                    .unwrap();
            }

            Ok(())
        })
        .unwrap();
    }
}
