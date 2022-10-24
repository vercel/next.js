use std::collections::HashMap;

use anyhow::Result;
use serde_json::Value as JsonValue;
use turbo_tasks::{primitives::StringVc, Value, ValueToString, ValueToStringVc};
use turbo_tasks_fs::{FileJsonContent, FileJsonContentVc, FileSystemPathVc};
use turbopack_core::{
    asset::AssetVc,
    issue::{Issue, IssueSeverity, IssueSeverityVc, IssueVc},
    reference::{AssetReference, AssetReferenceVc},
    resolve::{
        handle_resolve_error,
        options::{
            ConditionValue, ImportMap, ImportMapVc, ImportMapping, ResolveIntoPackage,
            ResolveModules, ResolveOptionsVc,
        },
        origin::ResolveOriginVc,
        parse::{Request, RequestVc},
        resolve, AliasPattern, ResolveResult, ResolveResultVc,
    },
    source_asset::SourceAssetVc,
};

#[turbo_tasks::value(shared)]
pub struct TsConfigIssue {
    pub severity: IssueSeverityVc,
    pub path: FileSystemPathVc,
    pub message: StringVc,
}

pub async fn read_tsconfigs(
    mut data: FileJsonContentVc,
    mut tsconfig: AssetVc,
    resolve_options: ResolveOptionsVc,
) -> Result<Vec<(FileJsonContentVc, AssetVc)>> {
    let mut configs = Vec::new();
    loop {
        match &*data.await? {
            FileJsonContent::Unparseable => {
                TsConfigIssue {
                    severity: IssueSeverity::Error.into(),
                    path: tsconfig.path(),
                    message: StringVc::cell("tsconfig is not parseable: invalid JSON".into()),
                }
                .cell()
                .as_issue()
                .emit();
                break;
            }
            FileJsonContent::NotFound => {
                TsConfigIssue {
                    severity: IssueSeverity::Error.into(),
                    path: tsconfig.path(),
                    message: StringVc::cell("tsconfig not found".into()),
                }
                .cell()
                .as_issue()
                .emit();
                break;
            }
            FileJsonContent::Content(json) => {
                configs.push((data, tsconfig));
                if let Some(extends) = json["extends"].as_str() {
                    let context = tsconfig.path().parent();
                    let result = resolve(
                        context,
                        RequestVc::parse(Value::new(extends.to_string().into())),
                        resolve_options,
                    )
                    .await?;
                    if let ResolveResult::Single(asset, _) = *result {
                        data = asset.content().parse_json_with_comments();
                        tsconfig = asset;
                    } else {
                        TsConfigIssue {
                            severity: IssueSeverity::Error.into(),
                            path: tsconfig.path(),
                            message: StringVc::cell("extends doesn't resolve correctly".into()),
                        }
                        .cell()
                        .as_issue()
                        .emit();
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
    configs: &[(FileJsonContentVc, AssetVc)],
    accessor: impl Fn(&JsonValue, AssetVc) -> Option<T>,
) -> Result<Option<T>> {
    for (config, source) in configs.iter() {
        if let FileJsonContent::Content(json) = &*config.await? {
            if let Some(result) = accessor(json, *source) {
                return Ok(Some(result));
            }
        }
    }
    Ok(None)
}

/// Resolve options specific to tsconfig.json.
#[turbo_tasks::value]
#[derive(Default)]
pub struct TsConfigResolveOptions {
    base_url: Option<FileSystemPathVc>,
    import_map: Option<ImportMapVc>,
}

impl Default for TsConfigResolveOptionsVc {
    fn default() -> Self {
        Self::cell(Default::default())
    }
}

/// Returns the resolve options
#[turbo_tasks::function]
pub async fn tsconfig_resolve_options(
    tsconfig: FileSystemPathVc,
    resolve_in_tsconfig_options: ResolveOptionsVc,
) -> Result<TsConfigResolveOptionsVc> {
    let configs = read_tsconfigs(
        tsconfig.read().parse_json_with_comments(),
        SourceAssetVc::new(tsconfig).into(),
        resolve_in_tsconfig_options,
    )
    .await?;

    if configs.is_empty() {
        return Ok(Default::default());
    }

    let base_url = if let Some(base_url) = read_from_tsconfigs(&configs, |json, source| {
        json["compilerOptions"]["baseUrl"]
            .as_str()
            .map(|base_url| source.path().parent().try_join(base_url))
    })
    .await?
    {
        *base_url.await?
    } else {
        None
    };

    let mut all_paths = HashMap::new();
    for (content, source) in configs.iter().rev() {
        if let FileJsonContent::Content(json) = &*content.await? {
            if let JsonValue::Object(paths) = &json["compilerOptions"]["paths"] {
                let mut context = source.path().parent();
                if let Some(base_url) = json["compilerOptions"]["baseUrl"].as_str() {
                    if let Some(new_context) = *context.try_join(base_url).await? {
                        context = new_context;
                    }
                };
                for (key, value) in paths.iter() {
                    if let JsonValue::Array(vec) = value {
                        let entries = vec
                            .iter()
                            .filter_map(|entry| entry.as_str().map(|s| s.to_string()))
                            .collect();
                        all_paths.insert(
                            key.to_string(),
                            ImportMapping::primary_alternatives(entries, Some(context)),
                        );
                    } else {
                        TsConfigIssue {
                            severity: IssueSeverity::Warning.cell(),
                            path: source.path(),
                            message: StringVc::cell(format!(
                                "compilerOptions.paths[{key}] doesn't contains an array as \
                                 expected\n{key}: {value:#}",
                                key = serde_json::to_string(key)?,
                                value = value
                            )),
                        }
                        .cell()
                        .as_issue()
                        .emit()
                    }
                }
            }
        }
    }

    let import_map = if !all_paths.is_empty() {
        let mut import_map = ImportMap::empty();
        for (key, value) in all_paths {
            import_map.insert_alias(AliasPattern::parse(key), value.into());
        }
        Some(import_map.cell())
    } else {
        None
    };

    Ok(TsConfigResolveOptions {
        base_url,
        import_map,
    }
    .cell())
}

#[turbo_tasks::function]
pub async fn apply_tsconfig_resolve_options(
    resolve_options: ResolveOptionsVc,
    tsconfig_resolve_options: TsConfigResolveOptionsVc,
) -> Result<ResolveOptionsVc> {
    let tsconfig_resolve_options = tsconfig_resolve_options.await?;
    let mut resolve_options = resolve_options.await?.clone_value();
    if let Some(base_url) = tsconfig_resolve_options.base_url {
        // We want to resolve in `compilerOptions.baseUrl` first, then in other
        // locations as a fallback.
        resolve_options
            .modules
            .insert(0, ResolveModules::Path(base_url));
    }
    if let Some(tsconfig_import_map) = tsconfig_resolve_options.import_map {
        resolve_options.import_map = Some(
            resolve_options
                .import_map
                .map(|import_map| import_map.extend(tsconfig_import_map))
                .unwrap_or(tsconfig_import_map),
        );
    }
    Ok(resolve_options.cell())
}

#[turbo_tasks::function]
pub async fn type_resolve(origin: ResolveOriginVc, request: RequestVc) -> Result<ResolveResultVc> {
    let context_path = origin.origin_path().parent();
    let options = origin.resolve_options();
    let options = apply_typescript_types_options(options);
    let types_request = if let Request::Module { module: m, path: p } = &*request.await? {
        let m = if let Some(stripped) = m.strip_prefix('@') {
            stripped.replace('/', "__")
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
    let context_path = context_path.resolve().await?;
    let result = if let Some(types_request) = types_request {
        let result1 = resolve(context_path, request, options);
        if !*result1.is_unresolveable().await? {
            return Ok(result1);
        }
        resolve(context_path, types_request, options)
    } else {
        resolve(context_path, request, options)
    };
    let result = origin.context().process_resolve_result(result);
    handle_resolve_error(result, "type request", origin, request, options).await
}

#[turbo_tasks::value]
pub struct TypescriptTypesAssetReference {
    pub origin: ResolveOriginVc,
    pub request: RequestVc,
}

#[turbo_tasks::value_impl]
impl AssetReference for TypescriptTypesAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        type_resolve(self.origin, self.request)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for TypescriptTypesAssetReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "typescript types {}",
            self.request.to_string().await?,
        )))
    }
}

impl TypescriptTypesAssetReferenceVc {
    pub fn new(origin: ResolveOriginVc, request: RequestVc) -> Self {
        Self::cell(TypescriptTypesAssetReference { origin, request })
    }
}

#[turbo_tasks::function]
async fn apply_typescript_types_options(
    resolve_options: ResolveOptionsVc,
) -> Result<ResolveOptionsVc> {
    let mut resolve_options = resolve_options.await?.clone_value();
    resolve_options.extensions = vec![".tsx".to_string(), ".ts".to_string(), ".d.ts".to_string()];
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

#[turbo_tasks::value_impl]
impl Issue for TsConfigIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> IssueSeverityVc {
        self.severity
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<StringVc> {
        Ok(StringVc::cell(
            "An issue occurred while parsing a tsconfig.json file.".to_string(),
        ))
    }

    #[turbo_tasks::function]
    fn category(&self) -> StringVc {
        StringVc::cell("typescript".to_string())
    }

    #[turbo_tasks::function]
    fn context(&self) -> FileSystemPathVc {
        self.path
    }

    #[turbo_tasks::function]
    fn description(&self) -> StringVc {
        self.message
    }
}
