use std::{collections::HashMap, fmt::Write, mem::take};

use anyhow::Result;
use serde_json::Value as JsonValue;
use turbo_rcstr::RcStr;
use turbo_tasks::{fxindexset, ResolvedVc, Value, ValueDefault, Vc};
use turbo_tasks_fs::{FileContent, FileJsonContent, FileSystemPath};
use turbopack_core::{
    asset::Asset,
    context::AssetContext,
    file_source::FileSource,
    ident::AssetIdent,
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString},
    reference_type::{ReferenceType, TypeScriptReferenceSubType},
    resolve::{
        handle_resolve_error,
        node::node_cjs_resolve_options,
        options::{
            ConditionValue, ImportMap, ImportMapping, ResolveIntoPackage, ResolveModules,
            ResolveOptions,
        },
        origin::{ResolveOrigin, ResolveOriginExt},
        parse::Request,
        pattern::Pattern,
        resolve, AliasPattern, ModuleResolveResult,
    },
    source::{OptionSource, Source},
};

use crate::ecmascript::get_condition_maps;

#[turbo_tasks::value(shared)]
pub struct TsConfigIssue {
    pub severity: ResolvedVc<IssueSeverity>,
    pub source_ident: ResolvedVc<AssetIdent>,
    pub message: RcStr,
}

#[turbo_tasks::function]
async fn json_only(resolve_options: Vc<ResolveOptions>) -> Result<Vc<ResolveOptions>> {
    let mut opts = resolve_options.owned().await?;
    opts.extensions = vec![".json".into()];
    Ok(opts.cell())
}

type TsConfig = (Vc<FileJsonContent>, ResolvedVc<Box<dyn Source>>);

#[tracing::instrument(skip_all)]
pub async fn read_tsconfigs(
    mut data: Vc<FileContent>,
    mut tsconfig: ResolvedVc<Box<dyn Source>>,
    resolve_options: Vc<ResolveOptions>,
) -> Result<Vec<TsConfig>> {
    let mut configs = Vec::new();
    let resolve_options = json_only(resolve_options);
    loop {
        // tsc ignores empty config files.
        if let FileContent::Content(file) = &*data.await? {
            if file.content().is_empty() {
                break;
            }
        }

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
                    severity: IssueSeverity::Error.resolved_cell(),
                    source_ident: tsconfig.ident().to_resolved().await?,
                    message: message.into(),
                }
                .resolved_cell()
                .emit();
            }
            FileJsonContent::NotFound => {
                TsConfigIssue {
                    severity: IssueSeverity::Error.resolved_cell(),
                    source_ident: tsconfig.ident().to_resolved().await?,
                    message: "tsconfig not found".into(),
                }
                .resolved_cell()
                .emit();
            }
            FileJsonContent::Content(json) => {
                configs.push((parsed_data, tsconfig));
                if let Some(extends) = json["extends"].as_str() {
                    let resolved = resolve_extends(*tsconfig, extends, resolve_options).await?;
                    if let Some(source) = *resolved.await? {
                        data = source.content().file_content();
                        tsconfig = source;
                        continue;
                    } else {
                        TsConfigIssue {
                            severity: IssueSeverity::Error.resolved_cell(),
                            source_ident: tsconfig.ident().to_resolved().await?,
                            message: format!("extends: \"{}\" doesn't resolve correctly", extends)
                                .into(),
                        }
                        .resolved_cell()
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
#[tracing::instrument(skip_all)]
async fn resolve_extends(
    tsconfig: Vc<Box<dyn Source>>,
    extends: &str,
    resolve_options: Vc<ResolveOptions>,
) -> Result<Vc<OptionSource>> {
    let parent_dir = tsconfig.ident().path().parent();
    let request = Request::parse_string(extends.into());

    // TS's resolution is weird, and has special behavior for different import
    // types. There might be multiple alternatives like
    // "some/path/node_modules/xyz/abc.json" and "some/node_modules/xyz/abc.json".
    // We only want to use the first one.
    match &*request.await? {
        // TS has special behavior for "rooted" paths (absolute paths):
        // https://github.com/microsoft/TypeScript/blob/611a912d/src/compiler/commandLineParser.ts#L3303-L3313
        Request::Windows { path: Pattern::Constant(path), .. } |
        // Server relative is treated as absolute
        Request::ServerRelative { path: Pattern::Constant(path), .. } => {
            resolve_extends_rooted_or_relative(parent_dir, request, resolve_options, path).await
        }

        // TS has special behavior for (explicitly) './' and '../', but not '.' nor '..':
        // https://github.com/microsoft/TypeScript/blob/611a912d/src/compiler/commandLineParser.ts#L3303-L3313
        Request::Relative {
            path: Pattern::Constant(path),
            ..
        } if path.starts_with("./") || path.starts_with("../") => {
            resolve_extends_rooted_or_relative(parent_dir, request, resolve_options, path).await
        }

        // An empty extends is treated as "./tsconfig"
        Request::Empty => {
            let request = Request::parse_string("./tsconfig".into());
            Ok(resolve(parent_dir,
                Value::new(ReferenceType::TypeScript(TypeScriptReferenceSubType::Undefined)), request, resolve_options).first_source())
        }

        // All other types are treated as module imports, and potentially joined with
        // "tsconfig.json". This includes "relative" imports like '.' and '..'.
        _ => {
            let mut result = resolve(parent_dir, Value::new(ReferenceType::TypeScript(TypeScriptReferenceSubType::Undefined)), request, resolve_options).first_source();
            if result.await?.is_none() {
                let request = Request::parse_string(format!("{extends}/tsconfig").into());
                result = resolve(parent_dir, Value::new(ReferenceType::TypeScript(TypeScriptReferenceSubType::Undefined)), request, resolve_options).first_source();
            }
            Ok(result)
        }
    }
}

async fn resolve_extends_rooted_or_relative(
    lookup_path: Vc<FileSystemPath>,
    request: Vc<Request>,
    resolve_options: Vc<ResolveOptions>,
    path: &str,
) -> Result<Vc<OptionSource>> {
    let mut result = resolve(
        lookup_path,
        Value::new(ReferenceType::TypeScript(
            TypeScriptReferenceSubType::Undefined,
        )),
        request,
        resolve_options,
    )
    .first_source();

    // If the file doesn't end with ".json" and we can't find the file, then we have
    // to try again with it.
    // https://github.com/microsoft/TypeScript/blob/611a912d/src/compiler/commandLineParser.ts#L3305
    if !path.ends_with(".json") && result.await?.is_none() {
        let request = Request::parse_string(format!("{path}.json").into());
        result = resolve(
            lookup_path,
            Value::new(ReferenceType::TypeScript(
                TypeScriptReferenceSubType::Undefined,
            )),
            request,
            resolve_options,
        )
        .first_source();
    }
    Ok(result)
}

pub async fn read_from_tsconfigs<T>(
    configs: &[TsConfig],
    accessor: impl Fn(&JsonValue, ResolvedVc<Box<dyn Source>>) -> Option<T>,
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
    base_url: Option<ResolvedVc<FileSystemPath>>,
    import_map: Option<ResolvedVc<ImportMap>>,
    is_module_resolution_nodenext: bool,
}

#[turbo_tasks::value_impl]
impl ValueDefault for TsConfigResolveOptions {
    #[turbo_tasks::function]
    fn value_default() -> Vc<Self> {
        Self::default().cell()
    }
}

/// Returns the resolve options
#[turbo_tasks::function]
pub async fn tsconfig_resolve_options(
    tsconfig: Vc<FileSystemPath>,
) -> Result<Vc<TsConfigResolveOptions>> {
    let configs = read_tsconfigs(
        tsconfig.read(),
        ResolvedVc::upcast(FileSource::new(tsconfig).to_resolved().await?),
        node_cjs_resolve_options(tsconfig.root()),
    )
    .await?;

    if configs.is_empty() {
        return Ok(Default::default());
    }

    let base_url = if let Some(base_url) = read_from_tsconfigs(&configs, |json, source| {
        json["compilerOptions"]["baseUrl"]
            .as_str()
            .map(|base_url| source.ident().path().parent().try_join(base_url.into()))
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
                let mut context_dir = source.ident().path().parent();
                if let Some(base_url) = json["compilerOptions"]["baseUrl"].as_str() {
                    if let Some(new_context) = *context_dir.try_join(base_url.into()).await? {
                        context_dir = *new_context;
                    }
                };
                let context_dir = context_dir.to_resolved().await?;
                for (key, value) in paths.iter() {
                    if let JsonValue::Array(vec) = value {
                        let entries = vec
                            .iter()
                            .filter_map(|entry| {
                                let entry = entry.as_str();

                                if entry.map(|e| e.ends_with(".d.ts")).unwrap_or_default() {
                                    return None;
                                }

                                entry.map(|s| {
                                    // tsconfig paths are always relative requests
                                    if s.starts_with("./") || s.starts_with("../") {
                                        s.into()
                                    } else {
                                        format!("./{s}").into()
                                    }
                                })
                            })
                            .collect();
                        all_paths.insert(
                            key.to_string(),
                            ImportMapping::primary_alternatives(entries, Some(context_dir)),
                        );
                    } else {
                        TsConfigIssue {
                            severity: IssueSeverity::Warning.resolved_cell(),
                            source_ident: source.ident().to_resolved().await?,
                            message: format!(
                                "compilerOptions.paths[{key}] doesn't contains an array as \
                                 expected\n{key}: {value:#}",
                                key = serde_json::to_string(key)?,
                                value = value
                            )
                            .into(),
                        }
                        .resolved_cell()
                        .emit()
                    }
                }
            }
        }
    }

    let import_map = if !all_paths.is_empty() {
        let mut import_map = ImportMap::empty();
        for (key, value) in all_paths {
            import_map.insert_alias(AliasPattern::parse(key), value.resolved_cell());
        }
        Some(import_map.resolved_cell())
    } else {
        None
    };

    let is_module_resolution_nodenext = read_from_tsconfigs(&configs, |json, _| {
        json["compilerOptions"]["moduleResolution"]
            .as_str()
            .map(|module_resolution| module_resolution.eq_ignore_ascii_case("nodenext"))
    })
    .await?
    .unwrap_or_default();

    Ok(TsConfigResolveOptions {
        base_url,
        import_map,
        is_module_resolution_nodenext,
    }
    .cell())
}

#[turbo_tasks::function]
pub fn tsconfig() -> Vc<Vec<RcStr>> {
    Vc::cell(vec!["tsconfig.json".into(), "jsconfig.json".into()])
}

#[turbo_tasks::function]
pub async fn apply_tsconfig_resolve_options(
    resolve_options: Vc<ResolveOptions>,
    tsconfig_resolve_options: Vc<TsConfigResolveOptions>,
) -> Result<Vc<ResolveOptions>> {
    let tsconfig_resolve_options = tsconfig_resolve_options.await?;
    let mut resolve_options = resolve_options.owned().await?;
    if let Some(base_url) = tsconfig_resolve_options.base_url {
        // We want to resolve in `compilerOptions.baseUrl` first, then in other
        // locations as a fallback.
        resolve_options.modules.insert(
            0,
            ResolveModules::Path {
                dir: base_url,
                // tsconfig basepath doesn't apply to json requests
                excluded_extensions: ResolvedVc::cell(fxindexset![".json".into()]),
            },
        );
    }
    if let Some(tsconfig_import_map) = tsconfig_resolve_options.import_map {
        resolve_options.import_map = Some(
            resolve_options
                .import_map
                .map(|import_map| import_map.extend(*tsconfig_import_map))
                .unwrap_or(*tsconfig_import_map)
                .to_resolved()
                .await?,
        );
    }
    resolve_options.enable_typescript_with_output_extension =
        tsconfig_resolve_options.is_module_resolution_nodenext;

    Ok(resolve_options.cell())
}

#[turbo_tasks::function]
pub async fn type_resolve(
    origin: Vc<Box<dyn ResolveOrigin>>,
    request: Vc<Request>,
) -> Result<Vc<ModuleResolveResult>> {
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
        fragment: _,
    } = &*request.await?
    {
        let m = if let Some(stripped) = m.strip_prefix('@') {
            stripped.replace('/', "__").into()
        } else {
            m.clone()
        };
        Some(Request::module(
            format!("@types/{m}").into(),
            Value::new(p.clone()),
            Vc::<RcStr>::default(),
            Vc::<RcStr>::default(),
        ))
    } else {
        None
    };
    let context_path = context_path.resolve().await?;
    let result = if let Some(types_request) = types_request {
        let result1 = resolve(
            context_path,
            Value::new(ReferenceType::TypeScript(
                TypeScriptReferenceSubType::Undefined,
            )),
            request,
            options,
        );
        if !*result1.is_unresolvable().await? {
            result1
        } else {
            resolve(
                context_path,
                Value::new(ReferenceType::TypeScript(
                    TypeScriptReferenceSubType::Undefined,
                )),
                types_request,
                options,
            )
        }
    } else {
        resolve(
            context_path,
            Value::new(ReferenceType::TypeScript(
                TypeScriptReferenceSubType::Undefined,
            )),
            request,
            options,
        )
    };
    let result = as_typings_result(
        origin
            .asset_context()
            .process_resolve_result(result, ty.clone()),
    );
    handle_resolve_error(
        result,
        ty,
        origin.origin_path(),
        request,
        options,
        false,
        None,
    )
    .await
}

#[turbo_tasks::function]
pub async fn as_typings_result(result: Vc<ModuleResolveResult>) -> Result<Vc<ModuleResolveResult>> {
    let mut result = result.owned().await?;
    result.primary = take(&mut result.primary)
        .into_iter()
        .map(|(mut k, v)| {
            k.conditions.insert("types".to_string(), true);
            (k, v)
        })
        .collect();
    Ok(result.cell())
}

#[turbo_tasks::function]
async fn apply_typescript_types_options(
    resolve_options: Vc<ResolveOptions>,
) -> Result<Vc<ResolveOptions>> {
    let mut resolve_options = resolve_options.owned().await?;
    resolve_options.extensions = vec![".tsx".into(), ".ts".into(), ".d.ts".into()];
    resolve_options.into_package = resolve_options
        .into_package
        .drain(..)
        .filter_map(|into| {
            if let ResolveIntoPackage::ExportsField {
                mut conditions,
                unspecified_conditions,
            } = into
            {
                conditions.insert("types".into(), ConditionValue::Set);
                Some(ResolveIntoPackage::ExportsField {
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
        .push(ResolveIntoPackage::MainField {
            field: "types".into(),
        });
    for conditions in get_condition_maps(&mut resolve_options) {
        conditions.insert("types".into(), ConditionValue::Set);
    }
    Ok(resolve_options.into())
}

#[turbo_tasks::value_impl]
impl Issue for TsConfigIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        *self.severity
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text("An issue occurred while parsing a tsconfig.json file.".into()).cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.source_ident.path()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(
            StyledString::Text(self.message.clone()).resolved_cell(),
        ))
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Analysis.cell()
    }
}
