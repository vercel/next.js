use crate::util::MapErr;
use anyhow::Error;
use napi::{JsObject, Task};
use once_cell::sync::Lazy;
use serde::Deserialize;
use std::{collections::HashMap, path::PathBuf, sync::Arc};
use swc::{try_with_handler, TransformOutput};
use swc_atoms::JsWord;
use swc_bundler::{Bundler, ModuleData, ModuleRecord};
use swc_common::{FileName, Span};
use swc_ecma_loader::{
    resolvers::{lru::CachingResolver, node::NodeModulesResolver},
    NODE_BUILTINS,
};
use swc_ecmascript::ast::*;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct BundleOption {
    entry: PathBuf,
}

struct BundleTask {
    c: Arc<swc::Compiler>,
    config: String,
}

impl Task for BundleTask {
    type Output = TransformOutput;

    type JsValue = JsObject;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        let option: BundleOption = crate::util::deserialize_json(&self.config).convert_err()?;

        try_with_handler(self.c.cm.clone(), true, |handler| {
            let builtins = NODE_BUILTINS
                .to_vec()
                .into_iter()
                .map(JsWord::from)
                .collect::<Vec<_>>();

            //
            let mut bundler = Bundler::new(
                &self.c.globals(),
                self.c.cm.clone(),
                CustomLoader,
                make_resolver(),
                swc_bundler::Config {
                    require: false,
                    disable_inliner: false,
                    external_modules: builtins,
                    module: swc_bundler::ModuleType::Es,
                },
                Box::new(CustomHook),
            );

            let mut entries = HashMap::default();
            entries.insert("main".to_string(), FileName::Real(option.entry.into()));
            let outputs = bundler.bundle(entries)?;

            let output = outputs.into_iter().next().ok_or_else(|| {
                anyhow::anyhow!("swc_bundler::Bundle::bundle returned empty result")
            })?;

            let code = self.c.print(
                &output.module,
                source_file_name,
                output_path,
                inline_sources_content,
                target,
                source_map,
                source_map_names,
                orig,
                false,
                preserve_comments,
            )?;

            code
        })
        .convert_err()
    }

    fn resolve(self, env: napi::Env, output: Self::Output) -> napi::Result<Self::JsValue> {}
}

type Resolver = Arc<CachingResolver<NodeModulesResolver>>;

fn make_resolver() -> Resolver {
    static CACHE: Lazy<Resolver> = Lazy::new(|| {});

    (*CACHE).clone()
}

struct CustomLoader;

impl swc_bundler::Load for CustomLoader {
    fn load(&self, f: &FileName) -> Result<ModuleData, Error> {}
}

struct CustomHook;

impl swc_bundler::Hook for CustomHook {
    fn get_import_meta_props(
        &self,
        span: Span,
        module_record: &ModuleRecord,
    ) -> Result<Vec<KeyValueProp>, Error> {
    }
}
