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
//! these edges, and cycles are found with [`ModuleGraphSnapshot::traverse_cycles`].
//!
//! [`ModuleGraphSnapshot::traverse_cycles`]: turbopack_core::module_graph::ModuleGraphSnapshot::traverse_cycles

use anyhow::Result;
use async_trait::async_trait;
use rustc_hash::FxHashMap;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, FxIndexSet, ReadRef, ResolvedVc, TryJoinIterExt, ValueToStringRef, Vc,
};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, StyledString},
    module::Module,
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
/// Emits a warning for every cycle of CSS modules that compose from each other. Within a module
/// cycle, a class composed from a module that is still being flattened only contributes its own
/// class name, and class-level cycles within a module are broken by skipping the class that is
/// already being expanded.
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

    report_cycles(&graph, &modules).await?;

    let mut flattener = Flattener::new(&modules);
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
            // Expand every module once. A module that is still being expanded is the target of a
            // back edge of a cycle, so its classes are not (fully) available yet.
            Ok(if flattener.seen.insert(module) {
                GraphTraversalAction::Continue
            } else {
                GraphTraversalAction::Exclude
            })
        },
        |_, module, flattener| {
            if let Some(module) = ResolvedVc::try_downcast_type::<EcmascriptCssModule>(module) {
                flattener.flatten_module(module);
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

/// Emits a warning for every cycle of CSS modules that are connected by `composes: ... from ...`
/// references.
async fn report_cycles(graph: &ModuleGraph, modules: &ModuleClasses) -> Result<()> {
    let mut cycles = Vec::new();
    graph.traverse_cycles(is_composes_edge, |cycle| {
        let cycle: Vec<_> = cycle
            .iter()
            .filter_map(|module| ResolvedVc::try_downcast_type::<EcmascriptCssModule>(**module))
            .filter(|module| modules.contains_key(module))
            .map(ResolvedVc::upcast::<Box<dyn Module>>)
            .collect();
        if !cycle.is_empty() {
            cycles.push(cycle);
        }
        Ok(())
    })?;

    for cycle in cycles {
        let mut paths = cycle
            .into_iter()
            .map(async |module| {
                let path = graph.module_ident(module)?.await?.path.clone();
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
    /// The modules that were reached by the traversal, including those still being flattened.
    seen: FxIndexSet<ResolvedVc<EcmascriptCssModule>>,
    /// The CSS module each `composes: ... from ...` reference points to, from the module graph.
    targets: FxHashMap<ResolvedVc<CssModuleComposeReference>, ResolvedVc<EcmascriptCssModule>>,
    /// The modules that are completely flattened.
    flattened: FxHashMap<ResolvedVc<EcmascriptCssModule>, FlattenedExports<'a>>,
}

impl<'a> Flattener<'a> {
    fn new(modules: &'a ModuleClasses) -> Self {
        Self {
            modules,
            seen: FxIndexSet::default(),
            targets: FxHashMap::default(),
            flattened: FxHashMap::default(),
        }
    }

    /// Flattens all exports of `module`. Called in post-order, so the modules it composes from are
    /// already flattened, unless they are part of the same cycle.
    fn flatten_module(&mut self, module: ResolvedVc<EcmascriptCssModule>) {
        if self.flattened.contains_key(&module) {
            return;
        }
        let Some(classes) = self.modules.get(&module) else {
            return;
        };
        let classes: &'a ExportClasses = classes;
        let mut expander = ModuleExpander::new(self, classes);
        let exports = classes
            .keys()
            .map(|export| {
                let (names, _) = expander.visit(export);
                (export.as_str(), names)
            })
            .collect();
        self.flattened.insert(module, exports);
    }

    /// The class names that composing `export` from `target` contributes.
    fn imported(&self, target: ResolvedVc<EcmascriptCssModule>, export: &str) -> Vec<&'a str> {
        if let Some(names) = self
            .flattened
            .get(&target)
            .and_then(|exports| exports.get(export))
        {
            return names.clone();
        }
        // `target` is still being flattened, i.e. this is a back edge of a module cycle (which is
        // reported as a warning), so only its own class name is used.
        let own = self
            .modules
            .get(&target)
            .and_then(|classes| classes.get(export))
            .and_then(|classes| classes.first());
        match own {
            Some(ModuleCssClass::Local { name } | ModuleCssClass::Global { name }) => {
                vec![name.as_str()]
            }
            Some(ModuleCssClass::Import { .. }) | None => Vec::new(),
        }
    }
}

/// Expands the exports of a single module depth-first, following local `composes` within the
/// module and using the already flattened classes of other modules for `composes: ... from ...`.
struct ModuleExpander<'f, 'a> {
    flattener: &'f Flattener<'a>,
    classes: &'a ExportClasses,
    /// Maps each export's own (generated) class name back to the export name, so that local
    /// `composes` references can be expanded.
    local_exports: FxHashMap<&'a str, &'a str>,
    /// Expansions that did not encounter a cycle.
    memo: FxHashMap<&'a str, Vec<&'a str>>,
    stack: FxIndexSet<&'a str>,
}

impl<'f, 'a> ModuleExpander<'f, 'a> {
    fn new(flattener: &'f Flattener<'a>, classes: &'a ExportClasses) -> Self {
        let local_exports = classes
            .iter()
            .filter_map(|(export, classes)| match classes.first() {
                Some(ModuleCssClass::Local { name }) => Some((name.as_str(), export.as_str())),
                _ => None,
            })
            .collect();
        Self {
            flattener,
            classes,
            local_exports,
            memo: FxHashMap::default(),
            stack: FxIndexSet::default(),
        }
    }

    /// Returns the expanded class names of `export`, and the lowest stack depth of a class that
    /// was skipped because it is currently being expanded (a cycle), or `usize::MAX`.
    fn visit(&mut self, export: &'a str) -> (Vec<&'a str>, usize) {
        if let Some(names) = self.memo.get(export) {
            return (names.clone(), usize::MAX);
        }
        if let Some(depth) = self.stack.get_index_of(export) {
            return (Vec::new(), depth);
        }
        let Some(classes) = self.classes.get(export) else {
            return (Vec::new(), usize::MAX);
        };

        self.stack.insert(export);
        let mut names = FxIndexSet::default();
        let mut lowest = usize::MAX;
        for (i, class) in classes.iter().enumerate() {
            match class {
                ModuleCssClass::Local { name } => {
                    // The first entry is the export's own class name.
                    let composed_export = (i > 0)
                        .then(|| self.local_exports.get(name.as_str()).copied())
                        .flatten();
                    if let Some(composed_export) = composed_export {
                        let (composed, low) = self.visit(composed_export);
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
                    if let Some(target) = self.flattener.targets.get(from) {
                        names.extend(self.flattener.imported(*target, original));
                    }
                }
            }
        }
        self.stack.pop();

        let names: Vec<_> = names.into_iter().collect();
        // A cycle-broken expansion depends on which export started the traversal, so it can't be
        // reused for another root without changing that root's pre-order.
        if lowest == usize::MAX {
            self.memo.insert(export, names.clone());
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
