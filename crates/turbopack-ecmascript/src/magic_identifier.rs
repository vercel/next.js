use std::fmt::Write;

pub fn encode(content: &str) -> String {
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
    r += "__";
    r
}

#[cfg(test)]
mod tests {
    use super::encode;

    #[test]
    fn test_encode() {
        assert_eq!(encode("Hello World"), "__TURBOPACK__Hello__World__");
        assert_eq!(encode("Hello_World"), "__TURBOPACK__Hello_World__");
        assert_eq!(encode("Hello__World"), "__TURBOPACK__Hello_$5f$World__");
        assert_eq!(encode("Hello/World"), "__TURBOPACK__Hello$2f$World__");
        assert_eq!(encode("Hello///World"), "__TURBOPACK__Hello$2f2f2f$World__");
        assert_eq!(encode("Hello/_World"), "__TURBOPACK__Hello$2f$_World__");
        assert_eq!(encode("Hello_/_World"), "__TURBOPACK__Hello_$2f$_World__");
        assert_eq!(encode("Hello😀World"), "__TURBOPACK__Hello$_1f600$World__");
        assert_eq!(
            encode("Hello/😀/World"),
            "__TURBOPACK__Hello$2f_1f600$$2f$World__"
        );
        assert_eq!(
            encode("Hello😀😀World"),
            "__TURBOPACK__Hello$_1f600$$_1f600$World__"
        );
    }
}
