pub(crate) mod ecmascript_client_reference;
pub(crate) mod visit_client_reference;

pub use ecmascript_client_reference::{
    ecmascript_client_reference_module::EcmascriptClientReferenceModule,
    ecmascript_client_reference_transition::NextEcmascriptClientReferenceTransition,
};
pub use visit_client_reference::{
    client_reference_graph, find_server_entries, ClientReference, ClientReferenceGraphResult,
    ClientReferenceType, ClientReferenceTypes, ServerEntries, VisitedClientReferenceGraphNodes,
};
