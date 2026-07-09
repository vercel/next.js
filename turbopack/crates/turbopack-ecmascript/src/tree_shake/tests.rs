use std::{collections::BTreeMap, fmt::Write, hash::Hash, path::PathBuf, sync::Arc};

use anyhow::Error;
use serde::Deserialize;
use swc_core::{
    atoms::{Wtf8Atom, atom},
    common::{
        FileName, Mark, SourceMap, SyntaxContext, comments::SingleThreadedComments,
        util::take::Take,
    },
    ecma::{
        ast::{EsVersion, Id, Module},
        codegen::text_writer::JsWriter,
        parser::{EsSyntax, Syntax, parse_file_as_module, parse_file_as_program},
        visit::VisitMutWith,
    },
    testing::{self, NormalizedOutput, fixture},
};
use turbo_tasks::FxIndexSet;

use super::{
    Analyzer, Key, cjs_script_to_module,
    graph::{
        DepGraph, Dependency, InternedGraph, ItemData, ItemId, ItemIdGroupKind, Mode,
        SplitModuleResult,
    },
    merge::Merger,
};
use crate::references::exports::cjs::analyze_cjs_exports;

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
        let (item_ids, mut items) = g.init(
            &module,
            &comments,
            unresolved_ctxt,
            top_level_ctxt,
            Default::default(),
        );

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

        let uri_of_module = atom!("entry.js").into();

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
    entry_module_uri: &'a Wtf8Atom,
    modules: &'a [Module],
}

impl super::merge::Load for SingleModuleLoader<'_> {
    fn load(&mut self, uri: &Wtf8Atom, chunk_id: u32) -> Result<Option<Module>, Error> {
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

/// A safe CommonJS module, wrapped as a `Module` and analyzed with its CJS
/// exports map, should flow through the tree-shaker and yield one
/// `Key::Export` entrypoint per named export — proving the export map links
/// end-to-end.
#[test]
fn cjs_normalized_module_produces_export_parts() {
    testing::run_test(false, |cm, _handler| {
        let fm = cm.new_source_file(
            FileName::Anon.into(),
            "exports.foo = 1; exports.bar = 2;".to_string(),
        );
        let comments = SingleThreadedComments::default();
        let mut program = parse_file_as_program(
            &fm,
            Syntax::Es(EsSyntax::default()),
            EsVersion::latest(),
            Some(&comments),
            &mut vec![],
        )
        .unwrap();

        let unresolved_mark = Mark::new();
        let top_level_mark = Mark::new();
        let unresolved_ctxt = SyntaxContext::empty().apply_mark(unresolved_mark);
        let top_level_ctxt = SyntaxContext::empty().apply_mark(top_level_mark);
        program.visit_mut_with(&mut swc_core::ecma::transforms::base::resolver(
            unresolved_mark,
            top_level_mark,
            false,
        ));

        let analysis = analyze_cjs_exports(&program, unresolved_mark);
        assert!(!analysis.is_unsafe, "expected an analyzable CJS module");
        let module = cjs_script_to_module(&program).expect("a CJS script should wrap as a module");

        let (mut g, items) = Analyzer::analyze(
            &module,
            &comments,
            unresolved_ctxt,
            top_level_ctxt,
            analysis.exports,
        );
        g.handle_weak(Mode::Production);
        let result = g.split_module(&[], &items);

        assert!(
            result.entrypoints.contains_key(&Key::Export("foo".into())),
            "expected an Export(\"foo\") entrypoint, got {:?}",
            result.entrypoints
        );
        assert!(
            result.entrypoints.contains_key(&Key::Export("bar".into())),
            "expected an Export(\"bar\") entrypoint, got {:?}",
            result.entrypoints
        );

        // The two independent exports must land in *different* parts, and each
        // part must contain only its own export's code — proving an unused
        // export's code is not pulled into another export's part (i.e. it can be
        // dropped when only the sibling is imported).
        let foo_idx = *result.entrypoints.get(&Key::Export("foo".into())).unwrap() as usize;
        let bar_idx = *result.entrypoints.get(&Key::Export("bar".into())).unwrap() as usize;
        assert_ne!(foo_idx, bar_idx, "foo and bar should be in separate parts");

        let foo_part = print(&cm, &[&result.modules[foo_idx]]);
        let bar_part = print(&cm, &[&result.modules[bar_idx]]);

        assert!(
            foo_part.contains("foo") && !foo_part.contains("bar"),
            "foo part is not disjoint from bar:\n{foo_part}"
        );
        assert!(
            bar_part.contains("bar") && !bar_part.contains("foo"),
            "bar part is not disjoint from foo:\n{bar_part}"
        );

        // The whole-module reconstruction (`EcmascriptModuleCjsFacadeModule`)
        // imports from the `Key::Exports` part — it must exist for a CJS split.
        assert!(
            result.entrypoints.contains_key(&Key::Exports),
            "expected an Exports entrypoint, got {:?}",
            result.entrypoints
        );

        Ok(())
    })
    .unwrap();
}

/// Parse `code` as a CommonJS script, wrap it as a `Module`, and run the
/// tree-shaker analysis with its CJS exports map. Returns the dependency
/// graph and per-item data. Mirrors the harness in
/// `cjs_normalized_module_produces_export_parts`.
fn analyze_cjs_source(
    cm: &Arc<SourceMap>,
    code: &str,
) -> (DepGraph, rustc_hash::FxHashMap<ItemId, ItemData>) {
    let fm = cm.new_source_file(FileName::Anon.into(), code.to_string());
    let comments = SingleThreadedComments::default();
    let mut program = parse_file_as_program(
        &fm,
        Syntax::Es(EsSyntax::default()),
        EsVersion::latest(),
        Some(&comments),
        &mut vec![],
    )
    .unwrap();

    let unresolved_mark = Mark::new();
    let top_level_mark = Mark::new();
    let unresolved_ctxt = SyntaxContext::empty().apply_mark(unresolved_mark);
    let top_level_ctxt = SyntaxContext::empty().apply_mark(top_level_mark);
    program.visit_mut_with(&mut swc_core::ecma::transforms::base::resolver(
        unresolved_mark,
        top_level_mark,
        false,
    ));

    let analysis = analyze_cjs_exports(&program, unresolved_mark);
    assert!(!analysis.is_unsafe, "expected an analyzable CJS module");
    let module = cjs_script_to_module(&program).expect("a CJS script should wrap as a module");
    Analyzer::analyze(
        &module,
        &comments,
        unresolved_ctxt,
        top_level_ctxt,
        analysis.exports,
    )
}

/// Locate the synthesized `const __TURBOPACK_cjs_export__<name> = …` item for a
/// CommonJS named export and report whether it's pinned as a module-evaluation
/// side effect. Returns `None` if no such synthesized item exists.
fn cjs_export_side_effects(
    items: &rustc_hash::FxHashMap<ItemId, ItemData>,
    export_name: &str,
) -> Option<bool> {
    let target = format!("__TURBOPACK_cjs_export__{export_name}");
    items.values().find_map(|data| {
        data.var_decls
            .iter()
            .any(|id| id.0.as_str() == target)
            .then_some(data.side_effects)
    })
}

/// An impure export RHS (`exports.x = sideEffect()`) must keep the synthesized
/// export const pinned as a module-evaluation side effect, while pure RHS forms
/// (a literal, a function expression) must not be side effects — so they stay
/// droppable when the export is unused.
#[test]
fn cjs_impure_export_rhs_is_pinned_as_side_effect() {
    testing::run_test(false, |cm, _handler| {
        let (_g, items) = analyze_cjs_source(
            &cm,
            "exports.x = sideEffect(); exports.y = 1; exports.z = function () {};",
        );

        assert_eq!(
            cjs_export_side_effects(&items, "x"),
            Some(true),
            "impure RHS (sideEffect()) must be pinned as a module-evaluation side effect",
        );
        assert_eq!(
            cjs_export_side_effects(&items, "y"),
            Some(false),
            "pure literal RHS must not be a module-evaluation side effect",
        );
        assert_eq!(
            cjs_export_side_effects(&items, "z"),
            Some(false),
            "pure function-expression RHS must not be a module-evaluation side effect",
        );

        Ok(())
    })
    .unwrap();
}

/// A bare statement interleaved between exports (`exports.a = 1; sideEffect();
/// exports.b = 2;`) must be retained as a module-evaluation side effect, and
/// both surrounding pure exports must remain individually addressable
/// entrypoints — preserving evaluation-order semantics.
#[test]
fn cjs_interleaved_side_effect_is_retained() {
    testing::run_test(false, |cm, _handler| {
        let (mut g, items) = analyze_cjs_source(&cm, "exports.a = 1; sideEffect(); exports.b = 2;");

        // The recognized `exports.a`/`exports.b` writes are synthesized into
        // `const` var declarations, so the only remaining bare expression
        // statement item is `sideEffect()`. It must be marked side-effectful so
        // it is retained during module evaluation.
        let interleaved = items
            .values()
            .find(|data| {
                matches!(
                    &data.content,
                    swc_core::ecma::ast::ModuleItem::Stmt(swc_core::ecma::ast::Stmt::Expr(_))
                )
            })
            .expect("the interleaved sideEffect() statement item must exist");
        assert!(
            interleaved.side_effects,
            "the interleaved sideEffect() statement must be retained as a side effect",
        );

        // Both pure exports remain individually addressable entrypoints.
        g.handle_weak(Mode::Production);
        let result = g.split_module(&[], &items);
        assert!(
            result.entrypoints.contains_key(&Key::Export("a".into())),
            "expected an Export(\"a\") entrypoint, got {:?}",
            result.entrypoints
        );
        assert!(
            result.entrypoints.contains_key(&Key::Export("b".into())),
            "expected an Export(\"b\") entrypoint, got {:?}",
            result.entrypoints
        );

        // The surrounding pure exports are themselves not side effects.
        assert_eq!(cjs_export_side_effects(&items, "a"), Some(false));
        assert_eq!(cjs_export_side_effects(&items, "b"), Some(false));

        Ok(())
    })
    .unwrap();
}

/// Pure, unused exports (`exports.foo = 1; exports.bar = 2;`) must not force
/// module evaluation: neither synthesized export const is a module-evaluation
/// side effect, so both can be dropped when unused.
#[test]
fn cjs_pure_unused_exports_are_not_module_evaluation_side_effects() {
    testing::run_test(false, |cm, _handler| {
        let (_g, items) = analyze_cjs_source(&cm, "exports.foo = 1; exports.bar = 2;");

        assert_eq!(
            cjs_export_side_effects(&items, "foo"),
            Some(false),
            "a pure export const must not be a module-evaluation side effect",
        );
        assert_eq!(
            cjs_export_side_effects(&items, "bar"),
            Some(false),
            "a pure export const must not be a module-evaluation side effect",
        );

        Ok(())
    })
    .unwrap();
}
