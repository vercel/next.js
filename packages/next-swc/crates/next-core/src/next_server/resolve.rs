use anyhow::Result;
use once_cell::sync::Lazy;
use regex::Regex;
use turbo_tasks::Vc;
use turbopack_binding::{
    turbo::tasks_fs::{glob::Glob, FileJsonContent, FileSystemPath},
    turbopack::core::{
        asset::Asset,
        resolve::{
            find_context_file,
            node::node_cjs_resolve_options,
            package_json,
            parse::Request,
            plugin::{ResolvePlugin, ResolvePluginCondition},
            resolve, FindContextFileResult, PrimaryResolveResult, ResolveResult,
            ResolveResultOption,
        },
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
    root: Vc<FileSystemPath>,
    predicate: Vc<ExternalPredicate>,
}

#[turbo_tasks::value_impl]
impl ExternalCjsModulesResolvePlugin {
    #[turbo_tasks::function]
    pub fn new(root: Vc<FileSystemPath>, predicate: Vc<ExternalPredicate>) -> Vc<Self> {
        ExternalCjsModulesResolvePlugin { root, predicate }.cell()
    }
}

#[turbo_tasks::function]
async fn is_node_resolveable(
    context: Vc<FileSystemPath>,
    request: Vc<Request>,
    expected: Vc<FileSystemPath>,
) -> Result<Vc<bool>> {
    let node_resolve_result = resolve(context, request, node_cjs_resolve_options(context.root()));
    let primary_node_assets = node_resolve_result.primary_assets().await?;
    let Some(node_asset) = primary_node_assets.first() else {
        // can't resolve request with node.js options
        return Ok(Vc::cell(false));
    };

    if node_asset.ident().path().resolve().await? != expected.resolve().await? {
        // node.js resolves to a different file
        return Ok(Vc::cell(false));
    }

    Ok(Vc::cell(true))
}

static PNPM: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?:/|^)node_modules/(.pnpm/.+)").unwrap());

#[turbo_tasks::function]
fn condition(root: Vc<FileSystemPath>) -> Vc<ResolvePluginCondition> {
    ResolvePluginCondition::new(root.root(), Glob::new("**/node_modules/**".to_string()))
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

                if exception_glob.execute(&raw_fs_path.path) {
                    return Ok(ResolveResultOption::none());
                }
            }
            ExternalPredicate::Only(externals) => {
                let external_glob = packages_glob(*externals).await?;

                if !external_glob.execute(&raw_fs_path.path) {
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
        if *is_node_resolveable(self.root.root(), request, fs_path).await? {
            // mark as external
            return Ok(ResolveResultOption::some(
                ResolveResult::primary(PrimaryResolveResult::OriginalReferenceExternal).cell(),
            ));
        }

        // Special behavior for pnpm as we could reference all .pnpm modules by
        // referencing the `.pnpm` folder as module, e. g.
        // /node_modules/.pnpm/some-package@2.29.2/node_modules/some-package/dir/file.js
        // becomes
        // .pnpm/some-package@2.29.2/node_modules/some-package/dir/file.js
        if let Some(captures) = PNPM.captures(&fs_path.await?.path) {
            if let Some(import_path) = captures.get(1) {
                // we could load it directly as external, but we want to make sure node.js would
                // resolve it the same way e. g. that we didn't follow any special resolve
                // options, to come here like the `module` field in package.json
                if *is_node_resolveable(context, request, fs_path).await? {
                    // mark as external
                    return Ok(ResolveResultOption::some(
                        ResolveResult::primary(
                            PrimaryResolveResult::OriginalReferenceTypeExternal(
                                import_path.as_str().to_string(),
                            ),
                        )
                        .cell(),
                    ));
                }
            }
        }
        Ok(ResolveResultOption::none())
    }
}

#[turbo_tasks::function]
async fn packages_glob(packages: Vc<Vec<String>>) -> Result<Vc<Glob>> {
    Ok(Glob::new(format!(
        "**/node_modules/{{{}}}/**",
        packages.await?.join(",")
    )))
}
