/*
Copyright (c) 2017 The swc Project Developers

Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
*/

// TODO(alexkirsz) Remove once the diagnostic is fixed.
#![allow(rustc::untranslatable_diagnostic_trivial)]
#![recursion_limit = "2048"]
#![deny(clippy::all)]
#![feature(box_patterns)]

use std::{cell::RefCell, path::PathBuf, rc::Rc, sync::Arc};

use auto_cjs::contains_cjs;
use either::Either;
use fxhash::FxHashSet;
use next_transform_dynamic::{next_dynamic, NextDynamicMode};
use next_transform_font::next_font_loaders;
use serde::Deserialize;
use turbopack_binding::swc::{
    core::{
        common::{
            chain, comments::Comments, pass::Optional, FileName, Mark, SourceFile, SourceMap,
            SyntaxContext,
        },
        ecma::{
            ast::EsVersion, atoms::JsWord, parser::parse_file_as_module,
            transforms::base::pass::noop, visit::Fold,
        },
    },
    custom_transform::modularize_imports,
};

pub mod amp_attributes;
mod auto_cjs;
pub mod cjs_optimizer;
pub mod disallow_re_export_all_in_page;
pub mod named_import_transform;
pub mod next_ssg;
pub mod optimize_barrel;
pub mod optimize_server_react;
pub mod page_config;
pub mod react_server_components;
pub mod server_actions;
pub mod shake_exports;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformOptions {
    #[serde(flatten)]
    pub swc: turbopack_binding::swc::core::base::config::Options,

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
    pub is_server: bool,

    #[serde(default)]
    pub bundle_target: JsWord,

    #[serde(default)]
    pub server_components: Option<react_server_components::Config>,

    #[serde(default)]
    pub styled_jsx: Option<turbopack_binding::swc::custom_transform::styled_jsx::visitor::Config>,

    #[serde(default)]
    pub styled_components:
        Option<turbopack_binding::swc::custom_transform::styled_components::Config>,

    #[serde(default)]
    pub remove_console: Option<remove_console::Config>,

    #[serde(default)]
    pub react_remove_properties: Option<react_remove_properties::Config>,

    #[serde(default)]
    #[cfg(not(target_arch = "wasm32"))]
    pub relay: Option<turbopack_binding::swc::custom_transform::relay::Config>,

    #[allow(unused)]
    #[serde(default)]
    #[cfg(target_arch = "wasm32")]
    /// Accept any value
    pub relay: Option<serde_json::Value>,

    #[serde(default)]
    pub shake_exports: Option<shake_exports::Config>,

    #[serde(default)]
    pub emotion: Option<turbopack_binding::swc::custom_transform::emotion::EmotionOptions>,

    #[serde(default)]
    pub modularize_imports: Option<modularize_imports::Config>,

    #[serde(default)]
    pub auto_modularize_imports: Option<named_import_transform::Config>,

    #[serde(default)]
    pub optimize_barrel_exports: Option<optimize_barrel::Config>,

    #[serde(default)]
    pub font_loaders: Option<next_transform_font::Config>,

    #[serde(default)]
    pub server_actions: Option<server_actions::Config>,

    #[serde(default)]
    pub cjs_require_optimizer: Option<cjs_optimizer::Config>,

    #[serde(default)]
    pub optimize_server_react: Option<optimize_server_react::Config>,
}

pub fn custom_before_pass<'a, C: Comments + 'a>(
    cm: Arc<SourceMap>,
    file: Arc<SourceFile>,
    opts: &'a TransformOptions,
    comments: C,
    eliminated_packages: Rc<RefCell<FxHashSet<String>>>,
    unresolved_mark: Mark,
) -> impl Fold + 'a
where
    C: Clone,
{
    #[cfg(target_arch = "wasm32")]
    let relay_plugin = noop();

    #[cfg(not(target_arch = "wasm32"))]
    let relay_plugin = {
        if let Some(config) = &opts.relay {
            Either::Left(turbopack_binding::swc::custom_transform::relay::relay(
                config,
                file.name.clone(),
                std::env::current_dir().unwrap(),
                opts.pages_dir.clone(),
                None,
            ))
        } else {
            Either::Right(noop())
        }
    };

    let modularize_imports_config = match &opts.modularize_imports {
        Some(config) => config.clone(),
        None => modularize_imports::Config {
            packages: std::collections::HashMap::new(),
        },
    };

    chain!(
        disallow_re_export_all_in_page::disallow_re_export_all_in_page(opts.is_page_file),
        match &opts.server_components {
            Some(config) if config.truthy() =>
                Either::Left(react_server_components::server_components(
                    file.name.clone(),
                    config.clone(),
                    comments.clone(),
                    opts.app_dir.clone(),
                    opts.bundle_target.clone()
                )),
            _ => Either::Right(noop()),
        },
        if let Some(config) = opts.styled_jsx {
            Either::Left(
                turbopack_binding::swc::custom_transform::styled_jsx::visitor::styled_jsx(
                    cm.clone(),
                    file.name.clone(),
                    config,
                ),
            )
        } else {
            Either::Right(noop())
        },
        match &opts.styled_components {
            Some(config) => Either::Left(
                turbopack_binding::swc::custom_transform::styled_components::styled_components(
                    file.name.clone(),
                    file.src_hash,
                    config.clone(),
                )
            ),
            None => Either::Right(noop()),
        },
        Optional::new(
            next_ssg::next_ssg(eliminated_packages),
            !opts.disable_next_ssg
        ),
        amp_attributes::amp_attributes(),
        next_dynamic(
            opts.is_development,
            opts.is_server,
            match &opts.server_components {
                Some(config) if config.truthy() => match config {
                    // Always enable the Server Components mode for both
                    // server and client layers.
                    react_server_components::Config::WithOptions(_) => true,
                    _ => false,
                },
                _ => false,
            },
            NextDynamicMode::Webpack,
            file.name.clone(),
            opts.pages_dir.clone()
        ),
        Optional::new(
            page_config::page_config(opts.is_development, opts.is_page_file),
            !opts.disable_page_config
        ),
        relay_plugin,
        match &opts.remove_console {
            Some(config) if config.truthy() =>
                Either::Left(remove_console::remove_console(
                    config.clone(),
                    SyntaxContext::empty().apply_mark(unresolved_mark)
                )),
            _ => Either::Right(noop()),
        },
        match &opts.react_remove_properties {
            Some(config) if config.truthy() =>
                Either::Left(react_remove_properties::react_remove_properties(config.clone())),
            _ => Either::Right(noop()),
        },
        match &opts.shake_exports {
            Some(config) => Either::Left(shake_exports::shake_exports(config.clone())),
            None => Either::Right(noop()),
        },
        match &opts.auto_modularize_imports {
            Some(config) => Either::Left(named_import_transform::named_import_transform(config.clone())),
            None => Either::Right(noop()),
        },
        match &opts.optimize_barrel_exports {
            Some(config) => Either::Left(optimize_barrel::optimize_barrel(config.clone())),
            _ => Either::Right(noop()),
        },
        match &opts.optimize_server_react {
            Some(config) => Either::Left(optimize_server_react::optimize_server_react(config.clone())),
            _ => Either::Right(noop()),
        },
        opts.emotion
            .as_ref()
            .and_then(|config| {
                if !config.enabled.unwrap_or(false) {
                    return None;
                }
                if let FileName::Real(path) = &file.name {
                    path.to_str().map(|_| {
                        Either::Left(
                            turbopack_binding::swc::custom_transform::emotion::EmotionTransformer::new(
                                config.clone(),
                                path,
                                file.src_hash as u32,
                                cm,
                                comments.clone(),
                            ),
                        )
                    })
                } else {
                    None
                }
            })
            .unwrap_or_else(|| Either::Right(noop())),
        modularize_imports::modularize_imports(
            modularize_imports_config
        ),
        match &opts.font_loaders {
            Some(config) => Either::Left(next_font_loaders(config.clone())),
            None => Either::Right(noop()),
        },
        match &opts.server_actions {
            Some(config) => Either::Left(server_actions::server_actions(
                &file.name,
                config.clone(),
                comments,
            )),
            None => Either::Right(noop()),
        },
        match &opts.cjs_require_optimizer {
            Some(config) => {
                Either::Left(cjs_optimizer::cjs_optimizer(config.clone(), SyntaxContext::empty().apply_mark(unresolved_mark)))
            },
            None => Either::Right(noop()),
        },
    )
}

impl TransformOptions {
    pub fn patch(mut self, fm: &SourceFile) -> Self {
        self.swc.swcrc = false;

        let should_enable_commonjs = self.swc.config.module.is_none()
            && (fm.src.contains("module.exports") || fm.src.contains("__esModule"))
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
