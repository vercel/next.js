use once_cell::sync::Lazy;
use turbopack_binding::turbopack::trace_utils::tracing_presets::{
    TRACING_OVERVIEW_TARGETS, TRACING_TURBOPACK_TARGETS, TRACING_TURBO_TASKS_TARGETS,
};

pub static TRACING_NEXT_TARGETS: Lazy<Vec<&str>> = Lazy::new(|| {
    [
        &TRACING_OVERVIEW_TARGETS[..],
        &[
            "next_dev=trace",
            "next_core=trace",
            "next_font=trace",
            "turbopack_node=trace",
        ],
    ]
    .concat()
});
pub static TRACING_NEXT_TURBOPACK_TARGETS: Lazy<Vec<&str>> =
    Lazy::new(|| [&TRACING_NEXT_TARGETS[..], &TRACING_TURBOPACK_TARGETS[..]].concat());
pub static TRACING_NEXT_TURBO_TASKS_TARGETS: Lazy<Vec<&str>> = Lazy::new(|| {
    [
        &TRACING_TURBOPACK_TARGETS[..],
        &TRACING_TURBO_TASKS_TARGETS[..],
    ]
    .concat()
});
