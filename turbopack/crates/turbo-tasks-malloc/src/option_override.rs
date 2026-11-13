//! Temporarily overrides process-wide mimalloc options.
//!
//! mimalloc's options are global and read by allocator threads without synchronization, while
//! other threads keep allocating and freeing. mimalloc documents `mi_option_set` as not
//! thread-safe: an option is a plain `long`, so changing one at runtime is formally a data race.
//! It's benign for the options overridden here:
//! - The option value is a naturally aligned `long` (word-sized or smaller), which supported
//!   targets read and write without tearing, so a concurrent reader sees either the old or the new
//!   value.
//! - mimalloc reads them afresh each time it uses them rather than caching them.
//! - They only control when and how much freed memory is returned to the OS. They play no part in
//!   allocation bookkeeping, so either value is correct and there is no memory-safety consequence.
//! - They change rarely: once when the first override starts and once when the last one ends.
//!
//! Not every option is safe to change at runtime: some are read once at startup, or change how
//! memory is allocated (e.g. `allow_thp`, which also decides whether to use transparent huge
//! pages). Check how mimalloc reads an option before overriding it here.

use std::{os::raw::c_long, sync::Mutex};

use mimalloc::sys::mi_option_t;

/// A scoped override of one mimalloc option, started with [`Self::enter`]. Overrides can overlap
/// (also across threads): the option keeps the override value until the last one ends, which
/// restores the value from before the first one started.
pub(crate) struct OptionOverride {
    option: mi_option_t,
    value: c_long,
    /// Whether to override, given the option's value when the first override starts. This leaves
    /// values alone that already have the desired effect or that the user chose deliberately.
    applies: fn(c_long) -> bool,
    /// `None` while no override is active.
    state: Mutex<Option<ActiveOverride>>,
}

struct ActiveOverride {
    /// Number of active overrides minus one.
    additional_active: usize,
    /// The option's value when the first override started.
    previous: c_long,
}

impl OptionOverride {
    pub(crate) const fn new(
        option: mi_option_t,
        value: c_long,
        applies: fn(c_long) -> bool,
    ) -> Self {
        Self {
            option,
            value,
            applies,
            state: Mutex::new(None),
        }
    }

    pub(crate) fn get(&self) -> c_long {
        mimalloc::option_get(self.option)
    }

    fn set(&self, value: c_long) {
        // Allocator threads read the option concurrently, see the module docs for why that's
        // benign.
        mimalloc::option_set(self.option, value)
    }

    /// Starts an override, which lasts until the returned guard is dropped (also while unwinding).
    pub(crate) fn enter(&'static self) -> OptionOverrideGuard {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        match &mut *state {
            Some(active) => active.additional_active += 1,
            None => {
                let previous = self.get();
                if (self.applies)(previous) {
                    self.set(self.value);
                }
                *state = Some(ActiveOverride {
                    additional_active: 0,
                    previous,
                });
            }
        }
        OptionOverrideGuard { option: self }
    }

    /// Ends an override started by [`Self::enter`].
    fn exit(&self) {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        let Some(active) = &mut *state else {
            unreachable!("exit without a matching enter");
        };
        if active.additional_active > 0 {
            active.additional_active -= 1;
        } else {
            let previous = active.previous;
            *state = None;
            if (self.applies)(previous) {
                self.set(previous);
            }
        }
    }
}

/// Ends an override of a mimalloc option when dropped. Returned by [`OptionOverride::enter`].
#[must_use = "the override ends when the guard is dropped"]
pub(crate) struct OptionOverrideGuard {
    option: &'static OptionOverride,
}

impl Drop for OptionOverrideGuard {
    fn drop(&mut self) {
        self.option.exit();
    }
}
