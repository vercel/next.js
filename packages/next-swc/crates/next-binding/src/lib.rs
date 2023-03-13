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
    }

    #[cfg(feature = "testing")]
    pub use testing;
}

#[cfg(feature = "__turbo")]
pub mod turbo {
    #[cfg(feature = "__turbo_next_dev_server")]
    pub use next_dev;
    #[cfg(feature = "__turbo_node_file_trace")]
    pub use node_file_trace;
}

#[cfg(feature = "__features")]
pub mod features {
    #[cfg(feature = "__feature_mdx_rs")]
    pub use mdxjs;
}
