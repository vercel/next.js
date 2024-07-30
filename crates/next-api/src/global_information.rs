use std::collections::HashMap;

use anyhow::Result;
use turbo_tasks::{RcStr, Vc};
use turbopack_binding::turbopack::core::{
    chunk::{
        global_information::{GlobalInformation, OptionGlobalInformation},
        ModuleId,
    },
    ident::AssetIdent,
};

use crate::project::Project;

#[turbo_tasks::function]
pub async fn build_global_information(project: Vc<Project>) -> Result<Vc<OptionGlobalInformation>> {
    let global_information = GlobalInformation {
        test_str: Vc::cell(RcStr::from("prod")),
        module_id_map: build_module_id_map(project).await?,
    };
    Ok(Vc::cell(Some(global_information)))
}

async fn build_module_id_map(project: Vc<Project>) -> Result<HashMap<AssetIdent, ModuleId>> {
    Ok(HashMap::new())
}
