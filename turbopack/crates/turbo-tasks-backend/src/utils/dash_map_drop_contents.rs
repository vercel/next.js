use std::{
    hash::{BuildHasher, Hash},
    mem::take,
};

use dashmap::DashMap;
use turbo_tasks::parallel;

pub fn drop_contents<K: Hash + Eq + Send + Sync, V: Send + Sync, H: BuildHasher + Clone>(
    map: &DashMap<K, V, H>,
) {
    let shards = map.shards();
    parallel::for_each(shards, |shard| {
        let table = take(&mut *shard.write());
        drop(table);
    });
}
