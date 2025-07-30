use std::{
    hash::{BuildHasher, Hash},
    mem::take,
};

use dashmap::DashMap;
use rayon::prelude::*;

pub fn drop_contents<K: Hash + Eq + Send + Sync, V: Send + Sync, H: BuildHasher + Clone>(
    map: &DashMap<K, V, H>,
) {
    let shards = map.shards();
    shards.par_iter().for_each(|shard| {
        let table = take(&mut *shard.write());
        drop(table);
    });
}
