use anyhow::{Context, Result, bail};
use rustc_hash::{FxHashMap, FxHashSet};
use smallvec::SmallVec;
use tracing::Instrument;
use turbo_rcstr::RcStr;
use turbo_tasks::{JoinIterExt, ResolvedVc, ValueToString, Vc};
use turbo_tasks_hash::hash_xxh3_hash64;
use turbopack_core::{
    chunk::{
        ChunkableModule, ChunkingType, ModuleId,
        chunk_id_strategy::{ModuleIdFallback, ModuleIdStrategy},
    },
    ident::AssetIdent,
    module::Module,
    module_graph::{ModuleGraph, RefData},
};
use turbopack_ecmascript::async_chunk::module::AsyncLoaderModule;

/// Literal replacements to apply to module identity strings before computing deterministic IDs.
#[turbo_tasks::value(transparent)]
pub struct ModuleIdStringReplacements(Vec<(RcStr, RcStr)>);

#[turbo_tasks::value_impl]
impl ModuleIdStringReplacements {
    #[turbo_tasks::function]
    pub fn new(replacements: Vec<(RcStr, RcStr)>) -> Vc<Self> {
        Self(replacements).cell()
    }

    #[turbo_tasks::function]
    pub fn empty() -> Vc<Self> {
        Self(Vec::new()).cell()
    }
}

fn apply_module_id_string_replacements(ident: &str, replacements: &[(RcStr, RcStr)]) -> RcStr {
    let mut result = ident.to_owned();
    for (from, to) in replacements {
        result = result.replace(from.as_str(), to.as_str());
    }
    result.into()
}

#[turbo_tasks::function]
pub async fn get_global_module_id_strategy(
    module_graph: ResolvedVc<ModuleGraph>,
    string_replacements: Vc<ModuleIdStringReplacements>,
) -> Result<Vc<ModuleIdStrategy>> {
    let span = tracing::info_span!("compute module id map");
    async move {
        let module_graph = module_graph.await?;
        let string_replacements = string_replacements.await?;

        // All modules in the graph and additionally, all the modules that are inserted by chunking
        // (i.e. async loaders)
        let mut modules = FxHashSet::default();
        let mut async_idents = vec![];
        module_graph.traverse_edges_unordered(|parent, current| {
            modules.insert(current);
            if let Some((
                _,
                &RefData {
                    chunking_type: ChunkingType::Async,
                    ..
                },
            )) = parent
            {
                let module = ResolvedVc::try_sidecast::<Box<dyn ChunkableModule>>(current)
                    .context("expected chunkable module for async reference")?;
                async_idents.push(AsyncLoaderModule::asset_ident_for(*module));
            }
            Ok(())
        })?;

        let mut module_id_map = modules
            .into_iter()
            .map(|m| m.ident())
            .chain(async_idents.into_iter())
            .map(async |ident| {
                let ident = ident.to_resolved().await?;
                let ident_str = ident.to_string().await?;
                let ident_str =
                    apply_module_id_string_replacements(&ident_str, &string_replacements);
                let hash = hash_xxh3_hash64(&ident_str);
                Ok((ident, (ident_str, hash)))
            })
            .join()
            .await
            .into_iter()
            .collect::<Result<FxHashMap<_, _>>>()?;

        finalize_module_ids(&mut module_id_map);

        Ok(ModuleIdStrategy {
            module_id_map: Some(ResolvedVc::cell(
                module_id_map
                    .into_iter()
                    .map(|(ident, (_, hash))| {
                        const JS_MAX_SAFE_INTEGER: u64 = (1u64 << 53) - 1;
                        if hash > JS_MAX_SAFE_INTEGER {
                            bail!("Numeric module id is too large: {}", hash);
                        }
                        Ok((ident, ModuleId::Number(hash)))
                    })
                    .collect::<Result<FxHashMap<_, _>>>()?,
            )),
            fallback: ModuleIdFallback::Error,
        }
        .cell())
    }
    .instrument(span)
    .await
}

const JS_MAX_SAFE_INTEGER: u64 = (1u64 << 53) - 1;

/// Shorten hashes and handle any collisions.
fn finalize_module_ids(merged_module_ids: &mut FxHashMap<ResolvedVc<AssetIdent>, (RcStr, u64)>) {
    // 5% fill rate, as done in Webpack
    // https://github.com/webpack/webpack/blob/27cf3e59f5f289dfc4d76b7a1df2edbc4e651589/lib/ids/IdHelpers.js#L366-L405
    let optimal_range = merged_module_ids.len() * 20;
    let digit_mask = std::cmp::min(
        10u64.pow((optimal_range as f64).log10().ceil() as u32),
        JS_MAX_SAFE_INTEGER,
    );

    let mut used_ids = FxHashMap::<u64, SmallVec<[(ResolvedVc<AssetIdent>, RcStr); 1]>>::default();

    // Run in multiple passes, to not depend on the order of the `merged_module_ids` (i.e. the order
    // of imports). Hashes could still change if modules are added or removed.

    // Find pass: shorten hashes, potentially causing (more) collisions
    for (ident, (ident_str, full_hash)) in merged_module_ids.iter_mut() {
        let first_pass_hash = *full_hash % digit_mask;
        used_ids
            .entry(first_pass_hash)
            .or_default()
            .push((*ident, ident_str.clone()));
        *full_hash = first_pass_hash;
    }

    // Filter conflicts
    let mut conflicting_hashes = used_ids
        .iter()
        .filter(|(_, list)| list.len() > 1)
        .map(|(hash, _)| *hash)
        .collect::<Vec<_>>();
    conflicting_hashes.sort();

    // Second pass over the conflicts to resolve them
    for hash in conflicting_hashes.into_iter() {
        let list = used_ids.get_mut(&hash).unwrap();
        // Take the vector but keep the (empty) entry, so that the "contains_key" check below works
        let mut list = std::mem::take(list);
        list.sort_by(|a, b| a.1.cmp(&b.1));

        // Skip the first one, one module can keep the original hash
        for (ident, _) in list.into_iter().skip(1) {
            let hash = &mut merged_module_ids.get_mut(&ident).unwrap().1;

            // the original algorithm since all that runs in deterministic order now
            let mut i = 1;
            let mut trimmed_hash;
            loop {
                // If the id is already used, find the next available hash.
                trimmed_hash = hash_xxh3_hash64((*hash, i)) % digit_mask;
                if !used_ids.contains_key(&trimmed_hash) {
                    break;
                }
                i += 1;
            }
            // At this point, we don't care about the values anymore, just the keys
            used_ids.entry(trimmed_hash).or_default();
            *hash = trimmed_hash;
        }
    }
}

#[cfg(test)]
mod tests {
    use turbo_rcstr::{RcStr, rcstr};

    use super::apply_module_id_string_replacements;

    const VERSION: &str = "1.2.3";

    fn replacements() -> Vec<(RcStr, RcStr)> {
        vec![(
            rcstr!("/package@1.2.3/"),
            rcstr!("/package@__PACKAGE_VERSION__/"),
        )]
    }

    #[test]
    fn applies_literal_module_id_string_replacements() {
        assert_eq!(
            apply_module_id_string_replacements(
                &format!(
                    "[project]/node_modules/.store/package@{VERSION}/node_modules/package/\
                     {VERSION}/index.js"
                ),
                &replacements(),
            ),
            rcstr!(
                "[project]/node_modules/.store/package@__PACKAGE_VERSION__/node_modules/package/1.\
                 2.3/index.js"
            )
        );
    }

    #[test]
    fn applies_multiple_literal_module_id_string_replacements() {
        assert_eq!(
            apply_module_id_string_replacements(
                "/package@1.2.3/a//package@1.2.3/b",
                &replacements(),
            ),
            rcstr!("/package@__PACKAGE_VERSION__/a//package@__PACKAGE_VERSION__/b")
        );
    }

    #[test]
    fn ignores_non_matching_module_id_strings() {
        let replacements = replacements();
        for ident in ["/package@1.2.4/index.js", "/somewhere/1.2.3.js"] {
            assert_eq!(
                apply_module_id_string_replacements(ident, &replacements),
                ident
            );
        }
    }

    #[test]
    fn replaces_nested_literal_occurrences() {
        assert_eq!(
            apply_module_id_string_replacements("/@scope/package@1.2.3/index.js", &replacements(),),
            rcstr!("/@scope/package@__PACKAGE_VERSION__/index.js")
        );
    }

    #[test]
    fn empty_module_id_string_replacements_are_a_noop() {
        let ident = "/package@1.2.3/index.js";
        assert_eq!(apply_module_id_string_replacements(ident, &[]), ident);
    }
}
