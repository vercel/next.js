use anyhow::Result;
use turbo_tasks::{
    primitives::{BoolVc, StringsVc},
    Value,
};

use crate::target::CompileTargetVc;

#[turbo_tasks::value]
pub struct Environment {
    // members must be private to avoid leaking non-custom types
    execution: ExecutionEnvironment,
    intention: EnvironmentIntention,
}

#[turbo_tasks::value_impl]
impl EnvironmentVc {
    #[turbo_tasks::function]
    pub fn new(
        execution: Value<ExecutionEnvironment>,
        intention: Value<EnvironmentIntention>,
    ) -> Self {
        Self::cell(Environment {
            execution: execution.into_value(),
            intention: intention.into_value(),
        })
    }
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(PartialOrd, Ord, Debug, Hash, Clone, Copy)]
pub enum EnvironmentIntention {
    /// Intent to compute data needed for rendering
    Data,
    /// Intent to intercept requests before server handling
    Middleware,
    /// Intent to handle api requests
    Api,
    /// Intent to prerender on a server for hydration on a client
    Prerendering,
    /// Intent to render on a server
    ServerRendering,
    /// Intent to render into static content
    StaticRendering,
    /// Intent to behave equally to the execution environment
    Emulate,
    /// Intent to render on the client
    Client,
    // TODO allow custom trait here
    Custom(u8),
}

#[turbo_tasks::value(serialization = "auto_for_input")]
#[derive(PartialOrd, Ord, Debug, Hash, Clone, Copy)]
pub enum ExecutionEnvironment {
    NodeJsBuildTime(NodeJsEnvironmentVc),
    NodeJsLambda(NodeJsEnvironmentVc),
    EdgeFunction(NodeJsEnvironmentVc),
    Browser(BrowserEnvironmentVc),
    // TODO allow custom trait here
    Custom(u8),
}

#[turbo_tasks::value_impl]
impl EnvironmentVc {
    #[turbo_tasks::function]
    pub async fn compile_target(self) -> Result<CompileTargetVc> {
        let this = self.await?;
        Ok(match this.execution {
            ExecutionEnvironment::NodeJsBuildTime(node_env)
            | ExecutionEnvironment::NodeJsLambda(node_env) => node_env.await?.compile_target,
            ExecutionEnvironment::Browser(_) => CompileTargetVc::unknown(),
            ExecutionEnvironment::EdgeFunction(_) => todo!(),
            ExecutionEnvironment::Custom(_) => todo!(),
        })
    }

    #[turbo_tasks::function]
    pub async fn is_typescript_enabled(self) -> Result<BoolVc> {
        let this = self.await?;
        Ok(match this.execution {
            ExecutionEnvironment::NodeJsBuildTime(node_env)
            | ExecutionEnvironment::NodeJsLambda(node_env) => {
                BoolVc::cell(node_env.await?.typescript_enabled)
            }
            ExecutionEnvironment::Browser(_) => BoolVc::cell(false),
            ExecutionEnvironment::EdgeFunction(_) => BoolVc::cell(false),
            ExecutionEnvironment::Custom(_) => todo!(),
        })
    }

    #[turbo_tasks::function]
    pub async fn node_externals(self) -> Result<BoolVc> {
        let this = self.await?;
        Ok(match this.execution {
            ExecutionEnvironment::NodeJsBuildTime(_) | ExecutionEnvironment::NodeJsLambda(_) => {
                BoolVc::cell(true)
            }
            ExecutionEnvironment::Browser(_) => BoolVc::cell(false),
            ExecutionEnvironment::EdgeFunction(_) => BoolVc::cell(false),
            ExecutionEnvironment::Custom(_) => todo!(),
        })
    }

    #[turbo_tasks::function]
    pub async fn with_typescript(self) -> Result<EnvironmentVc> {
        let env = self.await?;
        let exec = match env.execution {
            ExecutionEnvironment::NodeJsLambda(node_env) => {
                let node_env = node_env.await?;
                if node_env.typescript_enabled {
                    return Ok(self);
                }
                ExecutionEnvironment::NodeJsLambda(
                    NodeJsEnvironment {
                        typescript_enabled: true,
                        ..*node_env
                    }
                    .into(),
                )
            }
            ExecutionEnvironment::Custom(_) => todo!(),
            _ => return Ok(self),
        };
        Ok(EnvironmentVc::new(
            Value::new(exec),
            Value::new(env.intention),
        ))
    }

    #[turbo_tasks::function]
    pub async fn is_emulating(self) -> Result<BoolVc> {
        let env = self.await?;
        Ok(match env.intention {
            EnvironmentIntention::Emulate => BoolVc::cell(true),
            EnvironmentIntention::Custom(_) => todo!(),
            _ => BoolVc::cell(false),
        })
    }

    #[turbo_tasks::function]
    pub async fn resolve_extensions(self) -> Result<StringsVc> {
        let env = self.await?;
        Ok(match env.execution {
            ExecutionEnvironment::NodeJsBuildTime(_) | ExecutionEnvironment::NodeJsLambda(_) => {
                StringsVc::cell(vec![
                    ".js".to_string(),
                    ".node".to_string(),
                    ".json".to_string(),
                ])
            }
            ExecutionEnvironment::EdgeFunction(_) | ExecutionEnvironment::Browser(_) => {
                StringsVc::empty()
            }
            ExecutionEnvironment::Custom(_) => todo!(),
        })
    }

    #[turbo_tasks::function]
    pub async fn resolve_node_modules(self) -> Result<BoolVc> {
        let env = self.await?;
        Ok(match env.execution {
            ExecutionEnvironment::NodeJsBuildTime(_) | ExecutionEnvironment::NodeJsLambda(_) => {
                BoolVc::cell(true)
            }
            ExecutionEnvironment::EdgeFunction(_) | ExecutionEnvironment::Browser(_) => {
                BoolVc::cell(false)
            }
            ExecutionEnvironment::Custom(_) => todo!(),
        })
    }
}

pub enum NodeEnvironmentType {
    Server,
}

#[turbo_tasks::value(shared)]
pub struct NodeJsEnvironment {
    pub typescript_enabled: bool,
    pub compile_target: CompileTargetVc,
    // TODO
    pub node_version: u8,
}

#[turbo_tasks::value(shared)]
pub struct BrowserEnvironment {
    pub dom: bool,
    pub web_worker: bool,
    pub service_worker: bool,
    // TODO
    pub browser_version: u8,
}
