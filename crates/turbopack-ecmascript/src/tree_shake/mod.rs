use anyhow::{bail, Result};
use indexmap::IndexSet;
use rustc_hash::FxHashMap;
use swc_core::ecma::ast::{Id, Module, Program};
use turbo_tasks::Vc;
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    resolve::{origin::ResolveOrigin, ModulePart},
    source::Source,
};

use self::graph::{DepGraph, ItemData, ItemId, ItemIdGroupKind, Mode, SplitModuleResult};
use crate::{analyzer::graph::EvalContext, parse::ParseResult, EcmascriptModuleAsset};

pub mod asset;
pub mod chunk_item;
mod graph;
pub mod merge;
#[cfg(test)]
mod tests;
mod util;

pub struct Analyzer<'a> {
    g: &'a mut DepGraph,
    item_ids: &'a Vec<ItemId>,
    items: &'a mut FxHashMap<ItemId, ItemData>,

    last_side_effects: Vec<ItemId>,

    vars: FxHashMap<Id, VarState>,
}

#[derive(Debug, Default)]
struct VarState {
    /// The module items that might trigger side effects on that variable.
    /// We also store if this is a `const` write, so no further change will
    /// happen to this var.
    last_writes: Vec<ItemId>,
    /// The module items that might read that variable.
    last_reads: Vec<ItemId>,
}

impl Analyzer<'_> {
    pub(super) fn analyze(module: &Module) -> (DepGraph, FxHashMap<ItemId, ItemData>) {
        let mut g = DepGraph::default();
        let (item_ids, mut items) = g.init(module);

        let mut analyzer = Analyzer {
            g: &mut g,
            item_ids: &item_ids,
            items: &mut items,
            last_side_effects: Default::default(),
            vars: Default::default(),
        };

        let eventual_ids = analyzer.hoist_vars_and_bindings(module);

        analyzer.evaluate_immediate(module, &eventual_ids);

        analyzer.evaluate_eventual(module);

        analyzer.handle_exports(module);

        (g, items)
    }

    /// Phase 1: Hoisted Variables and Bindings
    ///
    ///
    /// Returns all (EVENTUAL_READ/WRITE_VARS) in the module.
    fn hoist_vars_and_bindings(&mut self, _module: &Module) -> IndexSet<Id> {
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
                    if let Some(state) = self.vars.get(id) {
                        self.g.add_strong_deps(item_id, state.last_writes.iter());
                    }
                }

                // For each var in WRITE_VARS:
                for id in item.write_vars.iter() {
                    // Create a weak dependency to all module items listed in
                    // LAST_READS for that var.

                    // (the reads need to be executed before this write, when
                    // it’s needed)

                    if let Some(state) = self.vars.get(id) {
                        self.g.add_weak_deps(item_id, state.last_reads.iter());
                    }
                }

                if item.side_effects {
                    // Create a strong dependency to LAST_SIDE_EFFECT.

                    self.g
                        .add_strong_deps(item_id, self.last_side_effects.iter());

                    // Create weak dependencies to all LAST_WRITES and
                    // LAST_READS.
                    for id in eventual_ids.iter() {
                        if let Some(state) = self.vars.get(id) {
                            self.g.add_weak_deps(item_id, state.last_writes.iter());
                            self.g.add_weak_deps(item_id, state.last_reads.iter());
                        }
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

                    if let Some(state) = self.vars.get(id) {
                        self.g.add_strong_deps(item_id, state.last_writes.iter());
                    }
                }

                // For each var in EVENTUAL_WRITE_VARS:
                for id in item.eventual_write_vars.iter() {
                    // Create a weak dependency to all module items listed in
                    // LAST_READS for that var.

                    if let Some(state) = self.vars.get(id) {
                        self.g.add_weak_deps(item_id, state.last_reads.iter());
                    }
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
                    ItemIdGroupKind::Export(id) => {
                        // Create a strong dependency to LAST_WRITES for this var

                        if let Some(state) = self.vars.get(id) {
                            self.g.add_strong_deps(item_id, state.last_writes.iter());
                        }
                    }
                }
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(crate) enum Key {
    ModuleEvaluation,
    Export(String),
}

/// Converts [Vc<ModulePart>] to the index.
async fn get_part_id(result: &SplitResult, part: Vc<ModulePart>) -> Result<u32> {
    let part = part.await?;

    // TODO implement ModulePart::Facade
    let key = match &*part {
        ModulePart::Evaluation => Key::ModuleEvaluation,
        ModulePart::Export(export) => Key::Export(export.await?.to_string()),
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
            bail!("could not find part id for module part {:?}", key)
        }
    };

    Ok(part_id)
}

#[turbo_tasks::value(shared, serialization = "none", eq = "manual")]
pub(crate) enum SplitResult {
    Ok {
        /// `u32` is a index to `modules`.
        #[turbo_tasks(debug_ignore, trace_ignore)]
        entrypoints: FxHashMap<Key, u32>,

        #[turbo_tasks(debug_ignore, trace_ignore)]
        modules: Vec<Vc<ParseResult>>,

        #[turbo_tasks(debug_ignore, trace_ignore)]
        deps: FxHashMap<u32, Vec<u32>>,
    },
    Unparseable,
    NotFound,
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
pub(super) fn split_module(asset: Vc<EcmascriptModuleAsset>) -> Vc<SplitResult> {
    split(asset.origin_path(), asset.source(), asset.parse())
}

#[turbo_tasks::function]
pub(super) async fn split(
    path: Vc<FileSystemPath>,
    source: Vc<Box<dyn Source>>,
    parsed: Vc<ParseResult>,
) -> Result<Vc<SplitResult>> {
    let filename = path.await?.file_name().to_string();
    let parse_result = parsed.await?;

    match &*parse_result {
        ParseResult::Ok {
            program: Program::Module(module),
            comments,
            eval_context,
            source_map,
            globals,
            ..
        } => {
            let (mut dep_graph, items) = Analyzer::analyze(module);

            dep_graph.handle_weak(Mode::Production);

            let SplitModuleResult {
                entrypoints,
                part_deps,
                modules,
            } = dep_graph.split_module(&format!("./{filename}").into(), &items);

            let modules = modules
                .into_iter()
                .map(|module| {
                    let program = Program::Module(module);
                    let eval_context =
                        EvalContext::new(&program, eval_context.unresolved_mark, Some(source));

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
                entrypoints,
                deps: part_deps,
                modules,
            }
            .cell())
        }
        ParseResult::NotFound => Ok(SplitResult::NotFound.cell()),
        _ => Ok(SplitResult::Unparseable.cell()),
    }
}

#[turbo_tasks::function]
pub(super) async fn part_of_module(
    split_data: Vc<SplitResult>,
    part: Vc<ModulePart>,
) -> Result<Vc<ParseResult>> {
    let split_data = split_data.await?;

    match &*split_data {
        SplitResult::Ok { modules, .. } => {
            let part_id = get_part_id(&split_data, part).await?;

            Ok(modules[part_id as usize])
        }
        SplitResult::Unparseable => Ok(ParseResult::Unparseable.cell()),
        SplitResult::NotFound => Ok(ParseResult::NotFound.cell()),
    }
}
