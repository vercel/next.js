#![feature(iter_intersperse)]
#![feature(hash_raw_entry)]
#![feature(box_patterns)]

use std::{path::PathBuf, sync::Arc};

use self::{reader::TraceReader, server::serve, store_container::StoreContainer};

mod bottom_up;
mod reader;
mod self_time_tree;
mod server;
mod span;
mod span_bottom_up_ref;
mod span_graph_ref;
mod span_ref;
mod store;
mod store_container;
mod u64_empty_string;
mod u64_string;
mod viewer;

pub fn start_turbopack_trace_server(path: PathBuf) {
    let store = Arc::new(StoreContainer::new());
    let reader = TraceReader::spawn(store.clone(), path);

    serve(store);

    reader.join().unwrap();
}
