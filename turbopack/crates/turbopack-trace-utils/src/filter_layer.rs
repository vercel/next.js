use std::str::FromStr;

use anyhow::Result;
use rustc_hash::FxHashMap;
use tracing::{level_filters::LevelFilter, Subscriber};
use tracing_subscriber::Layer;

pub struct FilterLayer {
    config: FxHashMap<String, LevelFilter>,
    global_level: LevelFilter,
}

impl FilterLayer {
    pub fn try_new(input: &str) -> Result<Self> {
        let mut config = FxHashMap::default();
        let mut global_level = LevelFilter::OFF;
        for entry in input.split(',') {
            if entry.is_empty() {
                continue;
            }
            let mut parts = entry.splitn(2, '=');
            let target = parts.next().unwrap();
            let level = parts.next().unwrap_or("trace");
            let level = LevelFilter::from_str(level).unwrap();
            if target == "*" {
                global_level = level;
            } else {
                config.insert(target.to_string(), level);
            }
        }
        Ok(Self {
            config,
            global_level,
        })
    }
}

impl<S: Subscriber> Layer<S> for FilterLayer {
    fn enabled(
        &self,
        metadata: &tracing::Metadata<'_>,
        _ctx: tracing_subscriber::layer::Context<'_, S>,
    ) -> bool {
        if self.config.is_empty() {
            return true;
        }
        let target = metadata.target().split("::").next().unwrap();
        let filter = self.config.get(target).unwrap_or(&self.global_level);
        let level = metadata.level();
        level <= filter
    }

    fn max_level_hint(&self) -> Option<LevelFilter> {
        self.config.values().copied().min()
    }
}
