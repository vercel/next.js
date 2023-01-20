use next_binding::swc::core::ecma::visit::{as_folder, noop_visit_mut_type, Fold, VisitMut};
use serde::Deserialize;

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Config {}

pub fn server_actions(config: Config) -> impl VisitMut + Fold {
    as_folder(ServerActions { config })
}

struct ServerActions {
    config: Config,
}

impl VisitMut for ServerActions {
    noop_visit_mut_type!();
}
