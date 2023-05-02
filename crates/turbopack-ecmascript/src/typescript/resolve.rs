use std::{collections::HashMap, fmt::Write};

use anyhow::Result;
use serde_json::Value as JsonValue;
use turbo_tasks::{
    primitives::{StringVc, StringsVc},
    Value, ValueToString, ValueToStringVc,
};
use turbo_tasks_fs::{
    FileContent, FileContentVc, FileJsonContent, FileJsonContentVc, FileSystemPathVc,
};
use turbopack_core::{
    asset::{Asset, AssetOptionVc, AssetVc},
    context::AssetContext,
    ident::AssetIdentVc,
    issue::{Issue, IssueSeverity, IssueSeverityVc, IssueVc, OptionIssueSourceVc},
    reference::{AssetReference, AssetReferenceVc},
    reference_type::{ReferenceType, TypeScriptReferenceSubType},
    resolve::{
        handle_resolve_error,
        node::node_cjs_resolve_options,
        options::{
            ConditionValue, ImportMap, ImportMapVc, ImportMapping, ResolveIntoPackage,
            ResolveModules, ResolveOptionsVc,
        },
        origin::{ResolveOrigin, ResolveOriginVc},
        parse::{Request, RequestVc},
        pattern::{Pattern, QueryMapVc},
        resolve, AliasPattern, ResolveResultVc,
    },
    source_asset::SourceAssetVc,
};

#[turbo_tasks::value(shared)]
pub struct TsConfigIssue {
    pub severity: IssueSeverityVc,
    pub source_ident: AssetIdentVc,
    pub message: StringVc,
}

#[turbo_tasks::function]
async fn json_only(resolve_options: ResolveOptionsVc) -> Result<ResolveOptionsVc> {
    let mut opts = resolve_options.await?.clone_value();
    opts.extensions = vec![".json".to_string()];
    Ok(opts.cell())
}

pub async fn read_tsconfigs(
    mut data: FileContentVc,
    mut tsconfig: AssetVc,
    resolve_options: ResolveOptionsVc,
) -> Result<Vec<(FileJsonContentVc, AssetVc)>> {
    let mut configs = Vec::new();
    let resolve_options = json_only(resolve_options);
    loop {
        let parsed_data = data.parse_json_with_comments();
        match &*parsed_data.await? {
            FileJsonContent::Unparseable(e) => {
                let mut message = "tsconfig is not parseable: invalid JSON: ".to_string();
                if let FileContent::Content(content) = &*data.await? {
                    let text = content.content().to_str()?;
                    e.write_with_content(&mut message, text.as_ref())?;
                } else {
                    write!(message, "{}", e)?;
                }
                TsConfigIssue {
                    severity: IssueSeverity::Error.into(),
                    source_ident: tsconfig.ident(),
                    message: StringVc::cell(message),
                }
                .cell()
                .as_issue()
                .emit();
            }
            FileJsonContent::NotFound => {
                TsConfigIssue {
                    severity: IssueSeverity::Error.into(),
                    source_ident: tsconfig.ident(),
                    message: StringVc::cell("tsconfig not found".into()),
                }
                .cell()
                .as_issue()
                .emit();
            }
            FileJsonContent::Content(json) => {
                configs.push((parsed_data, tsconfig));
                if let Some(extends) = json["extends"].as_str() {
                    let resolved = resolve_extends(tsconfig, extends, resolve_options).await?;
                    if let Some(asset) = &*resolved.await? {
                        data = asset.content().file_content();
                        tsconfig = *asset;
                        continue;
                    } else {
                        TsConfigIssue {
                            severity: IssueSeverity::Error.into(),
                            source_ident: tsconfig.ident(),
                            message: StringVc::cell(
                                "extends doesn't resolve correctly".to_string(),
                            ),
                        }
                        .cell()
                        .as_issue()
                        .emit();
                    }
                }
            }
        }
        break;
    }
    Ok(configs)
}

/// Resolves tsconfig files according to TS's implementation:
/// https://github.com/microsoft/TypeScript/blob/611a912d/src/compiler/commandLineParser.ts#L3294-L3326
async fn resolve_extends(
    tsconfig: AssetVc,
    extends: &str,
    resolve_options: ResolveOptionsVc,
) -> Result<AssetOptionVc> {
    let context = tsconfig.ident().path().parent();
    let request = RequestVc::parse_string(extends.to_string());

    // TS's resolution is weird, and has special behavior for different import
    // types. There might be multiple alternatives like
    // "some/path/node_modules/xyz/abc.json" and "some/node_modules/xyz/abc.json".
    // We only want to use the first one.
    match &*request.await? {
        // TS has special behavior for "rooted" paths (absolute paths):
        // https://github.com/microsoft/TypeScript/blob/611a912d/src/compiler/commandLineParser.ts#L3303-L3313
        Request::Windows { path: Pattern::Constant(path) } |
        // Server relative is treated as absolute
        Request::ServerRelative { path: Pattern::Constant(path) } => {
            resolve_extends_rooted_or_relative(context, request, resolve_options, path).await
        }

        // TS has special behavior for (explicitly) './' and '../', but not '.' nor '..':
        // https://github.com/microsoft/TypeScript/blob/611a912d/src/compiler/commandLineParser.ts#L3303-L3313
        Request::Relative {
            path: Pattern::Constant(path),
            ..
        } if path.starts_with("./") || path.starts_with("../") => {
            resolve_extends_rooted_or_relative(context, request, resolve_options, path).await
        }

        // An empty extends is treated as "./tsconfig"
        Request::Empty => {
            let request = RequestVc::parse_string("./tsconfig".to_string());
            Ok(resolve(context, request, resolve_options).first_asset())
        }

        // All other types are treated as module imports, and potentially joined with
        // "tsconfig.json". This includes "relative" imports like '.' and '..'.
        _ => {
            let mut result = resolve(context, request, resolve_options).first_asset();
            if result.await?.is_none() {
                let request = RequestVc::parse_string(format!("{extends}/tsconfig"));
                result = resolve(context, request, resolve_options).first_asset();
            }
            Ok(result)
        }
    }
}

async fn resolve_extends_rooted_or_relative(
    context: FileSystemPathVc,
    request: RequestVc,
    resolve_options: ResolveOptionsVc,
    path: &str,
) -> Result<AssetOptionVc> {
    let mut result = resolve(context, request, resolve_options).first_asset();

    // If the file doesn't end with ".json" and we can't find the file, then we have
    // to try again with it.
    // https://github.com/microsoft/TypeScript/blob/611a912d/src/compiler/commandLineParser.ts#L3305
    if !path.ends_with(".json") && result.await?.is_none() {
        let request = RequestVc::parse_string(format!("{path}.json"));
        result = resolve(context, request, resolve_options).first_asset();
    }
    Ok(result)
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
) -> Result<TsConfigResolveOptionsVc> {
    let configs = read_tsconfigs(
        tsconfig.read(),
        SourceAssetVc::new(tsconfig).into(),
        node_cjs_resolve_options(tsconfig.root()),
    )
    .await?;

    if configs.is_empty() {
        return Ok(Default::default());
    }

    let base_url = if let Some(base_url) = read_from_tsconfigs(&configs, |json, source| {
        json["compilerOptions"]["baseUrl"]
            .as_str()
            .map(|base_url| source.ident().path().parent().try_join(base_url))
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
                let mut context = source.ident().path().parent();
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
                            source_ident: source.ident(),
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
pub fn tsconfig() -> StringsVc {
    StringsVc::cell(vec![
        "tsconfig.json".to_string(),
        "jsconfig.json".to_string(),
    ])
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
    let ty = Value::new(ReferenceType::TypeScript(
        TypeScriptReferenceSubType::Undefined,
    ));
    let context_path = origin.origin_path().parent();
    let options = origin.resolve_options(ty.clone());
    let options = apply_typescript_types_options(options);
    let types_request = if let Request::Module {
        module: m,
        path: p,
        query: _,
    } = &*request.await?
    {
        let m = if let Some(stripped) = m.strip_prefix('@') {
            stripped.replace('/', "__")
        } else {
            m.clone()
        };
        Some(RequestVc::module(
            format!("@types/{m}"),
            Value::new(p.clone()),
            QueryMapVc::none(),
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
    let result = origin.context().process_resolve_result(result, ty.clone());
    handle_resolve_error(
        result,
        ty,
        origin.origin_path(),
        request,
        options,
        OptionIssueSourceVc::none(),
        IssueSeverity::Error.cell(),
    )
    .await
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
        self.source_ident.path()
    }

    #[turbo_tasks::function]
    fn description(&self) -> StringVc {
        self.message
    }
}
