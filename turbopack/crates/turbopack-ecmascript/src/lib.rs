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
pub mod chunk_group_files_asset;
pub mod code_gen;
mod errors;
pub mod magic_identifier;
pub mod manifest;
pub mod minify;
pub mod parse;
mod path_visitor;
pub mod references;
pub mod runtime_functions;
pub mod side_effect_optimization;
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
use code_gen::{CodeGenerateable, CodeGeneration, CodeGenerationHoistedStmt};
use either::Either;
use parse::{parse, ParseResult};
use path_visitor::ApplyVisitors;
use references::esm::UrlRewriteBehavior;
pub use references::{AnalyzeEcmascriptModuleResult, TURBOPACK_HELPER};
use serde::{Deserialize, Serialize};
pub use static_code::StaticEcmascriptCode;
use swc_core::{
    common::{comments::Comments, util::take::Take, Globals, Mark, GLOBALS},
    ecma::{
        ast::{self, ModuleItem, Program, Script},
        codegen::{text_writer::JsWriter, Emitter},
        visit::{VisitMutWith, VisitMutWithAstPath},
    },
};
pub use transform::{
    CustomTransformer, EcmascriptInputTransform, EcmascriptInputTransforms, TransformContext,
    TransformPlugin, UnsupportedServerActionIssue,
};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    trace::TraceRawVcs, FxIndexMap, NonLocalValue, ReadRef, ResolvedVc, TaskInput, TryJoinIterExt,
    Value, ValueToString, Vc,
};
use turbo_tasks_fs::{rope::Rope, FileJsonContent, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        AsyncModuleInfo, ChunkItem, ChunkType, ChunkableModule, ChunkingContext, EvaluatableAsset,
    },
    compile_time_info::CompileTimeInfo,
    context::AssetContext,
    ident::AssetIdent,
    module::{Module, OptionModule},
    module_graph::ModuleGraph,
    reference::ModuleReferences,
    reference_type::InnerAssets,
    resolve::{
        find_context_file, origin::ResolveOrigin, package_json, parse::Request,
        FindContextFileResult,
    },
    source::Source,
    source_map::OptionStringifiedSourceMap,
};
// TODO remove this
pub use turbopack_resolve::ecmascript as resolve;

use self::chunk::{EcmascriptChunkItemContent, EcmascriptChunkType, EcmascriptExports};
use crate::{
    chunk::EcmascriptChunkPlaceable,
    code_gen::CodeGens,
    parse::generate_js_source_map,
    references::{analyse_ecmascript_module, async_module::OptionAsyncModule},
    transform::remove_shebang,
};

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Hash, Debug, Clone, Copy, Default, TaskInput)]
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

#[turbo_tasks::value(shared, serialization = "auto_for_input")]
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
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(Hash, Debug, Copy, Clone)]
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

#[turbo_tasks::function]
fn modifier() -> Vc<RcStr> {
    Vc::cell("ecmascript".into())
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
                Value::new(self.ty),
                *self.transforms,
                *self.options,
                *self.compile_time_info,
                *inner_assets,
            )
        } else {
            EcmascriptModuleAsset::new(
                *self.source,
                *self.asset_context,
                Value::new(self.ty),
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
    fn failsafe_parse(self: Vc<Self>) -> Result<Vc<ParseResult>>;

    fn parse_original(self: Vc<Self>) -> Result<Vc<ParseResult>>;

    fn ty(self: Vc<Self>) -> Result<Vc<EcmascriptModuleAssetType>>;
}

#[turbo_tasks::value_trait]
pub trait EcmascriptAnalyzable {
    fn analyze(self: Vc<Self>) -> Vc<AnalyzeEcmascriptModuleResult>;

    /// Generates module contents without an analysis pass. This is useful for
    /// transforming code that is not a module, e.g. runtime code.
    async fn module_content_without_analysis(
        self: Vc<Self>,
        generate_source_map: Vc<bool>,
    ) -> Result<Vc<EcmascriptModuleContent>>;

    async fn module_content(
        self: Vc<Self>,
        module_graph: Vc<ModuleGraph>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<EcmascriptModuleContent>>;
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
    #[turbo_tasks::function]
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
        generate_source_map: Vc<bool>,
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
    async fn module_content(
        self: Vc<Self>,
        module_graph: Vc<ModuleGraph>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<EcmascriptModuleContent>> {
        let parsed = self.parse().to_resolved().await?;

        let analyze = self.analyze().await?;

        let module_type_result = *self.determine_module_type().await?;
        let generate_source_map = chunking_context.reference_module_source_maps(Vc::upcast(self));

        Ok(EcmascriptModuleContent::new(
            *parsed,
            self.ident(),
            module_type_result.module_type,
            module_graph,
            chunking_context,
            *analyze.references,
            *analyze.code_generation,
            *analyze.async_module,
            generate_source_map,
            *analyze.source_map,
            *analyze.exports,
            async_module_info,
        ))
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
    if let FileJsonContent::Content(content) = &*package_json.read_json().await? {
        if let Some(r#type) = content.get("type") {
            return Ok(ModuleTypeResult::new_with_package_json(
                match r#type.as_str() {
                    Some("module") => SpecifiedModuleType::EcmaScript,
                    Some("commonjs") => SpecifiedModuleType::CommonJs,
                    _ => SpecifiedModuleType::Automatic,
                },
                *package_json,
            ));
        }
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

        ty: Value<EcmascriptModuleAssetType>,
        transforms: ResolvedVc<EcmascriptInputTransforms>,
        options: ResolvedVc<EcmascriptOptions>,
        compile_time_info: ResolvedVc<CompileTimeInfo>,
    ) -> Vc<Self> {
        Self::cell(EcmascriptModuleAsset {
            source,
            asset_context,
            ty: ty.into_value(),
            transforms,
            options,

            compile_time_info,
            inner_assets: None,
            last_successful_parse: Default::default(),
        })
    }

    #[turbo_tasks::function]
    pub fn new_with_inner_assets(
        source: ResolvedVc<Box<dyn Source>>,
        asset_context: ResolvedVc<Box<dyn AssetContext>>,
        ty: Value<EcmascriptModuleAssetType>,
        transforms: ResolvedVc<EcmascriptInputTransforms>,
        options: ResolvedVc<EcmascriptOptions>,
        compile_time_info: ResolvedVc<CompileTimeInfo>,
        inner_assets: ResolvedVc<InnerAssets>,
    ) -> Vc<Self> {
        Self::cell(EcmascriptModuleAsset {
            source,
            asset_context,
            ty: ty.into_value(),
            transforms,
            options,
            compile_time_info,
            inner_assets: Some(inner_assets),
            last_successful_parse: Default::default(),
        })
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
        parse(*self.source, Value::new(self.ty), *self.transforms)
    }
}

impl EcmascriptModuleAsset {
    #[tracing::instrument(level = "trace", skip_all)]
    pub(crate) async fn determine_module_type(self: Vc<Self>) -> Result<ReadRef<ModuleTypeResult>> {
        let this = self.await?;

        match this.options.await?.specified_module_type {
            SpecifiedModuleType::EcmaScript => {
                return ModuleTypeResult::new(SpecifiedModuleType::EcmaScript).await
            }
            SpecifiedModuleType::CommonJs => {
                return ModuleTypeResult::new(SpecifiedModuleType::CommonJs).await
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
        if let Some(inner_assets) = self.inner_assets {
            let mut ident = self.source.ident().owned().await?;
            for (name, asset) in inner_assets.await?.iter() {
                ident.add_asset(
                    ResolvedVc::cell(name.to_string().into()),
                    asset.ident().to_resolved().await?,
                );
            }
            ident.add_modifier(modifier().to_resolved().await?);
            ident.layer = Some(self.asset_context.layer().to_resolved().await?);
            Ok(AssetIdent::new(Value::new(ident)))
        } else {
            Ok(self
                .source
                .ident()
                .with_modifier(modifier())
                .with_layer(self.asset_context.layer()))
        }
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        let analyze = self.analyze().await?;
        let references = analyze.references.await?.iter().copied().collect();
        Ok(Vc::cell(references))
    }

    #[turbo_tasks::function]
    async fn is_self_async(self: Vc<Self>) -> Result<Vc<bool>> {
        if let Some(async_module) = *self.get_async_module().await? {
            Ok(async_module.is_self_async(*self.analyze().await?.references))
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
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        *self.chunking_context
    }

    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<EcmascriptChunkItemContent> {
        panic!("content() should not be called");
    }

    #[turbo_tasks::function]
    async fn content_with_async_module_info(
        self: Vc<Self>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let this = self.await?;
        let _span = tracing::info_span!(
            "code generation",
            module = self.asset_ident().to_string().await?.to_string()
        )
        .entered();
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

        Ok(EcmascriptChunkItemContent::new(
            content,
            *this.chunking_context,
            this.module.options(),
            async_module_options,
        ))
    }
}

/// The transformed contents of an Ecmascript module.
#[turbo_tasks::value]
pub struct EcmascriptModuleContent {
    pub inner_code: Rope,
    pub source_map: Option<Rope>,
    pub is_esm: bool,
    // pub refresh: bool,
}

#[turbo_tasks::value_impl]
impl EcmascriptModuleContent {
    /// Creates a new [`Vc<EcmascriptModuleContent>`].
    #[turbo_tasks::function]
    pub async fn new(
        parsed: ResolvedVc<ParseResult>,
        ident: ResolvedVc<AssetIdent>,
        specified_module_type: SpecifiedModuleType,
        module_graph: Vc<ModuleGraph>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        references: Vc<ModuleReferences>,
        code_generation: Vc<CodeGens>,
        async_module: Vc<OptionAsyncModule>,
        generate_source_map: Vc<bool>,
        original_source_map: ResolvedVc<OptionStringifiedSourceMap>,
        exports: Vc<EcmascriptExports>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<Self>> {
        let mut code_gen_cells = Vec::new();
        for r in references.await?.iter() {
            if let Some(code_gen) = ResolvedVc::try_sidecast::<Box<dyn CodeGenerateable>>(*r) {
                code_gen_cells.push(code_gen.code_generation(module_graph, chunking_context));
            }
        }

        let additional_code_gens = [
            if let Some(async_module) = &*async_module.await? {
                Some(
                    async_module
                        .code_generation(
                            async_module_info,
                            references,
                            module_graph,
                            chunking_context,
                        )
                        .await?,
                )
            } else {
                None
            },
            if let EcmascriptExports::EsmExports(exports) = *exports.await? {
                Some(
                    exports
                        .code_generation(module_graph, chunking_context)
                        .await?,
                )
            } else {
                None
            },
        ];

        let code_gens = code_generation
            .await?
            .iter()
            .map(|c| c.code_generation(module_graph, chunking_context))
            .try_join()
            .await?;
        let code_gen_cells = code_gen_cells.into_iter().try_join().await?;

        let code_gens = code_gen_cells
            .iter()
            .map(|c| &**c)
            .chain(additional_code_gens.iter().flatten())
            .chain(code_gens.iter());
        gen_content_with_code_gens(
            parsed,
            ident,
            specified_module_type,
            code_gens,
            generate_source_map,
            original_source_map,
        )
        .await
    }

    /// Creates a new [`Vc<EcmascriptModuleContent>`] without an analysis pass.
    #[turbo_tasks::function]
    pub async fn new_without_analysis(
        parsed: Vc<ParseResult>,
        ident: Vc<AssetIdent>,
        specified_module_type: SpecifiedModuleType,
        generate_source_map: Vc<bool>,
    ) -> Result<Vc<Self>> {
        gen_content_with_code_gens(
            parsed.to_resolved().await?,
            ident.to_resolved().await?,
            specified_module_type,
            &[],
            generate_source_map,
            OptionStringifiedSourceMap::none().to_resolved().await?,
        )
        .await
    }
}

async fn gen_content_with_code_gens(
    parsed: ResolvedVc<ParseResult>,
    ident: ResolvedVc<AssetIdent>,
    specified_module_type: SpecifiedModuleType,
    code_gens: impl IntoIterator<Item = &CodeGeneration>,
    generate_source_map: Vc<bool>,
    original_source_map: ResolvedVc<OptionStringifiedSourceMap>,
) -> Result<Vc<EcmascriptModuleContent>> {
    let parsed = parsed.final_read_hint().await?;

    match &*parsed {
        ParseResult::Ok { .. } => {
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

            process_content_with_code_gens(
                &mut program,
                globals,
                Some(eval_context.top_level_mark),
                code_gens,
            );

            let mut bytes: Vec<u8> = vec![];
            // TODO: Insert this as a sourceless segment so that sourcemaps aren't affected.
            // = format!("/* {} */\n", self.module.path().to_string().await?).into_bytes();

            let mut mappings = vec![];

            let generate_source_map = *generate_source_map.await?;

            {
                let comments = match comments {
                    Either::Left(comments) => Either::Left(comments.into_consumable()),
                    Either::Right(ref comments) => Either::Right(comments.consumable()),
                };
                let comments: &dyn Comments = match &comments {
                    Either::Left(comments) => comments,
                    Either::Right(comments) => comments,
                };

                let mut emitter = Emitter {
                    cfg: swc_core::ecma::codegen::Config::default(),
                    cm: source_map.clone(),
                    comments: Some(&comments),
                    wr: JsWriter::new(
                        source_map.clone(),
                        "\n",
                        &mut bytes,
                        generate_source_map.then_some(&mut mappings),
                    ),
                };

                emitter.emit_program(&program)?;
            }

            let source_map = if generate_source_map {
                Some(
                    generate_js_source_map(source_map.clone(), mappings, original_source_map)
                        .await?,
                )
            } else {
                None
            };

            Ok(EcmascriptModuleContent {
                inner_code: bytes.into(),
                source_map,
                is_esm: eval_context.is_esm(specified_module_type),
            }
            .cell())
        }
        ParseResult::Unparseable { messages } => Ok(EcmascriptModuleContent {
            inner_code: format!(
                "const e = new Error(`Could not parse module \
                 '{path}'\n{error_messages}`);\ne.code = 'MODULE_UNPARSEABLE';\nthrow e;",
                path = ident.path().to_string().await?,
                error_messages = messages
                    .as_ref()
                    .and_then(|m| { m.first().map(|f| format!("\n{}", f)) })
                    .unwrap_or("".into())
            )
            .into(),
            source_map: None,
            is_esm: false,
        }
        .cell()),
        _ => Ok(EcmascriptModuleContent {
            inner_code: format!(
                "const e = new Error(\"Could not parse module '{path}'\");\ne.code = \
                 'MODULE_UNPARSEABLE';\nthrow e;",
                path = ident.path().to_string().await?
            )
            .into(),
            source_map: None,
            is_esm: false,
        }
        .cell()),
    }
}

fn process_content_with_code_gens<'a>(
    program: &mut Program,
    globals: &Globals,
    top_level_mark: Option<Mark>,
    code_gens: impl IntoIterator<Item = &'a CodeGeneration>,
) {
    let mut visitors = Vec::new();
    let mut root_visitors = Vec::new();
    let mut early_hoisted_stmts = FxIndexMap::default();
    let mut hoisted_stmts = FxIndexMap::default();
    for code_gen in code_gens {
        for CodeGenerationHoistedStmt { key, stmt } in &code_gen.hoisted_stmts {
            hoisted_stmts.entry(key.clone()).or_insert(stmt.clone());
        }
        for CodeGenerationHoistedStmt { key, stmt } in &code_gen.early_hoisted_stmts {
            early_hoisted_stmts.insert(key.clone(), stmt.clone());
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
        for visitor in root_visitors {
            program.visit_mut_with(&mut visitor.create());
        }
        program.visit_mut_with(
            &mut swc_core::ecma::transforms::base::hygiene::hygiene_with_config(
                swc_core::ecma::transforms::base::hygiene::Config {
                    top_level_mark: top_level_mark.unwrap_or_default(),
                    ..Default::default()
                },
            ),
        );
        program.visit_mut_with(&mut swc_core::ecma::transforms::base::fixer::fixer(None));

        // we need to remove any shebang before bundling as it's only valid as the first
        // line in a js file (not in a chunk item wrapped in the runtime)
        remove_shebang(program);
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

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
