use next_api::module_graph_snapshot::{ModuleGraphSnapshot, ModuleInfo, ModuleReference};
use turbo_rcstr::RcStr;
use turbopack_core::chunk::ChunkingType;

#[napi(object)]
pub struct NapiModuleReference {
    /// The index of the referenced/referencing module in the modules list.
    pub index: u32,
    /// The export used in the module reference.
    pub export: String,
    /// The type of chunking for the module reference.
    pub chunking_type: String,
}

impl From<&ModuleReference> for NapiModuleReference {
    fn from(reference: &ModuleReference) -> Self {
        Self {
            index: reference.index as u32,
            export: reference.export.to_string(),
            chunking_type: match &reference.chunking_type {
                ChunkingType::Parallel { hoisted: true, .. } => "hoisted".to_string(),
                ChunkingType::Parallel { hoisted: false, .. } => "sync".to_string(),
                ChunkingType::Async => "async".to_string(),
                ChunkingType::Isolated {
                    merge_tag: None, ..
                } => "isolated".to_string(),
                ChunkingType::Isolated {
                    merge_tag: Some(name),
                    ..
                } => format!("isolated {name}"),
                ChunkingType::Shared {
                    merge_tag: None, ..
                } => "shared".to_string(),
                ChunkingType::Shared {
                    merge_tag: Some(name),
                    ..
                } => format!("shared {name}"),
                ChunkingType::Traced => "traced".to_string(),
            },
        }
    }
}

#[napi(object)]
pub struct NapiModuleInfo {
    pub ident: RcStr,
    pub path: RcStr,
    pub depth: u32,
    pub size: u32,
    pub retained_size: u32,
    pub references: Vec<NapiModuleReference>,
    pub incoming_references: Vec<NapiModuleReference>,
}

impl From<&ModuleInfo> for NapiModuleInfo {
    fn from(info: &ModuleInfo) -> Self {
        Self {
            ident: info.ident.clone(),
            path: info.path.clone(),
            depth: info.depth,
            size: info.size,
            retained_size: info.retained_size,
            references: info
                .references
                .iter()
                .map(NapiModuleReference::from)
                .collect(),
            incoming_references: info
                .incoming_references
                .iter()
                .map(NapiModuleReference::from)
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
            modules: snapshot.modules.iter().map(NapiModuleInfo::from).collect(),
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
