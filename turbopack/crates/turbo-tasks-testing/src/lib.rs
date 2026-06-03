//! Testing utilities and macros for turbo-tasks and applications based on it.

mod run;

pub use crate::run::{
    Registration, TestInstance, run, run_once, run_once_without_cache_check, run_with_tt,
    run_without_cache_check, test_instance,
};
