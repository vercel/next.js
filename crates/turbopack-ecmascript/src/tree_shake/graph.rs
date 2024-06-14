use std::{
    fmt,
    hash::{BuildHasherDefault, Hash},
};

use indexmap::IndexSet;
use petgraph::{
    algo::{has_path_connecting, kosaraju_scc},
    prelude::DiGraphMap,
};
use rustc_hash::{FxHashMap, FxHashSet, FxHasher};
use swc_core::{
    common::{util::take::Take, SyntaxContext, DUMMY_SP},
    ecma::{
        ast::{
            op, ClassDecl, Decl, DefaultDecl, ExportDecl, ExportNamedSpecifier, ExportSpecifier,
            Expr, ExprStmt, FnDecl, Id, Ident, ImportDecl, ImportNamedSpecifier, ImportSpecifier,
            ImportStarAsSpecifier, KeyValueProp, Lit, Module, ModuleDecl, ModuleExportName,
            ModuleItem, NamedExport, ObjectLit, Prop, PropName, PropOrSpread, Stmt, VarDecl,
            VarDeclKind, VarDeclarator,
        },
        atoms::JsWord,
        utils::{find_pat_ids, private_ident, quote_ident, IdentExt},
    },
};
use turbo_tasks::RcStr;

use super::{
    util::{ids_captured_by, ids_used_by, ids_used_by_ignoring_nested},
    Key, TURBOPACK_PART_IMPORT_SOURCE,
};
use crate::magic_identifier;

/// The id of an item
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) enum ItemId {
    Group(ItemIdGroupKind),
    Item { index: usize, kind: ItemIdItemKind },
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) enum ItemIdGroupKind {
    ModuleEvaluation,
    /// `(local, export_name)``
    Export(Id, JsWord),
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) enum ItemIdItemKind {
    Normal,

    ImportOfModule,
    /// Imports are split as multiple items.
    ImportBinding(u32),
    VarDeclarator(u32),
}

impl fmt::Debug for ItemId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ItemId::Group(kind) => {
                write!(f, "ItemId({:?})", kind)
            }
            ItemId::Item { index, kind } => {
                write!(f, "ItemId({}, {:?})", index, kind)
            }
        }
    }
}

type FxBuildHasher = BuildHasherDefault<FxHasher>;

/// Data about a module item
#[derive(Debug)]
pub(crate) struct ItemData {
    /// Is the module item hoisted?
    pub is_hoisted: bool,

    pub pure: bool,

    /// Variables declared or bound by this module item
    pub var_decls: IndexSet<Id, FxBuildHasher>,

    /// Variables read by this module item during evaluation
    pub read_vars: IndexSet<Id, FxBuildHasher>,

    /// Variables read by this module item eventually
    ///
    /// - e.g. variables read in the body of function declarations are
    ///   considered as eventually read
    /// - This is only used when reads are not trigger directly by this module
    ///   item, but require a side effect to be triggered. We don’t know when
    ///   this is executed.
    /// - Note: This doesn’t mean they are only read “after” initial evaluation.
    ///   They might also be read “during” initial evaluation on any module item
    ///   with SIDE_EFFECTS. This kind of interaction is handled by the module
    ///   item with SIDE_EFFECTS.
    pub eventual_read_vars: IndexSet<Id, FxBuildHasher>,

    /// Side effects that are triggered on local variables during evaluation
    pub write_vars: IndexSet<Id, FxBuildHasher>,

    /// Side effects that are triggered on local variables eventually
    pub eventual_write_vars: IndexSet<Id, FxBuildHasher>,

    /// Any other unknown side effects that are trigger during evaluation
    pub side_effects: bool,

    pub content: ModuleItem,

    pub export: Option<JsWord>,
}

impl Default for ItemData {
    fn default() -> Self {
        Self {
            is_hoisted: Default::default(),
            var_decls: Default::default(),
            read_vars: Default::default(),
            eventual_read_vars: Default::default(),
            write_vars: Default::default(),
            eventual_write_vars: Default::default(),
            side_effects: Default::default(),
            content: ModuleItem::dummy(),
            pure: Default::default(),
            export: Default::default(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct InternedGraph<T>
where
    T: Eq + Hash + Clone,
{
    pub(super) idx_graph: DiGraphMap<u32, Dependency>,
    pub(super) graph_ix: IndexSet<T, BuildHasherDefault<FxHasher>>,
}

#[derive(Debug, Clone, Copy)]
pub enum Dependency {
    Strong,
    Weak,
}

impl<T> Default for InternedGraph<T>
where
    T: Eq + Hash + Clone,
{
    fn default() -> Self {
        Self {
            idx_graph: Default::default(),
            graph_ix: Default::default(),
        }
    }
}

impl<T> InternedGraph<T>
where
    T: Eq + Hash + Clone,
{
    pub(super) fn node(&mut self, id: &T) -> u32 {
        self.graph_ix.get_index_of(id).unwrap_or_else(|| {
            let ix = self.graph_ix.len();
            self.graph_ix.insert_full(id.clone());
            ix
        }) as _
    }

    /// Panics if `id` is not found.
    pub(super) fn get_node(&self, id: &T) -> u32 {
        self.graph_ix.get_index_of(id).unwrap() as _
    }
}

#[derive(Debug, Clone, Default)]
pub struct DepGraph {
    pub(super) g: InternedGraph<ItemId>,
}

#[derive(Debug, Clone, Copy)]
pub(super) enum Mode {
    #[allow(dead_code)]
    Development,
    Production,
}

pub(super) struct SplitModuleResult {
    pub entrypoints: FxHashMap<Key, u32>,

    /// Dependency between parts.
    pub part_deps: FxHashMap<u32, Vec<u32>>,
    pub modules: Vec<Module>,
}

impl DepGraph {
    /// Weak imports are imports only if it is referenced strongly. But this
    /// is production-only, and weak dependencies are treated as strong
    /// dependencies in development mode.
    pub(super) fn handle_weak(&mut self, mode: Mode) {
        if !matches!(mode, Mode::Production) {
            return;
        }

        for start in self.g.graph_ix.iter() {
            let start = self.g.get_node(start);
            for end in self.g.graph_ix.iter() {
                let end = self.g.get_node(end);

                if let Some(Dependency::Weak) = self.g.idx_graph.edge_weight(start, end) {
                    self.g.idx_graph.remove_edge(start, end);
                }
            }
        }
    }

    /// Split modules into parts. Additionally, this function adds imports to
    /// _connect_ variables.
    ///
    /// _connect_ here means if a variable is declared in a different part than
    /// a usage side, `import` and `export` will be added.
    ///
    /// Note: ESM imports are immutable, but we do not handle it.
    pub(super) fn split_module(&self, data: &FxHashMap<ItemId, ItemData>) -> SplitModuleResult {
        let groups = self.finalize(data);
        let mut exports = FxHashMap::default();
        let mut part_deps = FxHashMap::<_, Vec<_>>::default();

        let mut modules = vec![];

        if groups.graph_ix.is_empty() {
            // If there's no dependency, all nodes are in the module evaluaiotn group.
            modules.push(Module {
                span: DUMMY_SP,
                body: data.values().map(|v| v.content.clone()).collect(),
                shebang: None,
            });
            exports.insert(Key::ModuleEvaluation, 0);
        }

        for (ix, group) in groups.graph_ix.iter().enumerate() {
            let mut chunk = Module {
                span: DUMMY_SP,
                body: vec![],
                shebang: None,
            };

            let mut required_vars = group
                .iter()
                .flat_map(|id| {
                    let data = data.get(id).unwrap();

                    data.read_vars
                        .iter()
                        .chain(data.write_vars.iter())
                        .chain(data.eventual_read_vars.iter())
                        .chain(data.eventual_write_vars.iter())
                })
                .collect::<FxHashSet<_>>();

            for id in group {
                let data = data.get(id).unwrap();

                for var in data.var_decls.iter() {
                    required_vars.remove(var);
                }
            }

            for item in group {
                match item {
                    ItemId::Group(ItemIdGroupKind::Export(id, _)) => {
                        required_vars.insert(id);

                        if let Some(export) = &data[item].export {
                            exports.insert(Key::Export(export.as_str().into()), ix as u32);
                        }
                    }
                    ItemId::Group(ItemIdGroupKind::ModuleEvaluation) => {
                        exports.insert(Key::ModuleEvaluation, ix as u32);
                    }

                    _ => {}
                }
            }

            for dep in groups
                .idx_graph
                .neighbors_directed(ix as u32, petgraph::Direction::Outgoing)
            {
                let mut specifiers = vec![];

                let dep_items = groups.graph_ix.get_index(dep as usize).unwrap();

                for dep_item in dep_items {
                    let data = data.get(dep_item).unwrap();

                    for var in data.var_decls.iter().chain(data.write_vars.iter()) {
                        if required_vars.remove(var) {
                            specifiers.push(ImportSpecifier::Named(ImportNamedSpecifier {
                                span: DUMMY_SP,
                                local: var.clone().into(),
                                imported: None,
                                is_type_only: false,
                            }));
                        }
                    }
                }

                part_deps.entry(ix as u32).or_default().push(dep);

                chunk
                    .body
                    .push(ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                        span: DUMMY_SP,
                        specifiers,
                        src: Box::new(TURBOPACK_PART_IMPORT_SOURCE.into()),
                        type_only: false,
                        with: Some(Box::new(create_turbopack_part_id_assert(PartId::Internal(
                            dep,
                        )))),
                        phase: Default::default(),
                    })));
            }

            for g in group {
                chunk.body.push(data[g].content.clone());
            }

            for g in group {
                let data = data.get(g).unwrap();

                // Emit `export { foo }`
                for var in data.write_vars.iter() {
                    if required_vars.remove(var)
                        || data.read_vars.contains(var)
                        || data.var_decls.contains(var)
                    {
                        let assertion_prop =
                            PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
                                key: quote_ident!("__turbopack_var__").into(),
                                value: Box::new(true.into()),
                            })));

                        chunk
                            .body
                            .push(ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(
                                NamedExport {
                                    span: DUMMY_SP,
                                    specifiers: vec![ExportSpecifier::Named(
                                        ExportNamedSpecifier {
                                            span: DUMMY_SP,
                                            orig: ModuleExportName::Ident(var.clone().into()),
                                            exported: None,
                                            is_type_only: false,
                                        },
                                    )],
                                    src: if cfg!(test) {
                                        Some(Box::new("__TURBOPACK_VAR__".into()))
                                    } else {
                                        None
                                    },
                                    type_only: false,
                                    with: Some(Box::new(ObjectLit {
                                        span: DUMMY_SP,
                                        props: vec![assertion_prop],
                                    })),
                                },
                            )));
                    }
                }
            }

            modules.push(chunk);
        }

        SplitModuleResult {
            entrypoints: exports,
            part_deps,
            modules,
        }
    }

    /// Merges a dependency group between [ModuleItem]s into a dependency graph
    /// of [Module]s.
    ///
    /// Note that [ModuleItem] and [Module] are represented as [ItemId] for
    /// performance.
    pub(super) fn finalize(
        &self,
        data: &FxHashMap<ItemId, ItemData>,
    ) -> InternedGraph<Vec<ItemId>> {
        /// Returns true if it should be called again
        fn add_to_group(
            graph: &InternedGraph<ItemId>,
            data: &FxHashMap<ItemId, ItemData>,
            group: &mut Vec<ItemId>,
            start_ix: u32,
            global_done: &mut FxHashSet<u32>,
            group_done: &mut FxHashSet<u32>,
        ) -> bool {
            let mut changed = false;

            // Check deps of `start`.
            for dep_ix in graph
                .idx_graph
                .neighbors_directed(start_ix, petgraph::Direction::Outgoing)
            {
                let dep_id = graph.graph_ix.get_index(dep_ix as _).unwrap().clone();

                if global_done.insert(dep_ix)
                    || (data.get(&dep_id).map_or(false, |data| data.pure)
                        && group_done.insert(dep_ix))
                {
                    changed = true;

                    group.push(dep_id);

                    add_to_group(graph, data, group, dep_ix, global_done, group_done);
                }
            }

            changed
        }

        let mut cycles = kosaraju_scc(&self.g.idx_graph);
        cycles.retain(|v| v.len() > 1);

        // If a node have two or more dependents, it should be in a separate
        // group.

        let mut groups = vec![];
        let mut global_done = FxHashSet::default();

        // Module evaluation node and export nodes starts a group
        for id in self.g.graph_ix.iter() {
            let ix = self.g.get_node(id);

            if let ItemId::Group(_) = id {
                groups.push((vec![id.clone()], FxHashSet::default()));
                global_done.insert(ix);
            }
        }

        // Cycles should form a separate group
        for id in self.g.graph_ix.iter() {
            let ix = self.g.get_node(id);

            if let Some(cycle) = cycles.iter().find(|v| v.contains(&ix)) {
                if cycle.iter().all(|v| !global_done.contains(v)) {
                    let ids = cycle
                        .iter()
                        .map(|&ix| self.g.graph_ix[ix as usize].clone())
                        .collect::<Vec<_>>();

                    global_done.extend(cycle.iter().copied());

                    groups.push((ids, Default::default()));
                }
            }
        }

        // Expand **starting** nodes
        for (ix, id) in self.g.graph_ix.iter().enumerate() {
            // If a node is reachable from two or more nodes, it should be in a
            // separate group.

            if global_done.contains(&(ix as u32)) {
                continue;
            }

            // Don't store a pure item in a separate chunk
            if data.get(id).map_or(false, |data| data.pure) {
                continue;
            }

            // The number of nodes that this node is dependent on.
            let dependant_count = self
                .g
                .idx_graph
                .neighbors_directed(ix as _, petgraph::Direction::Incoming)
                .count();

            // The number of starting points that can reach to this node.
            let count_of_startings = global_done
                .iter()
                .filter(|&&staring_point| {
                    has_path_connecting(&self.g.idx_graph, staring_point, ix as _, None)
                })
                .count();

            if dependant_count >= 2 && count_of_startings >= 2 {
                groups.push((vec![id.clone()], FxHashSet::default()));
                global_done.insert(ix as u32);
            }
        }

        loop {
            let mut changed = false;

            for (group, group_done) in &mut groups {
                let start = group[0].clone();
                let start_ix = self.g.get_node(&start);
                changed |=
                    add_to_group(&self.g, data, group, start_ix, &mut global_done, group_done);
            }

            if !changed {
                break;
            }
        }

        let mut groups = groups.into_iter().map(|v| v.0).collect::<Vec<_>>();

        // We need to sort, because we start from the group item and add others start
        // from them. But the final module should be in the order of the original code.
        for group in groups.iter_mut() {
            group.sort();
            group.dedup();
        }

        let mut new_graph = InternedGraph::default();
        let mut group_ix_by_item_ix = FxHashMap::default();

        for group in &groups {
            let group_ix = new_graph.node(group);

            for item in group {
                let item_ix = self.g.get_node(item);
                group_ix_by_item_ix.insert(item_ix, group_ix);
            }
        }

        for group in &groups {
            let group_ix = new_graph.node(group);

            for item in group {
                let item_ix = self.g.get_node(item);

                for item_dep_ix in self
                    .g
                    .idx_graph
                    .neighbors_directed(item_ix, petgraph::Direction::Outgoing)
                {
                    let dep_group_ix = group_ix_by_item_ix.get(&item_dep_ix);
                    if let Some(&dep_group_ix) = dep_group_ix {
                        if group_ix == dep_group_ix {
                            continue;
                        }
                        new_graph
                            .idx_graph
                            .add_edge(group_ix, dep_group_ix, Dependency::Strong);
                    }
                }
            }
        }

        new_graph
    }

    /// Fills information per module items
    pub(super) fn init(
        &mut self,
        module: &Module,
        unresolved_ctxt: SyntaxContext,
        top_level_ctxt: SyntaxContext,
    ) -> (Vec<ItemId>, FxHashMap<ItemId, ItemData>) {
        let mut exports = vec![];
        let mut items = FxHashMap::default();
        let mut ids = vec![];

        for (index, item) in module.body.iter().enumerate() {
            // Fill exports
            if let ModuleItem::ModuleDecl(item) = item {
                match item {
                    ModuleDecl::ExportDecl(item) => match &item.decl {
                        Decl::Fn(FnDecl { ident, .. }) | Decl::Class(ClassDecl { ident, .. }) => {
                            exports.push((ident.to_id(), None));
                        }
                        Decl::Var(v) => {
                            for decl in &v.decls {
                                let ids: Vec<Id> = find_pat_ids(&decl.name);
                                for id in ids {
                                    exports.push((id, None));
                                }
                            }
                        }
                        _ => {}
                    },
                    ModuleDecl::ExportNamed(item) => {
                        if let Some(src) = &item.src {
                            // One item for the import for re-export
                            let id = ItemId::Item {
                                index,
                                kind: ItemIdItemKind::ImportOfModule,
                            };
                            ids.push(id.clone());
                            items.insert(
                                id,
                                ItemData {
                                    is_hoisted: true,
                                    side_effects: true,
                                    content: ModuleItem::ModuleDecl(ModuleDecl::Import(
                                        ImportDecl {
                                            specifiers: Default::default(),
                                            src: src.clone(),
                                            ..ImportDecl::dummy()
                                        },
                                    )),
                                    ..Default::default()
                                },
                            );
                        }

                        for (si, s) in item.specifiers.iter().enumerate() {
                            let (orig, mut local, exported) = match s {
                                ExportSpecifier::Named(s) => (
                                    Some(s.orig.clone()),
                                    match &s.orig {
                                        ModuleExportName::Ident(i) => i.clone(),
                                        ModuleExportName::Str(..) => quote_ident!("_tmp"),
                                    },
                                    Some(s.exported.clone().unwrap_or_else(|| s.orig.clone())),
                                ),
                                ExportSpecifier::Default(s) => (
                                    Some(ModuleExportName::Ident(Ident::new(
                                        "default".into(),
                                        DUMMY_SP,
                                    ))),
                                    quote_ident!("default"),
                                    Some(ModuleExportName::Ident(s.exported.clone())),
                                ),
                                ExportSpecifier::Namespace(s) => (
                                    None,
                                    match &s.name {
                                        ModuleExportName::Ident(i) => i.clone(),
                                        ModuleExportName::Str(..) => quote_ident!("_tmp"),
                                    },
                                    Some(s.name.clone()),
                                ),
                            };

                            if item.src.is_some() {
                                local.sym =
                                    magic_identifier::mangle(&format!("reexport {}", local.sym))
                                        .into();
                                local = local.private();
                            }

                            exports.push((local.to_id(), exported.clone()));

                            if let Some(src) = &item.src {
                                let id = ItemId::Item {
                                    index,
                                    kind: ItemIdItemKind::ImportBinding(si as _),
                                };
                                ids.push(id.clone());

                                let import = match s {
                                    ExportSpecifier::Namespace(..) => {
                                        ImportSpecifier::Namespace(ImportStarAsSpecifier {
                                            span: DUMMY_SP,
                                            local: local.clone(),
                                        })
                                    }
                                    _ => ImportSpecifier::Named(ImportNamedSpecifier {
                                        span: DUMMY_SP,
                                        local: local.clone(),
                                        imported: orig,
                                        is_type_only: false,
                                    }),
                                };
                                items.insert(
                                    id,
                                    ItemData {
                                        is_hoisted: true,
                                        var_decls: [local.to_id()].into_iter().collect(),
                                        pure: true,
                                        content: ModuleItem::ModuleDecl(ModuleDecl::Import(
                                            ImportDecl {
                                                span: DUMMY_SP,
                                                specifiers: vec![import],
                                                src: src.clone(),
                                                type_only: false,
                                                with: None,
                                                phase: Default::default(),
                                            },
                                        )),
                                        ..Default::default()
                                    },
                                );
                            }
                        }
                    }

                    ModuleDecl::ExportDefaultDecl(export) => {
                        let id = match &export.decl {
                            DefaultDecl::Class(c) => c.ident.clone(),
                            DefaultDecl::Fn(f) => f.ident.clone(),
                            DefaultDecl::TsInterfaceDecl(_) => unreachable!(),
                        };

                        let default_var = id.unwrap_or_else(|| {
                            private_ident!(magic_identifier::mangle("default export"))
                        });

                        {
                            let used_ids = ids_used_by_ignoring_nested(
                                &export.decl,
                                unresolved_ctxt,
                                top_level_ctxt,
                            );
                            let captured_ids =
                                ids_captured_by(&export.decl, unresolved_ctxt, top_level_ctxt);
                            let data = ItemData {
                                read_vars: used_ids.read,
                                eventual_read_vars: captured_ids.read,
                                write_vars: used_ids.write,
                                eventual_write_vars: captured_ids.write,
                                var_decls: [default_var.to_id()].into_iter().collect(),
                                side_effects: true,
                                content: ModuleItem::ModuleDecl(item.clone()),
                                ..Default::default()
                            };

                            let id = ItemId::Item {
                                index,
                                kind: ItemIdItemKind::Normal,
                            };
                            ids.push(id.clone());
                            items.insert(id, data);
                        }

                        exports.push((
                            default_var.to_id(),
                            Some(ModuleExportName::Ident(quote_ident!("default"))),
                        ));
                    }
                    ModuleDecl::ExportDefaultExpr(export) => {
                        let default_var =
                            private_ident!(magic_identifier::mangle("default export"));

                        {
                            // For
                            // let __TURBOPACK_default_export__ = expr;

                            let mut used_ids = ids_used_by_ignoring_nested(
                                &export.expr,
                                unresolved_ctxt,
                                top_level_ctxt,
                            );
                            let captured_ids =
                                ids_captured_by(&export.expr, unresolved_ctxt, top_level_ctxt);

                            used_ids.write.insert(default_var.to_id());

                            let data = ItemData {
                                read_vars: used_ids.read,
                                eventual_read_vars: captured_ids.read,
                                write_vars: used_ids.write,
                                eventual_write_vars: captured_ids.write,
                                var_decls: [default_var.to_id()].into_iter().collect(),
                                side_effects: true,
                                content: ModuleItem::Stmt(Stmt::Decl(Decl::Var(Box::new(
                                    VarDecl {
                                        span: DUMMY_SP,
                                        kind: VarDeclKind::Const,
                                        declare: false,
                                        decls: vec![VarDeclarator {
                                            span: DUMMY_SP,
                                            name: default_var.clone().into(),
                                            init: Some(export.expr.clone()),
                                            definite: false,
                                        }],
                                    },
                                )))),
                                ..Default::default()
                            };

                            let id = ItemId::Item {
                                index,
                                kind: ItemIdItemKind::Normal,
                            };
                            ids.push(id.clone());
                            items.insert(id, data);
                        }

                        {
                            // For export default __TURBOPACK__default__export__

                            exports.push((
                                default_var.to_id(),
                                Some(ModuleExportName::Ident(quote_ident!("default"))),
                            ));
                        }
                    }

                    ModuleDecl::ExportAll(item) => {
                        // One item for the import for re-export
                        let id = ItemId::Item {
                            index,
                            kind: ItemIdItemKind::ImportOfModule,
                        };
                        ids.push(id.clone());
                        items.insert(
                            id,
                            ItemData {
                                is_hoisted: true,
                                side_effects: true,
                                content: ModuleItem::ModuleDecl(ModuleDecl::ExportAll(
                                    item.clone(),
                                )),
                                ..Default::default()
                            },
                        );
                    }
                    _ => {}
                }
            }

            match item {
                ModuleItem::ModuleDecl(ModuleDecl::Import(item)) => {
                    // We create multiple items for each import.

                    {
                        // One item for the import itself
                        let id = ItemId::Item {
                            index,
                            kind: ItemIdItemKind::ImportOfModule,
                        };
                        ids.push(id.clone());
                        items.insert(
                            id,
                            ItemData {
                                is_hoisted: true,
                                side_effects: true,
                                content: ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                                    specifiers: Default::default(),
                                    ..item.clone()
                                })),
                                ..Default::default()
                            },
                        );
                    }

                    // One per binding
                    for (si, s) in item.specifiers.iter().enumerate() {
                        let id = ItemId::Item {
                            index,
                            kind: ItemIdItemKind::ImportBinding(si as _),
                        };
                        ids.push(id.clone());
                        let local = match s {
                            ImportSpecifier::Named(s) => s.local.to_id(),
                            ImportSpecifier::Default(s) => s.local.to_id(),
                            ImportSpecifier::Namespace(s) => s.local.to_id(),
                        };
                        items.insert(
                            id,
                            ItemData {
                                is_hoisted: true,
                                var_decls: [local].into_iter().collect(),
                                pure: true,
                                content: ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                                    specifiers: vec![s.clone()],
                                    ..item.clone()
                                })),
                                ..Default::default()
                            },
                        );
                    }
                }

                ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
                    decl: Decl::Fn(f),
                    ..
                }))
                | ModuleItem::Stmt(Stmt::Decl(Decl::Fn(f))) => {
                    let id = ItemId::Item {
                        index,
                        kind: ItemIdItemKind::Normal,
                    };
                    ids.push(id.clone());

                    let vars = ids_used_by(&f.function, unresolved_ctxt, top_level_ctxt);
                    let var_decls = {
                        let mut v = IndexSet::with_capacity_and_hasher(1, Default::default());
                        v.insert(f.ident.to_id());
                        v
                    };
                    items.insert(
                        id,
                        ItemData {
                            is_hoisted: true,
                            eventual_read_vars: vars.read,
                            eventual_write_vars: vars.write,
                            write_vars: var_decls.clone(),
                            var_decls,
                            content: ModuleItem::Stmt(Stmt::Decl(Decl::Fn(f.clone()))),
                            ..Default::default()
                        },
                    );
                }
                ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
                    decl: Decl::Class(c),
                    ..
                }))
                | ModuleItem::Stmt(Stmt::Decl(Decl::Class(c))) => {
                    let id = ItemId::Item {
                        index,
                        kind: ItemIdItemKind::Normal,
                    };
                    ids.push(id.clone());

                    let vars = ids_used_by(&c.class, unresolved_ctxt, top_level_ctxt);
                    let var_decls = {
                        let mut v = IndexSet::with_capacity_and_hasher(1, Default::default());
                        v.insert(c.ident.to_id());
                        v
                    };
                    items.insert(
                        id,
                        ItemData {
                            is_hoisted: true,
                            eventual_read_vars: vars.read,
                            eventual_write_vars: vars.write,
                            write_vars: var_decls.clone(),
                            var_decls,
                            content: ModuleItem::Stmt(Stmt::Decl(Decl::Class(c.clone()))),
                            ..Default::default()
                        },
                    );
                }
                ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(ExportDecl {
                    decl: Decl::Var(v),
                    ..
                }))
                | ModuleItem::Stmt(Stmt::Decl(Decl::Var(v))) => {
                    for (i, decl) in v.decls.iter().enumerate() {
                        let id = ItemId::Item {
                            index,
                            kind: ItemIdItemKind::VarDeclarator(i as _),
                        };
                        ids.push(id.clone());

                        let decl_ids: Vec<Id> = find_pat_ids(&decl.name);
                        let vars = ids_used_by_ignoring_nested(
                            &decl.init,
                            unresolved_ctxt,
                            top_level_ctxt,
                        );
                        let eventual_vars =
                            ids_captured_by(&decl.init, unresolved_ctxt, top_level_ctxt);

                        let side_effects = vars.found_unresolved;

                        let var_decl = Box::new(VarDecl {
                            decls: vec![decl.clone()],
                            ..*v.clone()
                        });
                        let content = ModuleItem::Stmt(Stmt::Decl(Decl::Var(var_decl)));
                        items.insert(
                            id,
                            ItemData {
                                var_decls: decl_ids.clone().into_iter().collect(),
                                read_vars: vars.read,
                                eventual_read_vars: eventual_vars.read,
                                write_vars: decl_ids.into_iter().chain(vars.write).collect(),
                                eventual_write_vars: eventual_vars.write,
                                content,
                                side_effects,
                                ..Default::default()
                            },
                        );
                    }
                }

                ModuleItem::Stmt(Stmt::Expr(ExprStmt {
                    expr: box Expr::Assign(assign),
                    ..
                })) => {
                    let mut used_ids =
                        ids_used_by_ignoring_nested(item, unresolved_ctxt, top_level_ctxt);
                    let captured_ids = ids_captured_by(item, unresolved_ctxt, top_level_ctxt);

                    if assign.op != op!("=") {
                        used_ids.read.extend(used_ids.write.iter().cloned());

                        let extra_ids = ids_used_by_ignoring_nested(
                            &assign.left,
                            unresolved_ctxt,
                            top_level_ctxt,
                        );
                        used_ids.read.extend(extra_ids.read);
                        used_ids.write.extend(extra_ids.write);
                    }

                    let side_effects = used_ids.found_unresolved;

                    let data = ItemData {
                        read_vars: used_ids.read,
                        eventual_read_vars: captured_ids.read,
                        write_vars: used_ids.write,
                        eventual_write_vars: captured_ids.write,
                        content: item.clone(),
                        side_effects,
                        ..Default::default()
                    };

                    let id = ItemId::Item {
                        index,
                        kind: ItemIdItemKind::Normal,
                    };
                    ids.push(id.clone());
                    items.insert(id, data);
                }

                ModuleItem::ModuleDecl(
                    ModuleDecl::ExportDefaultDecl(..)
                    | ModuleDecl::ExportDefaultExpr(..)
                    | ModuleDecl::ExportNamed(NamedExport { .. }),
                ) => {}

                _ => {
                    // Default to normal

                    let used_ids =
                        ids_used_by_ignoring_nested(item, unresolved_ctxt, top_level_ctxt);
                    let captured_ids = ids_captured_by(item, unresolved_ctxt, top_level_ctxt);
                    let data = ItemData {
                        read_vars: used_ids.read,
                        eventual_read_vars: captured_ids.read,
                        write_vars: used_ids.write,
                        eventual_write_vars: captured_ids.write,
                        side_effects: true,
                        content: item.clone(),
                        ..Default::default()
                    };

                    let id = ItemId::Item {
                        index,
                        kind: ItemIdItemKind::Normal,
                    };
                    ids.push(id.clone());
                    items.insert(id, data);
                }
            }
        }

        {
            // `module evaluation side effects` Node
            let id = ItemId::Group(ItemIdGroupKind::ModuleEvaluation);
            ids.push(id.clone());
            items.insert(
                id,
                ItemData {
                    content: ModuleItem::Stmt(Stmt::Expr(ExprStmt {
                        span: DUMMY_SP,
                        expr: "module evaluation".into(),
                    })),
                    ..Default::default()
                },
            );
        }

        for (local, export_name) in exports {
            let name = match &export_name {
                Some(ModuleExportName::Ident(v)) => v.to_id(),
                _ => local.clone(),
            };
            let id = ItemId::Group(ItemIdGroupKind::Export(local.clone(), name.0.clone()));
            ids.push(id.clone());
            items.insert(
                id.clone(),
                ItemData {
                    content: ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(NamedExport {
                        span: DUMMY_SP,
                        specifiers: vec![ExportSpecifier::Named(ExportNamedSpecifier {
                            span: DUMMY_SP,
                            orig: ModuleExportName::Ident(local.clone().into()),
                            exported: export_name,
                            is_type_only: false,
                        })],
                        src: None,
                        type_only: false,
                        with: None,
                    })),
                    export: Some(name.0),
                    ..Default::default()
                },
            );
        }

        (ids, items)
    }

    pub(super) fn add_strong_deps<'a, T>(&mut self, from: &ItemId, to: T)
    where
        T: IntoIterator<Item = &'a ItemId>,
    {
        // This value cannot be lazily initialized because we need to ensure that
        // ModuleEvaluation exists even if there's no side effect.
        let from = self.g.node(from);

        for to in to {
            let to = self.g.node(to);

            self.g.idx_graph.add_edge(from, to, Dependency::Strong);
        }
    }
    pub(super) fn add_weak_deps<'a, T>(&mut self, from: &ItemId, to: T)
    where
        T: IntoIterator<Item = &'a ItemId>,
    {
        let from = self.g.node(from);

        for to in to {
            let to = self.g.node(to);

            if let Some(Dependency::Strong) = self.g.idx_graph.edge_weight(from, to) {
                continue;
            }
            self.g.idx_graph.add_edge(from, to, Dependency::Weak);
        }
    }

    pub(crate) fn has_strong_dep(&mut self, id: &ItemId, dep: &ItemId) -> bool {
        let from = self.g.node(id);
        let to = self.g.node(dep);
        self.g
            .idx_graph
            .edge_weight(from, to)
            .map(|d| matches!(d, Dependency::Strong))
            .unwrap_or(false)
    }

    pub(crate) fn has_path_connecting(&mut self, from: &ItemId, to: &ItemId) -> bool {
        let from = self.g.node(from);
        let to = self.g.node(to);

        has_path_connecting(&self.g.idx_graph, from, to, None)
    }
}

const ASSERT_CHUNK_KEY: &str = "__turbopack_part__";

#[derive(Debug, Clone)]
pub(crate) enum PartId {
    ModuleEvaluation,
    Exports,
    Export(RcStr),
    Internal(u32),
}

pub(crate) fn create_turbopack_part_id_assert(dep: PartId) -> ObjectLit {
    // We can't use quote! as `with` is not standard yet
    ObjectLit {
        span: DUMMY_SP,
        props: vec![PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
            key: PropName::Ident(Ident::new(ASSERT_CHUNK_KEY.into(), DUMMY_SP)),
            value: match dep {
                PartId::ModuleEvaluation => "module evaluation".into(),
                PartId::Exports => "exports".into(),
                PartId::Export(e) => format!("export {e}").into(),
                PartId::Internal(dep) => (dep as f64).into(),
            },
        })))],
    }
}

pub(crate) fn find_turbopack_part_id_in_asserts(asserts: &ObjectLit) -> Option<PartId> {
    asserts.props.iter().find_map(|prop| match prop {
        PropOrSpread::Prop(box Prop::KeyValue(KeyValueProp {
            key: PropName::Ident(key),
            value: box Expr::Lit(Lit::Num(chunk_id)),
        })) if &*key.sym == ASSERT_CHUNK_KEY => Some(PartId::Internal(chunk_id.value as u32)),

        PropOrSpread::Prop(box Prop::KeyValue(KeyValueProp {
            key: PropName::Ident(key),
            value: box Expr::Lit(Lit::Str(s)),
        })) if &*key.sym == ASSERT_CHUNK_KEY => match &*s.value {
            "module evaluation" => Some(PartId::ModuleEvaluation),
            "exports" => Some(PartId::Exports),
            _ => None,
        },
        _ => None,
    })
}
