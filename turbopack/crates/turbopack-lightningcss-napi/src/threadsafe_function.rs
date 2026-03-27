// Fork of threadsafe_function from napi-rs that allows calling JS function manually rather than
// only returning args. This enables us to use the return value of the function.

#![allow(clippy::single_component_path_imports)]

use std::{
    convert::Into,
    ffi::CString,
    marker::PhantomData,
    os::raw::c_void,
    ptr,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicUsize, Ordering},
    },
};

use napi::{Env, JsError, JsFunction, NapiValue, Result, Status, check_status, sys};

/// ThreadSafeFunction Context object
/// the `value` is the value passed to `call` method
pub struct ThreadSafeCallContext<T: 'static> {
    pub env: Env,
    pub value: T,
    pub callback: Option<JsFunction>,
}

#[repr(u8)]
pub enum ThreadsafeFunctionCallMode {
    NonBlocking,
    Blocking,
}

impl From<ThreadsafeFunctionCallMode> for sys::napi_threadsafe_function_call_mode {
    fn from(value: ThreadsafeFunctionCallMode) -> Self {
        match value {
            ThreadsafeFunctionCallMode::Blocking => sys::ThreadsafeFunctionCallMode::blocking,
            ThreadsafeFunctionCallMode::NonBlocking => sys::ThreadsafeFunctionCallMode::nonblocking,
        }
    }
}

/// Communicate with the addon's main thread by invoking a JavaScript function from other threads.
///
/// ## Example
/// An example of using `ThreadsafeFunction`:
///
/// ```rust
/// #[macro_use]
/// extern crate napi_derive;
///
/// use std::thread;
///
/// use napi::{
///     threadsafe_function::{
///         ThreadSafeCallContext, ThreadsafeFunctionCallMode, ThreadsafeFunctionReleaseMode,
///     },
///     CallContext, Error, JsFunction, JsNumber, JsUndefined, Result, Status,
/// };
///
/// #[js_function(1)]
/// pub fn test_threadsafe_function(ctx: CallContext) -> Result<JsUndefined> {
///   let func = ctx.get::<JsFunction>(0)?;
///
///   let tsfn =
///       ctx
///           .env
///           .create_threadsafe_function(&func, 0, |ctx: ThreadSafeCallContext<Vec<u32>>| {
///             ctx.value
///                 .iter()
///                 .map(|v| ctx.env.create_uint32(*v))
///                 .collect::<Result<Vec<JsNumber>>>()
///           })?;
///
///   let tsfn_cloned = tsfn.clone();
///
///   thread::spawn(move || {
///       let output: Vec<u32> = vec![0, 1, 2, 3];
///       // It's okay to call a threadsafe function multiple times.
///       tsfn.call(Ok(output.clone()), ThreadsafeFunctionCallMode::Blocking);
///   });
///
///   thread::spawn(move || {
///       let output: Vec<u32> = vec![3, 2, 1, 0];
///       // It's okay to call a threadsafe function multiple times.
///       tsfn_cloned.call(Ok(output.clone()), ThreadsafeFunctionCallMode::NonBlocking);
///   });
///
///   ctx.env.get_undefined()
/// }
/// ```
pub struct ThreadsafeFunction<T: 'static> {
    raw_tsfn: sys::napi_threadsafe_function,
    aborted: Arc<AtomicBool>,
    ref_count: Arc<AtomicUsize>,
    _phantom: PhantomData<T>,
}

impl<T: 'static> Clone for ThreadsafeFunction<T> {
    fn clone(&self) -> Self {
        if !self.aborted.load(Ordering::Acquire) {
            let acquire_status = unsafe { sys::napi_acquire_threadsafe_function(self.raw_tsfn) };
            debug_assert!(
                acquire_status == sys::Status::napi_ok,
                "Acquire threadsafe function failed in clone"
            );
        }

        Self {
            raw_tsfn: self.raw_tsfn,
            aborted: Arc::clone(&self.aborted),
            ref_count: Arc::clone(&self.ref_count),
            _phantom: PhantomData,
        }
    }
}

unsafe impl<T> Send for ThreadsafeFunction<T> {}
unsafe impl<T> Sync for ThreadsafeFunction<T> {}

impl<T: 'static> ThreadsafeFunction<T> {
    /// See [napi_create_threadsafe_function](https://nodejs.org/api/n-api.html#n_api_napi_create_threadsafe_function)
    /// for more information.
    pub(crate) fn create<R: 'static + Send + FnMut(ThreadSafeCallContext<T>) -> Result<()>>(
        env: sys::napi_env,
        func: sys::napi_value,
        max_queue_size: usize,
        callback: R,
    ) -> Result<Self> {
        let mut async_resource_name = ptr::null_mut();
        let s = "napi_rs_threadsafe_function";
        let len = s.len();
        let s = CString::new(s)?;
        check_status!(unsafe {
            sys::napi_create_string_utf8(env, s.as_ptr(), len, &mut async_resource_name)
        })?;

        let initial_thread_count = 1usize;
        let mut raw_tsfn = ptr::null_mut();
        let ptr = Box::into_raw(Box::new(callback)) as *mut c_void;
        check_status!(unsafe {
            sys::napi_create_threadsafe_function(
                env,
                func,
                ptr::null_mut(),
                async_resource_name,
                max_queue_size,
                initial_thread_count,
                ptr,
                Some(thread_finalize_cb::<T, R>),
                ptr,
                Some(call_js_cb::<T, R>),
                &mut raw_tsfn,
            )
        })?;

        let aborted = Arc::new(AtomicBool::new(false));
        let aborted_ptr = Arc::into_raw(aborted.clone()) as *mut c_void;
        check_status!(unsafe {
            sys::napi_add_env_cleanup_hook(env, Some(cleanup_cb), aborted_ptr)
        })?;

        Ok(ThreadsafeFunction {
            raw_tsfn,
            aborted,
            ref_count: Arc::new(AtomicUsize::new(initial_thread_count)),
            _phantom: PhantomData,
        })
    }
}

impl<T: 'static> ThreadsafeFunction<T> {
    /// See [napi_call_threadsafe_function](https://nodejs.org/api/n-api.html#n_api_napi_call_threadsafe_function)
    /// for more information.
    pub fn call(&self, value: T, mode: ThreadsafeFunctionCallMode) -> Status {
        if self.aborted.load(Ordering::Acquire) {
            return Status::Closing;
        }
        unsafe {
            sys::napi_call_threadsafe_function(
                self.raw_tsfn,
                Box::into_raw(Box::new(value)) as *mut _,
                mode.into(),
            )
        }
        .into()
    }
}

impl<T: 'static> Drop for ThreadsafeFunction<T> {
    fn drop(&mut self) {
        if !self.aborted.load(Ordering::Acquire) && self.ref_count.load(Ordering::Acquire) > 0usize
        {
            let release_status = unsafe {
                sys::napi_release_threadsafe_function(
                    self.raw_tsfn,
                    sys::ThreadsafeFunctionReleaseMode::release,
                )
            };
            assert!(
                release_status == sys::Status::napi_ok,
                "Threadsafe Function release failed"
            );
        }
    }
}

unsafe extern "C" fn cleanup_cb(cleanup_data: *mut c_void) {
    let aborted = Arc::<AtomicBool>::from_raw(cleanup_data.cast());
    aborted.store(true, Ordering::SeqCst);
}

unsafe extern "C" fn thread_finalize_cb<T: 'static, R>(
    _raw_env: sys::napi_env,
    finalize_data: *mut c_void,
    _finalize_hint: *mut c_void,
) where
    R: 'static + Send + FnMut(ThreadSafeCallContext<T>) -> Result<()>,
{
    // cleanup
    drop(Box::<R>::from_raw(finalize_data.cast()));
}

unsafe extern "C" fn call_js_cb<T: 'static, R>(
    raw_env: sys::napi_env,
    js_callback: sys::napi_value,
    context: *mut c_void,
    data: *mut c_void,
) where
    R: 'static + Send + FnMut(ThreadSafeCallContext<T>) -> Result<()>,
{
    // env and/or callback can be null when shutting down
    if raw_env.is_null() {
        return;
    }

    let ctx: &mut R = &mut *context.cast::<R>();
    let val: Result<T> = Ok(*Box::<T>::from_raw(data.cast()));

    let mut recv = ptr::null_mut();
    sys::napi_get_undefined(raw_env, &mut recv);

    let ret = val.and_then(|v| {
        (ctx)(ThreadSafeCallContext {
            env: Env::from_raw(raw_env),
            value: v,
            callback: if js_callback.is_null() {
                None
            } else {
                Some(JsFunction::from_raw(raw_env, js_callback).unwrap()) // TODO: unwrap
            },
        })
    });

    let status = match ret {
        Ok(()) => sys::Status::napi_ok,
        Err(e) => sys::napi_fatal_exception(raw_env, JsError::from(e).into_value(raw_env)),
    };
    if status == sys::Status::napi_ok {
        return;
    }
    if status == sys::Status::napi_pending_exception {
        let mut error_result = ptr::null_mut();
        assert_eq!(
            sys::napi_get_and_clear_last_exception(raw_env, &mut error_result),
            sys::Status::napi_ok
        );

        // When shutting down, napi_fatal_exception sometimes returns another exception
        let stat = sys::napi_fatal_exception(raw_env, error_result);
        assert!(stat == sys::Status::napi_ok || stat == sys::Status::napi_pending_exception);
    } else {
        let error_code: Status = status.into();
        let error_code_string = format!("{:?}", error_code);
        let mut error_code_value = ptr::null_mut();
        assert_eq!(
            sys::napi_create_string_utf8(
                raw_env,
                error_code_string.as_ptr() as *const _,
                error_code_string.len(),
                &mut error_code_value,
            ),
            sys::Status::napi_ok,
        );
        let error_msg = "Call JavaScript callback failed in thread safe function";
        let mut error_msg_value = ptr::null_mut();
        assert_eq!(
            sys::napi_create_string_utf8(
                raw_env,
                error_msg.as_ptr() as *const _,
                error_msg.len(),
                &mut error_msg_value,
            ),
            sys::Status::napi_ok,
        );
        let mut error_value = ptr::null_mut();
        assert_eq!(
            sys::napi_create_error(raw_env, error_code_value, error_msg_value, &mut error_value),
            sys::Status::napi_ok,
        );
        assert_eq!(
            sys::napi_fatal_exception(raw_env, error_value),
            sys::Status::napi_ok
        );
    }
}
