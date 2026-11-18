//! Flattening of CSS Modules `composes` across a module graph.
//!
//! Each CSS module only knows the classes it composes directly (see [`ModuleCssClasses`]). To
//! export the full list of class names, local and `composes: ... from ...` references have to be
//! followed transitively, which can cross module boundaries and can form cycles. This is done once
//! per module graph at code generation time, so that the generated code only contains plain class
//! name strings.

use anyhow::Result;
use async_trait::async_trait;
use petgraph::{algo::tarjan_scc, graph::DiGraph};
use rustc_hash::FxHashMap;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, FxIndexSet, ReadRef, ResolvedVc, TryJoinIterExt, ValueToStringRef, Vc,
};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, StyledString},
    module_graph::ModuleGraph,
    reference::ModuleReference,
    resolve::origin::ResolveOrigin,
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
type ComposeTargets =
    FxHashMap<ResolvedVc<CssModuleComposeReference>, Option<ResolvedVc<EcmascriptCssModule>>>;

/// Flattens the `composes` of all CSS modules in `module_graph`.
///
/// Emits a warning for every cycle of CSS modules that compose from each other. Class-level cycles
/// are broken by skipping the class that is already being expanded.
#[turbo_tasks::function]
pub(crate) async fn css_modules_composes(
    module_graph: ResolvedVc<ModuleGraph>,
) -> Result<Vc<CssModulesComposes>> {
    let graph = module_graph.await?;

    let mut queue: FxIndexSet<ResolvedVc<EcmascriptCssModule>> = graph
        .iter_reachable_modules()?
        .filter_map(ResolvedVc::try_downcast_type::<EcmascriptCssModule>)
        .collect();

    // Load the classes of every CSS module and resolve their `composes: ... from ...` references.
    // Targets are normally part of the graph already, but are loaded on demand to be safe.
    let mut modules: ModuleClasses = FxIndexMap::default();
    let mut targets: ComposeTargets = FxHashMap::default();
    while !queue.is_empty() {
        let batch = std::mem::take(&mut queue);
        let loaded = batch
            .into_iter()
            .map(async |module| Ok((module, (*module).classes().await?)))
            .try_join()
            .await?;

        let references: FxIndexSet<_> = loaded
            .iter()
            .flat_map(|(_, classes)| classes.values().flatten())
            .filter_map(|class| match class {
                ModuleCssClass::Import { from, .. } => Some(*from),
                ModuleCssClass::Local { .. } | ModuleCssClass::Global { .. } => None,
            })
            .filter(|reference| !targets.contains_key(reference))
            .collect();
        let resolved = references
            .into_iter()
            .map(async |reference| {
                let target = reference.resolve_reference().await?.first_module().await?;
                Ok((
                    reference,
                    target.and_then(ResolvedVc::try_downcast_type::<EcmascriptCssModule>),
                ))
            })
            .try_join()
            .await?;

        modules.extend(loaded);
        for (reference, target) in resolved {
            if let Some(target) = target
                && !modules.contains_key(&target)
            {
                queue.insert(target);
            }
            targets.insert(reference, target);
        }
    }

    report_cycles(&modules, &targets).await?;

    let mut flattener = Flattener::new(&modules, &targets);
    let mut result = FxHashMap::default();
    for (module, classes) in &modules {
        let flattened = classes
            .keys()
            .map(|export| {
                let (names, _) = flattener.visit(*module, export);
                (
                    export.clone(),
                    names.into_iter().map(str::to_string).collect(),
                )
            })
            .collect();
        result.insert(*module, FlattenedCssModuleClasses(flattened));
    }

    Ok(Vc::cell(result))
}

/// Emits a warning for every strongly connected component of CSS modules that are connected by
/// `composes: ... from ...` references.
async fn report_cycles(modules: &ModuleClasses, targets: &ComposeTargets) -> Result<()> {
    let mut graph = DiGraph::<ResolvedVc<EcmascriptCssModule>, ()>::new();
    let nodes: FxHashMap<_, _> = modules
        .keys()
        .map(|module| (*module, graph.add_node(*module)))
        .collect();
    let mut has_self_edge = vec![false; modules.len()];
    for (module, classes) in modules {
        let from = nodes[module];
        for class in classes.values().flatten() {
            if let ModuleCssClass::Import {
                from: reference, ..
            } = class
                && let Some(Some(target)) = targets.get(reference)
                && let Some(&to) = nodes.get(target)
            {
                if from == to {
                    has_self_edge[from.index()] = true;
                }
                graph.update_edge(from, to, ());
            }
        }
    }

    for component in tarjan_scc(&graph) {
        if component.len() < 2 && !component.iter().any(|node| has_self_edge[node.index()]) {
            continue;
        }
        let mut paths = component
            .iter()
            .map(async |node| {
                let path = graph[*node].await?.origin_path();
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

type ClassKey<'a> = (ResolvedVc<EcmascriptCssModule>, &'a str);

/// Expands exports depth-first, memoizing results that did not encounter a cycle.
struct Flattener<'a> {
    modules: &'a ModuleClasses,
    targets: &'a ComposeTargets,
    /// Maps each export's own (generated) class name back to the export name, per module, so
    /// that local `composes` references can be expanded.
    local_exports: FxHashMap<ResolvedVc<EcmascriptCssModule>, FxHashMap<&'a str, &'a str>>,
    memo: FxHashMap<ClassKey<'a>, Vec<&'a str>>,
    stack: FxIndexSet<ClassKey<'a>>,
}

impl<'a> Flattener<'a> {
    fn new(modules: &'a ModuleClasses, targets: &'a ComposeTargets) -> Self {
        let local_exports = modules
            .iter()
            .map(|(module, classes)| {
                let names = classes
                    .iter()
                    .filter_map(|(export, classes)| match classes.first() {
                        Some(ModuleCssClass::Local { name }) => {
                            Some((name.as_str(), export.as_str()))
                        }
                        _ => None,
                    })
                    .collect();
                (*module, names)
            })
            .collect();
        Self {
            modules,
            targets,
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
        let Some(classes) = self
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
                    // Unresolvable references are reported by
                    // `CssModuleComposeReference::resolve_reference`.
                    if let Some(Some(target)) = self.targets.get(from) {
                        let (composed, low) = self.visit(*target, original.as_str());
                        lowest = lowest.min(low);
                        names.extend(composed);
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
