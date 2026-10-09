use turbo_rcstr::{RcStr, rcstr};

pub(crate) mod css_client_reference;
pub(crate) mod ecmascript_client_reference;
pub(crate) mod visit_client_reference;

/// Merge tag of the isolated chunk groups for the client side of client references (CSS and
/// ecmascript).
pub const CLIENT_MERGE_TAG: RcStr = rcstr!("client");
/// Merge tag of the isolated chunk groups for the SSR side of ecmascript client references.
pub const SSR_MERGE_TAG: RcStr = rcstr!("ssr");

pub use css_client_reference::{
    css_client_reference_module::CssClientReferenceModule,
    css_client_reference_transition::NextCssClientReferenceTransition,
};
pub use ecmascript_client_reference::{
    ecmascript_client_reference_module::EcmascriptClientReferenceModule,
    ecmascript_client_reference_transition::NextEcmascriptClientReferenceTransition,
};
pub use visit_client_reference::{
    ClientReference, ClientReferenceGraphResult, ClientReferenceType, ServerEntries,
    find_server_entries,
};
