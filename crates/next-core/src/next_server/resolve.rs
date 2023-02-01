use anyhow::Result;
use turbo_tasks::primitives::StringsVc;
use turbo_tasks_fs::{glob::GlobVc, FileJsonContent, FileSystemPathVc};
use turbopack_core::resolve::{
    find_context_file, package_json,
    parse::RequestVc,
    plugin::{ResolvePlugin, ResolvePluginConditionVc, ResolvePluginVc},
    FindContextFileResult, ResolveResult, ResolveResultOptionVc, SpecialType,
};

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

#[turbo_tasks::value_impl]
impl ResolvePlugin for ExternalCjsModulesResolvePlugin {
    #[turbo_tasks::function]
    fn condition(&self) -> ResolvePluginConditionVc {
        ResolvePluginConditionVc::new(self.root, GlobVc::new("**/node_modules"))
    }

    #[turbo_tasks::function]
    async fn after_resolve(
        &self,
        fs_path: FileSystemPathVc,
        _request: RequestVc,
    ) -> Result<ResolveResultOptionVc> {
        let raw_fs_path = &*fs_path.await?;

        // always bundle transpiled modules
        let transpiled_glob = packages_glob(self.transpiled_packages).await?;
        if transpiled_glob.execute(&raw_fs_path.path) {
            return Ok(ResolveResultOptionVc::none());
        }

        // mjs -> esm module
        if Some("mjs") == raw_fs_path.extension() {
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

        // make sure we have a full package
        let Some(package_name) = package["name"].as_str() else {
            return Ok(ResolveResultOptionVc::none());
        };

        // check if we can resolve the package from the root dir (might be hidden by
        // pnpm)
        let FileJsonContent::Content(resolved_package) = &*self
            .root
            .join(&format!("node_modules/{}/package.json", package_name))
            .read_json()
            .await?
        else {
            return Ok(ResolveResultOptionVc::none());
        };

        // only mark external if the package.json files are the same
        if resolved_package != package {
            return Ok(ResolveResultOptionVc::none());
        }

        // mark as external
        Ok(ResolveResultOptionVc::some(
            ResolveResult::Special(SpecialType::OriginalReferenceExternal, Vec::new()).cell(),
        ))
    }
}

#[turbo_tasks::function]
async fn packages_glob(packages: StringsVc) -> Result<GlobVc> {
    Ok(GlobVc::new(&format!(
        "**/node_modules/{{{}}}/**",
        packages.await?.join(",")
    )))
}
