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
pub mod inlined_bytes_module;
pub mod magic_identifier;
pub mod manifest;
mod merged_module;
pub mod minify;
pub mod parse;
mod path_visitor;
pub mod references;
pub mod runtime_functions;
pub mod side_effect_optimization;
pub mod source_map;
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
    sync::{Arc, Mutex},
};

use anyhow::{Context, Result, anyhow, bail};
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
use tracing::{Instrument, Level, instrument};
pub use transform::{
    CustomTransformer, EcmascriptInputTransform, EcmascriptInputTransforms, TransformContext,
    TransformPlugin,
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    FxDashMap, FxIndexMap, IntoTraitRef, NonLocalValue, ReadRef, ResolvedVc, TaskInput,
    TryFlatJoinIterExt, TryJoinIterExt, Upcast, ValueToString, Vc, trace::TraceRawVcs,
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
        analyze_ecmascript_module,
        async_module::OptionAsyncModule,
        esm::{base::EsmAssetReferences, export},
    },
    side_effect_optimization::reference::EcmascriptModulePartReference,
    swc_comments::{CowComments, ImmutableComments},
    transform::{remove_directives, remove_shebang},
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
pub enum AnalyzeMode {
    /// For bundling only, no tracing of referenced files.
    #[default]
    CodeGeneration,
    /// For bundling and tracing of referenced files.
    CodeGenerationAndTracing,
    /// For tracing of referenced files only, no bundling (i.e. no codegen).
    Tracing,
}

impl AnalyzeMode {
    pub fn is_tracing(self) -> bool {
        match self {
            AnalyzeMode::Tracing | AnalyzeMode::CodeGenerationAndTracing => true,
            AnalyzeMode::CodeGeneration => false,
        }
    }

    pub fn is_code_gen(self) -> bool {
        match self {
            AnalyzeMode::CodeGeneration | AnalyzeMode::CodeGenerationAndTracing => true,
            AnalyzeMode::Tracing => false,
        }
    }
}

#[turbo_tasks::value(transparent)]
pub struct OptionTreeShaking(pub Option<TreeShakingMode>);

/// The constant to replace `typeof window` with.
#[derive(
    Copy,
    Clone,
    PartialEq,
    Eq,
    Debug,
    Hash,
    Serialize,
    Deserialize,
    TraceRawVcs,
    NonLocalValue,
    TaskInput,
)]
pub enum TypeofWindow {
    Object,
    Undefined,
}

#[turbo_tasks::value(shared)]
#[derive(Debug, Default, Copy, Clone)]
pub struct EcmascriptOptions {
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
    /// Whether the modules in this context are never chunked/codegen-ed, but only used for
    /// tracing.
    pub analyze_mode: AnalyzeMode,
    // TODO this should just be handled via CompileTimeInfo FreeVarReferences, but then it
    // (currently) wouldn't be possible to have different replacement values in user code vs
    // node_modules.
    /// Whether to replace `typeof window` with some constant value.
    pub enable_typeof_window_inlining: Option<TypeofWindow>,

    pub inline_helpers: bool,
}

#[turbo_tasks::value]
#[derive(Hash, Debug, Copy, Clone, TaskInput)]
pub enum EcmascriptModuleAssetType {
    /// Module with EcmaScript code
    Ecmascript,
    /// Module with (presumed) EcmaScript code, but it was extensionless
    EcmascriptExtensionless,
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
            EcmascriptModuleAssetType::EcmascriptExtensionless => {
                write!(f, "ecmascript extensionless")
            }
            EcmascriptModuleAssetType::Typescript { tsx, analyze_types } => {
                write!(f, "typescript")?;
                if *tsx {
                    write!(f, " with JSX")?;
                }
                if *analyze_types {
                    write!(f, " with types")?;
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
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<EcmascriptModuleContentOptions>>;
}

pub trait EcmascriptAnalyzableExt {
    fn module_content(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Vc<EcmascriptModuleContent>;
}

impl<T> EcmascriptAnalyzableExt for T
where
    T: EcmascriptAnalyzable + Upcast<Box<dyn EcmascriptAnalyzable>>,
{
    fn module_content(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Vc<EcmascriptModuleContent> {
        let analyzable = Vc::upcast_non_strict::<Box<dyn EcmascriptAnalyzable>>(self);
        let own_options = analyzable.module_content_options(chunking_context, async_module_info);
        EcmascriptModuleContent::new(own_options)
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
#[derive(Clone)]
pub(crate) struct ModuleTypeResult {
    pub module_type: SpecifiedModuleType,
    pub referenced_package_json: Option<FileSystemPath>,
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
        package_json: FileSystemPath,
    ) -> Vc<Self> {
        Self::cell(ModuleTypeResult {
            module_type,
            referenced_package_json: Some(package_json),
        })
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptParsable for EcmascriptModuleAsset {
    #[turbo_tasks::function]
    async fn failsafe_parse(self: Vc<Self>) -> Result<Vc<ParseResult>> {
        let this = self.await?;
        let real_result = this.parse().await?;
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
        analyze_ecmascript_module(self, None)
    }

    /// Generates module contents without an analysis pass. This is useful for
    /// transforming code that is not a module, e.g. runtime code.
    #[turbo_tasks::function]
    async fn module_content_without_analysis(
        self: Vc<Self>,
        generate_source_map: bool,
    ) -> Result<Vc<EcmascriptModuleContent>> {
        let this = self.await?;

        let parsed = this.parse().await?;

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
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
        async_module_info: Option<ResolvedVc<AsyncModuleInfo>>,
    ) -> Result<Vc<EcmascriptModuleContentOptions>> {
        let parsed = self.await?.parse().await?.to_resolved().await?;

        let analyze = self.analyze();
        let analyze_ref = analyze.await?;

        let module_type_result = self.determine_module_type().await?;
        let generate_source_map = *chunking_context
            .reference_module_source_maps(Vc::upcast(*self))
            .await?;

        Ok(EcmascriptModuleContentOptions {
            parsed: Some(parsed),
            module: ResolvedVc::upcast(self),
            specified_module_type: module_type_result.module_type,
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
        }
        .cell())
    }
}

#[turbo_tasks::function]
async fn determine_module_type_for_directory(
    context_path: FileSystemPath,
) -> Result<Vc<ModuleTypeResult>> {
    let find_package_json =
        find_context_file(context_path, package_json().resolve().await?, false).await?;
    let FindContextFileResult::Found(package_json, _) = &*find_package_json else {
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
            package_json.clone(),
        ));
    }

    Ok(ModuleTypeResult::new_with_package_json(
        SpecifiedModuleType::Automatic,
        package_json.clone(),
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
        analyze_ecmascript_module(self, None)
    }

    #[turbo_tasks::function]
    pub fn options(&self) -> Vc<EcmascriptOptions> {
        *self.options
    }
}

impl EcmascriptModuleAsset {
    pub async fn parse(&self) -> Result<Vc<ParseResult>> {
        let options = self.options.await?;
        Ok(parse(
            *self.source,
            self.ty,
            *self.transforms,
            options.analyze_mode == AnalyzeMode::Tracing,
            options.inline_helpers,
        ))
    }

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

        determine_module_type_for_directory(self.origin_path().await?.parent()).await
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
        ident.layer = Some(self.asset_context.into_trait_ref().await?.layer());
        Ok(AssetIdent::new(ident))
    }

    #[turbo_tasks::function]
    fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
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
    async fn as_chunk_item(
        self: ResolvedVc<Self>,
        _module_graph: ResolvedVc<ModuleGraph>,
        chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    ) -> Vc<Box<dyn ChunkItem>> {
        Vc::upcast(ModuleChunkItem::cell(ModuleChunkItem {
            module: self,
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
        let pkg_side_effect_free = is_marked_as_side_effect_free(
            self.ident().path().owned().await?,
            side_effect_free_packages,
        );
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
        Ok(Vc::upcast(
            *MergedEcmascriptModule::new(
                modules,
                entry_points,
                self.options().to_resolved().await?,
            )
            .await?,
        ))
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
        *self.chunking_context
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
            name = display(self.asset_ident().to_string().await?)
        );
        async {
            let this = self.await?;
            let async_module_options = this
                .module
                .get_async_module()
                .module_options(async_module_info);

            // TODO check if we need to pass async_module_info at all
            let content = this
                .module
                .module_content(*this.chunking_context, async_module_info);

            EcmascriptChunkItemContent::new(content, *this.chunking_context, async_module_options)
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
    pub strict: bool,
    pub additional_ids: SmallVec<[ResolvedVc<ModuleId>; 1]>,
}

#[turbo_tasks::value(shared)]
#[derive(Clone, Debug, Hash, TaskInput)]
pub struct EcmascriptModuleContentOptions {
    module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    parsed: Option<ResolvedVc<ParseResult>>,
    specified_module_type: SpecifiedModuleType,
    chunking_context: ResolvedVc<Box<dyn ChunkingContext>>,
    references: ResolvedVc<ModuleReferences>,
    part_references: Vec<ResolvedVc<EcmascriptModulePartReference>>,
    esm_references: ResolvedVc<EsmAssetReferences>,
    code_generation: ResolvedVc<CodeGens>,
    async_module: ResolvedVc<OptionAsyncModule>,
    generate_source_map: bool,
    original_source_map: Option<ResolvedVc<Box<dyn GenerateSourceMap>>>,
    exports: ResolvedVc<EcmascriptExports>,
    async_module_info: Option<ResolvedVc<AsyncModuleInfo>>,
}

impl EcmascriptModuleContentOptions {
    async fn merged_code_gens(
        &self,
        scope_hoisting_context: ScopeHoistingContext<'_>,
        eval_context: &EvalContext,
    ) -> Result<Vec<CodeGeneration>> {
        // Don't read `parsed` here again, it will cause a recomputation as `process_parse_result`
        // has consumed the cell already.
        let EcmascriptModuleContentOptions {
            module,
            chunking_context,
            references,
            part_references,
            esm_references,
            code_generation,
            async_module,
            exports,
            async_module_info,
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
                                eval_context,
                                *module,
                            )
                            .await?,
                    )
                } else {
                    None
                },
            ];

            let part_code_gens = part_references
                .iter()
                .map(|r| r.code_generation(**chunking_context, scope_hoisting_context))
                .try_join()
                .await?;

            let esm_code_gens = esm_references
                .await?
                .iter()
                .map(|r| r.code_generation(**chunking_context, scope_hoisting_context))
                .try_join()
                .await?;

            let code_gens = code_generation
                .await?
                .iter()
                .map(|c| c.code_generation(**chunking_context, scope_hoisting_context))
                .try_join()
                .await?;

            anyhow::Ok(
                part_code_gens
                    .into_iter()
                    .chain(esm_code_gens.into_iter())
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
            module,
            specified_module_type,
            generate_source_map,
            original_source_map,
            chunking_context,
            ..
        } = &*input;

        let minify = chunking_context.minify_type().await?;

        let content = process_parse_result(
            *parsed,
            module.ident(),
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

    /// Creates a new [`Vc<EcmascriptModuleContent>`] without an analysis pass.
    #[turbo_tasks::function]
    pub async fn new_without_analysis(
        parsed: Vc<ParseResult>,
        ident: Vc<AssetIdent>,
        specified_module_type: SpecifiedModuleType,
        generate_source_map: bool,
    ) -> Result<Vc<Self>> {
        let content = process_parse_result(
            Some(parsed.to_resolved().await?),
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
    /// - The `modules` argument is a list of all modules to be merged (and whether their exports
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
        async {
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
                    let m =
                        ResolvedVc::try_sidecast::<Box<dyn EcmascriptChunkPlaceable>>(m).unwrap();
                    (m, modules.get_index_of(&m).unwrap())
                })
                .collect::<Vec<_>>();

            let globals_merged = Globals::default();

            let contents = module_options
                .iter()
                .map(async |options| {
                    let options = options.await?;
                    let EcmascriptModuleContentOptions {
                        chunking_context,
                        parsed,
                        module,
                        specified_module_type,
                        generate_source_map,
                        original_source_map,
                        ..
                    } = &*options;

                    let result = process_parse_result(
                        *parsed,
                        module.ident(),
                        *specified_module_type,
                        *generate_source_map,
                        *original_source_map,
                        *chunking_context.minify_type().await?,
                        Some(&*options),
                        Some(ScopeHoistingOptions {
                            module: *module,
                            modules: &modules,
                        }),
                    )
                    .await?;

                    Ok((*module, result))
                })
                .try_join()
                .await?;

            let (merged_ast, comments, source_maps, original_source_maps, lookup_table) =
                merge_modules(contents, &entry_points, &globals_merged).await?;

            // Use the options from an arbitrary module, since they should all be the same with
            // regards to minify_type and chunking_context.
            let options = module_options.last().unwrap().await?;

            let modules_header_width = modules.len().next_power_of_two().trailing_zeros();
            let content = CodeGenResult {
                program: merged_ast,
                source_map: CodeGenResultSourceMap::ScopeHoisting {
                    modules_header_width,
                    lookup_table: lookup_table.clone(),
                    source_maps,
                },
                comments: CodeGenResultComments::ScopeHoisting {
                    modules_header_width,
                    lookup_table,
                    comments,
                },
                is_esm: true,
                strict: true,
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
                // ensure that the modules are in the same order, not that they form a subgraph that
                // is always imported from the same root module).
                //
                // Also skip the first entry, which is the name of the chunk item.
                .filter(|m| {
                    **m != first_entry
                        && *modules.get(*m).unwrap() == MergeableModuleExposure::External
                })
                .map(|m| m.chunk_item_id(*options.chunking_context).to_resolved())
                .try_join()
                .await?
                .into();

            emit_content(content, additional_ids)
                .instrument(tracing::info_span!("emit code"))
                .await
        }
        .instrument(tracing::info_span!(
            "generate merged code",
            modules = module_options.len()
        ))
        .await
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
#[instrument(level = Level::TRACE, skip_all, name = "merge")]
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
    Arc<Mutex<Vec<ModulePosition>>>,
)> {
    struct SetSyntaxContextVisitor<'a> {
        modules_header_width: u32,
        current_module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        current_module_idx: u32,
        lookup_table: &'a mut Vec<ModulePosition>,
        /// The export syntax contexts in the current AST, which will be mapped to merged_ctxts
        reverse_module_contexts:
            FxHashMap<SyntaxContext, ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>>,
        /// For a given module, the `eval_context.imports.exports`. So for a given export, this
        /// allows looking up the corresponding local binding's name and context.
        export_contexts:
            &'a FxHashMap<ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>, &'a FxHashMap<RcStr, Id>>,
        /// A fresh global SyntaxContext for each module-local context, so that we can merge them
        /// into a single global AST.
        unique_contexts_cache: &'a mut FxHashMap<
            (ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>, SyntaxContext),
            SyntaxContext,
        >,

        error: anyhow::Result<()>,
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

            // If this ident is an imported binding, rewrite the name and context to the
            // corresponding export in the module that exports it.
            if let Some(&module) = self.reverse_module_contexts.get(ctxt) {
                let eval_context_exports = self.export_contexts.get(&module).unwrap();
                // TODO looking up an Atom in a Map<RcStr, _>
                let sym_rc_str: RcStr = sym.as_str().into();
                let (local, local_ctxt) = if let Some((local, local_ctxt)) =
                    eval_context_exports.get(&sym_rc_str)
                {
                    (Some(local), *local_ctxt)
                } else if sym.starts_with("__TURBOPACK__imported__module__") {
                    // The variable corresponding to the `export * as foo from "...";` is generated
                    // in the module generating the reexport (and it's not listed in the
                    // eval_context). `EsmAssetReference::code_gen` uses a dummy span when
                    // generating this variable.
                    (None, SyntaxContext::empty())
                } else {
                    panic!(
                        "Expected to find a local export for {sym} with ctxt {ctxt:#?} in \
                         {eval_context_exports:?}",
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
            // The modules have their own local syntax contexts, which needs to be mapped to
            // contexts that were actually created in the merged Globals.
            let module = self
                .reverse_module_contexts
                .get(local_ctxt)
                .copied()
                .unwrap_or(self.current_module);

            let global_ctxt = self.get_context_for(module, *local_ctxt);
            *local_ctxt = global_ctxt;
        }
        fn visit_mut_span(&mut self, span: &mut Span) {
            // Encode the module index into the span, to be able to retrieve the module later for
            // finding the correct Comments and SourceMap.
            span.lo = CodeGenResultComments::encode_bytepos_with_vec(
                self.modules_header_width,
                self.current_module_idx,
                span.lo,
                self.lookup_table,
            )
            .unwrap_or_else(|err| {
                self.error = Err(err);
                span.lo
            });
            span.hi = CodeGenResultComments::encode_bytepos_with_vec(
                self.modules_header_width,
                self.current_module_idx,
                span.hi,
                self.lookup_table,
            )
            .unwrap_or_else(|err| {
                self.error = Err(err);
                span.hi
            });
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
        .map(|(module, content)| {
            Ok((
                *module,
                content
                    .scope_hoisting_syntax_contexts
                    .as_ref()
                    .map(|(_, export_contexts)| export_contexts)
                    .context("expected exports contexts")?,
            ))
        })
        .collect::<Result<FxHashMap<_, _>>>()?;

    let mut lookup_table = Vec::new();
    let result = GLOBALS.set(globals_merged, || {
        let _ = tracing::trace_span!("merge inner").entered();
        // As an optimization, assume an average number of 5 contexts per module.
        let mut unique_contexts_cache =
            FxHashMap::with_capacity_and_hasher(contents.len() * 5, Default::default());

        let mut prepare_module =
            |module_count: usize,
             current_module_idx: usize,
             (module, content): &(ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>, CodeGenResult),
             program: &mut Program,
             lookup_table: &mut Vec<ModulePosition>| {
                let _ = tracing::trace_span!("prepare module").entered();
                if let CodeGenResult {
                    scope_hoisting_syntax_contexts: Some((module_contexts, _)),
                    ..
                } = content
                {
                    let modules_header_width = module_count.next_power_of_two().trailing_zeros();
                    GLOBALS.set(globals_merged, || {
                        let mut visitor = SetSyntaxContextVisitor {
                            modules_header_width,
                            current_module: *module,
                            current_module_idx: current_module_idx as u32,
                            lookup_table,
                            reverse_module_contexts: module_contexts
                                .iter()
                                .map(|e| (*e.value(), *e.key()))
                                .collect(),
                            export_contexts: &export_contexts,
                            unique_contexts_cache: &mut unique_contexts_cache,
                            error: Ok(()),
                        };
                        program.visit_mut_with(&mut visitor);
                        visitor.error
                    })?;

                    Ok(match program.take() {
                        Program::Module(module) => Either::Left(module.body.into_iter()),
                        // A module without any ModuleItem::ModuleDecl but a
                        // SpecifiedModuleType::EcmaScript can still contain a Module::Script.
                        Program::Script(script) => {
                            Either::Right(script.body.into_iter().map(ModuleItem::Stmt))
                        }
                    })
                } else {
                    bail!("Expected scope_hosting_syntax_contexts");
                }
            };

        let mut inserted = FxHashSet::with_capacity_and_hasher(contents.len(), Default::default());
        // Start with inserting the entry points, and recursively inline all their imports.
        inserted.extend(entry_points.iter().map(|(_, i)| *i));

        let mut inserted_imports = FxHashMap::default();

        let span = tracing::trace_span!("merge ASTs");
        // Replace inserted `__turbopack_merged_esm__(i);` statements with the corresponding
        // ith-module.
        let mut queue = entry_points
            .iter()
            .map(|&(_, i)| {
                prepare_module(
                    contents.len(),
                    i,
                    &contents[i],
                    &mut programs[i],
                    &mut lookup_table,
                )
                .map_err(|err| (i, err))
            })
            .flatten_ok()
            .rev()
            .collect::<Result<Vec<_>, _>>()?;
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
                                    prepare_module(
                                        contents.len(),
                                        index,
                                        &contents[index],
                                        &mut programs[index],
                                        &mut lookup_table,
                                    )
                                    .map_err(|err| (index, err))?
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
                            && name.sym.starts_with("__TURBOPACK__imported__module__")
                        {
                            // var __TURBOPACK__imported__module__.. = __turbopack_context__.i(..);

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
        drop(span);

        let span = tracing::trace_span!("hygiene").entered();
        let mut merged_ast = Program::Module(swc_core::ecma::ast::Module {
            body: result,
            span: DUMMY_SP,
            shebang: None,
        });
        merged_ast.visit_mut_with(&mut swc_core::ecma::transforms::base::hygiene::hygiene());
        drop(span);

        Ok((merged_ast, inserted))
    });

    let (merged_ast, inserted) = match result {
        Ok(v) => v,
        Err((content_idx, err)) => {
            return Err(err.context(format!(
                "Processing {}",
                contents[content_idx].0.ident().to_string().await?
            )));
        }
    };

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

    Ok((
        merged_ast,
        comments,
        source_maps,
        original_source_maps,
        Arc::new(Mutex::new(lookup_table)),
    ))
}

/// Provides information about the other modules in the current scope hoisting group.
///
/// Note that this object contains interior mutability to lazily create syntax contexts in
/// `get_module_syntax_context`.
#[derive(Clone, Copy)]
pub enum ScopeHoistingContext<'a> {
    Some {
        /// The current module when scope hoisting
        module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
        /// All modules in the current group, and whether they should expose their exports
        modules:
            &'a FxIndexMap<ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>, MergeableModuleExposure>,

        is_import_mark: Mark,
        globals: &'a Arc<Globals>,
        // Interior mutability!
        module_syntax_contexts_cache:
            &'a FxDashMap<ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>, SyntaxContext>,
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
            } => match modules.get(module).unwrap() {
                MergeableModuleExposure::None => true,
                MergeableModuleExposure::Internal | MergeableModuleExposure::External => false,
            },
            ScopeHoistingContext::None => false,
        }
    }

    /// To import a specifier from another module, apply this context to the Ident
    pub fn get_module_syntax_context(
        &self,
        module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    ) -> Option<SyntaxContext> {
        match self {
            ScopeHoistingContext::Some {
                modules,
                module_syntax_contexts_cache,
                globals,
                is_import_mark,
                ..
            } => {
                if !modules.contains_key(&module) {
                    return None;
                }

                Some(match module_syntax_contexts_cache.entry(module) {
                    dashmap::Entry::Occupied(e) => *e.get(),
                    dashmap::Entry::Vacant(e) => {
                        let ctxt = GLOBALS.set(globals, || {
                            let mark = Mark::fresh(*is_import_mark);
                            SyntaxContext::empty()
                                .apply_mark(*is_import_mark)
                                .apply_mark(mark)
                        });

                        e.insert(ctxt);
                        ctxt
                    }
                })
            }
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
    is_esm: bool,
    strict: bool,
    original_source_map: CodeGenResultOriginalSourceMap,
    minify: MinifyType,
    #[allow(clippy::type_complexity)]
    /// (Map<Module, corresponding context for imports>, `eval_context.imports.exports`)
    scope_hoisting_syntax_contexts: Option<(
        FxDashMap<ResolvedVc<Box<dyn EcmascriptChunkPlaceable + 'static>>, SyntaxContext>,
        FxHashMap<RcStr, Id>,
    )>,
}

struct ScopeHoistingOptions<'a> {
    module: ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>,
    modules: &'a FxIndexMap<ResolvedVc<Box<dyn EcmascriptChunkPlaceable>>, MergeableModuleExposure>,
}

async fn process_parse_result(
    parsed: Option<ResolvedVc<ParseResult>>,
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
            let (top_level_mark, is_esm, strict) = eval_context
                .as_ref()
                .map_either(
                    |e| {
                        (
                            e.top_level_mark,
                            e.is_esm(specified_module_type),
                            e.imports.strict,
                        )
                    },
                    |e| {
                        (
                            e.top_level_mark,
                            e.is_esm(specified_module_type),
                            e.imports.strict,
                        )
                    },
                )
                .into_inner();

            let (mut code_gens, retain_syntax_context, prepend_ident_comment) =
                if let Some(scope_hoisting_options) = scope_hoisting_options {
                    let is_import_mark = GLOBALS.set(globals, || Mark::new());

                    let module_syntax_contexts_cache = FxDashMap::default();
                    let ctx = ScopeHoistingContext::Some {
                        module: scope_hoisting_options.module,
                        modules: scope_hoisting_options.modules,
                        module_syntax_contexts_cache: &module_syntax_contexts_cache,
                        is_import_mark,
                        globals,
                    };
                    let code_gens = options
                        .unwrap()
                        .merged_code_gens(
                            ctx,
                            match &eval_context {
                                Either::Left(e) => e,
                                Either::Right(e) => e,
                            },
                        )
                        .await?;

                    let export_contexts = eval_context
                        .map_either(
                            |e| Cow::Owned(e.imports.exports),
                            |e| Cow::Borrowed(&e.imports.exports),
                        )
                        .into_inner();
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
                        Some((
                            is_import_mark,
                            module_syntax_contexts_cache,
                            preserved_exports,
                            export_contexts,
                        )),
                        prepend_ident_comment,
                    )
                } else if let Some(options) = options {
                    (
                        options
                            .merged_code_gens(
                                ScopeHoistingContext::None,
                                match &eval_context {
                                    Either::Left(e) => e,
                                    Either::Right(e) => e,
                                },
                            )
                            .await?,
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

                if let Some((is_import_mark, _, preserved_exports, _)) = &retain_syntax_context {
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
                remove_directives(&mut program);
            });

            Ok(CodeGenResult {
                program,
                source_map: if generate_source_map {
                    CodeGenResultSourceMap::Single {
                        source_map: source_map.clone(),
                    }
                } else {
                    CodeGenResultSourceMap::None
                },
                comments: CodeGenResultComments::Single {
                    comments,
                    extra_comments,
                },
                is_esm,
                strict,
                original_source_map: CodeGenResultOriginalSourceMap::Single(original_source_map),
                minify,
                scope_hoisting_syntax_contexts: retain_syntax_context
                    // TODO ideally don't clone here
                    .map(|(_, ctxts, _, export_contexts)| (ctxts, export_contexts.into_owned())),
            })
        },
        async |parse_result| -> Result<CodeGenResult> {
            Ok(match parse_result {
                ParseResult::Ok { .. } => unreachable!(),
                ParseResult::Unparsable { messages } => {
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
                        quote!("e.code = 'MODULE_UNPARSABLE';" as Stmt),
                        quote!("throw e;" as Stmt),
                    ];

                    CodeGenResult {
                        program: Program::Script(Script {
                            span: DUMMY_SP,
                            body,
                            shebang: None,
                        }),
                        source_map: CodeGenResultSourceMap::None,
                        comments: CodeGenResultComments::Empty,
                        is_esm: false,
                        strict: false,
                        original_source_map: CodeGenResultOriginalSourceMap::Single(None),
                        minify: MinifyType::NoMinify,
                        scope_hoisting_syntax_contexts: None,
                    }
                }
                ParseResult::NotFound => {
                    let path = ident.path().to_string().await?;
                    let msg = format!("Could not parse module '{path}', file not found");
                    let body = vec![
                        quote!(
                            "const e = new Error($msg);" as Stmt,
                            msg: Expr = Expr::Lit(msg.into()),
                        ),
                        quote!("e.code = 'MODULE_UNPARSABLE';" as Stmt),
                        quote!("throw e;" as Stmt),
                    ];
                    CodeGenResult {
                        program: Program::Script(Script {
                            span: DUMMY_SP,
                            body,
                            shebang: None,
                        }),
                        source_map: CodeGenResultSourceMap::None,
                        comments: CodeGenResultComments::Empty,
                        is_esm: false,
                        strict: false,
                        original_source_map: CodeGenResultOriginalSourceMap::Single(None),
                        minify: MinifyType::NoMinify,
                        scope_hoisting_syntax_contexts: None,
                    }
                }
            })
        },
    )
    .instrument(tracing::trace_span!(
        "process parse result",
        ident = display(ident.to_string().await?),
    ))
    .await
}

/// Try to avoid cloning the AST and Globals by unwrapping the ReadRef (and cloning otherwise).
async fn with_consumed_parse_result<T>(
    parsed: Option<ResolvedVc<ParseResult>>,
    success: impl AsyncFnOnce(
        Program,
        &Arc<SourceMap>,
        &Arc<Globals>,
        Either<EvalContext, &'_ EvalContext>,
        Either<ImmutableComments, Arc<ImmutableComments>>,
    ) -> Result<T>,
    error: impl AsyncFnOnce(&ParseResult) -> Result<T>,
) -> Result<T> {
    let Some(parsed) = parsed else {
        let globals = Globals::new();
        let eval_context = GLOBALS.set(&globals, || EvalContext {
            unresolved_mark: Mark::new(),
            top_level_mark: Mark::new(),
            imports: Default::default(),
            force_free_values: Default::default(),
        });
        return success(
            Program::Module(swc_core::ecma::ast::Module::dummy()),
            &Default::default(),
            &Default::default(),
            Either::Left(eval_context),
            Either::Left(Default::default()),
        )
        .await;
    };

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
        strict,
        original_source_map,
        minify,
        scope_hoisting_syntax_contexts: _,
    } = content;

    let generate_source_map = source_map.is_some();

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
        strict,
        additional_ids,
    }
    .cell())
}

#[instrument(level = Level::TRACE, skip_all, name = "apply code generation")]
fn process_content_with_code_gens(
    program: &mut Program,
    globals: &Globals,
    code_gens: &mut Vec<CodeGeneration>,
) {
    let mut visitors = Vec::new();
    let mut root_visitors = Vec::new();
    let mut early_hoisted_stmts = FxIndexMap::default();
    let mut hoisted_stmts = FxIndexMap::default();
    let mut early_late_stmts = FxIndexMap::default();
    let mut late_stmts = FxIndexMap::default();
    for code_gen in code_gens {
        for CodeGenerationHoistedStmt { key, stmt } in code_gen.hoisted_stmts.drain(..) {
            hoisted_stmts.entry(key).or_insert(stmt);
        }
        for CodeGenerationHoistedStmt { key, stmt } in code_gen.early_hoisted_stmts.drain(..) {
            early_hoisted_stmts.insert(key.clone(), stmt);
        }
        for CodeGenerationHoistedStmt { key, stmt } in code_gen.late_stmts.drain(..) {
            late_stmts.insert(key.clone(), stmt);
        }
        for CodeGenerationHoistedStmt { key, stmt } in code_gen.early_late_stmts.drain(..) {
            early_late_stmts.insert(key.clone(), stmt);
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
            body.extend(
                early_late_stmts
                    .into_values()
                    .chain(late_stmts.into_values())
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
            body.extend(
                early_late_stmts
                    .into_values()
                    .chain(late_stmts.into_values()),
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
        type Target = Id;

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
    swc_core::ecma::transforms::base::rename::renamer_keep_contexts(
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

#[derive(Default)]
enum CodeGenResultSourceMap {
    #[default]
    /// No source map should be generated for this module
    None,
    Single {
        source_map: Arc<SourceMap>,
    },
    ScopeHoisting {
        /// The bitwidth of the modules header in the spans, see
        /// [CodeGenResultComments::encode_bytepos]
        modules_header_width: u32,
        lookup_table: Arc<Mutex<Vec<ModulePosition>>>,
        source_maps: Vec<CodeGenResultSourceMap>,
    },
}

impl CodeGenResultSourceMap {
    fn is_some(&self) -> bool {
        match self {
            CodeGenResultSourceMap::None => false,
            CodeGenResultSourceMap::Single { .. }
            | CodeGenResultSourceMap::ScopeHoisting { .. } => true,
        }
    }
}

impl Debug for CodeGenResultSourceMap {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CodeGenResultSourceMap::None => write!(f, "CodeGenResultSourceMap::None"),
            CodeGenResultSourceMap::Single { source_map } => {
                write!(
                    f,
                    "CodeGenResultSourceMap::Single {{ source_map: {:?} }}",
                    source_map.files().clone()
                )
            }
            CodeGenResultSourceMap::ScopeHoisting {
                modules_header_width,
                source_maps,
                ..
            } => write!(
                f,
                "CodeGenResultSourceMap::ScopeHoisting {{ modules_header_width: \
                 {modules_header_width}, source_maps: {source_maps:?} }}",
            ),
        }
    }
}

impl Files for CodeGenResultSourceMap {
    fn try_lookup_source_file(
        &self,
        pos: BytePos,
    ) -> Result<Option<Arc<SourceFile>>, SourceMapLookupError> {
        match self {
            CodeGenResultSourceMap::None => Ok(None),
            CodeGenResultSourceMap::Single { source_map } => source_map.try_lookup_source_file(pos),
            CodeGenResultSourceMap::ScopeHoisting {
                modules_header_width,
                lookup_table,
                source_maps,
            } => {
                let (module, pos) =
                    CodeGenResultComments::decode_bytepos(*modules_header_width, pos, lookup_table);
                source_maps[module].try_lookup_source_file(pos)
            }
        }
    }

    fn is_in_file(&self, f: &Arc<SourceFile>, raw_pos: BytePos) -> bool {
        match self {
            CodeGenResultSourceMap::None => false,
            CodeGenResultSourceMap::Single { .. } => f.start_pos <= raw_pos && raw_pos < f.end_pos,
            CodeGenResultSourceMap::ScopeHoisting { .. } => {
                // let (module, pos) = CodeGenResultComments::decode_bytepos(*modules_header_width,
                // pos);

                // TODO optimize this, unfortunately, `SourceFile` doesn't know which `module` it
                // belongs from.
                false
            }
        }
    }

    fn map_raw_pos(&self, pos: BytePos) -> BytePos {
        match self {
            CodeGenResultSourceMap::None => BytePos::DUMMY,
            CodeGenResultSourceMap::Single { .. } => pos,
            CodeGenResultSourceMap::ScopeHoisting {
                modules_header_width,
                lookup_table,
                ..
            } => CodeGenResultComments::decode_bytepos(*modules_header_width, pos, lookup_table).1,
        }
    }
}

impl SourceMapper for CodeGenResultSourceMap {
    fn lookup_char_pos(&self, pos: BytePos) -> Loc {
        match self {
            CodeGenResultSourceMap::None => {
                panic!("CodeGenResultSourceMap::None cannot lookup_char_pos")
            }
            CodeGenResultSourceMap::Single { source_map } => source_map.lookup_char_pos(pos),
            CodeGenResultSourceMap::ScopeHoisting {
                modules_header_width,
                lookup_table,
                source_maps,
            } => {
                let (module, pos) =
                    CodeGenResultComments::decode_bytepos(*modules_header_width, pos, lookup_table);
                source_maps[module].lookup_char_pos(pos)
            }
        }
    }
    fn span_to_lines(&self, sp: Span) -> FileLinesResult {
        match self {
            CodeGenResultSourceMap::None => {
                panic!("CodeGenResultSourceMap::None cannot span_to_lines")
            }
            CodeGenResultSourceMap::Single { source_map } => source_map.span_to_lines(sp),
            CodeGenResultSourceMap::ScopeHoisting {
                modules_header_width,
                lookup_table,
                source_maps,
            } => {
                let (module, lo) = CodeGenResultComments::decode_bytepos(
                    *modules_header_width,
                    sp.lo,
                    lookup_table,
                );
                source_maps[module].span_to_lines(Span {
                    lo,
                    hi: CodeGenResultComments::decode_bytepos(
                        *modules_header_width,
                        sp.hi,
                        lookup_table,
                    )
                    .1,
                })
            }
        }
    }
    fn span_to_string(&self, sp: Span) -> String {
        match self {
            CodeGenResultSourceMap::None => {
                panic!("CodeGenResultSourceMap::None cannot span_to_string")
            }
            CodeGenResultSourceMap::Single { source_map } => source_map.span_to_string(sp),
            CodeGenResultSourceMap::ScopeHoisting {
                modules_header_width,
                lookup_table,
                source_maps,
            } => {
                let (module, lo) = CodeGenResultComments::decode_bytepos(
                    *modules_header_width,
                    sp.lo,
                    lookup_table,
                );
                source_maps[module].span_to_string(Span {
                    lo,
                    hi: CodeGenResultComments::decode_bytepos(
                        *modules_header_width,
                        sp.hi,
                        lookup_table,
                    )
                    .1,
                })
            }
        }
    }
    fn span_to_filename(&self, sp: Span) -> Arc<FileName> {
        match self {
            CodeGenResultSourceMap::None => {
                panic!("CodeGenResultSourceMap::None cannot span_to_filename")
            }
            CodeGenResultSourceMap::Single { source_map } => source_map.span_to_filename(sp),
            CodeGenResultSourceMap::ScopeHoisting {
                modules_header_width,
                lookup_table,
                source_maps,
            } => {
                let (module, lo) = CodeGenResultComments::decode_bytepos(
                    *modules_header_width,
                    sp.lo,
                    lookup_table,
                );
                source_maps[module].span_to_filename(Span {
                    lo,
                    hi: CodeGenResultComments::decode_bytepos(
                        *modules_header_width,
                        sp.hi,
                        lookup_table,
                    )
                    .1,
                })
            }
        }
    }
    fn merge_spans(&self, sp_lhs: Span, sp_rhs: Span) -> Option<Span> {
        match self {
            CodeGenResultSourceMap::None => {
                panic!("CodeGenResultSourceMap::None cannot merge_spans")
            }
            CodeGenResultSourceMap::Single { source_map } => source_map.merge_spans(sp_lhs, sp_rhs),
            CodeGenResultSourceMap::ScopeHoisting {
                modules_header_width,
                lookup_table,
                source_maps,
            } => {
                let (module_lhs, lo_lhs) = CodeGenResultComments::decode_bytepos(
                    *modules_header_width,
                    sp_lhs.lo,
                    lookup_table,
                );
                let (module_rhs, lo_rhs) = CodeGenResultComments::decode_bytepos(
                    *modules_header_width,
                    sp_rhs.lo,
                    lookup_table,
                );
                if module_lhs != module_rhs {
                    return None;
                }
                source_maps[module_lhs].merge_spans(
                    Span {
                        lo: lo_lhs,
                        hi: CodeGenResultComments::decode_bytepos(
                            *modules_header_width,
                            sp_lhs.hi,
                            lookup_table,
                        )
                        .1,
                    },
                    Span {
                        lo: lo_rhs,
                        hi: CodeGenResultComments::decode_bytepos(
                            *modules_header_width,
                            sp_rhs.hi,
                            lookup_table,
                        )
                        .1,
                    },
                )
            }
        }
    }
    fn call_span_if_macro(&self, sp: Span) -> Span {
        match self {
            CodeGenResultSourceMap::None => {
                panic!("CodeGenResultSourceMap::None cannot call_span_if_macro")
            }
            CodeGenResultSourceMap::Single { source_map } => source_map.call_span_if_macro(sp),
            CodeGenResultSourceMap::ScopeHoisting {
                modules_header_width,
                lookup_table,
                source_maps,
            } => {
                let (module, lo) = CodeGenResultComments::decode_bytepos(
                    *modules_header_width,
                    sp.lo,
                    lookup_table,
                );
                source_maps[module].call_span_if_macro(Span {
                    lo,
                    hi: CodeGenResultComments::decode_bytepos(
                        *modules_header_width,
                        sp.hi,
                        lookup_table,
                    )
                    .1,
                })
            }
        }
    }
    fn doctest_offset_line(&self, _line: usize) -> usize {
        panic!("doctest_offset_line is not implemented for CodeGenResultSourceMap");
    }
    fn span_to_snippet(&self, sp: Span) -> Result<String, Box<SpanSnippetError>> {
        match self {
            CodeGenResultSourceMap::None => Err(Box::new(SpanSnippetError::SourceNotAvailable {
                filename: FileName::Anon,
            })),
            CodeGenResultSourceMap::Single { source_map } => source_map.span_to_snippet(sp),
            CodeGenResultSourceMap::ScopeHoisting {
                modules_header_width,
                lookup_table,
                source_maps,
            } => {
                let (module, lo) = CodeGenResultComments::decode_bytepos(
                    *modules_header_width,
                    sp.lo,
                    lookup_table,
                );
                source_maps[module].span_to_snippet(Span {
                    lo,
                    hi: CodeGenResultComments::decode_bytepos(
                        *modules_header_width,
                        sp.hi,
                        lookup_table,
                    )
                    .1,
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

/// Stores a module index in position 0 and the full byte position of the source map in position 1
struct ModulePosition(u32, u32);

enum CodeGenResultComments {
    Single {
        comments: Either<ImmutableComments, Arc<ImmutableComments>>,
        extra_comments: SwcComments,
    },
    ScopeHoisting {
        /// The bitwidth of the modules header in the spans, see
        /// [CodeGenResultComments::encode_bytepos]
        modules_header_width: u32,
        lookup_table: Arc<Mutex<Vec<ModulePosition>>>,
        comments: Vec<CodeGenResultComments>,
    },
    Empty,
}

unsafe impl Send for CodeGenResultComments {}
unsafe impl Sync for CodeGenResultComments {}

impl CodeGenResultComments {
    const CONTINUATION_BIT: u32 = 1 << 31;
    const SIGN_EXTENSION_BIT: u32 = 1 << 30;

    #[inline]
    fn encode_bytepos_impl(
        modules_header_width: u32,
        module: u32,
        pos: BytePos,
        push_into_lookup: &mut impl FnMut(u32, u32) -> Result<u32>,
    ) -> Result<BytePos> {
        if pos.is_dummy() {
            // nothing to encode
            return Ok(pos);
        }

        // Bit layout for encoded BytePos (32 bits):
        // [31] Continuation bit. If set (1), the remaining 31 bits [0..30] encode an index into
        //      the lookup vector where (module, original_bytepos) is stored.
        //      In this case, decoding ignores other fields and fetches from the table.
        // If not set (0):
        // [30] Sign-extend bit. Indicates whether the stolen high bits of the original bytepos
        //      were all 1s (1) or all 0s (0), so that decoding can restore the original high bits.
        // [30 - modules_header_width + 1 .. 30) Module id: modules_header_width bits immediately
        //      below the sign-extend bit.
        // [0 .. (32 - (2 + modules_header_width)) ) Remaining low bits store the truncated bytepos.
        //
        // Notes:
        // - We reserve 2 header bits always (continuation + sign-extend), so header_width =
        //   modules_header_width + 2, and pos_width = 32 - header_width.
        // - When the original value does not fit in the available pos_width with a uniform high bit
        //   pattern, we spill (set continuation) and store (module, pos) in the lookup table and
        //   encode the index with the continuation bit set.
        //
        // Example (diagrammatic only):
        // modules_header_width = 4
        // Key:
        // (c = continuation, s = sign-extend, m = module, p = pos bits, i = lookup table index)
        //
        // The continuation bit is set, and the remaining 31 bits are reinterpreted as the index
        // into the lookup table.
        // Bytes: 1iii iiii iiii iiii iiii iiii iiii iiii
        //
        // The continuation bit is not set,
        // Bytes: 0smm mmpp pppp pppp pppp pppp pppp pppp

        let header_width = modules_header_width + 2;
        let pos_width = 32 - header_width;

        let pos = pos.0;

        let old_high_bits = pos >> pos_width;
        let high_bits_set = if (2u32.pow(header_width) - 1) == old_high_bits {
            true
        } else if old_high_bits == 0 {
            false
        } else {
            // The integer is too large for our desired header width and we need to store the result
            // in our vector and set the flag to reinterpret this data as the index of
            // the vector where the element is being stored.
            let ix = push_into_lookup(module, pos)?;
            // Make sure that the index fits within the allotted bits
            assert_eq!(ix & CodeGenResultComments::CONTINUATION_BIT, 0);

            return Ok(BytePos(ix | CodeGenResultComments::CONTINUATION_BIT));
        };

        let pos = pos & !((2u32.pow(header_width) - 1) << pos_width);
        let encoded_high_bits = if high_bits_set {
            CodeGenResultComments::SIGN_EXTENSION_BIT
        } else {
            0
        };
        let encoded_module = module << pos_width;

        Ok(BytePos(encoded_module | encoded_high_bits | pos))
    }

    fn take(&mut self) -> Self {
        std::mem::replace(self, CodeGenResultComments::Empty)
    }

    fn consumable(&self) -> CodeGenResultCommentsConsumable<'_> {
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
                modules_header_width,
                lookup_table,
                comments,
            } => CodeGenResultCommentsConsumable::ScopeHoisting {
                modules_header_width: *modules_header_width,
                lookup_table: lookup_table.clone(),
                comments: comments.iter().map(|c| c.consumable()).collect(),
            },
            CodeGenResultComments::Empty => CodeGenResultCommentsConsumable::Empty,
        }
    }

    fn encode_bytepos(
        modules_header_width: u32,
        module: u32,
        pos: BytePos,
        lookup_table: Arc<Mutex<Vec<ModulePosition>>>,
    ) -> Result<BytePos> {
        let mut push = |module: u32, pos_u32: u32| -> Result<u32> {
            let mut lookup_table = lookup_table
                .lock()
                .map_err(|_| anyhow!("Failed to grab lock on the index map for byte positions"))?;
            let ix = lookup_table.len() as u32;
            if ix >= 1 << 30 {
                return Err(anyhow!("Too many byte positions being stored"));
            }
            lookup_table.push(ModulePosition(module, pos_u32));
            Ok(ix)
        };
        Self::encode_bytepos_impl(modules_header_width, module, pos, &mut push)
    }

    fn encode_bytepos_with_vec(
        modules_header_width: u32,
        module: u32,
        pos: BytePos,
        lookup_table: &mut Vec<ModulePosition>,
    ) -> Result<BytePos> {
        let mut push = |module: u32, pos_u32: u32| -> Result<u32> {
            let ix = lookup_table.len() as u32;
            if ix >= 1 << 30 {
                return Err(anyhow!("Too many byte positions being stored"));
            }
            lookup_table.push(ModulePosition(module, pos_u32));
            Ok(ix)
        };
        Self::encode_bytepos_impl(modules_header_width, module, pos, &mut push)
    }

    fn decode_bytepos(
        modules_header_width: u32,
        pos: BytePos,
        lookup_table: &Mutex<Vec<ModulePosition>>,
    ) -> (usize, BytePos) {
        if pos.is_dummy() {
            // nothing to decode
            panic!("Cannot decode dummy BytePos");
        }

        let header_width = modules_header_width + 2;
        let pos_width = 32 - header_width;

        if (CodeGenResultComments::CONTINUATION_BIT & pos.0)
            == CodeGenResultComments::CONTINUATION_BIT
        {
            let lookup_table = lookup_table
                .lock()
                .expect("Failed to grab lock on the index map for byte position");
            let ix = pos.0 & !CodeGenResultComments::CONTINUATION_BIT;
            let ModulePosition(module, pos) = lookup_table[ix as usize];

            return (module as usize, BytePos(pos));
        }

        let high_bits_set = pos.0 >> 30 & 1 == 1;
        let module = (pos.0 << 2) >> (pos_width + 2);
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
        modules_header_width: u32,
        lookup_table: Arc<Mutex<Vec<ModulePosition>>>,
        comments: Vec<CodeGenResultCommentsConsumable<'a>>,
    },
    Empty,
}
/// All BytePos in Spans in the AST are encoded correctly in [`merge_modules`], but the Comments
/// also contain spans. These also need to be encoded so that all pos in `mappings` are consistently
/// encoded.
fn encode_module_into_comment_span(
    modules_header_width: u32,
    module: usize,
    mut comment: Comment,
    lookup_table: Arc<Mutex<Vec<ModulePosition>>>,
) -> Comment {
    comment.span.lo = CodeGenResultComments::encode_bytepos(
        modules_header_width,
        module as u32,
        comment.span.lo,
        lookup_table.clone(),
    )
    .unwrap();
    comment.span.hi = CodeGenResultComments::encode_bytepos(
        modules_header_width,
        module as u32,
        comment.span.hi,
        lookup_table,
    )
    .unwrap();
    comment
}

impl Comments for CodeGenResultCommentsConsumable<'_> {
    fn add_leading(&self, _pos: BytePos, _cmt: Comment) {
        unimplemented!("add_leading")
    }

    fn add_leading_comments(&self, _pos: BytePos, _comments: Vec<Comment>) {
        unimplemented!("add_leading_comments")
    }

    fn has_leading(&self, pos: BytePos) -> bool {
        if pos.is_dummy() {
            return false;
        }
        match self {
            Self::Single {
                comments,
                extra_comments,
            } => comments.has_leading(pos) || extra_comments.has_leading(pos),
            Self::ScopeHoisting {
                modules_header_width,
                lookup_table,
                comments,
            } => {
                let (module, pos) =
                    CodeGenResultComments::decode_bytepos(*modules_header_width, pos, lookup_table);
                comments[module].has_leading(pos)
            }
            Self::Empty => false,
        }
    }

    fn move_leading(&self, _from: BytePos, _to: BytePos) {
        unimplemented!("move_leading")
    }

    fn take_leading(&self, pos: BytePos) -> Option<Vec<Comment>> {
        if pos.is_dummy() {
            return None;
        }
        match self {
            Self::Single {
                comments,
                extra_comments,
            } => merge_option_vec(comments.take_leading(pos), extra_comments.take_leading(pos)),
            Self::ScopeHoisting {
                modules_header_width,
                lookup_table,
                comments,
            } => {
                let (module, pos) =
                    CodeGenResultComments::decode_bytepos(*modules_header_width, pos, lookup_table);
                comments[module].take_leading(pos).map(|comments| {
                    comments
                        .into_iter()
                        .map(|c| {
                            encode_module_into_comment_span(
                                *modules_header_width,
                                module,
                                c,
                                lookup_table.clone(),
                            )
                        })
                        .collect()
                })
            }
            Self::Empty => None,
        }
    }

    fn get_leading(&self, pos: BytePos) -> Option<Vec<Comment>> {
        if pos.is_dummy() {
            return None;
        }
        match self {
            Self::Single {
                comments,
                extra_comments,
            } => merge_option_vec(comments.get_leading(pos), extra_comments.get_leading(pos)),
            Self::ScopeHoisting {
                modules_header_width,
                lookup_table,
                comments,
            } => {
                let (module, pos) =
                    CodeGenResultComments::decode_bytepos(*modules_header_width, pos, lookup_table);
                comments[module].get_leading(pos).map(|comments| {
                    comments
                        .into_iter()
                        .map(|c| {
                            encode_module_into_comment_span(
                                *modules_header_width,
                                module,
                                c,
                                lookup_table.clone(),
                            )
                        })
                        .collect()
                })
            }
            Self::Empty => None,
        }
    }

    fn add_trailing(&self, _pos: BytePos, _cmt: Comment) {
        unimplemented!("add_trailing")
    }

    fn add_trailing_comments(&self, _pos: BytePos, _comments: Vec<Comment>) {
        unimplemented!("add_trailing_comments")
    }

    fn has_trailing(&self, pos: BytePos) -> bool {
        if pos.is_dummy() {
            return false;
        }
        match self {
            Self::Single {
                comments,
                extra_comments,
            } => comments.has_trailing(pos) || extra_comments.has_trailing(pos),
            Self::ScopeHoisting {
                modules_header_width,
                lookup_table,
                comments,
            } => {
                let (module, pos) =
                    CodeGenResultComments::decode_bytepos(*modules_header_width, pos, lookup_table);
                comments[module].has_trailing(pos)
            }
            Self::Empty => false,
        }
    }

    fn move_trailing(&self, _from: BytePos, _to: BytePos) {
        unimplemented!("move_trailing")
    }

    fn take_trailing(&self, pos: BytePos) -> Option<Vec<Comment>> {
        if pos.is_dummy() {
            return None;
        }
        match self {
            Self::Single {
                comments,
                extra_comments,
            } => merge_option_vec(
                comments.take_trailing(pos),
                extra_comments.take_trailing(pos),
            ),
            Self::ScopeHoisting {
                modules_header_width,
                lookup_table,
                comments,
            } => {
                let (module, pos) =
                    CodeGenResultComments::decode_bytepos(*modules_header_width, pos, lookup_table);
                comments[module].take_trailing(pos).map(|comments| {
                    comments
                        .into_iter()
                        .map(|c| {
                            encode_module_into_comment_span(
                                *modules_header_width,
                                module,
                                c,
                                lookup_table.clone(),
                            )
                        })
                        .collect()
                })
            }
            Self::Empty => None,
        }
    }

    fn get_trailing(&self, pos: BytePos) -> Option<Vec<Comment>> {
        if pos.is_dummy() {
            return None;
        }
        match self {
            Self::Single {
                comments,
                extra_comments,
            } => merge_option_vec(comments.get_leading(pos), extra_comments.get_leading(pos)),
            Self::ScopeHoisting {
                modules_header_width,
                lookup_table,
                comments,
            } => {
                let (module, pos) =
                    CodeGenResultComments::decode_bytepos(*modules_header_width, pos, lookup_table);
                comments[module].get_leading(pos).map(|comments| {
                    comments
                        .into_iter()
                        .map(|c| {
                            encode_module_into_comment_span(
                                *modules_header_width,
                                module,
                                c,
                                lookup_table.clone(),
                            )
                        })
                        .collect()
                })
            }
            Self::Empty => None,
        }
    }

    fn add_pure_comment(&self, _pos: BytePos) {
        unimplemented!("add_pure_comment")
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

#[cfg(test)]
mod tests {
    use super::*;
    fn bytepos_ensure_identical(modules_header_width: u32, pos: BytePos) {
        let module_count = 2u32.pow(modules_header_width);
        let lookup_table = Arc::new(Mutex::new(Vec::new()));

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
            let encoded = CodeGenResultComments::encode_bytepos(
                modules_header_width,
                module,
                pos,
                lookup_table.clone(),
            )
            .unwrap();
            let (decoded_module, decoded_pos) =
                CodeGenResultComments::decode_bytepos(modules_header_width, encoded, &lookup_table);
            assert_eq!(
                decoded_module as u32, module,
                "Testing width {modules_header_width} and pos {pos:?}"
            );
            assert_eq!(
                decoded_pos, pos,
                "Testing width {modules_header_width} and pos {pos:?}"
            );
        }
    }

    #[test]
    fn test_encode_decode_bytepos_format() {
        let table = Arc::new(Mutex::new(Vec::new()));

        for (pos, module, modules_header_width, result) in [
            (
                0b00000000000000000000000000000101,
                0b1,
                1,
                0b00100000000000000000000000000101,
            ),
            (
                0b00000000000000000000000000000101,
                0b01,
                2,
                0b00010000000000000000000000000101,
            ),
            (
                0b11111111111111110000000000000101,
                0b0110,
                4,
                0b01011011111111110000000000000101,
            ),
            (
                BytePos::PLACEHOLDER.0,
                0b01111,
                5,
                0b01011111111111111111111111111101,
            ),
            (
                BytePos::PURE.0,
                0b01111,
                5,
                0b01011111111111111111111111111110,
            ),
            (
                BytePos::SYNTHESIZED.0,
                0b01111,
                5,
                0b01011111111111111111111111111111,
            ),
            // This is an index that should trigger the overflow to store the position into the
            // lookup table
            (
                0b00000111111111110000000000000101,
                0b0001,
                4,
                0b10000000000000000000000000000000,
            ),
            // Another one should increase the index by 1
            (
                0b00000111111111110000000000111110,
                0b0001,
                4,
                0b10000000000000000000000000000001,
            ),
            // Special case, DUMMY stays a DUMMY
            (BytePos::DUMMY.0, 0b0001, 4, BytePos::DUMMY.0),
        ] {
            let encoded = CodeGenResultComments::encode_bytepos(
                modules_header_width,
                module,
                BytePos(pos),
                table.clone(),
            )
            .unwrap();
            assert_eq!(encoded.0, result);

            // Ensure that the correct original module and bytepos are stored when overflow occurs
            if encoded.0 & CodeGenResultComments::CONTINUATION_BIT
                == CodeGenResultComments::CONTINUATION_BIT
            {
                let index = encoded.0 & !CodeGenResultComments::CONTINUATION_BIT;
                let ModulePosition(encoded_module, encoded_pos) =
                    table.lock().unwrap()[index as usize];
                assert_eq!(encoded_module, module);
                assert_eq!(encoded_pos, pos);
            }
        }
    }

    #[test]
    fn test_encode_decode_bytepos_lossless() {
        // This is copied from swc (it's not exported), comments the range above this value.
        const DUMMY_RESERVE: u32 = u32::MAX - 2_u32.pow(16);

        for modules_header_width in 1..=10 {
            for pos in [
                // BytePos::DUMMY, // This must never get decoded in the first place
                BytePos(1),
                BytePos(2),
                BytePos(100),
                BytePos(4_000_000),
                BytePos(600_000_000),
                BytePos(u32::MAX - 3), // The maximum allowed value that isn't reserved by SWC
                BytePos::PLACEHOLDER,
                BytePos::SYNTHESIZED,
                BytePos::PURE,
                BytePos(DUMMY_RESERVE),
                BytePos(DUMMY_RESERVE + 10),
                BytePos(DUMMY_RESERVE + 10000),
            ] {
                bytepos_ensure_identical(modules_header_width, pos);
            }
        }
    }
}
