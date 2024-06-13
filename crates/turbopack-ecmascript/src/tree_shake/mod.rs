use std::borrow::Cow;

use anyhow::{bail, Result};
use indexmap::IndexSet;
use rustc_hash::FxHashMap;
use swc_core::{
    common::{util::take::Take, SyntaxContext, DUMMY_SP, GLOBALS},
    ecma::ast::{
        ExportNamedSpecifier, Id, Ident, ImportDecl, Module, ModuleDecl, ModuleExportName,
        ModuleItem, NamedExport, Program,
    },
};
use turbo_tasks::{RcStr, ValueToString, Vc};
use turbopack_core::{ident::AssetIdent, resolve::ModulePart, source::Source};

pub(crate) use self::graph::{
    create_turbopack_part_id_assert, find_turbopack_part_id_in_asserts, PartId,
};
use self::graph::{DepGraph, ItemData, ItemId, ItemIdGroupKind, Mode, SplitModuleResult};
use crate::{analyzer::graph::EvalContext, parse::ParseResult, EcmascriptModuleAsset};

pub mod asset;
pub mod chunk_item;
mod cjs_finder;
mod graph;
pub mod merge;
#[cfg(test)]
mod tests;
mod util;

pub(crate) const TURBOPACK_PART_IMPORT_SOURCE: &str = "__TURBOPACK_PART__";

pub struct Analyzer<'a> {
    g: &'a mut DepGraph,
    item_ids: &'a Vec<ItemId>,
    items: &'a mut FxHashMap<ItemId, ItemData>,

    last_side_effects: Vec<ItemId>,

    vars: FxHashMap<Id, VarState>,
}

#[derive(Debug, Default, Clone)]
struct VarState {
    /// The module items that might trigger side effects on that variable.
    /// We also store if this is a `const` write, so no further change will
    /// happen to this var.
    last_writes: Vec<ItemId>,
    /// The module items that might read that variable.
    last_reads: Vec<ItemId>,
}

fn get_var<'a>(map: &'a FxHashMap<Id, VarState>, id: &Id) -> Cow<'a, VarState> {
    let v = map.get(id);
    match v {
        Some(v) => Cow::Borrowed(v),
        None => Cow::Owned(Default::default()),
    }
}

impl Analyzer<'_> {
    pub(super) fn analyze(
        module: &Module,
        unresolved_ctxt: SyntaxContext,
        top_level_ctxt: SyntaxContext,
    ) -> (DepGraph, FxHashMap<ItemId, ItemData>) {
        let mut g = DepGraph::default();
        let (item_ids, mut items) = g.init(module, unresolved_ctxt, top_level_ctxt);

        let mut analyzer = Analyzer {
            g: &mut g,
            item_ids: &item_ids,
            items: &mut items,
            last_side_effects: Default::default(),
            vars: Default::default(),
        };

        let eventual_ids = analyzer.hoist_vars_and_bindings();

        analyzer.evaluate_immediate(module, &eventual_ids);

        analyzer.evaluate_eventual(module);

        analyzer.handle_exports(module);

        (g, items)
    }

    /// Phase 1: Hoisted Variables and Bindings
    ///
    ///
    /// Returns all (EVENTUAL_READ/WRITE_VARS) in the module.
    fn hoist_vars_and_bindings(&mut self) -> IndexSet<Id> {
        let mut eventual_ids = IndexSet::default();

        for item_id in self.item_ids.iter() {
            if let Some(item) = self.items.get(item_id) {
                eventual_ids.extend(item.eventual_read_vars.iter().cloned());
                eventual_ids.extend(item.eventual_write_vars.iter().cloned());

                if item.is_hoisted && item.side_effects {
                    self.g
                        .add_strong_deps(item_id, self.last_side_effects.iter());

                    self.last_side_effects.push(item_id.clone());
                }

                for id in item.var_decls.iter() {
                    let state = self.vars.entry(id.clone()).or_default();

                    if item.is_hoisted {
                        state.last_writes.push(item_id.clone());
                    } else {
                        // TODO(WEB-705): Create a fake module item
                        // state.last_writes.push(item_id.clone());
                    }
                }
            }
        }

        eventual_ids
    }

    /// Phase 2: Immediate evaluation
    fn evaluate_immediate(&mut self, _module: &Module, eventual_ids: &IndexSet<Id>) {
        for item_id in self.item_ids.iter() {
            if let Some(item) = self.items.get(item_id) {
                // Ignore HOISTED module items, they have been processed in phase 1 already.
                if item.is_hoisted {
                    continue;
                }

                // For each var in READ_VARS:
                for id in item.read_vars.iter() {
                    // Create a strong dependency to all module items listed in LAST_WRITES for that
                    // var.

                    // (the writes need to be executed before this read)
                    let state = get_var(&self.vars, id);

                    self.g.add_strong_deps(item_id, state.last_writes.iter());
                }

                // For each var in WRITE_VARS:
                for id in item.write_vars.iter() {
                    // Create a weak dependency to all module items listed in
                    // LAST_READS for that var.

                    // (the reads need to be executed before this write, when
                    // it’s needed)

                    let state = get_var(&self.vars, id);
                    self.g.add_weak_deps(item_id, state.last_reads.iter());
                }

                if item.side_effects {
                    // Create a strong dependency to LAST_SIDE_EFFECT.

                    self.g
                        .add_strong_deps(item_id, self.last_side_effects.iter());

                    // Create weak dependencies to all LAST_WRITES and
                    // LAST_READS.
                    for id in eventual_ids.iter() {
                        let state = get_var(&self.vars, id);

                        self.g.add_weak_deps(item_id, state.last_writes.iter());
                        self.g.add_weak_deps(item_id, state.last_reads.iter());
                    }
                }

                // For each var in WRITE_VARS:
                for id in item.write_vars.iter() {
                    // Add this module item to LAST_WRITES

                    let state = self.vars.entry(id.clone()).or_default();
                    state.last_writes.push(item_id.clone());

                    // Optimization: Remove each module item to which we
                    // just created a strong dependency from LAST_WRITES

                    state
                        .last_writes
                        .retain(|last_write| !self.g.has_strong_dep(item_id, last_write));

                    // Drop all writes which are not reachable from this item.
                    //
                    // For
                    //
                    // var x = 0
                    // x = 1
                    // x = 2
                    // x += 3
                    //
                    // this will drop `x = 1` as not reachable from `x += 3`.

                    state
                        .last_writes
                        .retain(|last_write| self.g.has_path_connecting(item_id, last_write));
                }

                // For each var in READ_VARS:
                for id in item.read_vars.iter() {
                    // Add this module item to LAST_READS

                    let state = self.vars.entry(id.clone()).or_default();
                    state.last_reads.push(item_id.clone());

                    // Optimization: Remove each module item to which we
                    // have a strong dependency

                    state
                        .last_reads
                        .retain(|last_read| !self.g.has_strong_dep(item_id, last_read));
                }

                if item.side_effects {
                    self.last_side_effects.push(item_id.clone());
                }
            }
        }
    }

    /// Phase 3: Eventual evaluation
    fn evaluate_eventual(&mut self, _module: &Module) {
        for item_id in self.item_ids.iter() {
            if let Some(item) = self.items.get(item_id) {
                // For each var in EVENTUAL_READ_VARS:

                for id in item.eventual_read_vars.iter() {
                    // Create a strong dependency to all module items listed in
                    // LAST_WRITES for that var.

                    let state = get_var(&self.vars, id);
                    self.g.add_strong_deps(item_id, state.last_writes.iter());
                }

                // For each var in EVENTUAL_WRITE_VARS:
                for id in item.eventual_write_vars.iter() {
                    // Create a weak dependency to all module items listed in
                    // LAST_READS for that var.

                    let state = get_var(&self.vars, id);

                    self.g.add_weak_deps(item_id, state.last_reads.iter());
                }

                // (no state update happens, since this is only triggered by
                // side effects, which we already handled)
            }
        }
    }

    /// Phase 4: Exports
    fn handle_exports(&mut self, _module: &Module) {
        for item_id in self.item_ids.iter() {
            if let ItemId::Group(kind) = item_id {
                match kind {
                    ItemIdGroupKind::ModuleEvaluation => {
                        // Create a strong dependency to LAST_SIDE_EFFECTS

                        self.g
                            .add_strong_deps(item_id, self.last_side_effects.iter());
                    }
                    ItemIdGroupKind::Export(local, _) => {
                        // Create a strong dependency to LAST_WRITES for this var

                        let state = get_var(&self.vars, local);

                        self.g.add_strong_deps(item_id, state.last_writes.iter());
                    }
                }
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) enum Key {
    ModuleEvaluation,
    Export(RcStr),
}

/// Converts [Vc<ModulePart>] to the index.
async fn get_part_id(result: &SplitResult, part: Vc<ModulePart>) -> Result<u32> {
    let part = part.await?;

    // TODO implement ModulePart::Facade
    let key = match &*part {
        ModulePart::Evaluation => Key::ModuleEvaluation,
        ModulePart::Export(export) => Key::Export(export.await?.as_str().into()),
        ModulePart::Internal(part_id) => return Ok(*part_id),
        ModulePart::Locals
        | ModulePart::Exports
        | ModulePart::Facade
        | ModulePart::RenamedExport { .. }
        | ModulePart::RenamedNamespace { .. } => {
            bail!("invalid module part")
        }
    };

    let entrypoints = match &result {
        SplitResult::Ok { entrypoints, .. } => entrypoints,
        _ => bail!("split failed"),
    };

    let part_id = match entrypoints.get(&key) {
        Some(id) => *id,
        None => {
            // We need to handle `*` reexports specially.
            if let ModulePart::Export(..) = &*part {
                if let Some(&part_id) = entrypoints.get(&Key::ModuleEvaluation) {
                    return Ok(part_id);
                }
            }

            bail!(
                "could not find part id for module part {:?} in {:?}",
                key,
                entrypoints
            )
        }
    };

    Ok(part_id)
}

#[turbo_tasks::value(shared, serialization = "none", eq = "manual")]
pub(crate) enum SplitResult {
    Ok {
        asset_ident: Vc<AssetIdent>,

        /// `u32` is a index to `modules`.
        #[turbo_tasks(trace_ignore)]
        entrypoints: FxHashMap<Key, u32>,

        #[turbo_tasks(debug_ignore, trace_ignore)]
        modules: Vec<Vc<ParseResult>>,

        #[turbo_tasks(trace_ignore)]
        deps: FxHashMap<u32, Vec<u32>>,
    },
    Failed {
        parse_result: Vc<ParseResult>,
    },
}

impl PartialEq for SplitResult {
    fn eq(&self, other: &Self) -> bool {
        match (self, other) {
            (Self::Ok { .. }, Self::Ok { .. }) => false,
            _ => core::mem::discriminant(self) == core::mem::discriminant(other),
        }
    }
}

#[turbo_tasks::function]
pub(super) async fn split_module(asset: Vc<EcmascriptModuleAsset>) -> Result<Vc<SplitResult>> {
    Ok(split(asset.source().ident(), asset.source(), asset.parse()))
}

#[turbo_tasks::function]
pub(super) async fn split(
    ident: Vc<AssetIdent>,
    source: Vc<Box<dyn Source>>,
    parsed: Vc<ParseResult>,
) -> Result<Vc<SplitResult>> {
    let parse_result = parsed.await?;

    match &*parse_result {
        ParseResult::Ok {
            program,
            comments,
            eval_context,
            source_map,
            globals,
            ..
        } => {
            // If the script file is a common js file, we cannot split the module
            if cjs_finder::contains_cjs(program) {
                return Ok(SplitResult::Failed {
                    parse_result: parsed,
                }
                .cell());
            }

            let module = match program {
                Program::Module(module) => module,
                Program::Script(..) => unreachable!("CJS is already handled"),
            };

            let (mut dep_graph, items) = GLOBALS.set(globals, || {
                Analyzer::analyze(
                    module,
                    SyntaxContext::empty().apply_mark(eval_context.unresolved_mark),
                    SyntaxContext::empty().apply_mark(eval_context.top_level_mark),
                )
            });

            dep_graph.handle_weak(Mode::Production);

            let SplitModuleResult {
                entrypoints,
                part_deps,
                modules,
            } = dep_graph.split_module(&items);

            assert_ne!(modules.len(), 0, "modules.len() == 0;\nModule: {module:?}",);
            assert_eq!(
                entrypoints.get(&Key::ModuleEvaluation),
                Some(&0),
                "ModuleEvaluation is not the first module"
            );

            for &v in entrypoints.values() {
                assert!(
                    v < modules.len() as u32,
                    "Invalid entrypoint '{}' while there are only '{}' modules",
                    v,
                    modules.len()
                );
            }

            let modules = modules
                .into_iter()
                .map(|module| {
                    let program = Program::Module(module);
                    let eval_context = EvalContext::new(
                        &program,
                        eval_context.unresolved_mark,
                        eval_context.top_level_mark,
                        false,
                        Some(source),
                    );

                    ParseResult::cell(ParseResult::Ok {
                        program,
                        globals: globals.clone(),
                        comments: comments.clone(),
                        source_map: source_map.clone(),
                        eval_context,
                    })
                })
                .collect();

            Ok(SplitResult::Ok {
                asset_ident: ident,
                entrypoints,
                deps: part_deps,
                modules,
            }
            .cell())
        }

        _ => Ok(SplitResult::Failed {
            parse_result: parsed,
        }
        .cell()),
    }
}

#[turbo_tasks::function]
pub(super) async fn part_of_module(
    split_data: Vc<SplitResult>,
    part: Vc<ModulePart>,
) -> Result<Vc<ParseResult>> {
    let split_data = split_data.await?;

    match &*split_data {
        SplitResult::Ok {
            asset_ident,
            modules,
            entrypoints,
            deps,
            ..
        } => {
            debug_assert_ne!(modules.len(), 0, "modules.len() == 0");

            if matches!(&*part.await?, ModulePart::Facade) {
                if let ParseResult::Ok {
                    comments,
                    eval_context,
                    globals,
                    source_map,
                    ..
                } = &*modules[0].await?
                {
                    let mut module = Module::dummy();

                    let mut export_names = entrypoints
                        .keys()
                        .filter_map(|key| {
                            if let Key::Export(v) = key {
                                Some(v.clone())
                            } else {
                                None
                            }
                        })
                        .collect::<Vec<_>>();
                    export_names.sort();

                    module
                        .body
                        .push(ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                            span: DUMMY_SP,
                            specifiers: vec![],
                            src: Box::new(TURBOPACK_PART_IMPORT_SOURCE.into()),
                            type_only: false,
                            with: Some(Box::new(create_turbopack_part_id_assert(
                                PartId::ModuleEvaluation,
                            ))),
                            phase: Default::default(),
                        })));

                    let specifiers = export_names
                        .into_iter()
                        .map(|export_name| {
                            swc_core::ecma::ast::ExportSpecifier::Named(ExportNamedSpecifier {
                                span: DUMMY_SP,
                                orig: ModuleExportName::Ident(Ident::new(
                                    export_name.as_str().into(),
                                    DUMMY_SP,
                                )),
                                exported: None,
                                is_type_only: false,
                            })
                        })
                        .collect::<Vec<_>>();

                    module
                        .body
                        .push(ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(
                            NamedExport {
                                span: DUMMY_SP,
                                specifiers,
                                src: Some(Box::new(TURBOPACK_PART_IMPORT_SOURCE.into())),
                                type_only: false,
                                with: Some(Box::new(create_turbopack_part_id_assert(
                                    PartId::Exports,
                                ))),
                            },
                        )));

                    let program = Program::Module(module);
                    let eval_context = EvalContext::new(
                        &program,
                        eval_context.unresolved_mark,
                        eval_context.top_level_mark,
                        true,
                        None,
                    );
                    return Ok(ParseResult::Ok {
                        program,
                        comments: comments.clone(),
                        eval_context,
                        globals: globals.clone(),
                        source_map: source_map.clone(),
                    }
                    .cell());
                } else {
                    unreachable!()
                }
            }

            if matches!(&*part.await?, ModulePart::Exports) {
                if let ParseResult::Ok {
                    comments,
                    eval_context,
                    globals,
                    source_map,
                    ..
                } = &*modules[0].await?
                {
                    let mut export_names = entrypoints
                        .keys()
                        .filter_map(|key| {
                            if let Key::Export(v) = key {
                                Some(v.clone())
                            } else {
                                None
                            }
                        })
                        .collect::<Vec<_>>();
                    export_names.sort();

                    let mut module = Module::dummy();

                    for export_name in export_names {
                        // We can't use quote! as `with` is not standard yet
                        let chunk_prop =
                            create_turbopack_part_id_assert(PartId::Export(export_name.clone()));

                        let specifier =
                            swc_core::ecma::ast::ExportSpecifier::Named(ExportNamedSpecifier {
                                span: DUMMY_SP,
                                orig: ModuleExportName::Ident(Ident::new(
                                    export_name.as_str().into(),
                                    DUMMY_SP,
                                )),
                                exported: None,
                                is_type_only: false,
                            });
                        module
                            .body
                            .push(ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(
                                NamedExport {
                                    span: DUMMY_SP,
                                    specifiers: vec![specifier],
                                    src: Some(Box::new(TURBOPACK_PART_IMPORT_SOURCE.into())),
                                    type_only: false,
                                    with: Some(Box::new(chunk_prop)),
                                },
                            )));
                    }

                    let program = Program::Module(module);
                    let eval_context = EvalContext::new(
                        &program,
                        eval_context.unresolved_mark,
                        eval_context.top_level_mark,
                        true,
                        None,
                    );
                    return Ok(ParseResult::Ok {
                        program,
                        comments: comments.clone(),
                        eval_context,
                        globals: globals.clone(),
                        source_map: source_map.clone(),
                    }
                    .cell());
                } else {
                    unreachable!()
                }
            }

            let part_id = get_part_id(&split_data, part).await?;

            if part_id as usize >= modules.len() {
                bail!(
                    "part_id is out of range: {part_id} >= {}; asset = {}; entrypoints = \
                     {entrypoints:?}: part_deps = {deps:?}",
                    asset_ident.to_string().await?,
                    modules.len(),
                );
            }

            Ok(modules[part_id as usize])
        }
        SplitResult::Failed { parse_result } => Ok(*parse_result),
    }
}
