// Needed for swc visit_ macros
#![allow(non_local_definitions)]
#![feature(box_patterns)]
#![feature(min_specialization)]
#![feature(iter_intersperse)]
#![feature(int_roundings)]
#![feature(arbitrary_self_types)]
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

use std::fmt::{Display, Formatter};

use anyhow::Result;
use chunk::EcmascriptChunkItem;
use code_gen::CodeGenerateable;
pub use parse::ParseResultSourceMap;
use parse::{parse, ParseResult};
use path_visitor::ApplyVisitors;
use references::esm::UrlRewriteBehavior;
pub use references::{AnalyzeEcmascriptModuleResult, TURBOPACK_HELPER};
use serde::{Deserialize, Serialize};
pub use static_code::StaticEcmascriptCode;
use swc_core::{
    common::GLOBALS,
    ecma::{
        codegen::{text_writer::JsWriter, Emitter},
        visit::{VisitMutWith, VisitMutWithPath},
    },
};
pub use transform::{
    CustomTransformer, EcmascriptInputTransform, EcmascriptInputTransforms, OptionTransformPlugin,
    TransformContext, TransformPlugin, UnsupportedServerActionIssue,
};
use turbo_tasks::{
    trace::TraceRawVcs, RcStr, ReadRef, TaskInput, TryJoinIterExt, Value, ValueToString, Vc,
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
        FindContextFileResult, ModulePart,
    },
    source::Source,
    source_map::{GenerateSourceMap, OptionSourceMap, SourceMap},
};
// TODO remove this
pub use turbopack_resolve::ecmascript as resolve;

use self::{
    chunk::{EcmascriptChunkItemContent, EcmascriptChunkType, EcmascriptExports},
    code_gen::{CodeGen, CodeGenerateableWithAsyncModuleInfo, CodeGenerateables, VisitorFactory},
    tree_shake::asset::EcmascriptModulePartAsset,
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

    /// The list of export names that should make tree shaking bail off. This is
    /// required because tree shaking can split imports like `export const
    /// runtime = 'edge'` as a separate module.
    pub special_exports: Vc<Vec<RcStr>>,
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

#[derive(PartialEq, Eq, Clone, TraceRawVcs)]
struct MemoizedSuccessfulAnalysis {
    operation: Vc<AnalyzeEcmascriptModuleResult>,
    references: ReadRef<ModuleReferences>,
    local_references: ReadRef<ModuleReferences>,
    reexport_references: ReadRef<ModuleReferences>,
    evaluation_references: ReadRef<ModuleReferences>,
    exports: ReadRef<EcmascriptExports>,
    async_module: ReadRef<OptionAsyncModule>,
    source_map: Option<ReadRef<SourceMap>>,
}

#[derive(Clone)]
pub struct EcmascriptModuleAssetBuilder {
    source: Vc<Box<dyn Source>>,
    asset_context: Vc<Box<dyn AssetContext>>,
    ty: EcmascriptModuleAssetType,
    transforms: Vc<EcmascriptInputTransforms>,
    options: Vc<EcmascriptOptions>,
    compile_time_info: Vc<CompileTimeInfo>,
    inner_assets: Option<Vc<InnerAssets>>,
}

impl EcmascriptModuleAssetBuilder {
    pub fn with_inner_assets(mut self, inner_assets: Vc<InnerAssets>) -> Self {
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
                self.source,
                self.asset_context,
                Value::new(self.ty),
                self.transforms,
                self.options,
                self.compile_time_info,
                inner_assets,
            )
        } else {
            EcmascriptModuleAsset::new(
                self.source,
                self.asset_context,
                Value::new(self.ty),
                self.transforms,
                self.options,
                self.compile_time_info,
            )
        }
    }

    pub async fn build_part(self, part: Vc<ModulePart>) -> Result<Vc<EcmascriptModulePartAsset>> {
        let import_externals = self.options.await?.import_externals;
        let base = self.build();
        Ok(EcmascriptModulePartAsset::new(base, part, import_externals))
    }
}

#[turbo_tasks::value]
pub struct EcmascriptModuleAsset {
    pub source: Vc<Box<dyn Source>>,
    pub asset_context: Vc<Box<dyn AssetContext>>,
    pub ty: EcmascriptModuleAssetType,
    pub transforms: Vc<EcmascriptInputTransforms>,
    pub options: Vc<EcmascriptOptions>,
    pub compile_time_info: Vc<CompileTimeInfo>,
    pub inner_assets: Option<Vc<InnerAssets>>,
    #[turbo_tasks(debug_ignore)]
    #[serde(skip)]
    last_successful_analysis: turbo_tasks::State<Option<MemoizedSuccessfulAnalysis>>,
}

/// An optional [EcmascriptModuleAsset]
#[turbo_tasks::value(transparent)]
pub struct OptionEcmascriptModuleAsset(Option<Vc<EcmascriptModuleAsset>>);

/// A list of [EcmascriptModuleAsset]s
#[turbo_tasks::value(transparent)]
pub struct EcmascriptModuleAssets(Vec<Vc<EcmascriptModuleAsset>>);

impl EcmascriptModuleAsset {
    pub fn builder(
        source: Vc<Box<dyn Source>>,
        asset_context: Vc<Box<dyn AssetContext>>,
        transforms: Vc<EcmascriptInputTransforms>,
        options: Vc<EcmascriptOptions>,
        compile_time_info: Vc<CompileTimeInfo>,
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
    pub referenced_package_json: Option<Vc<FileSystemPath>>,
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
        package_json: Vc<FileSystemPath>,
    ) -> Vc<Self> {
        Self::cell(ModuleTypeResult {
            module_type,
            referenced_package_json: Some(package_json),
        })
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptModuleAsset {
    #[turbo_tasks::function]
    pub fn new(
        source: Vc<Box<dyn Source>>,
        asset_context: Vc<Box<dyn AssetContext>>,
        ty: Value<EcmascriptModuleAssetType>,
        transforms: Vc<EcmascriptInputTransforms>,
        options: Vc<EcmascriptOptions>,
        compile_time_info: Vc<CompileTimeInfo>,
    ) -> Vc<Self> {
        Self::cell(EcmascriptModuleAsset {
            source,
            asset_context,
            ty: ty.into_value(),
            transforms,
            options,
            compile_time_info,
            inner_assets: None,
            last_successful_analysis: Default::default(),
        })
    }

    #[turbo_tasks::function]
    pub fn new_with_inner_assets(
        source: Vc<Box<dyn Source>>,
        asset_context: Vc<Box<dyn AssetContext>>,
        ty: Value<EcmascriptModuleAssetType>,
        transforms: Vc<EcmascriptInputTransforms>,
        options: Vc<EcmascriptOptions>,
        compile_time_info: Vc<CompileTimeInfo>,
        inner_assets: Vc<InnerAssets>,
    ) -> Vc<Self> {
        Self::cell(EcmascriptModuleAsset {
            source,
            asset_context,
            ty: ty.into_value(),
            transforms,
            options,
            compile_time_info,
            inner_assets: Some(inner_assets),
            last_successful_analysis: Default::default(),
        })
    }

    #[turbo_tasks::function]
    pub async fn source(self: Vc<Self>) -> Result<Vc<Box<dyn Source>>> {
        Ok(self.await?.source)
    }

    #[turbo_tasks::function]
    pub fn analyze(self: Vc<Self>) -> Vc<AnalyzeEcmascriptModuleResult> {
        analyse_ecmascript_module(self, None)
    }

    #[turbo_tasks::function]
    pub async fn options(self: Vc<Self>) -> Result<Vc<EcmascriptOptions>> {
        Ok(self.await?.options)
    }

    #[turbo_tasks::function]
    pub async fn failsafe_analyze(self: Vc<Self>) -> Result<Vc<AnalyzeEcmascriptModuleResult>> {
        let this = self.await?;

        let result = self.analyze();
        let result_value = result.await?;

        let successful = result_value.successful;
        let current_memo = MemoizedSuccessfulAnalysis {
            operation: result,
            // We need to store the ReadRefs since we want to keep a snapshot.
            references: result_value.references.await?,
            local_references: result_value.local_references.await?,
            reexport_references: result_value.reexport_references.await?,
            evaluation_references: result_value.evaluation_references.await?,
            exports: result_value.exports.await?,
            async_module: result_value.async_module.await?,
            source_map: if let Some(map) = *result_value.source_map.await? {
                Some(map.await?)
            } else {
                None
            },
        };
        let state_ref;
        let best_value = if successful {
            &current_memo
        } else {
            state_ref = this.last_successful_analysis.get();
            state_ref.as_ref().unwrap_or(&current_memo)
        };
        let MemoizedSuccessfulAnalysis {
            operation,
            references,
            local_references,
            reexport_references,
            evaluation_references,
            exports,
            async_module,
            source_map,
        } = best_value;
        // It's important to connect to the last operation here to keep it active, so
        // it's potentially recomputed when garbage collected
        Vc::connect(*operation);
        let result = AnalyzeEcmascriptModuleResult {
            references: ReadRef::cell(references.clone()),
            local_references: ReadRef::cell(local_references.clone()),
            reexport_references: ReadRef::cell(reexport_references.clone()),
            evaluation_references: ReadRef::cell(evaluation_references.clone()),
            exports: ReadRef::cell(exports.clone()),
            code_generation: result_value.code_generation,
            async_module: ReadRef::cell(async_module.clone()),
            source_map: Vc::cell(source_map.clone().map(ReadRef::cell)),
            successful,
        }
        .cell();
        if successful {
            this.last_successful_analysis.set(Some(current_memo));
        }
        Ok(result)
    }

    #[turbo_tasks::function]
    pub fn parse(&self) -> Vc<ParseResult> {
        parse(self.source, Value::new(self.ty), self.transforms)
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
                    package_json,
                ));
            }
        }

        Ok(ModuleTypeResult::new_with_package_json(
            SpecifiedModuleType::Automatic,
            package_json,
        ))
    }

    /// Generates module contents without an analysis pass. This is useful for
    /// transforming code that is not a module, e.g. runtime code.
    #[turbo_tasks::function]
    pub async fn module_content_without_analysis(
        self: Vc<Self>,
    ) -> Result<Vc<EcmascriptModuleContent>> {
        let this = self.await?;

        let parsed = parse(this.source, Value::new(this.ty), this.transforms);

        Ok(EcmascriptModuleContent::new_without_analysis(
            parsed,
            self.ident(),
            this.options.await?.specified_module_type,
        ))
    }

    #[turbo_tasks::function]
    pub async fn module_content(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<EcmascriptModuleContent>> {
        let this = self.await?;

        let parsed = parse(this.source, Value::new(this.ty), this.transforms)
            .resolve()
            .await?;

        let analyze = self.analyze().await?;

        let module_type_result = *self.determine_module_type().await?;

        Ok(EcmascriptModuleContent::new(
            parsed,
            self.ident(),
            module_type_result.module_type,
            chunking_context,
            analyze.references,
            analyze.code_generation,
            analyze.async_module,
            analyze.source_map,
            analyze.exports,
            async_module_info,
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
                ident.add_asset(Vc::cell(name.to_string().into()), asset.ident());
            }
            ident.add_modifier(modifier());
            ident.layer = Some(self.asset_context.layer());
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
        let analyze = self.failsafe_analyze().await?;
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
    async fn as_chunk_item(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<Vc<Box<dyn ChunkItem>>> {
        Ok(Vc::upcast(ModuleChunkItem::cell(ModuleChunkItem {
            module: self,
            chunking_context,
        })))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for EcmascriptModuleAsset {
    #[turbo_tasks::function]
    async fn get_exports(self: Vc<Self>) -> Result<Vc<EcmascriptExports>> {
        Ok(self.failsafe_analyze().await?.exports)
    }

    #[turbo_tasks::function]
    async fn get_async_module(self: Vc<Self>) -> Result<Vc<OptionAsyncModule>> {
        Ok(self.failsafe_analyze().await?.async_module)
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
        self.asset_context
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
    module: Vc<EcmascriptModuleAsset>,
    chunking_context: Vc<Box<dyn ChunkingContext>>,
}

#[turbo_tasks::value_impl]
impl ChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> Vc<AssetIdent> {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn references(&self) -> Vc<ModuleReferences> {
        self.module.references()
    }

    #[turbo_tasks::function]
    async fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        Vc::upcast(self.chunking_context)
    }

    #[turbo_tasks::function]
    async fn ty(&self) -> Result<Vc<Box<dyn ChunkType>>> {
        Ok(Vc::upcast(
            Vc::<EcmascriptChunkType>::default().resolve().await?,
        ))
    }

    #[turbo_tasks::function]
    fn module(&self) -> Vc<Box<dyn Module>> {
        Vc::upcast(self.module)
    }

    #[turbo_tasks::function]
    async fn is_self_async(&self) -> Result<Vc<bool>> {
        if let Some(async_module) = *self.module.get_async_module().await? {
            Ok(async_module.is_self_async(self.module.failsafe_analyze().await?.references))
        } else {
            Ok(Vc::cell(false))
        }
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn ChunkingContext>> {
        self.chunking_context
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
            .module_content(this.chunking_context, async_module_info);

        Ok(EcmascriptChunkItemContent::new(
            content,
            this.chunking_context,
            this.module.options(),
            async_module_options,
        ))
    }
}

/// The transformed contents of an Ecmascript module.
#[turbo_tasks::value]
pub struct EcmascriptModuleContent {
    pub inner_code: Rope,
    pub source_map: Option<Vc<Box<dyn GenerateSourceMap>>>,
    pub is_esm: bool,
    // pub refresh: bool,
}

#[turbo_tasks::value_impl]
impl EcmascriptModuleContent {
    /// Creates a new [`Vc<EcmascriptModuleContent>`].
    #[turbo_tasks::function]
    pub async fn new(
        parsed: Vc<ParseResult>,
        ident: Vc<AssetIdent>,
        specified_module_type: SpecifiedModuleType,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
        references: Vc<ModuleReferences>,
        code_generation: Vc<CodeGenerateables>,
        async_module: Vc<OptionAsyncModule>,
        source_map: Vc<OptionSourceMap>,
        exports: Vc<EcmascriptExports>,
        async_module_info: Option<Vc<AsyncModuleInfo>>,
    ) -> Result<Vc<Self>> {
        let mut code_gens = Vec::new();
        for r in references.await?.iter() {
            let r = r.resolve().await?;
            if let Some(code_gen) =
                Vc::try_resolve_sidecast::<Box<dyn CodeGenerateableWithAsyncModuleInfo>>(r).await?
            {
                code_gens.push(code_gen.code_generation(chunking_context, async_module_info));
            } else if let Some(code_gen) =
                Vc::try_resolve_sidecast::<Box<dyn CodeGenerateable>>(r).await?
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
        let mut visitors = Vec::new();
        let mut root_visitors = Vec::new();
        for code_gen in code_gens {
            for (path, visitor) in code_gen.visitors.iter() {
                if path.is_empty() {
                    root_visitors.push(&**visitor);
                } else {
                    visitors.push((path, &**visitor));
                }
            }
        }

        gen_content_with_visitors(
            parsed,
            ident,
            specified_module_type,
            visitors,
            root_visitors,
            source_map,
        )
        .await
    }

    /// Creates a new [`Vc<EcmascriptModuleContent>`] without an analysis pass.
    #[turbo_tasks::function]
    pub async fn new_without_analysis(
        parsed: Vc<ParseResult>,
        ident: Vc<AssetIdent>,
        specified_module_type: SpecifiedModuleType,
    ) -> Result<Vc<Self>> {
        gen_content_with_visitors(
            parsed,
            ident,
            specified_module_type,
            Vec::new(),
            Vec::new(),
            OptionSourceMap::none(),
        )
        .await
    }
}

async fn gen_content_with_visitors(
    parsed: Vc<ParseResult>,
    ident: Vc<AssetIdent>,
    specified_module_type: SpecifiedModuleType,
    visitors: Vec<(
        &Vec<swc_core::ecma::visit::AstParentKind>,
        &dyn VisitorFactory,
    )>,
    root_visitors: Vec<&dyn VisitorFactory>,
    original_src_map: Vc<OptionSourceMap>,
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

            GLOBALS.set(globals, || {
                if !visitors.is_empty() {
                    program.visit_mut_with_path(
                        &mut ApplyVisitors::new(visitors),
                        &mut Default::default(),
                    );
                }
                for visitor in root_visitors {
                    program.visit_mut_with(&mut visitor.create());
                }
                program.visit_mut_with(&mut swc_core::ecma::transforms::base::hygiene::hygiene());
                program.visit_mut_with(&mut swc_core::ecma::transforms::base::fixer::fixer(None));

                // we need to remove any shebang before bundling as it's only valid as the first
                // line in a js file (not in a chunk item wrapped in the runtime)
                remove_shebang(&mut program);
            });

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

            let srcmap =
                ParseResultSourceMap::new(source_map.clone(), mappings, original_src_map).cell();

            Ok(EcmascriptModuleContent {
                inner_code: bytes.into(),
                source_map: Some(Vc::upcast(srcmap)),
                is_esm: eval_context.is_esm()
                    || specified_module_type == SpecifiedModuleType::EcmaScript,
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

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
