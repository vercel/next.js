use anyhow::Result;
use once_cell::sync::Lazy;
use regex::Regex;
use turbo_binding::{
    turbo::tasks_fs::{glob::GlobVc, FileJsonContent, FileSystemPathVc},
    turbopack::core::{
        asset::Asset,
        resolve::{
            find_context_file,
            node::node_cjs_resolve_options,
            package_json,
            parse::{Request, RequestVc},
            plugin::{ResolvePlugin, ResolvePluginConditionVc, ResolvePluginVc},
            resolve, FindContextFileResult, PrimaryResolveResult, ResolveResult,
            ResolveResultOptionVc,
        },
    },
};
use turbo_tasks::primitives::{BoolVc, StringsVc};

#[turbo_tasks::value]
pub(crate) struct ExternalCjsModulesResolvePlugin {
    root: FileSystemPathVc,
    transpiled_packages: StringsVc,
}

#[turbo_tasks::value_impl]
impl ExternalCjsModulesResolvePluginVc {
    #[turbo_tasks::function]
    pub fn new(root: FileSystemPathVc, transpiled_packages: StringsVc) -> Self {
        ExternalCjsModulesResolvePlugin {
            root,
            transpiled_packages,
        }
        .cell()
    }
}

#[turbo_tasks::function]
async fn is_node_resolveable(
    context: FileSystemPathVc,
    request: RequestVc,
    expected: FileSystemPathVc,
) -> Result<BoolVc> {
    let node_resolve_result = resolve(context, request, node_cjs_resolve_options(context.root()));
    let primary_node_assets = node_resolve_result.primary_assets().await?;
    let Some(node_asset) = primary_node_assets.first() else {
        // can't resolve request with node.js options
        return Ok(BoolVc::cell(false));
    };

    if node_asset.ident().path().resolve().await? != expected.resolve().await? {
        // node.js resolves to a different file
        return Ok(BoolVc::cell(false));
    }

    Ok(BoolVc::cell(true))
}

static PNPM: Lazy<Regex> = Lazy::new(|| Regex::new(r"(?:/|^)node_modules/(.pnpm/.+)").unwrap());

#[turbo_tasks::function]
fn condition(root: FileSystemPathVc) -> ResolvePluginConditionVc {
    ResolvePluginConditionVc::new(root.root(), GlobVc::new("**/node_modules/**"))
}

#[turbo_tasks::value_impl]
impl ResolvePlugin for ExternalCjsModulesResolvePlugin {
    #[turbo_tasks::function]
    fn after_resolve_condition(&self) -> ResolvePluginConditionVc {
        condition(self.root)
    }

    #[turbo_tasks::function]
    async fn after_resolve(
        &self,
        fs_path: FileSystemPathVc,
        context: FileSystemPathVc,
        request: RequestVc,
    ) -> Result<ResolveResultOptionVc> {
        if *condition(self.root).matches(context).await? {
            return Ok(ResolveResultOptionVc::none());
        }
        if !matches!(&*request.await?, Request::Module { .. }) {
            return Ok(ResolveResultOptionVc::none());
        }

        let raw_fs_path = &*fs_path.await?;

        // always bundle transpiled modules
        let transpiled_glob = packages_glob(self.transpiled_packages).await?;
        if transpiled_glob.execute(&raw_fs_path.path) {
            return Ok(ResolveResultOptionVc::none());
        }

        // node.js only supports these file extensions
        // mjs is an esm module and we can't bundle that yet
        if !matches!(
            raw_fs_path.extension(),
            Some("cjs" | "js" | "node" | "json")
        ) {
            return Ok(ResolveResultOptionVc::none());
        }

        let FindContextFileResult::Found(package_json, _) =
            *find_context_file(fs_path.parent(), package_json()).await?
        else {
            // can't find package.json
            return Ok(ResolveResultOptionVc::none());
        };
        let FileJsonContent::Content(package) = &*package_json.read_json().await? else {
            // can't parse package.json
            return Ok(ResolveResultOptionVc::none());
        };

        // always bundle esm modules
        if let Some("module") = package["type"].as_str() {
            return Ok(ResolveResultOptionVc::none());
        }

        // check if we can resolve the package from the project dir with node.js resolve
        // options (might be hidden by pnpm)
        if *is_node_resolveable(self.root.root(), request, fs_path).await? {
            // mark as external
            return Ok(ResolveResultOptionVc::some(
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
                    return Ok(ResolveResultOptionVc::some(
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
        Ok(ResolveResultOptionVc::none())
    }
}

#[turbo_tasks::function]
async fn packages_glob(packages: StringsVc) -> Result<GlobVc> {
    Ok(GlobVc::new(&format!(
        "**/node_modules/{{{}}}/**",
        packages.await?.join(",")
    )))
}
