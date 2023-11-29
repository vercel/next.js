use anyhow::Result;
use turbo_tasks::Vc;

#[turbo_tasks::function]
pub async fn instrumentation_files(page_extensions: Vc<Vec<String>>) -> Result<Vc<Vec<String>>> {
    let extensions = page_extensions.await?;
    let files = ["instrumentation.", "src/instrumentation."]
        .into_iter()
        .flat_map(|f| {
            extensions
                .iter()
                .map(move |ext| String::from(f) + ext.as_str())
        })
        .collect();
    Ok(Vc::cell(files))
}
