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

#![recursion_limit = "2048"]
#![deny(clippy::all)]
#![feature(box_patterns)]

use std::{cell::RefCell, env::current_dir, path::PathBuf, rc::Rc, sync::Arc};

use auto_cjs::contains_cjs;
use either::Either;
use fxhash::FxHashSet;
use next_transform_font::next_font_loaders;
use serde::Deserialize;
use turbo_binding::swc::core::{
    common::{chain, comments::Comments, pass::Optional, FileName, SourceFile, SourceMap},
    ecma::{
        ast::EsVersion, parser::parse_file_as_module, transforms::base::pass::noop, visit::Fold,
    },
};

pub mod amp_attributes;
mod auto_cjs;
pub mod disallow_re_export_all_in_page;
pub mod next_dynamic;
pub mod next_ssg;
pub mod page_config;
pub mod react_remove_properties;
pub mod react_server_components;
pub mod remove_console;
pub mod server_actions;
pub mod shake_exports;
mod top_level_binding_collector;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformOptions {
    #[serde(flatten)]
    pub swc: turbo_binding::swc::core::base::config::Options,

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
    pub server_components: Option<react_server_components::Config>,

    #[serde(default)]
    pub styled_jsx: bool,

    #[serde(default)]
    pub styled_components: Option<turbo_binding::swc::custom_transform::styled_components::Config>,

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
    pub shake_exports: Option<shake_exports::Config>,

    #[serde(default)]
    pub emotion: Option<turbo_binding::swc::custom_transform::emotion::EmotionOptions>,

    #[serde(default)]
    pub modularize_imports:
        Option<turbo_binding::swc::custom_transform::modularize_imports::Config>,

    #[serde(default)]
    pub font_loaders: Option<next_transform_font::Config>,

    #[serde(default)]
    pub server_actions: Option<server_actions::Config>,
}

pub fn custom_before_pass<'a, C: Comments + 'a>(
    cm: Arc<SourceMap>,
    file: Arc<SourceFile>,
    opts: &'a TransformOptions,
    comments: C,
    eliminated_packages: Rc<RefCell<FxHashSet<String>>>,
) -> impl Fold + 'a
where
    C: Clone,
{
    #[cfg(target_arch = "wasm32")]
    let relay_plugin = noop();

    #[cfg(not(target_arch = "wasm32"))]
    let relay_plugin = {
        if let Some(config) = &opts.relay {
            Either::Left(swc_relay::relay(
                config,
                file.name.clone(),
                current_dir().unwrap(),
                opts.pages_dir.clone(),
            ))
        } else {
            Either::Right(noop())
        }
    };

    let mut modularize_imports_config = match &opts.modularize_imports {
        Some(config) => config.clone(),
        None => turbo_binding::swc::custom_transform::modularize_imports::Config {
            packages: std::collections::HashMap::new(),
        },
    };
    modularize_imports_config.packages.insert(
        "next/server".to_string(),
        turbo_binding::swc::custom_transform::modularize_imports::PackageConfig {
            transform: "next/dist/server/web/exports/{{ kebabCase member }}".to_string(),
            prevent_full_import: false,
            skip_default_conversion: false,
        },
    );

    chain!(
        disallow_re_export_all_in_page::disallow_re_export_all_in_page(opts.is_page_file),
        match &opts.server_components {
            Some(config) if config.truthy() =>
                Either::Left(react_server_components::server_components(
                    file.name.clone(),
                    config.clone(),
                    comments.clone(),
                    opts.app_dir.clone()
                )),
            _ => Either::Right(noop()),
        },
        if opts.styled_jsx {
            Either::Left(
                turbo_binding::swc::custom_transform::styled_jsx::visitor::styled_jsx(
                    cm.clone(),
                    file.name.clone(),
                ),
            )
        } else {
            Either::Right(noop())
        },
        match &opts.styled_components {
            Some(config) => Either::Left(
                turbo_binding::swc::custom_transform::styled_components::styled_components(
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
        next_dynamic::next_dynamic(
            opts.is_development,
            opts.is_server,
            match &opts.server_components {
                Some(config) if config.truthy() => match config {
                    react_server_components::Config::WithOptions(x) => x.is_server,
                    _ => false,
                },
                _ => false,
            },
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
                Either::Left(remove_console::remove_console(config.clone())),
            _ => Either::Right(noop()),
        },
        match &opts.react_remove_properties {
            Some(config) if config.truthy() =>
                Either::Left(react_remove_properties::remove_properties(config.clone())),
            _ => Either::Right(noop()),
        },
        match &opts.shake_exports {
            Some(config) => Either::Left(shake_exports::shake_exports(config.clone())),
            None => Either::Right(noop()),
        },
        opts.emotion
            .as_ref()
            .and_then(|config| {
                if !config.enabled.unwrap_or(false) {
                    return None;
                }
                if let FileName::Real(path) = &file.name {
                    let fm = cm.load_file(path).unwrap();
                    path.to_str().map(|_| {
                        Either::Left(
                            turbo_binding::swc::custom_transform::emotion::EmotionTransformer::new(
                                config.clone(),
                                path,
                                fm.src_hash as u32,
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
        turbo_binding::swc::custom_transform::modularize_imports::modularize_imports(
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
                serde_json::from_str(r##"{ "type": "commonjs", "ignoreDynamic": true }"##).unwrap(),
            );
        }

        self
    }
}
