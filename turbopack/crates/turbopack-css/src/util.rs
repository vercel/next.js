/// Converts a string to camelCase by treating `-`, `_`, `.`, and ` ` as word boundaries.
///
/// This matches the behavior of webpack's `css-loader` `camelCase` function from
/// `camelcase.ts`. Unlike the full `camelCase` npm package, this implementation
/// focuses on the common CSS class name patterns and does not handle
/// `preserveConsecutiveUppercase` or `pascalCase` options (neither does webpack's
/// css-loader for export convention).
///
/// # Examples
/// ```ignore
/// assert_eq!(camel_case("main-content"), "mainContent");
/// assert_eq!(camel_case("my_class"), "myClass");
/// assert_eq!(camel_case("FOO-bar"), "fooBar");
/// assert_eq!(camel_case("--foo"), "foo");
/// ```
pub fn camel_case(s: &str) -> String {
    if s.is_empty() {
        return String::new();
    }

    // Strip leading delimiters
    let s = s.trim_start_matches(|c| c == '-' || c == '_' || c == '.' || c == ' ');
    if s.is_empty() {
        return String::new();
    }

    let mut result = String::with_capacity(s.len());
    let mut capitalize_next = false;
    let mut first = true;

    for ch in s.chars() {
        if ch == '-' || ch == '_' || ch == '.' || ch == ' ' {
            capitalize_next = true;
        } else if capitalize_next {
            result.extend(ch.to_uppercase());
            capitalize_next = false;
            first = false;
        } else if first {
            // First real character is always lowercase
            result.extend(ch.to_lowercase());
            first = false;
        } else {
            result.push(ch);
        }
    }

    result
}

/// Converts hyphens followed by a word character to camelCase.
///
/// Only transforms hyphens (`-`), unlike [`camel_case`] which also handles
/// `_`, `.`, and space. This matches webpack's `dashesCamelCase` function.
///
/// # Examples
/// ```ignore
/// assert_eq!(dashes_camel_case("main-content"), "mainContent");
/// assert_eq!(dashes_camel_case("my_class"), "my_class");  // underscore preserved
/// ```
pub fn dashes_camel_case(s: &str) -> String {
    if s.is_empty() {
        return String::new();
    }

    let mut result = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '-' {
            // Consume consecutive hyphens
            while chars.peek() == Some(&'-') {
                chars.next();
            }
            // Capitalize the next character if it exists
            if let Some(next) = chars.next() {
                result.extend(next.to_uppercase());
            }
        } else {
            result.push(ch);
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_camel_case_basic() {
        assert_eq!(camel_case("main-content"), "mainContent");
        assert_eq!(camel_case("nav-bar"), "navBar");
        assert_eq!(camel_case("foo-bar-baz"), "fooBarBaz");
    }

    #[test]
    fn test_camel_case_underscores() {
        assert_eq!(camel_case("my_class"), "myClass");
        assert_eq!(camel_case("foo_bar_baz"), "fooBarBaz");
    }

    #[test]
    fn test_camel_case_dots_and_spaces() {
        assert_eq!(camel_case("my.class"), "myClass");
        assert_eq!(camel_case("my class"), "myClass");
    }

    #[test]
    fn test_camel_case_mixed_delimiters() {
        assert_eq!(camel_case("foo-bar_baz"), "fooBarBaz");
        assert_eq!(camel_case("a-b_c.d e"), "aBCDE");
    }

    #[test]
    fn test_camel_case_leading_delimiters() {
        assert_eq!(camel_case("--foo"), "foo");
        assert_eq!(camel_case("__foo"), "foo");
        assert_eq!(camel_case("-foo-bar"), "fooBar");
    }

    #[test]
    fn test_camel_case_uppercase_input() {
        assert_eq!(camel_case("FOO-BAR"), "fOOBAR");
        assert_eq!(camel_case("Foo-Bar"), "fooBar");
    }

    #[test]
    fn test_camel_case_single_char() {
        assert_eq!(camel_case("a"), "a");
        assert_eq!(camel_case("A"), "a");
    }

    #[test]
    fn test_camel_case_empty() {
        assert_eq!(camel_case(""), "");
        assert_eq!(camel_case("---"), "");
    }

    #[test]
    fn test_camel_case_no_delimiters() {
        assert_eq!(camel_case("foobar"), "foobar");
        assert_eq!(camel_case("fooBar"), "fooBar");
    }

    #[test]
    fn test_dashes_camel_case_basic() {
        assert_eq!(dashes_camel_case("main-content"), "mainContent");
        assert_eq!(dashes_camel_case("nav-bar"), "navBar");
        assert_eq!(dashes_camel_case("foo-bar-baz"), "fooBarBaz");
    }

    #[test]
    fn test_dashes_preserves_underscores() {
        assert_eq!(dashes_camel_case("my_class"), "my_class");
        assert_eq!(dashes_camel_case("foo_bar"), "foo_bar");
    }

    #[test]
    fn test_dashes_preserves_dots() {
        assert_eq!(dashes_camel_case("my.class"), "my.class");
    }

    #[test]
    fn test_dashes_consecutive_hyphens() {
        assert_eq!(dashes_camel_case("foo--bar"), "fooBar");
        assert_eq!(dashes_camel_case("foo---bar"), "fooBar");
    }

    #[test]
    fn test_dashes_leading_hyphen() {
        // Leading hyphen with no preceding char — next char is capitalized
        assert_eq!(dashes_camel_case("-foo"), "Foo");
        assert_eq!(dashes_camel_case("--foo"), "Foo");
    }

    #[test]
    fn test_dashes_trailing_hyphen() {
        assert_eq!(dashes_camel_case("foo-"), "foo");
    }

    #[test]
    fn test_dashes_empty() {
        assert_eq!(dashes_camel_case(""), "");
        assert_eq!(dashes_camel_case("---"), "");
    }

    #[test]
    fn test_dashes_no_hyphens() {
        assert_eq!(dashes_camel_case("foobar"), "foobar");
        assert_eq!(dashes_camel_case("fooBar"), "fooBar");
    }
}
