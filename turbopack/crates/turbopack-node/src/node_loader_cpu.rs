use std::{env, thread::available_parallelism};

const LOADER_CPU_VAR: &str = "TURBOPACK_LOADER_CPU";

pub fn get_loader_cpu() -> usize {
    let Ok(val) = env::var(LOADER_CPU_VAR) else {
        return available_parallelism().map_or(1, |v| v.get());
    };

    let result = val.parse().unwrap_or(0);
    let default = available_parallelism().map_or(1, |v| v.get());
    if default < result || result < 1 {
        default
    } else {
        result
    }
}
