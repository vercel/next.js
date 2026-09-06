use lightningcss::{
    stylesheet::{ParserOptions, StyleSheet},
    traits::IntoOwned,
};

pub fn stylesheet_into_static<'i>(ss: &StyleSheet, options: ParserOptions<'i>) -> StyleSheet<'i> {
    let sources = ss.sources.clone();
    let rules = ss.rules.clone().into_owned();

    StyleSheet::new(sources, rules, options)
}
