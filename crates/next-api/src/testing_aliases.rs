//! Admission at the actual Next resolver boundary for translated test aliases.
//! Ordinary application contexts never install this plugin.

use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    reference_type::ReferenceType,
    resolve::{
        ResolveResultOption,
        parse::Request,
        pattern::Pattern,
        plugin::{BeforeResolvePlugin, BeforeResolvePluginCondition},
    },
};
use turbopack_resolve::resolve_options_context::ResolveOptionsContext;

use crate::testing::test_input_error;

fn queried_exact_alias(pattern: &Pattern, query: &str, fragment: &str, finds: &[RcStr]) -> bool {
    (!query.is_empty() || !fragment.is_empty()) && finds.iter().any(|find| pattern.is_match(find))
}

#[turbo_tasks::value(shared)]
struct TestAliasBoundary {
    finds: Vec<RcStr>,
}

#[turbo_tasks::value_impl]
impl BeforeResolvePlugin for TestAliasBoundary {
    fn before_resolve_condition(&self) -> Vc<BeforeResolvePluginCondition> {
        BeforeResolvePluginCondition::Always.cell()
    }

    #[turbo_tasks::function]
    async fn before_resolve(
        self: Vc<Self>,
        lookup_path: FileSystemPath,
        _reference_type: ReferenceType,
        request: Vc<Request>,
    ) -> Result<Vc<ResolveResultOption>> {
        let this = self.await?;
        let mut requests = vec![request.to_resolved().await?];
        while let Some(request) = requests.pop() {
            let value = request.await?;
            let (query, fragment) = match &*value {
                Request::Alternatives { requests: nested } => {
                    requests.extend(nested.iter().copied());
                    continue;
                }
                Request::Module {
                    query, fragment, ..
                }
                | Request::Relative {
                    query, fragment, ..
                }
                | Request::Raw {
                    query, fragment, ..
                }
                | Request::ServerRelative {
                    query, fragment, ..
                }
                | Request::Windows {
                    query, fragment, ..
                }
                | Request::Uri {
                    query, fragment, ..
                } => (query, fragment),
                _ => continue,
            };
            let pattern = request.request_pattern().await?;
            if queried_exact_alias(&pattern, query, fragment, &this.finds) {
                return Err(test_input_error(
                    lookup_path,
                    "Unsupported setting config.resolve.alias: exact alias requests with queries \
                     or fragments require raw-request mapping semantics; the Next resolver must \
                     not silently apply a path-only alias",
                ));
            }
        }
        Ok(Vc::cell(None))
    }
}

/// Preserve the guard in foreign-code contexts as well as the primary test graph.
#[turbo_tasks::function]
pub(crate) async fn alias_resolve_options_context(
    context: Vc<ResolveOptionsContext>,
    finds: Vec<RcStr>,
) -> Result<Vc<ResolveOptionsContext>> {
    if finds.is_empty() {
        return Ok(context);
    }
    let mut extended = context.owned().await?;
    extended.before_resolve_plugins.insert(
        0,
        ResolvedVc::upcast(
            TestAliasBoundary {
                finds: finds.clone(),
            }
            .resolved_cell(),
        ),
    );
    for (_, nested) in &mut extended.rules {
        *nested = alias_resolve_options_context(**nested, finds.clone())
            .to_resolved()
            .await?;
    }
    Ok(extended.cell())
}

#[cfg(test)]
mod tests {
    use turbo_rcstr::{RcStr, rcstr};
    use turbopack_core::resolve::pattern::Pattern;

    use crate::testing_aliases::queried_exact_alias;

    #[test]
    fn raw_request_qualifiers_do_not_become_exact_alias_matches() {
        let finds: Vec<RcStr> = vec![rcstr!("@source"), rcstr!("@root/specific")];
        let exact = Pattern::Constant(rcstr!("@source"));
        assert!(!queried_exact_alias(&exact, "", "", &finds));
        assert!(queried_exact_alias(&exact, "?raw", "", &finds));
        assert!(queried_exact_alias(&exact, "", "#fragment", &finds));
        assert!(!queried_exact_alias(
            &Pattern::Constant(rcstr!("@source/helper.mjs")),
            "?raw",
            "",
            &finds
        ));
        assert!(!queried_exact_alias(
            &Pattern::Constant(rcstr!("@source-extra")),
            "?raw",
            "",
            &finds
        ));
        // This exact mapping would win natively over an earlier broader mapping.
        assert!(queried_exact_alias(
            &Pattern::Constant(rcstr!("@root/specific")),
            "?raw",
            "",
            &finds
        ));
    }

    #[test]
    fn computed_alternative_patterns_cannot_hide_a_possible_exact_match() {
        let finds = vec![rcstr!("@source")];
        let computed = Pattern::concat([Pattern::Constant(rcstr!("@")), Pattern::DynamicNoSlash]);
        assert!(queried_exact_alias(&computed, "?raw", "", &finds));
        let alternatives = Pattern::Alternatives(vec![
            Pattern::Constant(rcstr!("unrelated")),
            Pattern::Constant(rcstr!("@source")),
        ]);
        assert!(queried_exact_alias(&alternatives, "", "#fragment", &finds));
        assert!(!queried_exact_alias(&computed, "", "", &finds));
    }
}
