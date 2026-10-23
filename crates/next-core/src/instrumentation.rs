use anyhow::{Context, Result};
use turbo_rcstr::RcStr;
use turbo_tasks::Vc;
use turbo_tasks_fs::{FileContent, FileSystemPath};
use turbopack_core::{
    asset::AssetContent, file_source::FileSource, source::Source, virtual_source::VirtualSource,
};

#[turbo_tasks::function]
pub async fn instrumentation_files(page_extensions: Vc<Vec<RcStr>>) -> Result<Vc<Vec<RcStr>>> {
    let extensions = page_extensions.await?;
    let files = ["instrumentation.", "src/instrumentation."]
        .into_iter()
        .flat_map(|f| {
            extensions
                .iter()
                .map(move |ext| String::from(f) + ext.as_str())
                .map(RcStr::from)
        })
        .collect();
    Ok(Vc::cell(files))
}

/// Create the same composite instrumentation module as the webpack loader.
#[turbo_tasks::function]
pub async fn create_instrumentation_source(
    project_path: FileSystemPath,
    user_file: Option<FileSystemPath>,
    modules: Vc<Vec<RcStr>>,
) -> Result<Vc<Box<dyn Source>>> {
    let modules = modules.await?;
    if modules.is_empty() {
        return Ok(Vc::upcast(FileSource::new(user_file.context(
            "Expected an instrumentation file or injected modules",
        )?)));
    }

    let mut imports = modules
        .iter()
        .map(|spec| Ok(format!("require({})", serde_json::to_string(spec)?)))
        .collect::<Result<Vec<_>>>()?;
    if let Some(user_file) = user_file {
        let relative = project_path
            .get_relative_request_to(&user_file)
            .context("Instrumentation file must be in the project filesystem")?;
        imports.push(format!("require({})", serde_json::to_string(&relative)?));
    }
    let body = format!(
        "module.exports = \
         require('next/dist/server/instrumentation/compose').createInstrumentation([{}]);\n",
        imports.join(",")
    );
    // Resolve plugin specifiers from the project root, even when the user file
    // is in src/. Use CommonJS regardless of the project's package type.
    Ok(Vc::upcast(VirtualSource::new(
        project_path.join("__next_instrumentation.cjs")?,
        AssetContent::file(FileContent::Content(body.into()).cell()),
    )))
}
