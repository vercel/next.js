pub use crate::{
    utils::{analyze, analyzer, State},
    visitors::{
        display_name_and_id::display_name_and_id, transpile_css_prop::transpile::transpile_css_prop,
    },
};
use serde::Deserialize;
use std::{cell::RefCell, rc::Rc, sync::Arc};
use swc_atoms::JsWord;
use swc_common::{chain, SourceFile};
use swc_ecmascript::visit::{Fold, VisitMut};

mod css;
mod utils;
mod visitors;

#[derive(Debug, Default, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Config {
    #[serde(default = "true_by_default")]
    pub display_name: bool,

    #[serde(default = "true_by_default")]
    pub ssr: bool,

    #[serde(default = "true_by_default")]
    pub file_name: bool,

    #[serde(default)]
    pub namespace: String,

    #[serde(default)]
    pub top_level_import_paths: Vec<JsWord>,

    #[serde(default)]
    pub transpile_template_literals: bool,

    #[serde(default)]
    pub minify: bool,

    #[serde(default)]
    pub css_prop: bool,
}

fn true_by_default() -> bool {
    true
}

impl Config {
    pub(crate) fn use_namespace(&self) -> String {
        if self.namespace.is_empty() {
            return String::new();
        }
        format!("{}__", self.namespace)
    }
}

/// NOTE: **This is not complete**.
///
/// Only [analyzer] and [display_name_and_id] is implemented.
pub fn styled_components(file: Arc<SourceFile>, config: Config) -> impl Fold + VisitMut {
    let state: Rc<RefCell<State>> = Default::default();
    let config = Rc::new(config);

    chain!(
        analyzer(config.clone(), state.clone()),
        display_name_and_id(file, config, state),
        transpile_css_prop()
    )
}
