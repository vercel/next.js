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
    analyzer::{Bump, JsValue, graph::visitor::Analyzer},
    code_gen::CodeGen,
};

mod effects;
mod eval_context;
mod visitor;

#[derive(Debug)]
pub struct VarGraph<'a> {
    pub values: FxHashMap<Id, JsValue<'a>>,

    /// Map [`JsValue::FreeVar`] names to their [`Id`] to facilitate lookups into [`Self::values`].
    ///
    /// Doesn't necessarily contain every [`FreeVar`][JsValue::FreeVar], just those who have
    /// non-trivial values.
    pub free_var_ids: FxHashMap<Atom, Id>,

    pub effects: Vec<Effect<'a>>,
    // Some unconditional codegens, usually for ESM items.
    pub code_gens: Vec<CodeGen>,
}

impl<'a> VarGraph<'a> {
    pub fn normalize(&mut self, arena: &'a Bump) {
        for value in self.values.values_mut() {
            value.normalize(arena);
        }
        for effect in self.effects.iter_mut() {
            effect.normalize(arena);
        }
    }
}

pub fn create_graph<'a>(
    arena: &'a Bump,
    m: &Program,
    eval_context: &EvalContext,
    analyze_mode: AnalyzeMode,
    supports_block_scoping: bool,
) -> VarGraph<'a> {
    let mut analyzer = Analyzer {
        arena,
        analyze_mode,
        data: VarGraph {
            values: Default::default(),
            free_var_ids: Default::default(),
            effects: Default::default(),
            code_gens: Default::default(),
        },
        eval_context,
        state: Default::default(),
        effects: Default::default(),
        hoisted_effects: Default::default(),
        code_gens: Default::default(),
        supports_block_scoping,
    };

    m.visit_with_ast_path(&mut analyzer, &mut Default::default());

    let mut graph = analyzer.data;
    graph.normalize(arena);

    graph
}
