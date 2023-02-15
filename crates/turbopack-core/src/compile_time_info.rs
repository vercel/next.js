use anyhow::Result;

use crate::environment::EnvironmentVc;

#[turbo_tasks::value(shared)]
pub struct CompileTimeInfo {
    pub environment: EnvironmentVc,
}

#[turbo_tasks::value_impl]
impl CompileTimeInfoVc {
    #[turbo_tasks::function]
    pub fn new(environment: EnvironmentVc) -> Self {
        CompileTimeInfo { environment }.cell()
    }

    #[turbo_tasks::function]
    pub async fn environment(self) -> Result<EnvironmentVc> {
        Ok(self.await?.environment)
    }
}
