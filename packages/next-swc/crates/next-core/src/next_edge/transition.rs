use anyhow::{anyhow, bail, Result};
use indexmap::indexmap;
use turbo_tasks::Value;
use turbo_tasks_fs::{rope::RopeBuilder, File, FileContent, FileContentVc, FileSystemPathVc};
use turbopack::{
    module_options::ModuleOptionsContextVc,
    resolve_options_context::ResolveOptionsContextVc,
    transition::{Transition, TransitionVc},
    ModuleAssetContextVc,
};
use turbopack_core::{
    asset::{Asset, AssetVc},
    chunk::ChunkingContextVc,
    compile_time_info::CompileTimeInfoVc,
    context::AssetContext,
    virtual_asset::VirtualAssetVc,
};
use turbopack_ecmascript::{
    chunk_group_files_asset::ChunkGroupFilesAsset, utils::StringifyJs, EcmascriptInputTransform,
    EcmascriptInputTransformsVc, EcmascriptModuleAssetType, EcmascriptModuleAssetVc, InnerAssetsVc,
};

#[turbo_tasks::value(shared)]
pub struct NextEdgeTransition {
    pub edge_compile_time_info: CompileTimeInfoVc,
    pub edge_chunking_context: ChunkingContextVc,
    pub edge_module_options_context: Option<ModuleOptionsContextVc>,
    pub edge_resolve_options_context: ResolveOptionsContextVc,
    pub output_path: FileSystemPathVc,
    pub base_path: FileSystemPathVc,
    pub bootstrap_file: FileContentVc,
    pub entry_name: String,
}

#[turbo_tasks::value_impl]
impl Transition for NextEdgeTransition {
    #[turbo_tasks::function]
    fn process_compile_time_info(
        &self,
        _compile_time_info: CompileTimeInfoVc,
    ) -> CompileTimeInfoVc {
        self.edge_compile_time_info
    }

    #[turbo_tasks::function]
    fn process_module_options_context(
        &self,
        context: ModuleOptionsContextVc,
    ) -> ModuleOptionsContextVc {
        self.edge_module_options_context.unwrap_or(context)
    }

    #[turbo_tasks::function]
    fn process_resolve_options_context(
        &self,
        _context: ResolveOptionsContextVc,
    ) -> ResolveOptionsContextVc {
        self.edge_resolve_options_context
    }

    #[turbo_tasks::function]
    async fn process_module(
        &self,
        asset: AssetVc,
        context: ModuleAssetContextVc,
    ) -> Result<AssetVc> {
        let FileContent::Content(base) = &*self.bootstrap_file.await? else {
            bail!("runtime code not found");
        };
        let path = asset.ident().path().await?;
        let path = self
            .base_path
            .await?
            .get_path_to(&path)
            .ok_or_else(|| anyhow!("asset is not in base_path"))?;
        let path = if let Some((name, ext)) = path.rsplit_once('.') {
            if !ext.contains('/') {
                name
            } else {
                path
            }
        } else {
            path
        };
        let mut new_content = RopeBuilder::from(
            format!(
                "const NAME={};\nconst PAGE = {};\n",
                StringifyJs(&self.entry_name),
                StringifyJs(path)
            )
            .into_bytes(),
        );
        new_content.concat(base.content());
        let file = File::from(new_content.build());
        let virtual_asset = VirtualAssetVc::new(
            asset.ident().path().join("next-edge-bootstrap.ts"),
            FileContent::Content(file).cell().into(),
        );

        let new_asset = EcmascriptModuleAssetVc::new_with_inner_assets(
            virtual_asset.into(),
            context.into(),
            Value::new(EcmascriptModuleAssetType::Typescript),
            EcmascriptInputTransformsVc::cell(vec![EcmascriptInputTransform::TypeScript {
                use_define_for_class_fields: false,
            }]),
            context.compile_time_info(),
            InnerAssetsVc::cell(indexmap! {
                "ENTRY".to_string() => asset
            }),
        );

        let asset = ChunkGroupFilesAsset {
            asset: new_asset.into(),
            client_root: self.output_path,
            chunking_context: self.edge_chunking_context,
            runtime_entries: None,
        };

        Ok(asset.cell().into())
    }
}
