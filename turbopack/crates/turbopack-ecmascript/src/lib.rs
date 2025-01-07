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
pub mod global_module_id_strategy;
pub mod magic_identifier;
pub mod manifest;
pub mod minify;
pub mod parse;
mod path_visitor;
pub mod references;
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

use std::fmt::{Display, Formatter};

use anyhow::Result;
use chunk::EcmascriptChunkItem;
use code_gen::{CodeGenerateable, CodeGeneration, CodeGenerationHoistedStmt};
pub use parse::ParseResultSourceMap;
use parse::{parse, ParseResult};
use path_visitor::ApplyVisitors;
use references::esm::UrlRewriteBehavior;
pub use references::{AnalyzeEcmascriptModuleResult, TURBOPACK_HELPER};
use serde::{Deserialize, Serialize};
pub use static_code::StaticEcmascriptCode;
use swc_core::{
    common::{Globals, Mark, GLOBALS},
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
    reference::ModuleReferences,
    reference_type::InnerAssets,
    resolve::{
        find_context_file, origin::ResolveOrigin, package_json, parse::Request,
        FindContextFileResult,
    },
    source::Source,
    source_map::{GenerateSourceMap, OptionSourceMap},
};
// TODO remove this
pub use turbopack_resolve::ecmascript as resolve;

use self::{
    chunk::{EcmascriptChunkItemContent, EcmascriptChunkType, EcmascriptExports},
    code_gen::{CodeGen, CodeGenerateableWithAsyncModuleInfo, CodeGenerateables},
};
use crate::{
    chunk::EcmascriptChunkPlaceable,
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

#[turbo_tasks::value(local)]
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

#[turbo_tasks::value_trait(local)]
pub trait EcmascriptParsable {
    fn failsafe_parse(self: Vc<Self>) -> Result<Vc<ParseResult>>;

    fn parse_original(self: Vc<Self>) -> Result<Vc<ParseResult>>;

    fn ty(self: Vc<Self>) -> Result<Vc<EcmascriptModuleAssetType>>;
}

#[turbo_tasks::value_trait(local)]
pub trait EcmascriptAnalyzable {
    fn analyze(self: Vc<Self>) -> Vc<AnalyzeEcmascriptModuleResult>;

    /// Generates module contents without an analysis pass. This is useful for
    /// transforming code that is not a module, e.g. runtime code.
    async fn module_content_without_analysis(self: Vc<Self>)
        -> Result<Vc<EcmascriptModuleContent>>;

    async fn module_content(
        self: Vc<Self>,
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
        let real_result_value = real_result.await?;
        let this = self.await?;
        let result_value = if matches!(*real_result_value, ParseResult::Ok { .. }) {
            this.last_successful_parse.set(real_result_value.clone());
            real_result_value
        } else {
            let state_ref = this.last_successful_parse.get();
            state_ref.as_ref().unwrap_or(&real_result_value).clone()
        };
        Ok(ReadRef::cell(result_value))
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
    ) -> Result<Vc<EcmascriptModuleContent>> {
        let this = self.await?;

        let parsed = self.parse();

        Ok(EcmascriptModuleContent::new_without_analysis(
            parsed,
            self.ident(),
            this.options.await?.specified_module_type,
        ))
    }

    #[turbo_tasks::function]
    async fn module_content(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<EcmascriptModuleContent>> {
        let parsed = self.parse().to_resolved().await?;

        let analyze = self.analyze().await?;

        let module_type_result = *self.determine_module_type().await?;

        Ok(EcmascriptModuleContent::new(
            *parsed,
            self.ident(),
            module_type_result.module_type,
            chunking_context,
            *analyze.references,
            *analyze.code_generation,
            *analyze.async_module,
            *analyze.source_map,
            *analyze.exports,
            async_module_info,
        ))
    }
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

    #[turbo_tasks::function]
    pub(crate) async fn determine_module_type(self: Vc<Self>) -> Result<Vc<ModuleTypeResult>> {
        let this = self.await?;

        match this.options.await?.specified_module_type {
            SpecifiedModuleType::EcmaScript => {
                return Ok(ModuleTypeResult::new(SpecifiedModuleType::EcmaScript))
            }
            SpecifiedModuleType::CommonJs => {
                return Ok(ModuleTypeResult::new(SpecifiedModuleType::CommonJs))
            }
            SpecifiedModuleType::Automatic => {}
        }

        let find_package_json = find_context_file(
            self.origin_path()
                .resolve()
                .await?
                .parent()
                .resolve()
                .await?,
            package_json().resolve().await?,
        )
        .await?;
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
}

#[turbo_tasks::value_impl]
impl Module for EcmascriptModuleAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        if let Some(inner_assets) = self.inner_assets {
            let mut ident = self.source.ident().await?.clone_value();
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

    #[turbo_tasks::function]
    async fn is_self_async(&self) -> Result<Vc<bool>> {
        if let Some(async_module) = *self.module.get_async_module().await? {
            Ok(async_module.is_self_async(*self.module.analyze().await?.references))
        } else {
            Ok(Vc::cell(false))
        }
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
        let content = this
            .module
            .module_content(*this.chunking_context, async_module_info);

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
    pub source_map: Option<ResolvedVc<Box<dyn GenerateSourceMap>>>,
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
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        references: Vc<ModuleReferences>,
        code_generation: Vc<CodeGenerateables>,
        async_module: Vc<OptionAsyncModule>,
        source_map: ResolvedVc<OptionSourceMap>,
        exports: Vc<EcmascriptExports>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<Self>> {
        let mut code_gens = Vec::new();
        for r in references.await?.iter() {
            let r = r.resolve().await?;
            if let Some(code_gen) =
                ResolvedVc::try_sidecast::<Box<dyn CodeGenerateableWithAsyncModuleInfo>>(r).await?
            {
                code_gens.push(code_gen.code_generation(chunking_context, async_module_info));
            } else if let Some(code_gen) =
                ResolvedVc::try_sidecast::<Box<dyn CodeGenerateable>>(r).await?
            {
                code_gens.push(code_gen.code_generation(chunking_context));
            }
        }
        if let Some(async_module) = *async_module.await? {
            code_gens.push(async_module.code_generation(
                chunking_context,
                async_module_info,
                references,
            ));
        }
        for c in code_generation.await?.iter() {
            match c {
                CodeGen::CodeGenerateable(c) => {
                    code_gens.push(c.code_generation(chunking_context));
                }
                CodeGen::CodeGenerateableWithAsyncModuleInfo(c) => {
                    code_gens.push(c.code_generation(chunking_context, async_module_info));
                }
            }
        }
        if let EcmascriptExports::EsmExports(exports) = *exports.await? {
            code_gens.push(exports.code_generation(chunking_context));
        }

        // need to keep that around to allow references into that
        let code_gens = code_gens.into_iter().try_join().await?;
        let code_gens = code_gens.iter().map(|cg| &**cg).collect::<Vec<_>>();

        gen_content_with_code_gens(parsed, ident, specified_module_type, &code_gens, source_map)
            .await
    }

    /// Creates a new [`Vc<EcmascriptModuleContent>`] without an analysis pass.
    #[turbo_tasks::function]
    pub async fn new_without_analysis(
        parsed: Vc<ParseResult>,
        ident: Vc<AssetIdent>,
        specified_module_type: SpecifiedModuleType,
    ) -> Result<Vc<Self>> {
        gen_content_with_code_gens(
            parsed.to_resolved().await?,
            ident.to_resolved().await?,
            specified_module_type,
            &[],
            OptionSourceMap::none().to_resolved().await?,
        )
        .await
    }
}

async fn gen_content_with_code_gens(
    parsed: ResolvedVc<ParseResult>,
    ident: ResolvedVc<AssetIdent>,
    specified_module_type: SpecifiedModuleType,
    code_gens: &[&CodeGeneration],
    original_src_map: ResolvedVc<OptionSourceMap>,
) -> Result<Vc<EcmascriptModuleContent>> {
    let parsed = parsed.await?;

    match &*parsed {
        ParseResult::Ok {
            program,
            source_map,
            globals,
            eval_context,
            comments,
            ..
        } => {
            let mut program = program.clone();

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

            let comments = comments.consumable();

            let mut emitter = Emitter {
                cfg: swc_core::ecma::codegen::Config::default(),
                cm: source_map.clone(),
                comments: Some(&comments),
                wr: JsWriter::new(source_map.clone(), "\n", &mut bytes, Some(&mut mappings)),
            };

            emitter.emit_program(&program)?;

            let srcmap = ParseResultSourceMap::new(source_map.clone(), mappings, original_src_map)
                .resolved_cell();

            Ok(EcmascriptModuleContent {
                inner_code: bytes.into(),
                source_map: Some(ResolvedVc::upcast(srcmap)),
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

fn process_content_with_code_gens(
    program: &mut Program,
    globals: &Globals,
    top_level_mark: Option<Mark>,
    code_gens: &[&CodeGeneration],
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
