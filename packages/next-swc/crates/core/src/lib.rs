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
//#![deny(clippy::all)]

use auto_cjs::contains_cjs;
use either::Either;
use serde::Deserialize;
use std::cell::RefCell;
use std::rc::Rc;
use std::{path::PathBuf, sync::Arc};
use swc::config::ModuleConfig;
use swc_common::SourceFile;
use swc_common::{self, chain, pass::Optional};
use swc_ecmascript::ast::EsVersion;
use swc_ecmascript::transforms::pass::noop;
use swc_ecmascript::{
    parser::{lexer::Lexer, Parser, StringInput},
    visit::Fold,
};

pub mod amp_attributes;
mod auto_cjs;
pub mod disallow_re_export_all_in_page;
pub mod hook_optimizer;
pub mod next_dynamic;
pub mod next_ssg;
pub mod page_config;
pub mod react_remove_properties;
pub mod remove_console;
pub mod shake_exports;
pub mod styled_jsx;
mod top_level_binding_collector;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransformOptions {
    #[serde(flatten)]
    pub swc: swc::config::Options,

    #[serde(default)]
    pub disable_next_ssg: bool,

    #[serde(default)]
    pub disable_page_config: bool,

    #[serde(default)]
    pub pages_dir: Option<PathBuf>,

    #[serde(default)]
    pub is_page_file: bool,

    #[serde(default)]
    pub is_development: bool,

    #[serde(default)]
    pub is_server: bool,

    #[serde(default)]
    pub styled_components: Option<styled_components::Config>,

    #[serde(default)]
    pub remove_console: Option<remove_console::Config>,

    #[serde(default)]
    pub react_remove_properties: Option<react_remove_properties::Config>,

    #[serde(default)]
    pub shake_exports: Option<shake_exports::Config>,
}

pub fn custom_before_pass(file: Arc<SourceFile>, opts: &TransformOptions) -> impl Fold {
    chain!(
        disallow_re_export_all_in_page::disallow_re_export_all_in_page(opts.is_page_file),
        styled_jsx::styled_jsx(),
        hook_optimizer::hook_optimizer(),
        match &opts.styled_components {
            Some(config) => {
                let config = Rc::new(config.clone());
                let state: Rc<RefCell<styled_components::State>> = Default::default();

                Either::Left(chain!(
                    styled_components::analyzer(config.clone(), state.clone()),
                    styled_components::display_name_and_id(file.clone(), config, state)
                ))
            }
            None => {
                Either::Right(noop())
            }
        },
        Optional::new(next_ssg::next_ssg(), !opts.disable_next_ssg),
        amp_attributes::amp_attributes(),
        next_dynamic::next_dynamic(
            opts.is_development,
            opts.is_server,
            file.name.clone(),
            opts.pages_dir.clone()
        ),
        Optional::new(
            page_config::page_config(opts.is_development, opts.is_page_file),
            !opts.disable_page_config
        ),
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
        }
    )
}

impl TransformOptions {
    pub fn patch(mut self, fm: &SourceFile) -> Self {
        self.swc.swcrc = false;

        let should_enable_commonjs =
            self.swc.config.module.is_none() && fm.src.contains("module.exports") && {
                let syntax = self.swc.config.jsc.syntax.unwrap_or_default();
                let target = self.swc.config.jsc.target.unwrap_or(EsVersion::latest());
                let lexer = Lexer::new(syntax, target, StringInput::from(&*fm), None);
                let mut p = Parser::new_from(lexer);
                p.parse_module()
                    .map(|m| contains_cjs(&m))
                    .unwrap_or_default()
            };

        if should_enable_commonjs {
            self.swc.config.module = Some(ModuleConfig::CommonJs(Default::default()));
        }

        self
    }
}
