use anyhow::Result;
use async_trait::async_trait;
use bincode::{Decode, Encode};
use next_taskless::NEVER_EXTERNAL_RE;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{NonLocalValue, ResolvedVc, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::{
    self, FileJsonContent, FileSystemPath,
    glob::{Glob, GlobOptions},
};
use turbopack_core::{
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, StyledString},
    reference_type::{ReferenceType, ReferenceTypeCondition},
    resolve::{
        ExternalTraced, ExternalType, FindContextFileResult, ResolveResult, ResolveResultItem,
        ResolveResultOption, find_context_file,
        node::{node_cjs_resolve_options, node_esm_resolve_options},
        package_json,
        parse::Request,
        pattern::Pattern,
        plugin::{AfterResolvePlugin, AfterResolvePluginCondition},
        resolve,
    },
    source::Source,
};

/// The predicated based on which the [ExternalCjsModulesResolvePlugin] decides
/// whether to mark a module as external.
#[turbo_tasks::value(shared)]
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
    predicate: ResolvedVc<ExternalPredicate>,
    import_externals: bool,
    condition: ResolvedVc<AfterResolvePluginCondition>,
}

#[turbo_tasks::value_impl]
impl ExternalCjsModulesResolvePlugin {
    #[turbo_tasks::function]
    pub async fn new(
        root: FileSystemPath,
        predicate: ResolvedVc<ExternalPredicate>,
        import_externals: bool,
    ) -> Result<Vc<Self>> {
        let condition = turbo_tasks::read!(
            AfterResolvePluginCondition::new_with_glob(
                root,
                Glob::new(rcstr!("**/node_modules/**"), GlobOptions::default()),
            )
            .to_resolved()
        )?;
        Ok(ExternalCjsModulesResolvePlugin {
            predicate,
            import_externals,
            condition,
        }
        .cell())
    }
}

#[turbo_tasks::value_impl]
impl AfterResolvePlugin for ExternalCjsModulesResolvePlugin {
    fn after_resolve_condition(&self) -> Vc<AfterResolvePluginCondition> {
        *self.condition
    }

    #[turbo_tasks::function]
    async fn after_resolve(
        &self,
        fs_path: FileSystemPath,
        lookup_path: FileSystemPath,
        reference_type: ReferenceType,
        request: Vc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        let request_value = &*turbo_tasks::read!(request)?;
        let Request::Module {
            module: package,
            path: package_subpath,
            ..
        } = request_value
        else {
            return Ok(ResolveResultOption::none());
        };

        let (Pattern::Constant(package), Pattern::Constant(package_subpath)) =
            (package, package_subpath)
        else {
            return Ok(ResolveResultOption::none());
        };
        let request_str: RcStr = format!("{package}{package_subpath}").into();
        if NEVER_EXTERNAL_RE.is_match(&request_str) {
            return Ok(ResolveResultOption::none());
        }

        let raw_fs_path = fs_path.clone();

        let predicate = turbo_tasks::read!(self.predicate)?;
        let must_be_external = match &*predicate {
            ExternalPredicate::AllExcept(exceptions) => {
                if turbo_tasks::read!(self.condition)?.matches(&lookup_path) {
                    return Ok(ResolveResultOption::none());
                }

                let exception_glob = turbo_tasks::read!(packages_glob(**exceptions))?;

                if let Some(PackagesGlobs {
                    path_glob,
                    request_glob,
                }) = *exception_glob
                {
                    let path_match = turbo_tasks::read!(path_glob)?.matches(&raw_fs_path.path);
                    let request_match = turbo_tasks::read!(request_glob)?.matches(&request_str);
                    if path_match || request_match {
                        return Ok(ResolveResultOption::none());
                    }
                }
                false
            }
            ExternalPredicate::Only(externals) => {
                let external_glob = turbo_tasks::read!(packages_glob(**externals))?;

                if let Some(PackagesGlobs {
                    path_glob,
                    request_glob,
                }) = *external_glob
                {
                    let path_match = turbo_tasks::read!(path_glob)?.matches(&raw_fs_path.path);
                    let request_match = turbo_tasks::read!(request_glob)?.matches(&request_str);

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
            && ReferenceTypeCondition::EcmaScriptModules(None).includes(&reference_type);

        #[derive(Debug, Copy, Clone)]
        enum FileType {
            CommonJs,
            EcmaScriptModule,
            UnsupportedExtension,
            InvalidPackageJson,
        }

        turbo_tasks::dual_fn! {
        fn get_file_type(
            fs_path: &FileSystemPath,
            raw_fs_path: &FileSystemPath,
        ) -> Result<FileType> {
            // node.js only supports these file extensions
            // mjs is an esm module and we can't bundle that yet
            Ok(match raw_fs_path.extension() {
                Some("cjs" | "node" | "json") => FileType::CommonJs,
                Some("mjs") => FileType::EcmaScriptModule,
                Some("js") => {
                    // for .js extension in cjs context, we need to check the actual module type via
                    // package.json
                    let FindContextFileResult::Found(package_json, _) =
                        &*turbo_tasks::read!(find_context_file(fs_path.parent(), package_json(), false))?
                    else {
                        // can't find package.json
                        return Ok(FileType::CommonJs);
                    };
                    let FileJsonContent::Content(package) = &*turbo_tasks::read!(package_json.read_json())?
                    else {
                        // can't parse package.json
                        return Ok(FileType::InvalidPackageJson);
                    };

                    if let Some("module") = package["type"].as_str() {
                        FileType::EcmaScriptModule
                    } else {
                        FileType::CommonJs
                    }
                }
                _ => FileType::UnsupportedExtension,
            })
        }
        }

        let unable_to_externalize = |reason: Vec<StyledString>| {
            if must_be_external {
                ExternalizeIssue {
                    file_path: lookup_path.clone(),
                    package: package.clone(),
                    request_str: request_str.clone(),
                    reason,
                }
                .resolved_cell()
                .emit();
            }
            Ok(ResolveResultOption::none())
        };

        let mut request = request;
        let mut request_str = request_str.to_string();

        let node_resolve_options = if is_esm {
            node_esm_resolve_options(turbo_tasks::read!(lookup_path.root().owned())?)
        } else {
            node_cjs_resolve_options(turbo_tasks::read!(lookup_path.root().owned())?)
        };
        let result_from_original_location = loop {
            let node_resolved_from_original_location = resolve(
                lookup_path.clone(),
                reference_type.clone(),
                request,
                node_resolve_options,
            );
            let Some(result_from_original_location) =
                turbo_tasks::read!(node_resolved_from_original_location)?.first_source()
            else {
                if is_esm
                    && !package_subpath.is_empty()
                    && package_subpath != "/"
                    && !request_str.ends_with(".js")
                {
                    // We have a fallback solution for convenience: If user doesn't
                    // have an extension in the request we try to append ".js"
                    // automatically
                    request_str.push_str(".js");
                    request =
                        *turbo_tasks::read!(request.append_path(rcstr!(".js")).to_resolved())?;
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

        let ident = turbo_tasks::read!(result_from_original_location.ident())?;
        let path = &ident.path;
        let file_type = turbo_tasks::read!(get_file_type(path, path))?;

        let external_type = match (file_type, is_esm) {
            (FileType::UnsupportedExtension, _) => {
                // unsupported file type, bundle it
                return unable_to_externalize(vec![StyledString::Text(rcstr!(
                    "Only .mjs, .cjs, .js, .json, or .node can be handled by Node.js."
                ))]);
            }
            (FileType::InvalidPackageJson, _) => {
                // invalid package.json, bundle it
                return unable_to_externalize(vec![StyledString::Text(rcstr!(
                    "The package.json can't be found or parsed."
                ))]);
            }
            // commonjs without esm is always external
            (FileType::CommonJs, false) => ExternalType::CommonJs,
            (FileType::CommonJs, true) => {
                // It would be more efficient to use an CJS external instead of an ESM external,
                // but we need to verify if that would be correct (as in resolves to the same
                // file).
                let node_resolve_options =
                    node_cjs_resolve_options(turbo_tasks::read!(lookup_path.root().owned())?);
                let node_resolved = resolve(
                    lookup_path.clone(),
                    reference_type.clone(),
                    request,
                    node_resolve_options,
                );
                let resolves_equal =
                    if let Some(result) = turbo_tasks::read!(node_resolved)?.first_source() {
                        let ident = turbo_tasks::read!(result.ident())?;
                        let cjs_path = &ident.path;
                        cjs_path == path
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
                // even with require() this resolves to a ESM, which would break node.js, bundle
                // it
                return unable_to_externalize(vec![StyledString::Text(
                    "The package seems invalid. require() resolves to a EcmaScript module, which \
                     would result in an error in Node.js."
                        .into(),
                )]);
            }
        };

        let target = turbo_tasks::read!(result_from_original_location.ident())?
            .path
            .clone();

        Ok(ResolveResultOption::some(
            ResolveResult::primary(ResolveResultItem::External {
                name: request_str.into(),
                ty: external_type,
                traced: ExternalTraced::Traced,
                target: Some(target),
            })
            .cell(),
        ))
    }
}

#[derive(TraceRawVcs, PartialEq, Eq, Debug, NonLocalValue, Encode, Decode)]
pub struct PackagesGlobs {
    path_glob: ResolvedVc<Glob>,
    request_glob: ResolvedVc<Glob>,
}

#[turbo_tasks::value(transparent)]
pub struct OptionPackagesGlobs(Option<PackagesGlobs>);

#[turbo_tasks::function]
async fn packages_glob(packages: Vc<Vec<RcStr>>) -> Result<Vc<OptionPackagesGlobs>> {
    let packages = turbo_tasks::read!(packages)?;
    if packages.is_empty() {
        return Ok(Vc::cell(None));
    }
    let path_glob = Glob::new(
        format!("**/node_modules/{{{}}}/**", packages.join(",")).into(),
        GlobOptions::default(),
    );
    let request_glob = Glob::new(
        format!("{{{},{}/**}}", packages.join(","), packages.join("/**,")).into(),
        GlobOptions::default(),
    );
    Ok(Vc::cell(Some(PackagesGlobs {
        path_glob: turbo_tasks::read!(path_glob.to_resolved())?,
        request_glob: turbo_tasks::read!(request_glob.to_resolved())?,
    })))
}

#[turbo_tasks::value]
struct ExternalizeIssue {
    // TODO(PACK-4879): The filepath is incorrect and there should be a fine grained source
    // location pointing at the import/require
    file_path: FileSystemPath,
    package: RcStr,
    request_str: RcStr,
    reason: Vec<StyledString>,
}

#[cfg(not(feature = "sync"))]
#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for ExternalizeIssue {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Warning
    }

    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Line(vec![
            StyledString::Text(rcstr!("Package ")),
            StyledString::Code(self.package.clone()),
            StyledString::Text(rcstr!(" can't be external")),
        ]))
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Config
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.file_path.clone())
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Stack(vec![
            StyledString::Line(vec![
                StyledString::Text(rcstr!("The request ")),
                StyledString::Code(self.request_str.clone()),
                StyledString::Text(rcstr!(" matches ")),
                StyledString::Code(rcstr!("serverExternalPackages")),
                StyledString::Text(rcstr!(" (or the default list).")),
            ]),
            StyledString::Line(self.reason.clone()),
        ])))
    }
}

#[cfg(feature = "sync")]
#[turbo_tasks::value_impl]
impl Issue for ExternalizeIssue {
    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Warning
    }

    fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Line(vec![
            StyledString::Text(rcstr!("Package ")),
            StyledString::Code(self.package.clone()),
            StyledString::Text(rcstr!(" can't be external")),
        ]))
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Config
    }

    fn file_path(&self) -> Result<FileSystemPath> {
        Ok(self.file_path.clone())
    }

    fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Stack(vec![
            StyledString::Line(vec![
                StyledString::Text(rcstr!("The request ")),
                StyledString::Code(self.request_str.clone()),
                StyledString::Text(rcstr!(" matches ")),
                StyledString::Code(rcstr!("serverExternalPackages")),
                StyledString::Text(rcstr!(" (or the default list).")),
            ]),
            StyledString::Line(self.reason.clone()),
        ])))
    }
}
