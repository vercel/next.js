use std::{collections::BTreeMap, fmt::Write, hash::Hash, path::PathBuf, sync::Arc};

use anyhow::Error;
use serde::Deserialize;
use swc_core::{
    atoms::atom,
    common::{Mark, SourceMap, SyntaxContext, comments::SingleThreadedComments, util::take::Take},
    ecma::{
        ast::{EsVersion, Id, Module},
        codegen::text_writer::JsWriter,
        parser::{EsSyntax, parse_file_as_module},
        visit::VisitMutWith,
    },
    testing::{self, NormalizedOutput, fixture},
};
use turbo_tasks::FxIndexSet;

use super::{
    Analyzer, Key,
    graph::{
        DepGraph, Dependency, InternedGraph, ItemId, ItemIdGroupKind, Mode, SplitModuleResult,
    },
    merge::Merger,
};

#[fixture("tests/tree-shaker/analyzer/**/input.js")]
fn test_fixture(input: PathBuf) {
    run(input);
}

#[derive(Deserialize)]
struct TestConfig {
    /// Enabled exports. This is `Vec<Vec<String>>` because we test multiple
    /// exports at once.
    #[serde(default)]
    exports: Vec<Vec<String>>,
}

fn run(input: PathBuf) {
    let config = input.with_file_name("config.json");
    let config = std::fs::read_to_string(config).unwrap_or_else(|_| "{}".into());
    let config = serde_json::from_str::<TestConfig>(&config).unwrap_or_else(|_e| {
        panic!("failed to parse config.json: {config}");
    });

    testing::run_test(false, |cm, _handler| {
        let fm = cm.load_file(&input).unwrap();

        let comments = SingleThreadedComments::default();
        let mut module = parse_file_as_module(
            &fm,
            swc_core::ecma::parser::Syntax::Es(EsSyntax {
                jsx: true,
                ..Default::default()
            }),
            EsVersion::latest(),
            Some(&comments),
            &mut vec![],
        )
        .unwrap();

        let unresolved_mark = Mark::new();
        let top_level_mark = Mark::new();
        let unresolved_ctxt = SyntaxContext::empty().apply_mark(unresolved_mark);
        let top_level_ctxt = SyntaxContext::empty().apply_mark(top_level_mark);

        module.visit_mut_with(&mut swc_core::ecma::transforms::base::resolver(
            unresolved_mark,
            top_level_mark,
            false,
        ));

        let mut g = DepGraph::default();
        let (item_ids, mut items) = g.init(&module, &comments, unresolved_ctxt, top_level_ctxt);

        let mut s = String::new();

        writeln!(s, "# Items\n").unwrap();
        writeln!(s, "Count: {}", item_ids.len()).unwrap();
        writeln!(s).unwrap();

        for (i, id) in item_ids.iter().enumerate() {
            let item = &items[id];

            let (index, kind) = match id {
                ItemId::Group(_) => continue,
                ItemId::Item { index, kind } => (*index, kind),
            };

            writeln!(s, "## Item {}: Stmt {}, `{:?}`", i + 1, index, kind).unwrap();
            writeln!(s, "\n```js\n{}\n```\n", print(&cm, &[&module.body[index]])).unwrap();

            if item.is_hoisted {
                writeln!(s, "- Hoisted").unwrap();
            }

            if item.side_effects {
                writeln!(s, "- Side effects").unwrap();
            }

            let f = |ids: &FxIndexSet<Id>| {
                let mut s = String::new();
                for (i, id) in ids.iter().enumerate() {
                    if i == 0 {
                        write!(s, "`{}`", id.0).unwrap();
                    } else {
                        write!(s, ", `{}`", id.0).unwrap();
                    }
                }
                s
            };

            if !item.var_decls.is_empty() {
                writeln!(s, "- Declares: {}", f(&item.var_decls)).unwrap();
            }

            if !item.read_vars.is_empty() {
                writeln!(s, "- Reads: {}", f(&item.read_vars)).unwrap();
            }

            if !item.eventual_read_vars.is_empty() {
                writeln!(s, "- Reads (eventual): {}", f(&item.eventual_read_vars)).unwrap();
            }

            if !item.write_vars.is_empty() {
                writeln!(s, "- Write: {}", f(&item.write_vars)).unwrap();
            }

            if !item.eventual_write_vars.is_empty() {
                writeln!(s, "- Write (eventual): {}", f(&item.eventual_write_vars)).unwrap();
            }

            writeln!(s).unwrap();
        }

        let mut analyzer = Analyzer {
            g: &mut g,
            item_ids: &item_ids,
            items: &mut items,
            last_side_effects: Default::default(),
            vars: Default::default(),
        };

        let eventual_ids = analyzer.hoist_vars_and_bindings();

        writeln!(s, "# Phase 1").unwrap();
        writeln!(s, "```mermaid\n{}```", render_graph(&item_ids, analyzer.g)).unwrap();

        analyzer.evaluate_immediate(&module, &eventual_ids);

        writeln!(s, "# Phase 2").unwrap();
        writeln!(s, "```mermaid\n{}```", render_graph(&item_ids, analyzer.g)).unwrap();

        analyzer.evaluate_eventual(&module);

        writeln!(s, "# Phase 3").unwrap();
        writeln!(s, "```mermaid\n{}```", render_graph(&item_ids, analyzer.g)).unwrap();

        analyzer.handle_exports(&module);

        writeln!(s, "# Phase 4").unwrap();
        writeln!(s, "```mermaid\n{}```", render_graph(&item_ids, analyzer.g)).unwrap();

        analyzer.handle_explicit_deps();

        let mut condensed = analyzer.g.finalize(analyzer.items);

        writeln!(s, "# Final").unwrap();
        writeln!(
            s,
            "```mermaid\n{}```",
            render_mermaid(&mut condensed, &|buf: &Vec<ItemId>| format!(
                "Items: {buf:?}"
            ))
        )
        .unwrap();

        let uri_of_module = atom!("entry.js");

        let mut describe =
            |is_debug: bool, title: &str, entries: Vec<ItemIdGroupKind>, skip_parts: bool| {
                let mut g = analyzer.g.clone();
                g.handle_weak(if is_debug {
                    Mode::Development
                } else {
                    Mode::Production
                });
                let SplitModuleResult {
                    modules,
                    entrypoints,
                    ..
                } = g.split_module(&[], analyzer.items);

                writeln!(
                    s,
                    "# Entrypoints\n\n```\n{:#?}\n```\n\n",
                    // sort entrypoints for the snapshot
                    entrypoints.iter().collect::<BTreeMap<_, _>>(),
                )
                .unwrap();

                if !skip_parts {
                    writeln!(s, "# Modules ({})", if is_debug { "dev" } else { "prod" }).unwrap();
                    for (i, module) in modules.iter().enumerate() {
                        writeln!(s, "## Part {i}").unwrap();
                        writeln!(s, "```js\n{}\n```", print(&cm, &[module])).unwrap();
                    }
                }

                let mut merger = Merger::new(SingleModuleLoader {
                    modules: &modules,
                    entry_module_uri: &uri_of_module,
                });
                let mut entry = Module::dummy();

                for e in &entries {
                    let key = match e {
                        ItemIdGroupKind::ModuleEvaluation => Key::ModuleEvaluation,
                        ItemIdGroupKind::Export(_, name) => Key::Export(name.as_str().into()),
                    };

                    let index = entrypoints[&key];
                    entry.body.extend(modules[index as usize].body.clone());
                }

                let module = merger.merge_recursively(entry).unwrap();

                writeln!(s, "## Merged ({title})").unwrap();
                writeln!(s, "```js\n{}\n```", print(&cm, &[&module])).unwrap();
            };
        describe(
            true,
            "module eval",
            vec![ItemIdGroupKind::ModuleEvaluation],
            false,
        );
        describe(
            false,
            "module eval",
            vec![ItemIdGroupKind::ModuleEvaluation],
            false,
        );

        for exports in config.exports {
            describe(
                false,
                &exports.join(","),
                exports
                    .into_iter()
                    .map(|e| ItemIdGroupKind::Export(((*e).into(), Default::default()), e.into()))
                    .collect(),
                true,
            );
        }

        NormalizedOutput::from(s)
            .compare_to_file(input.with_file_name("output.md"))
            .unwrap();

        Ok(())
    })
    .unwrap();
}

struct SingleModuleLoader<'a> {
    entry_module_uri: &'a str,
    modules: &'a [Module],
}

impl super::merge::Load for SingleModuleLoader<'_> {
    fn load(&mut self, uri: &str, chunk_id: u32) -> Result<Option<Module>, Error> {
        if self.entry_module_uri == uri {
            return Ok(Some(self.modules[chunk_id as usize].clone()));
        }

        Ok(None)
    }
}

fn print<N: swc_core::ecma::codegen::Node>(cm: &Arc<SourceMap>, nodes: &[&N]) -> String {
    let mut buf = vec![];

    {
        let mut emitter = swc_core::ecma::codegen::Emitter {
            cfg: swc_core::ecma::codegen::Config::default()
                .with_emit_assert_for_import_attributes(true),
            cm: cm.clone(),
            comments: None,
            wr: Box::new(JsWriter::new(cm.clone(), "\n", &mut buf, None)),
        };

        for n in nodes {
            n.emit_with(&mut emitter).unwrap();
        }
    }

    String::from_utf8(buf).unwrap()
}

fn render_graph(item_ids: &[ItemId], g: &mut DepGraph) -> String {
    let mut mermaid = String::from("graph TD\n");

    for id in item_ids.iter() {
        let i = g.g.node(id);

        writeln!(mermaid, "    Item{};", i + 1).unwrap();

        if let Some(item_id) = render_item_id(id) {
            writeln!(mermaid, "    Item{}[\"{}\"];", i + 1, item_id).unwrap();
        }
    }

    for (from, to, kind) in g.g.idx_graph.all_edges() {
        writeln!(
            mermaid,
            "    Item{} -{}-> Item{};",
            from + 1,
            match kind {
                Dependency::Strong => "",
                Dependency::Weak => ".",
            },
            to + 1,
        )
        .unwrap();
    }

    mermaid
}

fn render_mermaid<T>(g: &mut InternedGraph<T>, render: &dyn Fn(&T) -> String) -> String
where
    T: Clone + Eq + Hash,
{
    let mut mermaid = String::from("graph TD\n");
    let ix = g.graph_ix.clone();

    for item in &ix {
        let i = g.node(item);

        writeln!(
            mermaid,
            "    N{}[\"{}\"];",
            i,
            render(item).replace([';', '\n'], "").replace('"', "&quot;")
        )
        .unwrap();
    }

    for (from, to, kind) in g.idx_graph.all_edges() {
        writeln!(
            mermaid,
            "    N{} -{}-> N{};",
            from,
            match kind {
                Dependency::Strong => "",
                Dependency::Weak => ".",
            },
            to,
        )
        .unwrap();
    }

    mermaid
}

fn render_item_id(id: &ItemId) -> Option<String> {
    match id {
        ItemId::Group(ItemIdGroupKind::ModuleEvaluation) => Some("ModuleEvaluation".into()),
        ItemId::Group(ItemIdGroupKind::Export(_, name)) => Some(format!("export {name}")),
        _ => None,
    }
}
