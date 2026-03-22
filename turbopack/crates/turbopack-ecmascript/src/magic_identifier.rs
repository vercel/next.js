use std::{
    borrow::Cow,
    fmt::{Display, Write},
};

use once_cell::sync::Lazy;
use regex::{Captures, Regex, Replacer};

pub fn mangle(content: &str) -> String {
    let mut r = "__TURBOPACK__".to_string();
    let mut hex_mode = false;
    for c in content.chars() {
        if matches!(c, '0'..='9' | 'A'..='Z' | 'a'..='z' | ' ') {
            if hex_mode {
                r.push('$');
                hex_mode = false;
            }
            if c == ' ' {
                r += "__";
            } else {
                r.push(c);
            }
        } else if c == '_' && (!r.ends_with('_') || hex_mode) {
            if hex_mode {
                r.push('$');
                hex_mode = false;
            }
            r += "_";
        } else if c == '$' && !hex_mode {
            r += "$$";
        } else if matches!(c, '\0'..='\u{ff}') {
            if !hex_mode {
                r.push('$');
                hex_mode = true;
            }
            write!(r, "{0:2x}", c as u8).unwrap();
        } else {
            if !hex_mode {
                r.push('$');
            }
            write!(r, "_{:x}$", c as u32).unwrap();
            hex_mode = false;
        }
    }
    if hex_mode {
        r.push('$');
    }
    r += "__";
    r
}

/// Decodes a magic identifier into a string.
/// Returns None if the identifier is not mangled.
pub fn unmangle(identifier: &str) -> Option<String> {
    // Check for magic identifier prefix and suffix
    if !identifier.starts_with("__TURBOPACK__") || !identifier.ends_with("__") {
        return None;
    }

    // Extract the content between __TURBOPACK__ and the trailing __
    let content = &identifier[13..identifier.len() - 2];

    if content.is_empty() {
        return None;
    }

    enum Mode {
        Text,
        Underscore,
        Hex,
        LongHex,
    }
    let mut mode = Mode::Text;
    let mut output = String::new();
    let mut buffer = String::with_capacity(2);
    for char in content.chars() {
        match mode {
            Mode::Text => match char {
                '_' => mode = Mode::Underscore,
                '$' => mode = Mode::Hex,
                c if c.is_ascii_alphanumeric() => output.push(c),
                _ => return None,
            },
            Mode::Underscore => match char {
                '_' => {
                    output.push(' ');
                    mode = Mode::Text;
                }
                '$' => {
                    output.push('_');
                    mode = Mode::Hex;
                }
                c if c.is_ascii_alphanumeric() => {
                    output.push('_');
                    output.push(c);
                    mode = Mode::Text;
                }
                _ => return None,
            },
            Mode::Hex => {
                if buffer.len() == 2 {
                    if let Ok(byte) = u8::from_str_radix(&buffer, 16) {
                        output.push(byte as char);
                    }
                    buffer.clear();
                }
                match char {
                    '_' => {
                        debug_assert!(buffer.is_empty());
                        mode = Mode::LongHex;
                    }
                    '$' => {
                        debug_assert!(buffer.is_empty());
                        mode = Mode::Text;
                    }
                    c if c.is_ascii_hexdigit() => {
                        buffer.push(c);
                    }
                    _ => return None,
                }
            }
            Mode::LongHex => {
                debug_assert!(char != '_');
                match char {
                    '$' => {
                        if let Ok(code) = u32::from_str_radix(&buffer, 16) {
                            output.push(std::char::from_u32(code).unwrap());
                        }
                        buffer.clear();
                        mode = Mode::Text;
                    }
                    c if c.is_ascii_hexdigit() => {
                        buffer.push(c);
                    }
                    _ => return None,
                }
            }
        }
    }
    debug_assert!(matches!(mode, Mode::Text));
    Some(output)
}

/// Decode all magic identifiers in a string.
pub fn unmangle_identifiers<T: Display>(text: &str, magic: impl Fn(String) -> T) -> Cow<'_, str> {
    static IDENTIFIER_REGEX: Lazy<Regex> =
        Lazy::new(|| Regex::new(r"__TURBOPACK__[a-zA-Z0-9_$]+__").unwrap());

    struct Rep<T: Fn(String) -> O, O: Display>(T);

    impl<T: Fn(String) -> O, O: Display> Replacer for Rep<T, O> {
        fn replace_append(&mut self, caps: &Captures<'_>, dst: &mut String) {
            let matched = caps.get(0).unwrap().as_str();
            let unmangled = unmangle(matched).unwrap();
            write!(dst, "{}", self.0(unmangled)).unwrap();
        }
    }

    IDENTIFIER_REGEX.replace_all(text, Rep(magic))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode() {
        assert_eq!(mangle("Hello World"), "__TURBOPACK__Hello__World__");
        assert_eq!(mangle("Hello_World"), "__TURBOPACK__Hello_World__");
        assert_eq!(mangle("Hello__World"), "__TURBOPACK__Hello_$5f$World__");
        assert_eq!(mangle("Hello___World"), "__TURBOPACK__Hello_$5f$_World__");
        assert_eq!(mangle("Hello/World"), "__TURBOPACK__Hello$2f$World__");
        assert_eq!(mangle("Hello///World"), "__TURBOPACK__Hello$2f2f2f$World__");
        assert_eq!(mangle("Hello/_World"), "__TURBOPACK__Hello$2f$_World__");
        assert_eq!(mangle("Hello_/_World"), "__TURBOPACK__Hello_$2f$_World__");
        assert_eq!(mangle("Hello😀World"), "__TURBOPACK__Hello$_1f600$World__");
        assert_eq!(
            mangle("Hello/😀/World"),
            "__TURBOPACK__Hello$2f_1f600$$2f$World__"
        );
        assert_eq!(
            mangle("Hello😀😀World"),
            "__TURBOPACK__Hello$_1f600$$_1f600$World__"
        );
    }

    #[test]
    fn test_decode() {
        assert_eq!(unmangle("foobar"), None);
        assert_eq!(
            unmangle("__TURBOPACK__Hello__World__"),
            Some("Hello World".to_string())
        );
        assert_eq!(
            unmangle("__TURBOPACK__Hello_World__"),
            Some("Hello_World".to_string())
        );
        assert_eq!(
            unmangle("__TURBOPACK__Hello_$5f$World__"),
            Some("Hello__World".to_string())
        );
        assert_eq!(
            unmangle("__TURBOPACK__Hello_$5f$_World__"),
            Some("Hello___World".to_string())
        );
        assert_eq!(
            unmangle("__TURBOPACK__Hello$2f$World__"),
            Some("Hello/World".to_string())
        );
        assert_eq!(
            unmangle("__TURBOPACK__Hello$2f2f2f$World__"),
            Some("Hello///World".to_string())
        );
        assert_eq!(
            unmangle("__TURBOPACK__Hello$2f$_World__"),
            Some("Hello/_World".to_string())
        );
        assert_eq!(
            unmangle("__TURBOPACK__Hello_$2f$_World__"),
            Some("Hello_/_World".to_string())
        );
        assert_eq!(
            unmangle("__TURBOPACK__Hello$_1f600$World__"),
            Some("Hello😀World".to_string())
        );
        assert_eq!(
            unmangle("__TURBOPACK__Hello$2f_1f600$$2f$World__"),
            Some("Hello/😀/World".to_string())
        );
        assert_eq!(
            unmangle("__TURBOPACK__Hello$_1f600$$_1f600$World__"),
            Some("Hello😀😀World".to_string())
        );
    }

    #[test]
    fn test_unmangle_identifiers() {
        assert_eq!(
            unmangle_identifiers(
                "Hello __TURBOPACK__Hello__World__ __TURBOPACK__Hello_World__",
                |s| format!("{{{s}}}")
            ),
            "Hello {Hello World} {Hello_World}"
        );
    }
}
