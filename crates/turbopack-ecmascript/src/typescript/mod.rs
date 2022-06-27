pub mod resolve;

use anyhow::Result;
use json::JsonValue;
use turbo_tasks::{Value, ValueToString, Vc};
use turbo_tasks_fs::{FileContentVc, FileSystemPathVc};

use turbopack_core::{
    asset::{Asset, AssetVc},
    context::AssetContextVc,
    reference::{AssetReference, AssetReferenceVc},
    resolve::{parse::RequestVc, ResolveResult, ResolveResultVc},
};

use crate::resolve::apply_cjs_specific_options;

use self::resolve::{read_from_tsconfigs, read_tsconfigs, type_resolve};

use super::resolve::cjs_resolve;

#[turbo_tasks::value(Asset)]
pub struct TsConfigModuleAsset {
    pub source: AssetVc,
    pub context: AssetContextVc,
}

#[turbo_tasks::value_impl]
impl TsConfigModuleAssetVc {
    #[turbo_tasks::function]
    pub fn new(source: AssetVc, context: AssetContextVc) -> Self {
        Self::slot(TsConfigModuleAsset { source, context })
    }
}

#[turbo_tasks::value_impl]
impl Asset for TsConfigModuleAsset {
    #[turbo_tasks::function]
    fn path(&self) -> FileSystemPathVc {
        self.source.path()
    }
    #[turbo_tasks::function]
    fn content(&self) -> FileContentVc {
        self.source.content()
    }
    #[turbo_tasks::function]
    async fn references(&self) -> Result<Vc<Vec<AssetReferenceVc>>> {
        let mut references = Vec::new();
        let configs = read_tsconfigs(
            self.source.content().parse_json_with_comments(),
            self.source,
            apply_cjs_specific_options(self.context.resolve_options()),
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
            let (source, compiler) =
                compiler.unwrap_or_else(|| (self.source, "typescript".to_string()));
            references.push(
                CompilerReferenceVc::new(
                    self.context,
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
                for (source, request) in require {
                    references.push(
                        TsNodeRequireReferenceVc::new(
                            self.context,
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
            for (source, name) in types {
                references.push(
                    TsConfigTypesReferenceVc::new(
                        self.context,
                        RequestVc::module(name, Value::new("".to_string().into())),
                    )
                    .into(),
                );
            }
        }
        Ok(Vc::slot(references))
    }
}

#[turbo_tasks::value(AssetReference)]
#[derive(Hash, Debug)]
pub struct CompilerReference {
    pub context: AssetContextVc,
    pub request: RequestVc,
}

#[turbo_tasks::value_impl]
impl CompilerReferenceVc {
    #[turbo_tasks::function]
    pub fn new(context: AssetContextVc, request: RequestVc) -> Self {
        Self::slot(CompilerReference { context, request })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for CompilerReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        cjs_resolve(self.request, self.context)
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<String>> {
        Ok(Vc::slot(format!(
            "compiler reference {}",
            self.request.to_string().await?
        )))
    }
}

#[turbo_tasks::value(AssetReference)]
#[derive(Hash, Debug)]
pub struct TsExtendsReference {
    pub config: AssetVc,
}

#[turbo_tasks::value_impl]
impl TsExtendsReferenceVc {
    #[turbo_tasks::function]
    pub fn new(config: AssetVc) -> Self {
        Self::slot(TsExtendsReference { config })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for TsExtendsReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        ResolveResult::Single(self.config, Vec::new()).into()
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<String>> {
        Ok(Vc::slot(format!(
            "tsconfig extends {}",
            self.config.path().to_string().await?,
        )))
    }
}

#[turbo_tasks::value(AssetReference)]
#[derive(Hash, Debug)]
pub struct TsNodeRequireReference {
    pub context: AssetContextVc,
    pub request: RequestVc,
}

#[turbo_tasks::value_impl]
impl TsNodeRequireReferenceVc {
    #[turbo_tasks::function]
    pub fn new(context: AssetContextVc, request: RequestVc) -> Self {
        Self::slot(TsNodeRequireReference { context, request })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for TsNodeRequireReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        cjs_resolve(self.request, self.context)
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<String>> {
        Ok(Vc::slot(format!(
            "tsconfig tsnode require {}",
            self.request.to_string().await?
        )))
    }
}

#[turbo_tasks::value(AssetReference)]
#[derive(Hash, Debug)]
pub struct TsConfigTypesReference {
    pub context: AssetContextVc,
    pub request: RequestVc,
}

#[turbo_tasks::value_impl]
impl TsConfigTypesReferenceVc {
    #[turbo_tasks::function]
    pub fn new(context: AssetContextVc, request: RequestVc) -> Self {
        Self::slot(TsConfigTypesReference { context, request })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for TsConfigTypesReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> ResolveResultVc {
        type_resolve(self.request, self.context)
    }

    #[turbo_tasks::function]
    async fn description(&self) -> Result<Vc<String>> {
        Ok(Vc::slot(format!(
            "tsconfig types {}",
            self.request.to_string().await?,
        )))
    }
}
