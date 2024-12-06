use std::{collections::HashMap, str::FromStr};

use anyhow::{Context, Result};
use tracing::{level_filters::LevelFilter, Subscriber};
use tracing_subscriber::Layer;

pub struct FilterLayer {
    config: HashMap<String, LevelFilter>,
}

impl FilterLayer {
    pub fn try_new(config: &str) -> Result<Self> {
        let mut map = HashMap::new();
        for entry in config.split(',') {
            if entry.is_empty() {
                continue;
            }
            let mut parts = entry.splitn(2, '=');
            let target = parts.next().unwrap();
            let level = parts
                .next()
                .context("Invalid filter syntax, expected `target=level`")?;
            let level = LevelFilter::from_str(level).unwrap();
            map.insert(target.to_string(), level);
        }
        Ok(Self { config: map })
    }
}

impl<S: Subscriber> Layer<S> for FilterLayer {
    fn enabled(
        &self,
        metadata: &tracing::Metadata<'_>,
        _ctx: tracing_subscriber::layer::Context<'_, S>,
    ) -> bool {
        let target = metadata.target().split("::").next().unwrap();
        let Some(filter) = self.config.get(target) else {
            return false;
        };
        let level = metadata.level();
        return level <= filter;
    }

    fn max_level_hint(&self) -> Option<LevelFilter> {
        self.config.values().copied().min()
    }
}
