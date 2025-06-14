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
    borrow::Cow,
    collections::hash_map::Entry,
    fmt::{Debug, Display, Formatter},
    mem::take,
    sync::Arc,
};

use anyhow::{Context, Result, bail};
use chunk::EcmascriptChunkItem;
use code_gen::{CodeGeneration, CodeGenerationHoistedStmt};
use either::Either;
use itertools::Itertools;
use parse::{ParseResult, parse};
use path_visitor::ApplyVisitors;
use references::esm::UrlRewriteBehavior;
pub use references::{AnalyzeEcmascriptModuleResult, TURBOPACK_HELPER};
use rustc_hash::{FxHashMap, FxHashSet};
use serde::{Deserialize, Serialize};
use smallvec::SmallVec;
pub use static_code::StaticEcmascriptCode;
use swc_core::{
    atoms::Atom,
    base::SwcComments,
    common::{
        BytePos, DUMMY_SP, FileName, GLOBALS, Globals, Loc, Mark, SourceFile, SourceMap,
        SourceMapper, Span, SpanSnippetError, SyntaxContext,
        comments::{Comment, CommentKind, Comments},
        source_map::{FileLinesResult, Files, SourceMapLookupError},
        util::take::Take,
    },
    ecma::{
        ast::{
            self, CallExpr, Callee, Decl, EmptyStmt, Expr, ExprStmt, Id, Ident, ModuleItem,
            Program, Script, SourceMapperExt, Stmt,
        },
        codegen::{Emitter, text_writer::JsWriter},
        utils::StmtLikeInjector,
        visit::{VisitMut, VisitMutWith, VisitMutWithAstPath},
    },
    quote,
};
use tracing::Instrument;
pub use transform::{
    CustomTransformer, EcmascriptInputTransform, EcmascriptInputTransforms, TransformContext,
    TransformPlugin, UnsupportedServerActionIssue,
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxIndexMap, NonLocalValue, ReadRef, ResolvedVc, TaskInput, TryFlatJoinIterExt, TryJoinIterExt,
    ValueToString, Vc, trace::TraceRawVcs,
};
use turbo_tasks_fs::{FileJsonContent, FileSystemPath, glob::Glob, rope::Rope};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        AsyncModuleInfo, ChunkItem, ChunkType, ChunkableModule, ChunkingContext, EvaluatableAsset,
        MergeableModule, MergeableModuleExposure, MergeableModules, MergeableModulesExposed,
        MinifyType, ModuleChunkItemIdExt, ModuleId,
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
    analyzer::graph::EvalContext,
    chunk::{EcmascriptChunkPlaceable, placeable::is_marked_as_side_effect_free},
    code_gen::{CodeGens, ModifiableAst},
    merged_module::MergedEcmascriptModule,
    parse::generate_js_source_map,
    references::{
        analyse_ecmascript_module,
        async_module::OptionAsyncModule,
        esm::{base::EsmAssetReferences, export},
    },
    side_effect_optimization::reference::EcmascriptModulePartReference,
    simple_tree_shake::{ModuleExportUsageInfo, get_module_export_usages},
    swc_comments::{CowComments, ImmutableComments},
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
    #[turbo_tasks::function]
    async fn is_mergeable(self: ResolvedVc<Self>) -> Result<Vc<bool>> {
        if matches!(
            &*self.get_exports().await?,
            EcmascriptExports::EsmExports(_)
        ) {
            return Ok(Vc::cell(true));
        }

        Ok(Vc::cell(false))
    }

    #[turbo_tasks::function]
    async fn merge(
        self: Vc<Self>,
        modules: Vc<MergeableModulesExposed>,
        entry_points: Vc<MergeableModules>,
    ) -> Result<Vc<Box<dyn ChunkableModule>>> {
        Ok(Vc::upcast(*MergedEcmascriptModule::new(
            modules
                .await?
                .iter()
                .map(|(m, exposed)| {
                    Ok((
                        ResolvedVc::try_sidecast::<Box<dyn EcmascriptAnalyzable>>(*m)
                            .context("expected EcmascriptAnalyzable")?,
                        *exposed,
                    ))
                })
                .collect::<Result<Vec<_>>>()?,
            entry_points
                .await?
                .iter()
                .map(|m| {
                    ResolvedVc::try_sidecast::<Box<dyn EcmascriptAnalyzable>>(*m)
                        .context("expected EcmascriptAnalyzable")
                })
                .collect::<Result<Vec<_>>>()?,
            self.options().to_resolved().await?,
        )))
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
    pub additional_ids: SmallVec<[ResolvedVc<ModuleId>; 1]>,
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
        scope_hoisting_context: ScopeHoistingContext<'_>,
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

        async {
            let minify = chunking_context.minify_type().await?;

            let content = process_parse_result(
                *parsed,
                **ident,
                *specified_module_type,
                *generate_source_map,
                *original_source_map,
                *minify,
                Some(&*input),
                None,
            )
            .await?;
            emit_content(content, Default::default()).await
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
            generate_source_map,
            None,
            MinifyType::NoMinify,
            None,
            None,
        )
        .await?;
        emit_content(content, Default::default()).await
    }

    /// Creates a new [`Vc<EcmascriptModuleContent>`] from multiple modules, performing scope
    /// hoisting.
    /// - The `modules` argument is a list of all modules to be merged (and whethey their exports
    ///   should be exposed).
    /// - The `entries` argument is a list of modules that should be treated as entry points for the
    ///   merged module (used to determine execution order).
    #[turbo_tasks::function]
    pub async fn new_merged(
        modules: Vec<(
            ResolvedVc<Box<dyn EcmascriptAnalyzable>>,
            MergeableModuleExposure,
        )>,
        module_options: Vec<Vc<EcmascriptModuleContentOptions>>,
        entry_points: Vec<ResolvedVc<Box<dyn EcmascriptAnalyzable>>>,
    ) -> Result<Vc<Self>> {
        let modules = modules
            .into_iter()
            .map(|(m, exposed)| {
                (
                    ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(m).unwrap(),
                    exposed,
                )
            })
            .collect::<FxIndexMap<_, _>>();
        let entry_points = entry_points
            .into_iter()
            .map(|m| {
                let m = ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(m).unwrap();
                (m, modules.get_index_of(&m).unwrap())
            })
            .collect::<Vec<_>>();

        let globals_merged = Globals::default();

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

                let result = process_parse_result(
                    *parsed,
                    **ident,
                    *specified_module_type,
                    *generate_source_map,
                    *original_source_map,
                    *chunking_context.minify_type().await?,
                    Some(&*options),
                    Some(ScopeHoistingOptions {
                        module,
                        modules: &modules,
                    }),
                )
                .await?;

                Ok((module, result))
            })
            .try_join()
            .await?;

        let (merged_ast, comments, source_maps, original_source_maps) =
            merge_modules(contents, &entry_points, &globals_merged).await?;

        // Use the options from an arbitrary module, since they should all be the same.
        let options = module_options.last().unwrap().await?;

        let modules_width = modules.len().next_power_of_two().trailing_zeros();
        let content = CodeGenResult {
            program: merged_ast,
            source_map: CodeGenResultSourceMap::ScopeHoisting {
                modules_width,
                source_maps,
            },
            comments: CodeGenResultComments::ScopeHoisting {
                modules_width,
                comments,
            },
            export_contexts: None,
            is_esm: true,
            generate_source_map: options.generate_source_map,
            original_source_map: CodeGenResultOriginalSourceMap::ScopeHoisting(
                original_source_maps,
            ),
            minify: *options.chunking_context.minify_type().await?,
            scope_hoisting_syntax_contexts: None,
        };

        let first_entry = entry_points.first().unwrap().0;
        let additional_ids = modules
            .keys()
            // Additionally set this module factory for all modules that are exposed. The whole
            // group might be imported via a different entry import in different chunks (we only
            // ensure that the modules are in the same order, not that they form a subgraph that is
            // always imported from the same root module).
            //
            // Also skip the first entry, which is the name of the chunk item.
            .filter(|m| {
                **m != first_entry && *modules.get(*m).unwrap() == MergeableModuleExposure::External
            })
            .map(|m| m.chunk_item_id(*options.chunking_context).to_resolved())
            .try_join()
            .await?
            .into();

        emit_content(content, additional_ids).await
    }
}

/// Merges multiple Ecmascript modules into a single AST, setting the syntax contexts correctly so
/// that imports work.
///
/// In `contents`, each import from another module in the group must have an Ident with
/// - a `ctxt` listed in scope_hoisting_syntax_contexts.module_contexts, and
/// - `sym` being the name of the import.
///
/// This is then used to map back to the variable name and context of the exporting module.
#[allow(clippy::type_complexity)]
async fn merge_modules(
    mut contents: Vec<(ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>, CodeGenResult)>,
    entry_points: &Vec<(ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>, usize)>,
    globals_merged: &'_ Globals,
) -> Result<(
    Program,
    Vec<CodeGenResultComments>,
    Vec<CodeGenResultSourceMap>,
    SmallVec<[ResolvedVc<Box<dyn GenerateSourceMap>>; 1]>,
)> {
    struct SetSyntaxContextVisitor<'a> {
        modules_width: u32,
        current_module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        current_module_idx: u32,
        /// The export syntax contexts in the current AST, which will be mapped to merged_ctxts
        reverse_module_contexts:
            FxIndexMap<SyntaxContext, ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>>,
        export_contexts:
            &'a FxHashMap<ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>, &'a FxHashMap<RcStr, Id>>,
        /// A fresh global SyntaxContext for each module-local context, so that we can merge them
        /// into a single global AST.
        unique_contexts_cache: &'a mut FxHashMap<
            (ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>, SyntaxContext),
            SyntaxContext,
        >,
    }

    impl<'a> SetSyntaxContextVisitor<'a> {
        fn get_context_for(
            &mut self,
            module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
            local_ctxt: SyntaxContext,
        ) -> SyntaxContext {
            if let Some(&global_ctxt) = self.unique_contexts_cache.get(&(module, local_ctxt)) {
                global_ctxt
            } else {
                let global_ctxt = SyntaxContext::empty().apply_mark(Mark::new());
                self.unique_contexts_cache
                    .insert((module, local_ctxt), global_ctxt);
                global_ctxt
            }
        }
    }

    impl VisitMut for SetSyntaxContextVisitor<'_> {
        fn visit_mut_ident(&mut self, ident: &mut Ident) {
            let Ident {
                sym, ctxt, span, ..
            } = ident;

            if let Some(&module) = self.reverse_module_contexts.get(ctxt) {
                let eval_context_exports = self.export_contexts.get(&module).unwrap();
                // TODO looking up an Atom in a Map<RcStr, _>
                let sym_rc_str: RcStr = sym.as_str().into();
                let (local, local_ctxt) = if let Some((local, local_ctxt)) =
                    eval_context_exports.get(&sym_rc_str)
                {
                    (Some(local), *local_ctxt)
                } else if sym.starts_with("__TURBOPACK__imported__module__$") {
                    // The variable corresponding to the `export * as foo from "...";` is generated
                    // in the module generating the reexport (and it's not listed in the
                    // eval_context). `EsmAssetReference::code_gen` uses a dummy span when
                    // generating this variable.
                    (None, SyntaxContext::empty())
                } else {
                    panic!(
                        "Expected to find a local export for {sym} with ctxt {ctxt:#?} in {:?}",
                        self.reverse_module_contexts
                    );
                };

                let global_ctxt = self.get_context_for(module, local_ctxt);

                if let Some(local) = local {
                    *sym = local.clone();
                }
                *ctxt = global_ctxt;
                span.visit_mut_with(self);
            } else {
                ident.visit_mut_children_with(self);
            }
        }

        fn visit_mut_syntax_context(&mut self, local_ctxt: &mut SyntaxContext) {
            let module = self
                .reverse_module_contexts
                .get(local_ctxt)
                .copied()
                .unwrap_or(self.current_module);

            let global_ctxt = self.get_context_for(module, *local_ctxt);
            *local_ctxt = global_ctxt;
        }
        fn visit_mut_span(&mut self, span: &mut Span) {
            span.lo = CodeGenResultComments::encode_bytepos(
                self.modules_width,
                self.current_module_idx,
                span.lo,
            );
            span.hi = CodeGenResultComments::encode_bytepos(
                self.modules_width,
                self.current_module_idx,
                span.hi,
            );
        }
    }

    // Extract programs into a separate mutable list so that `content` doesn't have to be mutably
    // borrowed (and `export_contexts` doesn't have to clone).
    let mut programs = contents
        .iter_mut()
        .map(|(_, content)| content.program.take())
        .collect::<Vec<_>>();

    let export_contexts = contents
        .iter()
        .map(|(module, content)| (*module, content.export_contexts.as_ref().unwrap()))
        .collect::<FxHashMap<_, _>>();

    let (merged_ast, inserted) = GLOBALS.set(globals_merged, || {
        // As an optimization, assume an average number of 5 contexts per module.
        let mut unique_contexts_cache =
            FxHashMap::with_capacity_and_hasher(contents.len() * 5, Default::default());

        let mut prepare_module =
            |(module, content): &(ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>, CodeGenResult),
             program: &mut Program| {
                if let CodeGenResult {
                    scope_hoisting_syntax_contexts: Some(module_contexts),
                    ..
                } = content
                    && let Program::Module(content) = program
                {
                    GLOBALS.set(globals_merged, || {
                        content.visit_mut_with(&mut SetSyntaxContextVisitor {
                            modules_width: module_contexts
                                .len()
                                .next_power_of_two()
                                .trailing_zeros(),
                            current_module: *module,
                            current_module_idx: module_contexts.get_index_of(module).unwrap()
                                as u32,
                            reverse_module_contexts: module_contexts
                                .iter()
                                .map(|(m, ctxt)| (*ctxt, *m))
                                .collect(),
                            export_contexts: &export_contexts,
                            unique_contexts_cache: &mut unique_contexts_cache,
                        });
                    });

                    Ok(content.take().body)
                } else {
                    bail!("Expected Program::Module with scope_hosting_syntax_contexts");
                }
            };

        let mut inserted = FxHashSet::with_capacity_and_hasher(contents.len(), Default::default());
        // Start with inserting the entry points, and recursively inline all their imports.
        inserted.extend(entry_points.iter().map(|(_, i)| *i));

        let mut inserted_imports = FxHashMap::default();

        // Replace inserted `__turbopack_merged_esm__(i);` statements with the corresponding
        // ith-module.
        let mut queue = entry_points
            .iter()
            .map(|(_, i)| prepare_module(&contents[*i], &mut programs[*i]))
            .flatten_ok()
            .rev()
            .collect::<Result<Vec<_>>>()?;
        let mut result = vec![];
        while let Some(item) = queue.pop() {
            if let ModuleItem::Stmt(stmt) = &item {
                match stmt {
                    Stmt::Expr(ExprStmt { expr, .. }) => {
                        if let Expr::Call(CallExpr {
                            callee: Callee::Expr(callee),
                            args,
                            ..
                        }) = &**expr
                            && callee.is_ident_ref_to("__turbopack_merged_esm__")
                        {
                            let index =
                                args[0].expr.as_lit().unwrap().as_num().unwrap().value as usize;

                            // Only insert once, otherwise the module was already executed
                            if inserted.insert(index) {
                                queue.extend(
                                    prepare_module(&contents[index], &mut programs[index])?
                                        .into_iter()
                                        .rev(),
                                );
                            }
                            continue;
                        }
                    }
                    Stmt::Decl(Decl::Var(var)) => {
                        if let [decl] = &*var.decls
                            && let Some(name) = decl.name.as_ident()
                            && name.sym.starts_with("__TURBOPACK__imported__module__$")
                        {
                            // var __TURBOPACK__imported__module__$... =
                            // __turbopack_context__.i("...");

                            // Even if these imports are not side-effect free, they only execute
                            // once, so no need to insert multiple times.
                            match inserted_imports.entry(name.sym.clone()) {
                                Entry::Occupied(entry) => {
                                    // If the import was already inserted, we can skip it. The
                                    // variable mapping minifies better but is unfortunately
                                    // necessary as the syntax contexts of the two imports are
                                    // different.
                                    let entry_ctxt = *entry.get();
                                    let new = Ident::new(name.sym.clone(), DUMMY_SP, name.ctxt);
                                    let old = Ident::new(name.sym.clone(), DUMMY_SP, entry_ctxt);
                                    result.push(ModuleItem::Stmt(
                                        quote!("var $new = $old;" as Stmt,
                                            new: Ident = new,
                                            old: Ident = old
                                        ),
                                    ));
                                    continue;
                                }
                                Entry::Vacant(entry) => {
                                    entry.insert(name.ctxt);
                                }
                            }
                        }
                    }
                    _ => (),
                }
            }

            result.push(item);
        }

        let mut merged_ast = Program::Module(swc_core::ecma::ast::Module {
            body: result,
            span: DUMMY_SP,
            shebang: None,
        });
        merged_ast.visit_mut_with(&mut swc_core::ecma::transforms::base::hygiene::hygiene());

        anyhow::Ok((merged_ast, inserted))
    })?;

    debug_assert!(
        inserted.len() == contents.len(),
        "Not all merged modules were inserted: {:?}",
        contents
            .iter()
            .enumerate()
            .map(async |(i, m)| Ok((inserted.contains(&i), m.0.ident().to_string().await?)))
            .try_join()
            .await?,
    );

    let comments = contents
        .iter_mut()
        .map(|(_, content)| content.comments.take())
        .collect::<Vec<_>>();

    let source_maps = contents
        .iter_mut()
        .map(|(_, content)| std::mem::take(&mut content.source_map))
        .collect::<Vec<_>>();

    let original_source_maps = contents
        .iter_mut()
        .flat_map(|(_, content)| match content.original_source_map {
            CodeGenResultOriginalSourceMap::ScopeHoisting(_) => unreachable!(
                "Didn't expect nested CodeGenResultOriginalSourceMap::ScopeHoisting: {:?}",
                content.original_source_map
            ),
            CodeGenResultOriginalSourceMap::Single(map) => map,
        })
        .collect();

    Ok((merged_ast, comments, source_maps, original_source_maps))
}

/// Provides information about the other modules in the current scope hoisting group.
#[derive(Clone, Copy)]
pub enum ScopeHoistingContext<'a> {
    Some {
        /// The current module when scope hoisting
        module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        /// All modules in the current group, and whether they should expose their exports
        modules:
            &'a FxIndexMap<ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>, MergeableModuleExposure>,
        /// To import a specifier from another module, apply this context to the Ident
        module_syntax_contexts:
            &'a FxIndexMap<ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>, SyntaxContext>,
    },
    None,
}

impl<'a> ScopeHoistingContext<'a> {
    /// The current module when scope hoisting
    pub fn module(&self) -> Option<ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>> {
        match self {
            ScopeHoistingContext::Some { module, .. } => Some(*module),
            ScopeHoistingContext::None => None,
        }
    }

    /// Whether the current module should not expose it's exports into the module cache.
    pub fn skip_module_exports(&self) -> bool {
        match self {
            ScopeHoistingContext::Some {
                module, modules, ..
            } => !modules.get(module).unwrap().is_exposed(),
            ScopeHoistingContext::None => false,
        }
    }

    pub fn get_module_syntax_context(
        &self,
        module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    ) -> Option<SyntaxContext> {
        match self {
            ScopeHoistingContext::Some {
                module_syntax_contexts,
                ..
            } => module_syntax_contexts.get(&module).copied(),
            ScopeHoistingContext::None => None,
        }
    }

    pub fn get_module_index(
        &self,
        module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    ) -> Option<usize> {
        match self {
            ScopeHoistingContext::Some { modules, .. } => modules.get_index_of(&module),
            ScopeHoistingContext::None => None,
        }
    }
}

struct CodeGenResult {
    program: Program,
    source_map: CodeGenResultSourceMap,
    comments: CodeGenResultComments,
    /// `eval_context.imports.exports`
    export_contexts: Option<FxHashMap<RcStr, Id>>,
    is_esm: bool,
    generate_source_map: bool,
    original_source_map: CodeGenResultOriginalSourceMap,
    minify: MinifyType,
    scope_hoisting_syntax_contexts:
        Option<FxIndexMap<ResolvedVc<Box<dyn EcmascriptChunkPlaceable + 'static>>, SyntaxContext>>,
}

struct ScopeHoistingOptions<'a> {
    module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    modules: &'a FxIndexMap<ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>, MergeableModuleExposure>,
}

async fn process_parse_result(
    parsed: ResolvedVc<ParseResult>,
    ident: Vc<AssetIdent>,
    specified_module_type: SpecifiedModuleType,
    generate_source_map: bool,
    original_source_map: Option<ResolvedVc<Box<dyn GenerateSourceMap>>>,
    minify: MinifyType,
    options: Option<&EcmascriptModuleContentOptions>,
    scope_hoisting_options: Option<ScopeHoistingOptions<'_>>,
) -> Result<CodeGenResult> {
    with_consumed_parse_result(
        parsed,
        async |mut program, source_map, globals, eval_context, comments| -> Result<CodeGenResult> {
            let (top_level_mark, is_esm, export_contexts) = eval_context
                .map_either(
                    |e| {
                        (
                            e.top_level_mark,
                            e.is_esm(specified_module_type),
                            Cow::Owned(e.imports.exports),
                        )
                    },
                    |e| {
                        (
                            e.top_level_mark,
                            e.is_esm(specified_module_type),
                            Cow::Borrowed(&e.imports.exports),
                        )
                    },
                )
                .into_inner();

            let (mut code_gens, retain_syntax_context, prepend_ident_comment) =
                if let Some(scope_hoisting_options) = scope_hoisting_options {
                    let (is_import_mark, module_syntax_contexts) = GLOBALS.set(globals, || {
                        let is_import_mark = Mark::new();
                        let module_syntax_contexts: FxIndexMap<_, _> = scope_hoisting_options
                            .modules
                            .keys()
                            .map(|m| {
                                let mark = Mark::fresh(is_import_mark);
                                (
                                    *m,
                                    SyntaxContext::empty()
                                        .apply_mark(is_import_mark)
                                        .apply_mark(mark),
                                )
                            })
                            .collect();
                        (is_import_mark, module_syntax_contexts)
                    });

                    let ctx = ScopeHoistingContext::Some {
                        module: scope_hoisting_options.module,
                        modules: scope_hoisting_options.modules,
                        module_syntax_contexts: &module_syntax_contexts,
                    };
                    let code_gens = options.unwrap().merged_code_gens(ctx).await?;
                    let preserved_exports =
                        match &*scope_hoisting_options.module.get_exports().await? {
                            EcmascriptExports::EsmExports(exports) => exports
                                .await?
                                .exports
                                .iter()
                                .filter(|(_, e)| matches!(e, export::EsmExport::LocalBinding(_, _)))
                                .map(|(name, e)| {
                                    if let Some((sym, ctxt)) = export_contexts.get(name) {
                                        Ok((sym.clone(), *ctxt))
                                    } else {
                                        bail!("Couldn't find export {} for binding {:?}", name, e);
                                    }
                                })
                                .collect::<Result<FxHashSet<_>>>()?,
                            _ => Default::default(),
                        };

                    let prepend_ident_comment = if matches!(minify, MinifyType::NoMinify) {
                        Some(Comment {
                            kind: CommentKind::Line,
                            span: DUMMY_SP,
                            text: format!(" MERGED MODULE: {}", ident.to_string().await?).into(),
                        })
                    } else {
                        None
                    };

                    (
                        code_gens,
                        Some((is_import_mark, module_syntax_contexts, preserved_exports)),
                        prepend_ident_comment,
                    )
                } else if let Some(options) = options {
                    (
                        options.merged_code_gens(ScopeHoistingContext::None).await?,
                        None,
                        None,
                    )
                } else {
                    (vec![], None, None)
                };

            let extra_comments = SwcComments {
                leading: Default::default(),
                trailing: Default::default(),
            };

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
                if let Some(prepend_ident_comment) = prepend_ident_comment {
                    let span = Span::dummy_with_cmt();
                    extra_comments.add_leading(span.lo, prepend_ident_comment);
                    let stmt = Stmt::Empty(EmptyStmt { span });
                    match &mut program {
                        Program::Module(module) => module.body.prepend_stmt(ModuleItem::Stmt(stmt)),
                        Program::Script(script) => script.body.prepend_stmt(stmt),
                    }
                }

                if let Some((is_import_mark, _, preserved_exports)) = &retain_syntax_context {
                    program.visit_mut_with(&mut hygiene_rename_only(
                        Some(top_level_mark),
                        *is_import_mark,
                        preserved_exports,
                    ));
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
                program.visit_mut_with(&mut swc_core::ecma::transforms::base::fixer::fixer(None));

                // we need to remove any shebang before bundling as it's only valid as the first
                // line in a js file (not in a chunk item wrapped in the runtime)
                remove_shebang(&mut program);
            });

            Ok(CodeGenResult {
                program,
                source_map: CodeGenResultSourceMap::Single {
                    source_map: source_map.clone(),
                },
                comments: CodeGenResultComments::Single {
                    comments,
                    extra_comments,
                },
                // TODO ideally don't clone here at all
                export_contexts: Some(export_contexts.into_owned()),
                is_esm,
                generate_source_map,
                original_source_map: CodeGenResultOriginalSourceMap::Single(original_source_map),
                minify,
                scope_hoisting_syntax_contexts: retain_syntax_context.map(|(_, ctxts, _)| ctxts),
            })
        },
        async |parse_result| -> Result<CodeGenResult> {
            Ok(match parse_result {
                ParseResult::Ok { .. } => unreachable!(),
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
                        source_map: CodeGenResultSourceMap::default(),
                        comments: CodeGenResultComments::Empty,
                        export_contexts: None,
                        is_esm: false,
                        generate_source_map: false,
                        original_source_map: CodeGenResultOriginalSourceMap::Single(None),
                        minify: MinifyType::NoMinify,
                        scope_hoisting_syntax_contexts: None,
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
                        source_map: CodeGenResultSourceMap::default(),
                        comments: CodeGenResultComments::Empty,
                        export_contexts: None,
                        is_esm: false,
                        generate_source_map: false,
                        original_source_map: CodeGenResultOriginalSourceMap::Single(None),
                        minify: MinifyType::NoMinify,
                        scope_hoisting_syntax_contexts: None,
                    }
                }
            })
        },
    )
    .await
}

/// Try to avoid cloning the AST and Globals by unwrapping the ReadRef (and cloning otherwise).
async fn with_consumed_parse_result<T>(
    parsed: ResolvedVc<ParseResult>,
    success: impl AsyncFnOnce(
        Program,
        &Arc<SourceMap>,
        &Arc<Globals>,
        Either<EvalContext, &'_ EvalContext>,
        Either<ImmutableComments, Arc<ImmutableComments>>,
    ) -> Result<T>,
    error: impl AsyncFnOnce(&ParseResult) -> Result<T>,
) -> Result<T> {
    let parsed = parsed.final_read_hint().await?;
    match &*parsed {
        ParseResult::Ok { .. } => {
            let mut parsed = ReadRef::try_unwrap(parsed);
            let (program, source_map, globals, eval_context, comments) = match &mut parsed {
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
                    Either::Left(std::mem::replace(
                        eval_context,
                        EvalContext {
                            unresolved_mark: eval_context.unresolved_mark,
                            top_level_mark: eval_context.top_level_mark,
                            imports: Default::default(),
                            force_free_values: Default::default(),
                        },
                    )),
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
                        Either::Right(eval_context),
                        Either::Right(comments.clone()),
                    )
                }
                _ => unreachable!(),
            };

            success(program, source_map, globals, eval_context, comments).await
        }
        _ => error(&parsed).await,
    }
}

async fn emit_content(
    content: CodeGenResult,
    additional_ids: SmallVec<[ResolvedVc<ModuleId>; 1]>,
) -> Result<Vc<EcmascriptModuleContent>> {
    let CodeGenResult {
        program,
        source_map,
        comments,
        is_esm,
        generate_source_map,
        original_source_map,
        minify,
        export_contexts: _,
        scope_hoisting_syntax_contexts: _,
    } = content;

    let mut bytes: Vec<u8> = vec![];
    // TODO: Insert this as a sourceless segment so that sourcemaps aren't affected.
    // = format!("/* {} */\n", self.module.path().to_string().await?).into_bytes();

    let mut mappings = vec![];

    let source_map = Arc::new(source_map);

    {
        let mut wr = JsWriter::new(
            // unused anyway?
            Default::default(),
            "\n",
            &mut bytes,
            generate_source_map.then_some(&mut mappings),
        );
        if matches!(minify, MinifyType::Minify { .. }) {
            wr.set_indent_str("");
        }

        let comments = comments.consumable();

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
        Some(generate_js_source_map(
            &*source_map,
            mappings,
            original_source_map
                .iter()
                .map(|map| map.generate_source_map())
                .try_flat_join()
                .await?,
            matches!(
                original_source_map,
                CodeGenResultOriginalSourceMap::Single(_)
            ),
            true,
        )?)
    } else {
        None
    };

    Ok(EcmascriptModuleContent {
        inner_code: bytes.into(),
        source_map,
        is_esm,
        additional_ids,
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
///
/// Don't rename idents marked with `is_import_mark` (i.e. a reference to a value which is imported
/// from another merged module) or listed in `preserve_exports` (i.e. an exported local binding):
/// even if they are causing collisions, they will be handled by the next hygiene pass over the
/// whole module.
fn hygiene_rename_only(
    top_level_mark: Option<Mark>,
    is_import_mark: Mark,
    preserved_exports: &FxHashSet<Id>,
) -> impl VisitMut {
    struct HygieneRenamer<'a> {
        preserved_exports: &'a FxHashSet<Id>,
        is_import_mark: Mark,
    }
    // Copied from `hygiene_with_config`'s HygieneRenamer, but added an `preserved_exports`
    impl swc_core::ecma::transforms::base::rename::Renamer for HygieneRenamer<'_> {
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

        fn preserve_name(&self, orig: &Id) -> bool {
            self.preserved_exports.contains(orig) || orig.1.has_mark(self.is_import_mark)
        }
    }
    swc_core::ecma::transforms::base::rename::renamer(
        swc_core::ecma::transforms::base::hygiene::Config {
            top_level_mark: top_level_mark.unwrap_or_default(),
            ..Default::default()
        },
        HygieneRenamer {
            preserved_exports,
            is_import_mark,
        },
    )
}

enum CodeGenResultSourceMap {
    Single {
        source_map: Arc<SourceMap>,
    },
    ScopeHoisting {
        modules_width: u32,
        source_maps: Vec<CodeGenResultSourceMap>,
    },
}

impl Debug for CodeGenResultSourceMap {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CodeGenResultSourceMap::Single { source_map } => {
                write!(
                    f,
                    "CodeGenResultSourceMap::Single {{ source_map: {:?} }}",
                    source_map.files().clone()
                )
            }
            CodeGenResultSourceMap::ScopeHoisting {
                modules_width,
                source_maps,
            } => write!(
                f,
                "CodeGenResultSourceMap::ScopeHoisting {{ modules_width: {modules_width}, \
                 source_maps: {source_maps:?} }}",
            ),
        }
    }
}

impl Default for CodeGenResultSourceMap {
    fn default() -> Self {
        CodeGenResultSourceMap::Single {
            source_map: Arc::new(SourceMap::default()),
        }
    }
}

impl Files for CodeGenResultSourceMap {
    fn try_lookup_source_file(
        &self,
        pos: BytePos,
    ) -> Result<Arc<SourceFile>, SourceMapLookupError> {
        match self {
            CodeGenResultSourceMap::Single { source_map } => source_map.try_lookup_source_file(pos),
            CodeGenResultSourceMap::ScopeHoisting {
                modules_width,
                source_maps,
            } => {
                let (module, pos) = CodeGenResultComments::decode_bytepos(*modules_width, pos);
                source_maps[module].try_lookup_source_file(pos)
            }
        }
    }

    fn is_in_file(&self, f: &Arc<SourceFile>, raw_pos: BytePos) -> bool {
        match self {
            CodeGenResultSourceMap::Single { .. } => f.start_pos <= raw_pos && raw_pos < f.end_pos,
            CodeGenResultSourceMap::ScopeHoisting { .. } => {
                // let (module, pos) = CodeGenResultComments::decode_bytepos(*modules_width, pos);

                // TODO optimize this, unfortunately, `SourceFile` doesn't know which `module` it
                // belongs from.
                false
            }
        }
    }

    fn map_raw_pos(&self, pos: BytePos) -> BytePos {
        match self {
            CodeGenResultSourceMap::Single { .. } => pos,
            CodeGenResultSourceMap::ScopeHoisting { modules_width, .. } => {
                CodeGenResultComments::decode_bytepos(*modules_width, pos).1
            }
        }
    }
}

impl SourceMapper for CodeGenResultSourceMap {
    fn lookup_char_pos(&self, pos: BytePos) -> Loc {
        match self {
            CodeGenResultSourceMap::Single { source_map } => source_map.lookup_char_pos(pos),
            CodeGenResultSourceMap::ScopeHoisting {
                modules_width,
                source_maps,
            } => {
                let (module, pos) = CodeGenResultComments::decode_bytepos(*modules_width, pos);
                source_maps[module].lookup_char_pos(pos)
            }
        }
    }
    fn span_to_lines(&self, sp: Span) -> FileLinesResult {
        match self {
            CodeGenResultSourceMap::Single { source_map } => source_map.span_to_lines(sp),
            CodeGenResultSourceMap::ScopeHoisting {
                modules_width,
                source_maps,
            } => {
                let (module, lo) = CodeGenResultComments::decode_bytepos(*modules_width, sp.lo);
                source_maps[module].span_to_lines(Span {
                    lo,
                    hi: CodeGenResultComments::decode_bytepos(*modules_width, sp.hi).1,
                })
            }
        }
    }
    fn span_to_string(&self, sp: Span) -> String {
        match self {
            CodeGenResultSourceMap::Single { source_map } => source_map.span_to_string(sp),
            CodeGenResultSourceMap::ScopeHoisting {
                modules_width,
                source_maps,
            } => {
                let (module, lo) = CodeGenResultComments::decode_bytepos(*modules_width, sp.lo);
                source_maps[module].span_to_string(Span {
                    lo,
                    hi: CodeGenResultComments::decode_bytepos(*modules_width, sp.hi).1,
                })
            }
        }
    }
    fn span_to_filename(&self, sp: Span) -> Arc<FileName> {
        match self {
            CodeGenResultSourceMap::Single { source_map } => source_map.span_to_filename(sp),
            CodeGenResultSourceMap::ScopeHoisting {
                modules_width,
                source_maps,
            } => {
                let (module, lo) = CodeGenResultComments::decode_bytepos(*modules_width, sp.lo);
                source_maps[module].span_to_filename(Span {
                    lo,
                    hi: CodeGenResultComments::decode_bytepos(*modules_width, sp.hi).1,
                })
            }
        }
    }
    fn merge_spans(&self, sp_lhs: Span, sp_rhs: Span) -> Option<Span> {
        match self {
            CodeGenResultSourceMap::Single { source_map } => source_map.merge_spans(sp_lhs, sp_rhs),
            CodeGenResultSourceMap::ScopeHoisting {
                modules_width,
                source_maps,
            } => {
                let (module_lhs, lo_lhs) =
                    CodeGenResultComments::decode_bytepos(*modules_width, sp_lhs.lo);
                let (module_rhs, lo_rhs) =
                    CodeGenResultComments::decode_bytepos(*modules_width, sp_rhs.lo);
                if module_lhs != module_rhs {
                    return None;
                }
                source_maps[module_lhs].merge_spans(
                    Span {
                        lo: lo_lhs,
                        hi: CodeGenResultComments::decode_bytepos(*modules_width, sp_lhs.hi).1,
                    },
                    Span {
                        lo: lo_rhs,
                        hi: CodeGenResultComments::decode_bytepos(*modules_width, sp_rhs.hi).1,
                    },
                )
            }
        }
    }
    fn call_span_if_macro(&self, sp: Span) -> Span {
        match self {
            CodeGenResultSourceMap::Single { source_map } => source_map.call_span_if_macro(sp),
            CodeGenResultSourceMap::ScopeHoisting {
                modules_width,
                source_maps,
            } => {
                let (module, lo) = CodeGenResultComments::decode_bytepos(*modules_width, sp.lo);
                source_maps[module].call_span_if_macro(Span {
                    lo,
                    hi: CodeGenResultComments::decode_bytepos(*modules_width, sp.hi).1,
                })
            }
        }
    }
    fn doctest_offset_line(&self, _line: usize) -> usize {
        panic!("doctest_offset_line is not implemented for CodeGenResultSourceMap");
    }
    fn span_to_snippet(&self, sp: Span) -> Result<String, Box<SpanSnippetError>> {
        match self {
            CodeGenResultSourceMap::Single { source_map } => source_map.span_to_snippet(sp),
            CodeGenResultSourceMap::ScopeHoisting {
                modules_width,
                source_maps,
            } => {
                let (module, lo) = CodeGenResultComments::decode_bytepos(*modules_width, sp.lo);
                source_maps[module].span_to_snippet(Span {
                    lo,
                    hi: CodeGenResultComments::decode_bytepos(*modules_width, sp.hi).1,
                })
            }
        }
    }
}
impl SourceMapperExt for CodeGenResultSourceMap {
    fn get_code_map(&self) -> &dyn SourceMapper {
        self
    }
}

#[derive(Debug)]
enum CodeGenResultOriginalSourceMap {
    Single(Option<ResolvedVc<Box<dyn GenerateSourceMap>>>),
    ScopeHoisting(SmallVec<[ResolvedVc<Box<dyn GenerateSourceMap>>; 1]>),
}

impl CodeGenResultOriginalSourceMap {
    fn iter(&self) -> impl Iterator<Item = ResolvedVc<Box<dyn GenerateSourceMap>>> {
        match self {
            CodeGenResultOriginalSourceMap::Single(map) => Either::Left(map.iter().copied()),
            CodeGenResultOriginalSourceMap::ScopeHoisting(maps) => {
                Either::Right(maps.iter().copied())
            }
        }
    }
}

enum CodeGenResultComments {
    Single {
        comments: Either<ImmutableComments, Arc<ImmutableComments>>,
        extra_comments: SwcComments,
    },
    ScopeHoisting {
        modules_width: u32,
        comments: Vec<CodeGenResultComments>,
    },
    Empty,
}

impl CodeGenResultComments {
    fn take(&mut self) -> Self {
        std::mem::replace(self, CodeGenResultComments::Empty)
    }

    fn consumable(&self) -> CodeGenResultCommentsConsumable {
        match self {
            CodeGenResultComments::Single {
                comments,
                extra_comments,
            } => CodeGenResultCommentsConsumable::Single {
                comments: match comments {
                    Either::Left(comments) => comments.consumable(),
                    Either::Right(comments) => comments.consumable(),
                },
                extra_comments,
            },
            CodeGenResultComments::ScopeHoisting {
                modules_width,
                comments,
            } => CodeGenResultCommentsConsumable::ScopeHoisting {
                modules_width: *modules_width,
                comments: comments.iter().map(|c| c.consumable()).collect(),
            },
            CodeGenResultComments::Empty => CodeGenResultCommentsConsumable::Empty,
        }
    }

    fn encode_bytepos(modules_width: u32, module: u32, pos: BytePos) -> BytePos {
        if pos.is_dummy() {
            // nothing to encode
            return pos;
        }

        // 00010000000000100100011010100101
        // ^^^^ module id
        //     ^ whether the bits stolen for the module were once 1 (i.e. "sign extend" again later)
        //      ^^^^^^^^^^^^^^^^^^^^^^^^^^^ the original bytepos
        //
        // # Example:
        // pos=11111111111111110000000000000101 with module=0001
        // would become
        // pos=00011111111111110000000000000101
        // # Example:
        // pos=00000111111111110000000000000101 with module=0001
        // would become
        // pos=00010111111111110000000000000101

        let header_width = modules_width + 1;
        let pos_width = 32 - header_width;

        let pos = pos.0;

        let old_high_bits = pos >> pos_width;
        let high_bits_set = if (2u32.pow(header_width) - 1) == old_high_bits {
            true
        } else if old_high_bits == 0 {
            false
        } else {
            panic!("The high bits of the position {pos} are not all 0s or 1s: {old_high_bits:b}",);
        };

        let pos = pos & !((2u32.pow(header_width) - 1) << pos_width);
        let encoded_high_bits = if high_bits_set { 1 } else { 0 } << pos_width;
        let encoded_module = module << (pos_width + 1);

        BytePos(encoded_module | encoded_high_bits | pos)
    }

    fn decode_bytepos(modules_width: u32, pos: BytePos) -> (usize, BytePos) {
        if pos.is_dummy() {
            // nothing to decode
            panic!("Cannot decode dummy BytePos");
        }

        let header_width = modules_width + 1;
        let pos_width = 32 - header_width;

        let high_bits_set = ((pos.0 >> (pos_width)) & 1) == 1;
        let module = pos.0 >> (pos_width + 1);
        let pos = pos.0 & !((2u32.pow(header_width) - 1) << pos_width);
        let pos = if high_bits_set {
            pos | ((2u32.pow(header_width) - 1) << pos_width)
        } else {
            pos
        };
        (module as usize, BytePos(pos))
    }
}

enum CodeGenResultCommentsConsumable<'a> {
    Single {
        comments: CowComments<'a>,
        extra_comments: &'a SwcComments,
    },
    ScopeHoisting {
        modules_width: u32,
        comments: Vec<CodeGenResultCommentsConsumable<'a>>,
    },
    Empty,
}

unsafe impl Send for CodeGenResultComments {}
unsafe impl Sync for CodeGenResultComments {}

impl Comments for CodeGenResultCommentsConsumable<'_> {
    fn add_leading(&self, _pos: BytePos, _cmt: Comment) {
        unimplemented!()
    }

    fn add_leading_comments(&self, _pos: BytePos, _comments: Vec<Comment>) {
        unimplemented!()
    }

    fn has_leading(&self, pos: BytePos) -> bool {
        match self {
            Self::Single {
                comments,
                extra_comments,
            } => comments.has_leading(pos) || extra_comments.has_leading(pos),
            Self::ScopeHoisting {
                modules_width,
                comments,
            } => {
                let (module, pos) = CodeGenResultComments::decode_bytepos(*modules_width, pos);
                comments[module].has_leading(pos)
            }
            Self::Empty => false,
        }
    }

    fn move_leading(&self, _from: BytePos, _to: BytePos) {
        unimplemented!()
    }

    fn take_leading(&self, pos: BytePos) -> Option<Vec<Comment>> {
        match self {
            Self::Single {
                comments,
                extra_comments,
            } => merge_option_vec(comments.take_leading(pos), extra_comments.take_leading(pos)),
            Self::ScopeHoisting {
                modules_width,
                comments,
            } => {
                let (module, pos) = CodeGenResultComments::decode_bytepos(*modules_width, pos);
                comments[module].take_leading(pos)
            }
            Self::Empty => None,
        }
    }

    fn get_leading(&self, pos: BytePos) -> Option<Vec<Comment>> {
        match self {
            Self::Single {
                comments,
                extra_comments,
            } => merge_option_vec(comments.get_leading(pos), extra_comments.get_leading(pos)),
            Self::ScopeHoisting {
                modules_width,
                comments,
            } => {
                let (module, pos) = CodeGenResultComments::decode_bytepos(*modules_width, pos);
                comments[module].get_leading(pos)
            }
            Self::Empty => None,
        }
    }

    fn add_trailing(&self, _pos: BytePos, _cmt: Comment) {
        unimplemented!()
    }

    fn add_trailing_comments(&self, _pos: BytePos, _comments: Vec<Comment>) {
        unimplemented!()
    }

    fn has_trailing(&self, pos: BytePos) -> bool {
        match self {
            Self::Single {
                comments,
                extra_comments,
            } => comments.has_trailing(pos) || extra_comments.has_trailing(pos),
            Self::ScopeHoisting {
                modules_width,
                comments,
            } => {
                let (module, pos) = CodeGenResultComments::decode_bytepos(*modules_width, pos);
                comments[module].has_trailing(pos)
            }
            Self::Empty => false,
        }
    }

    fn move_trailing(&self, _from: BytePos, _to: BytePos) {
        unimplemented!()
    }

    fn take_trailing(&self, pos: BytePos) -> Option<Vec<Comment>> {
        match self {
            Self::Single {
                comments,
                extra_comments,
            } => merge_option_vec(
                comments.take_trailing(pos),
                extra_comments.take_trailing(pos),
            ),
            Self::ScopeHoisting {
                modules_width,
                comments,
            } => {
                let (module, pos) = CodeGenResultComments::decode_bytepos(*modules_width, pos);
                comments[module].take_trailing(pos)
            }
            Self::Empty => None,
        }
    }

    fn get_trailing(&self, pos: BytePos) -> Option<Vec<Comment>> {
        match self {
            Self::Single {
                comments,
                extra_comments,
            } => merge_option_vec(comments.get_leading(pos), extra_comments.get_leading(pos)),
            Self::ScopeHoisting {
                modules_width,
                comments,
            } => {
                let (module, pos) = CodeGenResultComments::decode_bytepos(*modules_width, pos);
                comments[module].get_leading(pos)
            }
            Self::Empty => None,
        }
    }

    fn add_pure_comment(&self, _pos: BytePos) {
        unimplemented!()
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

#[cfg(test)]
mod tests {
    use super::*;
    fn bytepos_ensure_identical(modules_width: u32, pos: BytePos) {
        let module_count = 2u32.pow(modules_width);

        for module in [
            0,
            1,
            2,
            module_count / 2,
            module_count.wrapping_sub(5),
            module_count.wrapping_sub(1),
        ]
        .into_iter()
        .filter(|&m| m < module_count)
        {
            let encoded = CodeGenResultComments::encode_bytepos(modules_width, module, pos);
            let (decoded_module, decoded_pos) =
                CodeGenResultComments::decode_bytepos(modules_width, encoded);
            assert_eq!(
                decoded_module as u32, module,
                "Testing width {modules_width} and pos {pos:?}"
            );
            assert_eq!(
                decoded_pos, pos,
                "Testing width {modules_width} and pos {pos:?}"
            );
        }
    }

    #[test]
    fn test_encode_decode_bytepos_format() {
        for (pos, module, modules_width, result) in [
            (
                0b00000000000000000000000000000101,
                0b1,
                1,
                0b10000000000000000000000000000101,
            ),
            (
                0b00000000000000000000000000000101,
                0b01,
                2,
                0b01000000000000000000000000000101,
            ),
            (
                0b11111111111111110000000000000101,
                0b0001,
                4,
                0b00011111111111110000000000000101,
            ),
            (
                0b00000111111111110000000000000101,
                0b0001,
                4,
                0b00010111111111110000000000000101,
            ),
            // Special case, DUMMY stays a DUMMY
            (BytePos::DUMMY.0, 0b0001, 4, BytePos::DUMMY.0),
        ] {
            let encoded =
                CodeGenResultComments::encode_bytepos(modules_width, module, BytePos(pos));
            assert_eq!(encoded.0, result);
        }
    }

    #[test]
    fn test_encode_decode_bytepos_lossless() {
        // This is copied from swc (it's not exported), comments the range above this value.
        const DUMMY_RESERVE: u32 = u32::MAX - 2_u32.pow(16);

        for modules_width in 1..=6 {
            for pos in [
                // BytePos::DUMMY, // This must never get decoded in the first place
                BytePos(1),
                BytePos(2),
                BytePos(100),
                BytePos(4_000_000),
                BytePos(60_000_000),
                BytePos::PLACEHOLDER,
                BytePos::SYNTHESIZED,
                BytePos::PURE,
                BytePos(DUMMY_RESERVE),
                BytePos(DUMMY_RESERVE + 10),
                BytePos(DUMMY_RESERVE + 10000),
            ] {
                if modules_width == 6 && pos.0 == 60_000_000 {
                    // this is unfortunately too large indeed, will trigger the panic.
                    continue;
                }
                bytepos_ensure_identical(modules_width, pos);
            }
        }
    }
}
