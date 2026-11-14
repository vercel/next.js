//! [`CachedTaskType`]: the identity of a cached task, its function, `this` and argument, stored in
//! a single allocation behind the thin [`CachedTaskTypeArc`] pointer.
//!
//! Every persistent task keeps its task type alive (in its storage and the task cache), and every
//! task cache lookup hashes and compares task types, so their layout is hot. Instead of an `Arc`
//! pointing at a struct that points at a separately boxed argument, the argument is stored inline
//! after the header:
//!
//! ```text
//! CachedTaskTypeArc ──► [ count | arg metadata | native_fn | this | arg ... ]
//! ```
//!
//! The pointer stays one word (task storage and the task cache hold millions of them), and the
//! vtable of the argument, needed to use it as a `dyn DynTaskInputs`, is kept in the header.

use std::{
    alloc::{self, Layout},
    fmt::{self, Debug, Display},
    hash::{BuildHasher, Hash},
    marker::PhantomData,
    ops::Deref,
    ptr::{self, DynMetadata, NonNull},
    sync::atomic::{self, AtomicUsize, Ordering},
};

use bincode::{
    Decode, Encode,
    error::{DecodeError, EncodeError},
};
use turbo_bincode::{
    TurboBincodeDecode, TurboBincodeDecoder, TurboBincodeEncode, TurboBincodeEncoder,
    impl_decode_for_turbo_bincode_decode, impl_encode_for_turbo_bincode_encode, new_hash_encoder,
};
use turbo_tasks_hash::DeterministicHasher;

use crate::{RawVc, dyn_task_inputs::DynTaskInputs, macro_helpers::NativeFunction, registry};

/// A normal task execution containing a native (rust) function. This type is passed into the
/// backend either to execute a function or to look up a cached result.
///
/// Only exists inside a [`CachedTaskTypeArc`] allocation (the header fields are private), so it is
/// always used as `&CachedTaskType`, a reference that covers the argument too.
#[repr(C)]
pub struct CachedTaskType<A: ?Sized = dyn DynTaskInputs> {
    /// Reference count of the [`CachedTaskTypeArc`]s pointing at this allocation.
    count: AtomicUsize,
    /// Metadata (vtable) of `arg` as a `dyn DynTaskInputs`, which lets the thin
    /// [`CachedTaskTypeArc`] rebuild a reference to the whole, dynamically sized value.
    arg_metadata: DynMetadata<dyn DynTaskInputs>,
    pub native_fn: &'static NativeFunction,
    pub this: Option<RawVc>,
    pub arg: A,
}

/// The fixed-size prefix of every [`CachedTaskType`]. `#[repr(C)]` with the same leading fields,
/// so it describes the layout of the header for any argument type.
#[repr(C)]
struct Header {
    count: AtomicUsize,
    arg_metadata: DynMetadata<dyn DynTaskInputs>,
    native_fn: &'static NativeFunction,
    this: Option<RawVc>,
}

impl CachedTaskType {
    /// Get the name of the function. Equivalent to the
    /// [`Display`]/[`ToString::to_string`] implementation, but does not allocate a [`String`].
    pub fn get_name(&self) -> &'static str {
        self.native_fn.ty.name
    }

    /// Encodes this task type directly to a hasher, avoiding buffer allocation.
    ///
    /// This uses the same encoding logic as [`TurboBincodeEncode`] but writes
    /// directly to a [`DeterministicHasher`] instead of a buffer.
    pub fn hash_encode<H: DeterministicHasher>(&self, hasher: &mut H) {
        Self::hash_encode_components(self.native_fn, self.this, &self.arg, hasher);
    }

    /// Compute the hash of a task type from its individual components, matching the Hash impl.
    /// This avoids constructing a full CachedTaskType just to compute the hash.
    pub fn hash_from_components(
        hasher: &impl BuildHasher,
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: &dyn DynTaskInputs,
    ) -> u64 {
        use std::hash::Hasher;
        let mut state = hasher.build_hasher();
        native_fn.hash(&mut state);
        this.hash(&mut state);
        arg.hash(&mut state);
        state.finish()
    }

    /// Compute the deterministic hash for backing storage from components.
    ///
    /// This mirrors the logic in [`CachedTaskType::hash_encode`] but works with
    /// borrowed components, avoiding the need to construct a full [`CachedTaskType`].
    pub fn hash_encode_components<H: DeterministicHasher>(
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: &dyn DynTaskInputs,
        hasher: &mut H,
    ) {
        let fn_id = registry::get_function_id(native_fn);
        {
            let mut encoder = new_hash_encoder(hasher);
            Encode::encode(&fn_id, &mut encoder).expect("fn_id encoding should not fail");
            Encode::encode(&this, &mut encoder).expect("this encoding should not fail");
        }
        (native_fn.arg_meta.hash_encode)(arg, hasher);
    }

    /// Check equality of components against this CachedTaskType.
    pub fn eq_components(
        &self,
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: &dyn DynTaskInputs,
    ) -> bool {
        std::ptr::eq(self.native_fn, native_fn) && self.this == this && self.arg == *arg
    }
}

impl PartialEq for CachedTaskType {
    fn eq(&self, other: &Self) -> bool {
        self.native_fn == other.native_fn && self.this == other.this && self.arg == other.arg
    }
}

impl Eq for CachedTaskType {}

impl Hash for CachedTaskType {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        self.native_fn.hash(state);
        self.this.hash(state);
        self.arg.hash(state);
    }
}

impl Debug for CachedTaskType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("CachedTaskType")
            .field("native_fn", &self.native_fn)
            .field("this", &self.this)
            .field("arg", &&self.arg)
            .finish()
    }
}

impl Display for CachedTaskType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.get_name())
    }
}

/// A reference-counted, one-word pointer to a [`CachedTaskType`], which it owns together with its
/// argument in a single allocation (see the module docs).
///
/// Like `triomphe::Arc` it has no weak count. Equality and hashing are by value, so it can key
/// the task cache.
pub struct CachedTaskTypeArc {
    ptr: NonNull<Header>,
    _owns: PhantomData<CachedTaskType>,
}

// SAFETY: the pointee is only accessed through shared references and an atomic reference count,
// and its argument is `Send + Sync` (a `DynTaskInputs` bound).
unsafe impl Send for CachedTaskTypeArc {}
// SAFETY: see above.
unsafe impl Sync for CachedTaskTypeArc {}

impl CachedTaskTypeArc {
    /// Allocates a task type holding `arg`.
    pub fn new<T: DynTaskInputs>(
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: T,
    ) -> Self {
        let arg_metadata = ptr::metadata(ptr::null::<T>() as *const dyn DynTaskInputs);
        let value = Box::new(CachedTaskType {
            count: AtomicUsize::new(1),
            arg_metadata,
            native_fn,
            this,
            arg,
        });
        // `CachedTaskType<T>` starts with the fields of `Header` (both are `#[repr(C)]`).
        Self {
            ptr: NonNull::from(Box::leak(value)).cast::<Header>(),
            _owns: PhantomData,
        }
    }

    /// Allocates a task type holding an already boxed `arg`, moving the argument out of its box.
    pub fn new_boxed(
        native_fn: &'static NativeFunction,
        this: Option<RawVc>,
        arg: Box<dyn DynTaskInputs>,
    ) -> Self {
        let arg = Box::into_raw(arg);
        let arg_metadata = ptr::metadata(arg);
        let arg_layout = Layout::from_size_align(arg_metadata.size_of(), arg_metadata.align_of())
            .expect("the argument's layout comes from a live value");
        // The layout `#[repr(C)]` gives `CachedTaskType<T>` for the argument's type.
        let (layout, arg_offset) = Layout::new::<Header>()
            .extend(arg_layout)
            .expect("task type layout overflow");
        let layout = layout.pad_to_align();
        // SAFETY: `layout` has a non-zero size (the header).
        let base = unsafe { alloc::alloc(layout) };
        let Some(base) = NonNull::new(base) else {
            alloc::handle_alloc_error(layout)
        };
        let header = base.cast::<Header>();
        // SAFETY: `base` is a fresh allocation of `layout`, which holds a `Header` at offset 0 and
        // `arg_layout.size()` bytes at `arg_offset`. Moving a value is a byte copy, after which the
        // box's allocation is freed without dropping the value (now owned by the new allocation).
        // A zero-sized argument's box did not allocate.
        unsafe {
            header.write(Header {
                count: AtomicUsize::new(1),
                arg_metadata,
                native_fn,
                this,
            });
            ptr::copy_nonoverlapping(
                arg.cast::<u8>(),
                base.as_ptr().add(arg_offset),
                arg_layout.size(),
            );
            if arg_layout.size() != 0 {
                alloc::dealloc(arg.cast::<u8>(), arg_layout);
            }
        }
        Self {
            ptr: header,
            _owns: PhantomData,
        }
    }

    fn header(&self) -> &Header {
        // SAFETY: the allocation stays alive while `self` holds a reference, and starts with a
        // `Header`.
        unsafe { self.ptr.as_ref() }
    }

    /// A pointer to the whole, dynamically sized `CachedTaskType`, with the provenance of the
    /// allocation.
    fn as_ptr(&self) -> *mut CachedTaskType {
        ptr::from_raw_parts_mut(self.ptr.as_ptr(), self.header().arg_metadata)
    }

    pub fn count(&self) -> usize {
        self.header().count.load(Ordering::Relaxed)
    }

    pub fn ptr_eq(a: &Self, b: &Self) -> bool {
        a.ptr == b.ptr
    }
}

impl Clone for CachedTaskTypeArc {
    fn clone(&self) -> Self {
        // Relaxed is enough, like `Arc::clone`: a new reference can only be created from an
        // existing one, which keeps the allocation alive.
        let old = self.header().count.fetch_add(1, Ordering::Relaxed);
        if old > isize::MAX as usize {
            std::process::abort();
        }
        Self {
            ptr: self.ptr,
            _owns: PhantomData,
        }
    }
}

impl Drop for CachedTaskTypeArc {
    fn drop(&mut self) {
        // Release/Acquire like `Arc::drop`, so every use of the value happens before it is freed.
        if self.header().count.fetch_sub(1, Ordering::Release) != 1 {
            return;
        }
        atomic::fence(Ordering::Acquire);
        // SAFETY: this was the last reference. The allocation has the layout of the dynamically
        // sized `CachedTaskType` (allocated by `Box` or with that layout), so `Box` can drop the
        // argument through its vtable and free it.
        drop(unsafe { Box::from_raw(self.as_ptr()) });
    }
}

impl Deref for CachedTaskTypeArc {
    type Target = CachedTaskType;

    #[inline]
    fn deref(&self) -> &CachedTaskType {
        // SAFETY: the allocation is alive while `self` exists and is only mutated through the
        // atomic count.
        unsafe { &*self.as_ptr() }
    }
}

impl AsRef<CachedTaskType> for CachedTaskTypeArc {
    fn as_ref(&self) -> &CachedTaskType {
        self
    }
}

impl std::borrow::Borrow<CachedTaskType> for CachedTaskTypeArc {
    #[inline]
    fn borrow(&self) -> &CachedTaskType {
        self
    }
}

impl PartialEq for CachedTaskTypeArc {
    fn eq(&self, other: &Self) -> bool {
        Self::ptr_eq(self, other) || **self == **other
    }
}

impl Eq for CachedTaskTypeArc {}

impl Hash for CachedTaskTypeArc {
    fn hash<H: std::hash::Hasher>(&self, state: &mut H) {
        (**self).hash(state);
    }
}

impl Debug for CachedTaskTypeArc {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Debug::fmt(&**self, f)
    }
}

impl Display for CachedTaskTypeArc {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Display::fmt(&**self, f)
    }
}

impl TurboBincodeEncode for CachedTaskTypeArc {
    fn encode(&self, encoder: &mut TurboBincodeEncoder) -> Result<(), EncodeError> {
        Encode::encode(&registry::get_function_id(self.native_fn), encoder)?;

        let (encode_arg_any, _) = self.native_fn.arg_meta.bincode;
        Encode::encode(&self.this, encoder)?;
        encode_arg_any(&self.arg, encoder)?;

        Ok(())
    }
}

impl<Context> TurboBincodeDecode<Context> for CachedTaskTypeArc {
    fn decode(decoder: &mut TurboBincodeDecoder) -> Result<Self, DecodeError> {
        let native_fn = registry::get_native_function(Decode::decode(decoder)?);
        let (_, decode_arg_any) = native_fn.arg_meta.bincode;
        let this = Decode::decode(decoder)?;
        let arg = decode_arg_any(decoder)?;
        Ok(Self::new_boxed(native_fn, this, arg))
    }
}

impl_encode_for_turbo_bincode_encode!(CachedTaskTypeArc);
impl_decode_for_turbo_bincode_decode!(CachedTaskTypeArc);
bincode::impl_borrow_decode!(CachedTaskTypeArc);

#[cfg(test)]
mod tests {
    use std::{
        collections::hash_map::RandomState,
        hash::BuildHasher,
        sync::atomic::{AtomicUsize, Ordering},
    };

    use super::CachedTaskTypeArc;
    use crate::{
        RawVc, TaskId,
        dyn_task_inputs::DynTaskInputs,
        macro_helpers::{ArgMeta, NativeFunction, into_task_fn},
    };

    fn dummy_fn() {}

    // The argument types below differ from the declared `ArgMeta`, which is only used to encode
    // and hash-encode arguments; these tests do neither.
    static FN: NativeFunction = NativeFunction::new(
        "dummy_fn",
        "dummy_fn",
        ArgMeta::new::<(i32,)>(),
        &into_task_fn(dummy_fn),
        false,
        false,
    );

    fn this() -> Option<RawVc> {
        Some(RawVc::task_output(TaskId::new(1).unwrap()))
    }

    #[test]
    fn typed_and_boxed_are_equal() {
        let typed = CachedTaskTypeArc::new(&FN, this(), (7i32, String::from("seven")));
        let boxed = CachedTaskTypeArc::new_boxed(
            &FN,
            this(),
            Box::new((7i32, String::from("seven"))) as Box<dyn DynTaskInputs>,
        );
        assert_eq!(typed, boxed);
        assert!(!CachedTaskTypeArc::ptr_eq(&typed, &boxed));
        let rs = RandomState::new();
        assert_eq!(rs.hash_one(&typed), rs.hash_one(&boxed));
        assert!(std::ptr::eq(typed.native_fn, &FN));
        assert_eq!(typed.this, this());
        assert!(boxed.eq_components(&FN, this(), &(7i32, String::from("seven"))));
        assert!(!boxed.eq_components(&FN, None, &(7i32, String::from("seven"))));
        assert!(!boxed.eq_components(&FN, this(), &(8i32, String::from("seven"))));
    }

    #[test]
    fn zero_sized_arguments() {
        let typed = CachedTaskTypeArc::new(&FN, None, ());
        let boxed = CachedTaskTypeArc::new_boxed(&FN, None, Box::new(()));
        assert_eq!(typed, boxed);
        assert_eq!(size_of_val(&boxed.arg), 0);
    }

    #[derive(Debug, PartialEq, Eq, Hash)]
    #[repr(align(64))]
    struct OverAligned([u8; 64]);

    #[test]
    fn over_aligned_arguments() {
        for task in [
            CachedTaskTypeArc::new(&FN, this(), OverAligned([3; 64])),
            CachedTaskTypeArc::new_boxed(&FN, this(), Box::new(OverAligned([3; 64]))),
        ] {
            let arg: *const dyn DynTaskInputs = &task.arg;
            assert_eq!(arg.cast::<u8>().addr() % 64, 0);
            assert!(task.eq_components(&FN, this(), &OverAligned([3; 64])));
        }
    }

    static DROPS: AtomicUsize = AtomicUsize::new(0);

    #[derive(Debug, PartialEq, Eq, Hash)]
    struct CountsDrops(Vec<u32>);

    impl Drop for CountsDrops {
        fn drop(&mut self) {
            DROPS.fetch_add(1, Ordering::SeqCst);
        }
    }

    #[test]
    fn drops_the_argument_once_after_the_last_reference() {
        DROPS.store(0, Ordering::SeqCst);
        for task in [
            CachedTaskTypeArc::new(&FN, None, CountsDrops(vec![1, 2, 3])),
            CachedTaskTypeArc::new_boxed(&FN, None, Box::new(CountsDrops(vec![1, 2, 3]))),
        ] {
            let clone = task.clone();
            assert_eq!(task.count(), 2);
            drop(task);
            assert_eq!(clone.count(), 1);
            let before = DROPS.load(Ordering::SeqCst);
            drop(clone);
            assert_eq!(DROPS.load(Ordering::SeqCst), before + 1);
        }
        assert_eq!(DROPS.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn clones_across_threads() {
        let task = CachedTaskTypeArc::new(&FN, this(), (1u64, String::from("x")));
        std::thread::scope(|scope| {
            for _ in 0..4 {
                let task = task.clone();
                scope.spawn(move || {
                    for _ in 0..10 {
                        let clone = task.clone();
                        assert!(clone.eq_components(&FN, this(), &(1u64, String::from("x"))));
                    }
                });
            }
        });
        assert_eq!(task.count(), 1);
    }
}
