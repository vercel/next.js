use regex::Regex;
use serde::Deserialize;

use next_binding::swc::core::{
    ecma::ast::*,
    ecma::visit::{noop_fold_type, Fold, FoldWith},
};

#[derive(Clone, Debug, Deserialize)]
#[serde(untagged)]
pub enum Config {
    All(bool),
    WithOptions(Options),
}

impl Config {
    pub fn truthy(&self) -> bool {
        match self {
            Config::All(b) => *b,
            Config::WithOptions(_) => true,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
pub struct Options {
    #[serde(default)]
    pub properties: Vec<String>,
}

struct RemoveProperties {
    properties: Vec<Regex>,
}

impl RemoveProperties {
    fn should_remove_property(&self, name: &str) -> bool {
        self.properties.iter().any(|p| p.is_match(name))
    }
}

impl Fold for RemoveProperties {
    noop_fold_type!();

    fn fold_jsx_opening_element(&mut self, mut el: JSXOpeningElement) -> JSXOpeningElement {
        el.attrs.retain(|attr| {
            !matches!(attr, JSXAttrOrSpread::JSXAttr(JSXAttr {
              name: JSXAttrName::Ident(ident),
              ..
            }) if self.should_remove_property(ident.sym.as_ref()))
        });
        el.fold_children_with(self)
    }
}

pub fn remove_properties(config: Config) -> impl Fold {
    let mut properties: Vec<Regex> = match config {
        Config::WithOptions(x) => x
            .properties
            .iter()
            .map(|pattern| {
                Regex::new(pattern).unwrap_or_else(|e| {
                    panic!("error compiling property regex `{}`: {}", pattern, e);
                })
            })
            .collect(),
        _ => vec![],
    };
    if properties.is_empty() {
        // Keep the default regex identical to `babel-plugin-react-remove-properties`.
        properties.push(Regex::new(r"^data-test").unwrap());
    }
    RemoveProperties { properties }
}
