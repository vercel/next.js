use std::env;

use turbo_tasks_rocksdb::private::{CFStats, Database};

fn main() {
    let mut args = env::args_os();
    args.next();
    let path = args
        .next()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "cache".to_string());
    println!("{} {}", env::current_dir().unwrap().display(), path);

    let mut stats = CFStats::default();
    stats.name = "ALL".to_string();
    let db = Database::open(&path).unwrap();
    for cf in db.get_stats().unwrap() {
        println!("{}", cf);
        stats.entries += cf.entries;
        stats.total_key_size += cf.total_key_size;
        stats.total_value_size += cf.total_value_size;
        if stats.max_key_size < cf.max_key_size {
            stats.max_key_pair = cf.max_key_pair;
            stats.max_key_size = cf.max_key_size;
        }
        if stats.max_value_size < cf.max_value_size {
            stats.max_value_pair = cf.max_value_pair;
            stats.max_value_size = cf.max_value_size;
        }
    }
    println!("{}", stats);
}
