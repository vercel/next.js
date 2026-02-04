use anyhow::Result;
use turbo_rcstr::RcStr;
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_env::{EnvMap, ProcessEnv};
use turbopack_ecmascript::utils::StringifyJs;

/// Encodes values as JS strings so that they can be safely injected into a JS
/// output.
#[turbo_tasks::value]
pub struct EmbeddableProcessEnv {
    prior: ResolvedVc<Box<dyn ProcessEnv>>,
}

#[turbo_tasks::value_impl]
impl EmbeddableProcessEnv {
    #[turbo_tasks::function]
    pub fn new(prior: ResolvedVc<Box<dyn ProcessEnv>>) -> Result<Vc<Self>> {
        Ok(EmbeddableProcessEnv { prior }.cell())
    }
}

#[turbo_tasks::value_impl]
impl ProcessEnv for EmbeddableProcessEnv {
    #[turbo_tasks::function]
    async fn read_all(&self) -> Result<Vc<EnvMap>> {
        let prior = self.prior.read_all().await?;

        let encoded = prior
            .iter()
            .map(|(k, v)| (k.clone(), StringifyJs(v).to_string().into()))
            .collect();

        Ok(Vc::cell(encoded))
    }

    #[turbo_tasks::function]
    async fn read(&self, name: RcStr) -> Result<Vc<Option<RcStr>>> {
        let prior = self.prior.read(name).await?;
        let encoded = prior
            .as_deref()
            .map(|s| StringifyJs(s).to_string())
            .map(RcStr::from);
        Ok(Vc::cell(encoded))
    }
}
