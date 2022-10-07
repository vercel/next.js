use turbo_tasks::{ValueToString, ValueToStringVc};
pub mod resolve;

use anyhow::Result;
use serde_json::Value as JsonValue;
use turbo_tasks::{primitives::StringVc, Value};
use turbo_tasks_fs::FileSystemPathVc;
use turbopack_core::{
    asset::{Asset, AssetContentVc, AssetVc},
    reference::{AssetReference, AssetReferenceVc, AssetReferencesVc},
    resolve::{origin::ResolveOriginVc, parse::RequestVc, ResolveResult, ResolveResultVc},
};

use self::resolve::{read_from_tsconfigs, read_tsconfigs, type_resolve};
use super::resolve::cjs_resolve;
use crate::resolve::apply_cjs_specific_options;

#[turbo_tasks::value]
pub struct TsConfigModuleAsset {
    pub source: AssetVc,
    pub origin: ResolveOriginVc,
}

#[turbo_tasks::value_impl]
impl TsConfigModuleAssetVc {
    #[turbo_tasks::function]
    pub fn new(origin: ResolveOriginVc, source: AssetVc) -> Self {
        Self::cell(TsConfigModuleAsset { origin, source })
    }
}

#[turbo_tasks::value_impl]
impl Asset for TsConfigModuleAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.source.path()
    }

    #[turbo_tasks::function]
    fn content(&self) -> AssetContentVc {
        self.source.content()
    }

    #[turbo_tasks::function]
    async fn references(&self) -> Result<AssetReferencesVc> {
        let mut references = Vec::new();
        let configs = read_tsconfigs(
            self.source.content().parse_json_with_comments(),
            self.source,
            apply_cjs_specific_options(self.origin.resolve_options()),
        )
        .await?;
        for (_, config_asset) in configs[1..].iter() {
            references.push(TsExtendsReferenceVc::new(*config_asset).into());
        }
        // ts-node options
        {
            let compiler = read_from_tsconfigs(&configs, |json, source| {
                json["ts-node"]["compiler"]
                    .as_str()
                    .map(|s| (source, s.to_string()))
            })
            .await?;
            let (_, compiler) = compiler.unwrap_or_else(|| (self.source, "typescript".to_string()));
            references.push(
                CompilerReferenceVc::new(
                    self.origin,
                    RequestVc::parse(Value::new(compiler.to_string().into())),
                )
                .into(),
            );
            let require = read_from_tsconfigs(&configs, |json, source| {
                if let JsonValue::Array(array) = &json["ts-node"]["require"] {
                    Some(
                        array
                            .iter()
                            .filter_map(|name| name.as_str().map(|s| (source, s.to_string())))
                            .collect::<Vec<_>>(),
                    )
                } else {
                    None
                }
            })
            .await?;
            if let Some(require) = require {
                for (_, request) in require {
                    references.push(
                        TsNodeRequireReferenceVc::new(
                            self.origin,
                            RequestVc::parse(Value::new(request.into())),
                        )
                        .into(),
                    );
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
                            .filter_map(|name| name.as_str().map(|s| (source, s.to_string())))
                            .collect::<Vec<_>>(),
                    )
                } else {
                    None
                }
            })
            .await?;
            let types = types.unwrap_or_else(|| vec![(self.source, "node".to_string())]);
            for (_, name) in types {
                references.push(
                    TsConfigTypesReferenceVc::new(
                        self.origin,
                        RequestVc::module(name, Value::new("".to_string().into())),
                    )
                    .into(),
                );
            }
        }
        Ok(AssetReferencesVc::cell(references))
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct CompilerReference {
    pub origin: ResolveOriginVc,
    pub request: RequestVc,
}

#[turbo_tasks::value_impl]
impl CompilerReferenceVc {
    #[turbo_tasks::function]
    pub fn new(origin: ResolveOriginVc, request: RequestVc) -> Self {
        Self::cell(CompilerReference { origin, request })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for CompilerReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        cjs_resolve(self.origin, self.request)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for CompilerReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "compiler reference {}",
            self.request.to_string().await?
        )))
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct TsExtendsReference {
    pub config: AssetVc,
}

#[turbo_tasks::value_impl]
impl TsExtendsReferenceVc {
    #[turbo_tasks::function]
    pub fn new(config: AssetVc) -> Self {
        Self::cell(TsExtendsReference { config })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for TsExtendsReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        ResolveResult::Single(self.config, Vec::new()).into()
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for TsExtendsReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "tsconfig extends {}",
            self.config.path().to_string().await?,
        )))
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct TsNodeRequireReference {
    pub origin: ResolveOriginVc,
    pub request: RequestVc,
}

#[turbo_tasks::value_impl]
impl TsNodeRequireReferenceVc {
    #[turbo_tasks::function]
    pub fn new(origin: ResolveOriginVc, request: RequestVc) -> Self {
        Self::cell(TsNodeRequireReference { origin, request })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for TsNodeRequireReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        cjs_resolve(self.origin, self.request)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for TsNodeRequireReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "tsconfig tsnode require {}",
            self.request.to_string().await?
        )))
    }
}

#[turbo_tasks::value]
#[derive(Hash, Debug)]
pub struct TsConfigTypesReference {
    pub origin: ResolveOriginVc,
    pub request: RequestVc,
}

#[turbo_tasks::value_impl]
impl TsConfigTypesReferenceVc {
    #[turbo_tasks::function]
    pub fn new(origin: ResolveOriginVc, request: RequestVc) -> Self {
        Self::cell(TsConfigTypesReference { origin, request })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for TsConfigTypesReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        type_resolve(self.origin, self.request)
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for TsConfigTypesReference {
    #[turbo_tasks::function]
    async fn to_string(&self) -> Result<StringVc> {
        Ok(StringVc::cell(format!(
            "tsconfig types {}",
            self.request.to_string().await?,
        )))
    }
}
