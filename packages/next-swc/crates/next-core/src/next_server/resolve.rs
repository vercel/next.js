use anyhow::Result;
use turbo_tasks::Vc;
use turbopack_binding::{
    turbo::tasks_fs::{glob::Glob, FileJsonContent, FileSystemPath},
    turbopack::core::{
        resolve::{
            find_context_file,
            node::node_cjs_resolve_options,
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
}

#[turbo_tasks::value_impl]
impl ExternalCjsModulesResolvePlugin {
    #[turbo_tasks::function]
    pub fn new(
        project_path: Vc<FileSystemPath>,
        root: Vc<FileSystemPath>,
        predicate: Vc<ExternalPredicate>,
    ) -> Vc<Self> {
        ExternalCjsModulesResolvePlugin {
            project_path,
            root,
            predicate,
        }
        .cell()
    }
}

#[turbo_tasks::function]
async fn is_node_resolveable(
    context: Vc<FileSystemPath>,
    request: Vc<Request>,
    expected: Vc<FileSystemPath>,
) -> Result<Vc<bool>> {
    let node_resolve_result = resolve(context, request, node_cjs_resolve_options(context.root()));
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

        // node.js only supports these file extensions
        // mjs is an esm module and we can't bundle that yet
        if !matches!(
            raw_fs_path.extension_ref(),
            Some("cjs" | "js" | "node" | "json")
        ) {
            return Ok(ResolveResultOption::none());
        }

        let FindContextFileResult::Found(package_json, _) =
            *find_context_file(fs_path.parent(), package_json()).await?
        else {
            // can't find package.json
            return Ok(ResolveResultOption::none());
        };
        let FileJsonContent::Content(package) = &*package_json.read_json().await? else {
            // can't parse package.json
            return Ok(ResolveResultOption::none());
        };

        // always bundle esm modules
        if let Some("module") = package["type"].as_str() {
            return Ok(ResolveResultOption::none());
        }

        // check if we can resolve the package from the project dir with node.js resolve
        // options (might be hidden by pnpm)
        if *is_node_resolveable(self.project_path, request, fs_path).await? {
            // mark as external
            return Ok(ResolveResultOption::some(
                ResolveResult::primary(ResolveResultItem::OriginalReferenceExternal).cell(),
            ));
        }

        Ok(ResolveResultOption::none())
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
