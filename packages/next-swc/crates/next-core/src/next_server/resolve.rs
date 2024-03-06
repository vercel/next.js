use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::{trace::TraceRawVcs, Value, Vc};
use turbopack_binding::{
    turbo::tasks_fs::{glob::Glob, FileJsonContent, FileSystemPath},
    turbopack::core::{
        issue::{Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString},
        reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
        resolve::{
            find_context_file,
            node::{node_cjs_resolve_options, node_esm_resolve_options},
            package_json,
            parse::Request,
            plugin::{ResolvePlugin, ResolvePluginCondition},
            resolve, ExternalType, FindContextFileResult, ResolveResult, ResolveResultItem,
            ResolveResultOption,
        },
        source::Source,
    },
};

/// The predicated based on which the [ExternalCjsModulesResolvePlugin] decides
/// whether to mark a module as external.
#[turbo_tasks::value(into = "shared")]
pub enum ExternalPredicate {
    /// Mark all modules as external if they're not listed in the list.
    AllExcept(Vc<Vec<String>>),
    /// Only mark modules listed as external.
    Only(Vc<Vec<String>>),
}

/// Mark modules as external, so they're resolved at runtime instead of bundled.
///
/// Modules matching the predicate are marked as external as long as it's
/// possible to resolve them at runtime.
#[turbo_tasks::value]
pub(crate) struct ExternalCjsModulesResolvePlugin {
    project_path: Vc<FileSystemPath>,
    root: Vc<FileSystemPath>,
    predicate: Vc<ExternalPredicate>,
    import_externals: bool,
}

#[turbo_tasks::value_impl]
impl ExternalCjsModulesResolvePlugin {
    #[turbo_tasks::function]
    pub fn new(
        project_path: Vc<FileSystemPath>,
        root: Vc<FileSystemPath>,
        predicate: Vc<ExternalPredicate>,
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
fn condition(root: Vc<FileSystemPath>) -> Vc<ResolvePluginCondition> {
    ResolvePluginCondition::new(root, Glob::new("**/node_modules/**".to_string()))
}

#[turbo_tasks::value_impl]
impl ResolvePlugin for ExternalCjsModulesResolvePlugin {
    #[turbo_tasks::function]
    fn after_resolve_condition(&self) -> Vc<ResolvePluginCondition> {
        condition(self.root)
    }

    #[turbo_tasks::function]
    async fn after_resolve(
        &self,
        fs_path: Vc<FileSystemPath>,
        context: Vc<FileSystemPath>,
        reference_type: Value<ReferenceType>,
        request: Vc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        if *condition(self.root).matches(context).await? {
            return Ok(ResolveResultOption::none());
        }
        let request_value = &*request.await?;
        if !matches!(request_value, Request::Module { .. }) {
            return Ok(ResolveResultOption::none());
        }

        // from https://github.com/vercel/next.js/blob/8d1c619ad650f5d147207f267441caf12acd91d1/packages/next/src/build/handle-externals.ts#L188
        let never_external_regex = lazy_regex::regex!("^(?:private-next-pages\\/|next\\/(?:dist\\/pages\\/|(?:app|document|link|image|legacy\\/image|constants|dynamic|script|navigation|headers|router)$)|string-hash|private-next-rsc-action-validate|private-next-rsc-action-client-wrapper|private-next-rsc-server-reference$)");

        let request_str = request_value.request();
        if let Some(request_str) = &request_str {
            if never_external_regex.is_match(request_str) {
                return Ok(ResolveResultOption::none());
            }
        }

        let raw_fs_path = &*fs_path.await?;

        let predicate = self.predicate.await?;
        let must_be_external = match &*predicate {
            ExternalPredicate::AllExcept(exceptions) => {
                let exception_glob = packages_glob(*exceptions).await?;

                if let Some(PackagesGlobs {
                    path_glob,
                    request_glob,
                }) = *exception_glob
                {
                    let path_match = path_glob.await?.execute(&raw_fs_path.path);
                    let request_match = if let Some(request_str) = &request_str {
                        request_glob.await?.execute(request_str)
                    } else {
                        false
                    };
                    if path_match || request_match {
                        return Ok(ResolveResultOption::none());
                    }
                }
                false
            }
            ExternalPredicate::Only(externals) => {
                let external_glob = packages_glob(*externals).await?;

                if let Some(PackagesGlobs {
                    path_glob,
                    request_glob,
                }) = *external_glob
                {
                    let path_match = path_glob.await?.execute(&raw_fs_path.path);
                    let request_match = if let Some(request_str) = &request_str {
                        request_glob.await?.execute(request_str)
                    } else {
                        false
                    };

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

        let node_resolve_options = if is_esm {
            node_esm_resolve_options(context.root())
        } else {
            node_cjs_resolve_options(context.root())
        };
        let node_resolved = resolve(
            self.project_path,
            reference_type.clone(),
            request,
            node_resolve_options,
        );
        let unable_to_externalize = |reason: &str| {
            if must_be_external {
                UnableToExternalize {
                    file_path: fs_path,
                    request: request_str.as_deref().unwrap_or("<unknown>").to_string(),
                    reason: reason.to_string(),
                }
                .cell()
                .emit();
            }
            Ok(ResolveResultOption::none())
        };
        let Some(result) = *node_resolved.first_source().await? else {
            // this can't resolve with node.js from the project directory, so bundle it
            return unable_to_externalize(
                "The request could not be resolved by Node.js from the project \
                 directory.\nPackages that should be external need to be installed in the project \
                 directory, so they can be resolved from the output files.\nTry to install the \
                 package into the project directory.",
            );
        };
        let node_resolved_from_original_location = resolve(
            context,
            reference_type.clone(),
            request,
            node_resolve_options,
        );
        let Some(result_from_original_location) =
            *node_resolved_from_original_location.first_source().await?
        else {
            // this can't resolve with node.js from the original location, so bundle it
            return unable_to_externalize(
                "The request could not be resolved by Node.js from the importing module.",
            );
        };
        let result = result.resolve().await?;
        let result_from_original_location = result_from_original_location.resolve().await?;
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
                return unable_to_externalize(
                    "The package.json of the package resolved from the project directory can't be \
                     found.",
                );
            };
            let FindContextFileResult::Found(package_json_from_original_location, _) =
                *package_json_from_original_location.await?
            else {
                return unable_to_externalize("The package.json of the package can't be found.");
            };
            let FileJsonContent::Content(package_json_file) =
                &*package_json_file.read_json().await?
            else {
                return unable_to_externalize(
                    "The package.json of the package resolved from project directory can't be \
                     parsed.",
                );
            };
            let FileJsonContent::Content(package_json_from_original_location) =
                &*package_json_from_original_location.read_json().await?
            else {
                return unable_to_externalize("The package.json of the package can't be parsed.");
            };
            let (Some(name), Some(version)) = (
                package_json_file.get("name"),
                package_json_file.get("version"),
            ) else {
                return unable_to_externalize(
                    "The package.json of the package has not name or version.",
                );
            };
            let (Some(name2), Some(version2)) = (
                package_json_from_original_location.get("name"),
                package_json_from_original_location.get("version"),
            ) else {
                return unable_to_externalize(
                    "The package.json of the package resolved from project directory has not name \
                     or version.",
                );
            };
            if (name, version) != (name2, version2) {
                // this can't resolve with node.js from the original location, so bundle it
                return unable_to_externalize(
                    "The package resolves to a different version when requested from the project \
                     directory compared to the package requested from the importing module.\nMake \
                     sure to install the same version of the package in both locations.",
                );
            }
        }
        let path = result.ident().path();
        let file_type = get_file_type(path, &*path.await?).await?;

        match (file_type, is_esm) {
            (FileType::UnsupportedExtension, _) => {
                // unsupported file type, bundle it
                unable_to_externalize(
                    "Only .mjs, .cjs, .js, .json, or .node can be handled by Node.js.",
                )
            }
            (FileType::InvalidPackageJson, _) => {
                // invalid package.json, bundle it
                unable_to_externalize("The package.json can't be found or parsed.")
            }
            (FileType::CommonJs, _) => {
                if let Some(request) = request.await?.request() {
                    // mark as external
                    Ok(ResolveResultOption::some(
                        ResolveResult::primary(ResolveResultItem::External(
                            request,
                            ExternalType::CommonJs,
                        ))
                        .cell(),
                    ))
                } else {
                    // unsupported request, bundle it
                    unable_to_externalize("There is not known request to work with.")
                }
            }
            (FileType::EcmaScriptModule, true) => {
                if let Some(request) = request.await?.request() {
                    // mark as external
                    Ok(ResolveResultOption::some(
                        ResolveResult::primary(ResolveResultItem::External(
                            request,
                            ExternalType::EcmaScriptModule,
                        ))
                        .cell(),
                    ))
                } else {
                    // unsupported request, bundle it
                    unable_to_externalize("There is not known request to work with.")
                }
            }
            (FileType::EcmaScriptModule, false) => {
                // even with require() this resolves to a ESM,
                // which would break node.js, bundle it
                unable_to_externalize(
                    "The package seems invalid. require() resolves to a EcmaScript module, which \
                     would result in an error in Node.js.",
                )
            }
        }
    }
}

#[derive(Serialize, Deserialize, TraceRawVcs, PartialEq, Eq, Debug)]
pub struct PackagesGlobs {
    path_glob: Vc<Glob>,
    request_glob: Vc<Glob>,
}

// TODO move that to turbo
#[turbo_tasks::value(transparent)]
pub struct OptionPackagesGlobs(Option<PackagesGlobs>);

#[turbo_tasks::function]
async fn packages_glob(packages: Vc<Vec<String>>) -> Result<Vc<OptionPackagesGlobs>> {
    let packages = packages.await?;
    if packages.is_empty() {
        return Ok(Vc::cell(None));
    }
    let path_glob = Glob::new(format!("**/node_modules/{{{}}}/**", packages.join(",")));
    let request_glob = Glob::new(format!(
        "{{{},{}/**}}",
        packages.join(","),
        packages.join("/**,")
    ));
    Ok(Vc::cell(Some(PackagesGlobs {
        path_glob: path_glob.resolve().await?,
        request_glob: request_glob.resolve().await?,
    })))
}

#[turbo_tasks::value]
struct UnableToExternalize {
    file_path: Vc<FileSystemPath>,
    request: String,
    reason: String,
}

#[turbo_tasks::value_impl]
impl Issue for UnableToExternalize {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        IssueSeverity::Error.cell()
    }

    #[turbo_tasks::function]
    async fn title(&self) -> Result<Vc<StyledString>> {
        let request = &self.request;
        let package = if request.starts_with('@') {
            request
                .splitn(3, '/')
                .take(2)
                .intersperse("/")
                .collect::<String>()
        } else if let Some((package, _)) = request.split_once('/') {
            package.to_string()
        } else {
            request.to_string()
        };
        Ok(StyledString::Line(vec![
            StyledString::Text("Package ".to_string()),
            StyledString::Code(package),
            StyledString::Text(" (".to_string()),
            StyledString::Code("serverComponentsExtenalPackages".to_string()),
            StyledString::Text(" or default list) can't be external".to_string()),
        ])
        .cell())
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Config.into()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.file_path
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(
            StyledString::Stack(vec![
                StyledString::Line(vec![
                    StyledString::Text("The request ".to_string()),
                    StyledString::Code(self.request.to_string()),
                    StyledString::Text(" matches ".to_string()),
                    StyledString::Code("serverComponentsExtenalPackages".to_string()),
                    StyledString::Text(
                        " (or the default list), but it can't be external:".to_string(),
                    ),
                ]),
                StyledString::Line(vec![StyledString::Text(self.reason.to_string())]),
            ])
            .cell(),
        ))
    }
}
