use std::mem::take;

use anyhow::Result;
use async_trait::async_trait;
use serde_json::Value as JsonValue;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{FxIndexMap, ResolvedVc, ValueDefault, Vc, fxindexset};
use turbo_tasks_fs::{FileContent, FileJsonContent, FileSystemPath, FileSystemPathOption};
use turbopack_core::{
    asset::Asset,
    context::AssetContext,
    file_source::FileSource,
    issue::{Issue, IssueExt, IssueSeverity, IssueSource, IssueStage, StyledString},
    reference_type::{ReferenceType, TypeScriptReferenceSubType},
    resolve::{
        AliasPattern, ModuleResolveResult, RequestKey, ResolveErrorMode,
        error::handle_resolve_error,
        node::node_cjs_resolve_options,
        options::{
            ConditionValue, ImportMap, ImportMapping, ResolveIntoPackage, ResolveModules,
            ResolveOptions,
        },
        origin::ResolveOrigin,
        parse::Request,
        pattern::Pattern,
        resolve,
        tsconfig_provenance::{
            NativeTsConfigProbe, NativeTsConfigProbeScope, NativeTsConfigReadStatus,
        },
    },
    source::Source,
};

use crate::ecmascript::get_condition_maps;

#[turbo_tasks::value(shared)]
struct TsConfigIssue {
    severity: IssueSeverity,
    source: IssueSource,
    message: RcStr,
}

#[turbo_tasks::function]
async fn json_only(resolve_options: Vc<ResolveOptions>) -> Result<Vc<ResolveOptions>> {
    let mut opts = resolve_options.owned().await?;
    opts.extensions = vec![rcstr!(".json")];
    Ok(opts.cell())
}

type TsConfig = (Vc<FileJsonContent>, ResolvedVc<Box<dyn Source>>);

#[tracing::instrument(skip_all)]
pub async fn read_tsconfigs(
    data: Vc<FileContent>,
    tsconfig: ResolvedVc<Box<dyn Source>>,
    resolve_options: Vc<ResolveOptions>,
) -> Result<Vec<TsConfig>> {
    read_tsconfigs_impl(data, tsconfig, resolve_options, None).await
}

/// Actual native parser/resolver with optional typed observations. Consumers use its result.
pub async fn read_tsconfigs_with_native_provenance(
    data: Vc<FileContent>,
    tsconfig: ResolvedVc<Box<dyn Source>>,
    resolve_options: Vc<ResolveOptions>,
    native_probe: NativeTsConfigProbeScope,
) -> Result<Vec<TsConfig>> {
    read_tsconfigs_impl(data, tsconfig, resolve_options, Some(native_probe)).await
}

async fn record_config_read(
    scope: &NativeTsConfigProbeScope,
    source: ResolvedVc<Box<dyn Source>>,
    data: Vc<FileContent>,
    status: NativeTsConfigReadStatus,
) -> Result<()> {
    let path = source.ident().await?.path.clone();
    let identity = path.realpath_with_links().await?;
    let observed = *path.get_type().await?;
    scope.record(NativeTsConfigProbe::ConfigRead {
        source,
        path,
        content: data.to_resolved().await?,
        status,
        real_path: identity.path_result.clone(),
        symlinks: identity.symlinks.to_vec(),
        observed,
    });
    Ok(())
}

async fn read_tsconfigs_impl(
    mut data: Vc<FileContent>,
    mut tsconfig: ResolvedVc<Box<dyn Source>>,
    resolve_options: Vc<ResolveOptions>,
    native_probe: Option<NativeTsConfigProbeScope>,
) -> Result<Vec<TsConfig>> {
    let mut configs = Vec::new();
    let resolve_options = json_only(resolve_options);
    let mut native_seen = std::collections::HashSet::new();
    let mut chain_index = 0_u32;
    loop {
        let native_read = if let Some(scope) = &native_probe {
            let path = tsconfig.ident().await?.path.clone();
            if !native_seen.insert(path.clone()) {
                scope.record(NativeTsConfigProbe::Incomplete {
                    path,
                    reason: "cyclic native config inheritance".into(),
                });
                anyhow::bail!(
                    "Native TypeScript config provenance cannot certify cyclic inheritance"
                );
            }
            let mut context = scope.context.owned().await?;
            context.chain_index = chain_index;
            context.lookup_path = path.parent();
            Some(NativeTsConfigProbeScope {
                context: context.resolved_cell(),
                order: scope.order.clone(),
            })
        } else {
            None
        };
        // tsc ignores empty config files.
        if let FileContent::Content(file) = &*data.await?
            && file.content().is_empty()
        {
            if let Some(scope) = &native_read {
                record_config_read(scope, tsconfig, data, NativeTsConfigReadStatus::Empty).await?;
            }
            break;
        }

        let parsed_data = data.parse_json_with_comments();
        match &*parsed_data.await? {
            FileJsonContent::Unparsable(e) => {
                if let Some(scope) = &native_read {
                    record_config_read(scope, tsconfig, data, NativeTsConfigReadStatus::Invalid)
                        .await?;
                }
                let message = format!("tsconfig is not parseable: invalid JSON: {}", e.message);
                let source = IssueSource::from_unparsable_json(tsconfig, e);
                TsConfigIssue {
                    severity: IssueSeverity::Error,
                    source,
                    message: message.into(),
                }
                .resolved_cell()
                .emit();
            }
            FileJsonContent::NotFound => {
                if let Some(scope) = &native_read {
                    record_config_read(scope, tsconfig, data, NativeTsConfigReadStatus::Missing)
                        .await?;
                }
                TsConfigIssue {
                    severity: IssueSeverity::Error,
                    source: IssueSource::from_source_only(tsconfig),
                    message: rcstr!("tsconfig not found"),
                }
                .resolved_cell()
                .emit();
            }
            FileJsonContent::Content(json) => {
                if let Some(scope) = &native_read {
                    record_config_read(scope, tsconfig, data, NativeTsConfigReadStatus::Parsed)
                        .await?;
                    if json
                        .get("extends")
                        .is_some_and(|value| !value.is_null() && !value.is_string())
                    {
                        scope.record(NativeTsConfigProbe::Incomplete {
                            path: tsconfig.ident().await?.path.clone(),
                            reason: "non-string native config extends".into(),
                        });
                    }
                }
                configs.push((parsed_data, tsconfig));
                if let Some(extends) = json["extends"].as_str() {
                    let mut observed_options = resolve_options;
                    let native_extends = if let Some(scope) = &native_read {
                        let mut context = scope.context.owned().await?;
                        context.request = extends.into();
                        let scope = NativeTsConfigProbeScope {
                            context: context.resolved_cell(),
                            order: scope.order.clone(),
                        };
                        let mut options = resolve_options.owned().await?;
                        options.native_tsconfig_probe = Some(scope.clone());
                        observed_options = options.cell();
                        Some(scope)
                    } else {
                        None
                    };
                    let resolved = resolve_extends(
                        *tsconfig,
                        extends,
                        observed_options,
                        native_extends.as_ref(),
                    )
                    .await?;
                    if let Some(source) = resolved {
                        data = source.content().file_content();
                        tsconfig = source;
                        if native_probe.is_some() {
                            chain_index = chain_index
                                .checked_add(1)
                                .ok_or_else(|| anyhow::anyhow!("native config chain overflow"))?;
                        }
                        continue;
                    } else {
                        TsConfigIssue {
                            severity: IssueSeverity::Error,
                            // TODO: this should point at the `extends` property
                            source: IssueSource::from_source_only(tsconfig),
                            message: format!("extends: \"{extends}\" doesn't resolve correctly")
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
    native_probe: Option<&NativeTsConfigProbeScope>,
) -> Result<Option<ResolvedVc<Box<dyn Source>>>> {
    let parent_dir = tsconfig.ident().await?.path.parent();
    let request = Request::parse_string(extends.into());

    // TS's resolution is weird, and has special behavior for different import
    // types. There might be multiple alternatives like
    // "some/path/node_modules/xyz/abc.json" and "some/node_modules/xyz/abc.json".
    // We only want to use the first one.
    let request_value = request.await?;
    if let Some(scope) = native_probe {
        let supported = match &*request_value {
            Request::Relative {
                path: Pattern::Constant(path),
                query,
                fragment,
                ..
            } => {
                (path.starts_with("./") || path.starts_with("../"))
                    && path.ends_with(".json")
                    && query.is_empty()
                    && fragment.is_empty()
            }
            Request::ServerRelative {
                path: Pattern::Constant(path),
                query,
                fragment,
                ..
            } => path.ends_with(".json") && query.is_empty() && fragment.is_empty(),
            _ => false,
        };
        if !supported {
            scope.record(NativeTsConfigProbe::Incomplete {
                path: tsconfig.ident().await?.path.clone(),
                reason: "unsupported native config extends request".into(),
            });
        }
    }
    match &*request_value {
        // TS has special behavior for "rooted" paths (absolute paths):
        // https://github.com/microsoft/TypeScript/blob/611a912d/src/compiler/commandLineParser.ts#L3303-L3313
        Request::Windows { path: Pattern::Constant(path), .. } |
        // Server relative is treated as absolute
        Request::ServerRelative { path: Pattern::Constant(path), .. } => {
            resolve_extends_rooted_or_relative(parent_dir, request, resolve_options, path, extends.into(), native_probe).await
        }

        // TS has special behavior for (explicitly) './' and '../', but not '.' nor '..':
        // https://github.com/microsoft/TypeScript/blob/611a912d/src/compiler/commandLineParser.ts#L3303-L3313
        Request::Relative {
            path: Pattern::Constant(path),
            ..
        } if path.starts_with("./") || path.starts_with("../") => {
            resolve_extends_rooted_or_relative(parent_dir, request, resolve_options, path, extends.into(), native_probe).await
        }

        // An empty extends is treated as "./tsconfig"
        Request::Empty => {
            let request = Request::parse_string(rcstr!("./tsconfig"));
            resolve_extends_attempt(parent_dir, request, resolve_options, rcstr!("./tsconfig"), native_probe, 0).await
        }

        // All other types are treated as module imports, and potentially joined with
        // "tsconfig.json". This includes "relative" imports like '.' and '..'.
        _ => {
            let result = resolve_extends_attempt(parent_dir.clone(), request, resolve_options, extends.into(), native_probe, 0).await?;
            if let Some(source) = result {
                return Ok(Some(source));
            }
            let request = Request::parse_string(format!("{extends}/tsconfig").into());
            resolve_extends_attempt(parent_dir, request, resolve_options, format!("{extends}/tsconfig").into(), native_probe, 1).await
        }
    }
}

async fn resolve_extends_rooted_or_relative(
    lookup_path: FileSystemPath,
    request: Vc<Request>,
    resolve_options: Vc<ResolveOptions>,
    path: &str,
    original_request: RcStr,
    native_probe: Option<&NativeTsConfigProbeScope>,
) -> Result<Option<ResolvedVc<Box<dyn Source>>>> {
    let mut result = resolve_extends_attempt(
        lookup_path.clone(),
        request,
        resolve_options,
        original_request,
        native_probe,
        0,
    )
    .await?;

    // If the file doesn't end with ".json" and we can't find the file, then we have
    // to try again with it.
    // https://github.com/microsoft/TypeScript/blob/611a912d/src/compiler/commandLineParser.ts#L3305
    if !path.ends_with(".json") && result.is_none() {
        let request = Request::parse_string(format!("{path}.json").into());
        result = resolve_extends_attempt(
            lookup_path.clone(),
            request,
            resolve_options,
            format!("{path}.json").into(),
            native_probe,
            1,
        )
        .await?;
    }
    Ok(result)
}

async fn resolve_extends_attempt(
    lookup_path: FileSystemPath,
    request: Vc<Request>,
    resolve_options: Vc<ResolveOptions>,
    raw_request: RcStr,
    native_probe: Option<&NativeTsConfigProbeScope>,
    attempt_index: u32,
) -> Result<Option<ResolvedVc<Box<dyn Source>>>> {
    let native_probe = if let Some(scope) = native_probe {
        let mut context = scope.context.owned().await?;
        context.attempt_index = attempt_index;
        context.request = raw_request.clone();
        Some(NativeTsConfigProbeScope {
            context: context.resolved_cell(),
            order: scope.order.clone(),
        })
    } else {
        None
    };
    let resolve_options = if let Some(scope) = &native_probe {
        let mut options = resolve_options.owned().await?;
        options.native_tsconfig_probe = Some(scope.clone());
        options.cell()
    } else {
        resolve_options
    };
    let result = resolve(
        lookup_path.clone(),
        ReferenceType::TypeScript(TypeScriptReferenceSubType::Undefined),
        request,
        resolve_options,
    );
    if let Some(scope) = &native_probe {
        let result = result.to_resolved().await?;
        scope.record(NativeTsConfigProbe::Extends {
            path: lookup_path,
            request: raw_request,
            result,
        });
        Ok(result.await?.first_source())
    } else {
        Ok(result.await?.first_source())
    }
}

pub async fn read_from_tsconfigs<T>(
    configs: &[TsConfig],
    accessor: impl Fn(&JsonValue, ResolvedVc<Box<dyn Source>>) -> Option<T>,
) -> Result<Option<T>> {
    for (config, source) in configs.iter() {
        if let FileJsonContent::Content(json) = &*config.await?
            && let Some(result) = accessor(json, *source)
        {
            return Ok(Some(result));
        }
    }
    Ok(None)
}

/// Resolve options specific to tsconfig.json.
#[turbo_tasks::value]
#[derive(Default)]
pub struct TsConfigResolveOptions {
    base_url: Option<FileSystemPath>,
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

#[turbo_tasks::function]
async fn try_join_base_url(
    source: ResolvedVc<Box<dyn Source>>,
    base_url: RcStr,
) -> Result<Vc<FileSystemPathOption>> {
    Ok(Vc::cell(
        source.ident().await?.path.parent().try_join(&base_url),
    ))
}

/// Returns the resolve options
#[turbo_tasks::function]
pub async fn tsconfig_resolve_options(
    tsconfig: FileSystemPath,
) -> Result<Vc<TsConfigResolveOptions>> {
    tsconfig_resolve_options_impl(tsconfig, None).await
}

#[turbo_tasks::function]
pub async fn tsconfig_resolve_options_with_native_provenance(
    tsconfig: FileSystemPath,
    native_probe: NativeTsConfigProbeScope,
) -> Result<Vc<TsConfigResolveOptions>> {
    tsconfig_resolve_options_impl(tsconfig, Some(native_probe)).await
}

async fn tsconfig_resolve_options_impl(
    tsconfig: FileSystemPath,
    native_probe: Option<NativeTsConfigProbeScope>,
) -> Result<Vc<TsConfigResolveOptions>> {
    let source = ResolvedVc::upcast(FileSource::new(tsconfig.clone()).to_resolved().await?);
    let configs = if let Some(scope) = native_probe {
        read_tsconfigs_with_native_provenance(
            tsconfig.read(),
            source,
            node_cjs_resolve_options(),
            scope,
        )
        .await?
    } else {
        read_tsconfigs(tsconfig.read(), source, node_cjs_resolve_options()).await?
    };

    if configs.is_empty() {
        return Ok(Default::default());
    }

    let base_url = if let Some(base_url) = read_from_tsconfigs(&configs, |json, source| {
        json["compilerOptions"]["baseUrl"]
            .as_str()
            .map(|base_url| try_join_base_url(*source, base_url.into()))
    })
    .await?
    {
        base_url.owned().await?
    } else {
        None
    };

    let mut all_paths = FxIndexMap::default();
    for (content, source) in configs.iter().rev() {
        if let FileJsonContent::Content(json) = &*content.await?
            && let JsonValue::Object(paths) = &json["compilerOptions"]["paths"]
        {
            let mut context_dir = source.ident().await?.path.parent();
            if let Some(base_url) = json["compilerOptions"]["baseUrl"].as_str()
                && let Some(new_context) = context_dir.try_join(base_url)
            {
                context_dir = new_context;
            };
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
                        RcStr::from(key.as_str()),
                        ImportMapping::primary_alternatives(entries, Some(context_dir.clone())),
                    );
                } else {
                    TsConfigIssue {
                        severity: IssueSeverity::Warning,
                        // TODO: this should point at the invalid key
                        source: IssueSource::from_source_only(*source),
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
    Vc::cell(vec![rcstr!("tsconfig.json"), rcstr!("jsconfig.json")])
}

#[turbo_tasks::function]
pub async fn apply_tsconfig_resolve_options(
    resolve_options: Vc<ResolveOptions>,
    tsconfig_resolve_options: Vc<TsConfigResolveOptions>,
) -> Result<Vc<ResolveOptions>> {
    let tsconfig_resolve_options = tsconfig_resolve_options.await?;
    let mut resolve_options = resolve_options.owned().await?;
    if let Some(base_url) = &tsconfig_resolve_options.base_url {
        // We want to resolve in `compilerOptions.baseUrl` first, then in other
        // locations as a fallback.
        resolve_options.modules.insert(
            0,
            ResolveModules::Path {
                dir: base_url.clone(),
                // tsconfig basepath doesn't apply to json requests
                excluded_extensions: ResolvedVc::cell(fxindexset![rcstr!(".json")]),
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
    let ty = ReferenceType::TypeScript(TypeScriptReferenceSubType::Undefined);
    let origin_ref = origin.into_trait_ref().await?;
    let context_path = origin_ref.origin_path().parent();
    let options = origin_ref.resolve_options();
    let options = apply_typescript_types_options(options);
    let types_request = if let Request::Module {
        module: m,
        path: p,
        query: _,
        fragment: _,
    } = &*request.await?
    {
        let mut m = if let Some(mut stripped) = m.strip_prefix("@")? {
            stripped.replace_constants(&|c| Some(Pattern::Constant(c.replace("/", "__").into())));
            stripped
        } else {
            m.clone()
        };
        m.push_front(rcstr!("@types/").into());
        Some(Request::module(
            m,
            p.clone(),
            RcStr::default(),
            RcStr::default(),
        ))
    } else {
        None
    };
    let result = if let Some(types_request) = types_request {
        let result1 = resolve(
            context_path.clone(),
            ReferenceType::TypeScript(TypeScriptReferenceSubType::Undefined),
            request,
            options,
        );
        if !result1.await?.is_unresolvable() {
            result1
        } else {
            resolve(
                context_path,
                ReferenceType::TypeScript(TypeScriptReferenceSubType::Undefined),
                types_request,
                options,
            )
        }
    } else {
        resolve(
            context_path,
            ReferenceType::TypeScript(TypeScriptReferenceSubType::Undefined),
            request,
            options,
        )
    };
    let result = as_typings_result(
        origin_ref
            .asset_context()
            .process_resolve_result(result, ty.clone()),
    );
    handle_resolve_error(
        result,
        ty,
        origin_ref.origin_path(),
        request,
        options,
        ResolveErrorMode::Error,
        None,
    )
    .await
}

#[turbo_tasks::function]
pub async fn as_typings_result(result: Vc<ModuleResolveResult>) -> Result<Vc<ModuleResolveResult>> {
    let mut result = result.owned().await?;
    result.primary = IntoIterator::into_iter(take(&mut result.primary))
        .map(|(k, v)| {
            (
                RequestKey {
                    request: k.request.clone(),
                    conditions: k.conditions.extend([(rcstr!("types"), true)]),
                },
                v,
            )
        })
        .collect();
    Ok(result.cell())
}

#[turbo_tasks::function]
async fn apply_typescript_types_options(
    resolve_options: Vc<ResolveOptions>,
) -> Result<Vc<ResolveOptions>> {
    let mut resolve_options = resolve_options.owned().await?;
    resolve_options.extensions = vec![rcstr!(".tsx"), rcstr!(".ts"), rcstr!(".d.ts")];
    resolve_options.into_package = resolve_options
        .into_package
        .drain(..)
        .filter_map(|into| {
            if let ResolveIntoPackage::ExportsField {
                mut conditions,
                unspecified_conditions,
            } = into
            {
                conditions.insert(rcstr!("types"), ConditionValue::Set);
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
            field: rcstr!("types"),
        });
    for conditions in get_condition_maps(&mut resolve_options) {
        conditions.insert(rcstr!("types"), ConditionValue::Set);
    }
    Ok(resolve_options.cell())
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for TsConfigIssue {
    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    async fn title(&self) -> anyhow::Result<StyledString> {
        Ok(StyledString::Text(rcstr!(
            "An issue occurred while parsing a tsconfig.json file."
        )))
    }

    async fn file_path(&self) -> anyhow::Result<FileSystemPath> {
        self.source.file_path().await
    }

    async fn description(&self) -> anyhow::Result<Option<StyledString>> {
        Ok(Some(StyledString::Text(self.message.clone())))
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Analysis
    }

    fn source(&self) -> Option<IssueSource> {
        Some(self.source)
    }
}

#[cfg(test)]
mod native_provenance_tests {
    use anyhow::Result;
    use turbo_rcstr::{RcStr, rcstr};
    use turbo_tasks::{CollectiblesSource, OperationVc, ResolvedVc, Vc};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend};
    use turbo_tasks_fs::{DiskFileSystem, FileJsonContent, FileSystem};
    use turbopack_core::{
        file_source::FileSource,
        reference_type::{ReferenceType, TypeScriptReferenceSubType},
        resolve::{
            node::node_cjs_resolve_options,
            parse::Request,
            resolve,
            tsconfig_provenance::{
                NativeTsConfigConsumer, NativeTsConfigObservation, NativeTsConfigProbe,
                NativeTsConfigProbeContext, NativeTsConfigProbeRequest, NativeTsConfigProbeScope,
            },
        },
        source::Source,
    };

    use crate::{
        resolve::resolve_options,
        resolve_options_context::{ResolveOptionsContext, TsConfigHandling},
        typescript::{read_tsconfigs, read_tsconfigs_with_native_provenance},
    };

    #[turbo_tasks::function(operation, root)]
    async fn producer(root: RcStr, mode: RcStr, observed: bool) -> Result<Vc<Vec<RcStr>>> {
        let root = DiskFileSystem::new(rcstr!("native-config-consumers"), Vc::cell(root))
            .root()
            .owned()
            .await?;
        let project = root.join(if &*mode == "alias-none" {
            "none"
        } else {
            "project"
        })?;
        let consumer_path = project.join("child")?;
        let path = project.join(if &*mode == "alias-present" {
            "custom.json"
        } else if mode.starts_with("alias-") {
            "missing.json"
        } else {
            &mode
        })?;
        let context = NativeTsConfigProbeContext {
            filesystem_root: root.clone(),
            project_path: project.clone(),
            consumer: if mode.starts_with("alias-") {
                NativeTsConfigConsumer::Aliases
            } else {
                NativeTsConfigConsumer::TypeScript
            },
            configured_path: Some(path.clone()),
            consumer_path: consumer_path.clone(),
            lookup_path: consumer_path.clone(),
            request: rcstr!("native-options"),
            chain_index: 0,
            attempt_index: 0,
        }
        .resolved_cell();
        let mut values = Vec::new();
        if mode.starts_with("alias-") {
            let options = ResolveOptionsContext {
                enable_typescript: true,
                tsconfig_path: TsConfigHandling::Fixed(path),
                native_tsconfig_probe: observed.then_some(context),
                ..Default::default()
            }
            .cell();
            let options = resolve_options(consumer_path.clone(), options);
            let result = resolve(
                consumer_path,
                ReferenceType::TypeScript(TypeScriptReferenceSubType::Undefined),
                Request::parse_string(if &*mode == "alias-none" {
                    rcstr!("../src/actual.js")
                } else {
                    rcstr!("@value")
                }),
                options,
            )
            .await?;
            values.push(
                result
                    .first_source()
                    .expect("real native alias selected")
                    .ident()
                    .await?
                    .path
                    .path
                    .clone(),
            );
        } else {
            let source = ResolvedVc::upcast::<Box<dyn Source>>(
                FileSource::new(path.clone()).to_resolved().await?,
            );
            let configs = if observed {
                read_tsconfigs_with_native_provenance(
                    path.read(),
                    source,
                    node_cjs_resolve_options(),
                    NativeTsConfigProbeScope::new(context),
                )
                .await?
            } else {
                read_tsconfigs(path.read(), source, node_cjs_resolve_options()).await?
            };
            values.push(format!("configs={}", configs.len()).into());
            for (data, source) in configs {
                if let FileJsonContent::Content(json) = &*data.await? {
                    values.push(
                        format!(
                            "{}={}",
                            source.ident().await?.path.path,
                            json["compilerOptions"]["useDefineForClassFields"]
                        )
                        .into(),
                    );
                }
            }
        }
        Ok(Vc::cell(values))
    }
    #[turbo_tasks::function(operation, root)]
    async fn collect(source: OperationVc<Vec<RcStr>>) -> Result<Vc<Vec<RcStr>>> {
        let actual = source.read_strongly_consistent().await?;
        let mut facts = Vec::new();
        for observation in source.peek_collectibles::<Box<dyn NativeTsConfigObservation>>() {
            let data = observation.data().await?;
            let ctx = data.context.await?;
            let (kind, path, detail) = match &data.probe {
                NativeTsConfigProbe::Selection { path, selected } => (
                    "selection",
                    path,
                    format!("{:?}", selected.as_ref().map(|p| p.path.to_string())),
                ),
                NativeTsConfigProbe::FixedMetadata {
                    path,
                    succeeded,
                    observed,
                    ..
                } => ("fixed", path, format!("{succeeded}:{observed:?}")),
                NativeTsConfigProbe::ConfigRead {
                    path,
                    status,
                    symlinks,
                    ..
                } => ("read", path, format!("{status:?}:links={}", symlinks.len())),
                NativeTsConfigProbe::Extends {
                    path,
                    request,
                    result,
                } => (
                    "extends",
                    path,
                    format!("{}:primary={}", request, result.await?.primary.len()),
                ),
                NativeTsConfigProbe::RealPath {
                    path,
                    result,
                    symlinks,
                } => (
                    "realpath",
                    path,
                    format!(
                        "{}:links={}",
                        if result.is_ok() { "found" } else { "absent" },
                        symlinks.len()
                    ),
                ),
                NativeTsConfigProbe::Directory { path, found } => {
                    ("directory", path, found.to_string())
                }
                NativeTsConfigProbe::Candidate {
                    path,
                    requested,
                    observed,
                } => (
                    "candidate",
                    path,
                    format!(
                        "{}:{observed:?}",
                        match requested {
                            NativeTsConfigProbeRequest::Entry => "entry",
                            NativeTsConfigProbeRequest::Type(_) => "type",
                        }
                    ),
                ),
                NativeTsConfigProbe::Incomplete { path, reason } => {
                    ("incomplete", path, reason.to_string())
                }
            };
            facts.push(
                format!(
                    "{:?}|consumer={}|chain={}|attempt={}|{:?}|{}|{}|{}",
                    ctx.consumer,
                    ctx.consumer_path.path,
                    ctx.chain_index,
                    ctx.attempt_index,
                    data.order,
                    kind,
                    path.path,
                    detail
                )
                .into(),
            );
        }
        facts.sort();
        let mut values = actual.to_vec();
        values.push(rcstr!("FACTS"));
        values.extend(facts);
        Ok(Vc::cell(values))
    }
    fn backend() -> std::sync::Arc<turbo_tasks::TurboTasks<TurboTasksBackend>> {
        turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            turbo_tasks_backend::noop_backing_storage(),
        ))
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn actual_native_config_consumers_keep_their_choices_and_attempts() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap();
        std::fs::create_dir_all(root.join("project/child")).unwrap();
        std::fs::create_dir_all(root.join("project/src")).unwrap();
        std::fs::write(
            root.join("project/custom.json"),
            r#"{"extends":"./base.json"}"#,
        )
        .unwrap();
        std::fs::write(root.join("project/base.json"),r#"{"compilerOptions":{"useDefineForClassFields":true,"baseUrl":".","paths":{"@value":["./src/actual.js"]}}}"#).unwrap();
        std::fs::write(
            root.join("project/tsconfig.json"),
            r#"{"extends":"./base.json"}"#,
        )
        .unwrap();
        std::fs::write(root.join("project/src/actual.js"), "export const value=1").unwrap();
        std::fs::create_dir_all(root.join("none/child")).unwrap();
        std::fs::create_dir_all(root.join("none/src")).unwrap();
        std::fs::write(root.join("none/src/actual.js"), "export const value=2").unwrap();
        std::fs::write(
            root.join("project/multi.json"),
            r#"{"extends":"./multi-base.json"}"#,
        )
        .unwrap();
        std::fs::write(
            root.join("project/multi-base.json"),
            r#"{"compilerOptions":{"useDefineForClassFields":true}}"#,
        )
        .unwrap();
        std::fs::write(
            root.join("project/multi-base.json.json"),
            r#"{"compilerOptions":{"useDefineForClassFields":false}}"#,
        )
        .unwrap();
        std::fs::write(
            root.join("project/missing-parent.json"),
            r#"{"extends":"./absent/base.json"}"#,
        )
        .unwrap();
        std::fs::write(
            root.join("project/array.json"),
            r#"{"extends":["./base.json"]}"#,
        )
        .unwrap();
        std::fs::write(
            root.join("project/query.json"),
            r#"{"extends":"./base.json?raw"}"#,
        )
        .unwrap();
        std::fs::write(
            root.join("project/fallback.json"),
            r#"{"extends":"./not-there"}"#,
        )
        .unwrap();
        std::fs::write(
            root.join("project/package.json"),
            r#"{"extends":"pkg/tsconfig.json"}"#,
        )
        .unwrap();
        std::fs::create_dir_all(root.join("project/node_modules/pkg")).unwrap();
        std::fs::write(
            root.join("project/node_modules/pkg/tsconfig.json"),
            r#"{"compilerOptions":{"useDefineForClassFields":false}}"#,
        )
        .unwrap();
        std::fs::write(root.join("project/empty.json"), "").unwrap();
        std::fs::write(root.join("project/invalid.json"), "{").unwrap();
        std::fs::write(
            root.join("project/extensionless.json"),
            r#"{"extends":"./base"}"#,
        )
        .unwrap();
        std::fs::create_dir(root.join("project/directory.json")).unwrap();
        std::fs::write(
            root.join("project/directory-parent.json"),
            r#"{"extends":"./directory.json"}"#,
        )
        .unwrap();
        #[cfg(unix)]
        {
            std::fs::write(
                root.join("project/link-parent.json"),
                r#"{"extends":"./link.json"}"#,
            )
            .unwrap();
            std::os::unix::fs::symlink("base.json", root.join("project/link.json")).unwrap();
        }
        let root: RcStr = root.to_str().unwrap().into();
        let modes = vec![
            "custom.json",
            "multi.json",
            "missing-parent.json",
            "array.json",
            "query.json",
            "fallback.json",
            "package.json",
            "alias-fallback",
            "alias-present",
            "alias-none",
            "empty.json",
            "invalid.json",
            "absent.json",
            "extensionless.json",
            "directory-parent.json",
        ];
        #[cfg(unix)]
        let modes = modes
            .into_iter()
            .chain(["link-parent.json"])
            .collect::<Vec<_>>();
        for mode in modes {
            let tt = backend();
            let root = root.clone();
            let mode: RcStr = mode.into();
            tt.run_once(async move {
                let off = collect(producer(root.clone(), mode.clone(), false))
                    .read_strongly_consistent()
                    .await?
                    .to_vec();
                let on = collect(producer(root.clone(), mode.clone(), true))
                    .read_strongly_consistent()
                    .await?
                    .to_vec();
                let off_split = off.iter().position(|x| &**x == "FACTS").unwrap();
                let split = on.iter().position(|x| &**x == "FACTS").unwrap();
                assert_eq!(
                    &off[..off_split],
                    &on[..split],
                    "actual native choices changed in {mode}"
                );
                assert_eq!(off.len(), off_split + 1, "default-off emitted observations");
                let facts = &on[split + 1..];
                assert!(!facts.is_empty());
                println!("MODE {mode} {on:#?}");
                let has = |part: &str| facts.iter().any(|f| f.contains(part));
                match &*mode {
                    "custom.json" => {
                        assert!(has("./base.json:primary=1"));
                        assert!(has("base.json.json|entry:NotFound"));
                        assert!(has("base.json|entry:File"));
                        assert!(has("chain=1"));
                        assert_eq!(&*on[0], "configs=2");
                    }
                    "alias-fallback" => {
                        assert!(has("Aliases|consumer=project/child"));
                        assert!(has("missing.json|false:NotFound"));
                        assert!(has("project/child/tsconfig.json|absent:links=0"));
                        assert!(has("project/child/jsconfig.json|absent:links=0"));
                        assert!(has("project/tsconfig.json|type:File"));
                        assert_eq!(&*on[0], "project/src/actual.js");
                    }
                    "multi.json" => {
                        assert!(has("./multi-base.json:primary=1"));
                        assert!(has("multi-base.json.json|entry:File"));
                        assert_eq!(&*on[2], "project/multi-base.json=true");
                    }
                    "missing-parent.json" => {
                        assert!(has("project/absent|false"));
                        assert!(
                            !facts
                                .iter()
                                .any(|f| f.contains("|candidate|project/absent/base.json|")),
                            "must not invent unperformed child entry probes"
                        );
                    }
                    "array.json" => assert!(has("non-string native config extends")),
                    "query.json" => {
                        assert!(has("unsupported native config extends request"));
                        assert!(has("./base.json?raw:primary=1"));
                    }
                    "fallback.json" => {
                        assert!(has("attempt=1"));
                        assert!(has("./not-there.json:primary=0"));
                        assert!(has("unsupported native config extends request"));
                    }
                    "package.json" => {
                        assert!(has("unsupported native config extends request"));
                        assert_eq!(&*on[2], "project/node_modules/pkg/tsconfig.json=false");
                    }
                    #[cfg(unix)]
                    "link-parent.json" => {
                        assert!(has("links=1"));
                        assert_eq!(&*on[2], "project/base.json=true");
                    }
                    "alias-present" => {
                        assert!(has("custom.json|true:File"));
                        assert!(!has("project/child/tsconfig.json"));
                        assert_eq!(&*on[0], "project/src/actual.js");
                    }
                    "alias-none" => {
                        assert!(has("none/child|None"));
                        assert!(has("none/child/tsconfig.json|absent:links=0"));
                        assert_eq!(&*on[0], "none/src/actual.js");
                    }
                    "empty.json" => assert!(has("empty.json|Empty")),
                    "invalid.json" => assert!(has("invalid.json|Invalid")),
                    "absent.json" => assert!(has("absent.json|Missing")),
                    "extensionless.json" => {
                        assert!(has("unsupported native config extends request"))
                    }
                    "directory-parent.json" => {
                        assert!(has("native config directory/package expansion"))
                    }
                    _ => unreachable!(),
                };
                anyhow::Ok(())
            })
            .await
            .unwrap();
        }
        #[cfg(unix)]
        {
            let tt = backend();
            let root = root.clone();
            tt.run_once(async move {
                let off = collect(producer(root.clone(), rcstr!("link.json"), false))
                    .read_strongly_consistent()
                    .await;
                let on = collect(producer(root, rcstr!("link.json"), true))
                    .read_strongly_consistent()
                    .await;
                assert!(
                    off.is_err() && on.is_err(),
                    "actual native unresolved symlink reads cannot issue a successful receipt"
                );
                anyhow::Ok(())
            })
            .await
            .unwrap();
        }
    }
}
