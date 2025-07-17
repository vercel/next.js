use next_api::module_graph_snapshot::{ModuleGraphSnapshot, ModuleInfo, ModuleReference};
use turbo_rcstr::RcStr;

#[napi(object)]
pub struct NapiModuleReference {
    /// The index of the referenced/referencing module in the modules list.
    pub i: u32,
}

impl From<&ModuleReference> for NapiModuleReference {
    fn from(reference: &ModuleReference) -> Self {
        Self {
            i: reference.index as u32,
        }
    }
}

#[napi(object)]
pub struct NapiModuleInfo {
    pub ident: RcStr,
    pub path: RcStr,
    pub depth: u32,
    pub references: Vec<NapiModuleReference>,
    pub incoming_references: Vec<NapiModuleReference>,
}

impl From<&ModuleInfo> for NapiModuleInfo {
    fn from(info: &ModuleInfo) -> Self {
        Self {
            ident: info.ident.clone(),
            path: info.path.clone(),
            depth: info.depth,
            references: info
                .references
                .iter()
                .map(|r| NapiModuleReference::from(r))
                .collect(),
            incoming_references: info
                .incoming_references
                .iter()
                .map(|r| NapiModuleReference::from(r))
                .collect(),
        }
    }
}

#[napi(object)]
#[derive(Default)]
pub struct NapiModuleGraphSnapshot {
    pub modules: Vec<NapiModuleInfo>,
    pub entries: Vec<u32>,
}

impl From<&ModuleGraphSnapshot> for NapiModuleGraphSnapshot {
    fn from(snapshot: &ModuleGraphSnapshot) -> Self {
        Self {
            modules: snapshot
                .modules
                .iter()
                .map(|info| NapiModuleInfo::from(info))
                .collect(),
            entries: snapshot
                .entries
                .iter()
                .map(|&i| {
                    // If you have more that 4294967295 entries, you probably have other problems...
                    i.try_into().unwrap()
                })
                .collect(),
        }
    }
}
