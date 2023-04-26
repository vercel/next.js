#![feature(box_syntax)]
#![feature(box_patterns)]
#![feature(min_specialization)]
#![feature(iter_intersperse)]
#![feature(int_roundings)]
#![feature(slice_group_by)]
#![recursion_limit = "256"]

pub mod analyzer;
pub mod chunk;
pub mod chunk_group_files_asset;
pub mod code_gen;
mod errors;
pub mod magic_identifier;
pub mod parse;
mod path_visitor;
pub(crate) mod references;
pub mod resolve;
pub(crate) mod special_cases;
pub mod text;
pub(crate) mod transform;
pub mod tree_shake;
pub mod typescript;
pub mod utils;
pub mod webpack;

use anyhow::Result;
use chunk::{
    EcmascriptChunkItem, EcmascriptChunkItemVc, EcmascriptChunkPlaceablesVc, EcmascriptChunkVc,
    EcmascriptChunkingContextVc,
};
use code_gen::CodeGenerateableVc;
use indexmap::IndexMap;
use parse::{parse, ParseResult};
pub use parse::{ParseResultSourceMap, ParseResultSourceMapVc};
use path_visitor::ApplyVisitors;
use references::AnalyzeEcmascriptModuleResult;
use swc_core::{
    common::GLOBALS,
    ecma::{
        codegen::{text_writer::JsWriter, Emitter},
        visit::{VisitMutWith, VisitMutWithPath},
    },
};
pub use transform::{
    CustomTransformer, EcmascriptInputTransform, EcmascriptInputTransformsVc, TransformContext,
    TransformPlugin, TransformPluginVc,
};
use turbo_tasks::{
    primitives::StringVc, trace::TraceRawVcs, RawVc, ReadRef, TryJoinIterExt, Value, ValueToString,
};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetOptionVc, AssetVc},
    chunk::{
        availability_info::AvailabilityInfo, ChunkItem, ChunkItemVc, ChunkVc, ChunkableAsset,
        ChunkableAssetVc, ChunkingContextVc, EvaluatableAsset, EvaluatableAssetVc,
    },
    compile_time_info::CompileTimeInfoVc,
    context::AssetContextVc,
    ident::AssetIdentVc,
    reference::{AssetReferencesReadRef, AssetReferencesVc},
    resolve::{
        origin::{ResolveOrigin, ResolveOriginVc},
        parse::RequestVc,
    },
};

pub use self::references::AnalyzeEcmascriptModuleResultVc;
use self::{
    chunk::{
        placeable::EcmascriptExportsReadRef, EcmascriptChunkItemContent,
        EcmascriptChunkItemContentVc, EcmascriptChunkItemOptions, EcmascriptExportsVc,
    },
    code_gen::{
        CodeGen, CodeGenerateableWithAvailabilityInfo, CodeGenerateableWithAvailabilityInfoVc,
    },
    parse::ParseResultVc,
};
use crate::{
    chunk::{EcmascriptChunkPlaceable, EcmascriptChunkPlaceableVc},
    code_gen::CodeGenerateable,
    references::analyze_ecmascript_module,
    transform::remove_shebang,
};

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(PartialOrd, Ord, Hash, Debug, Default, Copy, Clone)]
pub struct EcmascriptOptions {
    /// module is split into smaller module parts which can be selectively
    /// imported
    pub split_into_parts: bool,
    /// imports will import parts of modules
    pub import_parts: bool,
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

#[turbo_tasks::value(transparent)]
pub struct InnerAssets(IndexMap<String, AssetVc>);

#[turbo_tasks::function]
fn modifier() -> StringVc {
    StringVc::cell("ecmascript".to_string())
}

#[derive(PartialEq, Eq, Clone, TraceRawVcs)]
struct MemoizedSuccessfulAnalysis {
    operation: RawVc,
    references: AssetReferencesReadRef,
    exports: EcmascriptExportsReadRef,
}

#[turbo_tasks::value]
pub struct EcmascriptModuleAsset {
    pub source: AssetVc,
    pub context: AssetContextVc,
    pub ty: EcmascriptModuleAssetType,
    pub transforms: EcmascriptInputTransformsVc,
    pub options: EcmascriptOptions,
    pub compile_time_info: CompileTimeInfoVc,
    pub inner_assets: Option<InnerAssetsVc>,
    #[turbo_tasks(debug_ignore)]
    #[serde(skip)]
    last_successful_analysis: turbo_tasks::State<Option<MemoizedSuccessfulAnalysis>>,
}

/// An optional [EcmascriptModuleAsset]
#[turbo_tasks::value(transparent)]
pub struct OptionEcmascriptModuleAsset(Option<EcmascriptModuleAssetVc>);

#[turbo_tasks::value_impl]
impl EcmascriptModuleAssetVc {
    #[turbo_tasks::function]
    pub fn new(
        source: AssetVc,
        context: AssetContextVc,
        ty: Value<EcmascriptModuleAssetType>,
        transforms: EcmascriptInputTransformsVc,
        options: Value<EcmascriptOptions>,
        compile_time_info: CompileTimeInfoVc,
    ) -> Self {
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
        source: AssetVc,
        context: AssetContextVc,
        ty: Value<EcmascriptModuleAssetType>,
        transforms: EcmascriptInputTransformsVc,
        options: Value<EcmascriptOptions>,
        compile_time_info: CompileTimeInfoVc,
        inner_assets: InnerAssetsVc,
    ) -> Self {
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
        self_vc: EcmascriptModuleAssetVc,
        context: EcmascriptChunkingContextVc,
        other_entries: EcmascriptChunkPlaceablesVc,
    ) -> ChunkVc {
        EcmascriptChunkVc::new_root_with_entries(context, self_vc.into(), other_entries).into()
    }

    #[turbo_tasks::function]
    pub async fn analyze(self) -> Result<AnalyzeEcmascriptModuleResultVc> {
        let this = self.await?;
        Ok(analyze_ecmascript_module(
            this.source,
            self.as_resolve_origin(),
            Value::new(this.ty),
            this.transforms,
            Value::new(this.options),
            this.compile_time_info,
            None,
        ))
    }

    #[turbo_tasks::function]
    pub async fn failsafe_analyze(self) -> Result<AnalyzeEcmascriptModuleResultVc> {
        let this = self.await?;
        let result = self.analyze();
        let result_value = result.await?;
        if result_value.successful {
            this.last_successful_analysis
                .set(Some(MemoizedSuccessfulAnalysis {
                    operation: result.into(),
                    // We need to store the ReadRefs since we want to keep a snapshot.
                    references: result_value.references.await?,
                    exports: result_value.exports.await?,
                }));
        } else if let Some(MemoizedSuccessfulAnalysis {
            operation,
            references,
            exports,
        }) = &*this.last_successful_analysis.get()
        {
            // It's important to connect to the last operation here to keep it active, so
            // it's potentially recomputed when garbage collected
            operation.connect();
            return Ok(AnalyzeEcmascriptModuleResult {
                references: ReadRef::cell(references.clone()),
                exports: ReadRef::cell(exports.clone()),
                code_generation: result_value.code_generation,
                successful: false,
            }
            .cell());
        }

        Ok(ReadRef::cell(result_value))
    }

    #[turbo_tasks::function]
    pub async fn parse(self) -> Result<ParseResultVc> {
        let this = self.await?;
        Ok(parse(this.source, Value::new(this.ty), this.transforms))
    }
}

#[turbo_tasks::value_impl]
impl Asset for EcmascriptModuleAsset {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<AssetIdentVc> {
        if let Some(inner_assets) = self.inner_assets {
            let mut ident = self.source.ident().await?.clone_value();
            for (name, asset) in inner_assets.await?.iter() {
                ident.add_asset(StringVc::cell(name.clone()), asset.ident());
            }
            ident.add_modifier(modifier());
            Ok(AssetIdentVc::new(Value::new(ident)))
        } else {
            Ok(self.source.ident().with_modifier(modifier()))
        }
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        self.source.content()
    }

    #[turbo_tasks::function]
    async fn references(self_vc: EcmascriptModuleAssetVc) -> Result<AssetReferencesVc> {
        Ok(self_vc.failsafe_analyze().await?.references)
    }
}

#[turbo_tasks::value_impl]
impl ChunkableAsset for EcmascriptModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk(
        self_vc: EcmascriptModuleAssetVc,
        context: ChunkingContextVc,
        availability_info: Value<AvailabilityInfo>,
    ) -> ChunkVc {
        EcmascriptChunkVc::new(
            context,
            self_vc.as_ecmascript_chunk_placeable(),
            availability_info,
        )
        .into()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkPlaceable for EcmascriptModuleAsset {
    #[turbo_tasks::function]
    fn as_chunk_item(
        self_vc: EcmascriptModuleAssetVc,
        context: EcmascriptChunkingContextVc,
    ) -> EcmascriptChunkItemVc {
        ModuleChunkItemVc::cell(ModuleChunkItem {
            module: self_vc,
            context,
        })
        .into()
    }

    #[turbo_tasks::function]
    async fn get_exports(self_vc: EcmascriptModuleAssetVc) -> Result<EcmascriptExportsVc> {
        Ok(self_vc.failsafe_analyze().await?.exports)
    }
}

#[turbo_tasks::value_impl]
impl EvaluatableAsset for EcmascriptModuleAsset {}

#[turbo_tasks::value_impl]
impl ResolveOrigin for EcmascriptModuleAsset {
    #[turbo_tasks::function]
    fn origin_path(&self) -> FileSystemPathVc {
        self.source.ident().path()
    }

    #[turbo_tasks::function]
    fn context(&self) -> AssetContextVc {
        self.context
    }

    #[turbo_tasks::function]
    async fn get_inner_asset(&self, request: RequestVc) -> Result<AssetOptionVc> {
        Ok(AssetOptionVc::cell(
            if let Some(inner_assets) = &self.inner_assets {
                if let Some(request) = request.await?.request() {
                    inner_assets.await?.get(&request).copied()
                } else {
                    None
                }
            } else {
                None
            },
        ))
    }
}

#[turbo_tasks::value]
struct ModuleChunkItem {
    module: EcmascriptModuleAssetVc,
    context: EcmascriptChunkingContextVc,
}

#[turbo_tasks::value_impl]
impl ChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    fn asset_ident(&self) -> AssetIdentVc {
        self.module.ident()
    }

    #[turbo_tasks::function]
    fn references(&self) -> AssetReferencesVc {
        self.module.references()
    }
}

#[turbo_tasks::value_impl]
impl EcmascriptChunkItem for ModuleChunkItem {
    #[turbo_tasks::function]
    fn chunking_context(&self) -> EcmascriptChunkingContextVc {
        self.context
    }

    #[turbo_tasks::function]
    fn content(self_vc: ModuleChunkItemVc) -> EcmascriptChunkItemContentVc {
        self_vc.content_with_availability_info(Value::new(AvailabilityInfo::Untracked))
    }

    #[turbo_tasks::function]
    async fn content_with_availability_info(
        self_vc: ModuleChunkItemVc,
        availability_info: Value<AvailabilityInfo>,
    ) -> Result<EcmascriptChunkItemContentVc> {
        let this = self_vc.await?;
        if *this.module.analyze().needs_availability_info().await? {
            availability_info
        } else {
            Value::new(AvailabilityInfo::Untracked)
        };

        let module = this.module.await?;
        let parsed = parse(module.source, Value::new(module.ty), module.transforms);

        Ok(gen_content(
            this.context.into(),
            this.module.analyze(),
            parsed,
            this.module.ident(),
            availability_info,
        ))
    }
}

#[turbo_tasks::function]
async fn gen_content(
    context: EcmascriptChunkingContextVc,
    analyzed: AnalyzeEcmascriptModuleResultVc,
    parsed: ParseResultVc,
    ident: AssetIdentVc,
    availability_info: Value<AvailabilityInfo>,
) -> Result<EcmascriptChunkItemContentVc> {
    let AnalyzeEcmascriptModuleResult {
        references,
        code_generation,
        ..
    } = &*analyzed.await?;

    let mut code_gens = Vec::new();
    for r in references.await?.iter() {
        let r = r.resolve().await?;
        if let Some(code_gen) = CodeGenerateableWithAvailabilityInfoVc::resolve_from(r).await? {
            code_gens.push(code_gen.code_generation(context, availability_info));
        } else if let Some(code_gen) = CodeGenerateableVc::resolve_from(r).await? {
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

        Ok(EcmascriptChunkItemContent {
            inner_code: bytes.into(),
            source_map: Some(srcmap),
            options: if eval_context.is_esm() {
                EcmascriptChunkItemOptions {
                    ..Default::default()
                }
            } else {
                EcmascriptChunkItemOptions {
                    // These things are not available in ESM
                    module: true,
                    exports: true,
                    this: true,
                    ..Default::default()
                }
            },
            ..Default::default()
        }
        .into())
    } else {
        Ok(EcmascriptChunkItemContent {
            inner_code: format!(
                "const e = new Error(\"Could not parse module '{path}'\");\ne.code = \
                 'MODULE_UNPARSEABLE';\nthrow e;",
                path = ident.path().to_string().await?
            )
            .into(),
            ..Default::default()
        }
        .into())
    }
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
