use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, FxIndexSet};
use turbo_tasks_hash::hash_xxh3_hash64;
use turbopack_core::chunk::ModuleId;

const JS_MAX_SAFE_INTEGER: u64 = (1u64 << 53) - 1;

pub async fn merge_preprocessed_module_ids(
    merged_module_ids: &FxIndexMap<RcStr, u64>,
) -> Result<FxIndexMap<RcStr, ModuleId>> {
    // 5% fill rate, as done in Webpack
    // https://github.com/webpack/webpack/blob/27cf3e59f5f289dfc4d76b7a1df2edbc4e651589/lib/ids/IdHelpers.js#L366-L405
    let optimal_range = merged_module_ids.len() * 20;
    let digit_mask = std::cmp::min(
        10u64.pow((optimal_range as f64).log10().ceil() as u32),
        JS_MAX_SAFE_INTEGER,
    );

    let mut module_id_map = FxIndexMap::default();
    let mut used_ids = FxIndexSet::default();

    for (module_ident, full_hash) in merged_module_ids.iter() {
        let mut trimmed_hash = full_hash % digit_mask;
        let mut i = 1;
        while used_ids.contains(&trimmed_hash) {
            // If the id is already used, seek to find another available id.
            trimmed_hash = hash_xxh3_hash64(full_hash + i) % digit_mask;
            i += 1;
        }
        used_ids.insert(trimmed_hash);
        module_id_map.insert(module_ident.clone(), ModuleId::Number(trimmed_hash));
    }

    Ok(module_id_map)
}
