//! Interprets `var Config` from turbopack-go's syntax-only value descriptions.
//! Only literals are accepted; nothing in the application is evaluated.
use std::collections::BTreeMap;

use serde::Deserialize;
use serde_json::{Map, Value};
use turbo_rcstr::RcStr;

const SDK_PATH: &str = "github.com/vercel/next.js/packages/next/go";
/// The SDK's package clause, which applies to an import without an explicit name.
const SDK_PACKAGE: &str = "next";

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum Node {
    String {
        pos: String,
        value: String,
    },
    Int {
        pos: String,
        value: i64,
    },
    Bool {
        pos: String,
        value: bool,
    },
    Composite {
        pos: String,
        #[serde(rename = "type")]
        type_name: Option<String>,
        elements: Vec<Element>,
    },
    Unsupported {
        pos: String,
    },
}

impl Node {
    fn pos(&self) -> &str {
        match self {
            Node::String { pos, .. }
            | Node::Int { pos, .. }
            | Node::Bool { pos, .. }
            | Node::Composite { pos, .. }
            | Node::Unsupported { pos } => pos,
        }
    }
}

#[derive(Deserialize)]
struct Element {
    key: Option<String>,
    value: Node,
}

#[derive(Deserialize)]
struct Import {
    name: String,
    path: String,
}

#[derive(Deserialize)]
struct Declaration {
    pos: String,
    constant: bool,
    imports: Vec<Import>,
    value: Node,
}

type Fields<'a> = &'a [(&'a str, fn(&Reader, &Node) -> Result<Value, String>)];

struct Reader {
    imports: Vec<Import>,
}

impl Reader {
    /// Whether a type written as `qualifier.Name` names the SDK type `name`.
    fn sdk_type(&self, written: &str, name: &str) -> bool {
        let Some((qualifier, type_name)) = written.split_once('.') else {
            return false;
        };
        type_name == name
            && self.imports.iter().any(|import| {
                import.path == SDK_PATH
                    && if import.name.is_empty() {
                        qualifier == SDK_PACKAGE
                    } else {
                        import.name == qualifier
                    }
            })
    }

    fn fields(&self, elements: &[Element], allowed: Fields) -> Result<Value, String> {
        let mut values = Map::new();
        for element in elements {
            let Some(key) = &element.key else {
                return Err(format!(
                    "{}: Config requires named fields",
                    element.value.pos()
                ));
            };
            let Some((_, parse)) = allowed.iter().find(|(name, _)| name == key) else {
                return Err(format!(
                    "{}: unsupported Config field {key}",
                    element.value.pos()
                ));
            };
            // Field names begin with an ASCII uppercase letter; JSON keys are camelCase.
            let json_key = key[..1].to_ascii_lowercase() + &key[1..];
            if values.contains_key(&json_key) {
                return Err(format!(
                    "{}: duplicate Config field {key}",
                    element.value.pos()
                ));
            }
            values.insert(json_key, parse(self, &element.value)?);
        }
        Ok(Value::Object(values))
    }

    fn text(&self, node: &Node) -> Result<Value, String> {
        match node {
            Node::String { value, .. } => Ok(Value::String(value.clone())),
            _ => Err(format!(
                "{}: Config values must be static string literals",
                node.pos()
            )),
        }
    }

    fn duration(&self, node: &Node) -> Result<Value, String> {
        match node {
            Node::Int { value, .. } if *value > 0 && *value <= i32::MAX as i64 => {
                Ok(Value::from(*value))
            }
            _ => Err(format!(
                "{}: MaxDuration must be a positive integer literal",
                node.pos()
            )),
        }
    }

    fn regions(&self, node: &Node) -> Result<Value, String> {
        let error = || {
            format!(
                "{}: PreferredRegion must be a nonempty []string literal of nonempty strings",
                node.pos()
            )
        };
        let Node::Composite {
            type_name: Some(type_name),
            elements,
            ..
        } = node
        else {
            return Err(error());
        };
        if type_name != "[]string" || elements.is_empty() {
            return Err(error());
        }
        elements
            .iter()
            .map(|element| match (&element.key, &element.value) {
                (None, Node::String { value, .. }) if !value.is_empty() => {
                    Ok(Value::String(value.clone()))
                }
                (None, Node::String { .. }) => Err(error()),
                (_, value) => self.text(value),
            })
            .collect()
    }

    fn locale(&self, node: &Node) -> Result<Value, String> {
        match node {
            Node::Bool { value: false, .. } => Ok(Value::Bool(false)),
            _ => Err(format!(
                "{}: Locale must be the literal false, or omitted",
                node.pos()
            )),
        }
    }

    /// A `[]next.<name>` literal whose items are `next.<name>` (or type-elided) literals.
    fn list(&self, node: &Node, name: &str, fields: Fields) -> Result<Value, String> {
        let error = |pos: &str, message: &str| Err(format!("{pos}: Config requires {message}"));
        let Node::Composite {
            type_name: Some(type_name),
            elements,
            pos,
        } = node
        else {
            return error(node.pos(), &format!("a []next.{name} literal"));
        };
        match type_name.strip_prefix("[]") {
            Some(item) if self.sdk_type(item, name) => {}
            _ => return error(pos, &format!("a []next.{name} literal")),
        }
        elements
            .iter()
            .map(|element| match (&element.key, &element.value) {
                (
                    None,
                    Node::Composite {
                        type_name,
                        elements,
                        ..
                    },
                ) if type_name
                    .as_deref()
                    .is_none_or(|type_name| self.sdk_type(type_name, name)) =>
                {
                    self.fields(elements, fields)
                }
                (_, value) => error(value.pos(), &format!("next.{name} struct literals")),
            })
            .collect()
    }

    fn conditions(&self, node: &Node) -> Result<Value, String> {
        self.list(
            node,
            "RouteHas",
            &[
                ("Type", Reader::text),
                ("Key", Reader::text),
                ("Value", Reader::text),
            ],
        )
    }

    fn matchers(&self, node: &Node) -> Result<Value, String> {
        self.list(
            node,
            "Matcher",
            &[
                ("Source", Reader::text),
                ("Has", Reader::conditions),
                ("Missing", Reader::conditions),
                ("Locale", Reader::locale),
            ],
        )
    }
}

/// Returns the entry's static configuration as Next.js JSON (`maxDuration` and `preferredRegion`
/// for routes; only `matcher` for proxies, like proxy.ts), or a located error. A missing
/// `Config` is an empty object.
pub fn go_entry_config(
    functions: &[RcStr],
    values: &BTreeMap<RcStr, RcStr>,
    proxy: bool,
) -> Result<Value, String> {
    let type_name = if proxy { "ProxyConfig" } else { "RouteConfig" };
    if functions.iter().any(|name| name == "Config") {
        return Err(format!(
            "Config must be a var initialized with a static next.{type_name} literal"
        ));
    }
    let Some(declaration) = values.get("Config") else {
        return Ok(Value::Object(Map::new()));
    };
    let Declaration {
        pos,
        constant,
        imports,
        value,
    } = serde_json::from_str(declaration).map_err(|error| error.to_string())?;
    let reader = Reader { imports };
    let elements = match &value {
        Node::Composite {
            type_name: Some(written),
            elements,
            ..
        } if !constant && reader.sdk_type(written, type_name) => elements,
        _ => {
            return Err(format!(
                "{pos}: Config must use a static next.{type_name} literal"
            ));
        }
    };
    if proxy {
        reader.fields(elements, &[("Matcher", Reader::matchers)])
    } else {
        reader.fields(
            elements,
            &[
                ("MaxDuration", Reader::duration),
                ("PreferredRegion", Reader::regions),
            ],
        )
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    const IMPORT: &str =
        r#"[{"name":"framework","path":"github.com/vercel/next.js/packages/next/go"}]"#;

    fn string(value: &str) -> String {
        format!(r#"{{"kind":"string","pos":"p.go:1:1","value":"{value}"}}"#)
    }

    fn int(value: i64) -> String {
        format!(r#"{{"kind":"int","pos":"p.go:1:1","value":{value}}}"#)
    }

    fn unsupported() -> String {
        r#"{"kind":"unsupported","pos":"p.go:9:9"}"#.to_string()
    }

    fn composite(type_name: Option<&str>, elements: &[(Option<&str>, String)]) -> String {
        let elements = elements
            .iter()
            .map(|(key, value)| match key {
                Some(key) => format!(r#"{{"key":"{key}","value":{value}}}"#),
                None => format!(r#"{{"value":{value}}}"#),
            })
            .collect::<Vec<_>>()
            .join(",");
        let type_name = type_name.map_or("null".to_string(), |name| format!("\"{name}\""));
        format!(
            r#"{{"kind":"composite","pos":"p.go:1:1","type":{type_name},"elements":[{elements}]}}"#
        )
    }

    fn config(value: String, imports: &str) -> BTreeMap<RcStr, RcStr> {
        BTreeMap::from([(
            RcStr::from("Config"),
            RcStr::from(format!(
                r#"{{"pos":"p.go:1:5","constant":false,"imports":{imports},"value":{value}}}"#
            )),
        )])
    }

    fn route(fields: &[(Option<&str>, String)]) -> Result<Value, String> {
        go_entry_config(
            &[],
            &config(composite(Some("framework.RouteConfig"), fields), IMPORT),
            false,
        )
    }

    #[test]
    fn reads_static_config() {
        let regions = composite(
            Some("[]string"),
            &[(None, string("iad1")), (None, string("sfo1"))],
        );
        assert_eq!(
            route(&[
                (Some("MaxDuration"), int(30)),
                (Some("PreferredRegion"), regions),
            ]),
            Ok(json!({ "maxDuration": 30, "preferredRegion": ["iad1", "sfo1"] }))
        );
        let has = composite(
            Some("[]framework.RouteHas"),
            &[(
                None,
                composite(
                    None,
                    &[(Some("Type"), string("header")), (Some("Key"), string("x"))],
                ),
            )],
        );
        let matchers = composite(
            Some("[]framework.Matcher"),
            &[(
                None,
                composite(
                    Some("framework.Matcher"),
                    &[
                        (Some("Source"), string("/account/:path*")),
                        (
                            Some("Locale"),
                            r#"{"kind":"bool","pos":"p.go:1:1","value":false}"#.into(),
                        ),
                        (Some("Has"), has),
                    ],
                ),
            )],
        );
        let value = composite(
            Some("framework.ProxyConfig"),
            &[(Some("Matcher"), matchers)],
        );
        assert_eq!(
            go_entry_config(&[], &config(value, IMPORT), true),
            Ok(json!({
                "matcher": [{
                    "source": "/account/:path*",
                    "locale": false,
                    "has": [{ "type": "header", "key": "x" }],
                }],
            }))
        );
    }

    #[test]
    fn proxies_only_accept_matchers() {
        for field in ["MaxDuration", "PreferredRegion"] {
            let value = composite(Some("framework.ProxyConfig"), &[(Some(field), int(30))]);
            let error = go_entry_config(&[], &config(value, IMPORT), true).unwrap_err();
            assert!(
                error.contains(&format!("unsupported Config field {field}")),
                "{error}"
            );
        }
    }

    #[test]
    fn defaults_and_unnamed_sdk_import() {
        assert_eq!(go_entry_config(&[], &BTreeMap::new(), false), Ok(json!({})));
        let unnamed = r#"[{"name":"","path":"github.com/vercel/next.js/packages/next/go"}]"#;
        assert_eq!(
            go_entry_config(
                &[],
                &config(composite(Some("next.RouteConfig"), &[]), unnamed),
                false
            ),
            Ok(json!({}))
        );
    }

    #[test]
    fn rejects_dynamic_and_invalid_config() {
        let regions = |elements: &[(Option<&str>, String)]| composite(Some("[]string"), elements);
        for (fields, message) in [
            (
                vec![(Some("MaxDuration"), unsupported())],
                "positive integer literal",
            ),
            (
                vec![(Some("MaxDuration"), int(0))],
                "positive integer literal",
            ),
            (
                vec![(Some("MaxDuration"), int(1 << 40))],
                "positive integer literal",
            ),
            (vec![(None, int(30))], "named fields"),
            (
                vec![(Some("Runtime"), string("edge"))],
                "unsupported Config field",
            ),
            (
                vec![(Some("MaxDuration"), int(2)), (Some("MaxDuration"), int(3))],
                "duplicate Config field",
            ),
            (
                vec![(Some("PreferredRegion"), unsupported())],
                "[]string literal",
            ),
            (
                vec![(Some("PreferredRegion"), regions(&[]))],
                "[]string literal",
            ),
            (
                vec![(Some("PreferredRegion"), regions(&[(None, string(""))]))],
                "[]string literal",
            ),
            (
                vec![(Some("PreferredRegion"), regions(&[(None, unsupported())]))],
                "static string literals",
            ),
            (
                vec![(Some("Matcher"), unsupported())],
                "unsupported Config field",
            ),
        ] {
            let error = route(&fields).unwrap_err();
            assert!(error.contains(message), "{error} should contain {message}");
            assert!(error.starts_with("p.go:"), "{error} should be located");
        }
    }

    #[test]
    fn rejects_wrong_declarations() {
        let rejected = |values: BTreeMap<RcStr, RcStr>, proxy| {
            go_entry_config(&[], &values, proxy).unwrap_err()
        };
        // A factory call, the wrong kind, and a lookalike type from another package.
        assert!(rejected(config(unsupported(), IMPORT), false).contains("static next.RouteConfig"));
        assert!(
            rejected(
                config(composite(Some("framework.ProxyConfig"), &[]), IMPORT),
                false
            )
            .contains("static next.RouteConfig")
        );
        let other = r#"[{"name":"framework","path":"example.com/other"}]"#;
        assert!(
            rejected(
                config(composite(Some("framework.RouteConfig"), &[]), other),
                false
            )
            .contains("static next.RouteConfig")
        );
        assert!(
            go_entry_config(&[RcStr::from("Config")], &BTreeMap::new(), false)
                .unwrap_err()
                .contains("must be a var")
        );
        let matcher = composite(
            Some("framework.ProxyConfig"),
            &[(
                Some("Matcher"),
                composite(
                    Some("[]framework.Matcher"),
                    &[(None, composite(None, &[(Some("Source"), unsupported())]))],
                ),
            )],
        );
        assert!(rejected(config(matcher, IMPORT), true).contains("static string literals"));
    }
}
