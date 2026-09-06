use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, ResolvedVc, ValueToStringRef, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack::{ModuleAssetContext, transition::Transition};
use turbopack_core::{
    file_source::FileSource,
    module::Module,
    reference_type::{EcmaScriptModulesReferenceSubType, ReferenceType},
    source::Source,
};
use turbopack_ecmascript::{magic_identifier, utils::StringifyJs};

pub struct BaseLoaderTreeBuilder {
    pub inner_assets: FxIndexMap<RcStr, ResolvedVc<Box<dyn Module>>>,
    counter: usize,
    pub imports: Vec<(u32, RcStr)>,
    pub module_asset_context: ResolvedVc<ModuleAssetContext>,
    pub server_component_transition: ResolvedVc<Box<dyn Transition>>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AppDirModuleType {
    Page,
    DefaultPage,
    Error,
    Layout,
    Loading,
    Template,
    NotFound,
    Forbidden,
    Unauthorized,
    GlobalError,
    GlobalNotFound,
}

impl AppDirModuleType {
    pub fn name(&self) -> &'static str {
        match self {
            AppDirModuleType::Page => "page",
            AppDirModuleType::DefaultPage => "defaultPage",
            AppDirModuleType::Error => "error",
            AppDirModuleType::Layout => "layout",
            AppDirModuleType::Loading => "loading",
            AppDirModuleType::Template => "template",
            AppDirModuleType::NotFound => "not-found",
            AppDirModuleType::Forbidden => "forbidden",
            AppDirModuleType::Unauthorized => "unauthorized",
            AppDirModuleType::GlobalError => "global-error",
            AppDirModuleType::GlobalNotFound => "global-not-found",
        }
    }
}

impl BaseLoaderTreeBuilder {
    pub fn new(
        module_asset_context: ResolvedVc<ModuleAssetContext>,
        server_component_transition: ResolvedVc<Box<dyn Transition>>,
    ) -> Self {
        BaseLoaderTreeBuilder {
            inner_assets: FxIndexMap::default(),
            counter: 0,
            imports: Vec::new(),
            module_asset_context,
            server_component_transition,
        }
    }

    pub fn unique_number(&mut self) -> usize {
        let i = self.counter;
        self.counter += 1;
        i
    }

    pub fn process_source(&self, source: Vc<Box<dyn Source>>) -> Vc<Box<dyn Module>> {
        let reference_type =
            ReferenceType::EcmaScriptModules(EcmaScriptModulesReferenceSubType::Undefined);

        self.server_component_transition
            .process(source, *self.module_asset_context, reference_type)
            .module()
    }

    pub fn process_module(&self, module: Vc<Box<dyn Module>>) -> Vc<Box<dyn Module>> {
        self.server_component_transition
            .process_module(module, *self.module_asset_context)
    }

    /// The getters use `require()` instead of ESM imports so that the relative
    /// order of items is retained (which isn't the case when mixing ESM
    /// imports and requires).
    pub fn create_module_getter_declaration(
        &mut self,
        position: u32,
        identifier: &str,
        inner_module_id: &str,
    ) {
        self.imports.push((
            position,
            format!(
                "const {identifier} = instrumentModuleGetter(() => \
                 require(/*turbopackChunkingType: shared*/{inner_module_id}));",
                inner_module_id = StringifyJs(inner_module_id)
            )
            .into(),
        ));
    }

    pub async fn create_module_tuple_code(
        &mut self,
        module_type: AppDirModuleType,
        path: FileSystemPath,
        position: u32,
    ) -> Result<String> {
        let name = module_type.name();
        let i = self.unique_number();
        let identifier = magic_identifier::mangle(&format!("{name} #{i}"));

        self.create_module_getter_declaration(position, &identifier, &format!("MODULE_{i}"));

        let module = self
            .process_source(Vc::upcast(FileSource::new(path.clone())))
            .to_resolved()
            .await?;

        self.inner_assets
            .insert(format!("MODULE_{i}").into(), module);

        // Use the original source path, not the transformed module path.
        // This is important for MDX files where page.mdx becomes page.mdx.tsx after
        // transformation, but the font manifest uses the original source path.
        let module_path = path.to_string_ref().await?;

        Ok(format!(
            "[{identifier}, {path}]",
            path = StringifyJs(&module_path),
        ))
    }
}
