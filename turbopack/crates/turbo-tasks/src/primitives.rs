use std::time::Duration;

use turbo_rcstr::RcStr;
use turbo_tasks_macros::primitive as __turbo_tasks_internal_primitive;

use crate::{
    Vc, {self as turbo_tasks},
};

__turbo_tasks_internal_primitive!(());
__turbo_tasks_internal_primitive!(String, manual_shrink_to_fit);
__turbo_tasks_internal_primitive!(RcStr);
__turbo_tasks_internal_primitive!(Option<String>);
__turbo_tasks_internal_primitive!(Option<RcStr>);
__turbo_tasks_internal_primitive!(Vec<RcStr>, manual_shrink_to_fit);
__turbo_tasks_internal_primitive!(Option<u16>);
__turbo_tasks_internal_primitive!(Option<u64>);
__turbo_tasks_internal_primitive!(bool);
__turbo_tasks_internal_primitive!(Option<bool>);
__turbo_tasks_internal_primitive!(u8);
__turbo_tasks_internal_primitive!(u16);
__turbo_tasks_internal_primitive!(u32);
__turbo_tasks_internal_primitive!(u64);
__turbo_tasks_internal_primitive!(u128);
__turbo_tasks_internal_primitive!(i8);
__turbo_tasks_internal_primitive!(i16);
__turbo_tasks_internal_primitive!(i32);
__turbo_tasks_internal_primitive!(i64);
__turbo_tasks_internal_primitive!(i128);
__turbo_tasks_internal_primitive!(usize);
__turbo_tasks_internal_primitive!(isize);
__turbo_tasks_internal_primitive!(serde_json::Value);
__turbo_tasks_internal_primitive!(Duration);
__turbo_tasks_internal_primitive!(Vec<u8>, manual_shrink_to_fit);
__turbo_tasks_internal_primitive!(Vec<bool>, manual_shrink_to_fit);
