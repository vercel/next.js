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
    common::{util::take::Take, DUMMY_SP},
    ecma::{
        ast::{
            op, ClassDecl, Decl, ExportDecl, ExportNamedSpecifier, ExportSpecifier, Expr, ExprStmt,
            FnDecl, Id, Ident, ImportDecl, ImportNamedSpecifier, ImportSpecifier, KeyValueProp,
            Lit, Module, ModuleDecl, ModuleExportName, ModuleItem, NamedExport, ObjectLit, Prop,
            PropName, PropOrSpread, Stmt, VarDecl,
        },
        atoms::{js_word, JsWord},
        utils::{find_pat_ids, quote_ident},
    },
};

use super::{
    util::{ids_captured_by, ids_used_by, ids_used_by_ignoring_nested},
    Key,
};

/// The id of an item
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) enum ItemId {
    Group(ItemIdGroupKind),
    Item { index: usize, kind: ItemIdItemKind },
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) enum ItemIdGroupKind {
    ModuleEvaluation,
    Export(Id),
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

    pub export: Option<Id>,
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

#[derive(Debug)]
pub(super) struct VarInfo {}

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
    pub(super) fn split_module(
        &self,
        uri_of_module: &JsWord,
        data: &FxHashMap<ItemId, ItemData>,
    ) -> SplitModuleResult {
        let groups = self.finalize(data);
        let mut exports = FxHashMap::default();
        let mut part_deps = FxHashMap::<_, Vec<_>>::default();

        let mut modules = vec![];

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

            for item in group {
                match item {
                    ItemId::Group(ItemIdGroupKind::Export(id)) => {
                        required_vars.insert(id);

                        if let Some(export) = &data[item].export {
                            exports.insert(Key::Export(export.0.to_string()), ix as u32);
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

                let deps = groups.graph_ix.get_index(dep as usize).unwrap();

                for dep in deps {
                    let data = data.get(dep).unwrap();

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
                        src: Box::new(uri_of_module.clone().into()),
                        type_only: false,
                        asserts: Some(Box::new(create_turbopack_chunk_id_assert(dep))),
                    })));
            }

            for g in group {
                chunk.body.push(data[g].content.clone());
            }

            for g in group {
                let data = data.get(g).unwrap();

                // Emit `export { foo }`
                for var in data.write_vars.iter() {
                    if required_vars.remove(var) {
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
                                    src: None,
                                    type_only: false,
                                    asserts: Some(Box::new(ObjectLit {
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

            let count = global_done
                .iter()
                .filter(|&&staring_point| {
                    has_path_connecting(&self.g.idx_graph, staring_point, ix as _, None)
                })
                .count();

            if count >= 2 {
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
            group.sort()
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
    pub(super) fn init(&mut self, module: &Module) -> (Vec<ItemId>, FxHashMap<ItemId, ItemData>) {
        let mut exports = vec![];
        let mut items = FxHashMap::default();
        let mut ids = vec![];

        for (index, item) in module.body.iter().enumerate() {
            // Fill exports
            if let ModuleItem::ModuleDecl(item) = item {
                match item {
                    ModuleDecl::ExportDecl(item) => match &item.decl {
                        Decl::Fn(FnDecl { ident, .. }) | Decl::Class(ClassDecl { ident, .. }) => {
                            exports.push(ident.to_id());
                        }
                        Decl::Var(v) => {
                            for decl in &v.decls {
                                let ids: Vec<Id> = find_pat_ids(&decl.name);
                                for id in ids {
                                    exports.push(id);
                                }
                            }
                        }
                        _ => {}
                    },
                    ModuleDecl::ExportNamed(NamedExport {
                        src: None,
                        specifiers,
                        ..
                    }) => {
                        // We are not interested in re-exports.
                        for s in specifiers {
                            match s {
                                ExportSpecifier::Named(s) => {
                                    match s.exported.as_ref().unwrap_or(&s.orig) {
                                        ModuleExportName::Ident(i) => {
                                            exports.push(i.to_id());
                                        }
                                        ModuleExportName::Str(..) => {}
                                    }
                                }
                                ExportSpecifier::Default(..) => {
                                    exports.push((js_word!("default"), Default::default()));
                                }
                                ExportSpecifier::Namespace(s) => match &s.name {
                                    ModuleExportName::Ident(i) => {
                                        exports.push(i.to_id());
                                    }
                                    ModuleExportName::Str(..) => {}
                                },
                            }
                        }
                    }
                    ModuleDecl::ExportDefaultDecl(_) | ModuleDecl::ExportDefaultExpr(_) => {
                        exports.push((js_word!("default"), Default::default()));
                    }
                    ModuleDecl::ExportAll(_) => {
                        // noop as this is a reexport.
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

                    let vars = ids_used_by(&f.function);
                    items.insert(
                        id,
                        ItemData {
                            is_hoisted: true,
                            eventual_read_vars: vars.read,
                            eventual_write_vars: vars.write,
                            var_decls: {
                                let mut v =
                                    IndexSet::with_capacity_and_hasher(1, Default::default());
                                v.insert(f.ident.to_id());
                                v
                            },
                            content: ModuleItem::Stmt(Stmt::Decl(Decl::Fn(f.clone()))),
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
                        let vars = ids_used_by_ignoring_nested(&decl.init);
                        let eventual_vars = ids_captured_by(&decl.init);

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
                                ..Default::default()
                            },
                        );
                    }
                }

                ModuleItem::Stmt(Stmt::Expr(ExprStmt {
                    expr: box Expr::Assign(assign),
                    ..
                })) => {
                    let mut used_ids = ids_used_by_ignoring_nested(item);
                    let captured_ids = ids_captured_by(item);

                    if assign.op != op!("=") {
                        let extra_ids = ids_used_by_ignoring_nested(&assign.left);
                        used_ids.read.extend(extra_ids.read);
                        used_ids.write.extend(extra_ids.write);
                    }

                    let data = ItemData {
                        read_vars: used_ids.read,
                        eventual_read_vars: captured_ids.read,
                        write_vars: used_ids.write,
                        eventual_write_vars: captured_ids.write,
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
                _ => {
                    // Default to normal

                    let used_ids = ids_used_by_ignoring_nested(item);
                    let captured_ids = ids_captured_by(item);
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

        for export in exports {
            let id = ItemId::Group(ItemIdGroupKind::Export(export.clone()));
            ids.push(id.clone());
            items.insert(
                id.clone(),
                ItemData {
                    content: ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(NamedExport {
                        span: DUMMY_SP,
                        specifiers: vec![ExportSpecifier::Named(ExportNamedSpecifier {
                            span: DUMMY_SP,
                            orig: ModuleExportName::Ident(export.clone().into()),
                            exported: None,
                            is_type_only: false,
                        })],
                        src: None,
                        type_only: false,
                        asserts: None,
                    })),
                    export: Some(export.clone()),
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
        let mut from_ix = None;

        for to in to {
            let from = *from_ix.get_or_insert_with(|| self.g.node(from));
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
}

const ASSERT_CHUNK_KEY: &str = "__turbopack_chunk__";

fn create_turbopack_chunk_id_assert(dep: u32) -> ObjectLit {
    ObjectLit {
        span: DUMMY_SP,
        props: vec![PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
            key: PropName::Ident(Ident::new(ASSERT_CHUNK_KEY.into(), DUMMY_SP)),
            value: (dep as f64).into(),
        })))],
    }
}

pub(crate) fn find_turbopack_chunk_id_in_asserts(asserts: &ObjectLit) -> Option<u32> {
    asserts.props.iter().find_map(|prop| match prop {
        PropOrSpread::Prop(box Prop::KeyValue(KeyValueProp {
            key: PropName::Ident(key),
            value: box Expr::Lit(Lit::Num(chunk_id)),
        })) if &*key.sym == ASSERT_CHUNK_KEY => Some(chunk_id.value as u32),
        _ => None,
    })
}
