use std::{
    fmt,
    hash::{BuildHasherDefault, Hash},
};

use indexmap::IndexSet;
use petgraph::{
    algo::{condensation, has_path_connecting},
    graphmap::GraphMap,
    prelude::DiGraphMap,
};
use rustc_hash::{FxHashMap, FxHashSet, FxHasher};
use swc_core::{
    common::{util::take::Take, SyntaxContext, DUMMY_SP},
    ecma::{
        ast::{
            op, ClassDecl, Decl, DefaultDecl, ExportAll, ExportDecl, ExportNamedSpecifier,
            ExportSpecifier, Expr, ExprStmt, FnDecl, Id, Ident, ImportDecl, ImportNamedSpecifier,
            ImportSpecifier, ImportStarAsSpecifier, KeyValueProp, Lit, Module, ModuleDecl,
            ModuleExportName, ModuleItem, NamedExport, ObjectLit, Prop, PropName, PropOrSpread,
            Stmt, VarDecl, VarDeclKind, VarDeclarator,
        },
        atoms::JsWord,
        utils::{find_pat_ids, private_ident, quote_ident},
    },
};
use turbo_tasks::RcStr;

use super::{
    util::{
        collect_top_level_decls, ids_captured_by, ids_used_by, ids_used_by_ignoring_nested, Vars,
    },
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
pub(crate) struct ItemData {
    /// Is the module item hoisted?
    pub is_hoisted: bool,

    /// TOOD(PACK-3166): We can use this field to optimize tree shaking
    #[allow(unused)]
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

impl fmt::Debug for ItemData {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("ItemData")
            .field("is_hoisted", &self.is_hoisted)
            .field("pure", &self.pure)
            .field("var_decls", &self.var_decls)
            .field("read_vars", &self.read_vars)
            .field("eventual_read_vars", &self.eventual_read_vars)
            .field("write_vars", &self.write_vars)
            .field("eventual_write_vars", &self.eventual_write_vars)
            .field("side_effects", &self.side_effects)
            .field("export", &self.export)
            .finish()
    }
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

    pub star_reexports: Vec<ExportAll>,
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
        let groups = self.finalize();
        let mut exports = FxHashMap::default();
        let mut part_deps = FxHashMap::<_, Vec<_>>::default();

        let star_reexports: Vec<_> = data
            .values()
            .filter_map(|v| v.content.as_module_decl()?.as_export_all())
            .cloned()
            .collect();
        let mut modules = vec![];
        let mut exports_module = Module::dummy();

        if groups.graph_ix.is_empty() {
            // If there's no dependency, all nodes are in the module evaluaiotn group.
            modules.push(Module {
                span: DUMMY_SP,
                body: data.values().map(|v| v.content.clone()).collect(),
                shebang: None,
            });
            exports.insert(Key::ModuleEvaluation, 0);
        }

        let mut declarator = FxHashMap::default();

        for (ix, group) in groups.graph_ix.iter().enumerate() {
            for id in group {
                let item = data.get(id).unwrap();

                for var in item.var_decls.iter() {
                    declarator.entry(var.clone()).or_insert_with(|| ix as u32);
                }
            }
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
                .collect::<IndexSet<_>>();

            for item in group {
                if let ItemId::Group(ItemIdGroupKind::Export(id, _)) = item {
                    required_vars.insert(id);
                }
            }

            for id in group {
                let data = data.get(id).unwrap();

                for var in data.var_decls.iter() {
                    required_vars.remove(var);
                }
            }

            for item in group {
                match item {
                    ItemId::Group(ItemIdGroupKind::Export(..)) => {
                        if let Some(export) = &data[item].export {
                            exports.insert(Key::Export(export.as_str().into()), ix as u32);

                            let s = ExportSpecifier::Named(ExportNamedSpecifier {
                                span: DUMMY_SP,
                                orig: ModuleExportName::Ident(Ident::new(export.clone(), DUMMY_SP)),
                                exported: None,
                                is_type_only: false,
                            });
                            exports_module.body.push(ModuleItem::ModuleDecl(
                                ModuleDecl::ExportNamed(NamedExport {
                                    span: DUMMY_SP,
                                    specifiers: vec![s],
                                    src: Some(Box::new(TURBOPACK_PART_IMPORT_SOURCE.into())),
                                    type_only: false,
                                    with: Some(Box::new(create_turbopack_part_id_assert(
                                        PartId::Export(export.to_string().into()),
                                    ))),
                                }),
                            ));
                        }
                    }
                    ItemId::Group(ItemIdGroupKind::ModuleEvaluation) => {
                        exports.insert(Key::ModuleEvaluation, ix as u32);
                    }

                    _ => {}
                }
            }

            // Depend on direct dependencies so that they are executed before this module.
            for dep in groups
                .idx_graph
                .neighbors_directed(ix as u32, petgraph::Direction::Outgoing)
            {
                chunk
                    .body
                    .push(ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                        span: DUMMY_SP,
                        specifiers: vec![],
                        src: Box::new(TURBOPACK_PART_IMPORT_SOURCE.into()),
                        type_only: false,
                        with: Some(Box::new(create_turbopack_part_id_assert(PartId::Internal(
                            dep,
                        )))),
                        phase: Default::default(),
                    })));
            }

            // Import variables
            for var in required_vars {
                let Some(&dep) = declarator.get(var) else {
                    continue;
                };

                if dep == ix as u32 {
                    continue;
                }

                let specifiers = vec![ImportSpecifier::Named(ImportNamedSpecifier {
                    span: DUMMY_SP,
                    local: var.clone().into(),
                    imported: None,
                    is_type_only: false,
                })];

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
                for var in data.var_decls.iter() {
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
                                specifiers: vec![ExportSpecifier::Named(ExportNamedSpecifier {
                                    span: DUMMY_SP,
                                    orig: ModuleExportName::Ident(var.clone().into()),
                                    exported: None,
                                    is_type_only: false,
                                })],
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

            modules.push(chunk);
        }

        exports.insert(Key::Exports, modules.len() as u32);

        for star in &star_reexports {
            exports_module
                .body
                .push(ModuleItem::ModuleDecl(ModuleDecl::ExportAll(star.clone())));
        }

        modules.push(exports_module);

        SplitModuleResult {
            entrypoints: exports,
            part_deps,
            modules,
            star_reexports,
        }
    }

    /// Merges a dependency group between [ModuleItem]s into a dependency graph
    /// of [Module]s.
    ///
    /// Note that [ModuleItem] and [Module] are represented as [ItemId] for
    /// performance.
    pub(super) fn finalize(&self) -> InternedGraph<Vec<ItemId>> {
        let graph = self.g.idx_graph.clone().into_graph::<u32>();

        let condensed = condensation(graph, false);

        let mut new_graph = InternedGraph::default();
        let mut done = FxHashSet::default();

        let mapped = condensed.map(
            |_, node| {
                let mut item_ids = node
                    .iter()
                    .map(|&ix| {
                        done.insert(ix);

                        self.g.graph_ix[ix as usize].clone()
                    })
                    .collect::<Vec<_>>();
                item_ids.sort();

                new_graph.node(&item_ids)
            },
            |_, edge| *edge,
        );

        let map = GraphMap::from_graph(mapped);

        // Insert nodes without any edges

        for node in self.g.graph_ix.iter() {
            let ix = self.g.get_node(node);
            if !done.contains(&ix) {
                let item_ids = vec![node.clone()];
                new_graph.node(&item_ids);
            }
        }

        InternedGraph {
            idx_graph: map,
            graph_ix: new_graph.graph_ix,
        }
    }

    /// Fills information per module items
    pub(super) fn init(
        &mut self,
        module: &Module,
        unresolved_ctxt: SyntaxContext,
        top_level_ctxt: SyntaxContext,
    ) -> (Vec<ItemId>, FxHashMap<ItemId, ItemData>) {
        let top_level_vars = collect_top_level_decls(module);
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
                                local = local.into_private();
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
                            let mut used_ids = if export.decl.is_fn_expr() {
                                ids_used_by_ignoring_nested(
                                    &export.decl,
                                    unresolved_ctxt,
                                    top_level_ctxt,
                                    &top_level_vars,
                                )
                            } else {
                                ids_used_by(
                                    &export.decl,
                                    unresolved_ctxt,
                                    top_level_ctxt,
                                    &top_level_vars,
                                )
                            };
                            used_ids.read.remove(&default_var.to_id());
                            used_ids.write.insert(default_var.to_id());
                            let mut captured_ids = if export.decl.is_fn_expr() {
                                ids_captured_by(
                                    &export.decl,
                                    unresolved_ctxt,
                                    top_level_ctxt,
                                    &top_level_vars,
                                )
                            } else {
                                Vars::default()
                            };
                            captured_ids.read.remove(&default_var.to_id());

                            let data = ItemData {
                                read_vars: used_ids.read,
                                eventual_read_vars: captured_ids.read,
                                write_vars: used_ids.write,
                                eventual_write_vars: captured_ids.write,
                                var_decls: [default_var.to_id()].into_iter().collect(),
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
                                &top_level_vars,
                            );
                            let captured_ids = ids_captured_by(
                                &export.expr,
                                unresolved_ctxt,
                                top_level_ctxt,
                                &top_level_vars,
                            );

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
                        let local = s.local().to_id();
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

                    let vars = ids_used_by(
                        &f.function,
                        unresolved_ctxt,
                        top_level_ctxt,
                        &top_level_vars,
                    );
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

                    let mut vars =
                        ids_used_by(&c.class, unresolved_ctxt, top_level_ctxt, &top_level_vars);
                    let var_decls = {
                        let mut v = IndexSet::with_capacity_and_hasher(1, Default::default());
                        v.insert(c.ident.to_id());
                        v
                    };
                    vars.write.insert(c.ident.to_id());
                    items.insert(
                        id,
                        ItemData {
                            read_vars: vars.read,
                            write_vars: vars.write,
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
                        let mut vars = ids_used_by_ignoring_nested(
                            &decl.init,
                            unresolved_ctxt,
                            top_level_ctxt,
                            &top_level_vars,
                        );
                        let mut eventual_vars = ids_captured_by(
                            &decl.init,
                            unresolved_ctxt,
                            top_level_ctxt,
                            &top_level_vars,
                        );

                        vars.read.retain(|id| !decl_ids.contains(id));
                        eventual_vars.read.retain(|id| !decl_ids.contains(id));

                        let side_effects = vars.found_unresolved;

                        let var_decl = Box::new(VarDecl {
                            decls: vec![decl.clone()],
                            ..*v.clone()
                        });
                        vars.write.extend(decl_ids.iter().cloned());
                        let content = ModuleItem::Stmt(Stmt::Decl(Decl::Var(var_decl)));
                        items.insert(
                            id,
                            ItemData {
                                var_decls: decl_ids.clone().into_iter().collect(),
                                read_vars: vars.read,
                                eventual_read_vars: eventual_vars.read,
                                write_vars: vars.write,
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
                    let mut used_ids = ids_used_by_ignoring_nested(
                        item,
                        unresolved_ctxt,
                        top_level_ctxt,
                        &top_level_vars,
                    );
                    let captured_ids =
                        ids_captured_by(item, unresolved_ctxt, top_level_ctxt, &top_level_vars);

                    if assign.op != op!("=") {
                        let ids_used_by_left = ids_used_by_ignoring_nested(
                            &assign.left,
                            unresolved_ctxt,
                            top_level_ctxt,
                            &top_level_vars,
                        );

                        used_ids.read.extend(used_ids.write.iter().cloned());

                        used_ids.read.extend(ids_used_by_left.read);
                        used_ids.write.extend(ids_used_by_left.write);
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
                    | ModuleDecl::ExportNamed(NamedExport { .. })
                    | ModuleDecl::ExportAll(..),
                ) => {}

                _ => {
                    // Default to normal

                    let used_ids = ids_used_by_ignoring_nested(
                        item,
                        unresolved_ctxt,
                        top_level_ctxt,
                        &top_level_vars,
                    );
                    let captured_ids =
                        ids_captured_by(item, unresolved_ctxt, top_level_ctxt, &top_level_vars);
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
                Some(ModuleExportName::Ident(v)) => v.sym.clone(),
                _ => local.0.clone(),
            };
            let id = ItemId::Group(ItemIdGroupKind::Export(local.clone(), name.clone()));
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
                    read_vars: [local.clone()].into_iter().collect(),
                    export: Some(name),
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

    pub(crate) fn has_dep(&mut self, id: &ItemId, dep: &ItemId, only_strong: bool) -> bool {
        let from = self.g.node(id);
        let to = self.g.node(dep);
        self.g
            .idx_graph
            .edge_weight(from, to)
            .map(|d| matches!(d, Dependency::Strong) || !only_strong)
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
