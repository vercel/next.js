use anyhow::Result;
use turbo_tasks::primitives::OptionStringVc;
use turbo_tasks_env::{EnvMapVc, ProcessEnv, ProcessEnvVc};
use turbopack_ecmascript::utils::stringify_str;

/// Encodes values as JS strings so that they can be safely injected into a JS
/// output.
#[turbo_tasks::value]
pub struct EmbeddableProcessEnv {
    prior: ProcessEnvVc,
}

#[turbo_tasks::value_impl]
impl EmbeddableProcessEnvVc {
    #[turbo_tasks::function]
    pub fn new(prior: ProcessEnvVc) -> Self {
        EmbeddableProcessEnv { prior }.cell()
    }
}

#[turbo_tasks::value_impl]
impl ProcessEnv for EmbeddableProcessEnv {
    #[turbo_tasks::function]
    async fn read_all(&self) -> Result<EnvMapVc> {
        let prior = self.prior.read_all().await?;

        let encoded = prior
            .iter()
            .map(|(k, v)| (k.clone(), stringify_str(v)))
            .collect();

        Ok(EnvMapVc::cell(encoded))
    }

    #[turbo_tasks::function]
    async fn read(&self, name: &str) -> Result<OptionStringVc> {
        let prior = self.prior.read(name).await?;
        let encoded = prior.as_deref().map(stringify_str);
        Ok(OptionStringVc::cell(encoded))
    }
}
