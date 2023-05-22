use once_cell::sync::Lazy;

pub static TRACING_OVERVIEW_TARGETS: Lazy<Vec<&str>> = Lazy::new(|| {
    vec![
        "turbo_tasks_fs=info",
        "turbopack_dev_server=info",
        "turbopack_node=info",
    ]
});
pub static TRACING_TURBOPACK_TARGETS: Lazy<Vec<&str>> = Lazy::new(|| {
    [
        &TRACING_OVERVIEW_TARGETS[..],
        &[
            "turbo_tasks=info",
            "turbopack=trace",
            "turbopack_core=trace",
            "turbopack_ecmascript=trace",
            "turbopack_css=trace",
            "turbopack_dev=trace",
            "turbopack_image=trace",
            "turbopack_dev_server=trace",
            "turbopack_json=trace",
            "turbopack_mdx=trace",
            "turbopack_node=trace",
            "turbopack_static=trace",
            "turbopack_cli_utils=trace",
            "turbopack_cli=trace",
            "turbopack_ecmascript=trace",
        ],
    ]
    .concat()
});
pub static TRACING_TURBO_TASKS_TARGETS: Lazy<Vec<&str>> = Lazy::new(|| {
    [
        &TRACING_TURBOPACK_TARGETS[..],
        &[
            "turbo_tasks=trace",
            "turbo_tasks_viz=trace",
            "turbo_tasks_memory=trace",
            "turbo_tasks_fs=trace",
        ],
    ]
    .concat()
});
