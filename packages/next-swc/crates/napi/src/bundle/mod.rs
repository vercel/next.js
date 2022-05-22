use crate::{
    complete_output, get_compiler,
    util::{CtxtExt, MapErr},
};
use anyhow::{anyhow, bail, Context, Error};
use napi::{CallContext, JsObject, Task};
use once_cell::sync::Lazy;
use serde::Deserialize;
use std::{collections::HashMap, path::PathBuf, sync::Arc};
use swc::{config::SourceMapsConfig, try_with_handler, TransformOutput};
use swc_atoms::JsWord;
use swc_bundler::{Bundler, ModuleData, ModuleRecord};
use swc_common::{
    collections::AHashMap,
    errors::{ColorConfig, Handler},
    BytePos, FileName, SourceMap, Span,
};
use swc_ecma_loader::{
    resolvers::{lru::CachingResolver, node::NodeModulesResolver},
    TargetEnv, NODE_BUILTINS,
};
use swc_ecmascript::{
    ast::*,
    parser::{lexer::Lexer, EsConfig, Parser, StringInput, Syntax},
    visit::{noop_visit_type, Visit, VisitWith},
};

#[js_function(1)]
pub fn bundle(cx: CallContext) -> napi::Result<JsObject> {
    let option = cx.get_buffer_as_string(0)?;

    let task = BundleTask {
        c: get_compiler(&cx),
        config: option,
    };

    cx.env.spawn(task).map(|t| t.promise_object())
}

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

        try_with_handler(
            self.c.cm.clone(),
            swc::HandlerOpts {
                color: ColorConfig::Never,
                skip_filename: true,
            },
            |handler| {
                let builtins = NODE_BUILTINS
                    .iter()
                    .copied()
                    .map(JsWord::from)
                    .collect::<Vec<_>>();

                let comments = self.c.comments().clone();
                //
                let mut bundler = Bundler::new(
                    self.c.globals(),
                    self.c.cm.clone(),
                    CustomLoader {
                        cm: self.c.cm.clone(),
                        handler,
                    },
                    make_resolver(),
                    swc_bundler::Config {
                        require: true,
                        disable_inliner: false,
                        external_modules: builtins,
                        module: swc_bundler::ModuleType::Es,
                        ..Default::default()
                    },
                    Box::new(CustomHook),
                );

                let mut entries = HashMap::default();
                let path: PathBuf = option.entry;
                let path = path
                    .canonicalize()
                    .context("failed to canonicalize entry file")?;
                entries.insert("main".to_string(), FileName::Real(path));
                let outputs = bundler.bundle(entries)?;

                let output = outputs
                    .into_iter()
                    .next()
                    .ok_or_else(|| anyhow!("swc_bundler::Bundle::bundle returned empty result"))?;

                let source_map_names = {
                    let mut v = SourceMapIdentCollector {
                        names: Default::default(),
                    };

                    output.module.visit_with(&mut v);

                    v.names
                };

                let code = self.c.print(
                    &output.module,
                    None,
                    None,
                    true,
                    EsVersion::Es5,
                    SourceMapsConfig::Bool(true),
                    &source_map_names,
                    None,
                    false,
                    Some(&comments),
                    true,
                    false,
                )?;

                Ok(code)
            },
        )
        .convert_err()
    }

    fn resolve(self, env: napi::Env, output: Self::Output) -> napi::Result<Self::JsValue> {
        complete_output(&env, output, Default::default())
    }
}

type Resolver = Arc<CachingResolver<NodeModulesResolver>>;

fn make_resolver() -> Resolver {
    static CACHE: Lazy<Resolver> = Lazy::new(|| {
        // TODO: Make target env and alias configurable
        let r = NodeModulesResolver::new(TargetEnv::Node, Default::default(), true);
        let r = CachingResolver::new(256, r);
        Arc::new(r)
    });

    (*CACHE).clone()
}

struct CustomLoader<'a> {
    handler: &'a Handler,
    cm: Arc<SourceMap>,
}

impl swc_bundler::Load for CustomLoader<'_> {
    fn load(&self, f: &FileName) -> Result<ModuleData, Error> {
        let fm = match f {
            FileName::Real(path) => self.cm.load_file(path)?,
            _ => unreachable!(),
        };

        let lexer = Lexer::new(
            Syntax::Es(EsConfig {
                ..Default::default()
            }),
            EsVersion::Es2020,
            StringInput::from(&*fm),
            None,
        );

        let mut parser = Parser::new_from(lexer);
        let module = parser.parse_module().map_err(|err| {
            err.into_diagnostic(self.handler).emit();
            anyhow!("failed to parse")
        })?;

        Ok(ModuleData {
            fm,
            module,
            helpers: Default::default(),
        })
    }
}

struct CustomHook;

impl swc_bundler::Hook for CustomHook {
    fn get_import_meta_props(
        &self,
        _span: Span,
        _module_record: &ModuleRecord,
    ) -> Result<Vec<KeyValueProp>, Error> {
        bail!("`import.meta` is not supported yet")
    }
}

pub struct SourceMapIdentCollector {
    names: AHashMap<BytePos, JsWord>,
}

impl Visit for SourceMapIdentCollector {
    noop_visit_type!();

    fn visit_ident(&mut self, ident: &Ident) {
        self.names.insert(ident.span.lo, ident.sym.clone());
    }
}
