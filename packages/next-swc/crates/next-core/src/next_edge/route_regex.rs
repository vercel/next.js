//! The following code was mostly generated using GTP-4 from
//! next.js/packages/next/src/shared/lib/router/utils/route-regex.ts
//!
//! It contains errors and is not meant to be used as-is.
//!
//! The following should be changed:
//! * NamedMiddlewareRegex should just contain a string, not an actual Regex.
//! * There's plenty of places where more Rust-idiomatic string processing could
//!   be used.
//! * Compilation errors.

use std::collections::HashMap;

use lazy_static::lazy_static;
use regex::Regex;

const INTERCEPTION_ROUTE_MARKERS: [&str; 0] = []; // Filler value
const NEXT_QUERY_PARAM_PREFIX: &str = "nxtP";
const NEXT_INTERCEPTION_MARKER_PREFIX: &str = "nxtI";

#[derive(Debug, Clone)]
pub struct Group {
    pub pos: usize,
    pub repeat: bool,
    pub optional: bool,
}

#[derive(Debug)]
pub struct RouteRegex {
    pub groups: HashMap<String, Group>,
    pub re: Regex,
}

#[derive(Debug)]
pub struct NamedRouteRegex {
    pub regex: RouteRegex,
    pub named_regex: Regex,
    pub route_keys: HashMap<String, String>,
}

#[derive(Debug)]
pub struct NamedMiddlewareRegex {
    pub named_regex: Regex,
}

/// Parses a given parameter from a route to a data structure that can be used
/// to generate the parametrized route. Examples:
///   - `[...slug]` -> `{ key: 'slug', repeat: true, optional: true }`
///   - `...slug` -> `{ key: 'slug', repeat: true, optional: false }`
///   - `[foo]` -> `{ key: 'foo', repeat: false, optional: true }`
///   - `bar` -> `{ key: 'bar', repeat: false, optional: false }`
fn parse_parameter(param: &str) -> (String, bool, bool) {
    let mut param = param.to_string();
    let optional = param.starts_with('[') && param.ends_with(']');
    if optional {
        param = param[1..param.len() - 1].to_string();
    }
    let repeat = param.starts_with("...");
    if repeat {
        param = param[3..].to_string();
    }
    (param, repeat, optional)
}

fn escape_string_regexp(segment: &str) -> String {
    regex::escape(segment)
}

fn remove_trailing_slash(route: &str) -> String {
    route.trim_end_matches('/').to_string()
}

lazy_static! {
    static ref PARAM_MATCH_REGEX: Regex = Regex::new(r"\[((?:\[.*\])|.+)\]").unwrap();
}

fn get_parametrized_route(route: &str) -> (String, HashMap<String, Group>) {
    let segments: Vec<&str> = remove_trailing_slash(route)[1..].split('/').collect();
    let mut groups: HashMap<String, Group> = HashMap::new();
    let mut group_index = 1;
    let parameterized_route = segments
        .iter()
        .map(|segment| {
            let marker_match = INTERCEPTION_ROUTE_MARKERS
                .iter()
                .find(|m| segment.starts_with(m));
            let param_matches = PARAM_MATCH_REGEX.captures(segment);
            if let Some(marker) = marker_match {
                if let Some(matches) = param_matches {
                    let (key, optional, repeat) = parse_parameter(&matches[1]);
                    groups.insert(
                        key.clone(),
                        Group {
                            pos: group_index,
                            repeat,
                            optional,
                        },
                    );
                    group_index += 1;
                    return format!("/{}([^/]+?)", escape_string_regexp(marker));
                }
            } else if let Some(matches) = param_matches {
                let (key, optional, repeat) = parse_parameter(&matches[1]);
                groups.insert(
                    key.clone(),
                    Group {
                        pos: group_index,
                        repeat,
                        optional,
                    },
                );
                group_index += 1;
                return if repeat {
                    if optional {
                        "(?:/(.+?))?"
                    } else {
                        "/(.+?)"
                    }
                } else {
                    "/([^/]+?)"
                }
                .to_string();
            }
            format!("/{}", escape_string_regexp(segment))
        })
        .collect::<Vec<String>>()
        .join("");
    (parameterized_route, groups)
}

/// From a normalized route this function generates a regular expression and
/// a corresponding groups object intended to be used to store matching groups
/// from the regular expression.
pub fn get_route_regex(normalized_route: &str) -> RouteRegex {
    let (parameterized_route, groups) = get_parametrized_route(normalized_route);
    RouteRegex {
        re: Regex::new(&format!("^{}(?:/)?$", parameterized_route)).unwrap(),
        groups,
    }
}

/// Builds a function to generate a minimal routeKey using only a-z and minimal
/// number of characters.
fn build_get_safe_route_key() -> Box<dyn FnMut() -> String> {
    let mut route_key_char_code = 97;
    let mut route_key_char_length = 1;
    Box::new(move || {
        let mut route_key = String::new();
        for _ in 0..route_key_char_length {
            route_key.push(route_key_char_code as u8 as char);
            route_key_char_code += 1;
            if route_key_char_code > 122 {
                route_key_char_length += 1;
                route_key_char_code = 97;
            }
        }
        route_key
    })
}

fn get_safe_key_from_segment(
    segment: &str,
    route_keys: &mut HashMap<String, String>,
    key_prefix: Option<String>,
) -> String {
    let mut get_safe_route_key = build_get_safe_route_key();
    let (key, optional, repeat) = parse_parameter(segment);

    // replace any non-word characters since they can break
    // the named regex
    let mut cleaned_key = key.replace(|c: char| !c.is_alphanumeric(), "");
    if let Some(prefix) = key_prefix {
        cleaned_key = format!("{}{}", prefix, cleaned_key);
    }
    let mut invalid_key = false;

    // check if the key is still invalid and fallback to using a known
    // safe key
    if cleaned_key.is_empty() || cleaned_key.len() > 30 {
        invalid_key = true;
    }
    if cleaned_key.chars().next().unwrap().is_numeric() {
        invalid_key = true;
    }
    if invalid_key {
        cleaned_key = get_safe_route_key();
    }
    if let Some(prefix) = key_prefix {
        route_keys.insert(cleaned_key.clone(), format!("{}{}", prefix, key));
    } else {
        route_keys.insert(cleaned_key.clone(), key);
    }
    if repeat {
        if optional {
            format!(r"(?:/(?P<{}>.+?))?", cleaned_key)
        } else {
            format!(r"/(?P<{}>.+?)", cleaned_key)
        }
    } else {
        format!(r"/(?P<{}>[^/]+?)", cleaned_key)
    }
}

fn get_named_parametrized_route(
    route: &str,
    prefix_route_keys: bool,
) -> (String, HashMap<String, String>) {
    let segments: Vec<&str> = remove_trailing_slash(route)[1..].split('/').collect();
    let mut route_keys: HashMap<String, String> = HashMap::new();
    let parameterized_route = segments
        .iter()
        .map(|segment| {
            let marker_match = INTERCEPTION_ROUTE_MARKERS
                .iter()
                .find(|m| segment.starts_with(m));
            let param_matches = Regex::new(r"\[((?:\[.*\])|.+)\]")
                .unwrap()
                .captures(segment);
            if let Some(marker) = marker_match {
                if let Some(matches) = param_matches {
                    return get_safe_key_from_segment(
                        &matches[1],
                        &mut route_keys,
                        Some(escape_string_regexp(marker)),
                    );
                }
            } else if let Some(matches) = param_matches {
                return get_safe_key_from_segment(&matches[1], &mut route_keys, None);
            }
            format!("/{}", escape_string_regexp(segment))
        })
        .collect::<Vec<String>>()
        .join("");
    (parameterized_route, route_keys)
}

/// This function extends `getRouteRegex` generating also a named regexp where
/// each group is named along with a routeKeys object that indexes the assigned
/// named group with its corresponding key. When the routeKeys need to be
/// prefixed to uniquely identify internally the "prefixRouteKey" arg should
/// be "true" currently this is only the case when creating the routes-manifest
/// during the build
pub fn get_named_route_regex(normalized_route: &str) -> NamedRouteRegex {
    let (parameterized_route, route_keys) = get_named_parametrized_route(normalized_route, false);
    let regex = get_route_regex(normalized_route);
    NamedRouteRegex {
        regex,
        named_regex: Regex::new(&format!("^{}(?:/)?$", parameterized_route)).unwrap(),
        route_keys,
    }
}

/// Generates a named regexp.
/// This is intended to be using for build time only.
pub fn get_named_middleware_regex(normalized_route: &str) -> NamedMiddlewareRegex {
    let (parameterized_route, _route_keys) = get_named_parametrized_route(normalized_route, true);
    NamedMiddlewareRegex {
        named_regex: Regex::new(&format!("^{}(?:/)?$", parameterized_route)).unwrap(),
    }
}
