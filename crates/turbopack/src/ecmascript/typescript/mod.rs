pub mod resolve;

use anyhow::Result;
use json::JsonValue;
use turbo_tasks::{Value, Vc};
use turbo_tasks_fs::{FileContentVc, FileSystemPathVc};

use crate::{
    asset::{Asset, AssetVc},
    reference::{AssetReference, AssetReferenceVc},
    resolve::{parse::RequestVc, resolve_options, ResolveResult, ResolveResultVc},
};

use self::resolve::{
    read_from_tsconfigs, read_tsconfigs, type_resolve, typescript_types_resolve_options,
};

use super::resolve::cjs_resolve;

#[turbo_tasks::value(Asset)]
#[derive(PartialEq, Eq)]
pub struct TsConfigModuleAsset {
    pub source: AssetVc,
}

#[turbo_tasks::value_impl]
impl TsConfigModuleAssetVc {
    #[turbo_tasks::function]
    pub fn new(source: AssetVc) -> Self {
        Self::slot(TsConfigModuleAsset { source })
    }
}

#[turbo_tasks::value_impl]
impl Asset for TsConfigModuleAsset {
    fn path(&self) -> FileSystemPathVc {
        self.source.path()
    }
    fn content(&self) -> FileContentVc {
        self.source.content()
    }
    async fn references(&self) -> Result<Vc<Vec<AssetReferenceVc>>> {
        let mut references = Vec::new();
        let configs = read_tsconfigs(
            self.source.content().parse_json_with_comments(),
            self.source,
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
                    source,
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
                            source,
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
                        source,
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
#[derive(Hash, Debug, PartialEq, Eq)]
pub struct CompilerReference {
    pub source: AssetVc,
    pub request: RequestVc,
}

#[turbo_tasks::value_impl]
impl CompilerReferenceVc {
    #[turbo_tasks::function]
    pub fn new(source: AssetVc, request: RequestVc) -> Self {
        Self::slot(CompilerReference { source, request })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for CompilerReference {
    fn resolve_reference(&self) -> ResolveResultVc {
        let context = self.source.path().parent();

        let options = resolve_options(context);
        cjs_resolve(self.request, context, options)
    }
}

#[turbo_tasks::value(AssetReference)]
#[derive(Hash, Debug, PartialEq, Eq)]
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
    fn resolve_reference(&self) -> ResolveResultVc {
        ResolveResult::Single(self.config, Vec::new()).into()
    }
}

#[turbo_tasks::value(AssetReference)]
#[derive(Hash, Debug, PartialEq, Eq)]
pub struct TsNodeRequireReference {
    pub source: AssetVc,
    pub request: RequestVc,
}

#[turbo_tasks::value_impl]
impl TsNodeRequireReferenceVc {
    #[turbo_tasks::function]
    pub fn new(source: AssetVc, request: RequestVc) -> Self {
        Self::slot(TsNodeRequireReference { source, request })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for TsNodeRequireReference {
    fn resolve_reference(&self) -> ResolveResultVc {
        let context = self.source.path().parent();

        let options = resolve_options(context);
        cjs_resolve(self.request, context, options)
    }
}

#[turbo_tasks::value(AssetReference)]
#[derive(Hash, Debug, PartialEq, Eq)]
pub struct TsConfigTypesReference {
    pub source: AssetVc,
    pub request: RequestVc,
}

#[turbo_tasks::value_impl]
impl TsConfigTypesReferenceVc {
    #[turbo_tasks::function]
    pub fn new(source: AssetVc, request: RequestVc) -> Self {
        Self::slot(TsConfigTypesReference { source, request })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for TsConfigTypesReference {
    fn resolve_reference(&self) -> ResolveResultVc {
        let context = self.source.path().parent();

        let options = typescript_types_resolve_options(context);
        type_resolve(self.request, context, options)
    }
}
