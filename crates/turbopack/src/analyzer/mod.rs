use std::{collections::HashMap, mem::take};

pub(crate) use self::imports::ImportMap;
use swc_common::{collections::AHashSet, Mark};
use swc_ecmascript::{ast::*, utils::ident::IdentLike};

pub mod graph;
mod imports;
pub mod resolver;

/// TODO: Use `Arc`
#[derive(Debug, Clone)]
pub(crate) enum JsValue {
    /// Denotes a single string literal, which does not have any unknown value.
    Constant(Lit),
    Alternatives(Vec<JsValue>),

    Variable(Id),

    /// `foo.${unknownVar}.js` => 'foo' + Unknown + '.js'
    Concat(Vec<JsValue>),

    /// Not analyzable.
    Unknown,
}

impl Default for JsValue {
    fn default() -> Self {
        JsValue::Unknown
    }
}

impl JsValue {
    fn add_alt(&mut self, v: Self) {
        // TODO(kdy1): We don't need nested unknowns

        let l = take(self);

        *self = JsValue::Alternatives(vec![l, v]);
    }

    pub fn normalize(&mut self) {
        // Handle nested
        match self {
            JsValue::Constant(_) | JsValue::Unknown | JsValue::Variable(_) => return,

            JsValue::Alternatives(v) => {
                v.iter_mut().for_each(|v| {
                    v.normalize();
                });

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
                v.iter_mut().for_each(|v| {
                    v.normalize();
                });

                let mut new = vec![];
                for v in take(v) {
                    match v {
                        JsValue::Concat(v) => new.extend(v),
                        v => new.push(v),
                    }
                }
                *v = new;
            }
        }
    }
}

#[derive(Debug)]
pub(crate) struct ModuleData {
    pub values: HashMap<Id, JsValue>,
    pub imports: ImportMap,
}

/// TODO(kdy1): Remove this once resolver distinguish between top-level bindings and unresolved references
/// https://github.com/swc-project/swc/issues/2956
///
/// Once the swc issue is resolved, it means we can know unresolved references just by comparing [Mark]
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
    use std::{path::PathBuf, sync::Arc};

    use swc_common::Mark;
    use swc_ecma_transforms_base::resolver::resolver_with_mark;
    use swc_ecmascript::{
        ast::EsVersion, parser::parse_file_as_module, utils::collect_decls, visit::VisitMutWith,
    };
    use testing::NormalizedOutput;

    use crate::analyzer::ImportMap;

    use super::{
        graph::{create_graph, ModuleInfo},
        resolver::resolve,
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

            let bindings = collect_decls(&m);
            let imports = Arc::new(ImportMap::analyze(&m));

            let var_graph = create_graph(
                &m,
                top_level_mark,
                &ModuleInfo {
                    all_bindings: Arc::new(bindings),
                    imports: imports,
                    dirname: "test-dir".into(),
                    process_env_node: "development".into(),
                },
            );

            {
                // Dump snapshot of graph

                let mut dump = var_graph.values.clone().into_iter().collect::<Vec<_>>();
                dump.sort_by(|a, b| a.0 .0.cmp(&b.0 .0));

                NormalizedOutput::from(format!("{:#?}", dump))
                    .compare_to_file(&graph_snapshot_path)
                    .unwrap();
            }

            {
                // Dump snapshot of resolved

                let mut resolved = vec![];
                for (id, val) in var_graph.values.clone() {
                    let mut res = resolve(&var_graph, val, &mut Default::default());
                    res.value.normalize();

                    resolved.push((id.0.to_string(), res.value));
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
