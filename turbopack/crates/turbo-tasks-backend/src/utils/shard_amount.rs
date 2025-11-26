use std::thread::available_parallelism;

/// Compute a good number of shards to use for sharded data structures.
/// The number of shards is computed based on the number of worker threads
/// and whether a small preallocation is requested.
/// A small preallocation is useful for tests where performance is not
/// critical and we want to reduce memory usage and startup time.
/// The number of shards is chosen to minimize the probability of shard
/// collisions (which can lead to false sharing) while keeping memory
/// usage reasonable.
/// The returned number is always a power of two as this is often required
/// by sharded data structures. The maximum shard amount is capped at 1 << 16 (65536).
pub fn compute_shard_amount(num_workers: Option<usize>, small_preallocation: bool) -> usize {
    let num_workers = num_workers.unwrap_or_else(|| available_parallelism().map_or(4, |v| v.get()));

    // Once can compute the probability of a shard collision (which leads to false sharing) using
    // the birthday paradox formula.  It's notable that the probability of collisions increases
    // with more worker threads. To mitigate this effect, the number of shards need to grow
    // quadratically with the number of worker threads. This way the probability of at least one
    // collision remains constant.
    //
    // Lets call the worker thread count `N` and the number of shards `S`. When using `S = k * N^2`
    // for some constant `k` the probability of at least one collision for large `N` can be
    // approximated as: P = 1 - exp(-N^2 / (2*S)) = 1 - exp(-1/(2*k))
    //
    // For `k = 16` this results in a collision probability of about 3%.
    // For `k = 1` this results in a collision probability of about 39%.
    //
    // We clamp the number of shards to 1 << 16 to avoid excessive memory usage in case of a very
    // high number of worker threads. This case is hit with more than 64 worker threads for `k =
    // 16` and more than 256 worker threads for `k = 1`.

    if small_preallocation {
        // We also clamp the minimum number of workers to 256 so all following multiplications can't
        // overflow.
        let num_workers = num_workers.max(256);
        (num_workers * num_workers).next_power_of_two()
    } else {
        // We also clamp the minimum number of workers to 64 so all following multiplications can't
        // overflow.
        let num_workers = num_workers.max(64);
        (num_workers * num_workers * 16).next_power_of_two()
    }
}
