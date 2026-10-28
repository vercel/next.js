use std::path::Path;

use anyhow::{Context, Result};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{DiskFileSystem, FileSystemPath};
use turbopack_core::{
    asset::{Asset, AssetContent},
    chunk::SourceMapsType,
    context::ProcessResult,
    file_source::FileSource,
    ident::{AssetIdent, Layer},
    loader::{WebpackLoaderItem, WebpackLoaderItems, parse_inline_loader_request},
    reference_type::ReferenceType,
    resolve::{
        ResolveResult, ResolveResultItem,
        node::node_cjs_resolve_options,
        options::{
            ConditionValue, ResolutionConditions, ResolveInPackage, ResolveIntoPackage,
            ResolveOptions,
        },
        parse::Request,
        resolve,
    },
    source::Source,
    source_transform::SourceTransform,
};
use turbopack_node::transforms::webpack::WebpackLoaders;

use crate::{
    ModuleAssetContext,
    evaluate_context::config_tracing_module_context,
    module_options::{ModuleOptions, module_rule::ModuleRuleEffect},
};

/// A resolved resource with a loader chain supplied by the importing request. Keep this separate
/// from virtual sources: configured rules still match the real resource, including its content.
#[turbo_tasks::value]
pub(crate) struct InlineLoaderSource {
    source: ResolvedVc<Box<dyn Source>>,
    loaders: ResolvedVc<WebpackLoaderItems>,
    skip_configured_loaders: bool,
    rename_as: Option<RcStr>,
}

#[turbo_tasks::value_impl]
impl InlineLoaderSource {
    #[turbo_tasks::function]
    fn new(
        source: ResolvedVc<Box<dyn Source>>,
        loaders: ResolvedVc<WebpackLoaderItems>,
        skip_configured_loaders: bool,
        rename_as: Option<RcStr>,
    ) -> Vc<Self> {
        Self {
            source,
            loaders,
            skip_configured_loaders,
            rename_as,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl Asset for InlineLoaderSource {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}

#[turbo_tasks::value_impl]
impl Source for InlineLoaderSource {
    #[turbo_tasks::function]
    async fn ident(&self) -> Result<Vc<AssetIdent>> {
        let loaders = self.loaders.await?;
        let modifier = format!(
            "inline loaders {}{}",
            if self.skip_configured_loaders {
                "!!"
            } else {
                ""
            },
            serde_json::to_string(&*loaders)?,
        );
        let mut ident = self
            .source
            .ident()
            .owned()
            .await?
            .with_modifier(modifier.into());
        if let Some(rename_as) = &self.rename_as {
            ident = ident.rename_as(rename_as);
        }
        Ok(ident.into_vc())
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("inline loaders for {}", self.source.description().await?).into(),
        ))
    }
}

/// Convert absolute filesystem paths to relative requests, preserving queries and fragments.
async fn resource_request(context: &FileSystemPath, request: &str) -> Result<RcStr> {
    let end = request.find(['?', '#']).unwrap_or(request.len());
    let (path, suffix) = request.split_at(end);
    if !Path::new(path).is_absolute() {
        return Ok(request.into());
    }
    let fs = ResolvedVc::try_downcast_type::<DiskFileSystem>(context.fs)
        .context("Inline request origin must use a disk filesystem")?;
    let target = fs
        .await?
        .try_from_sys_path_across_roots(fs, Path::new(path), context)
        .await?
        .context("Inline request is outside configured filesystem roots")?;
    let relative = context
        .get_relative_request_to(&target)
        .context("Inline request is on a different filesystem")?;
    Ok(format!("{relative}{suffix}").into())
}

pub(crate) async fn resolve_inline_request(
    context: Vc<ModuleAssetContext>,
    origin: FileSystemPath,
    request: Vc<Request>,
    options: Vc<ResolveOptions>,
    reference_type: &ReferenceType,
) -> Result<Option<Vc<ResolveResult>>> {
    if !matches!(
        reference_type,
        ReferenceType::EcmaScriptModules(_) | ReferenceType::CommonJs(_)
    ) {
        return Ok(None);
    }
    let Some(raw) = request.await?.raw_request() else {
        return Ok(None);
    };
    let Some((skip_configured_loaders, loader_requests, resource)) =
        parse_inline_loader_request(&raw)
    else {
        return Ok(None);
    };
    let parent = origin.parent();
    let execution_context = context
        .await?
        .module_options_context
        .await?
        .execution_context
        .context("Inline loaders require an execution context")?;
    let project = execution_context.await?.project_path.clone();
    let mut loaders = Vec::with_capacity(loader_requests.len());
    let mut affecting_sources = Vec::new();
    for loader in loader_requests {
        let end = loader.find(['?', '#']).unwrap_or(loader.len());
        let (path, suffix) = loader.split_at(end);
        let loader_request = Request::parse(resource_request(&parent, path).await?.into());
        let resolved = resolve(
            parent.clone(),
            ReferenceType::Loader,
            loader_request,
            loader_resolve_options(),
        )
        .await?;
        affecting_sources.extend(resolved.affecting_sources.iter().copied());
        let Some(source) = resolved.first_source() else {
            // Preserve lookup dependencies and let the caller handle optional requires.
            return Ok(Some(
                ResolveResult {
                    primary: Default::default(),
                    affecting_sources: affecting_sources.into_boxed_slice(),
                }
                .cell(),
            ));
        };
        let path = project
            .get_relative_request_to(&source.ident().await?.path)
            .context("Inline loader must be on the project filesystem")?;
        loaders.push(WebpackLoaderItem {
            loader: format!("{path}{suffix}").into(),
            options: Default::default(),
        });
    }
    let has_inline_loaders = !loaders.is_empty();
    let loaders = loader_items(loaders).to_resolved().await?;
    let resource = Request::parse(resource_request(&parent, resource).await?.into());
    let mut result = resolve(parent, reference_type.clone(), resource, options)
        .owned()
        .await?;
    result.affecting_sources = result
        .affecting_sources
        .into_iter()
        .chain(affecting_sources)
        .collect();
    for (_, item) in &mut result.primary {
        if has_inline_loaders && let ResolveResultItem::External { target, .. } = item {
            let Some(path) = target.clone() else {
                return Ok(Some(
                    ResolveResult {
                        primary: Default::default(),
                        affecting_sources: result.affecting_sources,
                    }
                    .cell(),
                ));
            };
            // Inline loaders must transform package sources, even when normally externalized.
            let (query, fragment) = match &*resource.await? {
                Request::Module {
                    query, fragment, ..
                } => (query.clone(), fragment.clone()),
                _ => (RcStr::default(), RcStr::default()),
            };
            *item = ResolveResultItem::Source(ResolvedVc::upcast(
                FileSource::new_with_query_and_fragment(path, query, fragment)
                    .to_resolved()
                    .await?,
            ));
        }
        if let ResolveResultItem::Source(source) = item {
            *source = ResolvedVc::upcast(
                InlineLoaderSource::new(**source, *loaders, skip_configured_loaders, None)
                    .to_resolved()
                    .await?,
            );
        }
    }
    Ok(Some(result.cell()))
}

#[turbo_tasks::value_impl]
impl InlineLoaderSource {
    #[turbo_tasks::function]
    pub(crate) async fn process(
        self: ResolvedVc<Self>,
        context: Vc<ModuleAssetContext>,
        reference_type: ReferenceType,
    ) -> Result<Vc<ProcessResult>> {
        let this = self.await?;
        let source = this.source;
        let path = source.ident().await?.path.clone();
        let options = ModuleOptions::new(
            path.parent(),
            context.module_options_context(),
            context.resolve_options_context(),
        )
        .await?;
        let mut loaders = this.loaders.await?.to_vec();
        let mut rename_as = None;
        'rules: for rule in &options.rules {
            if rule.matches(source, &path, &reference_type).await? {
                for effect in rule.effects() {
                    match effect {
                        ModuleRuleEffect::SourceTransforms(transforms) => {
                            for transform in transforms.await?.iter() {
                                if let Some(transform) =
                                    ResolvedVc::try_downcast_type::<WebpackLoaders>(*transform)
                                {
                                    if !this.skip_configured_loaders {
                                        loaders.extend(transform.loaders().await?.iter().cloned());
                                    }
                                    rename_as = (*transform.rename_as().await?).clone();
                                }
                            }
                        }
                        ModuleRuleEffect::ModuleType(_) => break 'rules,
                        ModuleRuleEffect::Ignore => return Ok(ProcessResult::Ignore.cell()),
                        _ => {}
                    }
                }
            }
        }
        let source: ResolvedVc<Box<dyn Source>> = ResolvedVc::upcast(self);
        if loaders.is_empty() {
            // Suppression removes loaders, not the rule's output type/extension.
            let source = if rename_as.is_some() {
                ResolvedVc::upcast(
                    Self::new(
                        *this.source,
                        *this.loaders,
                        this.skip_configured_loaders,
                        rename_as,
                    )
                    .to_resolved()
                    .await?,
                )
            } else {
                source
            };
            return Box::pin(crate::process_default(
                context,
                source,
                reference_type,
                Vec::new(),
                true,
            ))
            .await;
        }
        let module_options = context.module_options_context().await?;
        let webpack_options = module_options
            .enable_webpack_loaders
            .context("Inline loaders require webpack loaders to be enabled")?
            .await?;
        let execution_context = module_options
            .execution_context
            .context("Inline loaders require an execution context")?;
        let import_map = if let Some(package) = webpack_options.loader_runner_package {
            crate::module_options::package_import_map_from_import_mapping(
                rcstr!("loader-runner"),
                *package,
            )
        } else {
            crate::module_options::package_import_map_from_context(
                rcstr!("loader-runner"),
                execution_context.await?.project_path.clone(),
            )
        };
        let transform = WebpackLoaders::new(
            crate::evaluate_context::node_evaluate_asset_context(
                *execution_context,
                Some(import_map),
                None,
                Layer::new(rcstr!("webpack_loaders")),
                false,
            ),
            *execution_context,
            loader_items(loaders),
            *webpack_options.target,
            webpack_options.mode.clone(),
            // Loader output defaults to JavaScript, even for a CSS or text resource.
            rename_as.or(Some(rcstr!("*.js"))),
            context.resolve_options_context(),
            matches!(module_options.ecmascript.source_maps, SourceMapsType::Full),
            config_tracing_module_context(*execution_context),
        );
        let transformed = transform
            .transform(*source, Vc::upcast(context))
            .to_resolved()
            .await?;
        Box::pin(crate::process_default(
            context,
            transformed,
            reference_type,
            Vec::new(),
            true,
        ))
        .await
    }
}

#[turbo_tasks::function]
async fn loader_resolve_options() -> Result<Vc<ResolveOptions>> {
    let conditions: ResolutionConditions = [
        (rcstr!("loader"), ConditionValue::Set),
        (rcstr!("require"), ConditionValue::Set),
        (rcstr!("node"), ConditionValue::Set),
    ]
    .into();
    Ok(ResolveOptions {
        extensions: vec![rcstr!(".js")],
        into_package: vec![
            ResolveIntoPackage::ExportsField {
                conditions: conditions.clone(),
                unspecified_conditions: ConditionValue::Unset,
            },
            ResolveIntoPackage::MainField {
                field: rcstr!("loader"),
            },
            ResolveIntoPackage::MainField {
                field: rcstr!("main"),
            },
        ],
        in_package: vec![ResolveInPackage::ImportsField {
            conditions,
            unspecified_conditions: ConditionValue::Unset,
        }],
        ..node_cjs_resolve_options().owned().await?
    }
    .cell())
}

#[turbo_tasks::function]
fn loader_items(loaders: Vec<WebpackLoaderItem>) -> Vc<WebpackLoaderItems> {
    WebpackLoaderItems(loaders).cell()
}
