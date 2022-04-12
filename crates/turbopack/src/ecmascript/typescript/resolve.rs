use crate::asset::AssetVc;
use crate::ecmascript::resolve::cjs_resolve;
use crate::module;
use crate::reference::{AssetReference, AssetReferenceVc};

use crate::resolve::ResolveResult;
use crate::resolve::{
    find_context_file,
    options::{ConditionValue, ResolveIntoPackage, ResolveModules, ResolveOptionsVc},
    parse::{Request, RequestVc},
    resolve, resolve_options, FindContextFileResult, ResolveResultVc,
};
use crate::source_asset::SourceAssetVc;
use anyhow::Result;
use json::JsonValue;
use turbo_tasks::{Value, ValueToString};
use turbo_tasks_fs::{FileJsonContent, FileJsonContentVc, FileSystemPathVc};

#[turbo_tasks::function]
pub async fn typescript_resolve_options(context: FileSystemPathVc) -> Result<ResolveOptionsVc> {
    let tsconfig = find_context_file(context.clone(), "tsconfig.json").await?;
    let mut resolve_options = apply_typescript_options(resolve_options(context));
    match &*tsconfig {
        FindContextFileResult::Found(path) => {
            resolve_options = apply_tsconfig(resolve_options, path.clone());
        }
        FindContextFileResult::NotFound => {}
    }
    Ok(resolve_options)
}

#[turbo_tasks::function]
pub fn typescript_types_resolve_options(context: FileSystemPathVc) -> ResolveOptionsVc {
    let resolve_options = typescript_resolve_options(context);
    apply_typescript_types_options(resolve_options)
}

#[turbo_tasks::function]
async fn apply_typescript_options(resolve_options: ResolveOptionsVc) -> Result<ResolveOptionsVc> {
    let mut resolve_options = resolve_options.await?.clone();
    resolve_options.extensions.insert(0, ".ts".to_string());
    resolve_options.resolve_typescript_types = true;
    Ok(resolve_options.into())
}

pub async fn read_tsconfigs(
    mut data: FileJsonContentVc,
    mut tsconfig: AssetVc,
) -> Result<Vec<(FileJsonContentVc, AssetVc)>> {
    let mut configs = Vec::new();
    loop {
        match &*data.get().await? {
            FileJsonContent::Unparseable => {
                // TODO report to stream
                println!("ERR {} is invalid JSON", tsconfig.path().to_string().await?);
                break;
            }
            FileJsonContent::NotFound => {
                // TODO report to stream
                println!("ERR {} not found", tsconfig.path().to_string().await?);
                break;
            }
            FileJsonContent::Content(json) => {
                configs.push((data, tsconfig.clone()));
                if let Some(extends) = json["extends"].as_str() {
                    let context = tsconfig.path().parent();
                    let options = resolve_options(context.clone());
                    let result = cjs_resolve(
                        RequestVc::parse(Value::new(extends.to_string().into())),
                        context,
                        options,
                    )
                    .await?;
                    if let ResolveResult::Single(asset, _) = &*result {
                        data = asset.content().parse_json();
                        tsconfig = asset.clone();
                    } else {
                        // TODO report to stream
                        println!(
                            "ERR extends in {} doesn't resolve correctly",
                            tsconfig.path().to_string().await?
                        );
                        break;
                    }
                } else {
                    break;
                }
            }
        }
    }
    Ok(configs)
}

pub async fn read_from_tsconfigs<T>(
    configs: &Vec<(FileJsonContentVc, AssetVc)>,
    accessor: impl Fn(&JsonValue, &AssetVc) -> Option<T>,
) -> Result<Option<T>> {
    for (config, source) in configs {
        if let FileJsonContent::Content(json) = &*config.get().await? {
            if let Some(result) = accessor(json, source) {
                return Ok(Some(result));
            }
        }
    }
    Ok(None)
}

#[turbo_tasks::function]
async fn apply_tsconfig(
    resolve_options: ResolveOptionsVc,
    tsconfig: FileSystemPathVc,
) -> Result<ResolveOptionsVc> {
    let configs = read_tsconfigs(
        tsconfig.clone().read_json(),
        SourceAssetVc::new(tsconfig).into(),
    )
    .await?;
    if configs.is_empty() {
        return Ok(resolve_options);
    }
    let mut resolve_options = resolve_options.await?.clone();
    if let Some(base_url) = read_from_tsconfigs(&configs, |json, source| {
        json["compilerOptions"]["baseUrl"]
            .as_str()
            .map(|base_url| source.path().parent().try_join(base_url))
    })
    .await?
    {
        if let Some(base_url) = &*base_url.await? {
            resolve_options
                .modules
                .insert(0, ResolveModules::Path(base_url.clone()));
        }
    }
    Ok(resolve_options.into())
}

#[turbo_tasks::function]
pub async fn type_resolve(
    request: RequestVc,
    context: FileSystemPathVc,
    options: ResolveOptionsVc,
) -> Result<ResolveResultVc> {
    let types_request = if let Request::Module { module: m, path: p } = &*request.get().await? {
        let m = if m.starts_with("@") {
            m[1..].replace('/', "__")
        } else {
            m.clone()
        };
        Some(RequestVc::module(
            format!("@types/{m}"),
            Value::new(p.clone()),
        ))
    } else {
        None
    };
    let result = if let Some(types_request) = types_request {
        let result1 = resolve(context.clone(), request.clone(), options.clone());
        if !*result1.clone().is_unresolveable().await? {
            return Ok(result1);
        }
        resolve(context.clone(), types_request, options)
    } else {
        resolve(context.clone(), request.clone(), options)
    };
    let result = result.await?;
    let result = result
        .map(
            |a| module(a.clone()).resolve(),
            |i| {
                let i = i.clone();
                async { Ok(i) }
            },
        )
        .await?;
    if result.is_unresolveable() {
        // TODO report this to stream
        println!(
            "unable to resolve type request {} in {}",
            request.to_string().await?,
            context.to_string().await?
        );
    }
    Ok(result.into())
}

#[turbo_tasks::value(AssetReference)]
#[derive(PartialEq, Eq)]
pub struct TypescriptTypesAssetReference {
    pub request: RequestVc,
    pub context: FileSystemPathVc,
    pub options: ResolveOptionsVc,
}

#[turbo_tasks::value_impl]
impl AssetReference for TypescriptTypesAssetReference {
    fn resolve_reference(&self) -> ResolveResultVc {
        let options = apply_typescript_types_options(self.options.clone());
        type_resolve(self.request.clone(), self.context.clone(), options)
    }
}

impl TypescriptTypesAssetReferenceVc {
    pub fn new(request: RequestVc, context: FileSystemPathVc, options: ResolveOptionsVc) -> Self {
        Self::slot(TypescriptTypesAssetReference {
            request,
            context,
            options,
        })
    }
}

#[turbo_tasks::function]
async fn apply_typescript_types_options(
    resolve_options: ResolveOptionsVc,
) -> Result<ResolveOptionsVc> {
    let mut resolve_options = resolve_options.await?.clone();
    resolve_options.extensions = vec![".ts".to_string(), ".tsx".to_string(), ".d.ts".to_string()];
    resolve_options.into_package = resolve_options
        .into_package
        .drain(..)
        .filter_map(|into| {
            if let ResolveIntoPackage::ExportsField {
                field,
                mut conditions,
                unspecified_conditions,
            } = into
            {
                conditions.insert("types".to_string(), ConditionValue::Set);
                Some(ResolveIntoPackage::ExportsField {
                    field,
                    conditions,
                    unspecified_conditions,
                })
            } else {
                None
            }
        })
        .collect();
    resolve_options
        .into_package
        .push(ResolveIntoPackage::MainField("types".to_string()));
    resolve_options
        .into_package
        .push(ResolveIntoPackage::Default("index".to_string()));
    Ok(resolve_options.into())
}
