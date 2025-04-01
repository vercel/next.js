//! The following code is adapted from sorted-routes.ts using GPT-4 and human
//! review.

use rustc_hash::FxHashMap;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum UrlNodeError {
    #[error("Catch-all must be the last part of the URL.")]
    CatchAllNotLast,
    #[error("Segment names may not start or end with extra brackets ('{0}').")]
    ExtraBrackets(String),
    #[error("Segment names may not start with erroneous periods ('{0}').")]
    ErroneousPeriod(String),
    #[error("You cannot use different slug names for the same dynamic path ('{0}' !== '{1}').")]
    DifferentSlugNames(String, String),
    #[error("You cannot have the same slug name \"{0}\" repeat within a single dynamic path.")]
    RepeatingSlugName(String),
    #[error(
        "You cannot have the slug names \"{0}\" and \"{1}\" differ only by non-word symbols \
         within a single dynamic path."
    )]
    DifferingNonWordSymbols(String, String),
    #[error(
        "You cannot use both a required and optional catch-all route at the same level \
         (\"[...{0}]\" and \"{1}\" )."
    )]
    RequiredAndOptionalCatchAll(String, String),
    #[error(
        "You cannot use both an optional and required catch-all route at the same level \
         (\"[[...{0}]]\" and \"{1}\")."
    )]
    OptionalAndRequiredCatchAll(String, String),
    #[error("Optional route parameters are not yet supported (\"{0}\").")]
    OptionalParametersNotSupported(String),
    #[error(
        "You cannot define a route with the same specificity as an optional catch-all route \
         (\"{0}\" and \"{1}[[...{2}]]\")."
    )]
    SameSpecificityAsOptionalCatchAll(String, String, String),
}

pub struct UrlNode {
    placeholder: bool,
    children: FxHashMap<String, UrlNode>,
    slug_name: Option<String>,
    rest_slug_name: Option<String>,
    optional_rest_slug_name: Option<String>,
}

impl Default for UrlNode {
    fn default() -> Self {
        Self::new()
    }
}

impl UrlNode {
    pub fn new() -> UrlNode {
        UrlNode {
            placeholder: true,
            children: FxHashMap::default(),
            slug_name: None,
            rest_slug_name: None,
            optional_rest_slug_name: None,
        }
    }

    fn insert(&mut self, url_path: &str) -> Result<(), UrlNodeError> {
        self.insert_inner(
            &url_path
                .split('/')
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>(),
            &mut vec![],
            false,
        )
    }

    fn smoosh(&self) -> Result<Vec<String>, UrlNodeError> {
        self.smoosh_with_prefix("/")
    }

    fn smoosh_with_prefix(&self, prefix: &str) -> Result<Vec<String>, UrlNodeError> {
        let mut children_paths: Vec<_> = {
            let mut children_paths: Vec<_> = self.children.iter().collect();
            children_paths.sort_by_key(|(key, _)| *key);
            children_paths
        };

        let slug_child = self.slug_name.as_ref().map(|slug_name| {
            (
                slug_name,
                children_paths.remove(
                    children_paths
                        .iter()
                        .position(|(key, _)| key.as_str() == "[]")
                        .unwrap(),
                ),
            )
        });
        let rest_slug_child = self.rest_slug_name.as_ref().map(|rest_slug_name| {
            (
                rest_slug_name,
                children_paths.remove(
                    children_paths
                        .iter()
                        .position(|(key, _)| key.as_str() == "[...]")
                        .unwrap(),
                ),
            )
        });
        let optional_rest_slug_child =
            self.optional_rest_slug_name
                .as_ref()
                .map(|optional_rest_slug_name| {
                    (
                        optional_rest_slug_name,
                        children_paths.remove(
                            children_paths
                                .iter()
                                .position(|(key, _)| key.as_str() == "[[...]]")
                                .unwrap(),
                        ),
                    )
                });

        let mut routes = children_paths
            .iter()
            .map(|(key, child)| child.smoosh_with_prefix(&format!("{prefix}{key}/")))
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .flatten()
            .collect::<Vec<_>>();

        if let Some((slug_name, (_, slug_child))) = slug_child {
            routes.extend(slug_child.smoosh_with_prefix(&format!("{prefix}[{slug_name}]/"))?);
        }

        if !self.placeholder {
            let r = if prefix == "/" {
                "/".to_string()
            } else {
                prefix[0..prefix.len() - 1].to_string()
            };
            if let Some(ref optional_rest_slug_name) = self.optional_rest_slug_name {
                return Err(UrlNodeError::SameSpecificityAsOptionalCatchAll(
                    r,
                    prefix.to_string(),
                    optional_rest_slug_name.clone(),
                ));
            }

            routes.insert(0, r);
        }

        if let Some((rest_slug_name, (_, rest_slug_child))) = rest_slug_child {
            routes.extend(
                rest_slug_child.smoosh_with_prefix(&format!("{prefix}[...{rest_slug_name}]/",))?,
            );
        }

        if let Some((optional_rest_slug_name, (_, optional_rest_slug_child))) =
            optional_rest_slug_child
        {
            routes.extend(
                optional_rest_slug_child
                    .smoosh_with_prefix(&format!("{prefix}[[...{optional_rest_slug_name}]]/",))?,
            );
        }

        Ok(routes)
    }

    fn insert_inner(
        &mut self,
        url_paths: &[&str],
        slug_names: &mut Vec<String>,
        is_catch_all: bool,
    ) -> Result<(), UrlNodeError> {
        if url_paths.is_empty() {
            self.placeholder = false;
            return Ok(());
        }

        if is_catch_all {
            return Err(UrlNodeError::CatchAllNotLast);
        }

        // The next segment in the urlPaths list
        let mut next_segment = url_paths[0].to_string();

        // Check if the segment matches `[something]`
        // Strip `[` and `]`, leaving only `something`
        let is_catch_all = if let Some(segment_name) = next_segment
            .strip_prefix('[')
            .and_then(|s| s.strip_suffix(']'))
        {
            // Strip optional `[` and `]`, leaving only `something`
            let (is_optional, segment_name) = if let Some(segment_name) = segment_name
                .strip_prefix('[')
                .and_then(|s| s.strip_suffix(']'))
            {
                (true, segment_name)
            } else {
                (false, segment_name)
            };

            // Strip `...`, leaving only `something`
            let (is_catch_all, segment_name) =
                if let Some(segment_name) = segment_name.strip_prefix("...") {
                    (true, segment_name)
                } else {
                    (false, segment_name)
                };

            if segment_name.starts_with('[') || segment_name.ends_with(']') {
                return Err(UrlNodeError::ExtraBrackets(segment_name.to_string()));
            }

            if segment_name.starts_with('.') {
                return Err(UrlNodeError::ErroneousPeriod(segment_name.to_string()));
            }

            fn handle_slug(
                previous_slug: Option<&str>,
                next_slug: &str,
                slug_names: &mut Vec<String>,
            ) -> Result<(), UrlNodeError> {
                if let Some(ref previous_slug) = previous_slug {
                    // If the specific segment already has a slug but the slug is not `something`
                    // This prevents collisions like:
                    // pages/[post]/index.js
                    // pages/[id]/index.js
                    // Because currently multiple dynamic params on the same segment level are not
                    // supported
                    if previous_slug != &next_slug {
                        // TODO: This error seems to be confusing for users, needs an error link,
                        // the description can be based on above comment.
                        return Err(UrlNodeError::DifferentSlugNames(
                            previous_slug.to_string(),
                            next_slug.to_string(),
                        ));
                    }
                }

                for slug_name in slug_names.iter() {
                    if slug_name == next_slug {
                        return Err(UrlNodeError::RepeatingSlugName(next_slug.to_string()));
                    }

                    if slug_name
                        .chars()
                        .filter(|c| *c == '_' || c.is_alphanumeric())
                        .eq(next_slug
                            .chars()
                            .filter(|c| *c == '_' || c.is_alphanumeric()))
                    {
                        return Err(UrlNodeError::DifferingNonWordSymbols(
                            slug_name.clone(),
                            next_slug.to_string(),
                        ));
                    }
                }

                slug_names.push(next_slug.to_string());

                Ok(())
            }

            if is_catch_all {
                if is_optional {
                    if let Some(ref rest_slug_name) = self.rest_slug_name {
                        return Err(UrlNodeError::RequiredAndOptionalCatchAll(
                            rest_slug_name.clone(),
                            url_paths[0].to_string(),
                        ));
                    }

                    handle_slug(
                        self.optional_rest_slug_name.as_deref(),
                        segment_name,
                        slug_names,
                    )?;
                    // slugName is kept as it can only be one particular slugName
                    self.optional_rest_slug_name = Some(segment_name.to_string());
                    // nextSegment is overwritten to [[...]] so that it can later be sorted
                    // specifically
                    next_segment = "[[...]]".to_string();
                } else {
                    if let Some(ref optional_rest_slug_name) = self.optional_rest_slug_name {
                        return Err(UrlNodeError::OptionalAndRequiredCatchAll(
                            optional_rest_slug_name.to_string(),
                            url_paths[0].to_string(),
                        ));
                    }

                    handle_slug(self.rest_slug_name.as_deref(), segment_name, slug_names)?;
                    // slugName is kept as it can only be one particular slugName
                    self.rest_slug_name = Some(segment_name.to_string());
                    // nextSegment is overwritten to [...] so that it can later be sorted
                    // specifically
                    next_segment = "[...]".to_string();
                }
            } else {
                if is_optional {
                    return Err(UrlNodeError::OptionalParametersNotSupported(
                        url_paths[0].to_string(),
                    ));
                }
                handle_slug(self.slug_name.as_deref(), segment_name, slug_names)?;
                // slugName is kept as it can only be one particular slugName
                self.slug_name = Some(segment_name.to_string());
                // nextSegment is overwritten to [] so that it can later be sorted specifically
                next_segment = "[]".to_string();
            }

            is_catch_all
        } else {
            is_catch_all
        };

        // If this UrlNode doesn't have the nextSegment yet we create a new child
        // UrlNode
        if !self.children.contains_key(&next_segment) {
            self.children.insert(next_segment.clone(), UrlNode::new());
        }

        self.children.get_mut(&next_segment).unwrap().insert_inner(
            &url_paths[1..],
            slug_names,
            is_catch_all,
        )
    }
}

pub fn get_sorted_routes(normalized_pages: &[String]) -> Result<Vec<String>, UrlNodeError> {
    // First the UrlNode is created, and every UrlNode can have only 1 dynamic
    // segment Eg you can't have pages/[post]/abc.js and
    // pages/[hello]/something-else.js Only 1 dynamic segment per nesting level

    // So in the case that is test/integration/dynamic-routing it'll be this:
    // pages/[post]/comments.js
    // pages/blog/[post]/comment/[id].js
    // Both are fine because `pages/[post]` and `pages/blog` are on the same level
    // So in this case `UrlNode` created here has `this.slugName === 'post'`
    // And since your PR passed through `slugName` as an array basically it'd
    // including it in too many possibilities Instead what has to be passed
    // through is the upwards path's dynamic names
    let mut root = UrlNode::new();

    // Here the `root` gets injected multiple paths, and insert will break them up
    // into sublevels
    for page_path in normalized_pages {
        root.insert(page_path)?;
    }

    // Smoosh will then sort those sublevels up to the point where you get the
    // correct route definition priority
    root.smoosh()
}

#[cfg(test)]
mod tests {
    use super::get_sorted_routes;

    #[test]
    fn does_not_add_extra_routes() {
        assert_eq!(
            get_sorted_routes(&["/posts".to_string()]).unwrap(),
            vec!["/posts"]
        );

        assert_eq!(
            get_sorted_routes(&["/posts/[id]".to_string()]).unwrap(),
            vec!["/posts/[id]"]
        );

        assert_eq!(
            get_sorted_routes(&["/posts/[id]/foo".to_string()]).unwrap(),
            vec!["/posts/[id]/foo"]
        );

        assert_eq!(
            get_sorted_routes(&["/posts/[id]/[foo]/bar".to_string()]).unwrap(),
            vec!["/posts/[id]/[foo]/bar"]
        );

        assert_eq!(
            get_sorted_routes(&["/posts/[id]/baz/[foo]/bar".to_string()]).unwrap(),
            vec!["/posts/[id]/baz/[foo]/bar"]
        );
    }

    #[test]
    fn correctly_sorts_required_slugs() {
        let sorted_routes = get_sorted_routes(&[
            "/posts".to_string(),
            "/[root-slug]".to_string(),
            "/".to_string(),
            "/posts/[id]".to_string(),
            "/blog/[id]/comments/[cid]".to_string(),
            "/blog/abc/[id]".to_string(),
            "/[...rest]".to_string(),
            "/blog/abc/post".to_string(),
            "/blog/abc".to_string(),
            "/p1/[[...incl]]".to_string(),
            "/p/[...rest]".to_string(),
            "/p2/[...rest]".to_string(),
            "/p2/[id]".to_string(),
            "/p2/[id]/abc".to_string(),
            "/p3/[[...rest]]".to_string(),
            "/p3/[id]".to_string(),
            "/p3/[id]/abc".to_string(),
            "/blog/[id]".to_string(),
            "/foo/[d]/bar/baz/[f]".to_string(),
            "/apples/[ab]/[cd]/ef".to_string(),
        ])
        .unwrap();

        assert_eq!(
            sorted_routes,
            vec![
                "/",
                "/apples/[ab]/[cd]/ef",
                "/blog/abc",
                "/blog/abc/post",
                "/blog/abc/[id]",
                "/blog/[id]",
                "/blog/[id]/comments/[cid]",
                "/foo/[d]/bar/baz/[f]",
                "/p/[...rest]",
                "/p1/[[...incl]]",
                "/p2/[id]",
                "/p2/[id]/abc",
                "/p2/[...rest]",
                "/p3/[id]",
                "/p3/[id]/abc",
                "/p3/[[...rest]]",
                "/posts",
                "/posts/[id]",
                "/[root-slug]",
                "/[...rest]",
            ]
        );
    }

    #[test]
    fn catches_mismatched_param_names() {
        let result = get_sorted_routes(&[
            "/".to_string(),
            "/blog".to_string(),
            "/blog/[id]".to_string(),
            "/blog/[id]/comments/[cid]".to_string(),
            "/blog/[cid]".to_string(),
        ]);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("different slug names"));
    }

    #[test]
    fn catches_reused_param_names() {
        let result = get_sorted_routes(&[
            "/".to_string(),
            "/blog".to_string(),
            "/blog/[id]/comments/[id]".to_string(),
            "/blog/[id]".to_string(),
        ]);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("the same slug name"));
    }

    #[test]
    fn catches_reused_param_names_with_catch_all() {
        let result =
            get_sorted_routes(&["/blog/[id]".to_string(), "/blog/[id]/[...id]".to_string()]);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("the same slug name"));
    }

    #[test]
    fn catches_middle_catch_all_with_another_catch_all() {
        let result = get_sorted_routes(&["/blog/[...id]/[...id2]".to_string()]);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Catch-all must be the last part of the URL."));
    }

    #[test]
    fn catches_middle_catch_all_with_fixed_route() {
        let result = get_sorted_routes(&["/blog/[...id]/abc".to_string()]);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Catch-all must be the last part of the URL."));
    }

    #[test]
    fn catches_extra_dots_in_catch_all() {
        let result = get_sorted_routes(&["/blog/[....id]/abc".to_string()]);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Segment names may not start with erroneous periods"));
    }

    #[test]
    fn catches_missing_dots_in_catch_all() {
        let result = get_sorted_routes(&["/blog/[..id]/abc".to_string()]);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Segment names may not start with erroneous periods"));
    }

    #[test]
    fn catches_extra_brackets_for_optional_1() {
        let result = get_sorted_routes(&["/blog/[[...id]".to_string()]);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("Segment names may not start or end with extra brackets"));
    }

    #[test]
    fn catches_extra_brackets_for_optional_2() {
        let result = get_sorted_routes(&["/blog/[[[...id]]".to_string()]);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().to_string(),
            "Segment names may not start or end with extra brackets ('[...id')."
        );
    }

    #[test]
    fn catches_extra_brackets_for_optional_3() {
        let result = get_sorted_routes(&["/blog/[...id]]".to_string()]);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().to_string(),
            "Segment names may not start or end with extra brackets ('id]')."
        );
    }

    #[test]
    fn catches_extra_brackets_for_optional_4() {
        let result = get_sorted_routes(&["/blog/[[...id]]]".to_string()]);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().to_string(),
            "Segment names may not start or end with extra brackets ('id]')."
        );
    }

    #[test]
    fn catches_extra_brackets_for_optional_5() {
        let result = get_sorted_routes(&["/blog/[[[...id]]]".to_string()]);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().to_string(),
            "Segment names may not start or end with extra brackets ('[...id]')."
        );
    }

    #[test]
    fn disallows_optional_params_1() {
        let result = get_sorted_routes(&["/[[blog]]".to_string()]);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().to_string(),
            "Optional route parameters are not yet supported (\"[[blog]]\")."
        );
    }

    #[test]
    fn disallows_optional_params_2() {
        let result = get_sorted_routes(&["/abc/[[blog]]".to_string()]);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().to_string(),
            "Optional route parameters are not yet supported (\"[[blog]]\")."
        );
    }

    #[test]
    fn disallows_optional_params_3() {
        let result = get_sorted_routes(&["/abc/[[blog]]/def".to_string()]);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().to_string(),
            "Optional route parameters are not yet supported (\"[[blog]]\")."
        );
    }

    #[test]
    fn disallows_mixing_required_catch_all_and_optional_catch_all_1() {
        let result = get_sorted_routes(&["/[...one]".to_string(), "/[[...one]]".to_string()]);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().to_string(),
            "You cannot use both a required and optional catch-all route at the same level \
             (\"[...one]\" and \"[[...one]]\" )."
        );
    }

    #[test]
    fn disallows_mixing_required_catch_all_and_optional_catch_all_2() {
        let result = get_sorted_routes(&["/[[...one]]".to_string(), "/[...one]".to_string()]);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().to_string(),
            "You cannot use both an optional and required catch-all route at the same level \
             (\"[[...one]]\" and \"[...one]\")."
        );
    }

    #[test]
    fn disallows_apex_and_optional_catch_all() {
        let result = get_sorted_routes(&["/".to_string(), "/[[...all]]".to_string()]);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().to_string(),
            "You cannot define a route with the same specificity as an optional catch-all route \
             (\"/\" and \"/[[...all]]\")."
        );
    }

    #[test]
    fn disallows_apex_and_optional_catch_all_2() {
        let result = get_sorted_routes(&["/[[...all]]".to_string(), "/".to_string()]);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().to_string(),
            "You cannot define a route with the same specificity as an optional catch-all route \
             (\"/\" and \"/[[...all]]\")."
        );
    }

    #[test]
    fn disallows_apex_and_optional_catch_all_3() {
        let result = get_sorted_routes(&["/sub".to_string(), "/sub/[[...all]]".to_string()]);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().to_string(),
            "You cannot define a route with the same specificity as an optional catch-all route \
             (\"/sub\" and \"/sub/[[...all]]\")."
        );
    }

    #[test]
    fn disallows_apex_and_optional_catch_all_4() {
        let result = get_sorted_routes(&["/sub/[[...all]]".to_string(), "/sub".to_string()]);
        assert!(result.is_err());
        assert_eq!(
            result.unwrap_err().to_string(),
            "You cannot define a route with the same specificity as an optional catch-all route \
             (\"/sub\" and \"/sub/[[...all]]\")."
        );
    }

    #[test]
    fn catches_param_names_differing_only_by_non_word_characters() {
        let result = get_sorted_routes(&[
            "/blog/[helloworld]".to_string(),
            "/blog/[helloworld]/[hello-world]".to_string(),
        ]);
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .to_string()
            .contains("differ only by non-word"));
    }
}
