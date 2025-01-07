use std::{fmt, hash::Hash};

use petgraph::{
    algo::{condensation, has_path_connecting},
    graph::NodeIndex,
    graphmap::GraphMap,
    prelude::DiGraphMap,
    visit::EdgeRef,
    Direction, Graph,
};
use rustc_hash::{FxHashMap, FxHashSet};
use swc_core::{
    common::{comments::Comments, util::take::Take, Spanned, SyntaxContext, DUMMY_SP},
    ecma::{
        ast::{
            op, ClassDecl, Decl, DefaultDecl, EsReserved, ExportAll, ExportDecl,
            ExportNamedSpecifier, ExportSpecifier, Expr, ExprStmt, FnDecl, Id, Ident, IdentName,
            ImportDecl, ImportNamedSpecifier, ImportSpecifier, ImportStarAsSpecifier, KeyValueProp,
            Lit, Module, ModuleDecl, ModuleExportName, ModuleItem, NamedExport, ObjectLit, Prop,
            PropName, PropOrSpread, Stmt, Str, VarDecl, VarDeclKind, VarDeclarator,
        },
        atoms::JsWord,
        utils::{find_pat_ids, private_ident, quote_ident, ExprCtx, ExprExt},
    },
};
use turbo_rcstr::RcStr;
use turbo_tasks::FxIndexSet;

use super::{
    util::{
        collect_top_level_decls, ids_captured_by, ids_used_by, ids_used_by_ignoring_nested, Vars,
    },
    Key, TURBOPACK_PART_IMPORT_SOURCE,
};
use crate::{magic_identifier, tree_shake::optimizations::GraphOptimizer};

const FLAG_DISABLE_EXPORT_MERGING: &str = "TURBOPACK_DISABLE_EXPORT_MERGING";
/// The id of an item
#[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub(crate) enum ItemId {
    Item { index: usize, kind: ItemIdItemKind },
    Group(ItemIdGroupKind),
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

/// Data about a module item
pub(crate) struct ItemData {
    /// Is the module item hoisted?
    pub is_hoisted: bool,

    /// TOOD(PACK-3166): We can use this field to optimize tree shaking
    #[allow(unused)]
    pub pure: bool,

    /// Variables declared or bound by this module item
    pub var_decls: FxIndexSet<Id>,

    /// Variables read by this module item during evaluation
    pub read_vars: FxIndexSet<Id>,

    /// Variables read by this module item eventually
    ///
    /// - e.g. variables read in the body of function declarations are considered as eventually
    ///   read
    /// - This is only used when reads are not trigger directly by this module item, but require a
    ///   side effect to be triggered. We don’t know when this is executed.
    /// - Note: This doesn’t mean they are only read “after” initial evaluation. They might also be
    ///   read “during” initial evaluation on any module item with SIDE_EFFECTS. This kind of
    ///   interaction is handled by the module item with SIDE_EFFECTS.
    pub eventual_read_vars: FxIndexSet<Id>,

    /// Side effects that are triggered on local variables during evaluation
    pub write_vars: FxIndexSet<Id>,

    /// Side effects that are triggered on local variables eventually
    pub eventual_write_vars: FxIndexSet<Id>,

    /// Any other unknown side effects that are trigger during evaluation
    pub side_effects: bool,

    pub content: ModuleItem,

    pub export: Option<JsWord>,

    /// This value denotes the module specifier of the [ImportDecl] that declares this
    /// [ItemId].
    ///
    /// Used to optimize `ImportBinding`.
    pub binding_source: Option<(Str, ImportSpecifier)>,

    /// Explicit dependencies of this item.
    ///
    /// Used to depend from import binding to side-effect-import without additional analysis.
    ///
    /// - Note: ImportBinding should depend on actual import statements because those imports may
    ///   have side effects.
    ///
    /// See https://github.com/vercel/next.js/pull/71234#issuecomment-2409810084 for the problematic
    /// test case.
    pub explicit_deps: Vec<ItemId>,

    /// Server actions breaks when we merge exports.
    pub disable_export_merging: bool,
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
            .field("explicit_deps", &self.explicit_deps)
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
            binding_source: Default::default(),
            explicit_deps: Default::default(),
            disable_export_merging: Default::default(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct InternedGraph<T>
where
    T: Eq + Hash + Clone,
{
    pub(super) idx_graph: DiGraphMap<u32, Dependency>,
    pub(super) graph_ix: FxIndexSet<T>,
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
    pub part_deps: FxHashMap<u32, Vec<PartId>>,
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
    pub(super) fn split_module(
        &mut self,
        directives: &[ModuleItem],
        data: &FxHashMap<ItemId, ItemData>,
    ) -> SplitModuleResult {
        let groups = self.finalize(data);
        let mut outputs = FxHashMap::default();
        let mut part_deps = FxHashMap::<_, Vec<PartId>>::default();

        let star_reexports: Vec<_> = data
            .values()
            .filter_map(|v| v.content.as_module_decl()?.as_export_all())
            .cloned()
            .collect();
        let mut modules = vec![];
        let mut exports_module = Module::dummy();
        exports_module.body.extend(directives.iter().cloned());

        if groups.graph_ix.is_empty() {
            // If there's no dependency, all nodes are in the module evaluaiotn group.
            modules.push(Module {
                span: DUMMY_SP,
                body: data.values().map(|v| v.content.clone()).collect(),
                shebang: None,
            });
            outputs.insert(Key::ModuleEvaluation, 0);
        }

        // See https://github.com/vercel/next.js/pull/71234#issuecomment-2409810084
        // ImportBinding should depend on actual import statements because those imports may have
        // side effects.
        let mut importer = FxHashMap::default();
        let mut declarator = FxHashMap::default();

        for (ix, group) in groups.graph_ix.iter().enumerate() {
            for id in group {
                let item = data.get(id).unwrap();

                for var in item.var_decls.iter() {
                    declarator.entry(var.clone()).or_insert_with(|| ix as u32);
                }

                if let ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                    specifiers,
                    src,
                    ..
                })) = &item.content
                {
                    if specifiers.is_empty() {
                        importer.insert(src.value.clone(), ix as u32);
                    }
                }
            }
        }

        let mut mangle_count = 0;
        let mut mangled_vars = FxHashMap::default();
        let mut mangle = |var: &Id| {
            mangled_vars
                .entry(var.clone())
                .or_insert_with(|| encode_base54(&mut mangle_count, true))
                .clone()
        };

        for (ix, group) in groups.graph_ix.iter().enumerate() {
            let mut chunk = Module {
                span: DUMMY_SP,
                body: directives.to_vec(),
                shebang: None,
            };
            let mut part_deps_done = FxHashSet::default();

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
                .collect::<FxIndexSet<_>>();

            for id in group {
                let data = data.get(id).unwrap();

                for var in data.var_decls.iter() {
                    required_vars.swap_remove(var);
                }

                // Depend on import statements from 'ImportBinding'
                if let ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                    specifiers,
                    src,
                    ..
                })) = &data.content
                {
                    if !specifiers.is_empty() {
                        if let Some(dep) = importer.get(&src.value) {
                            if *dep != ix as u32 && part_deps_done.insert(*dep) {
                                part_deps
                                    .entry(ix as u32)
                                    .or_default()
                                    .push(PartId::Internal(*dep, true));

                                chunk.body.push(ModuleItem::ModuleDecl(ModuleDecl::Import(
                                    ImportDecl {
                                        span: DUMMY_SP,
                                        specifiers: vec![],
                                        src: Box::new(TURBOPACK_PART_IMPORT_SOURCE.into()),
                                        type_only: false,
                                        with: Some(Box::new(create_turbopack_part_id_assert(
                                            PartId::Internal(*dep, true),
                                        ))),
                                        phase: Default::default(),
                                    },
                                )));
                            }
                        }
                    }
                }
            }

            for item in group {
                match item {
                    ItemId::Group(ItemIdGroupKind::Export(..)) => {
                        if let Some(export) = &data[item].export {
                            outputs.insert(Key::Export(export.as_str().into()), ix as u32);

                            let s = ExportSpecifier::Named(ExportNamedSpecifier {
                                span: DUMMY_SP,
                                orig: ModuleExportName::Ident(Ident::new(
                                    export.clone(),
                                    DUMMY_SP,
                                    Default::default(),
                                )),
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
                                        PartId::Export(export.as_str().into()),
                                    ))),
                                }),
                            ));
                        }
                    }
                    ItemId::Group(ItemIdGroupKind::ModuleEvaluation) => {
                        outputs.insert(Key::ModuleEvaluation, ix as u32);
                    }

                    _ => {}
                }
            }

            for dep in groups
                .idx_graph
                .neighbors_directed(ix as u32, Direction::Outgoing)
            {
                if dep == ix as u32 {
                    continue;
                }

                let dep_item_ids = groups.graph_ix.get_index(dep as usize).unwrap();

                for dep_item_id in dep_item_ids {
                    let ItemId::Group(ItemIdGroupKind::Export(var, export)) = dep_item_id else {
                        continue;
                    };

                    if !export.starts_with("$$RSC_SERVER_") {
                        continue;
                    }

                    required_vars.swap_remove(var);

                    let dep_part_id = PartId::Export(export.as_str().into());
                    let specifiers = vec![ImportSpecifier::Named(ImportNamedSpecifier {
                        span: DUMMY_SP,
                        local: var.clone().into(),
                        imported: None,
                        is_type_only: false,
                    })];

                    part_deps
                        .entry(ix as u32)
                        .or_default()
                        .push(dep_part_id.clone());

                    chunk
                        .body
                        .push(ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                            span: DUMMY_SP,
                            specifiers,
                            src: Box::new(TURBOPACK_PART_IMPORT_SOURCE.into()),
                            type_only: false,
                            with: Some(Box::new(create_turbopack_part_id_assert(dep_part_id))),
                            phase: Default::default(),
                        })));
                }
            }

            // Import variables
            for &var in &required_vars {
                let Some(&dep) = declarator.get(var) else {
                    continue;
                };

                if dep == ix as u32 {
                    continue;
                }

                part_deps_done.insert(dep);

                let dep_item_ids = groups.graph_ix.get_index(dep as usize).unwrap();

                // Optimization & workaround for `ImportBinding` fragments.
                // Instead of importing the import binding fragment, we import the original module.
                // In this way, we can preserve the import statement so that the other code analysis
                // can work.
                if dep_item_ids.len() == 1 {
                    let dep_item_id = &dep_item_ids[0];
                    let dep_item_data = data.get(dep_item_id).unwrap();

                    if let Some((module_specifier, import_specifier)) =
                        &dep_item_data.binding_source
                    {
                        // Preserve the order of the side effects by importing the
                        // side-effect-import fragment first.

                        if let Some(import_dep) = importer.get(&module_specifier.value) {
                            if *import_dep != ix as u32 {
                                part_deps
                                    .entry(ix as u32)
                                    .or_default()
                                    .push(PartId::Internal(*import_dep, true));

                                chunk.body.push(ModuleItem::ModuleDecl(ModuleDecl::Import(
                                    ImportDecl {
                                        span: DUMMY_SP,
                                        specifiers: vec![],
                                        src: Box::new(TURBOPACK_PART_IMPORT_SOURCE.into()),
                                        type_only: false,
                                        with: Some(Box::new(create_turbopack_part_id_assert(
                                            PartId::Internal(*import_dep, true),
                                        ))),
                                        phase: Default::default(),
                                    },
                                )));
                            }
                        }

                        let specifiers = vec![import_specifier.clone()];

                        part_deps_done.insert(dep);

                        chunk
                            .body
                            .push(ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                                span: DUMMY_SP,
                                specifiers,
                                src: Box::new(module_specifier.clone()),
                                type_only: false,
                                with: None,
                                phase: Default::default(),
                            })));
                        continue;
                    }
                }

                let specifiers = vec![ImportSpecifier::Named(ImportNamedSpecifier {
                    span: DUMMY_SP,
                    local: var.clone().into(),
                    imported: Some(ModuleExportName::Ident(Ident::new_no_ctxt(
                        mangle(var),
                        DUMMY_SP,
                    ))),
                    is_type_only: false,
                })];

                part_deps
                    .entry(ix as u32)
                    .or_default()
                    .push(PartId::Internal(dep, false));

                chunk
                    .body
                    .push(ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                        span: DUMMY_SP,
                        specifiers,
                        src: Box::new(TURBOPACK_PART_IMPORT_SOURCE.into()),
                        type_only: false,
                        with: Some(Box::new(create_turbopack_part_id_assert(PartId::Internal(
                            dep, false,
                        )))),
                        phase: Default::default(),
                    })));
            }

            // Depend on direct dependencies so that they are executed before this module.
            for dep in groups
                .idx_graph
                .neighbors_directed(ix as u32, petgraph::Direction::Outgoing)
            {
                if dep == ix as u32 {
                    continue;
                }

                if !part_deps_done.insert(dep) {
                    continue;
                }

                part_deps
                    .entry(ix as u32)
                    .or_default()
                    .push(PartId::Internal(dep, true));

                chunk
                    .body
                    .push(ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                        span: DUMMY_SP,
                        specifiers: vec![],
                        src: Box::new(TURBOPACK_PART_IMPORT_SOURCE.into()),
                        type_only: false,
                        with: Some(Box::new(create_turbopack_part_id_assert(PartId::Internal(
                            dep, true,
                        )))),
                        phase: Default::default(),
                    })));
            }

            for g in group {
                // Skip directives, as we copy them to each modules.
                if let ModuleItem::Stmt(Stmt::Expr(ExprStmt {
                    expr: box Expr::Lit(Lit::Str(s)),
                    ..
                })) = &data[g].content
                {
                    if s.value.starts_with("use ") {
                        continue;
                    }
                }

                // Do not store export * in internal part fragments.
                if let ModuleItem::ModuleDecl(ModuleDecl::ExportAll(export)) = &data[g].content {
                    // Preserve side effects of import caused by export *
                    chunk
                        .body
                        .push(ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
                            span: export.span,
                            specifiers: Default::default(),
                            src: export.src.clone(),
                            type_only: false,
                            with: export.with.clone(),
                            phase: Default::default(),
                        })));
                    continue;
                }

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
                                    exported: Some(ModuleExportName::Ident(Ident::new_no_ctxt(
                                        mangle(var),
                                        DUMMY_SP,
                                    ))),
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

        outputs.insert(Key::Exports, modules.len() as u32);

        for star in &star_reexports {
            exports_module
                .body
                .push(ModuleItem::ModuleDecl(ModuleDecl::ExportAll(star.clone())));
        }

        modules.push(exports_module);

        SplitModuleResult {
            entrypoints: outputs,
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
    pub(super) fn finalize(
        &mut self,
        data: &FxHashMap<ItemId, ItemData>,
    ) -> InternedGraph<Vec<ItemId>> {
        let mut graph = self.g.idx_graph.clone().into_graph::<u32>();

        self.workaround_server_action(&mut graph, data);

        let mut condensed = condensation(graph, true);

        let optimizer = GraphOptimizer {
            graph_ix: &self.g.graph_ix,
            data,
        };
        loop {
            if !optimizer.merge_single_incoming_nodes(&mut condensed) {
                break;
            }
        }

        let mut new_graph = InternedGraph::default();

        // Sort the items to match the order of the original code.
        for node in condensed.node_weights() {
            let mut item_ids = node
                .iter()
                .map(|&ix| self.g.graph_ix[ix as usize].clone())
                .collect::<Vec<_>>();
            item_ids.sort();

            debug_assert!(!item_ids.is_empty());

            new_graph.node(&item_ids);
        }

        new_graph.graph_ix.sort_by(|a, b| a[0].cmp(&b[0]));

        debug_assert_eq!(new_graph.idx_graph.node_count(), 0);
        debug_assert_eq!(new_graph.idx_graph.edge_count(), 0);

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
                if data[node].pure {
                    continue;
                }

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
        comments: &dyn Comments,
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
                            exports.push((
                                ident.to_id(),
                                ident.sym.clone(),
                                comments.has_flag(ident.span().lo, FLAG_DISABLE_EXPORT_MERGING),
                            ));
                        }
                        Decl::Var(v) => {
                            for decl in &v.decls {
                                let disable_export_merging = comments
                                    .has_flag(decl.name.span().lo, FLAG_DISABLE_EXPORT_MERGING)
                                    || decl.init.as_deref().is_some_and(|e| {
                                        comments.has_flag(e.span().lo, FLAG_DISABLE_EXPORT_MERGING)
                                    });

                                let ids: Vec<Id> = find_pat_ids(&decl.name);
                                for id in ids {
                                    exports.push((id.clone(), id.0, disable_export_merging));
                                }
                            }
                        }
                        _ => {}
                    },
                    ModuleDecl::ExportNamed(item) => {
                        let import_id = if let Some(src) = &item.src {
                            // One item for the import for re-export
                            let import_id = ItemId::Item {
                                index,
                                kind: ItemIdItemKind::ImportOfModule,
                            };
                            ids.push(import_id.clone());
                            items.insert(
                                import_id.clone(),
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

                            Some(import_id)
                        } else {
                            None
                        };

                        for (si, s) in item.specifiers.iter().enumerate() {
                            let (orig, mut local, exported) = match s {
                                ExportSpecifier::Named(s) => (
                                    Some(s.orig.clone()),
                                    match &s.orig {
                                        ModuleExportName::Ident(i) => i.clone(),
                                        ModuleExportName::Str(..) => quote_ident!("_tmp").into(),
                                    },
                                    s.exported.clone().unwrap_or_else(|| s.orig.clone()),
                                ),
                                ExportSpecifier::Default(s) => (
                                    Some(ModuleExportName::Ident(Ident::new(
                                        "default".into(),
                                        DUMMY_SP,
                                        Default::default(),
                                    ))),
                                    quote_ident!("default").into(),
                                    ModuleExportName::Ident(s.exported.clone()),
                                ),
                                ExportSpecifier::Namespace(s) => (
                                    None,
                                    match &s.name {
                                        ModuleExportName::Ident(i) => i.clone(),
                                        ModuleExportName::Str(..) => quote_ident!("_tmp").into(),
                                    },
                                    s.name.clone(),
                                ),
                            };

                            if item.src.is_some() {
                                local.sym =
                                    magic_identifier::mangle(&format!("reexport {}", local.sym))
                                        .into();
                                local = local.into_private();
                            }

                            exports.push((local.to_id(), exported.atom().clone(), false));

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
                                        explicit_deps: vec![import_id.clone().unwrap()],
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
                            used_ids.read.swap_remove(&default_var.to_id());
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
                            captured_ids.read.swap_remove(&default_var.to_id());

                            let data = ItemData {
                                read_vars: used_ids.read,
                                eventual_read_vars: captured_ids.read,
                                write_vars: used_ids.write,
                                eventual_write_vars: captured_ids.write,
                                var_decls: [default_var.to_id()].into_iter().collect(),
                                content: ModuleItem::Stmt(Stmt::Decl(match &export.decl {
                                    DefaultDecl::Class(c) => Decl::Class(ClassDecl {
                                        ident: default_var.clone(),
                                        declare: false,
                                        class: c.class.clone(),
                                    }),
                                    DefaultDecl::Fn(f) => Decl::Fn(FnDecl {
                                        ident: default_var.clone(),
                                        declare: false,
                                        function: f.function.clone(),
                                    }),
                                    DefaultDecl::TsInterfaceDecl(_) => unreachable!(),
                                })),
                                ..Default::default()
                            };
                            let id = ItemId::Item {
                                index,
                                kind: ItemIdItemKind::Normal,
                            };
                            ids.push(id.clone());
                            items.insert(id, data);
                        }

                        exports.push((default_var.to_id(), "default".into(), false));
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
                                        decls: vec![VarDeclarator {
                                            span: DUMMY_SP,
                                            name: default_var.clone().into(),
                                            init: Some(export.expr.clone()),
                                            definite: false,
                                        }],
                                        ..Default::default()
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

                            exports.push((default_var.to_id(), "default".into(), false));
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

                    // One item for the import itself
                    let import_id = ItemId::Item {
                        index,
                        kind: ItemIdItemKind::ImportOfModule,
                    };
                    ids.push(import_id.clone());
                    items.insert(
                        import_id.clone(),
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
                                binding_source: if item.with.is_none() {
                                    // Optimize by directly binding to the source
                                    Some((*item.src.clone(), s.clone()))
                                } else {
                                    None
                                },
                                explicit_deps: vec![import_id.clone()],
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
                        let mut v = FxIndexSet::with_capacity_and_hasher(1, Default::default());
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
                        let mut v = FxIndexSet::with_capacity_and_hasher(1, Default::default());
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

                        let has_explicit_pure = match &decl.init {
                            Some(e) => comments.has_flag(e.span().lo, "PURE"),
                            _ => false,
                        };

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

                        let side_effects = !has_explicit_pure
                            && (vars.found_unresolved
                                || decl.init.as_deref().is_some_and(|e| {
                                    e.may_have_side_effects(&ExprCtx {
                                        unresolved_ctxt,
                                        is_unresolved_ref_safe: false,
                                        in_strict: false,
                                    })
                                }));

                        let var_decl = Box::new(VarDecl {
                            decls: vec![decl.clone()],
                            ..*v.clone()
                        });
                        vars.write.extend(decl_ids.iter().cloned());
                        let content = ModuleItem::Stmt(Stmt::Decl(Decl::Var(var_decl)));

                        items.insert(
                            id,
                            ItemData {
                                pure: has_explicit_pure,
                                var_decls: decl_ids.clone().into_iter().collect(),
                                read_vars: vars.read,
                                write_vars: if has_explicit_pure {
                                    Default::default()
                                } else {
                                    vars.write
                                },
                                eventual_read_vars: eventual_vars.read,
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

        for (local, export_name, disable_export_merging) in exports {
            let id = ItemId::Group(ItemIdGroupKind::Export(local.clone(), export_name.clone()));
            ids.push(id.clone());
            items.insert(
                id.clone(),
                ItemData {
                    content: ModuleItem::ModuleDecl(ModuleDecl::ExportNamed(NamedExport {
                        span: DUMMY_SP,
                        specifiers: vec![ExportSpecifier::Named(ExportNamedSpecifier {
                            span: DUMMY_SP,
                            orig: ModuleExportName::Ident(local.clone().into()),
                            exported: if local.0 == export_name {
                                None
                            } else {
                                Some(ModuleExportName::Ident(export_name.clone().into()))
                            },
                            is_type_only: false,
                        })],
                        src: None,
                        type_only: false,
                        with: None,
                    })),
                    read_vars: [local.clone()].into_iter().collect(),
                    export: Some(export_name),
                    disable_export_merging,
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

    /// Workaround for implcit export issue of server actions.
    ///
    /// Inline server actions require the generated `$$RSC_SERVER_0` to be **exported**.
    ///
    /// But tree shaking works by removing unused code, and the **export** of $$RSC_SERVER_0
    /// is cleary not used from the external module as it does not exist at all
    /// in the user code.
    ///
    /// So we need to add an import for $$RSC_SERVER_0 to the module, so that the export is
    /// preserved.
    fn workaround_server_action(
        &mut self,
        g: &mut Graph<u32, Dependency>,
        data: &FxHashMap<ItemId, ItemData>,
    ) {
        fn collect_deps(
            g: &Graph<u32, Dependency>,
            done: &mut FxHashSet<NodeIndex>,
            node: NodeIndex,
        ) -> Vec<NodeIndex> {
            let direct_deps = g
                .edges_directed(node, Direction::Outgoing)
                .map(|e| e.target())
                .collect::<Vec<_>>();

            if direct_deps.iter().all(|dep| done.contains(dep)) {
                return direct_deps;
            }

            direct_deps
                .into_iter()
                .flat_map(|dep| {
                    let mut v = if !done.insert(dep) {
                        vec![]
                    } else {
                        collect_deps(g, done, dep)
                    };

                    v.push(dep);
                    v
                })
                .collect()
        }

        let mut server_action_decls = FxHashMap::default();
        let mut server_action_exports = FxHashMap::default();

        for node in g.node_indices() {
            let Some(ix) = g.node_weight(node) else {
                continue;
            };

            let item_id = self.g.graph_ix.get_index(*ix as _).unwrap();

            if let ItemId::Group(ItemIdGroupKind::Export(v, name)) = item_id {
                if name.starts_with("$$RSC_SERVER_") {
                    server_action_exports.insert(v.0.clone(), node);
                }
            }

            let item_data = &data[item_id];

            for v in item_data.var_decls.iter() {
                if v.0.starts_with("$$RSC_SERVER_") {
                    server_action_decls.insert(node, v.0.clone());
                }
            }
        }

        if server_action_decls.is_empty() || server_action_exports.is_empty() {
            return;
        }

        let mut queue = vec![];

        for node in g.node_indices() {
            let Some(ix) = g.node_weight(node) else {
                continue;
            };

            let is_export_node = {
                let item_id = self.g.graph_ix.get_index(*ix as _).unwrap();
                matches!(item_id, ItemId::Group(ItemIdGroupKind::Export(..)))
            };

            if !is_export_node {
                continue;
            }

            // If an export uses $$RSC_SERVER_0, depend on "export $$RSC_SERVER_0"

            let mut done = FxHashSet::default();
            let dependencies = collect_deps(g, &mut done, node);

            for &dependency in dependencies.iter() {
                if dependency == node {
                    continue;
                }

                let Some(action_item_id) = server_action_decls.get(&dependency) else {
                    continue;
                };

                let Some(action_export_node) = server_action_exports.get(action_item_id) else {
                    continue;
                };

                queue.push((node, *action_export_node));
            }
        }

        for (export_node, dep) in queue {
            g.add_edge(export_node, dep, Dependency::Strong);
        }
    }
}

const ASSERT_CHUNK_KEY: &str = "__turbopack_part__";

#[derive(Debug, Clone)]
pub(crate) enum PartId {
    ModuleEvaluation,
    Exports,
    Export(RcStr),
    /// `(part_id, is_for_eval)`
    Internal(u32, bool),
}

pub(crate) fn create_turbopack_part_id_assert(dep: PartId) -> ObjectLit {
    // We can't use quote! as `with` is not standard yet
    ObjectLit {
        span: DUMMY_SP,
        props: vec![PropOrSpread::Prop(Box::new(Prop::KeyValue(KeyValueProp {
            key: PropName::Ident(IdentName::new(ASSERT_CHUNK_KEY.into(), DUMMY_SP)),
            value: match dep {
                PartId::ModuleEvaluation => "module evaluation".into(),
                PartId::Exports => "exports".into(),
                PartId::Export(e) => format!("export {e}").into(),
                PartId::Internal(dep, is_for_eval) => {
                    let v = dep as f64;
                    if is_for_eval {
                        v
                    } else {
                        -v
                    }
                }
                .into(),
            },
        })))],
    }
}

pub(crate) fn find_turbopack_part_id_in_asserts(asserts: &ObjectLit) -> Option<PartId> {
    asserts.props.iter().find_map(|prop| match prop {
        PropOrSpread::Prop(box Prop::KeyValue(KeyValueProp {
            key: PropName::Ident(key),
            value: box Expr::Lit(Lit::Num(chunk_id)),
        })) if &*key.sym == ASSERT_CHUNK_KEY => Some(PartId::Internal(
            chunk_id.value.abs() as u32,
            chunk_id.value.is_sign_positive(),
        )),

        PropOrSpread::Prop(box Prop::KeyValue(KeyValueProp {
            key: PropName::Ident(key),
            value: box Expr::Lit(Lit::Str(s)),
        })) if &*key.sym == ASSERT_CHUNK_KEY => match &*s.value {
            "module evaluation" => Some(PartId::ModuleEvaluation),
            "exports" => Some(PartId::Exports),
            _ if s.value.starts_with("export ") => Some(PartId::Export(s.value[7..].into())),
            _ => None,
        },
        _ => None,
    })
}
/// givin a number, return a base54 encoded string
/// `usize -> [a-zA-Z$_][a-zA-Z$_0-9]*`
pub(crate) fn encode_base54(init: &mut usize, skip_reserved: bool) -> JsWord {
    static BASE54_CHARS: &[u8; 64] =
        b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789$_";

    let mut n = *init;

    *init += 1;

    let mut base = 54;

    while n >= base {
        n -= base;
        base <<= 6;
    }

    // Not sure if this is ideal, but it's safe
    let mut ret = Vec::with_capacity(14);

    base /= 54;
    let mut c = BASE54_CHARS[n / base];
    ret.push(c);

    while base > 1 {
        n %= base;
        base >>= 6;
        c = BASE54_CHARS[n / base];

        ret.push(c);
    }

    let s = unsafe {
        // Safety: We are only using ascii characters
        // Safety: The stack memory for ret is alive while creating JsWord
        JsWord::from(std::str::from_utf8_unchecked(&ret))
    };

    if skip_reserved
        && (s.is_reserved() || s.is_reserved_in_strict_bind() || s.is_reserved_in_strict_mode(true))
    {
        return encode_base54(init, skip_reserved);
    }

    s
}
