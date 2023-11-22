use anyhow::Result;
use turbo_tasks::{Value, Vc};
use turbopack_binding::{
    turbo::tasks_fs::{glob::Glob, FileJsonContent, FileSystemPath},
    turbopack::core::{
        reference_type::{
            CommonJsReferenceSubType, EcmaScriptModulesReferenceSubType, ReferenceType,
        },
        resolve::{
            find_context_file,
            node::{node_cjs_resolve_options, node_esm_resolve_options},
            package_json,
            parse::Request,
            pattern::Pattern,
            plugin::{ResolvePlugin, ResolvePluginCondition},
            resolve, FindContextFileResult, ResolveResult, ResolveResultItem, ResolveResultOption,
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
async fn is_node_resolveable(
    context: Vc<FileSystemPath>,
    request: Vc<Request>,
    expected: Vc<FileSystemPath>,
    is_esm: bool,
) -> Result<Vc<bool>> {
    let node_resolve_result = if is_esm {
        resolve(
            context,
            Value::new(ReferenceType::EcmaScriptModules(
                EcmaScriptModulesReferenceSubType::Undefined,
            )),
            request,
            node_esm_resolve_options(context.root()),
        )
    } else {
        resolve(
            context,
            Value::new(ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined)),
            request,
            node_cjs_resolve_options(context.root()),
        )
    };
    let primary_node_assets = node_resolve_result.primary_sources().await?;
    let Some(&node_asset) = primary_node_assets.first() else {
        // can't resolve request with node.js options
        return Ok(Vc::cell(false));
    };

    if node_asset.ident().path().resolve().await? != expected.resolve().await? {
        // node.js resolves to a different file
        return Ok(Vc::cell(false));
    }

    Ok(Vc::cell(true))
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
        if !matches!(&*request.await?, Request::Module { .. }) {
            return Ok(ResolveResultOption::none());
        }

        let raw_fs_path = &*fs_path.await?;

        let predicate = self.predicate.await?;
        match &*predicate {
            ExternalPredicate::AllExcept(exceptions) => {
                let exception_glob = packages_glob(*exceptions).await?;

                if let Some(exception_glob) = *exception_glob {
                    if exception_glob.await?.execute(&raw_fs_path.path) {
                        return Ok(ResolveResultOption::none());
                    }
                }
            }
            ExternalPredicate::Only(externals) => {
                let external_glob = packages_glob(*externals).await?;

                if let Some(external_glob) = *external_glob {
                    if !external_glob.await?.execute(&raw_fs_path.path) {
                        return Ok(ResolveResultOption::none());
                    }
                } else {
                    return Ok(ResolveResultOption::none());
                }
            }
        }

        let is_esm = ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined)
            .includes(&reference_type);

        enum FileType {
            CommonJs,
            EcmaScriptModule,
            Unsupported,
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
                    return Ok(FileType::Unsupported);
                };

                if let Some("module") = package["type"].as_str() {
                    return Ok(FileType::EcmaScriptModule);
                }

                return Ok(FileType::CommonJs);
            }

            Ok(FileType::Unsupported)
        }

        let file_type = get_file_type(fs_path, raw_fs_path).await?;

        let (expected, is_esm) = match (file_type, is_esm) {
            (FileType::Unsupported, _) => {
                // unsupported file type, bundle it
                return Ok(ResolveResultOption::none());
            }
            (FileType::CommonJs, false) => (fs_path, false),
            (FileType::CommonJs, true) => (fs_path, self.import_externals),
            (FileType::EcmaScriptModule, false) => (fs_path, false),
            (FileType::EcmaScriptModule, true) => {
                if self.import_externals {
                    (fs_path, true)
                } else {
                    // We verify with the CommonJS alternative
                    let cjs_resolved = resolve(
                        context,
                        reference_type.clone(),
                        request,
                        node_cjs_resolve_options(context.root()),
                    );
                    let Some(result) = *cjs_resolved.first_source().await? else {
                        // this can't resolve with commonjs, so bundle it
                        return Ok(ResolveResultOption::none());
                    };
                    let path = result.ident().path();
                    let file_type = get_file_type(path, &*path.await?).await?;
                    if !matches!(file_type, FileType::CommonJs) {
                        // even with require() this resolves to a ESM, which would break node.js
                        // bundle it
                        // This happens for invalid packages like `textlinestream`
                        return Ok(ResolveResultOption::none());
                    }

                    (path, false)
                }
            }
        };

        let is_resolveable =
            *is_node_resolveable(self.project_path, request, expected, is_esm).await?;

        if !is_resolveable {
            if is_esm {
                // When it's not resolveable as ESM, there is maybe an extension missing,
                // try to add .js
                if let Some(mut request_str) = request.await?.request() {
                    if !request_str.ends_with(".js") {
                        request_str += ".js";
                        let new_request =
                            Request::parse(Value::new(Pattern::Constant(request_str.clone())));
                        let is_resolveable =
                            *is_node_resolveable(self.project_path, new_request, expected, is_esm)
                                .await?;
                        if is_resolveable {
                            // mark as external, but with .js extension
                            return Ok(ResolveResultOption::some(
                                ResolveResult::primary(
                                    ResolveResultItem::OriginalReferenceTypeExternal(request_str),
                                )
                                .cell(),
                            ));
                        }
                    }
                }
            }

            // this can't resolve with node.js, so bundle it
            return Ok(ResolveResultOption::none());
        }

        // mark as external
        Ok(ResolveResultOption::some(
            ResolveResult::primary(ResolveResultItem::OriginalReferenceExternal).cell(),
        ))
    }
}

// TODO move that to turbo
#[turbo_tasks::value(transparent)]
pub struct OptionGlob(Option<Vc<Glob>>);

#[turbo_tasks::function]
async fn packages_glob(packages: Vc<Vec<String>>) -> Result<Vc<OptionGlob>> {
    let packages = packages.await?;
    if packages.is_empty() {
        return Ok(Vc::cell(None));
    }
    Ok(Vc::cell(Some(
        Glob::new(format!("**/node_modules/{{{}}}/**", packages.join(",")))
            .resolve()
            .await?,
    )))
}
