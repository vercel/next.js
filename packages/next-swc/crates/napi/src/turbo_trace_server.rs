use std::{path::PathBuf, thread};

use napi::JsBoolean;

#[napi]
pub fn start_turbopack_trace_server(path: String, in_process: JsBoolean) -> napi::Result<String> {
    let path_buf = PathBuf::from(path);
    if in_process.get_value()? {
        turbopack_binding::turbopack::trace_server::start_turbopack_trace_server(path_buf);
    } else {
        thread::spawn(move || {
            turbopack_binding::turbopack::trace_server::start_turbopack_trace_server(path_buf);
        });
    }

    Ok("".to_string())
}
