use std::{
    ffi::{CStr, CString},
    ptr::{addr_of, null},
};

use signposter_sys::*;

pub enum LogCategory {
    /// Signposts provide high-level events that can be used to orient a
    /// developer looking at performance data. These will be displayed by
    /// default by performance tools like Instruments.app.
    PointsOfInterest,
    /// Signposts should be disabled by default, reducing the runtime overhead.
    /// [`Log::signpost_enabled`] calls will only return 'true' when a
    /// performance tool like Instruments.app is recording.
    DynamicTracing,
    /// Signposts should capture user backtraces. This behavior is more
    /// expensive, so [`Log::signpost_enabled`] will only return 'true' when
    /// a performance tool like Instruments.app is recording.
    DynamicStackTracing,
}

impl LogCategory {
    fn as_c_str(&self) -> &CStr {
        match self {
            LogCategory::PointsOfInterest => {
                CStr::from_bytes_with_nul(b"PointsOfInterest\0").unwrap()
            }
            LogCategory::DynamicTracing => CStr::from_bytes_with_nul(b"DynamicTracing\0").unwrap(),
            LogCategory::DynamicStackTracing => {
                CStr::from_bytes_with_nul(b"DynamicStackTracing\0").unwrap()
            }
        }
    }
}

/// A log is a collection of signposts.
#[derive(Debug, Clone, Copy)]
pub struct Log {
    os_log: *mut os_log_s,
}

// Safety: unclear
unsafe impl Sync for Log {}

// Safety: unclear
unsafe impl Send for Log {}

impl Default for Log {
    fn default() -> Self {
        Log {
            os_log: unsafe { addr_of!(_os_log_default) as *const _ as *mut _ },
        }
    }
}

impl Log {
    /// Create a new log with the given subsystem and category.
    pub fn new_with_subsystem_and_category(subsystem: &str, category: LogCategory) -> Self {
        let subsystem = CString::new(subsystem).unwrap();
        let category = category.as_c_str();
        let os_log = unsafe { os_log_create(subsystem.as_ptr(), category.as_ptr()) };
        Log { os_log }
    }

    /// Create a new [`Signpost`] for this log.
    pub fn signpost(&self) -> Signpost {
        let id = unsafe { os_signpost_id_generate(self.os_log) };
        Signpost {
            id,
            log: self.os_log,
        }
    }
}

/// A signpost is a marker that can be used to annotate a log with
/// information about the execution of a program.
#[derive(Debug, Clone, Copy)]
pub struct Signpost {
    id: os_signpost_id_t,
    log: *mut os_log_s,
}

// Safety: unclear
unsafe impl Sync for Signpost {}

// Safety: unclear
unsafe impl Send for Signpost {}

// NOTE(alexkirsz) Not sure that's correct, but it's what the Dart SDK does and
// it seems to work.
// See https://github.com/dart-lang/sdk/blob/3e2d3bc77fa8bb5139b869e9b3a5357b5487df18/runtime/vm/timeline_macos.cc#L34-L35
const FORMAT_BUFFER_LEN: usize = 64;
static FORMAT_BUFFER: [u8; 64] = [0; FORMAT_BUFFER_LEN];

#[repr(u8)]
enum SignpostType {
    Event = os_signpost_type_t_OS_SIGNPOST_EVENT,
    IntervalBegin = os_signpost_type_t_OS_SIGNPOST_INTERVAL_BEGIN,
    IntervalEnd = os_signpost_type_t_OS_SIGNPOST_INTERVAL_END,
}

impl Signpost {
    /// Emits a signpost event with the given name.
    pub fn event(&self, name: &str) {
        let name = CString::new(name).unwrap();
        self.emit(name.as_c_str(), None, SignpostType::Event)
    }

    /// Emits a signpost event with the given name and message.
    pub fn event_with_message(&self, name: &str, message: &str) {
        let name = CString::new(name).unwrap();
        let message = CString::new(escape_message(message)).unwrap();
        self.emit(
            name.as_c_str(),
            Some(message.as_c_str()),
            SignpostType::Event,
        )
    }

    /// Starts a new interval signpost with the given name.
    pub fn interval(&self, name: &str) -> SignpostInterval {
        let name = CString::new(name).unwrap();

        self.emit(name.as_c_str(), None, SignpostType::IntervalBegin);

        SignpostInterval {
            signpost: *self,
            name,
        }
    }

    /// Starts a new interval signpost with the given name and message.
    pub fn interval_with_message(&self, name: &str, message: &str) -> SignpostInterval {
        let name = CString::new(name).unwrap();
        let message = CString::new(escape_message(message)).unwrap();

        self.emit(
            name.as_c_str(),
            Some(message.as_c_str()),
            SignpostType::IntervalBegin,
        );

        SignpostInterval {
            signpost: *self,
            name,
        }
    }

    fn emit(&self, name: &CStr, message: Option<&CStr>, signpost_type: SignpostType) {
        unsafe {
            _os_signpost_emit_with_name_impl(
                addr_of!(__dso_handle) as *const _ as *mut _,
                self.log,
                signpost_type as _,
                self.id,
                name.as_ptr(),
                message.map(|message| message.as_ptr()).unwrap_or(null()),
                &FORMAT_BUFFER as *const _ as *mut _,
                FORMAT_BUFFER_LEN as _,
            )
        }
    }
}

/// A signpost interval.
pub struct SignpostInterval {
    signpost: Signpost,
    name: CString,
}

impl SignpostInterval {
    /// Ends the interval signpost. Calling this is equivalent to dropping the
    /// interval.
    pub fn end(self) {}

    /// Ends the interval signpost with the given message.
    pub fn end_with_message(self, message: &str) {
        let message = CString::new(escape_message(message)).unwrap();

        self.signpost.emit(
            self.name.as_c_str(),
            Some(message.as_c_str()),
            SignpostType::IntervalEnd,
        )
    }
}

impl Drop for SignpostInterval {
    fn drop(&mut self) {
        self.signpost
            .emit(self.name.as_c_str(), None, SignpostType::IntervalEnd);
    }
}

// TODO(alexkirsz) This should likely return a Cow<str> instead.
/// Escapes a message for use with signposts, which will try to parse it as a
/// format string.
fn escape_message(message: &str) -> String {
    message.replace('%', "%%")
}
