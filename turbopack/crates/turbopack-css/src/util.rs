pub fn stringify_js(str: &str) -> String {
    let mut escaped = String::with_capacity(str.len());
    for char in str.chars() {
        match char {
            // Escape the following characters required for strings by the CSS scanner:
            // https://www.w3.org/TR/CSS21/grammar.html#scanner
            // https://github.com/vercel/turbo/pull/2598#discussion_r1022625909
            //
            // Note that the form feed character is not representable as \f in Rust strings, so
            // the unicode representation \u{0c} is used.
            '\\' => escaped.push_str(r"\\"),
            '\n' => escaped.push_str(r"\n"),
            '\r' => escaped.push_str(r"\r"),
            '"' => escaped.push_str(r#"\""#),
            '\u{0c}' => escaped.push_str(r"\f"),
            _ => escaped.push(char),
        }
    }

    format!("\"{}\"", escaped)
}

#[cfg(test)]
mod tests {
    use crate::util::stringify_js;

    #[test]
    fn surrounds_with_double_quotes() {
        assert_eq!(stringify_js("foo"), r#""foo""#);
    }

    #[test]
    fn escapes_double_quotes() {
        assert_eq!(stringify_js(r#""""#), r#""\"\"""#);
    }

    #[test]
    fn escapes_backslash() {
        assert_eq!(stringify_js(r"\"), r#""\\""#);
        assert_eq!(stringify_js(r"\\"), r#""\\\\""#);
        assert_eq!(stringify_js(r"\n"), r#""\\n""#);
    }

    #[test]
    fn escapes_newlines() {
        assert_eq!(stringify_js("\n"), r#""\n""#);
    }

    #[test]
    fn escapes_mixed() {
        assert_eq!(stringify_js("\n\r\u{0c}"), r#""\n\r\f""#);
    }
}
