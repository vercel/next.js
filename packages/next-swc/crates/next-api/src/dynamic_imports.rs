use std::collections::HashMap;

use anyhow::{bail, Result};
use indexmap::IndexMap;
use turbo_tasks::{
    graph::{GraphTraversal, NonDeterministic},
    Value, Vc,
};
use turbopack_binding::{
    swc::core::ecma::{
        ast::{CallExpr, Callee, Expr, Ident, Lit},
        visit::{Visit, VisitWith},
    },
    turbopack::{
        build::BuildChunkingContext,
        core::{
            chunk::{
                availability_info::AvailabilityInfo, ChunkableModule, ChunkingContextExt,
                EvaluatableAssets,
            },
            issue::IssueSeverity,
            module::Module,
            output::OutputAssets,
            reference::primary_referenced_modules,
            reference_type::EcmaScriptModulesReferenceSubType,
            resolve::{origin::PlainResolveOrigin, parse::Request, pattern::Pattern},
        },
        ecmascript::{
            chunk::{EcmascriptChunkPlaceable, EcmascriptChunkingContext},
            parse::ParseResult,
            resolve::esm_resolve,
            EcmascriptModuleAsset,
        },
    },
};

async fn collect_chunk_group_inner<F>(
    dynamic_import_entries: IndexMap<Vc<Box<dyn Module>>, DynamicImportedModules>,
    build_chunk: F,
) -> Result<Vc<DynamicImportedChunks>>
where
    F: Fn(Vc<Box<dyn ChunkableModule>>) -> Vc<OutputAssets>,
{
    let mut chunks_hash: HashMap<String, Vc<OutputAssets>> = HashMap::new();
    let mut dynamic_import_chunks = IndexMap::new();

    // Iterate over the collected import mappings, and create a chunk for each
    // dynamic import.
    for (origin_module, dynamic_imports) in dynamic_import_entries {
        for (imported_raw_str, imported_module) in dynamic_imports {
            let chunk = if let Some(chunk) = chunks_hash.get(&imported_raw_str) {
                *chunk
            } else {
                let Some(chunk_item) =
                    Vc::try_resolve_sidecast::<Box<dyn ChunkableModule>>(imported_module).await?
                else {
                    bail!("module must be evaluatable");
                };

                // [Note]: this seems to create duplicated chunks for the same module to the original import() call
                // and the explicit chunk we ask in here. So there'll be at least 2
                // chunks for the same module, relying on
                // naive hash to have additonal
                // chunks in case if there are same modules being imported in differnt
                // origins.
                let chunk_group = build_chunk(chunk_item);
                chunks_hash.insert(imported_raw_str.to_string(), chunk_group);
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
    chunking_context: Vc<BuildChunkingContext>,
    dynamic_import_entries: IndexMap<Vc<Box<dyn Module>>, DynamicImportedModules>,
    availability_info: Value<AvailabilityInfo>,
) -> Result<Vc<DynamicImportedChunks>> {
    collect_chunk_group_inner(dynamic_import_entries, |chunk_item| {
        chunking_context.chunk_group_assets(chunk_item, availability_info)
    })
    .await
}

pub(crate) async fn collect_evaluated_chunk_group(
    chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
    dynamic_import_entries: IndexMap<Vc<Box<dyn Module>>, DynamicImportedModules>,
    evaluatable_assets: Vc<EvaluatableAssets>,
) -> Result<Vc<DynamicImportedChunks>> {
    collect_chunk_group_inner(dynamic_import_entries, |chunk_item| {
        chunking_context.evaluated_chunk_group_assets(
            chunk_item.ident(),
            evaluatable_assets,
            Value::new(AvailabilityInfo::Root),
        )
    })
    .await
}

/// Returns a mapping of the dynamic imports for each module, if the import is
/// wrapped in `next/dynamic`'s `dynamic()`. Refer https://nextjs.org/docs/pages/building-your-application/optimizing/lazy-loading#with-named-exports for the usecases.
///
/// If an import is specified as dynamic, next.js does few things:
/// - Runs a next_dynamic transform to the source file (https://github.com/vercel/next.js/blob/ae1b89984d26b2af3658001fa19a19e1e77c312d/packages/next-swc/crates/next-transform-dynamic/src/lib.rs#L22)
///   - This transform will inject `loadableGenerated` property, which contains the list of the import ids in the form of `${origin} -> ${imported}`.
///     (https://github.com/vercel/next.js/blob/ae1b89984d26b2af3658001fa19a19e1e77c312d/packages/next-swc/crates/next-transform-dynamic/tests/fixture/wrapped-import/output-webpack-dev.js#L5)
/// - Emits `react-loadable-manifest.json` which contains the mapping of the
///   import ids to the chunk ids.
///   - Webpack: (https://github.com/vercel/next.js/blob/ae1b89984d26b2af3658001fa19a19e1e77c312d/packages/next/src/build/webpack/plugins/react-loadable-plugin.ts)
///   - Turbopack: ( https://github.com/vercel/next.js/pull/56389/files#diff-3cac9d9bfe73e0619e6407f21f6fe652da0719d0ec9074ff813ad3e416d0eb1a
///     / https://github.com/vercel/next.js/pull/56389/files#diff-791951bbe1fa09bcbad9be9173412d0848168f7d658758f11b6e8888a021552c
///     / https://github.com/vercel/next.js/pull/56389/files#diff-c33f6895801329243dd3f627c69da259bcab95c2c9d12993152842591931ff01R557
///     )
/// - When running an application,
///    - Server reads generated `react-loadable-manifest.json`, sets dynamicImportIds with the mapping of the import ids, and dynamicImports to the actual corresponding chunks.
///      (https://github.com/vercel/next.js/blob/ad42b610c25b72561ad367b82b1c7383fd2a5dd2/packages/next/src/server/load-components.ts#L119 /
///       https://github.com/vercel/next.js/blob/ad42b610c25b72561ad367b82b1c7383fd2a5dd2/packages/next/src/server/render.tsx#L1417C7-L1420)
///    - Server embeds those into __NEXT_DATA__ and sent to the client. (https://github.com/vercel/next.js/blob/ad42b610c25b72561ad367b82b1c7383fd2a5dd2/packages/next/src/server/render.tsx#L1453)
///    - When client boots up, pass it to the client preload (https://github.com/vercel/next.js/blob/ad42b610c25b72561ad367b82b1c7383fd2a5dd2/packages/next/src/client/index.tsx#L943)
///    - Loadable runtime injects preload fn to wait until all the dynamic components are being loaded, this ensures hydration mismatch won't occur
///      (https://github.com/vercel/next.js/blob/ad42b610c25b72561ad367b82b1c7383fd2a5dd2/packages/next/src/shared/lib/loadable.shared-runtime.tsx#L281)
pub(crate) async fn collect_next_dynamic_imports(
    entry: Vc<Box<dyn EcmascriptChunkPlaceable>>,
) -> Result<IndexMap<Vc<Box<dyn Module>>, DynamicImportedModules>> {
    // Traverse referenced modules graph, collect all of the dynamic imports:
    // - Read the Program AST of the Module, this is the origin (A)
    //  - If there's `dynamic(import(B))`, then B is the module that is being
    //    imported
    // Returned import mappings are in the form of
    // (Module<A>, Vec<(B, Module<B>)>) (where B is the raw import source string,
    // and Module<B> is the actual resolved Module)
    let imported_modules_mapping = NonDeterministic::new()
        .skip_duplicates()
        .visit([Vc::upcast(entry)], get_referenced_modules)
        .await
        .completed()?
        .into_inner()
        .into_iter()
        .map(build_dynamic_imports_map_for_module);

    // Consolidate import mappings into a single indexmap
    let mut import_mappings: IndexMap<Vc<Box<dyn Module>>, DynamicImportedModules> =
        IndexMap::new();

    for module_mapping in imported_modules_mapping {
        if let Some(module_mapping) = &*module_mapping.await? {
            let (origin_module, dynamic_imports) = &*module_mapping.await?;
            import_mappings
                .entry(*origin_module)
                .or_insert_with(Vec::new)
                .append(&mut dynamic_imports.clone())
        }
    }

    Ok(import_mappings)
}

async fn get_referenced_modules(
    parent: Vc<Box<dyn Module>>,
) -> Result<impl Iterator<Item = Vc<Box<dyn Module>>> + Send> {
    primary_referenced_modules(parent)
        .await
        .map(|modules| modules.clone_value().into_iter())
}

#[turbo_tasks::function]
async fn build_dynamic_imports_map_for_module(
    module: Vc<Box<dyn Module>>,
) -> Result<Vc<OptionDynamicImportsMap>> {
    let Some(ecmascript_asset) =
        Vc::try_resolve_downcast_type::<EcmascriptModuleAsset>(module).await?
    else {
        return Ok(OptionDynamicImportsMap::none());
    };

    // https://github.com/vercel/next.js/pull/56389#discussion_r1349336374
    // don't emit specific error as we expect there's a parse error already reported
    let ParseResult::Ok { program, .. } = &*ecmascript_asset.parse().await? else {
        return Ok(OptionDynamicImportsMap::none());
    };

    // Reading the Program AST, collect raw imported module str if it's wrapped in
    // dynamic()
    let mut visitor = DynamicImportVisitor::new();
    program.visit_with(&mut visitor);

    if visitor.import_sources.is_empty() {
        return Ok(OptionDynamicImportsMap::none());
    }

    let mut import_sources = vec![];
    for import in visitor.import_sources.drain(..) {
        // Using the given `Module` which is the origin of the dynamic import, trying to
        // resolve the module that is being imported.
        let dynamic_imported_resolved_module = *esm_resolve(
            Vc::upcast(PlainResolveOrigin::new(
                ecmascript_asset.await?.asset_context,
                module.ident().path(),
            )),
            Request::parse(Value::new(Pattern::Constant(import.to_string()))),
            Value::new(EcmaScriptModulesReferenceSubType::Undefined),
            IssueSeverity::Error.cell(),
            None,
        )
        .first_module()
        .await?;

        if let Some(dynamic_imported_resolved_module) = dynamic_imported_resolved_module {
            import_sources.push((import, dynamic_imported_resolved_module));
        }
    }

    Ok(Vc::cell(Some(Vc::cell((module, import_sources)))))
}

/// A visitor to check if there's import to `next/dynamic`, then collecting the
/// import wrapped with dynamic() via CollectImportSourceVisitor.
struct DynamicImportVisitor {
    dynamic_ident: Option<Ident>,
    pub import_sources: Vec<String>,
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
    fn visit_import_decl(&mut self, decl: &turbopack_binding::swc::core::ecma::ast::ImportDecl) {
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
    import_source: Option<String>,
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
                    self.import_source = Some(str_.value.to_string());
                }
            }
        }

        // Don't need to visit children, we expect import() won't have any
        // nested calls as dynamic() should be statically analyzable import.
    }
}

pub type DynamicImportedModules = Vec<(String, Vc<Box<dyn Module>>)>;
pub type DynamicImportedOutputAssets = Vec<(String, Vc<OutputAssets>)>;

/// A struct contains mapping for the dynamic imports to construct chunk per
/// each individual module (Origin Module, Vec<(ImportSourceString, Module)>)
#[turbo_tasks::value(transparent)]
pub struct DynamicImportsMap(pub (Vc<Box<dyn Module>>, DynamicImportedModules));

/// An Option wrapper around [DynamicImportsMap].
#[turbo_tasks::value(transparent)]
pub struct OptionDynamicImportsMap(Option<Vc<DynamicImportsMap>>);

#[turbo_tasks::value_impl]
impl OptionDynamicImportsMap {
    #[turbo_tasks::function]
    pub fn none() -> Vc<Self> {
        Vc::cell(None)
    }
}

#[turbo_tasks::value(transparent)]
pub struct DynamicImportedChunks(pub IndexMap<Vc<Box<dyn Module>>, DynamicImportedOutputAssets>);
