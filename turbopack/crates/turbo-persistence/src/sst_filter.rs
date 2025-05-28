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
        meta.retain_entries(|seq| match self.0.entry(seq) {
            Entry::Occupied(mut e) => {
                let state = e.get_mut();
                match state {
                    SstState::Active => false,
                    SstState::UnusedObsolete => {
                        *state = SstState::Obsolete;
                        false
                    }
                    SstState::Obsolete => false,
                }
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
            match self.0.entry(*seq) {
                Entry::Occupied(e) => match e.get() {
                    SstState::Active => {}
                    SstState::UnusedObsolete => {
                        e.remove();
                    }
                    SstState::Obsolete => {
                        e.remove();
                        used = true;
                    }
                },
                Entry::Vacant(e) => {
                    e.insert(SstState::UnusedObsolete);
                }
            }
        }

        !used && !meta.has_active_entries()
    }
}
