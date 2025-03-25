use std::path::PathBuf;

use rand::{rngs::StdRng, seq::SliceRandom, SeedableRng};
use rustc_hash::FxHashMap;

/// Picks modules at random, but with a fixed seed so runs are somewhat
/// reproducible.
///
/// This must be initialized outside of `bench_with_input` so we don't repeat
/// the same sequence in different samples.
pub struct ModulePicker {
    depths: Vec<usize>,
    modules_by_depth: FxHashMap<usize, Vec<PathBuf>>,
    rng: parking_lot::Mutex<StdRng>,
}

impl ModulePicker {
    /// Creates a new module picker.
    pub fn new(mut modules: Vec<(PathBuf, usize)>) -> Self {
        let rng = StdRng::seed_from_u64(42);

        // Ensure the module order is deterministic.
        modules.sort();

        let mut modules_by_depth: FxHashMap<_, Vec<_>> = FxHashMap::default();
        for (module, depth) in modules {
            modules_by_depth.entry(depth).or_default().push(module);
        }
        let mut depths: Vec<_> = modules_by_depth.keys().copied().collect();
        // Ensure the depth order is deterministic.
        depths.sort();

        Self {
            depths,
            modules_by_depth,
            rng: parking_lot::Mutex::new(rng),
        }
    }

    /// Picks a random module with a uniform distribution over all depths.
    pub fn pick(&self) -> &PathBuf {
        let mut rng = self.rng.lock();
        // Sample from all depths uniformly.
        let depth = self.depths.choose(&mut *rng).unwrap();
        self.modules_by_depth[depth].choose(&mut *rng).unwrap()
    }
}
