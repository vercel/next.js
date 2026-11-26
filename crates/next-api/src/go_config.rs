//! Interprets `var Config` from turbopack-go's syntax-only value descriptions.
//! Only literals are accepted; nothing in the application is evaluated.
use std::collections::BTreeMap;

use serde_json::{Map, Value};
use turbo_rcstr::RcStr;
use turbopack_go::{GoDeclaration, GoImport, GoValue as Node, GoValueElement as Element};

/// The SDK ships in the installed `next` package; go.mod maps this path there.
const SDK_PATH: &str = "next/go/proxy";
/// The SDK's package clause, which applies to an import without an explicit name.
const SDK_PACKAGE: &str = "proxy";

/// Go's integer types. An integer literal assigned to any of them keeps its value, unlike a
/// named type such as `time.Duration`, where `30` means 30 nanoseconds rather than seconds.
const INTEGER_TYPES: &[&str] = &[
    "int", "int8", "int16", "int32", "int64", "uint", "uint8", "uint16", "uint32", "uint64",
];

type Fields<'a, 'imports> = &'a [(
    &'a str,
    fn(&Reader<'imports>, &Node) -> Result<Value, String>,
)];

struct Reader<'a> {
    imports: &'a [GoImport],
}

impl<'imports> Reader<'imports> {
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

    fn fields(&self, elements: &[Element], allowed: Fields<'_, 'imports>) -> Result<Value, String> {
        let mut values = Map::new();
        for element in elements {
            let Some(key) = &element.key else {
                return Err(format!(
                    "{}: Config requires named fields",
                    element.value.pos()
                ));
            };
            let Some((_, parse)) = allowed.iter().find(|(name, _)| *name == key.as_str()) else {
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
            Node::String { value, .. } => Ok(Value::String(value.to_string())),
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

    /// A `[]proxy.<name>` literal whose items are `proxy.<name>` (or type-elided) literals.
    fn list(&self, node: &Node, name: &str, fields: Fields<'_, 'imports>) -> Result<Value, String> {
        let error = |pos: &str, message: &str| Err(format!("{pos}: Config requires {message}"));
        let Node::Composite {
            type_name: Some(type_name),
            elements,
            pos,
        } = node
        else {
            return error(node.pos(), &format!("a []proxy.{name} literal"));
        };
        match type_name.strip_prefix("[]") {
            Some(item) if self.sdk_type(item, name) => {}
            _ => return error(pos, &format!("a []proxy.{name} literal")),
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
                (_, value) => error(value.pos(), &format!("proxy.{name} struct literals")),
            })
            .collect()
    }

    fn conditions(&self, node: &Node) -> Result<Value, String> {
        self.list(
            node,
            "Condition",
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

/// Returns the entry's static configuration as Next.js JSON, or a located error.
///
/// Like `route.ts` segment config, `route.go` declares separate values; only
/// `const MaxDuration = 30` is supported (`preferredRegion` is deprecated). Like `proxy.ts`'s
/// `config` object, `proxy.go` declares `var Config = proxy.Config{Matcher: ...}`.
/// Absent values are omitted from the result.
pub fn go_entry_config(
    functions: &[RcStr],
    values: &BTreeMap<RcStr, GoDeclaration>,
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
        let GoDeclaration {
            pos,
            constant,
            imports,
            value,
            ..
        } = declaration;
        let reader = Reader { imports };
        return match value {
            Node::Composite {
                type_name: Some(written),
                elements,
                ..
            } if !constant && reader.sdk_type(written, "Config") => {
                reader.fields(elements, &[("Matcher", Reader::matchers)])
            }
            _ => Err(format!(
                "{pos}: Config must use a static proxy.Config literal"
            )),
        };
    }
    let reader = Reader { imports: &[] };
    let mut config = Map::new();
    if let Some(declaration) = values.get("MaxDuration") {
        let GoDeclaration {
            pos,
            type_name,
            value,
            ..
        } = declaration;
        if let Some(type_name) = type_name
            .as_ref()
            .filter(|type_name| !INTEGER_TYPES.contains(&type_name.as_str()))
        {
            return Err(format!(
                "{pos}: MaxDuration is a number of seconds; declare it untyped (const MaxDuration \
                 = 30) or with an integer type, not {type_name}"
            ));
        }
        config.insert("maxDuration".into(), reader.duration(value)?);
    }
    Ok(Value::Object(config))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    const IMPORT: &[(&str, &str)] = &[("framework", "next/go/proxy")];

    fn string(value: &str) -> Node {
        Node::String {
            pos: "p.go:1:1".into(),
            value: value.into(),
        }
    }

    fn int(value: i64) -> Node {
        Node::Int {
            pos: "p.go:1:1".into(),
            value,
        }
    }

    fn unsupported() -> Node {
        Node::Unsupported {
            pos: "p.go:9:9".into(),
        }
    }

    fn composite(type_name: Option<&str>, elements: &[(Option<&str>, Node)]) -> Node {
        Node::Composite {
            pos: "p.go:1:1".into(),
            type_name: type_name.map(Into::into),
            elements: elements
                .iter()
                .map(|(key, value)| Element {
                    key: key.map(Into::into),
                    value: value.clone(),
                })
                .collect(),
        }
    }

    fn declarations(
        entries: &[(&str, bool, Node)],
        imports: &[(&str, &str)],
    ) -> BTreeMap<RcStr, GoDeclaration> {
        entries
            .iter()
            .map(|(name, constant, value)| {
                (
                    RcStr::from(*name),
                    GoDeclaration {
                        pos: "p.go:1:5".into(),
                        constant: *constant,
                        type_name: None,
                        imports: imports
                            .iter()
                            .map(|(name, path)| GoImport {
                                name: (*name).into(),
                                path: (*path).into(),
                            })
                            .collect(),
                        value: value.clone(),
                    },
                )
            })
            .collect()
    }

    fn route(entries: &[(&str, bool, Node)]) -> Result<Value, String> {
        go_entry_config(&[], &declarations(entries, &[]), false)
    }

    /// A route `MaxDuration` declared with an explicit type.
    fn typed_route(type_name: &str, value: Node) -> Result<Value, String> {
        let mut declarations = declarations(&[("MaxDuration", true, value)], &[]);
        declarations.get_mut("MaxDuration").unwrap().type_name = Some(type_name.into());
        go_entry_config(&[], &declarations, false)
    }

    fn proxy(value: Node, imports: &[(&str, &str)]) -> Result<Value, String> {
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
    fn checks_the_declared_max_duration_type() {
        // An integer type keeps the literal's value in seconds.
        for type_name in ["int", "int64", "uint32"] {
            assert_eq!(
                typed_route(type_name, int(30)),
                Ok(json!({ "maxDuration": 30 }))
            );
        }
        // In Go, `const MaxDuration time.Duration = 30` is 30 nanoseconds, not seconds.
        for type_name in ["time.Duration", "float64", "(unsupported)"] {
            let error = typed_route(type_name, int(30)).unwrap_err();
            assert!(
                error.contains("number of seconds") && error.contains(type_name),
                "{error} should reject {type_name}"
            );
            assert!(error.starts_with("p.go:"), "{error} should be located");
        }
    }

    #[test]
    fn reads_proxy_matchers() {
        let has = composite(
            Some("[]framework.Condition"),
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
                            Node::Bool {
                                pos: "p.go:1:1".into(),
                                value: false,
                            },
                        ),
                        (Some("Has"), has),
                    ],
                ),
            )],
        );
        assert_eq!(
            proxy(
                composite(Some("framework.Config"), &[(Some("Matcher"), matchers)]),
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
        let unnamed = &[("", "next/go/proxy")];
        assert_eq!(
            proxy(composite(Some("proxy.Config"), &[]), unnamed),
            Ok(json!({}))
        );
        assert_eq!(go_entry_config(&[], &BTreeMap::new(), true), Ok(json!({})));
    }

    #[test]
    fn rejects_invalid_proxy_config() {
        let config = |fields: &[(Option<&str>, Node)]| {
            proxy(composite(Some("framework.Config"), fields), IMPORT).unwrap_err()
        };
        // Like proxy.ts, a proxy only configures matchers.
        for field in ["MaxDuration", "PreferredRegion"] {
            assert!(
                config(&[(Some(field), int(30))])
                    .contains(&format!("unsupported Config field {field}"))
            );
        }
        assert!(config(&[(None, int(30))]).contains("named fields"));
        let matcher = |source: Node| {
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
        // A factory call, a constant, and lookalike types from other packages.
        assert!(
            proxy(unsupported(), IMPORT)
                .unwrap_err()
                .contains("static proxy.Config")
        );
        for path in ["example.com/other", "next/go", "next/go/assets"] {
            let other = [("framework", path)];
            assert!(
                proxy(composite(Some("framework.Config"), &[]), &other)
                    .unwrap_err()
                    .contains("static proxy.Config")
            );
        }
        assert!(
            go_entry_config(
                &[],
                &declarations(
                    &[("Config", true, composite(Some("framework.Config"), &[]))],
                    IMPORT
                ),
                true
            )
            .unwrap_err()
            .contains("static proxy.Config")
        );
        assert!(
            go_entry_config(&[RcStr::from("Config")], &BTreeMap::new(), true)
                .unwrap_err()
                .contains("not a function")
        );
    }
}
