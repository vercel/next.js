//! The following code was mostly generated using GTP-4 from
//! next.js/packages/next/src/shared/lib/router/utils/route-regex.ts

use once_cell::sync::Lazy;
use regex::Regex;
use regress;
use rustc_hash::FxHashMap;

const INTERCEPTION_ROUTE_MARKERS: [&str; 4] = ["(..)(..)", "(.)", "(..)", "(...)"];
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
    pub groups: FxHashMap<String, Group>,
    pub regex: String,
}

#[derive(Debug)]
pub struct NamedRouteRegex {
    pub regex: RouteRegex,
    pub named_regex: String,
    pub route_keys: FxHashMap<String, String>,
}

#[derive(Debug)]
pub struct NamedMiddlewareRegex {
    pub named_regex: String,
}

struct ParsedParameter {
    key: String,
    repeat: bool,
    optional: bool,
}

/// Parses a given parameter from a route to a data structure that can be used
/// to generate the parametrized route. Examples:
///   - `[...slug]` -> `{ key: 'slug', repeat: true, optional: true }`
///   - `...slug` -> `{ key: 'slug', repeat: true, optional: false }`
///   - `[foo]` -> `{ key: 'foo', repeat: false, optional: true }`
///   - `bar` -> `{ key: 'bar', repeat: false, optional: false }`
fn parse_parameter(param: &str) -> ParsedParameter {
    let mut key = param.to_string();
    let optional = key.starts_with('[') && key.ends_with(']');
    if optional {
        key = key[1..key.len() - 1].to_string();
    }
    let repeat = key.starts_with("...");
    if repeat {
        key = key[3..].to_string();
    }
    ParsedParameter {
        key,
        repeat,
        optional,
    }
}

fn escape_string_regexp(segment: &str) -> String {
    regress::escape(segment)
}

/// Removes the trailing slash for a given route or page path. Preserves the
/// root page. Examples:
///  - `/foo/bar/` -> `/foo/bar`
///  - `/foo/bar` -> `/foo/bar`
///  - `/` -> `/`
fn remove_trailing_slash(route: &str) -> &str {
    if route == "/" {
        route
    } else {
        route.trim_end_matches('/')
    }
}

static PARAM_MATCH_REGEX: Lazy<Regex> = Lazy::new(|| Regex::new(r"\[((?:\[.*\])|.+)\]").unwrap());

fn get_parametrized_route(route: &str) -> (String, FxHashMap<String, Group>) {
    let segments: Vec<&str> = remove_trailing_slash(route)[1..].split('/').collect();
    let mut groups: FxHashMap<String, Group> = FxHashMap::default();
    let mut group_index = 1;
    let parameterized_route = segments
        .iter()
        .map(|segment| {
            let marker_match = INTERCEPTION_ROUTE_MARKERS
                .iter()
                .find(|&&m| segment.starts_with(m))
                .copied();
            let param_matches = PARAM_MATCH_REGEX.captures(segment);
            if let Some(matches) = param_matches {
                let ParsedParameter {
                    key,
                    optional,
                    repeat,
                } = parse_parameter(&matches[1]);
                groups.insert(
                    key,
                    Group {
                        pos: group_index,
                        repeat,
                        optional,
                    },
                );
                group_index += 1;
                if let Some(marker) = marker_match {
                    return format!("/{}([^/]+?)", escape_string_regexp(marker));
                } else {
                    return match (repeat, optional) {
                        (true, true) => "(?:/(.+?))?",
                        (true, false) => "/(.+?)",
                        (false, true) => "(?:/([^/]+?))?",
                        (false, false) => "/([^/]+?)",
                    }
                    .to_string();
                }
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
        regex: format!("^{parameterized_route}(?:/)?$"),
        groups,
    }
}

/// Builds a function to generate a minimal routeKey using only a-z and minimal
/// number of characters.
fn build_get_safe_route_key() -> impl FnMut() -> String {
    let mut i = 0;

    move || {
        let mut route_key = String::new();
        i += 1;
        let mut j = i;

        while j > 0 {
            route_key.push((97 + ((j - 1) % 26)) as u8 as char);
            j = (j - 1) / 26;
        }

        i += 1;
        route_key
    }
}

fn get_safe_key_from_segment(
    get_safe_route_key: &mut impl FnMut() -> String,
    segment: &str,
    route_keys: &mut FxHashMap<String, String>,
    key_prefix: Option<&'static str>,
    intercept_prefix: Option<&str>,
) -> String {
    let ParsedParameter {
        key,
        optional,
        repeat,
    } = parse_parameter(segment);

    // replace any non-word characters since they can break
    // the named regex
    let mut cleaned_key = key.replace(|c: char| !c.is_alphanumeric(), "");
    if let Some(prefix) = key_prefix {
        cleaned_key = format!("{prefix}{cleaned_key}");
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
        route_keys.insert(cleaned_key.clone(), format!("{prefix}{key}"));
    } else {
        route_keys.insert(cleaned_key.clone(), key);
    }

    let intercept_prefix = intercept_prefix.map_or_else(String::new, escape_string_regexp);
    match (repeat, optional) {
        (true, true) => format!(r"(?:/{intercept_prefix}(?P<{cleaned_key}>.+?))?"),
        (true, false) => format!(r"/{intercept_prefix}(?P<{cleaned_key}>.+?)"),
        (false, true) => format!(r"(?:/{intercept_prefix}(?P<{cleaned_key}>[^/]+?))?"),
        (false, false) => format!(r"/{intercept_prefix}(?P<{cleaned_key}>[^/]+?)"),
    }
}

fn get_named_parametrized_route(
    route: &str,
    prefix_route_keys: bool,
) -> (String, FxHashMap<String, String>) {
    let segments: Vec<&str> = remove_trailing_slash(route)[1..].split('/').collect();
    let get_safe_route_key = &mut build_get_safe_route_key();
    let mut route_keys: FxHashMap<String, String> = FxHashMap::default();
    let parameterized_route = segments
        .iter()
        .map(|segment| {
            let interception_marker = INTERCEPTION_ROUTE_MARKERS
                .iter()
                .find(|&m| segment.starts_with(m))
                .copied();
            let key_prefix = if prefix_route_keys {
                if interception_marker.is_some() {
                    Some(NEXT_INTERCEPTION_MARKER_PREFIX)
                } else {
                    Some(NEXT_QUERY_PARAM_PREFIX)
                }
            } else {
                None
            };
            static RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\[((?:\[.*\])|.+)\]").unwrap());
            let param_matches = RE.captures(segment);
            if let Some(matches) = param_matches {
                return get_safe_key_from_segment(
                    get_safe_route_key,
                    &matches[1],
                    &mut route_keys,
                    key_prefix,
                    interception_marker,
                );
            }
            format!("/{}", escape_string_regexp(segment))
        })
        .collect::<Vec<String>>()
        .join("");
    (parameterized_route, route_keys)
}

/// This function extends `getRouteRegex` generating also a named regexp where
/// each group is named along with a routeKeys object that indexes the assigned
/// named group with its corresponding key.
///
/// When the routeKeys need to be prefixed to uniquely identify internally the
/// "prefixRouteKey" arg should be "true" currently this is only the case when
/// creating the routes-manifest during the build
pub fn get_named_route_regex(normalized_route: &str) -> NamedRouteRegex {
    let (parameterized_route, route_keys) = get_named_parametrized_route(normalized_route, false);
    let regex = get_route_regex(normalized_route);
    NamedRouteRegex {
        regex,
        named_regex: format!("^{parameterized_route}(?:/)?$"),
        route_keys,
    }
}

/// Generates a named regexp.
/// This is intended to be using for build time only.
pub fn get_named_middleware_regex(normalized_route: &str) -> String {
    let (parameterized_route, _route_keys) = get_named_parametrized_route(normalized_route, true);
    format!("^{parameterized_route}(?:/)?$")
}

#[cfg(test)]
mod test {
    use super::get_named_middleware_regex;

    #[test]
    fn should_properly_handle_intercept_routes() {
        let tests = [
            (
                "/[locale]/example/(...)[locale]/intercepted",
                "^/(?P<nxtPlocale>[^/]+?)/example/\\(\\.\\.\\.\\)(?P<nxtIlocale>[^/]+?)/\
                 intercepted(?:/)?$",
            ),
            (
                "/[locale]/example/(..)[locale]/intercepted",
                "^/(?P<nxtPlocale>[^/]+?)/example/\\(\\.\\.\\)(?P<nxtIlocale>[^/]+?)/intercepted(?\
                 :/)?$",
            ),
            (
                "/[locale]/example/(.)[locale]/intercepted",
                "^/(?P<nxtPlocale>[^/]+?)/example/\\(\\.\\)(?P<nxtIlocale>[^/]+?)/intercepted(?:/\
                 )?$",
            ),
            (
                "/[locale]/example/(..)(..)[locale]/intercepted",
                "^/(?P<nxtPlocale>[^/]+?)/example/\\(\\.\\.\\)\\(\\.\\.\\)(?P<nxtIlocale>[^/]+?)/\
                 intercepted(?:/)?$",
            ),
        ];

        for test in tests {
            let intercept_route = get_named_middleware_regex(test.0);
            assert_eq!(intercept_route, test.1);
        }
    }
}
