use rustc_hash::FxHashMap;
use swc_core::{
    atoms::Atom,
    ecma::{ast::*, visit::VisitWithAstPath},
};

pub use crate::analyzer::graph::{
    effects::{
        AssignmentScope, AssignmentScopes, ConditionalKind, Effect, EffectArg, EffectsBlock,
    },
    eval_context::EvalContext,
};
use crate::{
    AnalyzeMode,
    analyzer::{JsValue, graph::visitor::Analyzer},
    code_gen::CodeGen,
};

mod effects;
mod eval_context;
mod visitor;

#[derive(Debug)]
pub struct VarGraph {
    pub values: FxHashMap<Id, JsValue>,

    /// Map [`JsValue::FreeVar`] names to their [`Id`] to facilitate lookups into [`Self::values`].
    ///
    /// Doesn't necessarily contain every [`FreeVar`][JsValue::FreeVar], just those who have
    /// non-trivial values.
    pub free_var_ids: FxHashMap<Atom, Id>,

    pub effects: Vec<Effect>,
    // Some unconditional codegens, usually for ESM items.
    pub code_gens: Vec<CodeGen>,
}

impl VarGraph {
    pub fn normalize(&mut self) {
        for value in self.values.values_mut() {
            value.normalize();
        }
        for effect in self.effects.iter_mut() {
            effect.normalize();
        }
    }
}

pub fn create_graph(
    m: &Program,
    eval_context: &EvalContext,
    analyze_mode: AnalyzeMode,
    supports_block_scoping: bool,
) -> VarGraph {
    let mut graph = VarGraph {
        values: Default::default(),
        free_var_ids: Default::default(),
        effects: Default::default(),
        code_gens: Default::default(),
    };

    m.visit_with_ast_path(
        &mut Analyzer {
            analyze_mode,
            data: &mut graph,
            eval_context,
            state: Default::default(),
            effects: Default::default(),
            hoisted_effects: Default::default(),
            code_gens: Default::default(),
            supports_block_scoping,
        },
        &mut Default::default(),
    );

    graph.normalize();

    graph
}
