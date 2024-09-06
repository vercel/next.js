use anyhow::Result;
use serde_json::Value as JsonValue;
use turbo_tasks::{RcStr, Value, ValueToString, Vc};
use turbo_tasks_fs::DirectoryContent;
use turbopack_core::{
    asset::{Asset, AssetContent},
    ident::AssetIdent,
    issue::IssueSeverity,
    module::Module,
    raw_module::RawModule,
    reference::{ModuleReference, ModuleReferences},
    reference_type::{CommonJsReferenceSubType, ReferenceType},
    resolve::{
        origin::{ResolveOrigin, ResolveOriginExt},
        parse::Request,
        ModuleResolveResult,
    },
    source::Source,
};
// TODO remove this
pub use turbopack_resolve::typescript as resolve;
use turbopack_resolve::{
    ecmascript::{apply_cjs_specific_options, cjs_resolve},
    typescript::{read_from_tsconfigs, read_tsconfigs, type_resolve},
};

#[turbo_tasks::value]
pub struct TsConfigModuleAsset {
    pub source: Vc<Box<dyn Source>>,
    pub origin: Vc<Box<dyn ResolveOrigin>>,
}

#[turbo_tasks::value_impl]
impl TsConfigModuleAsset {
    #[turbo_tasks::function]
    pub fn new(origin: Vc<Box<dyn ResolveOrigin>>, source: Vc<Box<dyn Source>>) -> Vc<Self> {
        Self::cell(TsConfigModuleAsset { origin, source })
    }
}

#[turbo_tasks::value_impl]
impl Module for TsConfigModuleAsset {
    #[turbo_tasks::function]
    fn ident(&self) -> Vc<AssetIdent> {
        self.source.ident()
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<ModuleReferences>> {
        let mut references = Vec::new();
        let configs = read_tsconfigs(
            self.source.content().file_content(),
            self.source,
            apply_cjs_specific_options(self.origin.resolve_options(Value::new(
                ReferenceType::CommonJs(CommonJsReferenceSubType::Undefined),
            ))),
        )
        .await?;
        for (_, config_asset) in configs[1..].iter() {
            references.push(Vc::upcast(TsExtendsReference::new(*config_asset)));
        }
        // ts-node options
        {
            let compiler = read_from_tsconfigs(&configs, |json, source| {
                json["ts-node"]["compiler"]
                    .as_str()
                    .map(|s| (source, s.to_string()))
            })
            .await?;
            let compiler: RcStr = compiler
                .map(|(_, c)| c)
                .unwrap_or_else(|| "typescript".to_string())
                .into();
            references.push(Vc::upcast(CompilerReference::new(
                self.origin,
                Request::parse(Value::new(compiler.into())),
            )));
            let require = read_from_tsconfigs(&configs, |json, source| {
                if let JsonValue::Array(array) = &json["ts-node"]["require"] {
                    Some(
                        array
                            .iter()
                            .filter_map(|name| name.as_str().map(|s| (source, RcStr::from(s))))
                            .collect::<Vec<_>>(),
                    )
                } else {
                    None
                }
            })
            .await?;
            if let Some(require) = require {
                for (_, request) in require {
                    references.push(Vc::upcast(TsNodeRequireReference::new(
                        self.origin,
                        Request::parse(Value::new(request.into())),
                    )));
                }
            }
        }
        // compilerOptions
        {
            let types = read_from_tsconfigs(&configs, |json, source| {
                if let JsonValue::Array(array) = &json["compilerOptions"]["types"] {
                    Some(
                        array
                            .iter()
                            .filter_map(|name| name.as_str().map(|s| (source, RcStr::from(s))))
                            .collect::<Vec<_>>(),
                    )
                } else {
                    None
                }
            })
            .await?;
            let types = if let Some(types) = types {
                types
            } else {
                let mut all_types = Vec::new();
                let mut current = self.source.ident().path().parent().resolve().await?;
                loop {
                    if let DirectoryContent::Entries(entries) = &*current
                        .join("node_modules/@types".into())
                        .read_dir()
                        .await?
                    {
                        all_types.extend(entries.iter().filter_map(|(name, _)| {
                            if name.starts_with('.') {
                                None
                            } else {
                                Some((self.source, name.clone()))
                            }
                        }));
                    }
                    let parent = current.parent().resolve().await?;
                    if parent == current {
                        break;
                    }
                    current = parent;
                }
                all_types
            };
            for (_, name) in types {
                references.push(Vc::upcast(TsConfigTypesReference::new(
                    self.origin,
                    Request::module(
                        name,
                        Value::new(RcStr::default().into()),
                        Vc::<RcStr>::default(),
                        Vc::<RcStr>::default(),
                    ),
                )));
            }
        }
        Ok(Vc::cell(references))
    }
}

#[turbo_tasks::value_impl]
impl Asset for TsConfigModuleAsset {
    #[turbo_tasks::function]
    fn content(&self) -> Vc<AssetContent> {
        self.source.content()
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct CompilerReference {
    pub origin: Vc<Box<dyn ResolveOrigin>>,
    pub request: Vc<Request>,
}

#[turbo_tasks::value_impl]
impl CompilerReference {
    #[turbo_tasks::function]
    pub fn new(origin: Vc<Box<dyn ResolveOrigin>>, request: Vc<Request>) -> Vc<Self> {
        Self::cell(CompilerReference { origin, request })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for CompilerReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        cjs_resolve(self.origin, self.request, None, IssueSeverity::Error.cell())
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for CompilerReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("compiler reference {}", self.request.to_string().await?).into(),
        ))
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct TsExtendsReference {
    pub config: Vc<Box<dyn Source>>,
}

#[turbo_tasks::value_impl]
impl TsExtendsReference {
    #[turbo_tasks::function]
    pub fn new(config: Vc<Box<dyn Source>>) -> Vc<Self> {
        Self::cell(TsExtendsReference { config })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for TsExtendsReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        ModuleResolveResult::module(Vc::upcast(RawModule::new(Vc::upcast(self.config)))).cell()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for TsExtendsReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!(
                "tsconfig extends {}",
                self.config.ident().to_string().await?,
            )
            .into(),
        ))
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct TsNodeRequireReference {
    pub origin: Vc<Box<dyn ResolveOrigin>>,
    pub request: Vc<Request>,
}

#[turbo_tasks::value_impl]
impl TsNodeRequireReference {
    #[turbo_tasks::function]
    pub fn new(origin: Vc<Box<dyn ResolveOrigin>>, request: Vc<Request>) -> Vc<Self> {
        Self::cell(TsNodeRequireReference { origin, request })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for TsNodeRequireReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        cjs_resolve(self.origin, self.request, None, IssueSeverity::Error.cell())
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for TsNodeRequireReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!(
                "tsconfig tsnode require {}",
                self.request.to_string().await?
            )
            .into(),
        ))
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct TsConfigTypesReference {
    pub origin: Vc<Box<dyn ResolveOrigin>>,
    pub request: Vc<Request>,
}

#[turbo_tasks::value_impl]
impl TsConfigTypesReference {
    #[turbo_tasks::function]
    pub fn new(origin: Vc<Box<dyn ResolveOrigin>>, request: Vc<Request>) -> Vc<Self> {
        Self::cell(TsConfigTypesReference { origin, request })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for TsConfigTypesReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        type_resolve(self.origin, self.request)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for TsConfigTypesReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<Vc<RcStr>> {
        Ok(Vc::cell(
            format!("tsconfig types {}", self.request.to_string().await?,).into(),
        ))
    }
}
