use std::collections::hash_map::Entry;

use rustc_hash::FxHashMap;

use crate::meta_file::MetaFile;

enum SstState {
    Active,
    UnusedObsolete,
    Obsolete,
}

pub struct SstFilter(FxHashMap<u32, SstState>);

impl SstFilter {
    pub fn new() -> Self {
        Self(FxHashMap::default())
    }

    /// Phase 1: Apply the filter to the meta file and update the state in the filter.
    pub fn apply_filter(&mut self, meta: &mut MetaFile) {
        // Already obsolete entries need to be considered for usage computation
        for seq in meta.obsolete_entries() {
            if let Some(state) = self.0.get_mut(seq)
                && matches!(state, SstState::UnusedObsolete)
            {
                // the obsolete state is used now
                *state = SstState::Obsolete;
            }
        }
        meta.retain_entries(|seq| match self.0.entry(seq) {
            Entry::Occupied(mut e) => {
                let state = e.get_mut();
                if matches!(state, SstState::UnusedObsolete) {
                    // the obsolete state is used now
                    *state = SstState::Obsolete;
                }
                false
            }
            Entry::Vacant(e) => {
                e.insert(SstState::Active);
                true
            }
        });
        for seq in meta.obsolete_sst_files() {
            self.0.entry(*seq).or_insert(SstState::UnusedObsolete);
        }
    }

    /// Phase 2: Check if the meta file can be removed based on the filter state after phase 1.
    /// Updates the filter state for the next meta file. Returns true if the meta file can be
    /// removed.
    pub fn apply_and_get_remove(&mut self, meta: &MetaFile) -> bool {
        let mut used = false;
        for seq in meta.obsolete_sst_files() {
            if let Entry::Occupied(e) = self.0.entry(*seq) {
                if matches!(e.get(), SstState::Obsolete) {
                    // This obsolete sst entry was used, so we need to keep the meta file.
                    used = true;
                }
                // Only the first obsolete sst entry is needed, so we can clear this flag, so
                // that following meta files won't see it as used anymore.
                e.remove();
            }
        }

        !used && !meta.has_active_entries()
    }
}
