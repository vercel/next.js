#![feature(min_specialization)]
#![feature(arbitrary_self_types)]
#![feature(arbitrary_self_types_pointers)]

use anyhow::Result;
use mdxjs::{compile, MdxParseOptions, Options};
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, ValueDefault, Vc};
use turbo_tasks_fs::{rope::Rope, File, FileContent, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    ident::AssetIdent,
    issue::{
        Issue, IssueDescriptionExt, IssueExt, IssueSource, IssueStage, OptionIssueSource,
        OptionStyledString, StyledString,
    },
    source::Source,
    source_pos::SourcePos,
    source_transform::SourceTransform,
};

#[turbo_tasks::function]
fn modifier() -> Vc<RcStr> {
    Vc::cell("mdx".into())
}

#[turbo_tasks::value(shared, operation)]
#[derive(Hash, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub enum MdxParseConstructs {
    Commonmark,
    Gfm,
}

/// Subset of mdxjs::Options to allow to inherit turbopack's jsx-related configs
/// into mdxjs. This is thin, near straightforward subset of mdxjs::Options to
/// enable turbo tasks.
#[turbo_tasks::value(shared, operation)]
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
    options: ResolvedVc<MdxTransformOptions>,
}

#[turbo_tasks::value_impl]
impl MdxTransform {
    #[turbo_tasks::function]
    pub fn new(options: ResolvedVc<MdxTransformOptions>) -> Vc<Self> {
        MdxTransform { options }.cell()
    }
}

#[turbo_tasks::value_impl]
impl SourceTransform for MdxTransform {
    #[turbo_tasks::function]
    fn transform(&self, source: ResolvedVc<Box<dyn Source>>) -> Vc<Box<dyn Source>> {
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
    options: ResolvedVc<MdxTransformOptions>,
    source: ResolvedVc<Box<dyn Source>>,
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
    async fn content(self: ResolvedVc<Self>) -> Result<Vc<AssetContent>> {
        let this = self.await?;
        Ok(*transform_process_operation(self)
            .issue_file_path(this.source.ident().path(), "MDX processing")
            .await?
            .connect()
            .await?
            .content)
    }
}

#[turbo_tasks::function(operation)]
fn transform_process_operation(asset: ResolvedVc<MdxTransformedAsset>) -> Vc<MdxTransformResult> {
    asset.process()
}

#[turbo_tasks::value_impl]
impl MdxTransformedAsset {
    #[turbo_tasks::function]
    async fn process(&self) -> Result<Vc<MdxTransformResult>> {
        let content = self.source.content().await?;
        let transform_options = self.options.await?;

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
            filepath: Some(self.source.ident().path().await?.to_string()),
            ..Default::default()
        };

        let result = compile(&file.content().to_str()?, &options);

        match result {
            Ok(mdx_jsx_component) => Ok(MdxTransformResult {
                content: AssetContent::file(File::from(Rope::from(mdx_jsx_component)).into())
                    .to_resolved()
                    .await?,
            }
            .cell()),
            Err(err) => {
                let loc = match err.place {
                    Some(p) => {
                        let (start, end) = match *p {
                            // markdown's positions are 1-indexed, SourcePos is 0-indexed.
                            // Both end positions point to the first character after the range
                            markdown::message::Place::Position(p) => (
                                SourcePos {
                                    line: (p.start.line - 1) as u32,
                                    column: (p.start.column - 1) as u32,
                                },
                                SourcePos {
                                    line: (p.end.line - 1) as u32,
                                    column: (p.end.column - 1) as u32,
                                },
                            ),
                            markdown::message::Place::Point(p) => {
                                let p = SourcePos {
                                    line: (p.line - 1) as u32,
                                    column: (p.column - 1) as u32,
                                };
                                (p, p)
                            }
                        };

                        Some(IssueSource::from_line_col(self.source, start, end))
                    }
                    None => None,
                };

                MdxIssue {
                    path: self.source.ident().path().to_resolved().await?,
                    loc,
                    reason: err.reason,
                    mdx_rule_id: *err.rule_id,
                    mdx_source: *err.source,
                }
                .resolved_cell()
                .emit();

                Ok(MdxTransformResult {
                    content: AssetContent::File(FileContent::NotFound.resolved_cell())
                        .resolved_cell(),
                }
                .cell())
            }
        }
    }
}

#[turbo_tasks::value]
struct MdxTransformResult {
    content: ResolvedVc<AssetContent>,
}

#[turbo_tasks::value]
struct MdxIssue {
    /// Place of message.
    path: ResolvedVc<FileSystemPath>,
    loc: Option<IssueSource>,
    /// Reason for message (should use markdown).
    reason: String,
    /// Category of message.
    mdx_rule_id: String,
    /// Namespace of message.
    mdx_source: String,
}

#[turbo_tasks::value_impl]
impl Issue for MdxIssue {
    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        *self.path
    }

    #[turbo_tasks::function]
    async fn source(&self) -> Result<Vc<OptionIssueSource>> {
        Ok(Vc::cell(match &self.loc {
            Some(loc) => Some(loc.resolve_source_map().await?.into_owned()),
            None => None,
        }))
    }

    #[turbo_tasks::function]
    fn stage(self: Vc<Self>) -> Vc<IssueStage> {
        IssueStage::Parse.cell()
    }

    #[turbo_tasks::function]
    fn title(self: Vc<Self>) -> Vc<StyledString> {
        StyledString::Text("MDX Parse Error".into()).cell()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(
            StyledString::Text(self.reason.clone().into()).resolved_cell(),
        ))
    }
}

pub fn register() {
    turbo_tasks::register();
    turbo_tasks_fs::register();
    turbopack_core::register();
    turbopack_ecmascript::register();
    include!(concat!(env!("OUT_DIR"), "/register.rs"));
}
