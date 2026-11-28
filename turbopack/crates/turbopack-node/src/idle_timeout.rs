//! Stops Node.js processes and workers that stay idle for too long.

use std::{
    sync::{Arc, Weak},
    time::Duration,
};

use bincode::{Decode, Encode};
use tokio::{
    select,
    sync::Notify,
    time::{Instant, sleep_until},
};
use turbo_tasks::NonLocalValue;

/// Settings for the lifetime of the idle processes or workers of a Node.js pool.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, NonLocalValue, Encode, Decode)]
pub struct NodePoolOptions {
    /// How long a process or worker may stay idle before it is stopped.
    pub idle_timeout: Duration,
    /// The number of idle processes or workers a pool keeps regardless of `idle_timeout`.
    pub min_idle: usize,
}

/// The idle processes or workers of a pool.
pub(crate) trait IdleQueue: Send + Sync + 'static {
    type Item: Send + 'static;

    /// Removes every idle item that has been idle for longer than `options.idle_timeout`, except
    /// for the `options.min_idle` ones that the pool keeps.
    ///
    /// Returns `None` once the pool is closed: nothing will become idle anymore. Otherwise returns
    /// the removed items, and when the next of the kept items expires, if any can expire without
    /// anything else becoming idle first.
    fn expire_idle(
        &self,
        options: &NodePoolOptions,
        now: Instant,
    ) -> Option<(Vec<Self::Item>, Option<Instant>)>;

    /// Notified (with [`Notify::notify_waiters`]) whenever something becomes idle, and when the
    /// pool is closed.
    fn idle_changed(&self) -> &Arc<Notify>;
}

/// Starts a task that calls [`IdleQueue::expire_idle`] whenever an idle item of `queue` may have
/// expired, and passes the expired items to `on_expired`, which must stop them.
///
/// The task only holds a [`Weak`] reference to `queue` while it waits, so it doesn't keep the pool
/// alive. It ends once the pool is closed or dropped.
pub(crate) fn spawn_idle_reaper<Q: IdleQueue>(
    queue: &Arc<Q>,
    options: NodePoolOptions,
    on_expired: impl Fn(Vec<Q::Item>) + Send + 'static,
) {
    let notify = queue.idle_changed().clone();
    let queue = Arc::downgrade(queue);
    tokio::spawn(idle_reaper(queue, notify, options, on_expired));
}

async fn idle_reaper<Q: IdleQueue>(
    queue: Weak<Q>,
    notify: Arc<Notify>,
    options: NodePoolOptions,
    on_expired: impl Fn(Vec<Q::Item>),
) {
    loop {
        // Register for notifications before checking the queue, so that nothing that becomes
        // idle in between is missed.
        let notified = notify.notified();
        let Some((expired, next_expiry)) = queue
            .upgrade()
            .and_then(|queue| queue.expire_idle(&options, Instant::now()))
        else {
            return;
        };
        if !expired.is_empty() {
            on_expired(expired);
        }
        match next_expiry {
            Some(next_expiry) => {
                select! {
                    _ = sleep_until(next_expiry) => {}
                    _ = notified => {}
                }
            }
            None => notified.await,
        }
    }
}

/// Splits `items`, sorted from the least to the most valuable to keep, into the ones that have
/// expired and the ones to keep, both still sorted. The `min_idle` most valuable items are always
/// kept.
///
/// Returns the expired items, the kept items, and the next expiry among the kept items that may
/// expire.
#[allow(clippy::type_complexity)]
pub(crate) fn split_expired<T>(
    items: Vec<(T, Instant)>,
    options: &NodePoolOptions,
    now: Instant,
) -> (Vec<(T, Instant)>, Vec<(T, Instant)>, Option<Instant>) {
    let may_expire = items.len().saturating_sub(options.min_idle);
    let mut expired = Vec::new();
    let mut kept = Vec::with_capacity(items.len());
    let mut next_expiry: Option<Instant> = None;
    for (index, (item, idle_since)) in items.into_iter().enumerate() {
        if index < may_expire {
            let expiry = idle_since + options.idle_timeout;
            if expiry <= now {
                expired.push((item, idle_since));
                continue;
            }
            next_expiry = Some(next_expiry.map_or(expiry, |next| next.min(expiry)));
        }
        kept.push((item, idle_since));
    }
    (expired, kept, next_expiry)
}

#[cfg(test)]
mod tests {
    use super::*;

    const OPTIONS: NodePoolOptions = NodePoolOptions {
        idle_timeout: Duration::from_secs(1),
        min_idle: 1,
    };

    #[test]
    fn keeps_min_idle_most_valuable_items() {
        let start = Instant::now();
        let now = start + Duration::from_secs(10);
        let items = vec![("a", start), ("b", start), ("c", start)];
        let (expired, kept, next_expiry) = split_expired(items, &OPTIONS, now);
        assert_eq!(expired, vec![("a", start), ("b", start)]);
        assert_eq!(kept, vec![("c", start)]);
        assert_eq!(next_expiry, None);
    }

    #[test]
    fn keeps_items_that_are_not_expired_yet() {
        let start = Instant::now();
        let now = start + Duration::from_millis(1500);
        let recent = start + Duration::from_millis(1000);
        let items = vec![("old", start), ("recent", recent), ("best", start)];
        let (expired, kept, next_expiry) = split_expired(items, &OPTIONS, now);
        assert_eq!(expired, vec![("old", start)]);
        assert_eq!(kept, vec![("recent", recent), ("best", start)]);
        assert_eq!(next_expiry, Some(recent + OPTIONS.idle_timeout));
    }

    #[test]
    fn min_idle_zero_expires_everything() {
        let start = Instant::now();
        let options = NodePoolOptions {
            min_idle: 0,
            ..OPTIONS
        };
        let items = vec![("a", start), ("b", start)];
        let (expired, kept, next_expiry) =
            split_expired(items, &options, start + Duration::from_secs(1));
        assert_eq!(expired, vec![("a", start), ("b", start)]);
        assert!(kept.is_empty());
        assert_eq!(next_expiry, None);
    }
}
