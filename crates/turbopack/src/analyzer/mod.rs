use std::{fmt::Display, future::Future, mem::take};

use crate::ecmascript::utils::lit_to_string;

pub(crate) use self::imports::ImportMap;
use swc_atoms::JsWord;
use swc_common::{collections::AHashSet, Mark};
use swc_ecmascript::{ast::*, utils::ident::IdentLike};
use url::Url;

pub mod graph;
mod imports;
pub mod linker;
pub mod well_known;

/// TODO: Use `Arc`
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum JsValue {
    /// Denotes a single string literal, which does not have any unknown value.
    ///
    /// TODO: Use a type without span
    Constant(Lit),

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

    // TODO prop should be a JsValue to support dynamic expressions
    /// `(obj, prop)`
    Member(Box<JsValue>, JsWord),

    /// This is a reference to a imported module
    Module(JsWord),

    /// Some kind of well known object
    WellKnownObject(WellKnownObjectKind),

    /// Some kind of well known function
    WellKnownFunction(WellKnownFunctionKind),

    /// Not analyzable.
    Unknown,
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
        JsValue::Unknown
    }
}

impl Display for JsValue {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            JsValue::Constant(lit) => write!(f, "{}", lit_to_string(lit)),
            JsValue::Url(url) => write!(f, "{}", url),
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
            JsValue::Member(obj, prop) => write!(f, "{}.{}", obj, prop),
            JsValue::Module(name) => write!(f, "Module({})", name),
            JsValue::Unknown => write!(f, "???"),
            JsValue::WellKnownObject(obj) => write!(f, "WellKnownObject({:?})", obj),
            JsValue::WellKnownFunction(func) => write!(f, "WellKnownFunction({:?})", func),
        }
    }
}

impl JsValue {
    pub async fn visit_async<'a, F, R, E>(self, visitor: &mut F) -> Result<(Self, bool), E>
    where
        R: 'a + Future<Output = Result<(Self, bool), E>>,
        F: 'a + FnMut(JsValue) -> R,
    {
        let (v, modified) = self.for_each_children_async(visitor).await?;
        let (v, m) = visitor(v).await?;
        if m {
            Ok((v, true))
        } else {
            Ok((v, modified))
        }
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
            JsValue::Alternatives(list) | JsValue::Concat(list) | JsValue::Add(list) => {
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
            JsValue::Member(box obj, _) => {
                let (v, m) = visitor(take(obj)).await?;
                *obj = v;
                (self, m)
            }
            JsValue::Constant(_)
            | JsValue::FreeVar(_)
            | JsValue::Variable(_)
            | JsValue::Module(_)
            | JsValue::Url(_)
            | JsValue::WellKnownObject(_)
            | JsValue::WellKnownFunction(_)
            | JsValue::Unknown => (self, false),
        })
    }

    pub fn visit_mut(&mut self, visitor: &mut impl FnMut(&mut JsValue) -> bool) -> bool {
        let modified = self.for_each_children_mut(visitor);
        if visitor(self) {
            true
        } else {
            modified
        }
    }

    pub fn for_each_children_mut(
        &mut self,
        visitor: &mut impl FnMut(&mut JsValue) -> bool,
    ) -> bool {
        match self {
            JsValue::Alternatives(list) | JsValue::Concat(list) | JsValue::Add(list) => {
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
            JsValue::Member(obj, _) => visitor(obj),
            JsValue::Constant(_)
            | JsValue::FreeVar(_)
            | JsValue::Variable(_)
            | JsValue::Module(_)
            | JsValue::Url(_)
            | JsValue::WellKnownObject(_)
            | JsValue::WellKnownFunction(_)
            | JsValue::Unknown => false,
        }
    }

    pub fn visit(&mut self, visitor: &mut impl FnMut(&JsValue)) {
        self.for_each_children(visitor);
        visitor(self);
    }

    pub fn for_each_children(&self, visitor: &mut impl FnMut(&JsValue)) {
        match self {
            JsValue::Alternatives(list) | JsValue::Concat(list) | JsValue::Add(list) => {
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
            JsValue::Member(obj, _) => {
                visitor(obj);
            }
            JsValue::Constant(_)
            | JsValue::FreeVar(_)
            | JsValue::Variable(_)
            | JsValue::Module(_)
            | JsValue::Url(_)
            | JsValue::WellKnownObject(_)
            | JsValue::WellKnownFunction(_)
            | JsValue::Unknown => {}
        }
    }

    pub fn is_string(&self) -> bool {
        match self {
            JsValue::Constant(Lit::Str(..)) | JsValue::Concat(_) => true,

            JsValue::Constant(..) | JsValue::Url(..) | JsValue::Module(..) => false,

            JsValue::FreeVar(FreeVarKind::Dirname | FreeVarKind::ProcessEnv(..)) => true,
            JsValue::FreeVar(
                FreeVarKind::Require | FreeVarKind::Import | FreeVarKind::RequireResolve,
            ) => false,
            JsValue::FreeVar(FreeVarKind::Other(_)) => false,

            JsValue::Add(v) => v.iter().any(|v| v.is_string()),

            JsValue::Alternatives(v) => v.iter().all(|v| v.is_string()),

            JsValue::Variable(_) | JsValue::Unknown => false,

            JsValue::Call(box JsValue::FreeVar(FreeVarKind::RequireResolve), _) => true,
            JsValue::Call(..) | JsValue::Member(..) => false,
            JsValue::WellKnownObject(_) | JsValue::WellKnownFunction(_) => false,
        }
    }

    fn add_alt(&mut self, v: Self) {
        // TODO(kdy1): We don't need nested unknowns

        let l = take(self);

        *self = JsValue::Alternatives(vec![l, v]);
    }

    pub fn normalize(&mut self) {
        self.for_each_children_mut(&mut |child| {
            child.normalize();
            true
        });
        // Handle nested
        match self {
            JsValue::Alternatives(v) => {
                let mut new = vec![];
                for v in take(v) {
                    match v {
                        JsValue::Alternatives(v) => new.extend(v),
                        v => new.push(v),
                    }
                }
                *v = new;
            }
            JsValue::Concat(v) => {
                // TODO(kdy1): Remove duplicate
                let mut new = vec![];
                for v in take(v) {
                    match v {
                        JsValue::Concat(v) => new.extend(v),
                        v => new.push(v),
                    }
                }
                *v = new;
            }
            JsValue::Add(v) => {
                if v.first().map_or(false, |v| v.is_string()) {
                    // TODO(kdy1): Support non-first addition.
                    let mut new = vec![];
                    for v in take(v) {
                        match v {
                            JsValue::Concat(v) => new.extend(v),
                            // As concat is always string, we can convert it to string
                            JsValue::Add(v) => new.extend(v),
                            v => new.push(v),
                        }
                    }
                    *self = JsValue::Concat(new);
                    return;
                }

                let mut new = vec![];
                for v in take(v) {
                    match v {
                        JsValue::Add(v) => new.extend(v),
                        v => new.push(v),
                    }
                }
                *v = new;
            }
            _ => {}
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FreeVarKind {
    /// `__dirname`
    Dirname,
    /// `process.env.NODE_ENV` => `ProcessEnv("NODE_ENV")`
    ProcessEnv(JsWord),

    /// A reference to global `require`
    Require,

    /// A reference to `import`
    Import,

    /// A reference to global `require.resolve`
    RequireResolve,

    /// `abc` `some_global`
    Other(JsWord),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WellKnownObjectKind {
    PathModule,
    FsModule,
    UrlModule,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WellKnownFunctionKind {
    PathJoin,
    Import,
    Require,
    RequireResolve,
    FsReadMethod(JsWord),
    PathToFileUrl,
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
    use std::{path::PathBuf, sync::Mutex};

    use anyhow::Result;
    use async_std::task::block_on;
    use swc_common::Mark;
    use swc_ecma_transforms_base::resolver::resolver_with_mark;
    use swc_ecmascript::{ast::EsVersion, parser::parse_file_as_module, visit::VisitMutWith};
    use testing::NormalizedOutput;

    use crate::ecmascript::utils::lit_to_string;

    use super::{
        graph::{create_graph, EvalContext},
        linker::{link, LinkCache},
        well_known::replace_well_known,
        FreeVarKind, JsValue, WellKnownFunctionKind, WellKnownObjectKind,
    };

    #[testing::fixture("tests/analyzer/graph/**/input.js")]
    fn fixture(input: PathBuf) {
        let graph_snapshot_path = input.with_file_name("graph.snapshot");
        let resolved_snapshot_path = input.with_file_name("resolved.snapshot");

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

            {
                // Dump snapshot of graph

                let mut dump = var_graph.values.clone().into_iter().collect::<Vec<_>>();
                dump.sort_by(|a, b| a.0 .1.cmp(&b.0 .1));
                dump.sort_by(|a, b| a.0 .0.cmp(&b.0 .0));

                NormalizedOutput::from(format!("{:#?}", dump))
                    .compare_to_file(&graph_snapshot_path)
                    .unwrap();
            }

            {
                // Dump snapshot of resolved

                let mut resolved = vec![];

                async fn visitor(v: JsValue) -> Result<(JsValue, bool)> {
                    Ok((
                        match v {
                            JsValue::Call(
                                box JsValue::WellKnownFunction(
                                    WellKnownFunctionKind::RequireResolve,
                                ),
                                args,
                            ) => match &args[0] {
                                JsValue::Constant(lit) => {
                                    JsValue::Constant((lit_to_string(&lit) + " (resolved)").into())
                                }
                                _ => JsValue::Unknown,
                            },
                            JsValue::FreeVar(FreeVarKind::Require) => {
                                JsValue::WellKnownFunction(WellKnownFunctionKind::Require)
                            }
                            JsValue::FreeVar(FreeVarKind::Dirname) => {
                                JsValue::Constant("__dirname".into())
                            }
                            JsValue::Module(ref name) => match &**name {
                                "path" => JsValue::WellKnownObject(WellKnownObjectKind::PathModule),
                                _ => return Ok((v, false)),
                            },
                            _ => return Ok(replace_well_known(v)),
                        },
                        true,
                    ))
                }

                for ((id, ctx), val) in var_graph.values.iter() {
                    let val = val.clone();
                    let mut res = block_on(link(
                        &var_graph,
                        val,
                        &(|val| Box::pin(visitor(val))),
                        &Mutex::new(LinkCache::new()),
                    ))
                    .unwrap();
                    res.normalize();

                    let unique = var_graph.values.keys().filter(|(i, _)| id == i).count() == 1;
                    if unique {
                        resolved.push((id.to_string(), res));
                    } else {
                        resolved.push((format!("{id}{ctx:?}"), res));
                    }
                }
                resolved.sort_by(|a, b| a.0.cmp(&b.0));

                NormalizedOutput::from(format!("{:#?}", resolved))
                    .compare_to_file(&resolved_snapshot_path)
                    .unwrap();
            }

            Ok(())
        })
        .unwrap();
    }
}
