use std::{cell::RefCell, path::PathBuf, rc::Rc, sync::Arc};

use either::Either;
use modularize_imports;
use preset_env_base::query::targets_to_versions;
use rustc_hash::{FxHashMap, FxHashSet};
use serde::Deserialize;
use swc_core::{
    atoms::Atom,
    common::{
        comments::{Comments, NoopComments},
        pass::Optional,
        FileName, Mark, SourceFile, SourceMap, SyntaxContext,
    },
    ecma::{
        ast::{fn_pass, noop_pass, EsVersion, Pass},
        parser::parse_file_as_module,
        visit::visit_mut_pass,
    },
};

use crate::{
    linter::linter,
    transforms::{
        cjs_finder::contains_cjs,
        dynamic::{next_dynamic, NextDynamicMode},
        fonts::next_font_loaders,
        lint_codemod_comments::lint_codemod_comments,
        react_server_components,
    },
};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformOptions {
    #[serde(flatten)]
    pub swc: swc_core::base::config::Options,

    #[serde(default)]
    pub disable_next_ssg: bool,

    #[serde(default)]
    pub disable_page_config: bool,

    #[serde(default)]
    pub pages_dir: Option<PathBuf>,

    #[serde(default)]
    pub app_dir: Option<PathBuf>,

    #[serde(default)]
    pub is_page_file: bool,

    #[serde(default)]
    pub is_development: bool,

    #[serde(default)]
    pub is_server_compiler: bool,

    #[serde(default)]
    pub prefer_esm: bool,

    #[serde(default)]
    pub server_components: Option<react_server_components::Config>,

    #[serde(default)]
    pub styled_jsx: BoolOr<styled_jsx::visitor::Config>,

    #[serde(default)]
    pub styled_components: Option<styled_components::Config>,

    #[serde(default)]
    pub remove_console: Option<remove_console::Config>,

    #[serde(default)]
    pub react_remove_properties: Option<react_remove_properties::Config>,

    #[serde(default)]
    #[cfg(not(target_arch = "wasm32"))]
    pub relay: Option<swc_relay::Config>,

    #[allow(unused)]
    #[serde(default)]
    #[cfg(target_arch = "wasm32")]
    /// Accept any value
    pub relay: Option<serde_json::Value>,

    #[serde(default)]
    pub shake_exports: Option<crate::transforms::shake_exports::Config>,

    #[serde(default)]
    pub emotion: Option<swc_emotion::EmotionOptions>,

    #[serde(default)]
    pub modularize_imports: Option<modularize_imports::Config>,

    #[serde(default)]
    pub auto_modularize_imports: Option<crate::transforms::named_import_transform::Config>,

    #[serde(default)]
    pub optimize_barrel_exports: Option<crate::transforms::optimize_barrel::Config>,

    #[serde(default)]
    pub font_loaders: Option<crate::transforms::fonts::Config>,

    #[serde(default)]
    pub server_actions: Option<crate::transforms::server_actions::Config>,

    #[serde(default)]
    pub cjs_require_optimizer: Option<crate::transforms::cjs_optimizer::Config>,

    #[serde(default)]
    pub optimize_server_react: Option<crate::transforms::optimize_server_react::Config>,

    #[serde(default)]
    pub debug_function_name: bool,

    #[serde(default)]
    pub lint_codemod_comments: bool,
}

pub fn custom_before_pass<'a, C>(
    cm: Arc<SourceMap>,
    file: Arc<SourceFile>,
    opts: &'a TransformOptions,
    comments: C,
    eliminated_packages: Rc<RefCell<FxHashSet<Atom>>>,
    unresolved_mark: Mark,
    use_cache_telemetry_tracker: Rc<RefCell<FxHashMap<String, usize>>>,
) -> impl Pass + 'a
where
    C: Clone + Comments + 'a,
{
    let file_path_str = file.name.to_string();

    #[cfg(target_arch = "wasm32")]
    let relay_plugin = noop_pass();

    #[cfg(not(target_arch = "wasm32"))]
    let relay_plugin = {
        if let Some(config) = &opts.relay {
            Either::Left(swc_relay::relay(
                Arc::new(config.clone()),
                (*file.name).clone(),
                std::env::current_dir().unwrap(),
                opts.pages_dir.clone(),
                None,
            ))
        } else {
            Either::Right(noop_pass())
        }
    };

    let target_browsers = opts
        .swc
        .config
        .env
        .as_ref()
        .map(|env| targets_to_versions(env.targets.clone()).expect("failed to parse env.targets"))
        .unwrap_or_default();

    let styled_jsx = {
        let cm = cm.clone();
        let file = file.clone();

        fn_pass(move |program| {
            if let Some(config) = opts.styled_jsx.to_option() {
                program.mutate(styled_jsx::visitor::styled_jsx(
                    cm.clone(),
                    &file.name,
                    &styled_jsx::visitor::Config {
                        use_lightningcss: config.use_lightningcss,
                        browsers: *target_browsers,
                    },
                    &styled_jsx::visitor::NativeConfig { process_css: None },
                ))
            }
        })
    };

    let styled_components = {
        let file = file.clone();

        fn_pass(move |program| {
            if let Some(config) = &opts.styled_components {
                program.mutate(styled_components::styled_components(
                    Some(&file_path_str),
                    file.src_hash,
                    config,
                    NoopComments,
                ))
            }
        })
    };

    let emotion = {
        let cm = cm.clone();
        let file = file.clone();
        let comments = comments.clone();

        fn_pass(move |program| {
            if let Some(config) = opts.emotion.as_ref() {
                if !config.enabled.unwrap_or(false) {
                    return;
                }
                if let FileName::Real(path) = &*file.name {
                    program.mutate(swc_emotion::emotion(
                        config,
                        path,
                        file.src_hash as u32,
                        cm.clone(),
                        comments.clone(),
                    ));
                }
            }
        })
    };

    let modularize_imports = fn_pass(move |program| {
        if let Some(config) = opts.modularize_imports.as_ref() {
            program.mutate(modularize_imports::modularize_imports(config));
        }
    });

    (
        (
            crate::transforms::disallow_re_export_all_in_page::disallow_re_export_all_in_page(
                opts.is_page_file,
            ),
            match &opts.server_components {
                Some(config) if config.truthy() => {
                    Either::Left(react_server_components::server_components(
                        file.name.clone(),
                        config.clone(),
                        comments.clone(),
                        opts.app_dir.clone(),
                    ))
                }
                _ => Either::Right(noop_pass()),
            },
            styled_jsx,
            styled_components,
            Optional::new(
                crate::transforms::next_ssg::next_ssg(eliminated_packages),
                !opts.disable_next_ssg,
            ),
            crate::transforms::amp_attributes::amp_attributes(),
            next_dynamic(
                opts.is_development,
                opts.is_server_compiler,
                match &opts.server_components {
                    Some(config) if config.truthy() => match config {
                        // Always enable the Server Components mode for both
                        // server and client layers.
                        react_server_components::Config::WithOptions(config) => {
                            config.is_react_server_layer
                        }
                        _ => false,
                    },
                    _ => false,
                },
                opts.prefer_esm,
                NextDynamicMode::Webpack,
                file.name.clone(),
                opts.pages_dir.clone().or_else(|| opts.app_dir.clone()),
            ),
            Optional::new(
                crate::transforms::page_config::page_config(opts.is_development, opts.is_page_file),
                !opts.disable_page_config,
            ),
            relay_plugin,
            match &opts.remove_console {
                Some(config) if config.truthy() => Either::Left(remove_console::remove_console(
                    config.clone(),
                    SyntaxContext::empty().apply_mark(unresolved_mark),
                )),
                _ => Either::Right(noop_pass()),
            },
            match &opts.react_remove_properties {
                Some(config) if config.truthy() => Either::Left(
                    react_remove_properties::react_remove_properties(config.clone()),
                ),
                _ => Either::Right(noop_pass()),
            },
            match &opts.shake_exports {
                Some(config) => Either::Left(crate::transforms::shake_exports::shake_exports(
                    config.clone(),
                )),
                None => Either::Right(noop_pass()),
            },
        ),
        (
            match &opts.auto_modularize_imports {
                Some(config) => Either::Left(
                    crate::transforms::named_import_transform::named_import_transform(
                        config.clone(),
                    ),
                ),
                None => Either::Right(noop_pass()),
            },
            match &opts.optimize_barrel_exports {
                Some(config) => Either::Left(crate::transforms::optimize_barrel::optimize_barrel(
                    config.clone(),
                )),
                _ => Either::Right(noop_pass()),
            },
            match &opts.optimize_server_react {
                Some(config) => Either::Left(
                    crate::transforms::optimize_server_react::optimize_server_react(config.clone()),
                ),
                _ => Either::Right(noop_pass()),
            },
            emotion,
            modularize_imports,
            match &opts.font_loaders {
                Some(config) => Either::Left(next_font_loaders(config.clone())),
                None => Either::Right(noop_pass()),
            },
            match &opts.server_actions {
                Some(config) => Either::Left(crate::transforms::server_actions::server_actions(
                    &file.name,
                    config.clone(),
                    comments.clone(),
                    use_cache_telemetry_tracker,
                )),
                None => Either::Right(noop_pass()),
            },
            match &opts.cjs_require_optimizer {
                Some(config) => Either::Left(visit_mut_pass(
                    crate::transforms::cjs_optimizer::cjs_optimizer(
                        config.clone(),
                        SyntaxContext::empty().apply_mark(unresolved_mark),
                    ),
                )),
                None => Either::Right(noop_pass()),
            },
            Optional::new(
                crate::transforms::debug_fn_name::debug_fn_name(),
                opts.debug_function_name,
            ),
            visit_mut_pass(crate::transforms::pure::pure_magic(comments.clone())),
            Optional::new(
                linter(lint_codemod_comments(comments)),
                opts.lint_codemod_comments,
            ),
        ),
    )
}

impl TransformOptions {
    pub fn patch(mut self, fm: &SourceFile) -> Self {
        self.swc.swcrc = false;

        let should_enable_commonjs = self.swc.config.module.is_none()
            && (fm.src.contains("module.exports")
                || fm.src.contains("exports.")
                || fm.src.contains("__esModule"))
            && {
                let syntax = self.swc.config.jsc.syntax.unwrap_or_default();
                let target = self.swc.config.jsc.target.unwrap_or_else(EsVersion::latest);

                parse_file_as_module(fm, syntax, target, None, &mut vec![])
                    .map(|m| contains_cjs(&m))
                    .unwrap_or_default()
            };

        if should_enable_commonjs {
            self.swc.config.module = Some(
                serde_json::from_str(r#"{ "type": "commonjs", "ignoreDynamic": true }"#).unwrap(),
            );
        }

        self
    }
}

/// Defaults to false

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum BoolOr<T> {
    Bool(bool),
    Data(T),
}

impl<T> Default for BoolOr<T> {
    fn default() -> Self {
        BoolOr::Bool(false)
    }
}

impl<T> BoolOr<T> {
    pub fn to_option(&self) -> Option<T>
    where
        T: Default + Clone,
    {
        match self {
            BoolOr::Bool(false) => None,
            BoolOr::Bool(true) => Some(Default::default()),
            BoolOr::Data(v) => Some(v.clone()),
        }
    }
}

impl<'de, T> Deserialize<'de> for BoolOr<T>
where
    T: Deserialize<'de>,
{
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        #[derive(Deserialize)]
        #[serde(untagged)]
        enum Deser<T> {
            Bool(bool),
            Obj(T),
            EmptyObject(EmptyStruct),
        }

        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct EmptyStruct {}

        use serde::__private::de;

        let content = de::Content::deserialize(deserializer)?;

        let deserializer = de::ContentRefDeserializer::<D::Error>::new(&content);

        let res = Deser::deserialize(deserializer);

        match res {
            Ok(v) => Ok(match v {
                Deser::Bool(v) => BoolOr::Bool(v),
                Deser::Obj(v) => BoolOr::Data(v),
                Deser::EmptyObject(_) => BoolOr::Bool(true),
            }),
            Err(..) => {
                let d = de::ContentDeserializer::<D::Error>::new(content);
                Ok(BoolOr::Data(T::deserialize(d)?))
            }
        }
    }
}
