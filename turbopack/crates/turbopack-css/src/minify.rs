use anyhow::{Result, anyhow};
use lightningcss::stylesheet::{MinifyOptions, ParserOptions, PrinterOptions, StyleSheet};

pub fn minify_css(code: &str, source_map: Option<&str>) -> Result<(String, Option<String>)> {
    let mut stylesheet = StyleSheet::parse(code, ParserOptions::default())
        .map_err(|error| anyhow!("failed to parse CSS: {error}"))?;
    stylesheet
        .minify(MinifyOptions::default())
        .map_err(|error| anyhow!("failed to minify CSS: {error}"))?;
    let mut map = source_map.map(|_| parcel_sourcemap::SourceMap::new(""));
    let result = stylesheet.to_css(PrinterOptions {
        minify: true,
        source_map: map.as_mut(),
        ..Default::default()
    })?;
    let map = match (map, source_map) {
        (Some(mut map), Some(original)) => {
            let mut original = parcel_sourcemap::SourceMap::from_json("", original)
                .map_err(|error| anyhow!("invalid CSS source map: {error}"))?;
            map.extends(&mut original)
                .map_err(|error| anyhow!("failed to compose CSS source map: {error}"))?;
            Some(
                map.to_json(None)
                    .map_err(|error| anyhow!("failed to write CSS source map: {error}"))?,
            )
        }
        _ => None,
    };
    Ok((result.code, map))
}

#[cfg(test)]
mod tests {
    use super::minify_css;

    #[test]
    fn minifies_and_traces_back_to_original_sources() {
        let (code, map) = minify_css("/* comment */\np {\n  color: red;\n}\n", None).unwrap();
        assert_eq!(code, "p{color:red}");
        assert!(map.is_none());

        let original = r#"{"version":3,"sources":["original.css"],"sourcesContent":["p { color: red }"],"names":[],"mappings":"AAAA;AACA;AACA;AACA"}"#;
        let (_, map) = minify_css("p {\n  color: red;\n}\n", Some(original)).unwrap();
        let map = map.unwrap();
        assert!(map.contains(r#""sources":["original.css"]"#), "{map}");
        assert!(
            map.contains(r#""sourcesContent":["p { color: red }"]"#),
            "{map}"
        );
    }
}
