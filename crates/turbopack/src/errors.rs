pub mod failed_to_analyse {
    pub mod ecmascript {
        pub const DYNAMIC_IMPORT: &'static str = "TP1001";
        pub const REQUIRE: &'static str = "TP1002";
        pub const REQUIRE_RESOLVE: &'static str = "TP1003";
        pub const FS_METHOD: &'static str = "TP1004";
        pub const CHILD_PROCESS_SPAWN: &'static str = "TP1005";
        pub const PATH_METHOD: &'static str = "TP1006";
        #[cfg(feature = "node-native-binding")]
        pub const NODE_PRE_GYP_FIND: &'static str = "TP1100";
        #[cfg(feature = "node-native-binding")]
        pub const NODE_GYP_BUILD: &'static str = "TP1101";
    }
}
