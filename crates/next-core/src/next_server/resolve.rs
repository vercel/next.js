use anyhow::Result;
use async_trait::async_trait;
use bincode::{Decode, Encode};
use next_taskless::NEVER_EXTERNAL_RE;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{NonLocalValue, ResolvedVc, Vc};
use turbo_tasks_fs::{
    self, FileJsonContent, FileSystemEntryType, FileSystemPath, FileSystemPathOption,
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
        plugin::{
            AfterResolvePlugin, AfterResolvePluginCondition, BeforeResolvePlugin,
            BeforeResolvePluginCondition,
        },
        resolve,
    },
    source::Source,
};
use turbopack_resolve::{resolve::resolve_options, resolve_options_context::ResolveOptionsContext};

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
}

#[turbo_tasks::value_impl]
impl ExternalCjsModulesResolvePlugin {
    #[turbo_tasks::function]
    pub fn new(predicate: ResolvedVc<ExternalPredicate>, import_externals: bool) -> Vc<Self> {
        ExternalCjsModulesResolvePlugin {
            predicate,
            import_externals,
        }
        .cell()
    }
}

#[turbo_tasks::function]
fn node_modules_condition() -> Vc<AfterResolvePluginCondition> {
    AfterResolvePluginCondition::new_with_glob(
        None,
        Glob::new(rcstr!("**/node_modules/**"), GlobOptions::default()),
    )
}

#[turbo_tasks::value_impl]
impl AfterResolvePlugin for ExternalCjsModulesResolvePlugin {
    fn after_resolve_condition(&self) -> Vc<AfterResolvePluginCondition> {
        node_modules_condition()
    }

    #[turbo_tasks::function]
    async fn after_resolve(
        &self,
        fs_path: FileSystemPath,
        lookup_path: FileSystemPath,
        reference_type: ReferenceType,
        request: Vc<Request>,
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

        let predicate = self.predicate.await?;
        let must_be_external = match &*predicate {
            ExternalPredicate::AllExcept(exceptions) => {
                if node_modules_condition().await?.matches(&lookup_path) {
                    return Ok(ResolveResultOption::none());
                }

                let exception_glob = packages_glob(**exceptions).await?;

                if let Some(PackagesGlobs {
                    path_glob,
                    request_glob,
                }) = *exception_glob
                {
                    let path_match = path_glob.await?.matches(&raw_fs_path.path);
                    let request_match = request_glob.await?.matches(&request_str);
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
                    let path_match = path_glob.await?.matches(&raw_fs_path.path);
                    let request_match = request_glob.await?.matches(&request_str);

                    if !path_match && !request_match {
                        return Ok(ResolveResultOption::none());
                    }
                } else {
                    return Ok(ResolveResultOption::none());
                }
                true
            }
        };

        externalize(
            lookup_path,
            reference_type,
            request,
            package,
            package_subpath,
            request_str,
            must_be_external,
            self.import_externals,
            None,
        )
        .await
    }
}

/// Marks packages in a list as external when they're symlinked into `node_modules`, but their
/// real path is outside of `node_modules`, e.g. packages of a monorepo workspace.
///
/// [ExternalCjsModulesResolvePlugin] doesn't handle these packages, as it only looks at resolved
/// paths inside of `node_modules`.
#[turbo_tasks::value]
pub(crate) struct ExternalSymlinkedPackagesResolvePlugin {
    externals: ResolvedVc<Vec<RcStr>>,
    import_externals: bool,
    /// The resolve options context without this plugin, used to resolve requests normally before
    /// externalizing them.
    resolve_options_context: ResolvedVc<ResolveOptionsContext>,
}

#[turbo_tasks::value_impl]
impl ExternalSymlinkedPackagesResolvePlugin {
    #[turbo_tasks::function]
    pub fn new(
        externals: ResolvedVc<Vec<RcStr>>,
        import_externals: bool,
        resolve_options_context: ResolvedVc<ResolveOptionsContext>,
    ) -> Vc<Self> {
        ExternalSymlinkedPackagesResolvePlugin {
            externals,
            import_externals,
            resolve_options_context,
        }
        .cell()
    }
}

#[turbo_tasks::value_impl]
impl BeforeResolvePlugin for ExternalSymlinkedPackagesResolvePlugin {
    fn before_resolve_condition(&self) -> Vc<BeforeResolvePluginCondition> {
        BeforeResolvePluginCondition::from_modules(*self.externals)
    }

    #[turbo_tasks::function]
    async fn before_resolve(
        &self,
        lookup_path: FileSystemPath,
        reference_type: ReferenceType,
        request: Vc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        let Request::Module {
            module: Pattern::Constant(package),
            path: Pattern::Constant(package_subpath),
            ..
        } = &*request.await?
        else {
            return Ok(ResolveResultOption::none());
        };
        let request_str: RcStr = format!("{package}{package_subpath}").into();
        if NEVER_EXTERNAL_RE.is_match(&request_str) {
            return Ok(ResolveResultOption::none());
        }

        // Packages that are not symlinked, or that are symlinked to a path inside of
        // `node_modules` (e.g. by pnpm), are handled by `ExternalCjsModulesResolvePlugin`.
        if find_symlinked_package_outside_node_modules(lookup_path.clone(), package.clone())
            .await?
            .is_none()
        {
            return Ok(ResolveResultOption::none());
        }

        // Resolve the request like it would be resolved without this plugin, so import map entries
        // (e.g. aliases to `false` or to another file) are respected. Only externalize the request
        // when it resolves to a single file, and Node.js resolves it to the same file.
        let options = resolve_options(lookup_path.clone(), *self.resolve_options_context);
        let result = resolve(
            lookup_path.clone(),
            reference_type.clone(),
            request,
            options,
        )
        .await?;
        let [(_, ResolveResultItem::Source(source))] = &*result.primary else {
            return Ok(ResolveResultOption::none());
        };
        let resolved_path = source.ident().await?.path.clone();

        externalize(
            lookup_path,
            reference_type,
            request,
            package,
            package_subpath,
            request_str,
            true,
            self.import_externals,
            Some(&resolved_path),
        )
        .await
    }
}

/// Looks up `node_modules/<package>` the same way Node.js does, starting at `lookup_path`. Returns
/// the real path of the package directory if it is a symlink to a path outside of
/// `node_modules`.
#[turbo_tasks::function]
async fn find_symlinked_package_outside_node_modules(
    lookup_path: FileSystemPath,
    package: RcStr,
) -> Result<Vc<FileSystemPathOption>> {
    let mut dir = lookup_path;
    loop {
        if dir.file_name() != "node_modules" {
            let package_dir = dir.join("node_modules")?.join(&package)?;
            match &*package_dir.get_type().await? {
                FileSystemEntryType::NotFound => {}
                FileSystemEntryType::Symlink => {
                    return Ok(Vc::cell(match package_dir.realpath().await? {
                        Ok(real_path) if !real_path.is_in_node_modules() => Some(real_path),
                        _ => None,
                    }));
                }
                // Node.js would use this package, which isn't a symlink
                _ => return Ok(Vc::cell(None)),
            }
        }
        if dir.is_root() {
            return Ok(Vc::cell(None));
        }
        dir = dir.parent();
    }
}

/// Marks `request` as external if it can be resolved by Node.js from `lookup_path`. Otherwise, it
/// is bundled, with a warning if `must_be_external` is set. If `expected_path` is set, `request` is
/// only marked as external when Node.js resolves it to that path.
#[allow(clippy::too_many_arguments)]
async fn externalize(
    lookup_path: FileSystemPath,
    reference_type: ReferenceType,
    request: Vc<Request>,
    package: &RcStr,
    package_subpath: &RcStr,
    request_str: RcStr,
    must_be_external: bool,
    import_externals: bool,
    expected_path: Option<&FileSystemPath>,
) -> Result<Vc<ResolveResultOption>> {
    let is_esm = import_externals
        && ReferenceTypeCondition::EcmaScriptModules(None).includes(&reference_type);

    #[derive(Debug, Copy, Clone)]
    enum FileType {
        CommonJs,
        EcmaScriptModule,
        UnsupportedExtension,
        InvalidPackageJson,
    }

    async fn get_file_type(
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
                    &*find_context_file(fs_path.parent(), package_json(), false).await?
                else {
                    // can't find package.json
                    return Ok(FileType::CommonJs);
                };
                let FileJsonContent::Content(package) = &*package_json.read_json().await? else {
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
        node_esm_resolve_options()
    } else {
        node_cjs_resolve_options()
    };
    let result_from_original_location = loop {
        let node_resolved_from_original_location = resolve(
            lookup_path.clone(),
            reference_type.clone(),
            request,
            node_resolve_options,
        );
        let Some(result_from_original_location) =
            node_resolved_from_original_location.await?.first_source()
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
                request = *request.append_path(rcstr!(".js")).to_resolved().await?;
                continue;
            }
            // this can't resolve with node.js from the original location, so bundle it
            return unable_to_externalize(vec![StyledString::Text(
                "The request could not be resolved by Node.js from the importing module. The way \
                 Node.js resolves modules is slightly different from the way Next.js resolves \
                 modules. Next.js was able to resolve it, while Node.js would not be able \
                 to.\nTry to remove this package from serverExternalPackages.\nOr update the \
                 import side to use a compatible request that can be resolved by Node.js."
                    .into(),
            )]);
        };
        break result_from_original_location;
    };

    let ident = result_from_original_location.ident().await?;
    let path = &ident.path;
    if expected_path.is_some_and(|expected_path| expected_path != path) {
        // The request is resolved to a different file, e.g. because of an alias. Bundle it.
        return Ok(ResolveResultOption::none());
    }
    let file_type = get_file_type(path, path).await?;

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
            let node_resolve_options = node_cjs_resolve_options();
            let node_resolved = resolve(
                lookup_path.clone(),
                reference_type.clone(),
                request,
                node_resolve_options,
            );
            let resolves_equal = if let Some(result) = node_resolved.await?.first_source() {
                let ident = result.ident().await?;
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

    let target = result_from_original_location.ident().await?.path.clone();

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

#[derive(PartialEq, Eq, Debug, NonLocalValue, Encode, Decode)]
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
    let path_glob = Glob::new(
        format!("**/node_modules/{{{}}}/**", packages.join(",")).into(),
        GlobOptions::default(),
    );
    let request_glob = Glob::new(
        format!("{{{},{}/**}}", packages.join(","), packages.join("/**,")).into(),
        GlobOptions::default(),
    );
    Ok(Vc::cell(Some(PackagesGlobs {
        path_glob: path_glob.to_resolved().await?,
        request_glob: request_glob.to_resolved().await?,
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
