#![feature(min_specialization)]
#![feature(arbitrary_self_types)]

use anyhow::{anyhow, Result};
use mdxjs::{compile, MdxParseOptions, Options};
use turbo_tasks::{RcStr, ValueDefault, Vc};
use turbo_tasks_fs::{rope::Rope, File, FileContent};
use turbopack_core::{
    asset::{Asset, AssetContent},
    ident::AssetIdent,
    issue::IssueDescriptionExt,
    source::Source,
    source_transform::SourceTransform,
};

#[turbo_tasks::function]
fn modifier() -> Vc<RcStr> {
    Vc::cell("mdx".into())
}

#[turbo_tasks::value(shared)]
#[derive(Hash, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub enum MdxParseConstructs {
    Commonmark,
    Gfm,
}

/// Subset of mdxjs::Options to allow to inherit turbopack's jsx-related configs
/// into mdxjs. This is thin, near straightforward subset of mdxjs::Options to
/// enable turbo tasks.
#[turbo_tasks::value(shared)]
#[derive(Hash, Debug, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct MdxTransformOptions {
    pub development: Option<bool>,
    pub jsx: Option<bool>,
    pub jsx_runtime: Option<RcStr>,
    pub jsx_import_source: Option<RcStr>,
    /// The path to a module providing Components to mdx modules.
    /// The provider must export a useMDXComponents, which is called to access
    /// an object of components.
    pub provider_import_source: Option<RcStr>,
    /// Determines how to parse mdx contents.
    pub mdx_type: Option<MdxParseConstructs>,
}

impl Default for MdxTransformOptions {
    fn default() -> Self {
        Self {
            development: Some(true),
            jsx: Some(false),
            jsx_runtime: None,
            jsx_import_source: None,
            provider_import_source: None,
            mdx_type: Some(MdxParseConstructs::Commonmark),
        }
    }
}

#[turbo_tasks::value_impl]
impl MdxTransformOptions {
    #[turbo_tasks::function]
    fn default_private() -> Vc<Self> {
        Self::cell(Default::default())
    }
}

impl ValueDefault for MdxTransformOptions {
    fn value_default() -> Vc<Self> {
        Self::default_private()
    }
}

#[turbo_tasks::value]
pub struct MdxTransform {
    options: Vc<MdxTransformOptions>,
}

#[turbo_tasks::value_impl]
impl MdxTransform {
    #[turbo_tasks::function]
    pub fn new(options: Vc<MdxTransformOptions>) -> Vc<Self> {
        MdxTransform { options }.cell()
    }
}

#[turbo_tasks::value_impl]
impl SourceTransform for MdxTransform {
    #[turbo_tasks::function]
    fn transform(&self, source: Vc<Box<dyn Source>>) -> Vc<Box<dyn Source>> {
        Vc::upcast(
            MdxTransformedAsset {
                options: self.options,
                source,
            }
            .cell(),
        )
    }
}

#[turbo_tasks::value]
struct MdxTransformedAsset {
    options: Vc<MdxTransformOptions>,
    source: Vc<Box<dyn Source>>,
}

#[turbo_tasks::value_impl]
impl Source for MdxTransformedAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source.ident().rename_as("*.tsx".into())
    }
}

#[turbo_tasks::value_impl]
impl Asset for MdxTransformedAsset {
    #[turbo_tasks::function]
    async fn content(self: Vc<Self>) -> Result<Vc<AssetContent>> {
        let this = self.await?;
        Ok(self
            .process()
            .issue_file_path(this.source.ident().path(), "MDX processing")
            .await?
            .await?
            .content)
    }
}

#[turbo_tasks::value_impl]
impl MdxTransformedAsset {
    #[turbo_tasks::function]
    async fn process(self: Vc<Self>) -> Result<Vc<MdxTransformResult>> {
        let this = self.await?;
        let content = this.source.content().await?;
        let transform_options = this.options.await?;

        let AssetContent::File(file) = &*content else {
            anyhow::bail!("Unexpected mdx asset content");
        };

        let FileContent::Content(file) = &*file.await? else {
            anyhow::bail!("Not able to read mdx file content");
        };

        let jsx_runtime = if let Some(runtime) = &transform_options.jsx_runtime {
            match runtime.as_str() {
                "automatic" => Some(mdxjs::JsxRuntime::Automatic),
                "classic" => Some(mdxjs::JsxRuntime::Classic),
                _ => None,
            }
        } else {
            None
        };

        let parse_options = match transform_options.mdx_type {
            Some(MdxParseConstructs::Gfm) => MdxParseOptions::gfm(),
            _ => MdxParseOptions::default(),
        };

        let options = Options {
            parse: parse_options,
            development: transform_options.development.unwrap_or(false),
            provider_import_source: transform_options
                .provider_import_source
                .clone()
                .map(RcStr::into_owned),
            jsx: transform_options.jsx.unwrap_or(false), // true means 'preserve' jsx syntax.
            jsx_runtime,
            jsx_import_source: transform_options
                .jsx_import_source
                .clone()
                .map(RcStr::into_owned),
            filepath: Some(this.source.ident().path().await?.to_string()),
            ..Default::default()
        };

        // TODO: upstream mdx currently bubbles error as string
        let mdx_jsx_component =
            compile(&file.content().to_str()?, &options).map_err(|e| anyhow!("{}", e))?;

        Ok(MdxTransformResult {
            content: AssetContent::file(File::from(Rope::from(mdx_jsx_component)).into()),
        }
        .cell())
    }
}

#[turbo_tasks::value]
struct MdxTransformResult {
    content: Vc<AssetContent>,
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    turbopack_ecmascript::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
