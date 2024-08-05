use once_cell::sync::OnceCell;

use crate::{Log, LogCategory};

static LOG_INSTANCE: OnceCell<Log> = OnceCell::new();

#[doc(hidden)]
pub fn global_log() -> &'static Log {
    LOG_INSTANCE.get_or_init(|| {
        Log::new_with_subsystem_and_category("com.global.Global", LogCategory::PointsOfInterest)
    })
}

#[macro_export]
macro_rules! event {
    ($name:expr) => {
        $crate::global_log().signpost().event($name)
    };
    ($name:expr, $message:expr) => {
        $crate::global_log()
            .signpost()
            .event_with_message($name, $message)
    };
    ($name:expr, $message:expr, $($arg:tt)+) => {
        $crate::global_log()
            .signpost()
            .event_with_message($name, &format!($message, $($arg)+))
    };
}

#[macro_export]
macro_rules! interval {
    ($name:expr) => {
        $crate::global_log().signpost().interval($name)
    };
    ($name:expr, $message:expr) => {
        $crate::global_log()
            .signpost()
            .interval_with_message($name, $message)
    };
    ($name:expr, $message:expr, $($arg:tt)+) => {
        $crate::global_log()
            .signpost()
            .interval_with_message($name, &format!($message, $($arg)+))
    };
}
