#![feature(box_patterns)]
#![feature(min_specialization)]
#![feature(iter_intersperse)]
#![feature(int_roundings)]
#![feature(slice_group_by)]
#![feature(async_fn_in_trait)]
#![feature(arbitrary_self_types)]
#![recursion_limit = "256"]
#![allow(clippy::too_many_arguments)]

pub mod analyzer;
pub mod chunk;
pub mod chunk_group_files_asset;
pub mod code_gen;
mod errors;
pub mod magic_identifier;
pub(crate) mod manifest;
pub mod parse;
mod path_visitor;
pub mod references;
pub mod resolve;
pub(crate) mod special_cases;
pub(crate) mod static_code;
pub mod text;
pub(crate) mod transform;
pub mod tree_shake;
pub mod typescript;
pub mod utils;
pub mod webpack;

use anyhow::Result;
use chunk::{
    EcmascriptChunk, EcmascriptChunkItem, EcmascriptChunkPlaceables, EcmascriptChunkingContext,
};
use code_gen::CodeGenerateable;
pub use parse::ParseResultSourceMap;
use parse::{parse, ParseResult};
use path_visitor::ApplyVisitors;
pub use references::{AnalyzeEcmascriptModuleResult, TURBOPACK_HELPER};
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
use turbo_tasks::{trace::TraceRawVcs, RawVc, ReadRef, TryJoinIterExt, Value, ValueToString, Vc};
use turbo_tasks_fs::{rope::Rope, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::{
        availability_info::AvailabilityInfo, Chunk, ChunkItem, ChunkableModule, ChunkingContext,
        EvaluatableAsset,
    },
    compile_time_info::CompileTimeInfo,
    context::AssetContext,
    ident::AssetIdent,
    module::{Module, OptionModule},
    reference::ModuleReferences,
    reference_type::InnerAssets,
    resolve::{origin::ResolveOrigin, parse::Request, ModulePart},
    source::Source,
};

use self::{
    chunk::{EcmascriptChunkItemContent, EcmascriptExports},
    code_gen::{CodeGen, CodeGenerateableWithAvailabilityInfo, VisitorFactory},
    tree_shake::asset::EcmascriptModulePartAsset,
};
use crate::{
    chunk::EcmascriptChunkPlaceable,
    references::{analyze_ecmascript_module, async_module::OptionAsyncModule},
    transform::remove_shebang,
};

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(PartialOrd, Ord, Hash, Debug, Clone, Copy, Default)]
pub enum SpecifiedModuleType {
    #[default]
    Automatic,
    CommonJs,
    EcmaScript,
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(PartialOrd, Ord, Hash, Debug, Default, Copy, Clone)]
pub struct EcmascriptOptions {
    /// module is split into smaller module parts which can be selectively
    /// imported
    pub split_into_parts: bool,
    /// imports will import parts of modules
    pub import_parts: bool,
    /// module is forced to a specific type (happens e. g. for .cjs and .mjs)
    pub specified_module_type: SpecifiedModuleType,
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(PartialOrd, Ord, Hash, Debug, Copy, Clone)]
pub enum EcmascriptModuleAssetType {
    /// Module with EcmaScript code
    Ecmascript,
    /// Module with TypeScript code without types
    Typescript,
    /// Module with TypeScript code with references to imported types
    TypescriptWithTypes,
    /// Module with TypeScript declaration code
    TypescriptDeclaration,
}

#[turbo_tasks::function]
fn modifier() -> Vc<String> {
    Vc::cell("ecmascript".to_string())
}

#[derive(PartialEq, Eq, Clone, TraceRawVcs)]
struct MemoizedSuccessfulAnalysis {
    operation: RawVc,
    references: ReadRef<ModuleReferences>,
    exports: ReadRef<EcmascriptExports>,
    async_module: ReadRef<OptionAsyncModule>,
}

pub struct EcmascriptModuleAssetBuilder {
    source: Vc<Box<dyn Source>>,
    context: Vc<Box<dyn AssetContext>>,
    ty: EcmascriptModuleAssetType,
    transforms: Vc<EcmascriptInputTransforms>,
    options: EcmascriptOptions,
    compile_time_info: Vc<CompileTimeInfo>,
    inner_assets: Option<Vc<InnerAssets>>,
    part: Option<Vc<ModulePart>>,
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

    pub fn with_part(mut self, part: Vc<ModulePart>) -> Self {
        self.part = Some(part);
        self
    }

    pub fn build(self) -> Vc<Box<dyn Module>> {
        let base = if let Some(inner_assets) = self.inner_assets {
            EcmascriptModuleAsset::new_with_inner_assets(
                self.source,
                self.context,
                Value::new(self.ty),
                self.transforms,
                Value::new(self.options),
                self.compile_time_info,
                inner_assets,
            )
        } else {
            EcmascriptModuleAsset::new(
                self.source,
                self.context,
                Value::new(self.ty),
                self.transforms,
                Value::new(self.options),
                self.compile_time_info,
            )
        };
        if let Some(part) = self.part {
            Vc::upcast(EcmascriptModulePartAsset::new(base, part))
        } else {
            Vc::upcast(base)
        }
    }
}

#[turbo_tasks::value]
pub struct EcmascriptModuleAsset {
    pub source: Vc<Box<dyn Source>>,
    pub context: Vc<Box<dyn AssetContext>>,
    pub ty: EcmascriptModuleAssetType,
    pub transforms: Vc<EcmascriptInputTransforms>,
    pub options: EcmascriptOptions,
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
        context: Vc<Box<dyn AssetContext>>,
        transforms: Vc<EcmascriptInputTransforms>,
        options: EcmascriptOptions,
        compile_time_info: Vc<CompileTimeInfo>,
    ) -> EcmascriptModuleAssetBuilder {
        EcmascriptModuleAssetBuilder {
            source,
            context,
            ty: EcmascriptModuleAssetType::Ecmascript,
            transforms,
            options,
            compile_time_info,
            inner_assets: None,
            part: None,
        }
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptModuleAsset {
    #[turbo_tasks::function]
    pub fn new(
        source: Vc<Box<dyn Source>>,
        context: Vc<Box<dyn AssetContext>>,
        ty: Value<EcmascriptModuleAssetType>,
        transforms: Vc<EcmascriptInputTransforms>,
        options: Value<EcmascriptOptions>,
        compile_time_info: Vc<CompileTimeInfo>,
    ) -> Vc<Self> {
        Self::cell(EcmascriptModuleAsset {
            source,
            context,
            ty: ty.into_value(),
            transforms,
            options: options.into_value(),
            compile_time_info,
            inner_assets: None,
            last_successful_analysis: Default::default(),
        })
    }

    #[turbo_tasks::function]
    pub fn new_with_inner_assets(
        source: Vc<Box<dyn Source>>,
        context: Vc<Box<dyn AssetContext>>,
        ty: Value<EcmascriptModuleAssetType>,
        transforms: Vc<EcmascriptInputTransforms>,
        options: Value<EcmascriptOptions>,
        compile_time_info: Vc<CompileTimeInfo>,
        inner_assets: Vc<InnerAssets>,
    ) -> Vc<Self> {
        Self::cell(EcmascriptModuleAsset {
            source,
            context,
            ty: ty.into_value(),
            transforms,
            options: options.into_value(),
            compile_time_info,
            inner_assets: Some(inner_assets),
            last_successful_analysis: Default::default(),
        })
    }

    #[turbo_tasks::function]
    pub fn as_root_chunk_with_entries(
        self: Vc<Self>,
        context: Vc<Box<dyn EcmascriptChunkingContext>>,
        other_entries: Vc<EcmascriptChunkPlaceables>,
    ) -> Vc<Box<dyn Chunk>> {
        Vc::upcast(EcmascriptChunk::new_root_with_entries(
            context,
            Vc::upcast(self),
            other_entries,
        ))
    }

    #[turbo_tasks::function]
    pub fn analyze(self: Vc<Self>) -> Vc<AnalyzeEcmascriptModuleResult> {
        analyze_ecmascript_module(self, None)
    }

    #[turbo_tasks::function]
    pub async fn failsafe_analyze(self: Vc<Self>) -> Result<Vc<AnalyzeEcmascriptModuleResult>> {
        let this = self.await?;
        let result = self.analyze();
        let result_value = result.await?;
        if result_value.successful {
            this.last_successful_analysis
                .set(Some(MemoizedSuccessfulAnalysis {
                    operation: result.node,
                    // We need to store the ReadRefs since we want to keep a snapshot.
                    references: result_value.references.await?,
                    exports: result_value.exports.await?,
                    async_module: result_value.async_module.await?,
                }));
        } else if let Some(MemoizedSuccessfulAnalysis {
            operation,
            references,
            exports,
            async_module,
        }) = &*this.last_successful_analysis.get()
        {
            // It's important to connect to the last operation here to keep it active, so
            // it's potentially recomputed when garbage collected
            operation.connect();
            return Ok(AnalyzeEcmascriptModuleResult {
                references: ReadRef::cell(references.clone()),
                exports: ReadRef::cell(exports.clone()),
                code_generation: result_value.code_generation,
                async_module: ReadRef::cell(async_module.clone()),
                successful: false,
            }
            .cell());
        }

        Ok(ReadRef::cell(result_value))
    }

    #[turbo_tasks::function]
    pub async fn parse(self: Vc<Self>) -> Result<Vc<ParseResult>> {
        let this = self.await?;
        Ok(parse(this.source, Value::new(this.ty), this.transforms))
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
        ))
    }

    #[turbo_tasks::function]
    pub async fn module_content(
        self: Vc<Self>,
        chunking_context: Vc<Box<dyn EcmascriptChunkingContext>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<Vc<EcmascriptModuleContent>> {
        let this = self.await?;
        if *self.analyze().needs_availability_info().await? {
            availability_info
        } else {
            Value::new(AvailabilityInfo::Untracked)
        };

        let parsed = parse(this.source, Value::new(this.ty), this.transforms);

        Ok(EcmascriptModuleContent::new(
            parsed,
            self.ident(),
            chunking_context,
            self.analyze(),
            availability_info,
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
                ident.add_asset(Vc::cell(name.clone()), asset.ident());
            }
            ident.add_modifier(modifier());
            Ok(AssetIdent::new(Value::new(ident)))
        } else {
            Ok(self.source.ident().with_modifier(modifier()))
        }
    }

    #[turbo_tasks::function]
    async fn references(self: Vc<Self>) -> Result<Vc<ModuleReferences>> {
        Ok(self.failsafe_analyze().await?.references)
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
    fn as_chunk(
        self: Vc<Self>,
        context: Vc<Box<dyn ChunkingContext>>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Vc<Box<dyn Chunk>> {
        Vc::upcast(EcmascriptChunk::new(
            context,
            Vc::upcast(self),
            availability_info,
        ))
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for EcmascriptModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self: Vc<Self>,
        context: Vc<Box<dyn EcmascriptChunkingContext>>,
    ) -> Vc<Box<dyn EcmascriptChunkItem>> {
        Vc::upcast(ModuleChunkItem::cell(ModuleChunkItem {
            module: self,
            context,
        }))
    }

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
    fn context(&self) -> Vc<Box<dyn AssetContext>> {
        self.context
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
    context: Vc<Box<dyn EcmascriptChunkingContext>>,
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
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> Vc<Box<dyn EcmascriptChunkingContext>> {
        self.context
    }

    #[turbo_tasks::function]
    fn content(self: Vc<Self>) -> Vc<EcmascriptChunkItemContent> {
        self.content_with_availability_info(Value::new(AvailabilityInfo::Untracked))
    }

    #[turbo_tasks::function]
    async fn content_with_availability_info(
        self: Vc<Self>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<Vc<EcmascriptChunkItemContent>> {
        let this = self.await?;
        let content = this.module.module_content(this.context, availability_info);
        let async_module_options = this
            .module
            .get_async_module()
            .module_options(availability_info);

        Ok(EcmascriptChunkItemContent::new(
            content,
            this.context,
            async_module_options,
        ))
    }
}

/// The transformed contents of an Ecmascript module.
#[turbo_tasks::value]
pub struct EcmascriptModuleContent {
    pub inner_code: Rope,
    pub source_map: Option<Vc<ParseResultSourceMap>>,
    pub is_esm: bool,
}

#[turbo_tasks::value_impl]
impl EcmascriptModuleContent {
    /// Creates a new [`Vc<EcmascriptModuleContent>`].
    #[turbo_tasks::function]
    pub async fn new(
        parsed: Vc<ParseResult>,
        ident: Vc<AssetIdent>,
        context: Vc<Box<dyn EcmascriptChunkingContext>>,
        analyzed: Vc<AnalyzeEcmascriptModuleResult>,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<Vc<Self>> {
        let AnalyzeEcmascriptModuleResult {
            references,
            code_generation,
            ..
        } = &*analyzed.await?;

        let mut code_gens = Vec::new();
        for r in references.await?.iter() {
            let r = r.resolve().await?;
            if let Some(code_gen) =
                Vc::try_resolve_sidecast::<Box<dyn CodeGenerateableWithAvailabilityInfo>>(r).await?
            {
                code_gens.push(code_gen.code_generation(context, availability_info));
            } else if let Some(code_gen) =
                Vc::try_resolve_sidecast::<Box<dyn CodeGenerateable>>(r).await?
            {
                code_gens.push(code_gen.code_generation(context));
            }
        }
        for c in code_generation.await?.iter() {
            match c {
                CodeGen::CodeGenerateable(c) => {
                    code_gens.push(c.code_generation(context));
                }
                CodeGen::CodeGenerateableWithAvailabilityInfo(c) => {
                    code_gens.push(c.code_generation(context, availability_info));
                }
            }
        }
        // need to keep that around to allow references into that
        let code_gens = code_gens.into_iter().try_join().await?;
        let code_gens = code_gens.iter().map(|cg| &**cg).collect::<Vec<_>>();
        // TOOD use interval tree with references into "code_gens"
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

        gen_content_with_visitors(parsed, ident, visitors, root_visitors).await
    }

    /// Creates a new [`Vc<EcmascriptModuleContent>`] without an analysis pass.
    #[turbo_tasks::function]
    pub async fn new_without_analysis(
        parsed: Vc<ParseResult>,
        ident: Vc<AssetIdent>,
    ) -> Result<Vc<Self>> {
        gen_content_with_visitors(parsed, ident, Vec::new(), Vec::new()).await
    }
}

async fn gen_content_with_visitors(
    parsed: Vc<ParseResult>,
    ident: Vc<AssetIdent>,
    visitors: Vec<(
        &Vec<swc_core::ecma::visit::AstParentKind>,
        &dyn VisitorFactory,
    )>,
    root_visitors: Vec<&dyn VisitorFactory>,
) -> Result<Vc<EcmascriptModuleContent>> {
    let parsed = parsed.await?;

    if let ParseResult::Ok {
        program,
        source_map,
        globals,
        eval_context,
        ..
    } = &*parsed
    {
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

        let mut srcmap = vec![];

        let mut emitter = Emitter {
            cfg: swc_core::ecma::codegen::Config {
                ..Default::default()
            },
            cm: source_map.clone(),
            comments: None,
            wr: JsWriter::new(source_map.clone(), "\n", &mut bytes, Some(&mut srcmap)),
        };

        emitter.emit_program(&program)?;

        let srcmap = ParseResultSourceMap::new(source_map.clone(), srcmap).cell();

        Ok(EcmascriptModuleContent {
            inner_code: bytes.into(),
            source_map: Some(srcmap),
            is_esm: eval_context.is_esm(),
        }
        .cell())
    } else {
        Ok(EcmascriptModuleContent {
            inner_code: format!(
                "const e = new Error(\"Could not parse module '{path}'\");\ne.code = \
                 'MODULE_UNPARSEABLE';\nthrow e;",
                path = ident.path().to_string().await?
            )
            .into(),
            source_map: None,
            is_esm: false,
        }
        .cell())
    }
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
