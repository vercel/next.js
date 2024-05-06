use std::path::PathBuf;

#[napi]
pub async fn start_turbopack_trace_server(path: String) -> napi::Result<String> {
    let path_buf = PathBuf::from(path);
    turbopack_binding::turbopack::trace_server::start_turbopack_trace_server(path_buf);
    Ok("".to_string())
}
