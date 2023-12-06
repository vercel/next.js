use anyhow::Result;
use turbo_tasks::{Value, Vc};
use turbopack_binding::{
    turbo::tasks_fs::{glob::Glob, FileJsonContent, FileSystemPath},
    turbopack::core::{
        reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
        resolve::{
            find_context_file,
            node::{node_cjs_resolve_options, node_esm_resolve_options},
            package_json,
            parse::Request,
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
        let never_external_regex = lazy_regex::regex!("^(?:private-next-pages\\/|next\\/(?:dist\\/pages\\/|(?:app|document|link|image|legacy\\/image|constants|dynamic|script|navigation|headers|router)$)|string-hash|private-next-rsc-action-validate|private-next-rsc-action-client-wrapper|private-next-rsc-action-proxy$)");

        if never_external_regex.is_match(&request_value.request().unwrap_or_default()) {
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

        let is_esm = self.import_externals
            && ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined)
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

        let node_resolved = resolve(
            context,
            reference_type.clone(),
            request,
            if is_esm {
                node_esm_resolve_options(context.root())
            } else {
                node_cjs_resolve_options(context.root())
            },
        );
        let Some(result) = *node_resolved.first_source().await? else {
            // this can't resolve with node.js, so bundle it
            return Ok(ResolveResultOption::none());
        };
        let path = result.ident().path();
        let file_type = get_file_type(path, &*path.await?).await?;

        match (file_type, is_esm) {
            (FileType::Unsupported, _) => {
                // unsupported file type, bundle it
                Ok(ResolveResultOption::none())
            }
            (FileType::CommonJs, _) | (FileType::EcmaScriptModule, true) => {
                if let Some(request) = request.await?.request() {
                    // mark as external
                    Ok(ResolveResultOption::some(
                        ResolveResult::primary(ResolveResultItem::OriginalReferenceTypeExternal(
                            request,
                        ))
                        .cell(),
                    ))
                } else {
                    // unsupported request, bundle it
                    Ok(ResolveResultOption::none())
                }
            }
            (FileType::EcmaScriptModule, false) => {
                // even with require() this resolves to a ESM,
                // which would break node.js, bundle it
                Ok(ResolveResultOption::none())
            }
        }
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
