use once_cell::sync::Lazy;
use turbopack_trace_utils::tracing_presets::{
    TRACING_OVERVIEW_TARGETS, TRACING_TURBOPACK_TARGETS, TRACING_TURBO_TASKS_TARGETS,
};

pub static TRACING_NEXT_OVERVIEW_TARGETS: Lazy<Vec<&str>> = Lazy::new(|| {
    [
        &TRACING_OVERVIEW_TARGETS[..],
        &[
            "next_swc_napi=info",
            "next_swc=info",
            "next_api=info",
            "next_dev=info",
            "next_core=info",
            "next_font=info",
            "turbopack_node=info",
        ],
    ]
    .concat()
});

pub static TRACING_NEXT_TARGETS: Lazy<Vec<&str>> = Lazy::new(|| {
    [
        &TRACING_NEXT_OVERVIEW_TARGETS[..],
        &[
            "next_swc_napi=trace",
            "next_swc=trace",
            "next_api=trace",
            "next_dev=trace",
            "next_core=trace",
            "next_font=trace",
        ],
    ]
    .concat()
});
pub static TRACING_NEXT_TURBOPACK_TARGETS: Lazy<Vec<&str>> =
    Lazy::new(|| [&TRACING_NEXT_TARGETS[..], &TRACING_TURBOPACK_TARGETS[..]].concat());
pub static TRACING_NEXT_TURBO_TASKS_TARGETS: Lazy<Vec<&str>> = Lazy::new(|| {
    [
        &TRACING_NEXT_TURBOPACK_TARGETS[..],
        &TRACING_TURBO_TASKS_TARGETS[..],
    ]
    .concat()
});
