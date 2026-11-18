use percent_encoding::{AsciiSet, CONTROLS, PercentEncode, utf8_percent_encode};

/// An `AsciiSet` that matches the behavior of JavaScript's `encodeURIComponent`.
/// - It leaves `A-Z a-z 0-9 - _ . ~` unescaped.
/// - It percent-encodes all other ASCII characters (and of course non-ASCII).
/// - The `CONTROLS` set covers `\0`-`\x1F` and `\x7F`.
const ENCODE_URI_COMPONENT_SET: &AsciiSet = &CONTROLS
    // Add everything else JS `encodeURIComponent` would encode:
    .add(b' ')
    // .add(b'!')
    .add(b'"')
    .add(b'#')
    .add(b'$')
    .add(b'%')
    .add(b'&')
    .add(b'\'')
    // .add(b'(')
    // .add(b')')
    .add(b'*')
    .add(b'+')
    .add(b',')
    .add(b'/')
    .add(b':')
    .add(b';')
    .add(b'<')
    .add(b'=')
    .add(b'>')
    .add(b'?')
    .add(b'@')
    .add(b'[')
    .add(b'\\')
    .add(b']')
    .add(b'^')
    .add(b'`')
    .add(b'{')
    .add(b'|')
    // .add(b'~');
    .add(b'}');

/// Like [`ENCODE_URI_COMPONENT_SET`], but leaves `/` unescaped.
const ENCODE_URI_PATH_SET: &AsciiSet = &ENCODE_URI_COMPONENT_SET.remove(b'/');

/// Encodes each `/`-separated segment of `path` like JavaScript's `encodeURIComponent`, keeping the
/// `/` separators. Equivalent to `path.split('/').map(encodeURIComponent).join('/')`.
///
/// This returns a lazy [`std::fmt::Display`] adapter rather than a `String`, so callers can write
/// it straight into their output buffer. When nothing needs escaping (the common case) the input is
/// written through as a single borrowed slice, so this never allocates.
pub fn encode_uri_path(path: &str) -> PercentEncode<'_> {
    utf8_percent_encode(path, ENCODE_URI_PATH_SET)
}

#[cfg(test)]
mod tests {
    use std::borrow::Cow;

    use itertools::Itertools;

    use super::*;

    fn encode_uri_component(input: &str) -> String {
        utf8_percent_encode(input, ENCODE_URI_COMPONENT_SET).to_string()
    }

    #[test]
    fn test_encode_uri_path_matches_per_segment_encoding() {
        for input in [
            "",
            "/",
            "//",
            "static/chunks/app/page.js",
            "/static/chunks/[root of the server]__abc123._.js",
            "static/chunks/(group)/a b/c%d/é/page.js",
            "a/b?c#d/e&f=g",
        ] {
            let expected = input.split('/').map(encode_uri_component).join("/");
            assert_eq!(
                encode_uri_path(input).to_string(),
                expected,
                "input='{input}'"
            );
        }
    }

    #[test]
    fn test_encode_uri_path_noop_borrows() {
        let input = "static/chunks/app/(group)/page-0123abcd.js";
        let mut chunks = encode_uri_path(input);
        assert_eq!(chunks.next(), Some(input));
        assert_eq!(chunks.next(), None);
        assert!(matches!(
            Cow::from(encode_uri_path(input)),
            Cow::Borrowed(_)
        ));
    }

    #[test]
    fn test_encode_uri_component() {
        // Each (input, expected_output)
        let test_cases = vec![
            ("Hello", "Hello"),
            ("Hello World", "Hello%20World"),
            (
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.~",
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.~",
            ),
            ("This is 100% test!", "This%20is%20100%25%20test!"),
            ("你好", "%E4%BD%A0%E5%A5%BD"),
            (
                "こんにちは世界",
                "%E3%81%93%E3%82%93%E3%81%AB%E3%81%A1%E3%81%AF%E4%B8%96%E7%95%8C",
            ),
            ("foo bar@baz.com", "foo%20bar%40baz.com"),
            ("#$&+,/:;=?@", "%23%24%26%2B%2C%2F%3A%3B%3D%3F%40"),
            ("éléphant", "%C3%A9l%C3%A9phant"),
            ("𐍈", "%F0%90%8D%88"),
            ("A   B    C", "A%20%20%20B%20%20%20%20C"),
            ("foo\nbar", "foo%0Abar"),
            ("foo\rbar", "foo%0Dbar"),
            ("foo\r\nbar", "foo%0D%0Abar"),
            ("Hello\u{200B}World", "Hello%E2%80%8BWorld"),
            ("a\u{0301}", "a%CC%81"),
            ("🏳️‍🌈", "%F0%9F%8F%B3%EF%B8%8F%E2%80%8D%F0%9F%8C%88"),
            (
                "👩‍❤️‍💋‍👩",
                "%F0%9F%91%A9%E2%80%8D%E2%9D%A4%EF%B8%8F%E2%80%8D%F0%9F%92%8B%E2%80%8D%F0%9F%91%A9",
            ),
            (
                "Cafe\u{0301} / résumé & co.",
                "Cafe%CC%81%20%2F%20r%C3%A9sum%C3%A9%20%26%20co.",
            ),
            (
                "السلام عليكم!?",
                "%D8%A7%D9%84%D8%B3%D9%84%D8%A7%D9%85%20%D8%B9%D9%84%D9%8A%D9%83%D9%85!%3F",
            ),
            (
                "你好 world! ~测试~ (mixed)",
                "%E4%BD%A0%E5%A5%BD%20world!%20~%E6%B5%8B%E8%AF%95~%20(mixed)",
            ),
            (
                "a\u{0301} 🇺🇳 e\u{0301} 🍏",
                "a%CC%81%20%F0%9F%87%BA%F0%9F%87%B3%20e%CC%81%20%F0%9F%8D%8F",
            ),
            ("𐍈𐍇", "%F0%90%8D%88%F0%90%8D%87"),
            (
                "<<<>>>%%%$$$###@@@",
                "%3C%3C%3C%3E%3E%3E%25%25%25%24%24%24%23%23%23%40%40%40",
            ),
            ("[some]{text}(here)<>", "%5Bsome%5D%7Btext%7D(here)%3C%3E"),
            (
                "Test\r\ntest 🐱\n\rSecond line \u{200B} end",
                "Test%0D%0Atest%20%F0%9F%90%B1%0A%0DSecond%20line%20%E2%80%8B%20end",
            ),
        ];

        for (input, expected) in test_cases {
            let actual = encode_uri_component(input);
            assert_eq!(
                actual, expected,
                "Failed on input='{input}': expected='{expected}', got='{actual}'",
            );
        }
    }
}
