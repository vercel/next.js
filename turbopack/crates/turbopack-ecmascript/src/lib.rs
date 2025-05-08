// Needed for swc visit_ macros
#![allow(non_local_definitions)]
#![feature(box_patterns)]
#![feature(min_specialization)]
#![feature(iter_intersperse)]
#![feature(int_roundings)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]
#![recursion_limit = "256"]

pub mod analyzer;
pub mod annotations;
pub mod async_chunk;
pub mod chunk;
pub mod code_gen;
mod errors;
pub mod magic_identifier;
pub mod manifest;
mod merged_module;
pub mod minify;
pub mod parse;
mod path_visitor;
pub mod references;
pub mod runtime_functions;
pub mod side_effect_optimization;
pub mod simple_tree_shake;
pub(crate) mod special_cases;
pub(crate) mod static_code;
mod swc_comments;
pub mod text;
pub(crate) mod transform;
pub mod tree_shake;
pub mod typescript;
pub mod utils;
pub mod webpack;
pub mod worker_chunk;

use std::{
    fmt::{Display, Formatter},
    mem::take,
    sync::Arc,
};

use anyhow::Result;
use chunk::EcmascriptChunkItem;
use code_gen::{CodeGeneration, CodeGenerationHoistedStmt};
use either::Either;
use parse::{ParseResult, parse};
use path_visitor::ApplyVisitors;
use references::esm::UrlRewriteBehavior;
pub use references::{AnalyzeEcmascriptModuleResult, TURBOPACK_HELPER};
use serde::{Deserialize, Serialize};
pub use static_code::StaticEcmascriptCode;
use swc_core::{
    atoms::Atom,
    base::SwcComments,
    common::{
        BytePos, DUMMY_SP, GLOBALS, Globals, Mark, SourceMap, SyntaxContext,
        comments::{Comment, Comments},
        util::take::Take,
    },
    ecma::{
        ast::{self, Expr, Id, ModuleItem, Program, Script},
        codegen::{Emitter, text_writer::JsWriter},
        visit::{VisitMut, VisitMutWith, VisitMutWithAstPath},
    },
    quote,
};
use tracing::Instrument;
pub use transform::{
    CustomTransformer, EcmascriptInputTransform, EcmascriptInputTransforms, TransformContext,
    TransformPlugin, UnsupportedServerActionIssue,
};
use turbo_rcstr::rcstr;
use turbo_tasks::{
    FxIndexMap, NonLocalValue, ReadRef, ResolvedVc, TaskInput, TryJoinIterExt, ValueToString, Vc,
    trace::TraceRawVcs,
};
use turbo_tasks_fs::{FileJsonContent, FileSystemPath, glob::Glob, rope::Rope};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        AsyncModuleInfo, ChunkItem, ChunkType, ChunkableModule, ChunkingContext, EvaluatableAsset,
        MergeableModule, MergeableModuleResult, MergeableModules, MinifyType,
    },
    compile_time_info::CompileTimeInfo,
    context::AssetContext,
    ident::AssetIdent,
    module::{Module, OptionModule},
    module_graph::ModuleGraph,
    reference::ModuleReferences,
    reference_type::InnerAssets,
    resolve::{
        FindContextFileResult, find_context_file, origin::ResolveOrigin, package_json,
        parse::Request,
    },
    source::Source,
    source_map::GenerateSourceMap,
};
// TODO remove this
pub use turbopack_resolve::ecmascript as resolve;

use self::chunk::{EcmascriptChunkItemContent, EcmascriptChunkType, EcmascriptExports};
use crate::{
    chunk::{EcmascriptChunkPlaceable, placeable::is_marked_as_side_effect_free},
    code_gen::{CodeGens, ModifiableAst},
    merged_module::MergedEcmascriptModule,
    parse::generate_js_source_map,
    references::{
        analyse_ecmascript_module, async_module::OptionAsyncModule, esm::base::EsmAssetReferences,
    },
    side_effect_optimization::reference::EcmascriptModulePartReference,
    simple_tree_shake::{ModuleExportUsageInfo, get_module_export_usages},
    swc_comments::ImmutableComments,
    transform::remove_shebang,
};

#[derive(
    Eq,
    PartialEq,
    Hash,
    Debug,
    Clone,
    Copy,
    Default,
    TaskInput,
    TraceRawVcs,
    NonLocalValue,
    Serialize,
    Deserialize,
)]
pub enum SpecifiedModuleType {
    #[default]
    Automatic,
    CommonJs,
    EcmaScript,
}

#[derive(
    PartialOrd,
    Ord,
    PartialEq,
    Eq,
    Hash,
    Debug,
    Clone,
    Copy,
    Default,
    Serialize,
    Deserialize,
    TaskInput,
    TraceRawVcs,
    NonLocalValue,
)]
#[serde(rename_all = "kebab-case")]
pub enum TreeShakingMode {
    #[default]
    ModuleFragments,
    ReexportsOnly,
}

#[turbo_tasks::value(transparent)]
pub struct OptionTreeShaking(pub Option<TreeShakingMode>);

#[turbo_tasks::value(shared)]
#[derive(Hash, Debug, Default, Copy, Clone)]
pub struct EcmascriptOptions {
    pub refresh: bool,
    /// variant of tree shaking to use
    pub tree_shaking_mode: Option<TreeShakingMode>,
    /// module is forced to a specific type (happens e. g. for .cjs and .mjs)
    pub specified_module_type: SpecifiedModuleType,
    /// Determines how to treat `new URL(...)` rewrites.
    /// This allows to construct url depends on the different building context,
    /// e.g. SSR, CSR, or Node.js.
    pub url_rewrite_behavior: Option<UrlRewriteBehavior>,
    /// External imports should used `__turbopack_import__` instead of
    /// `__turbopack_require__` and become async module references.
    pub import_externals: bool,
    /// Ignore very dynamic requests which doesn't have any static known part.
    /// If false, they will reference the whole directory. If true, they won't
    /// reference anything and lead to an runtime error instead.
    pub ignore_dynamic_requests: bool,
    /// If true, it reads a sourceMappingURL comment from the end of the file,
    /// reads and generates a source map.
    pub extract_source_map: bool,
    /// If true, it stores the last successful parse result in state and keeps using it when
    /// parsing fails. This is useful to keep the module graph structure intact when syntax errors
    /// are temporarily introduced.
    pub keep_last_successful_parse: bool,

    pub remove_unused_exports: bool,
}

#[turbo_tasks::value]
#[derive(Hash, Debug, Copy, Clone, TaskInput)]
pub enum EcmascriptModuleAssetType {
    /// Module with EcmaScript code
    Ecmascript,
    /// Module with TypeScript code without types
    Typescript {
        // parse JSX syntax.
        tsx: bool,
        // follow references to imported types.
        analyze_types: bool,
    },
    /// Module with TypeScript declaration code
    TypescriptDeclaration,
}

impl Display for EcmascriptModuleAssetType {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            EcmascriptModuleAssetType::Ecmascript => write!(f, "ecmascript"),
            EcmascriptModuleAssetType::Typescript { tsx, analyze_types } => {
                write!(f, "typescript")?;
                if *tsx {
                    write!(f, "with JSX")?;
                }
                if *analyze_types {
                    write!(f, "with types")?;
                }
                Ok(())
            }
            EcmascriptModuleAssetType::TypescriptDeclaration => write!(f, "typescript declaration"),
        }
    }
}

#[derive(Clone)]
pub struct EcmascriptModuleAssetBuilder {
    source: ResolvedVc<Box<dyn Source>>,
    asset_context: ResolvedVc<Box<dyn AssetContext>>,
    ty: EcmascriptModuleAssetType,
    transforms: ResolvedVc<EcmascriptInputTransforms>,
    options: ResolvedVc<EcmascriptOptions>,
    compile_time_info: ResolvedVc<CompileTimeInfo>,
    inner_assets: Option<ResolvedVc<InnerAssets>>,
}

impl EcmascriptModuleAssetBuilder {
    pub fn with_inner_assets(mut self, inner_assets: ResolvedVc<InnerAssets>) -> Self {
        self.inner_assets = Some(inner_assets);
        self
    }

    pub fn with_type(mut self, ty: EcmascriptModuleAssetType) -> Self {
        self.ty = ty;
        self
    }

    pub fn build(self) -> Vc<EcmascriptModuleAsset> {
        if let Some(inner_assets) = self.inner_assets {
            EcmascriptModuleAsset::new_with_inner_assets(
                *self.source,
                *self.asset_context,
                self.ty,
                *self.transforms,
                *self.options,
                *self.compile_time_info,
                *inner_assets,
            )
        } else {
            EcmascriptModuleAsset::new(
                *self.source,
                *self.asset_context,
                self.ty,
                *self.transforms,
                *self.options,
                *self.compile_time_info,
            )
        }
    }
}

#[turbo_tasks::value]
pub struct EcmascriptModuleAsset {
    pub source: ResolvedVc<Box<dyn Source>>,
    pub asset_context: ResolvedVc<Box<dyn AssetContext>>,
    pub ty: EcmascriptModuleAssetType,
    pub transforms: ResolvedVc<EcmascriptInputTransforms>,
    pub options: ResolvedVc<EcmascriptOptions>,
    pub compile_time_info: ResolvedVc<CompileTimeInfo>,
    pub inner_assets: Option<ResolvedVc<InnerAssets>>,
    #[turbo_tasks(debug_ignore)]
    last_successful_parse: turbo_tasks::TransientState<ReadRef<ParseResult>>,
}
impl core::fmt::Debug for EcmascriptModuleAsset {
    fn fmt(&self, f: &mut core::fmt::Formatter) -> core::fmt::Result {
        f.debug_struct("EcmascriptModuleAsset")
            .field("source", &self.source)
            .field("asset_context", &self.asset_context)
            .field("ty", &self.ty)
            .field("transforms", &self.transforms)
            .field("options", &self.options)
            .field("compile_time_info", &self.compile_time_info)
            .field("inner_assets", &self.inner_assets)
            .finish()
    }
}

#[turbo_tasks::value_trait]
pub trait EcmascriptParsable {
    #[turbo_tasks::function]
    fn failsafe_parse(self: Vc<Self>) -> Result<Vc<ParseResult>>;

    #[turbo_tasks::function]
    fn parse_original(self: Vc<Self>) -> Result<Vc<ParseResult>>;

    #[turbo_tasks::function]
    fn ty(self: Vc<Self>) -> Result<Vc<EcmascriptModuleAssetType>>;
}

#[turbo_tasks::value_trait]
pub trait EcmascriptAnalyzable: Module + Asset {
    #[turbo_tasks::function]
    fn analyze(self: Vc<Self>) -> Vc<AnalyzeEcmascriptModuleResult>;

    /// Generates module contents without an analysis pass. This is useful for
    /// transforming code that is not a module, e.g. runtime code.
    #[turbo_tasks::function]
    async fn module_content_without_analysis(
        self: Vc<Self>,
        generate_source_map: bool,
    ) -> Result<Vc<EcmascriptModuleContent>>;

    #[turbo_tasks::function]
    async fn module_content_options(
        self: Vc<Self>,
        module_graph: Vc<ModuleGraph>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<EcmascriptModuleContentOptions>>;

    #[turbo_tasks::function]
    async fn module_content(
        self: Vc<Self>,
        module_graph: Vc<ModuleGraph>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<EcmascriptModuleContent>> {
        let own_options =
            self.module_content_options(module_graph, chunking_context, async_module_info);
        Ok(EcmascriptModuleContent::new(own_options))
    }
}

impl EcmascriptModuleAsset {
    pub fn builder(
        source: ResolvedVc<Box<dyn Source>>,
        asset_context: ResolvedVc<Box<dyn AssetContext>>,
        transforms: ResolvedVc<EcmascriptInputTransforms>,
        options: ResolvedVc<EcmascriptOptions>,
        compile_time_info: ResolvedVc<CompileTimeInfo>,
    ) -> EcmascriptModuleAssetBuilder {
        EcmascriptModuleAssetBuilder {
            source,
            asset_context,
            ty: EcmascriptModuleAssetType::Ecmascript,
            transforms,
            options,
            compile_time_info,
            inner_assets: None,
        }
    }
}

#[turbo_tasks::value]
#[derive(Copy, Clone)]
pub(crate) struct ModuleTypeResult {
    pub module_type: SpecifiedModuleType,
    pub referenced_package_json: Option<ResolvedVc<FileSystemPath>>,
}

#[turbo_tasks::value_impl]
impl ModuleTypeResult {
    #[turbo_tasks::function]
    fn new(module_type: SpecifiedModuleType) -> Vc<Self> {
        Self::cell(ModuleTypeResult {
            module_type,
            referenced_package_json: None,
        })
    }

    #[turbo_tasks::function]
    fn new_with_package_json(
        module_type: SpecifiedModuleType,
        package_json: ResolvedVc<FileSystemPath>,
    ) -> Vc<Self> {
        Self::cell(ModuleTypeResult {
            module_type,
            referenced_package_json: Some(package_json),
        })
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptParsable for EcmascriptModuleAsset {
    #[turbo_tasks::function(invalidator)]
    async fn failsafe_parse(self: Vc<Self>) -> Result<Vc<ParseResult>> {
        let real_result = self.parse();
        let this = self.await?;
        if this.options.await?.keep_last_successful_parse {
            let real_result_value = real_result.await?;
            let result_value = if matches!(*real_result_value, ParseResult::Ok { .. }) {
                this.last_successful_parse.set(real_result_value.clone());
                real_result_value
            } else {
                let state_ref = this.last_successful_parse.get();
                state_ref.as_ref().unwrap_or(&real_result_value).clone()
            };
            Ok(ReadRef::cell(result_value))
        } else {
            Ok(real_result)
        }
    }

    #[turbo_tasks::function]
    fn parse_original(self: Vc<Self>) -> Vc<ParseResult> {
        self.failsafe_parse()
    }

    #[turbo_tasks::function]
    fn ty(&self) -> Vc<EcmascriptModuleAssetType> {
        self.ty.cell()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptAnalyzable for EcmascriptModuleAsset {
    #[turbo_tasks::function]
    fn analyze(self: Vc<Self>) -> Vc<AnalyzeEcmascriptModuleResult> {
        analyse_ecmascript_module(self, None)
    }

    /// Generates module contents without an analysis pass. This is useful for
    /// transforming code that is not a module, e.g. runtime code.
    #[turbo_tasks::function]
    async fn module_content_without_analysis(
        self: Vc<Self>,
        generate_source_map: bool,
    ) -> Result<Vc<EcmascriptModuleContent>> {
        let this = self.await?;

        let parsed = self.parse();

        Ok(EcmascriptModuleContent::new_without_analysis(
            parsed,
            self.ident(),
            this.options.await?.specified_module_type,
            generate_source_map,
        ))
    }

    #[turbo_tasks::function]
    async fn module_content_options(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        async_module_info: Option<ResolvedVc<AsyncModuleInfo>>,
    ) -> Result<Vc<EcmascriptModuleContentOptions>> {
        let parsed = self.parse().to_resolved().await?;

        let analyze = self.analyze();
        let analyze_ref = analyze.await?;

        let module_type_result = *self.determine_module_type().await?;
        let generate_source_map = *chunking_context
            .reference_module_source_maps(Vc::upcast(*self))
            .await?;

        let export_usage_info = if self.options().await?.remove_unused_exports {
            Some(
                get_module_export_usages(*module_graph, Vc::upcast(*self))
                    .to_resolved()
                    .await?,
            )
        } else {
            None
        };

        Ok(EcmascriptModuleContentOptions {
            parsed,
            ident: self.ident().to_resolved().await?,
            specified_module_type: module_type_result.module_type,
            module_graph,
            chunking_context,
            references: analyze.references().to_resolved().await?,
            esm_references: analyze_ref.esm_references,
            part_references: vec![],
            code_generation: analyze_ref.code_generation,
            async_module: analyze_ref.async_module,
            generate_source_map,
            original_source_map: analyze_ref.source_map,
            exports: analyze_ref.exports,
            async_module_info,
            export_usage_info,
        }
        .cell())
    }
}

#[turbo_tasks::function]
async fn determine_module_type_for_directory(
    context_path: Vc<FileSystemPath>,
) -> Result<Vc<ModuleTypeResult>> {
    let find_package_json =
        find_context_file(context_path, package_json().resolve().await?).await?;
    let FindContextFileResult::Found(package_json, _) = *find_package_json else {
        return Ok(ModuleTypeResult::new(SpecifiedModuleType::Automatic));
    };

    // analysis.add_reference(PackageJsonReference::new(package_json));
    if let FileJsonContent::Content(content) = &*package_json.read_json().await?
        && let Some(r#type) = content.get("type")
    {
        return Ok(ModuleTypeResult::new_with_package_json(
            match r#type.as_str() {
                Some("module") => SpecifiedModuleType::EcmaScript,
                Some("commonjs") => SpecifiedModuleType::CommonJs,
                _ => SpecifiedModuleType::Automatic,
            },
            *package_json,
        ));
    }

    Ok(ModuleTypeResult::new_with_package_json(
        SpecifiedModuleType::Automatic,
        *package_json,
    ))
}

#[turbo_tasks::value_impl]
impl EcmascriptModuleAsset {
    #[turbo_tasks::function]
    pub fn new(
        source: ResolvedVc<Box<dyn Source>>,
        asset_context: ResolvedVc<Box<dyn AssetContext>>,
        ty: EcmascriptModuleAssetType,
        transforms: ResolvedVc<EcmascriptInputTransforms>,
        options: ResolvedVc<EcmascriptOptions>,
        compile_time_info: ResolvedVc<CompileTimeInfo>,
    ) -> Vc<Self> {
        Self::cell(EcmascriptModuleAsset {
            source,
            asset_context,
            ty,
            transforms,
            options,

            compile_time_info,
            inner_assets: None,
            last_successful_parse: Default::default(),
        })
    }

    #[turbo_tasks::function]
    pub async fn new_with_inner_assets(
        source: ResolvedVc<Box<dyn Source>>,
        asset_context: ResolvedVc<Box<dyn AssetContext>>,
        ty: EcmascriptModuleAssetType,
        transforms: ResolvedVc<EcmascriptInputTransforms>,
        options: ResolvedVc<EcmascriptOptions>,
        compile_time_info: ResolvedVc<CompileTimeInfo>,
        inner_assets: ResolvedVc<InnerAssets>,
    ) -> Result<Vc<Self>> {
        if inner_assets.await?.is_empty() {
            Ok(Self::new(
                *source,
                *asset_context,
                ty,
                *transforms,
                *options,
                *compile_time_info,
            ))
        } else {
            Ok(Self::cell(EcmascriptModuleAsset {
                source,
                asset_context,
                ty,
                transforms,
                options,
                compile_time_info,
                inner_assets: Some(inner_assets),
                last_successful_parse: Default::default(),
            }))
        }
    }

    #[turbo_tasks::function]
    pub fn source(&self) -> Vc<Box<dyn Source>> {
        *self.source
    }

    #[turbo_tasks::function]
    pub fn analyze(self: Vc<Self>) -> Vc<AnalyzeEcmascriptModuleResult> {
        analyse_ecmascript_module(self, None)
    }

    #[turbo_tasks::function]
    pub fn options(&self) -> Vc<EcmascriptOptions> {
        *self.options
    }

    #[turbo_tasks::function]
    pub fn parse(&self) -> Vc<ParseResult> {
        parse(*self.source, self.ty, *self.transforms)
    }
}

impl EcmascriptModuleAsset {
    #[tracing::instrument(level = "trace", skip_all)]
    pub(crate) async fn determine_module_type(self: Vc<Self>) -> Result<ReadRef<ModuleTypeResult>> {
        let this = self.await?;

        match this.options.await?.specified_module_type {
            SpecifiedModuleType::EcmaScript => {
                return ModuleTypeResult::new(SpecifiedModuleType::EcmaScript).await;
            }
            SpecifiedModuleType::CommonJs => {
                return ModuleTypeResult::new(SpecifiedModuleType::CommonJs).await;
            }
            SpecifiedModuleType::Automatic => {}
        }

        determine_module_type_for_directory(
            self.origin_path()
                .resolve()
                .await?
                .parent()
                .resolve()
                .await?,
        )
        .await
    }
}

#[turbo_tasks::value_impl]
impl Module for EcmascriptModuleAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let mut ident = self.source.ident().owned().await?;
        if let Some(inner_assets) = self.inner_assets {
            for (name, asset) in inner_assets.await?.iter() {
                ident.add_asset(name.clone(), asset.ident().to_resolved().await?);
            }
        }
        ident.add_modifier(rcstr!("ecmascript"));
        ident.layer = Some(self.asset_context.layer().owned().await?);
        Ok(AssetIdent::new(ident))
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        Ok(self.analyze().references())
    }

    #[turbo_tasks::function]
    async fn is_self_async(self: Vc<Self>) -> Result<Vc<bool>> {
        if let Some(async_module) = *self.get_async_module().await? {
            Ok(async_module.is_self_async(self.references()))
        } else {
            Ok(Vc::cell(false))
        }
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptModuleAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}

#[turbo_tasks::value_impl]
impl ChunkableModule for EcmascriptModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: ResolvedVc<Self>,
        module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn ChunkItem>> {
        Vc::upcast(ModuleChunkItem::cell(ModuleChunkItem {
            module: self,
            module_graph,
            chunking_context,
        }))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for EcmascriptModuleAsset {
    #[turbo_tasks::function]
    async fn get_exports(self: Vc<Self>) -> Result<Vc<EcmascriptExports>> {
        Ok(*self.analyze().await?.exports)
    }

    #[turbo_tasks::function]
    async fn get_async_module(self: Vc<Self>) -> Result<Vc<OptionAsyncModule>> {
        Ok(*self.analyze().await?.async_module)
    }

    #[turbo_tasks::function]
    async fn is_marked_as_side_effect_free(
        self: Vc<Self>,
        side_effect_free_packages: Vc<Glob>,
    ) -> Result<Vc<bool>> {
        // Check package.json first, so that we can skip parsing the module if it's marked that way.
        let pkg_side_effect_free =
            is_marked_as_side_effect_free(self.ident().path(), side_effect_free_packages);
        Ok(if *pkg_side_effect_free.await? {
            pkg_side_effect_free
        } else {
            Vc::cell(self.analyze().await?.has_side_effect_free_directive)
        })
    }
}

#[turbo_tasks::value_impl]
impl MergeableModule for EcmascriptModuleAsset {
    // Clippy is wrong here, they are not equivalent (the for-loop restarts the iterator)
    #[allow(clippy::while_let_on_iterator)]
    #[turbo_tasks::function]
    async fn merge(
        self: ResolvedVc<Self>,
        modules: Vc<MergeableModules>,
    ) -> Result<Vc<MergeableModuleResult>> {
        let modules = modules.await?;
        let mut modules = modules.iter();

        let mut skipped = 0;
        let mut consumed_modules = vec![];

        while let Some(m) = modules.next() {
            // Skip some modules, try to find the first eligible module
            if let Some(m) = ResolvedVc::try_sidecast::<Box<dyn EcmascriptAnalyzable>>(*m) {
                consumed_modules.push(m);
                // Consume as many as possible to merge together
                while let Some(m) = modules.next() {
                    if let Some(m) = ResolvedVc::try_sidecast::<Box<dyn EcmascriptAnalyzable>>(*m) {
                        consumed_modules.push(m);
                    } else {
                        break;
                    }
                }
                if consumed_modules.len() > 1 {
                    // Successfully found something to
                    break;
                } else {
                    // Only a single module, ignore this one and try to find a bigger sequence in
                    // the remaining list.
                    consumed_modules.clear();
                    skipped += 1;
                }
            } else {
                skipped += 1;
            }
        }

        if !consumed_modules.is_empty() {
            #[allow(unreachable_code)]
            Ok(MergeableModuleResult::Merged {
                consumed: consumed_modules.len() as u32,
                skipped,
                merged_module: ResolvedVc::upcast(MergedEcmascriptModule::new(
                    consumed_modules,
                    // TODO where to get options from?
                    self.options().to_resolved().await?,
                )),
            }
            .cell())
        } else {
            Ok(MergeableModuleResult::not_merged())
        }
    }
}

#[turbo_tasks::value_impl]
impl EvaluatableAsset for EcmascriptModuleAsset {}

#[turbo_tasks::value_impl]
impl ResolveOrigin for EcmascriptModuleAsset {
    #[turbo_tasks::function]
    fn origin_path(&self) -> Vc<FileSystemPath> {
        self.source.ident().path()
    }

    #[turbo_tasks::function]
    fn asset_context(&self) -> Vc<Box<dyn AssetContext>> {
        *self.asset_context
    }

    #[turbo_tasks::function]
    async fn get_inner_asset(&self, request: Vc<Request>) -> Result<Vc<OptionModule>> {
        Ok(Vc::cell(if let Some(inner_assets) = &self.inner_assets {
            if let Some(request) = request.await?.request() {
                inner_assets.await?.get(&request).copied()
            } else {
                None
            }
        } else {
            None
        }))
    }
}

#[turbo_tasks::value]
struct ModuleChunkItem {
    module: ResolvedVc<EcmascriptModuleAsset>,
    module_graph: ResolvedVc<ModuleGraph>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl ChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *ResolvedVc::upcast(self.chunking_context)
    }

    #[turbo_tasks::function]
    async fn ty(&self) -> Result<Vc<Box<dyn ChunkType>>> {
        Ok(Vc::upcast(
            Vc::<EcmascriptChunkType>::default().resolve().await?,
        ))
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        *ResolvedVc::upcast(self.module)
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<EcmascriptChunkItemContent> {
        panic!("content() should not be called");
    }

    #[turbo_tasks::function]
    async fn content_with_async_module_info(
        self: Vc<Self>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let span = tracing::info_span!(
            "code generation",
            module = self.asset_ident().to_string().await?.to_string()
        );
        async {
            let this = self.await?;
            let async_module_options = this
                .module
                .get_async_module()
                .module_options(async_module_info);

            // TODO check if we need to pass async_module_info at all
            let content = this.module.module_content(
                *this.module_graph,
                *this.chunking_context,
                async_module_info,
            );

            EcmascriptChunkItemContent::new(
                content,
                *this.chunking_context,
                this.module.options(),
                async_module_options,
            )
            .resolve()
            .await
        }
        .instrument(span)
        .await
    }
}

/// The transformed contents of an Ecmascript module.
#[turbo_tasks::value(shared)]
pub struct EcmascriptModuleContent {
    pub inner_code: Rope,
    pub source_map: Option<Rope>,
    pub is_esm: bool,
    // pub refresh: bool,
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug, Hash, TaskInput)]
pub struct EcmascriptModuleContentOptions {
    parsed: ResolvedVc<ParseResult>,
    ident: ResolvedVc<AssetIdent>,
    specified_module_type: SpecifiedModuleType,
    module_graph: ResolvedVc<ModuleGraph>,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    references: ResolvedVc<ModuleReferences>,
    esm_references: ResolvedVc<EsmAssetReferences>,
    part_references: Vec<ResolvedVc<EcmascriptModulePartReference>>,
    code_generation: ResolvedVc<CodeGens>,
    async_module: ResolvedVc<OptionAsyncModule>,
    generate_source_map: bool,
    original_source_map: Option<ResolvedVc<Box<dyn GenerateSourceMap>>>,
    exports: ResolvedVc<EcmascriptExports>,
    async_module_info: Option<ResolvedVc<AsyncModuleInfo>>,
    export_usage_info: Option<ResolvedVc<ModuleExportUsageInfo>>,
}

impl EcmascriptModuleContentOptions {
    async fn merged_code_gens(
        &self,
        scope_hoisting_context: Option<ScopeHoistingContext<'_>>,
    ) -> Result<Vec<CodeGeneration>> {
        let EcmascriptModuleContentOptions {
            parsed,
            module_graph,
            chunking_context,
            references,
            esm_references,
            part_references,
            code_generation,
            async_module,
            exports,
            async_module_info,
            export_usage_info,
            ..
        } = self;

        async {
            let additional_code_gens = [
                if let Some(async_module) = &*async_module.await? {
                    Some(
                        async_module
                            .code_generation(
                                async_module_info.map(|info| *info),
                                **references,
                                **chunking_context,
                            )
                            .await?,
                    )
                } else {
                    None
                },
                if let EcmascriptExports::EsmExports(exports) = *exports.await? {
                    Some(
                        exports
                            .code_generation(
                                **chunking_context,
                                scope_hoisting_context,
                                Some(**parsed),
                                *export_usage_info,
                            )
                            .await?,
                    )
                } else {
                    None
                },
            ];

            let esm_code_gens = esm_references
                .await?
                .iter()
                .map(|r| r.code_generation(**chunking_context, scope_hoisting_context))
                .try_join()
                .await?;

            let part_code_gens = part_references
                .iter()
                .map(|r| r.code_generation(**chunking_context))
                .try_join()
                .await?;

            let code_gens = code_generation
                .await?
                .iter()
                .map(|c| {
                    c.code_generation(**module_graph, **chunking_context, scope_hoisting_context)
                })
                .try_join()
                .await?;

            anyhow::Ok(
                esm_code_gens
                    .into_iter()
                    .chain(part_code_gens.into_iter())
                    .chain(additional_code_gens.into_iter().flatten())
                    .chain(code_gens.into_iter())
                    .collect(),
            )
        }
        .instrument(tracing::info_span!("precompute code generation"))
        .await
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptModuleContent {
    /// Creates a new [`Vc<EcmascriptModuleContent>`].
    #[turbo_tasks::function]
    pub async fn new(input: Vc<EcmascriptModuleContentOptions>) -> Result<Vc<Self>> {
        let input = input.await?;
        let EcmascriptModuleContentOptions {
            parsed,
            ident,
            specified_module_type,
            generate_source_map,
            original_source_map,
            chunking_context,
            ..
        } = &*input;

        let code_gens = input.merged_code_gens(None).await?;
        async {
            let minify = chunking_context.minify_type().await?;

            let content = process_parse_result(
                *parsed,
                **ident,
                *specified_module_type,
                code_gens,
                *generate_source_map,
                *original_source_map,
                *minify,
                false,
            )
            .await?;
            emit_content(content).await
        }
        .instrument(tracing::info_span!("gen content with code gens"))
        .await
    }

    /// Creates a new [`Vc<EcmascriptModuleContent>`] without an analysis pass.
    #[turbo_tasks::function]
    pub async fn new_without_analysis(
        parsed: Vc<ParseResult>,
        ident: Vc<AssetIdent>,
        specified_module_type: SpecifiedModuleType,
        generate_source_map: bool,
    ) -> Result<Vc<Self>> {
        let content = process_parse_result(
            parsed.to_resolved().await?,
            ident,
            specified_module_type,
            vec![],
            generate_source_map,
            None,
            MinifyType::NoMinify,
            false,
        )
        .await?;
        emit_content(content).await
    }

    /// Creates a new [`Vc<EcmascriptModuleContent>`] from multiple modules, performing scope
    /// hoisting.
    #[turbo_tasks::function]
    pub async fn new_merged(
        modules: Vec<ResolvedVc<Box<dyn EcmascriptAnalyzable>>>,
        module_options: Vec<Vc<EcmascriptModuleContentOptions>>,
    ) -> Result<Vc<Self>> {
        let modules = modules
            .iter()
            .map(|m| {
                (
                    ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(*m).unwrap(),
                    // TODO when is a module exposed?
                    true,
                )
            })
            .collect::<FxIndexMap<_, _>>();

        let globals_merged = Globals::default();
        let merged_ctxts = GLOBALS.set(&globals_merged, || {
            let exports_mark = Mark::new();
            FxIndexMap::from_iter(modules.keys().map(|m| {
                (
                    *m,
                    SyntaxContext::empty().apply_mark(Mark::fresh(exports_mark)),
                )
            }))
        });

        let contents = module_options
            .iter()
            .zip(modules.keys().copied())
            .map(async |(options, module)| {
                let options = options.await?;
                let EcmascriptModuleContentOptions {
                    chunking_context,
                    parsed,
                    ident,
                    specified_module_type,
                    generate_source_map,
                    original_source_map,
                    ..
                } = &*options;
                let var_name = parsed.await?;
                let globals = if let ParseResult::Ok { globals, .. } = &*var_name {
                    globals
                } else {
                    unreachable!()
                };
                let (is_export_mark, module_marks) = GLOBALS.set(globals, || {
                    (
                        Mark::new(),
                        FxIndexMap::from_iter(modules.keys().map(|m| (*m, Mark::new()))),
                    )
                });
                let ctx = ScopeHoistingContext {
                    module,
                    modules: &modules,
                    is_export_mark,
                    module_marks: &module_marks,
                };
                let code_gens = options.merged_code_gens(Some(ctx)).await?;
                Ok((
                    module,
                    module_marks,
                    is_export_mark,
                    process_parse_result(
                        *parsed,
                        **ident,
                        *specified_module_type,
                        code_gens,
                        *generate_source_map,
                        *original_source_map,
                        *chunking_context.minify_type().await?,
                        true,
                    )
                    .await?,
                ))
            })
            .try_join()
            .await?;

        struct SetSyntaxContextVisitor<'a> {
            current_module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
            // A marker to identify the special cross-module variable references
            export_mark: Mark,
            // The syntax contexts in the merged AST (each module has its own)
            merged_ctxts:
                &'a FxIndexMap<ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>, SyntaxContext>,
            // The export marks in the current AST, which will be mapped to merged_ctxts
            current_module_marks:
                &'a FxIndexMap<ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>, Mark>,
        }
        impl VisitMut for SetSyntaxContextVisitor<'_> {
            fn visit_mut_syntax_context(&mut self, ctxt: &mut SyntaxContext) {
                let module = if ctxt.has_mark(self.export_mark) {
                    *self
                        .current_module_marks
                        .iter()
                        .filter_map(|(module, mark)| {
                            if ctxt.has_mark(*mark) {
                                Some(module)
                            } else {
                                None
                            }
                        })
                        .next()
                        .unwrap()
                } else {
                    self.current_module
                };

                *ctxt = *self.merged_ctxts.get(&module).unwrap();
            }
            // fn visit_mut_span(&mut self, span: &mut Span) {}
        }

        // TODO properly merge ASTs:
        // - somehow merge the SourceMap struct
        let merged_ast = {
            let mut merged_ast = Program::Module(swc_core::ecma::ast::Module {
                span: DUMMY_SP,
                shebang: None,
                body: contents
                    .into_iter()
                    .flat_map(|(module, module_marks, export_mark, content)| {
                        if let CodeGenResult {
                            program: Program::Module(mut content),
                            globals,
                            ..
                        } = content
                        {
                            GLOBALS.set(&*globals, || {
                                content.visit_mut_with(&mut SetSyntaxContextVisitor {
                                    current_module: module,
                                    export_mark,
                                    merged_ctxts: &merged_ctxts,
                                    current_module_marks: &module_marks,
                                });
                            });

                            content.body.clone()
                        } else {
                            unreachable!()
                        }
                    })
                    .collect(),
            });
            GLOBALS.set(&globals_merged, || {
                merged_ast
                    .visit_mut_with(&mut swc_core::ecma::transforms::base::hygiene::hygiene());
            });
            merged_ast
        };
        let content = CodeGenResult {
            program: merged_ast,
            source_map: Arc::new(SourceMap::default()),
            globals: Arc::new(globals_merged),
            comments: Either::Left(Default::default()),
            is_esm: true,
            generate_source_map: false,
            original_source_map: None,
            minify: *module_options
                .first()
                .unwrap()
                .await?
                .chunking_context
                .minify_type()
                .await?,
            extra_comments: SwcComments::default(),
        };
        emit_content(content).await
    }
}

#[allow(clippy::type_complexity)]
// struct DisplayContextVisitor {
//     postfix: &'static str,
// }
// impl VisitMut for DisplayContextVisitor {
//     fn visit_mut_ident(&mut self, ident: &mut Ident) {
//         ident.sym = format!("{}$$${}{}", ident.sym, self.postfix, ident.ctxt.as_u32()).into();
//     }
// }
#[derive(Clone, Copy)]
pub struct ScopeHoistingContext<'a> {
    module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    modules: &'a FxIndexMap<ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>, bool>,
    is_export_mark: Mark,
    module_marks: &'a FxIndexMap<ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>, Mark>,
}

struct CodeGenResult {
    program: Program,
    source_map: Arc<SourceMap>,
    globals: Arc<Globals>,
    comments: Either<ImmutableComments, Arc<ImmutableComments>>,
    extra_comments: SwcComments,
    is_esm: bool,
    generate_source_map: bool,
    original_source_map: Option<ResolvedVc<Box<dyn GenerateSourceMap>>>,
    minify: MinifyType,
}

async fn process_parse_result(
    parsed: ResolvedVc<ParseResult>,
    ident: Vc<AssetIdent>,
    specified_module_type: SpecifiedModuleType,
    mut code_gens: Vec<CodeGeneration>,
    generate_source_map: bool,
    original_source_map: Option<ResolvedVc<Box<dyn GenerateSourceMap>>>,
    minify: MinifyType,
    retain_syntax_context: bool,
) -> Result<CodeGenResult> {
    let parsed = parsed.final_read_hint().await?;

    Ok(match &*parsed {
        ParseResult::Ok { .. } => {
            let extra_comments = SwcComments {
                leading: Default::default(),
                trailing: Default::default(),
            };

            // We need a mutable version of the AST. We try to avoid cloning it by unwrapping the
            // ReadRef.
            let mut parsed = ReadRef::try_unwrap(parsed);
            let (mut program, source_map, globals, eval_context, comments) = match &mut parsed {
                Ok(ParseResult::Ok {
                    program,
                    source_map,
                    globals,
                    eval_context,
                    comments,
                }) => (
                    program.take(),
                    &*source_map,
                    &*globals,
                    &*eval_context,
                    match Arc::try_unwrap(take(comments)) {
                        Ok(comments) => Either::Left(comments),
                        Err(comments) => Either::Right(comments),
                    },
                ),
                Err(parsed) => {
                    let ParseResult::Ok {
                        program,
                        source_map,
                        globals,
                        eval_context,
                        comments,
                    } = &**parsed
                    else {
                        unreachable!();
                    };
                    (
                        program.clone(),
                        source_map,
                        globals,
                        eval_context,
                        Either::Right(comments.clone()),
                    )
                }
                _ => unreachable!(),
            };
            let top_level_mark = eval_context.top_level_mark;
            let is_esm = eval_context.is_esm(specified_module_type);

            process_content_with_code_gens(&mut program, globals, &mut code_gens);

            for comments in code_gens.iter_mut().flat_map(|cg| cg.comments.as_mut()) {
                let leading = Arc::unwrap_or_clone(take(&mut comments.leading));
                let trailing = Arc::unwrap_or_clone(take(&mut comments.trailing));

                for (pos, v) in leading {
                    extra_comments.leading.entry(pos).or_default().extend(v);
                }

                for (pos, v) in trailing {
                    extra_comments.trailing.entry(pos).or_default().extend(v);
                }
            }

            GLOBALS.set(globals, || {
                if retain_syntax_context {
                    program.visit_mut_with(&mut hygiene_rename_only(Some(top_level_mark)));
                } else {
                    program.visit_mut_with(
                        &mut swc_core::ecma::transforms::base::hygiene::hygiene_with_config(
                            swc_core::ecma::transforms::base::hygiene::Config {
                                top_level_mark,
                                ..Default::default()
                            },
                        ),
                    );
                }
                // program.visit_mut_with(&mut DisplayContextVisitor {
                //     postfix: "individual",
                // });
                program.visit_mut_with(&mut swc_core::ecma::transforms::base::fixer::fixer(None));

                // we need to remove any shebang before bundling as it's only valid as the first
                // line in a js file (not in a chunk item wrapped in the runtime)
                remove_shebang(&mut program);
            });

            CodeGenResult {
                program,
                source_map: source_map.clone(),
                globals: globals.clone(),
                comments,
                extra_comments,
                is_esm,
                generate_source_map,
                original_source_map,
                minify,
            }
        }
        ParseResult::Unparseable { messages } => {
            let path = ident.path().to_string().await?;
            let error_messages = messages
                .as_ref()
                .and_then(|m| m.first().map(|f| format!("\n{f}")))
                .unwrap_or("".into());
            let msg = format!("Could not parse module '{path}'\n{error_messages}");
            let body = vec![
                quote!(
                    "const e = new Error($msg);" as Stmt,
                    msg: Expr = Expr::Lit(msg.into()),
                ),
                quote!("e.code = 'MODULE_UNPARSEABLE';" as Stmt),
                quote!("throw e;" as Stmt),
            ];

            CodeGenResult {
                program: Program::Script(Script {
                    span: DUMMY_SP,
                    body,
                    shebang: None,
                }),
                source_map: Arc::new(SourceMap::default()),
                globals: Arc::new(Globals::default()),
                comments: Either::Left(Default::default()),
                extra_comments: Default::default(),
                is_esm: false,
                generate_source_map: false,
                original_source_map: None,
                minify: MinifyType::NoMinify,
            }
        }
        ParseResult::NotFound => {
            let path = ident.path().to_string().await?;
            let msg = format!("Could not parse module '{path}'");
            let body = vec![
                quote!(
                    "const e = new Error($msg);" as Stmt,
                    msg: Expr = Expr::Lit(msg.into()),
                ),
                quote!("e.code = 'MODULE_UNPARSEABLE';" as Stmt),
                quote!("throw e;" as Stmt),
            ];
            CodeGenResult {
                program: Program::Script(Script {
                    span: DUMMY_SP,
                    body,
                    shebang: None,
                }),
                source_map: Arc::new(SourceMap::default()),
                globals: Arc::new(Globals::default()),
                comments: Either::Left(Default::default()),
                extra_comments: Default::default(),
                is_esm: false,
                generate_source_map: false,
                original_source_map: None,
                minify: MinifyType::NoMinify,
            }
        }
    })
}

async fn emit_content(content: CodeGenResult) -> Result<Vc<EcmascriptModuleContent>> {
    let CodeGenResult {
        program,
        source_map,
        comments,
        extra_comments,
        is_esm,
        generate_source_map,
        original_source_map,
        minify,
        globals: _,
    } = content;

    let mut bytes: Vec<u8> = vec![];
    // TODO: Insert this as a sourceless segment so that sourcemaps aren't affected.
    // = format!("/* {} */\n", self.module.path().to_string().await?).into_bytes();

    let mut mappings = vec![];

    {
        let comments = match comments {
            Either::Left(comments) => Either::Left(comments.into_consumable()),
            Either::Right(ref comments) => Either::Right(comments.consumable()),
        };
        let comments: &dyn Comments = match &comments {
            Either::Left(comments) => comments,
            Either::Right(comments) => comments,
        };

        let comments = MergedComments {
            baseline: comments,
            mutable: extra_comments,
        };

        let mut wr = JsWriter::new(
            source_map.clone(),
            "\n",
            &mut bytes,
            generate_source_map.then_some(&mut mappings),
        );
        if matches!(minify, MinifyType::Minify { .. }) {
            wr.set_indent_str("");
        }

        let mut emitter = Emitter {
            cfg: swc_core::ecma::codegen::Config::default(),
            cm: source_map.clone(),
            comments: Some(&comments as &dyn Comments),
            wr,
        };

        emitter.emit_program(&program)?;
        // Drop the AST eagerly so we don't keep it in memory while generating source maps
        drop(program);
    }

    let source_map = if generate_source_map {
        if let Some(original_source_map) = original_source_map {
            Some(generate_js_source_map(
                source_map.clone(),
                mappings,
                original_source_map.generate_source_map().await?.as_ref(),
                true,
            )?)
        } else {
            Some(generate_js_source_map(
                source_map.clone(),
                mappings,
                None,
                true,
            )?)
        }
    } else {
        None
    };

    Ok(EcmascriptModuleContent {
        inner_code: bytes.into(),
        source_map,
        is_esm,
    }
    .cell())
}

fn process_content_with_code_gens(
    program: &mut Program,
    globals: &Globals,
    code_gens: &mut Vec<CodeGeneration>,
) {
    let mut visitors = Vec::new();
    let mut root_visitors = Vec::new();
    let mut early_hoisted_stmts = FxIndexMap::default();
    let mut hoisted_stmts = FxIndexMap::default();
    for code_gen in code_gens {
        for CodeGenerationHoistedStmt { key, stmt } in code_gen.hoisted_stmts.drain(..) {
            hoisted_stmts.entry(key).or_insert(stmt);
        }
        for CodeGenerationHoistedStmt { key, stmt } in code_gen.early_hoisted_stmts.drain(..) {
            early_hoisted_stmts.insert(key.clone(), stmt);
        }

        for (path, visitor) in &code_gen.visitors {
            if path.is_empty() {
                root_visitors.push(&**visitor);
            } else {
                visitors.push((path, &**visitor));
            }
        }
    }

    GLOBALS.set(globals, || {
        if !visitors.is_empty() {
            program.visit_mut_with_ast_path(
                &mut ApplyVisitors::new(visitors),
                &mut Default::default(),
            );
        }
        for pass in root_visitors {
            program.modify(pass);
        }
    });

    match program {
        Program::Module(ast::Module { body, .. }) => {
            body.splice(
                0..0,
                early_hoisted_stmts
                    .into_values()
                    .chain(hoisted_stmts.into_values())
                    .map(ModuleItem::Stmt),
            );
        }
        Program::Script(Script { body, .. }) => {
            body.splice(
                0..0,
                early_hoisted_stmts
                    .into_values()
                    .chain(hoisted_stmts.into_values()),
            );
        }
    };
}

/// Like `hygiene`, but only renames the Atoms without clearing all SyntaxContexts
fn hygiene_rename_only(top_level_mark: Option<Mark>) -> impl VisitMut {
    struct HygieneRenamer;
    impl swc_core::ecma::transforms::base::rename::Renamer for HygieneRenamer {
        const MANGLE: bool = false;
        const RESET_N: bool = true;

        fn new_name_for(&self, orig: &Id, n: &mut usize) -> Atom {
            let res = if *n == 0 {
                orig.0.clone()
            } else {
                format!("{}{}", orig.0, n).into()
            };
            *n += 1;
            res
        }
    }
    swc_core::ecma::transforms::base::rename::renamer(
        swc_core::ecma::transforms::base::hygiene::Config {
            top_level_mark: top_level_mark.unwrap_or_default(),
            ..Default::default()
        },
        HygieneRenamer,
    )
}

struct MergedComments<A, B>
where
    A: Comments,
    B: Comments,
{
    baseline: A,
    mutable: B,
}

impl<A, B> Comments for MergedComments<A, B>
where
    A: Comments,
    B: Comments,
{
    fn add_leading(&self, pos: BytePos, cmt: Comment) {
        self.mutable.add_leading(pos, cmt);
    }

    fn add_leading_comments(&self, pos: BytePos, comments: Vec<Comment>) {
        self.mutable.add_leading_comments(pos, comments);
    }

    fn has_leading(&self, pos: BytePos) -> bool {
        self.baseline.has_leading(pos) || self.mutable.has_leading(pos)
    }

    fn move_leading(&self, from: BytePos, to: BytePos) {
        self.baseline.move_leading(from, to);
        self.mutable.move_leading(from, to);
    }

    fn take_leading(&self, pos: BytePos) -> Option<Vec<Comment>> {
        let (v1, v2) = (
            self.baseline.take_leading(pos),
            self.mutable.take_leading(pos),
        );

        merge_option_vec(v1, v2)
    }

    fn get_leading(&self, pos: BytePos) -> Option<Vec<Comment>> {
        let (v1, v2) = (
            self.baseline.get_leading(pos),
            self.mutable.get_leading(pos),
        );

        merge_option_vec(v1, v2)
    }

    fn add_trailing(&self, pos: BytePos, cmt: Comment) {
        self.mutable.add_trailing(pos, cmt);
    }

    fn add_trailing_comments(&self, pos: BytePos, comments: Vec<Comment>) {
        self.mutable.add_trailing_comments(pos, comments);
    }

    fn has_trailing(&self, pos: BytePos) -> bool {
        self.baseline.has_trailing(pos) || self.mutable.has_trailing(pos)
    }

    fn move_trailing(&self, from: BytePos, to: BytePos) {
        self.baseline.move_trailing(from, to);
        self.mutable.move_trailing(from, to);
    }

    fn take_trailing(&self, pos: BytePos) -> Option<Vec<Comment>> {
        let (v1, v2) = (
            self.baseline.take_trailing(pos),
            self.mutable.take_trailing(pos),
        );

        merge_option_vec(v1, v2)
    }

    fn get_trailing(&self, pos: BytePos) -> Option<Vec<Comment>> {
        let (v1, v2) = (
            self.baseline.get_trailing(pos),
            self.mutable.get_trailing(pos),
        );

        merge_option_vec(v1, v2)
    }

    fn add_pure_comment(&self, pos: BytePos) {
        self.mutable.add_pure_comment(pos);
    }
}

fn merge_option_vec<T>(a: Option<Vec<T>>, b: Option<Vec<T>>) -> Option<Vec<T>> {
    match (a, b) {
        (Some(a), Some(b)) => Some(a.into_iter().chain(b).collect()),
        (Some(a), None) => Some(a),
        (None, Some(b)) => Some(b),
        (None, None) => None,
    }
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    turbo_esregex::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
