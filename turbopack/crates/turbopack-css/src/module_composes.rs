//! Flattening of CSS Modules `composes` across a module graph.
//!
//! Each CSS module only knows the classes it composes directly (see [`ModuleCssClasses`]). To
//! export the full list of class names, local and `composes: ... from ...` references have to be
//! followed transitively, which can cross module boundaries and can form cycles. This is done once
//! per module graph at code generation time, so that the generated code only contains plain class
//! name strings.
//!
//! `composes: ... from ...` references are edges of the module graph, so the graph's traversals
//! are reused: modules are flattened in post-order of a depth-first traversal that only follows
//! these edges, and cycles are found with [`ModuleGraphSnapshot::traverse_cycles`]. Modules
//! outside of any cycle reuse the flattened classes of the modules they compose from. The modules
//! of a cycle are flattened together, following classes across the whole cycle, so the result
//! doesn't depend on which of them the traversal reaches first.
//!
//! [`ModuleGraphSnapshot::traverse_cycles`]: turbopack_core::module_graph::ModuleGraphSnapshot::traverse_cycles

use anyhow::Result;
use async_trait::async_trait;
use rustc_hash::{FxHashMap, FxHashSet};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, FxIndexSet, ReadRef, ResolvedVc, TryJoinIterExt, ValueToStringRef, Vc,
};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, StyledString},
    module_graph::{GraphTraversalAction, ModuleGraph, RefData},
};

use crate::{
    module_asset::{EcmascriptCssModule, ModuleCssClass, ModuleCssClasses},
    references::compose::CssModuleComposeReference,
};

/// The fully expanded class names of every export of a CSS module, in the order they are
/// exported: the export's own class name first, then every composed class name in pre-order,
/// with duplicates removed (keeping the first occurrence).
///
/// This is a `Vec` rather than an `IndexMap` so cell equality also includes export order.
#[turbo_tasks::value]
#[derive(Debug, Clone)]
pub(crate) struct FlattenedCssModuleClasses(pub Vec<(String, Vec<String>)>);

/// [`FlattenedCssModuleClasses`] for every CSS module in a module graph.
#[turbo_tasks::value(transparent, cell = "keyed")]
pub(crate) struct CssModulesComposes(
    FxHashMap<ResolvedVc<EcmascriptCssModule>, FlattenedCssModuleClasses>,
);

type ModuleClasses = FxIndexMap<ResolvedVc<EcmascriptCssModule>, ReadRef<ModuleCssClasses>>;
/// The classes of a single module, see [`ModuleCssClasses`].
type ExportClasses = FxIndexMap<String, Vec<ModuleCssClass>>;

/// Whether a module graph edge is a `composes: ... from ...` reference.
fn is_composes_edge(edge: &RefData) -> bool {
    ResolvedVc::try_downcast_type::<CssModuleComposeReference>(edge.reference).is_some()
}

/// Flattens the `composes` of all CSS modules in `module_graph`.
///
/// Emits a warning for every cycle of CSS modules that compose from each other. The modules of
/// such a cycle are flattened together, so their class names are complete. Only class-level cycles
/// are broken, by skipping the class that is already being expanded.
#[turbo_tasks::function(root)]
pub(crate) async fn css_modules_composes(
    module_graph: ResolvedVc<ModuleGraph>,
) -> Result<Vc<CssModulesComposes>> {
    let graph = module_graph.await?;

    // Load the classes of every CSS module up front, so the traversal below doesn't need to await.
    let modules: ModuleClasses = graph
        .iter_reachable_modules()?
        .filter_map(ResolvedVc::try_downcast_type::<EcmascriptCssModule>)
        .collect::<FxIndexSet<_>>()
        .into_iter()
        .map(async |module| Ok((module, (*module).classes().await?)))
        .try_join()
        .await?
        .into_iter()
        .collect();

    let cycles = find_cycles(&graph, &modules)?;
    report_cycles(&graph, &cycles).await?;

    let mut flattener = Flattener::new(&modules, &cycles);
    graph.traverse_edges_dfs(
        modules.keys().map(|module| ResolvedVc::upcast(*module)),
        &mut flattener,
        |parent, module, flattener| {
            let Some(module) = ResolvedVc::try_downcast_type::<EcmascriptCssModule>(module) else {
                return Ok(GraphTraversalAction::Exclude);
            };
            if let Some((_, edge)) = parent {
                // Only follow `composes: ... from ...` references, which always point to CSS
                // modules.
                let Some(reference) =
                    ResolvedVc::try_downcast_type::<CssModuleComposeReference>(edge.reference)
                else {
                    return Ok(GraphTraversalAction::Exclude);
                };
                flattener.targets.insert(reference, module);
            }
            // Visit every module once, so each module is reached in post-order exactly once.
            Ok(if flattener.seen.insert(module) {
                GraphTraversalAction::Continue
            } else {
                GraphTraversalAction::Exclude
            })
        },
        |_, module, flattener| {
            if let Some(module) = ResolvedVc::try_downcast_type::<EcmascriptCssModule>(module) {
                flattener.module_finished(module);
            }
            Ok(())
        },
        false,
        false,
    )?;

    let result = flattener
        .flattened
        .into_iter()
        .map(|(module, exports)| {
            let exports = exports
                .into_iter()
                .map(|(export, names)| {
                    (
                        export.to_string(),
                        names.into_iter().map(str::to_string).collect(),
                    )
                })
                .collect();
            (module, FlattenedCssModuleClasses(exports))
        })
        .collect();

    Ok(Vc::cell(result))
}

type Cycles = Vec<Vec<ResolvedVc<EcmascriptCssModule>>>;

/// Finds the cycles (strongly connected components) of CSS modules that are connected by
/// `composes: ... from ...` references. Every module is part of at most one cycle.
fn find_cycles(graph: &ModuleGraph, modules: &ModuleClasses) -> Result<Cycles> {
    let mut cycles = Vec::new();
    let mut in_cycle = FxHashSet::default();
    graph.traverse_cycles(is_composes_edge, |cycle| {
        let cycle: Vec<_> = cycle
            .iter()
            .filter_map(|module| ResolvedVc::try_downcast_type::<EcmascriptCssModule>(**module))
            .filter(|module| modules.contains_key(module) && in_cycle.insert(*module))
            .collect();
        if !cycle.is_empty() {
            cycles.push(cycle);
        }
        Ok(())
    })?;
    Ok(cycles)
}

/// Emits a warning for every cycle of CSS modules.
async fn report_cycles(graph: &ModuleGraph, cycles: &Cycles) -> Result<()> {
    for cycle in cycles {
        let mut paths = cycle
            .iter()
            .map(async |module| {
                let path = graph
                    .module_ident(ResolvedVc::upcast(*module))?
                    .await?
                    .path
                    .clone();
                let display = path.to_string_ref().await?;
                Ok((display, path))
            })
            .try_join()
            .await?;
        paths.sort_by(|(a, _), (b, _)| a.cmp(b));
        let Some((_, file_path)) = paths.first().cloned() else {
            continue;
        };
        CssModuleComposesCycleIssue {
            file_path,
            modules: paths.into_iter().map(|(display, _)| display).collect(),
        }
        .resolved_cell()
        .emit();
    }

    Ok(())
}

/// The flattened exports of a module: export name to expanded class names.
type FlattenedExports<'a> = FxIndexMap<&'a str, Vec<&'a str>>;

/// The state of the depth-first traversal over `composes: ... from ...` edges.
struct Flattener<'a> {
    modules: &'a ModuleClasses,
    cycles: &'a Cycles,
    /// The index into `cycles` of every module that is part of a cycle.
    cycle_of: FxHashMap<ResolvedVc<EcmascriptCssModule>, usize>,
    /// How many modules of each cycle have not been reached in post-order yet.
    pending: Vec<usize>,
    /// The modules that were reached by the traversal, including those still being flattened.
    seen: FxIndexSet<ResolvedVc<EcmascriptCssModule>>,
    /// The CSS module each `composes: ... from ...` reference points to, from the module graph.
    targets: FxHashMap<ResolvedVc<CssModuleComposeReference>, ResolvedVc<EcmascriptCssModule>>,
    /// The modules that are completely flattened.
    flattened: FxHashMap<ResolvedVc<EcmascriptCssModule>, FlattenedExports<'a>>,
}

impl<'a> Flattener<'a> {
    fn new(modules: &'a ModuleClasses, cycles: &'a Cycles) -> Self {
        let cycle_of = cycles
            .iter()
            .enumerate()
            .flat_map(|(i, cycle)| cycle.iter().map(move |module| (*module, i)))
            .collect();
        Self {
            modules,
            cycles,
            cycle_of,
            pending: cycles.iter().map(Vec::len).collect(),
            seen: FxIndexSet::default(),
            targets: FxHashMap::default(),
            flattened: FxHashMap::default(),
        }
    }

    /// Called when `module` is reached in post-order.
    ///
    /// A module outside of any cycle is flattened right away: everything it composes from is
    /// already flattened. The modules of a cycle are flattened together once the last of them is
    /// reached. In post-order, that is the module the traversal entered the cycle through, so by
    /// then every edge leaving the cycle has been traversed and all modules the cycle composes from
    /// are flattened.
    fn module_finished(&mut self, module: ResolvedVc<EcmascriptCssModule>) {
        let cycles = self.cycles;
        match self.cycle_of.get(&module) {
            Some(&cycle) => {
                self.pending[cycle] -= 1;
                if self.pending[cycle] == 0 {
                    self.flatten(&cycles[cycle]);
                }
            }
            None => self.flatten(&[module]),
        }
    }

    /// Flattens all exports of `group`, which is either a single module outside of any cycle or
    /// all modules of a cycle.
    fn flatten(&mut self, group: &[ResolvedVc<EcmascriptCssModule>]) {
        let mut expander = Expander::new(self, group);
        let flattened: Vec<_> = group
            .iter()
            .filter_map(|module| {
                let classes: &'a ExportClasses = self.modules.get(module)?;
                let exports = classes
                    .keys()
                    .map(|export| {
                        let (names, _) = expander.visit(*module, export);
                        (export.as_str(), names)
                    })
                    .collect();
                Some((*module, exports))
            })
            .collect();
        self.flattened.extend(flattened);
    }
}

type ClassKey<'a> = (ResolvedVc<EcmascriptCssModule>, &'a str);

/// Expands exports depth-first within a group of modules, following local `composes` and
/// `composes: ... from ...` between modules of the group, and using the already flattened classes
/// of modules outside of it.
struct Expander<'f, 'a> {
    flattener: &'f Flattener<'a>,
    group: FxHashSet<ResolvedVc<EcmascriptCssModule>>,
    /// Maps each export's own (generated) class name back to the export name, per module, so that
    /// local `composes` references can be expanded.
    local_exports: FxHashMap<ResolvedVc<EcmascriptCssModule>, FxHashMap<&'a str, &'a str>>,
    /// Expansions that did not encounter a cycle.
    memo: FxHashMap<ClassKey<'a>, Vec<&'a str>>,
    stack: FxIndexSet<ClassKey<'a>>,
}

impl<'f, 'a> Expander<'f, 'a> {
    fn new(flattener: &'f Flattener<'a>, group: &[ResolvedVc<EcmascriptCssModule>]) -> Self {
        let local_exports = group
            .iter()
            .filter_map(|module| {
                let classes: &'a ExportClasses = flattener.modules.get(module)?;
                let names = classes
                    .iter()
                    .filter_map(|(export, classes)| match classes.first() {
                        Some(ModuleCssClass::Local { name }) => {
                            Some((name.as_str(), export.as_str()))
                        }
                        _ => None,
                    })
                    .collect();
                Some((*module, names))
            })
            .collect();
        Self {
            flattener,
            group: group.iter().copied().collect(),
            local_exports,
            memo: FxHashMap::default(),
            stack: FxIndexSet::default(),
        }
    }

    /// Returns the expanded class names of `export` in `module`, and the lowest stack depth of a
    /// class that was skipped because it is currently being expanded (a cycle), or `usize::MAX`.
    fn visit(
        &mut self,
        module: ResolvedVc<EcmascriptCssModule>,
        export: &'a str,
    ) -> (Vec<&'a str>, usize) {
        let key = (module, export);
        if let Some(names) = self.memo.get(&key) {
            return (names.clone(), usize::MAX);
        }
        if let Some(depth) = self.stack.get_index_of(&key) {
            return (Vec::new(), depth);
        }
        let flattener = self.flattener;
        let Some(classes) = flattener
            .modules
            .get(&module)
            .and_then(|classes| classes.get(export))
        else {
            return (Vec::new(), usize::MAX);
        };

        self.stack.insert(key);
        let mut names = FxIndexSet::default();
        let mut lowest = usize::MAX;
        for (i, class) in classes.iter().enumerate() {
            match class {
                ModuleCssClass::Local { name } => {
                    // The first entry is the export's own class name.
                    let composed_export = (i > 0)
                        .then(|| {
                            self.local_exports
                                .get(&module)
                                .and_then(|exports| exports.get(name.as_str()))
                                .copied()
                        })
                        .flatten();
                    if let Some(composed_export) = composed_export {
                        let (composed, low) = self.visit(module, composed_export);
                        lowest = lowest.min(low);
                        names.extend(composed);
                    } else {
                        names.insert(name.as_str());
                    }
                }
                ModuleCssClass::Global { name } => {
                    names.insert(name.as_str());
                }
                ModuleCssClass::Import { original, from } => {
                    // Unresolvable references have no edge in the module graph and are reported by
                    // `CssModuleComposeReference::resolve_reference`.
                    let Some(&target) = flattener.targets.get(from) else {
                        continue;
                    };
                    if self.group.contains(&target) {
                        let (composed, low) = self.visit(target, original);
                        lowest = lowest.min(low);
                        names.extend(composed);
                    } else if let Some(composed) = flattener
                        .flattened
                        .get(&target)
                        .and_then(|exports| exports.get(original.as_str()))
                    {
                        // Modules outside of the group are flattened before it.
                        names.extend(composed.iter().copied());
                    }
                }
            }
        }
        self.stack.pop();

        let names: Vec<_> = names.into_iter().collect();
        // A cycle-broken expansion depends on which export started the traversal, so it can't be
        // reused for another root without changing that root's pre-order.
        if lowest == usize::MAX {
            self.memo.insert(key, names.clone());
        }
        (names, lowest)
    }
}

#[turbo_tasks::value(shared)]
struct CssModuleComposesCycleIssue {
    file_path: FileSystemPath,
    modules: Vec<RcStr>,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for CssModuleComposesCycleIssue {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Warning
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(rcstr!(
            "CSS modules form a `composes: ... from ...;` import cycle"
        )))
    }

    fn stage(&self) -> IssueStage {
        IssueStage::CodeGen
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.file_path.clone())
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        let mut lines = vec![StyledString::Text(rcstr!(
            "These CSS modules compose classes from each other:"
        ))];
        lines.extend(
            self.modules
                .iter()
                .map(|module| StyledString::Code(module.clone())),
        );
        lines.push(StyledString::Text(rcstr!(
            "Composed class names are linearized by skipping classes that are already being \
             expanded. Remove the cycle to get a well-defined set of class names."
        )));
        Ok(Some(StyledString::Stack(lines)))
    }
}
