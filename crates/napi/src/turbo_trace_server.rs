use std::path::PathBuf;

#[napi]
pub fn start_turbopack_trace_server(path: String) {
    let path_buf = PathBuf::from(path);
    turbopack_trace_server::start_turbopack_trace_server(path_buf);
}
