use turbo_rcstr::RcStr;

const REQUEST_PLACEHOLDER: &str = "[request]";
/// Chunk names end up in output file names, so keep them reasonably short. The usual ident hash
/// is still appended, so truncation cannot cause collisions.
const MAX_CHUNK_NAME_LEN: usize = 64;

/// Resolves a user-specified chunk name (from a `turbopackChunkName`/`webpackChunkName` magic
/// comment) into a string that is safe to use in an output file name.
///
/// The `[request]` placeholder is replaced with the sanitized import request. When the request
/// is not statically known, a name containing `[request]` is dropped entirely.
pub fn resolve_chunk_name(name: &str, request: Option<&str>) -> Option<RcStr> {
    let name = if name.contains(REQUEST_PLACEHOLDER) {
        name.replace(REQUEST_PLACEHOLDER, &sanitize_request(request?))
    } else {
        name.to_string()
    };

    // Restrict to characters that are safe in file names and URLs on all platforms. This
    // intentionally does not allow `/` (which webpack uses to create nested directories) to keep
    // chunk paths flat and predictable.
    let mut sanitized: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .collect();
    sanitized.truncate(MAX_CHUNK_NAME_LEN);

    if sanitized.is_empty() {
        None
    } else {
        Some(sanitized.into())
    }
}

/// Sanitizes an import request for use in the `[request]` placeholder, similar to webpack:
/// strips a leading `./` and collapses runs of unsafe characters into a single `-`.
fn sanitize_request(request: &str) -> String {
    let request = request.trim_start_matches("./");
    let mut out = String::with_capacity(request.len());
    let mut last_was_replacement = false;
    for c in request.chars() {
        if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
            out.push(c);
            last_was_replacement = false;
        } else if !last_was_replacement {
            out.push('-');
            last_was_replacement = true;
        }
    }
    out.trim_matches('-').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_name_is_kept() {
        assert_eq!(resolve_chunk_name("my-chunk", None).unwrap(), "my-chunk");
        assert_eq!(
            resolve_chunk_name("my_chunk123", Some("./foo")).unwrap(),
            "my_chunk123"
        );
    }

    #[test]
    fn unsafe_characters_are_replaced() {
        assert_eq!(
            resolve_chunk_name("my/chunk name", None).unwrap(),
            "my_chunk_name"
        );
        assert_eq!(
            resolve_chunk_name("../../evil", None).unwrap(),
            "______evil"
        );
    }

    #[test]
    fn request_placeholder_is_substituted() {
        assert_eq!(
            resolve_chunk_name("[request]", Some("./components/Abc.tsx")).unwrap(),
            "components-Abc-tsx"
        );
        assert_eq!(
            resolve_chunk_name("lazy-[request]", Some("lodash/debounce")).unwrap(),
            "lazy-lodash-debounce"
        );
    }

    #[test]
    fn request_placeholder_without_static_request_drops_name() {
        assert_eq!(resolve_chunk_name("lazy-[request]", None), None);
    }

    #[test]
    fn empty_name_is_dropped() {
        assert_eq!(resolve_chunk_name("", None), None);
    }

    #[test]
    fn long_names_are_truncated() {
        let long = "a".repeat(100);
        assert_eq!(resolve_chunk_name(&long, None).unwrap().len(), 64);
    }
}
