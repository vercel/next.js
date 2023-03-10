use anyhow::Result;
use turbo_tasks_fs::FileSystemPathVc;
use turbopack::module_options::{TypescriptTransformOptions, TypescriptTransformOptionsVc};
use turbopack_core::{
    resolve::{find_context_file, node::node_cjs_resolve_options, FindContextFileResult},
    source_asset::SourceAssetVc,
};
use turbopack_ecmascript::typescript::resolve::{read_from_tsconfigs, read_tsconfigs, tsconfig};

// Get the transform options for specifically for the typescript's runtime
// outputs
#[turbo_tasks::function]
pub async fn get_typescript_transform_options(
    project_path: FileSystemPathVc,
) -> Result<TypescriptTransformOptionsVc> {
    let tsconfig = find_context_file(project_path, tsconfig());
    let tsconfig = match *tsconfig.await? {
        FindContextFileResult::Found(path, _) => Some(
            read_tsconfigs(
                path.read(),
                SourceAssetVc::new(path).into(),
                node_cjs_resolve_options(path.root()),
            )
            .await?,
        ),
        FindContextFileResult::NotFound(_) => None,
    };

    let use_define_for_class_fields = if let Some(tsconfig) = tsconfig {
        read_from_tsconfigs(&tsconfig, |json, _| {
            json["compilerOptions"]["useDefineForClassFields"].as_bool()
        })
        .await?
        .unwrap_or(false)
    } else {
        false
    };

    let ts_transform_options = TypescriptTransformOptions {
        use_define_for_class_fields,
        ..Default::default()
    };

    Ok(ts_transform_options.cell())
}
