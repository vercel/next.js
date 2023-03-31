use anyhow::{anyhow, bail, Result};
use indexmap::indexmap;
use turbo_binding::{
    turbo::{
        tasks::Value,
        tasks_fs::{rope::RopeBuilder, File, FileContent, FileContentVc, FileSystemPathVc},
    },
    turbopack::{
        core::{
            issue::{IssueSeverity, OptionIssueSourceVc},
            asset::{Asset, AssetVc},
            chunk::ChunkingContextVc,
            compile_time_info::CompileTimeInfoVc,
            context::AssetContext,
            reference_type::EcmaScriptModulesReferenceSubType,
            resolve::parse::RequestVc,
            virtual_asset::VirtualAssetVc,
        },
        ecmascript::{
            chunk_group_files_asset::ChunkGroupFilesAsset, resolve::esm_resolve,
            utils::StringifyJs, EcmascriptInputTransform, EcmascriptInputTransformsVc,
            EcmascriptModuleAssetType, EcmascriptModuleAssetVc, InnerAssetsVc,
        },
        turbopack::{
            module_options::ModuleOptionsContextVc,
            resolve_options_context::ResolveOptionsContextVc,
            transition::{Transition, TransitionVc},
            ModuleAssetContextVc,
        },
    },
};

#[turbo_tasks::value(shared)]
pub struct NextEdgeTransition {
    pub edge_compile_time_info: CompileTimeInfoVc,
    pub edge_chunking_context: ChunkingContextVc,
    pub edge_module_options_context: Option<ModuleOptionsContextVc>,
    pub edge_resolve_options_context: ResolveOptionsContextVc,
    pub output_path: FileSystemPathVc,
    pub base_path: FileSystemPathVc,
    pub bootstrap_file: FileContentVc,
    pub entry_name: String,
}

#[turbo_tasks::value_impl]
impl Transition for NextEdgeTransition {
    #[turbo_tasks::function]
    fn process_compile_time_info(
        &self,
        _compile_time_info: CompileTimeInfoVc,
    ) -> CompileTimeInfoVc {
        self.edge_compile_time_info
    }

    #[turbo_tasks::function]
    fn process_module_options_context(
        &self,
        context: ModuleOptionsContextVc,
    ) -> ModuleOptionsContextVc {
        self.edge_module_options_context.unwrap_or(context)
    }

    #[turbo_tasks::function]
    fn process_resolve_options_context(
        &self,
        _context: ResolveOptionsContextVc,
    ) -> ResolveOptionsContextVc {
        self.edge_resolve_options_context
    }

    #[turbo_tasks::function]
    async fn process_module(
        &self,
        asset: AssetVc,
        context: ModuleAssetContextVc,
    ) -> Result<AssetVc> {
        let FileContent::Content(base) = &*self.bootstrap_file.await? else {
            bail!("runtime code not found");
        };
        let path = asset.ident().path().await?;
        let path = self
            .base_path
            .await?
            .get_path_to(&path)
            .ok_or_else(|| anyhow!("asset is not in base_path"))?;
        let path = if let Some((name, ext)) = path.rsplit_once('.') {
            if !ext.contains('/') {
                name
            } else {
                path
            }
        } else {
            path
        };

        let resolve_origin = if let Some(m) = EcmascriptModuleAssetVc::resolve_from(asset).await? {
            m.as_resolve_origin()
        } else {
            bail!("asset does not represent an ecmascript module");
        };

        // TODO: this is where you'd switch the route kind to the one you need
        let route_module_kind = "app-route";
        let pathname = normalize_app_page_to_pathname(path);

        let mut new_content = RopeBuilder::from(
            format!(
                "const NAME={};\nconst PAGE = {};\nconst PATHNAME = {};\n",
                StringifyJs(&self.entry_name),
                StringifyJs(path),
                StringifyJs(&pathname),
            )
            .into_bytes(),
        );
        new_content.concat(base.content());
        let file = File::from(new_content.build());
        let virtual_asset = VirtualAssetVc::new(
            asset.ident().path().join("next-edge-bootstrap.ts"),
            FileContent::Content(file).cell().into(),
        );

        let resolved_route_module_asset = esm_resolve(
            resolve_origin,
            RequestVc::parse_string(format!(
                "next/dist/server/future/route-modules/{}/module",
                route_module_kind
            )),
            Value::new(EcmaScriptModulesReferenceSubType::Undefined),
            OptionIssueSourceVc::none(),
            IssueSeverity::Error.cell(),
        );
        let route_module_asset = match &*resolved_route_module_asset.first_asset().await? {
            Some(a) => *a,
            None => bail!("could not find app asset"),
        };

        let new_asset = EcmascriptModuleAssetVc::new_with_inner_assets(
            virtual_asset.into(),
            context.into(),
            Value::new(EcmascriptModuleAssetType::Typescript),
            EcmascriptInputTransformsVc::cell(vec![EcmascriptInputTransform::TypeScript {
                use_define_for_class_fields: false,
            }]),
            Default::default(),
            context.compile_time_info(),
            InnerAssetsVc::cell(indexmap! {
                "ENTRY".to_string() => asset,
                "ROUTE_MODULE".to_string() => route_module_asset
            }),
        );

        let asset = ChunkGroupFilesAsset {
            asset: new_asset.into(),
            client_root: self.output_path,
            chunking_context: self.edge_chunking_context,
            runtime_entries: None,
        };

        Ok(asset.cell().into())
    }
}

/// This normalizes an app page to a pathname.
fn normalize_app_page_to_pathname(page: &str) -> String {
    // Split the page string by '/' and collect it into a Vec<&str>.
    let segments: Vec<&str> = page.split('/').collect();
    let segment_count = segments.len();
    let mut pathname = String::new();

    for (index, segment) in segments.into_iter().enumerate() {
        // If a segment is empty, return the current pathname without modification.
        if segment.is_empty()
            // If a segment starts with '(' and ends with ')', return the current pathname
            // without modification, effectively ignoring the segment.
            || (segment.starts_with('(') && segment.ends_with(')'))
            // If a segment starts with '@', return the current pathname without
            // modification, effectively ignoring the segment.
            || segment.starts_with('@')
            // If the segment is "page" or "route" and it's the last one, return the current
            // pathname without modification, effectively ignoring the segment.
            || ((segment == "page" || segment == "route") && index == segment_count - 1)
        {
            continue;
        }

        pathname.push('/');

        // Replace '%5F' with '_' in the segment only if it's present at the beginning
        // using the `replace` method.
        if let Some(rest) = segment.strip_prefix("%5F") {
            pathname.push('_');
            pathname.push_str(rest);
        } else {
            pathname.push_str(segment);
        }
    }

    pathname
}

#[cfg(test)]
mod tests {
    use super::normalize_app_page_to_pathname;

    #[test]
    fn test_normalize() {
        assert_eq!(
            normalize_app_page_to_pathname("/some/[route]/route"),
            "/some/[route]"
        );
        assert_eq!(
            normalize_app_page_to_pathname("/another/route/(dashboard)/inside/page"),
            "/another/route/inside"
        );
    }

    #[test]
    fn test_leading_slash() {
        assert_eq!(
            normalize_app_page_to_pathname("no/leading/slash"),
            "/no/leading/slash"
        );
    }

    #[test]
    fn test_ignore_empty_segments() {
        assert_eq!(
            normalize_app_page_to_pathname("/ignore//empty///segments"),
            "/ignore/empty/segments"
        );
    }

    #[test]
    fn test_ignore_groups() {
        assert_eq!(
            normalize_app_page_to_pathname("/ignore/(group)/segments"),
            "/ignore/segments"
        );
    }

    #[test]
    fn test_ignore_parallel_segments() {
        assert_eq!(
            normalize_app_page_to_pathname("/ignore/@parallel/segments"),
            "/ignore/segments"
        );
    }

    #[test]
    fn test_replace_percent_5f() {
        assert_eq!(
            normalize_app_page_to_pathname("/replace%5Fwith_underscore"),
            "/replace%5Fwith_underscore"
        );
        assert_eq!(
            normalize_app_page_to_pathname("/%5Freplace%5Fwith_underscore"),
            "/_replace%5Fwith_underscore"
        );
        assert_eq!(
            normalize_app_page_to_pathname(
                "/replace%5Fwith_underscore/%5Freplace%5Fwith_underscore"
            ),
            "/replace%5Fwith_underscore/_replace%5Fwith_underscore"
        );
    }

    #[test]
    fn test_complex_example() {
        assert_eq!(
            normalize_app_page_to_pathname("/test/@parallel/(group)//segments/page"),
            "/test/segments"
        );
    }
}
