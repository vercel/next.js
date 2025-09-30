pub mod url_spec;

use std::borrow::Cow;

use percent_encoding::{AsciiSet, NON_ALPHANUMERIC, utf8_percent_encode};
pub use url_spec::*;

/// An [`AsciiSet`] that matches the behavior of JavaScript's [`encodeURIComponent`][mdn].
/// It escapes all characters except:
///
/// ```text
/// A-Z a-z 0–9 - _ . ! ~ * ' ( )
/// ```
///
/// [mdn]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent#description
///
/// Because this is designed to work with *any* URL component, it encodes more characters than the
/// spec requires. For less-agressive encoding sets, see [`FRAGMENT`], [`PATH`], [`USERINFO`],
/// [`PATH_SEGMENT`], [`SPECIAL_PATH_SEGMENT`], [`QUERY`], and [`SPECIAL_QUERY`].
pub const ENCODE_URI_COMPONENT: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'!')
    .remove(b'~')
    .remove(b'*')
    .remove(b'\'')
    .remove(b'(')
    .remove(b')');

/// A convenience wrapper around [`percent_encoding::utf8_percent_encode`] that returns a
/// [`Cow<'_, str>`] instead of a [`percent_encoding::PercentEncode`].
///
/// If you're just using the [`Display`][std::fmt::Display] trait on the return value, you should
/// use the functions from [`percent_encoding`] directly, as the
/// [`PercentEncode`][percent_encoding::PercentEncode] type can avoid creating an intermediate
/// [`String`].
pub fn percent_encode_str<'a>(input: &'a str, ascii_set: &'static AsciiSet) -> Cow<'a, str> {
    Cow::from(utf8_percent_encode(input, ascii_set))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_percent_encode_str() {
        assert!(matches!(
            percent_encode_str("nowhitespace", NON_ALPHANUMERIC),
            Cow::Borrowed(_),
        ));
        assert!(matches!(
            percent_encode_str("has whitespace", NON_ALPHANUMERIC),
            Cow::Owned(_),
        ));
    }

    #[test]
    fn test_encode_uri_component() {
        // Each (input, expected_output)
        let test_cases = [
            ("Hello", "Hello"),
            ("Hello World", "Hello%20World"),
            (
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.~*'()",
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.~*'()",
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
            let actual = percent_encode_str(input, ENCODE_URI_COMPONENT);
            assert_eq!(
                actual, expected,
                "Failed on input='{input}': expected='{expected}', got='{actual}'",
            );
        }
    }
}
