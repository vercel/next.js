#[cfg(feature = "__swc")]
pub mod swc {
    #[cfg(feature = "__swc_core")]
    pub use swc_core as core;

    #[cfg(feature = "__swc_custom_transform")]
    pub mod custom_transform {
        #[cfg(feature = "__swc_transform_modularize_imports")]
        pub use modularize_imports;
        #[cfg(feature = "__swc_transform_styled_components")]
        pub use styled_components;
        #[cfg(feature = "__swc_transform_styled_jsx")]
        pub use styled_jsx;
        #[cfg(feature = "__swc_transform_emotion")]
        pub use swc_emotion as emotion;
        #[cfg(feature = "__swc_transform_relay")]
        pub use swc_relay as relay;
    }

    #[cfg(feature = "testing")]
    pub use testing;
}

#[cfg(feature = "__turbo")]
pub mod turbo {
    #[cfg(feature = "__turbo_malloc")]
    pub use turbo_malloc as malloc;
    #[cfg(feature = "__turbo_tasks")]
    pub use turbo_tasks as tasks;
    #[cfg(feature = "__turbo_tasks_build")]
    pub use turbo_tasks_build as tasks_build;
    #[cfg(feature = "__turbo_tasks_bytes")]
    pub use turbo_tasks_bytes as tasks_bytes;
    #[cfg(feature = "__turbo_tasks_env")]
    pub use turbo_tasks_env as tasks_env;
    #[cfg(feature = "__turbo_tasks_fetch")]
    pub use turbo_tasks_fetch as tasks_fetch;
    #[cfg(feature = "__turbo_tasks_fs")]
    pub use turbo_tasks_fs as tasks_fs;
    #[cfg(feature = "__turbo_tasks_hash")]
    pub use turbo_tasks_hash as tasks_hash;
    #[cfg(feature = "__turbo_tasks_macros")]
    pub use turbo_tasks_macros as tasks_macros;
    #[cfg(feature = "__turbo_tasks_macros_shared")]
    pub use turbo_tasks_macros_shared as tasks_macros_shared;
    #[cfg(feature = "__turbo_tasks_memory")]
    pub use turbo_tasks_memory as tasks_memory;
    #[cfg(feature = "__turbo_tasks_testing")]
    pub use turbo_tasks_testing as tasks_testing;
    #[cfg(feature = "__turbo_updater")]
    pub use turbo_updater as updater;
}

#[cfg(feature = "__turbopack")]
pub mod turbopack {
    pub use turbopack;
    #[cfg(feature = "__turbopack_bench")]
    pub use turbopack_bench as bench;
    #[cfg(feature = "__turbopack_cli_utils")]
    pub use turbopack_cli_utils as cli_utils;
    #[cfg(feature = "__turbopack_core")]
    pub use turbopack_core as core;
    #[cfg(feature = "__turbopack_create_test_app")]
    pub use turbopack_create_test_app as create_test_app;
    #[cfg(feature = "__turbopack_css")]
    pub use turbopack_css as css;
    #[cfg(feature = "__turbopack_dev")]
    pub use turbopack_dev as dev;
    #[cfg(feature = "__turbopack_dev_server")]
    pub use turbopack_dev_server as dev_server;
    #[cfg(feature = "__turbopack_ecmascript")]
    pub use turbopack_ecmascript as ecmascript;
    #[cfg(feature = "__turbopack_ecmascript_plugin")]
    pub use turbopack_ecmascript_plugins as ecmascript_plugin;
    #[cfg(feature = "__turbopack_env")]
    pub use turbopack_env as env;
    #[cfg(feature = "__turbopack_image")]
    pub use turbopack_image as image;
    #[cfg(feature = "__turbopack_json")]
    pub use turbopack_json as json;
    #[cfg(feature = "__turbopack_mdx")]
    pub use turbopack_mdx as mdx;
    #[cfg(feature = "__turbopack_node")]
    pub use turbopack_node as node;
    #[cfg(feature = "__turbopack_static")]
    pub use turbopack_static as r#static;
    #[cfg(feature = "__turbopack_swc_utils")]
    pub use turbopack_swc_utils as swc_utils;
    #[cfg(feature = "__turbopack_test_utils")]
    pub use turbopack_test_utils as test_utils;
    #[cfg(feature = "__turbopack_tests")]
    pub use turbopack_tests as tests;
}

#[cfg(feature = "__features")]
pub mod features {
    #[cfg(feature = "__feature_auto_hash_map")]
    pub use auto_hash_map;
    #[cfg(feature = "__feature_mdx_rs")]
    pub use mdxjs;
    #[cfg(feature = "__feature_node_file_trace")]
    pub use node_file_trace;
    #[cfg(feature = "__feature_swc_ast_explorer")]
    pub use swc_ast_explorer;
}
