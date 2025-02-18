use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_rcstr::RcStr;
use turbo_tasks::{trace::TraceRawVcs, NonLocalValue, ResolvedVc, Value, Vc};
use turbo_tasks_fs::{self, glob::Glob, FileJsonContent, FileSystemPath};
use turbopack_core::{
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString},
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
    resolve::{
        find_context_file,
        node::{node_cjs_resolve_options, node_esm_resolve_options},
        package_json,
        parse::Request,
        pattern::Pattern,
        plugin::{AfterResolvePlugin, AfterResolvePluginCondition},
        resolve, ExternalTraced, ExternalType, FindContextFileResult, ResolveResult,
        ResolveResultItem, ResolveResultOption,
    },
    source::Source,
};

/// The predicated based on which the [ExternalCjsModulesResolvePlugin] decides
/// whether to mark a module as external.
#[turbo_tasks::value(into = "shared")]
pub enum ExternalPredicate {
    /// Mark all modules as external if they're not listed in the list.
    /// Applies only to imports outside of node_modules.
    AllExcept(ResolvedVc<Vec<RcStr>>),
    /// Only mark modules listed as external, whether inside node_modules or
    /// not.
    Only(ResolvedVc<Vec<RcStr>>),
}

/// Mark modules as external, so they're resolved at runtime instead of bundled.
///
/// Modules matching the predicate are marked as external as long as it's
/// possible to resolve them at runtime.
#[turbo_tasks::value]
pub(crate) struct ExternalCjsModulesResolvePlugin {
    project_path: ResolvedVc<FileSystemPath>,
    root: ResolvedVc<FileSystemPath>,
    predicate: ResolvedVc<ExternalPredicate>,
    import_externals: bool,
}

#[turbo_tasks::value_impl]
impl ExternalCjsModulesResolvePlugin {
    #[turbo_tasks::function]
    pub fn new(
        project_path: ResolvedVc<FileSystemPath>,
        root: ResolvedVc<FileSystemPath>,
        predicate: ResolvedVc<ExternalPredicate>,
        import_externals: bool,
    ) -> Vc<Self> {
        ExternalCjsModulesResolvePlugin {
            project_path,
            root,
            predicate,
            import_externals,
        }
        .cell()
    }
}

#[turbo_tasks::function]
fn condition(root: Vc<FileSystemPath>) -> Vc<AfterResolvePluginCondition> {
    AfterResolvePluginCondition::new(root, Glob::new("**/node_modules/**".into()))
}

#[turbo_tasks::value_impl]
impl AfterResolvePlugin for ExternalCjsModulesResolvePlugin {
    #[turbo_tasks::function]
    fn after_resolve_condition(&self) -> Vc<AfterResolvePluginCondition> {
        condition(*self.root)
    }

    #[turbo_tasks::function]
    async fn after_resolve(
        &self,
        fs_path: ResolvedVc<FileSystemPath>,
        lookup_path: ResolvedVc<FileSystemPath>,
        reference_type: Value<ReferenceType>,
        request: ResolvedVc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        let request_value = &*request.await?;
        let Request::Module {
            module: package,
            path: package_subpath,
            ..
        } = request_value
        else {
            return Ok(ResolveResultOption::none());
        };

        // from https://github.com/vercel/next.js/blob/8d1c619ad650f5d147207f267441caf12acd91d1/packages/next/src/build/handle-externals.ts#L188
        let never_external_regex = lazy_regex::regex!("^(?:private-next-pages\\/|next\\/(?:dist\\/pages\\/|(?:app|document|link|image|legacy\\/image|constants|dynamic|script|navigation|headers|router)$)|string-hash|private-next-rsc-action-validate|private-next-rsc-action-client-wrapper|private-next-rsc-server-reference$)");

        let Pattern::Constant(package_subpath) = package_subpath else {
            return Ok(ResolveResultOption::none());
        };
        let request_str: RcStr = format!("{package}{package_subpath}").into();
        if never_external_regex.is_match(&request_str) {
            return Ok(ResolveResultOption::none());
        }

        let raw_fs_path = &*fs_path.await?;

        let predicate = self.predicate.await?;
        let must_be_external = match &*predicate {
            ExternalPredicate::AllExcept(exceptions) => {
                if *condition(*self.root).matches(*lookup_path).await? {
                    return Ok(ResolveResultOption::none());
                }

                let exception_glob = packages_glob(**exceptions).await?;

                if let Some(PackagesGlobs {
                    path_glob,
                    request_glob,
                }) = *exception_glob
                {
                    let path_match = path_glob.await?.execute(&raw_fs_path.path);
                    let request_match = request_glob.await?.execute(&request_str);
                    if path_match || request_match {
                        return Ok(ResolveResultOption::none());
                    }
                }
                false
            }
            ExternalPredicate::Only(externals) => {
                let external_glob = packages_glob(**externals).await?;

                if let Some(PackagesGlobs {
                    path_glob,
                    request_glob,
                }) = *external_glob
                {
                    let path_match = path_glob.await?.execute(&raw_fs_path.path);
                    let request_match = request_glob.await?.execute(&request_str);

                    if !path_match && !request_match {
                        return Ok(ResolveResultOption::none());
                    }
                } else {
                    return Ok(ResolveResultOption::none());
                }
                true
            }
        };

        let is_esm = self.import_externals
            && ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined)
                .includes(&reference_type);

        #[derive(Debug, Copy, Clone)]
        enum FileType {
            CommonJs,
            EcmaScriptModule,
            UnsupportedExtension,
            InvalidPackageJson,
        }

        async fn get_file_type(
            fs_path: Vc<FileSystemPath>,
            raw_fs_path: &FileSystemPath,
        ) -> Result<FileType> {
            // node.js only supports these file extensions
            // mjs is an esm module and we can't bundle that yet
            let ext = raw_fs_path.extension_ref();
            if matches!(ext, Some("cjs" | "node" | "json")) {
                return Ok(FileType::CommonJs);
            }
            if matches!(ext, Some("mjs")) {
                return Ok(FileType::EcmaScriptModule);
            }
            if matches!(ext, Some("js")) {
                // for .js extension in cjs context, we need to check the actual module type via
                // package.json
                let FindContextFileResult::Found(package_json, _) =
                    *find_context_file(fs_path.parent(), package_json()).await?
                else {
                    // can't find package.json
                    return Ok(FileType::CommonJs);
                };
                let FileJsonContent::Content(package) = &*package_json.read_json().await? else {
                    // can't parse package.json
                    return Ok(FileType::InvalidPackageJson);
                };

                if let Some("module") = package["type"].as_str() {
                    return Ok(FileType::EcmaScriptModule);
                }

                return Ok(FileType::CommonJs);
            }

            Ok(FileType::UnsupportedExtension)
        }

        let unable_to_externalize = |reason: Vec<StyledString>| {
            if must_be_external {
                ExternalizeIssue {
                    file_path: lookup_path,
                    package: package.clone(),
                    request_str: request_str.clone(),
                    reason,
                }
                .resolved_cell()
                .emit();
            }
            Ok(ResolveResultOption::none())
        };

        let mut request = *request;
        let mut request_str = request_str.to_string();

        let node_resolve_options = if is_esm {
            node_esm_resolve_options(lookup_path.root())
        } else {
            node_cjs_resolve_options(lookup_path.root())
        };
        let result_from_original_location = loop {
            let node_resolved_from_original_location = resolve(
                *lookup_path,
                reference_type.clone(),
                request,
                node_resolve_options,
            );
            let Some(result_from_original_location) =
                *node_resolved_from_original_location.first_source().await?
            else {
                if is_esm
                    && !package_subpath.is_empty()
                    && package_subpath != "/"
                    && !request_str.ends_with(".js")
                {
                    // We have a fallback solution for convinience: If user doesn't
                    // have an extension in the request we try to append ".js"
                    // automatically
                    request_str.push_str(".js");
                    request = request.append_path(".js".into()).resolve().await?;
                    continue;
                }
                // this can't resolve with node.js from the original location, so bundle it
                return unable_to_externalize(vec![StyledString::Text(
                    "The request could not be resolved by Node.js from the importing module. The \
                     way Node.js resolves modules is slightly different from the way Next.js \
                     resolves modules. Next.js was able to resolve it, while Node.js would not be \
                     able to.\nTry to remove this package from serverExternalPackages.\nOr update \
                     the import side to use a compatible request that can be resolved by Node.js."
                        .into(),
                )]);
            };
            break result_from_original_location;
        };
        let node_resolved = resolve(
            *self.project_path,
            reference_type.clone(),
            request,
            node_resolve_options,
        );

        let Some(result) = *node_resolved.first_source().await? else {
            // this can't resolve with node.js from the project directory, so bundle it
            return unable_to_externalize(vec![
                StyledString::Text(
                    "The request could not be resolved by Node.js from the project \
                     directory.\nPackages that should be external need to be installed in the \
                     project directory, so they can be resolved from the output files.\nTry to \
                     install it into the project directory by running "
                        .into(),
                ),
                StyledString::Code(format!("npm install {package}").into()),
                StyledString::Text(" from the project directory.".into()),
            ]);
        };

        if result_from_original_location != result {
            let package_json_file = find_context_file(
                result.ident().path().parent().resolve().await?,
                package_json(),
            );
            let package_json_from_original_location = find_context_file(
                result_from_original_location
                    .ident()
                    .path()
                    .parent()
                    .resolve()
                    .await?,
                package_json(),
            );
            let FindContextFileResult::Found(package_json_file, _) = *package_json_file.await?
            else {
                return unable_to_externalize(vec![StyledString::Text(
                    "The package.json of the package resolved from the project directory can't be \
                     found."
                        .into(),
                )]);
            };
            let FindContextFileResult::Found(package_json_from_original_location, _) =
                *package_json_from_original_location.await?
            else {
                return unable_to_externalize(vec![StyledString::Text(
                    "The package.json of the package can't be found.".into(),
                )]);
            };
            let FileJsonContent::Content(package_json_file) =
                &*package_json_file.read_json().await?
            else {
                return unable_to_externalize(vec![StyledString::Text(
                    "The package.json of the package resolved from project directory can't be \
                     parsed."
                        .into(),
                )]);
            };
            let FileJsonContent::Content(package_json_from_original_location) =
                &*package_json_from_original_location.read_json().await?
            else {
                return unable_to_externalize(vec![StyledString::Text(
                    "The package.json of the package can't be parsed.".into(),
                )]);
            };
            let (Some(name), Some(version)) = (
                package_json_file.get("name").and_then(|v| v.as_str()),
                package_json_file.get("version").and_then(|v| v.as_str()),
            ) else {
                return unable_to_externalize(vec![StyledString::Text(
                    "The package.json of the package has no name or version.".into(),
                )]);
            };
            let (Some(name2), Some(version2)) = (
                package_json_from_original_location
                    .get("name")
                    .and_then(|v| v.as_str()),
                package_json_from_original_location
                    .get("version")
                    .and_then(|v| v.as_str()),
            ) else {
                return unable_to_externalize(vec![StyledString::Text(
                    "The package.json of the package resolved from project directory has no name \
                     or version."
                        .into(),
                )]);
            };
            if (name, version) != (name2, version2) {
                // this can't resolve with node.js from the original location, so bundle it
                return unable_to_externalize(vec![StyledString::Text(
                    format!(
                        "The package resolves to a different version when requested from the \
                         project directory ({version}) compared to the package requested from the \
                         importing module ({version2}).\nMake sure to install the same version of \
                         the package in both locations."
                    )
                    .into(),
                )]);
            }
        }
        let path = result.ident().path().resolve().await?;
        let file_type = get_file_type(path, &*path.await?).await?;

        let external_type = match (file_type, is_esm) {
            (FileType::UnsupportedExtension, _) => {
                // unsupported file type, bundle it
                return unable_to_externalize(vec![StyledString::Text(
                    "Only .mjs, .cjs, .js, .json, or .node can be handled by Node.js.".into(),
                )]);
            }
            (FileType::InvalidPackageJson, _) => {
                // invalid package.json, bundle it
                return unable_to_externalize(vec![StyledString::Text(
                    "The package.json can't be found or parsed.".into(),
                )]);
            }
            // commonjs without esm is always external
            (FileType::CommonJs, false) => ExternalType::CommonJs,
            (FileType::CommonJs, true) => {
                // It would be more efficient to use an CJS external instead of an ESM external,
                // but we need to verify if that would be correct (as in resolves to the same file).
                let node_resolve_options = node_cjs_resolve_options(lookup_path.root());
                let node_resolved = resolve(
                    *self.project_path,
                    reference_type.clone(),
                    request,
                    node_resolve_options,
                );
                let resolves_equal = if let Some(result) = *node_resolved.first_source().await? {
                    let cjs_path = result.ident().path();
                    cjs_path.resolve().await? == path
                } else {
                    false
                };

                // When resolves_equal is set this is weird edge case. There are different
                // results for CJS and ESM resolving, but ESM resolving points to a CJS file.
                // While this might be valid, there is a good chance that this is a invalid
                // packages, where `type: module` or `.mjs` is missing and would fail in
                // Node.js. So when this wasn't an explicit opt-in we avoid making it external
                // to be safe.
                match (must_be_external, resolves_equal) {
                    // bundle it to be safe. No error since `must_be_external` is not set.
                    (false, false) => return Ok(ResolveResultOption::none()),
                    (_, true) => ExternalType::CommonJs,
                    (_, false) => ExternalType::EcmaScriptModule,
                }
            }
            // ecmascript with esm is always external
            (FileType::EcmaScriptModule, true) => ExternalType::EcmaScriptModule,
            (FileType::EcmaScriptModule, false) => {
                // even with require() this resolves to a ESM, which would break node.js, bundle it
                return unable_to_externalize(vec![StyledString::Text(
                    "The package seems invalid. require() resolves to a EcmaScript module, which \
                     would result in an error in Node.js."
                        .into(),
                )]);
            }
        };

        Ok(ResolveResultOption::some(
            ResolveResult::primary(ResolveResultItem::External {
                name: request_str.into(),
                ty: external_type,
                traced: ExternalTraced::Traced,
            })
            .cell(),
        ))
    }
}

#[derive(Serialize, Deserialize, TraceRawVcs, PartialEq, Eq, Debug, NonLocalValue)]
pub struct PackagesGlobs {
    path_glob: ResolvedVc<Glob>,
    request_glob: ResolvedVc<Glob>,
}

#[turbo_tasks::value(transparent)]
pub struct OptionPackagesGlobs(Option<PackagesGlobs>);

#[turbo_tasks::function]
async fn packages_glob(packages: Vc<Vec<RcStr>>) -> Result<Vc<OptionPackagesGlobs>> {
    let packages = packages.await?;
    if packages.is_empty() {
        return Ok(Vc::cell(None));
    }
    let path_glob = Glob::new(format!("**/node_modules/{{{}}}/**", packages.join(",")).into());
    let request_glob =
        Glob::new(format!("{{{},{}/**}}", packages.join(","), packages.join("/**,")).into());
    Ok(Vc::cell(Some(PackagesGlobs {
        path_glob: path_glob.to_resolved().await?,
        request_glob: request_glob.to_resolved().await?,
    })))
}

#[turbo_tasks::value]
struct ExternalizeIssue {
    file_path: ResolvedVc<FileSystemPath>,
    package: RcStr,
    request_str: RcStr,
    reason: Vec<StyledString>,
}

#[turbo_tasks::value_impl]
impl Issue for ExternalizeIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        IssueSeverity::Warning.cell()
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Vc<StyledString> {
        StyledString::Line(vec![
            StyledString::Text("Package ".into()),
            StyledString::Code(self.package.clone()),
            StyledString::Text(" can't be external".into()),
        ])
        .cell()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Config.into()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        *self.file_path
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<OptionStyledString>> {
        Ok(Vc::cell(Some(
            StyledString::Stack(vec![
                StyledString::Line(vec![
                    StyledString::Text("The request ".into()),
                    StyledString::Code(self.request_str.clone()),
                    StyledString::Text(" matches ".into()),
                    StyledString::Code("serverExternalPackages".into()),
                    StyledString::Text(" (or the default list).".into()),
                ]),
                StyledString::Line(self.reason.clone()),
            ])
            .resolved_cell(),
        )))
    }
}
