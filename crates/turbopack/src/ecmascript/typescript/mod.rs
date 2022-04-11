pub mod resolve;

use anyhow::Result;
use json::JsonValue;
use turbo_tasks::{Value, Vc};
use turbo_tasks_fs::{FileContentVc, FileJsonContent, FileSystemPathVc};

use crate::{
    asset::{Asset, AssetVc},
    reference::{AssetReference, AssetReferenceVc},
    resolve::{parse::RequestVc, resolve_options, ResolveResultVc},
};

use self::resolve::{type_resolve, typescript_types_resolve_options};

use super::resolve::cjs_resolve;

#[turbo_tasks::value(Asset)]
#[derive(PartialEq, Eq)]
pub struct TsConfigModuleAsset {
    pub source: AssetVc,
}

#[turbo_tasks::value_impl]
impl TsConfigModuleAssetVc {
    pub fn new(source: AssetVc) -> Self {
        Self::slot(TsConfigModuleAsset { source })
    }
}

#[turbo_tasks::value_impl]
impl Asset for TsConfigModuleAsset {
    fn path(&self) -> FileSystemPathVc {
        self.source.clone().path()
    }
    fn content(&self) -> FileContentVc {
        self.source.clone().content()
    }
    async fn references(&self) -> Result<Vc<Vec<AssetReferenceVc>>> {
        let mut references = Vec::new();
        if let FileJsonContent::Content(data) = &*self.source.content().parse_json().await? {
            {
                let ts_node = &data["ts-node"];
                let compiler = ts_node["compiler"].as_str().unwrap_or_else(|| "typescript");
                references.push(
                    CompilerReferenceVc::new(
                        self.source.clone(),
                        RequestVc::parse(Value::new(compiler.to_string().into())),
                    )
                    .into(),
                );
                let require = &ts_node["require"];
                for request in require.members() {
                    if let Some(request) = request.as_str() {
                        references.push(
                            TsNodeRequireReferenceVc::new(
                                self.source.clone(),
                                RequestVc::parse(Value::new(request.to_string().into())),
                            )
                            .into(),
                        );
                    }
                }
            }
            {
                let compiler_options = &data["compilerOptions"];
                let types = &compiler_options["types"];
                let list = if let JsonValue::Array(array) = types {
                    array.iter().filter_map(|name| name.as_str()).collect()
                } else {
                    vec!["node"]
                };
                for name in list {
                    references.push(
                        TsConfigTypesReferenceVc::new(
                            self.source.clone(),
                            RequestVc::module(name.to_string(), Value::new("".to_string().into())),
                        )
                        .into(),
                    );
                }
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
    pub fn new(source: AssetVc, request: RequestVc) -> Self {
        Self::slot(CompilerReference { source, request })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for CompilerReference {
    fn resolve_reference(&self) -> ResolveResultVc {
        let context = self.source.path().parent();

        let options = resolve_options(context.clone());
        cjs_resolve(self.request.clone(), context, options)
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
    pub fn new(source: AssetVc, request: RequestVc) -> Self {
        Self::slot(TsNodeRequireReference { source, request })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for TsNodeRequireReference {
    fn resolve_reference(&self) -> ResolveResultVc {
        let context = self.source.path().parent();

        let options = resolve_options(context.clone());
        cjs_resolve(self.request.clone(), context, options)
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
    pub fn new(source: AssetVc, request: RequestVc) -> Self {
        Self::slot(TsConfigTypesReference { source, request })
    }
}

#[turbo_tasks::value_impl]
impl AssetReference for TsConfigTypesReference {
    fn resolve_reference(&self) -> ResolveResultVc {
        let context = self.source.path().parent();

        let options = typescript_types_resolve_options(context.clone());
        type_resolve(self.request.clone(), context, options)
    }
}
