use std::collections::{HashMap, HashSet};

use anyhow::{bail, Result};
use futures::Future;
use next_core::next_client_reference::EcmascriptClientReferenceModule;
use serde::{Deserialize, Serialize};
use swc_core::ecma::{
    ast::{CallExpr, Callee, Expr, Ident, Lit},
    visit::{Visit, VisitWith},
};
use tracing::{Instrument, Level};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    graph::{GraphTraversal, NonDeterministic, VisitControlFlow, VisitedNodes},
    trace::TraceRawVcs,
    FxIndexMap, ReadRef, ResolvedVc, TryJoinIterExt, Value, ValueToString, Vc,
};
use turbopack_core::{
    chunk::{
        availability_info::AvailabilityInfo, ChunkableModule, ChunkingContext, ChunkingContextExt,
        EvaluatableAsset,
    },
    context::AssetContext,
    module::Module,
    output::OutputAssets,
    reference::primary_referenced_modules,
    reference_type::EcmaScriptModulesReferenceSubType,
    resolve::{origin::PlainResolveOrigin, parse::Request, pattern::Pattern},
};
use turbopack_ecmascript::{parse::ParseResult, resolve::esm_resolve, EcmascriptParsable};

async fn collect_chunk_group_inner<F, Fu>(
    dynamic_import_entries: FxIndexMap<ResolvedVc<Box<dyn Module>>, DynamicImportedModules>,
    mut build_chunk: F,
) -> Result<Vc<DynamicImportedChunks>>
where
    F: FnMut(Vc<Box<dyn ChunkableModule>>) -> Fu,
    Fu: Future<Output = Result<Vc<OutputAssets>>> + Send,
{
    let mut chunks_hash: HashMap<RcStr, ResolvedVc<OutputAssets>> = HashMap::new();
    let mut dynamic_import_chunks = FxIndexMap::default();

    // Iterate over the collected import mappings, and create a chunk for each
    // dynamic import.
    for (origin_module, dynamic_imports) in dynamic_import_entries {
        for (imported_raw_str, imported_module) in dynamic_imports {
            let chunk = if let Some(chunk) = chunks_hash.get(&imported_raw_str) {
                *chunk
            } else {
                let Some(module) =
                    ResolvedVc::try_sidecast::<Box<dyn ChunkableModule>>(imported_module).await?
                else {
                    bail!("module must be evaluatable");
                };

                // [Note]: this seems to create duplicated chunks for the same module to the original import() call
                // and the explicit chunk we ask in here. So there'll be at least 2
                // chunks for the same module, relying on
                // naive hash to have additional
                // chunks in case if there are same modules being imported in different
                // origins.
                let chunk_group = build_chunk(*module).await?.to_resolved().await?;
                chunks_hash.insert(imported_raw_str.clone(), chunk_group);
                chunk_group
            };

            dynamic_import_chunks
                .entry(origin_module)
                .or_insert_with(Vec::new)
                .push((imported_raw_str.clone(), chunk));
        }
    }

    Ok(Vc::cell(dynamic_import_chunks))
}

pub(crate) async fn collect_chunk_group(
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    dynamic_import_entries: FxIndexMap<ResolvedVc<Box<dyn Module>>, DynamicImportedModules>,
    availability_info: Value<AvailabilityInfo>,
) -> Result<Vc<DynamicImportedChunks>> {
    collect_chunk_group_inner(dynamic_import_entries, |module| async move {
        Ok(chunking_context.chunk_group_assets(module, availability_info))
    })
    .await
}

pub(crate) async fn collect_evaluated_chunk_group(
    chunking_context: Vc<Box<dyn ChunkingContext>>,
    dynamic_import_entries: FxIndexMap<ResolvedVc<Box<dyn Module>>, DynamicImportedModules>,
) -> Result<Vc<DynamicImportedChunks>> {
    collect_chunk_group_inner(dynamic_import_entries, |module| async move {
        if let Some(module) = Vc::try_resolve_downcast::<Box<dyn EvaluatableAsset>>(module).await? {
            Ok(chunking_context.evaluated_chunk_group_assets(
                module.ident(),
                Vc::cell(vec![Vc::upcast(module)]),
                Value::new(AvailabilityInfo::Root),
            ))
        } else {
            Ok(chunking_context.chunk_group_assets(module, Value::new(AvailabilityInfo::Root)))
        }
    })
    .await
}

#[turbo_tasks::value(shared)]
pub struct NextDynamicImportsResult {
    pub client_dynamic_imports: FxIndexMap<ResolvedVc<Box<dyn Module>>, DynamicImportedModules>,
    pub visited_modules: ResolvedVc<VisitedDynamicImportModules>,
}

#[turbo_tasks::value(shared)]
pub struct VisitedDynamicImportModules(HashSet<NextDynamicVisitEntry>);

#[turbo_tasks::value_impl]
impl VisitedDynamicImportModules {
    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        VisitedDynamicImportModules(Default::default()).cell()
    }
}

/// Returns a mapping of the dynamic imports for each module, if the import is
/// wrapped in `next/dynamic`'s `dynamic()`. Refer [documentation](https://nextjs.org/docs/pages/building-your-application/optimizing/lazy-loading#with-named-exports) for the usecases.
///
/// If an import is specified as dynamic, next.js does few things:
/// - Runs a next_dynamic [transform to the source file](https://github.com/vercel/next.js/blob/ae1b89984d26b2af3658001fa19a19e1e77c312d/packages/next-swc/crates/next-transform-dynamic/src/lib.rs#L22)
///   - This transform will [inject `loadableGenerated` property](https://github.com/vercel/next.js/blob/ae1b89984d26b2af3658001fa19a19e1e77c312d/packages/next-swc/crates/next-transform-dynamic/tests/fixture/wrapped-import/output-webpack-dev.js#L5),
///     which contains the list of the import ids in the form of `${origin} -> ${imported}`.
/// - Emits `react-loadable-manifest.json` which contains the mapping of the import ids to the chunk
///   ids.
///   - Webpack: [implementation](https://github.com/vercel/next.js/blob/ae1b89984d26b2af3658001fa19a19e1e77c312d/packages/next/src/build/webpack/plugins/react-loadable-plugin.ts)
///   - Turbopack: [implementation 1](https://github.com/vercel/next.js/pull/56389/files#diff-3cac9d9bfe73e0619e6407f21f6fe652da0719d0ec9074ff813ad3e416d0eb1a),
///     [implementation 2](https://github.com/vercel/next.js/pull/56389/files#diff-791951bbe1fa09bcbad9be9173412d0848168f7d658758f11b6e8888a021552c),
///     [implementation 3](https://github.com/vercel/next.js/pull/56389/files#diff-c33f6895801329243dd3f627c69da259bcab95c2c9d12993152842591931ff01R557)
/// - When running an application,
///    - Server reads generated `react-loadable-manifest.json`, sets dynamicImportIds with the mapping of the import ids, and dynamicImports to the actual corresponding chunks.
///         [implementation 1](https://github.com/vercel/next.js/blob/ad42b610c25b72561ad367b82b1c7383fd2a5dd2/packages/next/src/server/load-components.ts#L119),
///         [implementation 2](https://github.com/vercel/next.js/blob/ad42b610c25b72561ad367b82b1c7383fd2a5dd2/packages/next/src/server/render.tsx#L1417C7-L1420)
///    - Server embeds those into __NEXT_DATA__ and [send to the client.](https://github.com/vercel/next.js/blob/ad42b610c25b72561ad367b82b1c7383fd2a5dd2/packages/next/src/server/render.tsx#L1453)
///    - When client boots up, pass it to the [client preload](https://github.com/vercel/next.js/blob/ad42b610c25b72561ad367b82b1c7383fd2a5dd2/packages/next/src/client/index.tsx#L943)
///    - Loadable runtime [injects preload fn](https://github.com/vercel/next.js/blob/ad42b610c25b72561ad367b82b1c7383fd2a5dd2/packages/next/src/shared/lib/loadable.shared-runtime.tsx#L281)
///      to wait until all the dynamic components are being loaded, this ensures hydration mismatch
///      won't occur
#[turbo_tasks::function]
pub(crate) async fn collect_next_dynamic_imports(
    // `server_entries` cannot be a `Vc<Vec<_>>` because that would compare by cell identity and
    // not by value, breaking memoization.
    server_entries: Vec<Vc<Box<dyn Module>>>,
    client_asset_context: Vc<Box<dyn AssetContext>>,
    visited_modules: Vc<VisitedDynamicImportModules>,
) -> Result<Vc<NextDynamicImportsResult>> {
    async move {
        // Traverse referenced modules graph, collect all of the dynamic imports:
        // - Read the Program AST of the Module, this is the origin (A)
        //  - If there's `dynamic(import(B))`, then B is the module that is being imported
        // Returned import mappings are in the form of
        // (Module<A>, Vec<(B, Module<B>)>) (where B is the raw import source string,
        // and Module<B> is the actual resolved Module)
        let (result, visited_modules) = NonDeterministic::new()
            .skip_duplicates_with_visited_nodes(VisitedNodes(visited_modules.await?.0.clone()))
            .visit(
                server_entries
                    .iter()
                    .map(|module| async move {
                        Ok(NextDynamicVisitEntry::Module(
                            module.to_resolved().await?,
                            module.ident().to_string().await?,
                        ))
                    })
                    .try_join()
                    .await?
                    .into_iter(),
                NextDynamicVisit {
                    client_asset_context: client_asset_context.resolve().await?,
                },
            )
            .await
            .completed()?
            .into_inner_with_visited();

        let imported_modules_mapping = result.into_iter().filter_map(|entry| {
            if let NextDynamicVisitEntry::DynamicImportsMap(dynamic_imports_map) = entry {
                Some(dynamic_imports_map)
            } else {
                None
            }
        });

        // Consolidate import mappings into a single indexmap
        let mut import_mappings: FxIndexMap<ResolvedVc<Box<dyn Module>>, DynamicImportedModules> =
            FxIndexMap::default();

        for module_mapping in imported_modules_mapping {
            let (origin_module, dynamic_imports) = &*module_mapping.await?;
            import_mappings
                .entry(*origin_module)
                .or_insert_with(Vec::new)
                .append(&mut dynamic_imports.clone())
        }

        Ok(NextDynamicImportsResult {
            client_dynamic_imports: import_mappings,
            visited_modules: VisitedDynamicImportModules(visited_modules.0).resolved_cell(),
        }
        .cell())
    }
    .instrument(tracing::info_span!("collecting next/dynamic imports"))
    .await
}

#[derive(Debug, PartialEq, Eq, Hash, Clone, TraceRawVcs, Serialize, Deserialize)]
enum NextDynamicVisitEntry {
    Module(ResolvedVc<Box<dyn Module>>, ReadRef<RcStr>),
    DynamicImportsMap(ResolvedVc<DynamicImportsMap>),
}

#[turbo_tasks::value(transparent)]
struct NextDynamicVisitEntries(Vec<NextDynamicVisitEntry>);

#[turbo_tasks::function]
async fn get_next_dynamic_edges(
    client_asset_context: Vc<Box<dyn AssetContext>>,
    module: Vc<Box<dyn Module>>,
) -> Result<Vc<NextDynamicVisitEntries>> {
    let dynamic_imports_map = build_dynamic_imports_map_for_module(client_asset_context, module);

    let mut edges = if Vc::try_resolve_downcast_type::<EcmascriptClientReferenceModule>(module)
        .await?
        .is_some()
    {
        vec![]
    } else {
        primary_referenced_modules(module)
            .await?
            .iter()
            .map(|&referenced_module| async move {
                Ok(NextDynamicVisitEntry::Module(
                    referenced_module,
                    referenced_module.ident().to_string().await?,
                ))
            })
            .try_join()
            .await?
    };

    if let Some(dynamic_imports_map) = *dynamic_imports_map.await? {
        edges.reserve_exact(1);
        edges.push(NextDynamicVisitEntry::DynamicImportsMap(
            dynamic_imports_map,
        ));
    }
    Ok(Vc::cell(edges))
}

struct NextDynamicVisit {
    client_asset_context: Vc<Box<dyn AssetContext>>,
}

impl turbo_tasks::graph::Visit<NextDynamicVisitEntry> for NextDynamicVisit {
    type Edge = NextDynamicVisitEntry;
    type EdgesIntoIter = impl Iterator<Item = NextDynamicVisitEntry>;
    type EdgesFuture = impl Future<Output = Result<Self::EdgesIntoIter>>;

    fn visit(&mut self, edge: Self::Edge) -> VisitControlFlow<NextDynamicVisitEntry> {
        match edge {
            NextDynamicVisitEntry::Module(..) => VisitControlFlow::Continue(edge),
            NextDynamicVisitEntry::DynamicImportsMap(_) => VisitControlFlow::Skip(edge),
        }
    }

    fn edges(&mut self, entry: &NextDynamicVisitEntry) -> Self::EdgesFuture {
        let &NextDynamicVisitEntry::Module(module, _) = entry else {
            unreachable!();
        };
        let client_asset_context = self.client_asset_context;
        async move {
            Ok(get_next_dynamic_edges(client_asset_context, *module)
                .await?
                .into_iter()
                .cloned())
        }
    }

    fn span(&mut self, entry: &NextDynamicVisitEntry) -> tracing::Span {
        let NextDynamicVisitEntry::Module(_, name) = entry else {
            unreachable!();
        };
        tracing::span!(Level::INFO, "next/dynamic visit", name = display(name))
    }
}

#[turbo_tasks::function]
async fn build_dynamic_imports_map_for_module(
    client_asset_context: Vc<Box<dyn AssetContext>>,
    server_module: ResolvedVc<Box<dyn Module>>,
) -> Result<Vc<OptionDynamicImportsMap>> {
    let Some(ecmascript_asset) =
        ResolvedVc::try_sidecast::<Box<dyn EcmascriptParsable>>(server_module).await?
    else {
        return Ok(Vc::cell(None));
    };

    // https://github.com/vercel/next.js/pull/56389#discussion_r1349336374
    // don't emit specific error as we expect there's a parse error already reported
    let ParseResult::Ok { program, .. } = &*ecmascript_asset.failsafe_parse().await? else {
        return Ok(Vc::cell(None));
    };

    // Reading the Program AST, collect raw imported module str if it's wrapped in
    // dynamic()
    let mut visitor = DynamicImportVisitor::new();
    program.visit_with(&mut visitor);

    if visitor.import_sources.is_empty() {
        return Ok(Vc::cell(None));
    }

    let mut import_sources = vec![];
    for import in visitor.import_sources.drain(..) {
        // Using the given `Module` which is the origin of the dynamic import, trying to
        // resolve the module that is being imported.
        let dynamic_imported_resolved_module = *esm_resolve(
            Vc::upcast(PlainResolveOrigin::new(
                client_asset_context,
                server_module.ident().path(),
            )),
            Request::parse(Value::new(Pattern::Constant(import.clone()))),
            Value::new(EcmaScriptModulesReferenceSubType::DynamicImport),
            false,
            None,
        )
        .first_module()
        .await?;

        if let Some(dynamic_imported_resolved_module) = dynamic_imported_resolved_module {
            import_sources.push((import, dynamic_imported_resolved_module));
        }
    }

    Ok(Vc::cell(Some(ResolvedVc::cell((
        server_module,
        import_sources,
    )))))
}

/// A visitor to check if there's import to `next/dynamic`, then collecting the
/// import wrapped with dynamic() via CollectImportSourceVisitor.
struct DynamicImportVisitor {
    dynamic_ident: Option<Ident>,
    pub import_sources: Vec<RcStr>,
}

impl DynamicImportVisitor {
    fn new() -> Self {
        Self {
            import_sources: vec![],
            dynamic_ident: None,
        }
    }
}

impl Visit for DynamicImportVisitor {
    fn visit_import_decl(&mut self, decl: &swc_core::ecma::ast::ImportDecl) {
        // find import decl from next/dynamic, i.e import dynamic from 'next/dynamic'
        if decl.src.value == *"next/dynamic" {
            if let Some(specifier) = decl.specifiers.first().and_then(|s| s.as_default()) {
                self.dynamic_ident = Some(specifier.local.clone());
            }
        }
    }

    fn visit_call_expr(&mut self, call_expr: &CallExpr) {
        // Collect imports if the import call is wrapped in the call dynamic()
        if let Callee::Expr(ident) = &call_expr.callee {
            if let Expr::Ident(ident) = &**ident {
                if let Some(dynamic_ident) = &self.dynamic_ident {
                    if ident.sym == *dynamic_ident.sym {
                        let mut collect_import_source_visitor = CollectImportSourceVisitor::new();
                        call_expr.visit_children_with(&mut collect_import_source_visitor);

                        if let Some(import_source) = collect_import_source_visitor.import_source {
                            self.import_sources.push(import_source);
                        }
                    }
                }
            }
        }

        call_expr.visit_children_with(self);
    }
}

/// A visitor to collect import source string from import('path/to/module')
struct CollectImportSourceVisitor {
    import_source: Option<RcStr>,
}

impl CollectImportSourceVisitor {
    fn new() -> Self {
        Self {
            import_source: None,
        }
    }
}

impl Visit for CollectImportSourceVisitor {
    fn visit_call_expr(&mut self, call_expr: &CallExpr) {
        // find import source from import('path/to/module')
        // [NOTE]: Turbopack does not support webpack-specific comment directives, i.e
        // import(/* webpackChunkName: 'hello1' */ '../../components/hello3')
        // Renamed chunk in the comment will be ignored.
        if let Callee::Import(_import) = call_expr.callee {
            if let Some(arg) = call_expr.args.first() {
                if let Expr::Lit(Lit::Str(str_)) = &*arg.expr {
                    self.import_source = Some(str_.value.as_str().into());
                }
            }
        }

        // Don't need to visit children, we expect import() won't have any
        // nested calls as dynamic() should be statically analyzable import.
    }
}

pub type DynamicImportedModules = Vec<(RcStr, ResolvedVc<Box<dyn Module>>)>;
pub type DynamicImportedOutputAssets = Vec<(RcStr, ResolvedVc<OutputAssets>)>;

/// A struct contains mapping for the dynamic imports to construct chunk per
/// each individual module (Origin Module, Vec<(ImportSourceString, Module)>)
#[turbo_tasks::value(transparent)]
pub struct DynamicImportsMap(pub (ResolvedVc<Box<dyn Module>>, DynamicImportedModules));

/// An Option wrapper around [DynamicImportsMap].
#[turbo_tasks::value(transparent)]
pub struct OptionDynamicImportsMap(Option<ResolvedVc<DynamicImportsMap>>);

#[turbo_tasks::value(transparent)]
pub struct DynamicImportedChunks(
    pub FxIndexMap<ResolvedVc<Box<dyn Module>>, DynamicImportedOutputAssets>,
);
