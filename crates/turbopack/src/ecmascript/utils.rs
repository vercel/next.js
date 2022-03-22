use std::fmt::Display;

use swc_ecmascript::ast::Lit;

pub fn lit_to_string(lit: &Lit) -> String {
    match lit {
        Lit::Str(str) => format!("\"{}\"", &*str.value),
        Lit::Bool(b) => b.value.to_string(),
        Lit::Null(_) => "null".to_string(),
        Lit::Num(n) => n.to_string(),
        Lit::BigInt(n) => n.value.to_string(),
        Lit::Regex(r) => format!("/{}/{}", r.exp, r.flags),
        Lit::JSXText(text) => text.value.to_string(),
    }
}

pub struct CommaSeparated<'a, T>(pub &'a Vec<T>);

impl<'a, T: Display> Display for CommaSeparated<'a, T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(
            &self
                .0
                .iter()
                .map(|item| item.to_string())
                .collect::<Vec<_>>()
                .join(", "),
        )
    }
}
