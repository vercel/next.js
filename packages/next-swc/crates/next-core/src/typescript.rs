use anyhow::Result;
use turbo_binding::{
    turbo::tasks_fs::FileSystemPathVc,
    turbopack::{
        core::{
            resolve::{find_context_file, node::node_cjs_resolve_options, FindContextFileResult},
            source_asset::SourceAssetVc,
        },
        ecmascript::typescript::resolve::{read_from_tsconfigs, read_tsconfigs, tsconfig},
        turbopack::module_options::{TypescriptTransformOptions, TypescriptTransformOptionsVc},
    },
};

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
    };

    Ok(ts_transform_options.cell())
}
