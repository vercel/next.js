use lightningcss::{
    stylesheet::{ParserOptions, StyleSheet},
    traits::IntoOwned,
};

pub fn stylesheet_into_static<'i, 'o>(
    ss: &StyleSheet,
    options: ParserOptions<'o, 'i>,
) -> StyleSheet<'i, 'o> {
    let sources = ss.sources.clone();
    let rules = ss.rules.clone().into_owned();

    //

    StyleSheet::new(sources, rules, options)
}
