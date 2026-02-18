use turbo_rcstr::{RcStr, rcstr};

pub fn boundary_type_server_component() -> RcStr {
    rcstr!("server-component")
}

pub fn boundary_type_server_utility() -> RcStr {
    rcstr!("server-utility")
}

pub fn boundary_type_dynamic_entry() -> RcStr {
    rcstr!("dynamic-entry")
}
