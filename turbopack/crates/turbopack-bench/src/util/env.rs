use std::{error::Error, str::FromStr};

use anyhow::{Context, Result, anyhow};

/// Reads an environment variable.
pub fn read_env<T>(name: &str, default: T) -> Result<T>
where
    T: FromStr,
    <T as FromStr>::Err: Error + Send + Sync + 'static,
{
    let config = std::env::var(name).ok();
    match config.as_deref() {
        None | Some("") => Ok(default),
        Some(config) => config
            .parse()
            .with_context(|| anyhow!("Invalid value for {}", name)),
    }
}

/// Reads a boolean-like environment variable, where any value but "0", "no",
/// or "false" is considered true.
pub fn read_env_bool(name: &str) -> bool {
    let config = std::env::var(name).ok();
    !matches!(
        config.as_deref(),
        None | Some("") | Some("0") | Some("no") | Some("false")
    )
}

/// Reads a comma-separated environment variable as a vector.
pub fn read_env_list<T>(name: &str, default: Vec<T>) -> Result<Vec<T>>
where
    T: FromStr,
    <T as FromStr>::Err: Error + Send + Sync + 'static,
{
    let config = std::env::var(name).ok();
    match config.as_deref() {
        None | Some("") => Ok(default),
        Some(config) => config
            .split(',')
            .map(|s| {
                s.parse()
                    .with_context(|| anyhow!("Invalid value for {}", name))
            })
            .collect(),
    }
}
