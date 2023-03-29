use std::collections::HashMap;

use anyhow::Result;
use serde::{Deserialize, Serialize};
use turbo_tasks::trace::TraceRawVcs;
use turbo_tasks_fs::FileSystemPathVc;

use crate::environment::EnvironmentVc;

// TODO stringify split map collect could be optimized with a marco
#[macro_export]
macro_rules! definable_name_map_internal {
    ($map:ident, $($name:ident).+ = $value:expr) => {
        $map.insert(
            $crate::definable_name_map_internal!($($name).+).into(),
            $value.into()
        );
    };
    ($map:ident, $($name:ident).+ = $value:expr,) => {
        $map.insert(
            $crate::definable_name_map_internal!($($name).+).into(),
            $value.into()
        );
    };
    ($map:ident, $($name:ident).+ = $value:expr, $($more:tt)+) => {
        $crate::definable_name_map_internal!($map, $($name).+ = $value);
        $crate::definable_name_map_internal!($map, $($more)+);
    };
    ($name:ident) => {
        [stringify!($name).to_string()]
    };
    ($name:ident . $($more:ident).+) => {
        $crate::definable_name_map_internal!($($more).+, [stringify!($name).to_string()])
    };
    ($name:ident, [$($array:expr),+]) => {
        [$($array),+, stringify!($name).to_string()]
    };
    ($name:ident . $($more:ident).+, [$($array:expr),+]) => {
        $crate::definable_name_map_internal!($($more).+, [$($array),+, stringify!($name).to_string()])
    };
}

#[macro_export]
macro_rules! compile_time_defines {
    ($($more:tt)+) => {
        {
            let mut map = std::collections::HashMap::new();
            $crate::definable_name_map_internal!(map, $($more)+);
            $crate::compile_time_info::CompileTimeDefines(map)
        }
    };
}

#[macro_export]
macro_rules! free_var_references {
    ($($more:tt)+) => {
        {
            let mut map = std::collections::HashMap::new();
            $crate::definable_name_map_internal!(map, $($more)+);
            $crate::compile_time_info::FreeVarReferences(map)
        }
    };
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, TraceRawVcs)]
pub enum CompileTimeDefineValue {
    Bool(bool),
    String(String),
}

impl From<bool> for CompileTimeDefineValue {
    fn from(value: bool) -> Self {
        Self::Bool(value)
    }
}

impl From<String> for CompileTimeDefineValue {
    fn from(value: String) -> Self {
        Self::String(value)
    }
}

impl From<&str> for CompileTimeDefineValue {
    fn from(value: &str) -> Self {
        Self::String(value.to_string())
    }
}

#[turbo_tasks::value(transparent)]
pub struct CompileTimeDefines(pub HashMap<Vec<String>, CompileTimeDefineValue>);

#[turbo_tasks::value_impl]
impl CompileTimeDefinesVc {
    #[turbo_tasks::function]
    pub fn empty() -> Self {
        Self::cell(HashMap::new())
    }
}

#[turbo_tasks::value]
pub enum FreeVarReference {
    EcmaScriptModule {
        request: String,
        context: Option<FileSystemPathVc>,
        export: Option<String>,
    },
}

#[turbo_tasks::value(transparent)]
pub struct FreeVarReferences(pub HashMap<Vec<String>, FreeVarReference>);

#[turbo_tasks::value_impl]
impl FreeVarReferencesVc {
    #[turbo_tasks::function]
    pub fn empty() -> Self {
        Self::cell(HashMap::new())
    }
}

#[turbo_tasks::value(shared)]
pub struct CompileTimeInfo {
    pub environment: EnvironmentVc,
    pub defines: CompileTimeDefinesVc,
    pub free_var_references: FreeVarReferencesVc,
}

impl CompileTimeInfo {
    pub fn builder(environment: EnvironmentVc) -> CompileTimeInfoBuilder {
        CompileTimeInfoBuilder {
            environment,
            defines: None,
            free_var_references: None,
        }
    }
}

#[turbo_tasks::value_impl]
impl CompileTimeInfoVc {
    #[turbo_tasks::function]
    pub fn new(environment: EnvironmentVc) -> Self {
        CompileTimeInfo {
            environment,
            defines: CompileTimeDefinesVc::empty(),
            free_var_references: FreeVarReferencesVc::empty(),
        }
        .cell()
    }

    #[turbo_tasks::function]
    pub async fn environment(self) -> Result<EnvironmentVc> {
        Ok(self.await?.environment)
    }
}

pub struct CompileTimeInfoBuilder {
    environment: EnvironmentVc,
    defines: Option<CompileTimeDefinesVc>,
    free_var_references: Option<FreeVarReferencesVc>,
}

impl CompileTimeInfoBuilder {
    pub fn defines(mut self, defines: CompileTimeDefinesVc) -> Self {
        self.defines = Some(defines);
        self
    }

    pub fn free_var_references(mut self, free_var_references: FreeVarReferencesVc) -> Self {
        self.free_var_references = Some(free_var_references);
        self
    }

    pub fn build(self) -> CompileTimeInfo {
        CompileTimeInfo {
            environment: self.environment,
            defines: self.defines.unwrap_or_else(CompileTimeDefinesVc::empty),
            free_var_references: self
                .free_var_references
                .unwrap_or_else(FreeVarReferencesVc::empty),
        }
    }

    pub fn cell(self) -> CompileTimeInfoVc {
        self.build().cell()
    }
}
