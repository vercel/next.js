use anyhow::{Context, Result};
use turbo_rcstr::RcStr;
use turbo_tasks::Vc;
use turbo_tasks_fs::embed_file;

#[turbo_tasks::function]
pub(super) async fn error_html(
    status_code: u16,
    title: RcStr,
    details: RcStr,
) -> Result<Vc<RcStr>> {
    let html = create_html(status_code, title, details).await?;

    Ok(Vc::cell(html.into()))
}

#[turbo_tasks::function]
pub(super) async fn error_html_body(
    status_code: u16,
    title: RcStr,
    details: RcStr,
) -> Result<Vc<RcStr>> {
    let html = create_html(status_code, title, details).await?;

    let (_, body) = html.split_once("<body>").context("no body in html")?;
    let (body, _) = body.split_once("</body>").context("no body in html")?;

    Ok(Vc::cell(body.into()))
}

async fn create_html(status_code: u16, title: RcStr, details: RcStr) -> Result<String> {
    let file_content = embed_file!("src/render/error.html").await?;
    let file = file_content
        .as_content()
        .context("embedded file not found (this should not happen)")?;

    let html = file
        .content()
        .to_str()
        .context("couldn't convert embedded html to string")?;

    let html = html.replace("${TITLE}", &title);
    let html = html.replace("${STATUS_CODE}", &status_code.to_string());
    let html = html.replace("${DETAILS}", &details);

    Ok(html)
}
