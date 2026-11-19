//! Interprets `var Config` from turbopack-go's syntax-only value descriptions.
//! Only literals are accepted; nothing in the application is evaluated.
use std::collections::BTreeMap;

use serde::Deserialize;
use serde_json::{Map, Value};
use turbo_rcstr::RcStr;

/// The SDK ships in the installed `next` package; go.mod maps this path there.
const SDK_PATH: &str = "next/go";
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

fn parse(declaration: &str) -> Result<Declaration, String> {
    serde_json::from_str(declaration).map_err(|error| error.to_string())
}

/// Returns the entry's static configuration as Next.js JSON, or a located error.
///
/// Like `route.ts` segment config, `route.go` declares separate values; only
/// `const MaxDuration = 30` is supported (`preferredRegion` is deprecated). Like `proxy.ts`'s
/// `config` object, `proxy.go` declares `var Config = next.ProxyConfig{Matcher: ...}`.
/// Absent values are omitted from the result.
pub fn go_entry_config(
    functions: &[RcStr],
    values: &BTreeMap<RcStr, RcStr>,
    proxy: bool,
) -> Result<Value, String> {
    let names: &[&str] = if proxy { &["Config"] } else { &["MaxDuration"] };
    if let Some(name) = names
        .iter()
        .find(|name| functions.iter().any(|f| f == *name))
    {
        return Err(format!("{name} must be a static literal, not a function"));
    }
    if proxy {
        let Some(declaration) = values.get("Config") else {
            return Ok(Value::Object(Map::new()));
        };
        let Declaration {
            pos,
            constant,
            imports,
            value,
        } = parse(declaration)?;
        let reader = Reader { imports };
        return match &value {
            Node::Composite {
                type_name: Some(written),
                elements,
                ..
            } if !constant && reader.sdk_type(written, "ProxyConfig") => {
                reader.fields(elements, &[("Matcher", Reader::matchers)])
            }
            _ => Err(format!(
                "{pos}: Config must use a static next.ProxyConfig literal"
            )),
        };
    }
    let reader = Reader { imports: vec![] };
    let mut config = Map::new();
    if let Some(declaration) = values.get("MaxDuration") {
        config.insert(
            "maxDuration".into(),
            reader.duration(&parse(declaration)?.value)?,
        );
    }
    Ok(Value::Object(config))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    const IMPORT: &str = r#"[{"name":"framework","path":"next/go"}]"#;

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

    fn declarations(entries: &[(&str, bool, String)], imports: &str) -> BTreeMap<RcStr, RcStr> {
        entries
            .iter()
            .map(|(name, constant, value)| {
                (
                    RcStr::from(*name),
                    RcStr::from(format!(
                        r#"{{"pos":"p.go:1:5","constant":{constant},"imports":{imports},"value":{value}}}"#
                    )),
                )
            })
            .collect()
    }

    fn route(entries: &[(&str, bool, String)]) -> Result<Value, String> {
        go_entry_config(&[], &declarations(entries, "[]"), false)
    }

    fn proxy(value: String, imports: &str) -> Result<Value, String> {
        go_entry_config(
            &[],
            &declarations(&[("Config", false, value)], imports),
            true,
        )
    }

    #[test]
    fn reads_route_values() {
        assert_eq!(
            route(&[
                ("MaxDuration", true, int(30)),
                // Other exported values have no meaning to Next.js, including the
                // deprecated PreferredRegion.
                ("PreferredRegion", false, unsupported()),
                ("Config", false, unsupported()),
            ]),
            Ok(json!({ "maxDuration": 30 }))
        );
        assert_eq!(route(&[]), Ok(json!({})));
        assert_eq!(
            route(&[("MaxDuration", false, int(5))]),
            Ok(json!({ "maxDuration": 5 }))
        );
    }

    #[test]
    fn rejects_dynamic_route_values() {
        for (entry, message) in [
            (
                ("MaxDuration", true, unsupported()),
                "positive integer literal",
            ),
            (("MaxDuration", true, int(0)), "positive integer literal"),
            (
                ("MaxDuration", true, int(1 << 40)),
                "positive integer literal",
            ),
        ] {
            let error = route(&[entry]).unwrap_err();
            assert!(error.contains(message), "{error} should contain {message}");
            assert!(error.starts_with("p.go:"), "{error} should be located");
        }
        assert!(
            go_entry_config(&[RcStr::from("MaxDuration")], &BTreeMap::new(), false)
                .unwrap_err()
                .contains("not a function")
        );
    }

    #[test]
    fn reads_proxy_matchers() {
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
        assert_eq!(
            proxy(
                composite(
                    Some("framework.ProxyConfig"),
                    &[(Some("Matcher"), matchers)]
                ),
                IMPORT
            ),
            Ok(json!({
                "matcher": [{
                    "source": "/account/:path*",
                    "locale": false,
                    "has": [{ "type": "header", "key": "x" }],
                }],
            }))
        );
        let unnamed = r#"[{"name":"","path":"next/go"}]"#;
        assert_eq!(
            proxy(composite(Some("next.ProxyConfig"), &[]), unnamed),
            Ok(json!({}))
        );
        assert_eq!(go_entry_config(&[], &BTreeMap::new(), true), Ok(json!({})));
    }

    #[test]
    fn rejects_invalid_proxy_config() {
        let config = |fields: &[(Option<&str>, String)]| {
            proxy(composite(Some("framework.ProxyConfig"), fields), IMPORT).unwrap_err()
        };
        // Like proxy.ts, a proxy only configures matchers.
        for field in ["MaxDuration", "PreferredRegion"] {
            assert!(
                config(&[(Some(field), int(30))])
                    .contains(&format!("unsupported Config field {field}"))
            );
        }
        assert!(config(&[(None, int(30))]).contains("named fields"));
        let matcher = |source: String| {
            composite(
                Some("[]framework.Matcher"),
                &[(None, composite(None, &[(Some("Source"), source)]))],
            )
        };
        assert!(
            config(&[
                (Some("Matcher"), matcher(string("/"))),
                (Some("Matcher"), matcher(string("/")))
            ])
            .contains("duplicate Config field")
        );
        assert!(
            config(&[(Some("Matcher"), matcher(unsupported()))]).contains("static string literals")
        );
        // A factory call, a constant, and a lookalike type from another package.
        assert!(
            proxy(unsupported(), IMPORT)
                .unwrap_err()
                .contains("static next.ProxyConfig")
        );
        let other = r#"[{"name":"framework","path":"example.com/other"}]"#;
        assert!(
            proxy(composite(Some("framework.ProxyConfig"), &[]), other)
                .unwrap_err()
                .contains("static next.ProxyConfig")
        );
        assert!(
            go_entry_config(
                &[],
                &declarations(
                    &[(
                        "Config",
                        true,
                        composite(Some("framework.ProxyConfig"), &[])
                    )],
                    IMPORT
                ),
                true
            )
            .unwrap_err()
            .contains("static next.ProxyConfig")
        );
        assert!(
            go_entry_config(&[RcStr::from("Config")], &BTreeMap::new(), true)
                .unwrap_err()
                .contains("not a function")
        );
    }
}
