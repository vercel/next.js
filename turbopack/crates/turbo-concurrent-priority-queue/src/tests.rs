use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU32, AtomicU64},
    },
    time::Duration,
};

use super::*;

// The tests use plain `u32` priorities: a larger value is a higher priority and its own rank.

type Queue<T> = ConcurrentPriorityQueue<u32, T>;

/// Runs `f` with this thread's shard forced to `index`, restoring the previous shard after.
fn on_shard<R>(index: usize, f: impl FnOnce() -> R) -> R {
    let previous = thread_shard();
    set_thread_shard(index);
    let result = f();
    set_thread_shard(previous);
    result
}

fn state<T>(q: &Queue<T>) -> u64 {
    q.state.load(Ordering::Acquire)
}

fn shard_len<T>(q: &Queue<T>, index: usize) -> usize {
    q.shards[index]
        .shard
        .lock()
        .buckets
        .values()
        .map(Vec::len)
        .sum()
}

fn all_shards_empty<T>(q: &Queue<T>) -> bool {
    q.shards.iter().all(|slot| slot.shard.lock().is_empty())
}

/// The published top rank of every shard matches its contents.
fn assert_tops_match<T>(q: &Queue<T>) {
    for (index, slot) in q.shards.iter().enumerate() {
        let shard = slot.shard.lock();
        assert_eq!(
            slot.top.load(Ordering::Acquire),
            shard.published_top(),
            "published top of shard {index}"
        );
    }
}

fn drain<T>(q: &Queue<T>) -> Vec<T> {
    std::iter::from_fn(|| q.pop().map(|(_, item)| item)).collect()
}

/// Drives a search that was started by hand (state set to `SEARCHING`) to its end, like the search
/// lock holder does.
fn run_search<T>(q: &Queue<T>) {
    let _search = q.search_lock.lock();
    q.finish_search(q.scan_tops());
    assert!(!is_searching(state(q)));
}

/// From a single thread, priorities pop highest first; within a priority a single shard is LIFO.
#[test]
fn pops_in_exact_priority_order() {
    let q: Queue<&str> = Queue::new();
    assert!(q.is_empty());
    for (priority, item) in [
        (0, "low-a"),
        (3, "p3"),
        (9, "p9-a"),
        (0, "low-b"),
        (7, "p7"),
        (5, "p5"),
        (9, "p9-b"),
    ] {
        q.push(priority, item);
    }
    assert!(!q.is_empty());
    assert_eq!(
        drain(&q),
        vec!["p9-b", "p9-a", "p7", "p5", "p3", "low-b", "low-a"]
    );
    assert!(q.is_empty());
    assert!(all_shards_empty(&q));
}

#[test]
fn push_many_queues_all_items() {
    let q: Queue<u32> = Queue::new();
    q.push_many(std::iter::empty());
    assert!(q.is_empty());
    q.push_many((0..8).map(|item| (if item % 2 == 0 { 0 } else { item }, item)));
    assert_eq!(drain(&q), vec![7, 5, 3, 1, 6, 4, 2, 0]);
    assert!(q.is_empty());
}

/// Popping the last item of a rank above 0 leaves a stale `highest` (and the emptied shard's bit)
/// in the state word until the next pop clears it and searches; `is_empty` must still report the
/// drained queue as empty.
#[test]
fn is_empty_after_draining_a_higher_rank() {
    let q: Queue<u32> = Queue::new();
    q.push(5, 5);
    assert!(!q.is_empty());
    assert_eq!(q.pop(), Some((5, 5)));
    assert!(q.is_empty());
    assert!(q.pop().is_none());
    assert!(q.is_empty());
}

/// A panicking iterator passed to `push_many` must not leave items in a shard that the state word
/// doesn't know about: every item that was queued stays poppable.
#[test]
fn push_many_panicking_iterator_loses_nothing() {
    let q: Queue<u32> = Queue::new();
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        q.push_many((0..3).map(|i| {
            if i == 1 {
                panic!("iterator panic");
            }
            (7, i)
        }));
    }));
    assert!(result.is_err());
    let popped = drain(&q);
    assert!(
        all_shards_empty(&q),
        "items left in a shard but not poppable (popped {popped:?})"
    );
    assert!(q.is_empty());
}

/// Rank 0 is the lowest rank: draining it empties the queue by clearing the last shard bit,
/// without a search for a new highest priority.
#[test]
fn rank_zero_drain_reaches_empty_without_search() {
    let q: Queue<u32> = Queue::new();
    on_shard(0, || (0..10).for_each(|item| q.push(0, item)));
    on_shard(1, || (10..20).for_each(|item| q.push(0, item)));
    assert_eq!(state(&q), make_state(0, false, shard_bit(0) | shard_bit(1)));
    let mut popped = 0;
    on_shard(2, || {
        while q.pop().is_some() {
            popped += 1;
            assert!(!is_searching(state(&q)));
        }
    });
    assert_eq!(popped, 20);
    assert_eq!(state(&q), 0);
    assert!(all_shards_empty(&q));
}

/// A thread whose shard doesn't have the highest priority steals the newest half of a victim's
/// items at that priority, and the victim keeps the rest.
#[test]
fn steal_moves_half_of_the_highest_priority() {
    let q: Queue<u32> = Queue::new();
    on_shard(0, || {
        (0..10).for_each(|item| q.push(5, item));
        // A lower priority stays behind in the victim.
        q.push(1, 100);
    });
    let (_, item) = on_shard(1, || q.pop()).unwrap();
    // The newest item is popped from the stolen half (5..=9).
    assert_eq!(item, 9);
    assert_eq!(shard_len(&q, 1), 4, "5 stolen, 1 popped");
    assert_eq!(
        shard_len(&q, 0),
        6,
        "5 left at priority 5, plus the lower priority item"
    );
    assert_eq!(state(&q), make_state(5, false, shard_bit(0) | shard_bit(1)));

    // Popping the last items at priority 5 of shard 0 clears its bit.
    on_shard(0, || {
        for expected in [4, 3, 2, 1, 0] {
            assert_eq!(q.pop().unwrap().1, expected);
        }
    });
    assert_eq!(state(&q), make_state(5, false, shard_bit(1)));
    assert_eq!(on_shard(2, || drain(&q)), vec![8, 7, 6, 5, 100]);
    assert_eq!(state(&q), 0);
}

/// Once no shard has the highest priority, a search finds the next one across shards.
#[test]
fn search_finds_next_priority() {
    let q: Queue<u32> = Queue::new();
    on_shard(0, || q.push(3, 3));
    on_shard(1, || q.push(7, 7));
    on_shard(2, || q.push(5, 5));
    // The push of 7 reset the bits to its own shard; 5 is lower than 7 and wrote nothing.
    assert_eq!(state(&q), make_state(7, false, shard_bit(1)));
    assert_eq!(on_shard(3, || drain(&q)), vec![7, 5, 3]);
    assert_eq!(state(&q), 0);
    assert!(all_shards_empty(&q));
}

/// A search that only finds rank-0 items ends with `highest == 0` and exactly the bits of the
/// shards that have them (their published tops), so the items are popped and the queue then reaches
/// the empty state.
#[test]
fn search_with_only_rank_zero_items_sets_their_bits() {
    let q: Queue<u32> = Queue::new();
    on_shard(0, || q.push(0, 0));
    on_shard(1, || q.push(4, 4));
    assert_eq!(on_shard(1, || q.pop()).unwrap().1, 4);
    // Shard 1 ran empty and kept its bit (lazy clearing).
    assert_eq!(state(&q), make_state(4, false, shard_bit(1)));
    q.state
        .compare_exchange(
            make_state(4, false, shard_bit(1)),
            SEARCHING,
            Ordering::AcqRel,
            Ordering::Relaxed,
        )
        .unwrap();
    run_search(&q);
    assert_eq!(state(&q), make_state(0, false, shard_bit(0)));
    assert_eq!(on_shard(5, || q.pop()).unwrap().1, 0);
    assert!(on_shard(5, || q.pop()).is_none());
    assert_eq!(state(&q), 0);
}

/// A pop that empties its shard keeps the shard's bit, so a thread that keeps pushing and popping
/// the same priority doesn't write the state word; the stale bit is cleared by the next pop that
/// finds the shard without the highest priority.
#[test]
fn emptying_pop_keeps_the_bit() {
    let q: Queue<u32> = Queue::new();
    on_shard(0, || q.push(0, 100));
    on_shard(3, || {
        for item in 0..5 {
            q.push(0, item);
            let expected = make_state(0, false, shard_bit(0) | shard_bit(3));
            assert_eq!(state(&q), expected, "after push {item}");
            assert_eq!(q.pop().unwrap().1, item);
            assert_eq!(state(&q), expected, "after pop {item}");
        }
        // Shard 3 is empty: this pop clears its bit and steals from shard 0.
        assert_eq!(q.pop().unwrap().1, 100);
    });
    assert!(on_shard(3, || q.pop()).is_none());
    assert_eq!(state(&q), 0);
    assert_tops_match(&q);
}

/// A shard filled by a steal clears its bit when a pop empties it (unlike one filled by pushes), so
/// thieves don't keep trying a drained shard.
#[test]
fn emptying_a_stolen_batch_clears_the_bit() {
    let q: Queue<u32> = Queue::new();
    on_shard(0, || (0..2).for_each(|item| q.push(5, item)));
    // Shard 1 steals one item (half of two, rounded up) and pops it: shard 1 is empty again.
    assert_eq!(on_shard(1, || q.pop()), Some((5, 1)));
    assert_eq!(shard_len(&q, 1), 0);
    assert_eq!(state(&q), make_state(5, false, shard_bit(0)));
}

/// Shards that ran empty after pushes keep their bits, but the spurious bits are cleared as
/// thieves try those shards, so draining reaches the empty state.
#[test]
fn spurious_bits_are_cleared_while_draining() {
    let q: Queue<u32> = Queue::new();
    // Shards 1..=5 ran empty and kept their bits; shard 6 has the work.
    for index in 1..=5 {
        on_shard(index, || {
            q.push(0, 0);
            q.pop().unwrap();
        });
    }
    on_shard(6, || (10..14).for_each(|item| q.push(0, item)));
    let spurious: u64 = (1..=5).map(shard_bit).sum();
    assert_eq!(state(&q), make_state(0, false, spurious | shard_bit(6)));
    assert_eq!(on_shard(9, || drain(&q)), vec![13, 12, 11, 10]);
    // Draining cleared every spurious bit on the way to the empty state.
    assert_eq!(state(&q), 0);
}

/// A pop that leaves lower priorities in its shard clears the shard's bit right away: the bit is
/// known to be spurious.
#[test]
fn pop_leaving_lower_items_clears_the_bit() {
    let q: Queue<u32> = Queue::new();
    on_shard(2, || {
        q.push(1, 1);
        q.push(6, 6);
        assert_eq!(state(&q), make_state(6, false, shard_bit(2)));
        assert_eq!(q.pop().unwrap().1, 6);
    });
    assert_eq!(state(&q), make_state(6, false, 0));
}

/// The search reads published tops without locking: a shard that is locked by someone else
/// doesn't block the search, and the search finds its items.
#[test]
fn search_does_not_wait_for_locked_shards() {
    let q: Arc<Queue<u32>> = Arc::new(Queue::new());
    on_shard(4, || q.push(3, 3));
    on_shard(7, || q.push(2, 2));
    // A stale `highest` without bits: the next pop searches.
    q.state.store(make_state(9, false, 0), Ordering::Release);
    let guard = q.shards[4].shard.lock();
    let (sender, receiver) = std::sync::mpsc::channel();
    let worker = {
        let q = q.clone();
        std::thread::spawn(move || {
            q.search();
            sender.send(state(&q)).unwrap();
        })
    };
    let result = receiver.recv_timeout(Duration::from_secs(5));
    drop(guard);
    worker.join().unwrap();
    assert_eq!(
        result.expect("the search must not wait for a locked shard"),
        make_state(3, false, shard_bit(4))
    );
    assert_eq!(on_shard(9, || drain(&q)), vec![3, 2]);
}

/// The search's finish merges what pushes wrote into the word during the search with its scan:
/// `highest` is the maximum of both, the bits are the union. A push that the scan missed (because
/// it came after the scan) is therefore not lost.
#[test]
fn search_finish_merges_pushes_during_the_search() {
    let q: Queue<u32> = Queue::new();
    on_shard(2, || q.push(4, 4));
    q.state.store(make_state(9, false, 0), Ordering::Release);
    let search = q.search_lock.lock();
    q.state.store(SEARCHING, Ordering::Release);
    let scan = q.scan_tops();
    assert_eq!(scan, (Some(4), shard_bit(2)));
    // Pushes after the scan: one higher, one lower than what the scan found.
    on_shard(5, || q.push(6, 6));
    on_shard(6, || q.push(1, 1));
    assert_eq!(state(&q), make_state(6, true, shard_bit(5) | shard_bit(6)));
    q.finish_search(scan);
    drop(search);
    assert_eq!(
        state(&q),
        make_state(6, false, shard_bit(2) | shard_bit(5) | shard_bit(6))
    );
    assert_eq!(on_shard(9, || drain(&q)), vec![6, 4, 1]);
    assert_eq!(state(&q), 0);
}

/// A search that scanned nothing must not end empty when a push came in after the scan (the stale
/// scan of the cross-search ABA): the push is in the word, so the finish keeps it.
#[test]
fn empty_scan_does_not_hide_a_push_during_the_search() {
    let q: Queue<u32> = Queue::new();
    q.state.store(make_state(7, false, 0), Ordering::Release);
    let search = q.search_lock.lock();
    q.state.store(SEARCHING, Ordering::Release);
    let scan = q.scan_tops();
    assert_eq!(scan, (None, 0));
    on_shard(5, || q.push(3, 3));
    q.finish_search(scan);
    drop(search);
    assert_eq!(state(&q), make_state(3, false, shard_bit(5)));
    assert_eq!(on_shard(1, || q.pop()), Some((3, 3)));
    assert!(on_shard(1, || q.pop()).is_none());
}

/// While a search runs, pops wait for it instead of popping or returning `None`; a thread that
/// wants to search while another one holds the search lock waits too, so it never finishes someone
/// else's search.
#[test]
fn pops_wait_for_a_running_search() {
    let q: Arc<Queue<u32>> = Arc::new(Queue::new());
    on_shard(3, || q.push(2, 2));
    q.state.store(make_state(8, false, 0), Ordering::Release);
    // This thread is the search lock holder that started a search.
    let search = q.search_lock.lock();
    q.state.store(SEARCHING, Ordering::Release);
    let done = Arc::new(AtomicBool::new(false));
    let popper = {
        let (q, done) = (q.clone(), done.clone());
        std::thread::spawn(move || {
            let popped = on_shard(9, || q.pop());
            done.store(true, Ordering::Release);
            popped
        })
    };
    std::thread::sleep(Duration::from_millis(50));
    assert!(
        !done.load(Ordering::Acquire),
        "a pop returned during the search"
    );
    assert!(is_searching(state(&q)), "someone else finished the search");
    q.finish_search(q.scan_tops());
    drop(search);
    assert_eq!(popper.join().unwrap(), Some((2, 2)));
    assert!(q.is_empty());
}

/// Published tops follow every change of a shard: pushes, pops, steals, takeovers.
#[test]
fn published_tops_follow_shard_changes() {
    let q: Queue<u32> = Queue::new();
    assert_tops_match(&q);
    on_shard(0, || (0..8).for_each(|item| q.push(5, item)));
    on_shard(0, || q.push_many([(1, 100), (9, 9)]));
    assert_tops_match(&q);
    on_shard(1, || q.push(2, 50));
    assert_eq!(on_shard(1, || q.pop()).unwrap().1, 9);
    assert_tops_match(&q);
    // Shard 1 only has priority 2: it steals half of shard 0's priority-5 items.
    assert_eq!(on_shard(1, || q.pop()).unwrap().1, 7);
    assert_tops_match(&q);
    set_steal_pressure(&q, 0, STEAL_PRESSURE_THRESHOLD);
    on_shard(2, || q.pop()).unwrap();
    assert_tops_match(&q);
    on_shard(3, || drain(&q));
    assert_tops_match(&q);
    assert!(q.is_empty());
}

/// A search whose scan finds every shard empty, with no concurrent pushes, ends with the empty
/// state word, so `pop` returns `None`.
#[test]
fn search_over_empty_shards_ends_empty() {
    let q: Queue<u32> = Queue::new();
    // A stale `highest` with no bits, as left behind by the last pop of a priority.
    q.state.store(make_state(4, false, 0), Ordering::Release);
    assert!(on_shard(3, || q.pop()).is_none());
    assert_eq!(state(&q), 0);
}

/// Pushes keep the state word up to date: a higher priority resets the bits to the pusher's shard,
/// an equal one adds its bit, a lower one writes nothing.
#[test]
fn push_updates_state_word() {
    let q: Queue<u32> = Queue::new();
    on_shard(0, || q.push(3, 0));
    on_shard(1, || q.push(3, 1));
    assert_eq!(state(&q), make_state(3, false, shard_bit(0) | shard_bit(1)));
    on_shard(2, || q.push(9, 2));
    assert_eq!(state(&q), make_state(9, false, shard_bit(2)));
    on_shard(3, || q.push(1, 3));
    assert_eq!(state(&q), make_state(9, false, shard_bit(2)));
    on_shard(4, || q.push_many([(9, 4), (2, 5)]));
    assert_eq!(state(&q), make_state(9, false, shard_bit(2) | shard_bit(4)));
}

/// A rank verified under a shard lock stays poppable after a concurrent raise; without a verified
/// rank, the pop doesn't go below the current `highest`.
#[test]
fn verified_rank_survives_a_raise() {
    let q: Queue<u32> = Queue::new();
    on_shard(0, || (0..3).for_each(|item| q.push(5, item)));
    // A raise by another shard after this pop verified rank 5.
    on_shard(1, || q.push(9, 9));
    let mut shard = q.shards[0].shard.lock();
    assert!(matches!(
        q.pop_locked(0, &mut shard, None),
        ShardPop::NotHighest
    ));
    match q.pop_locked(0, &mut shard, Some(5)) {
        ShardPop::Item(priority, item) => assert_eq!((priority, item), (5, 2)),
        _ => panic!("the verified rank must be poppable"),
    }
    drop(shard);
    // A plain pop from shard 0 takes the raised priority first.
    assert_eq!(on_shard(0, || q.pop()), Some((9, 9)));
    assert_tops_match(&q);
}

/// A push during a search publishes its rank and bit, so the search can't end below it, even if
/// the finishing thread read the shard's top before the push.
#[test]
fn push_during_search_is_not_lost() {
    let q: Queue<u32> = Queue::new();
    on_shard(0, || q.push(2, 2));
    q.state.store(SEARCHING, Ordering::Release);
    // The push lands while the search runs: it raises the searching `highest` and sets its bit.
    on_shard(5, || q.push(8, 8));
    assert_eq!(state(&q), make_state(8, true, shard_bit(5)));
    run_search(&q);
    assert_eq!(state(&q), make_state(8, false, shard_bit(5)));
    assert_eq!(on_shard(9, || drain(&q)), vec![8, 2]);
    assert_eq!(state(&q), 0);
}

/// Priorities of equal rank are ordered by the full priority within a shard.
#[test]
fn equal_rank_priorities_are_ordered_within_a_shard() {
    #[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
    struct Coarse(u32);
    impl QueuePriority for Coarse {
        fn rank(&self) -> u32 {
            self.0 / 10
        }
    }
    let q: ConcurrentPriorityQueue<Coarse, u32> = ConcurrentPriorityQueue::new();
    for p in [11, 15, 3, 19, 12] {
        q.push(Coarse(p), p);
    }
    assert_eq!(
        std::iter::from_fn(|| q.pop().map(|(_, item)| item)).collect::<Vec<_>>(),
        vec![19, 15, 12, 11, 3]
    );
}

/// A thread whose shard is locked by someone else moves to another shard instead of waiting.
#[test]
fn busy_shard_is_skipped() {
    let q: Arc<Queue<u32>> = Arc::new(Queue::new());
    let guard = q.shards[0].shard.lock();
    let (sender, receiver) = std::sync::mpsc::channel();
    let worker = {
        let q = q.clone();
        std::thread::spawn(move || {
            set_thread_shard(0);
            q.push(1, 1);
            let popped = q.pop().map(|(_, item)| item);
            sender.send((popped, thread_shard())).unwrap();
        })
    };
    let result = receiver.recv_timeout(Duration::from_secs(5));
    drop(guard);
    worker.join().unwrap();
    let (popped, shard) = result.expect("push and pop must not wait for a busy shard");
    assert_eq!(popped, Some(1));
    assert_eq!(
        shard, 0,
        "the home shard only changes to a shard with high steal pressure"
    );
}

fn steal_pressure<T>(q: &Queue<T>, index: usize) -> u32 {
    q.shards[index].shard.lock().steal_pressure
}

fn set_steal_pressure<T>(q: &Queue<T>, index: usize, pressure: u32) {
    q.shards[index].shard.lock().steal_pressure = pressure;
}

/// A steal from a shard and a push or pop by a thread whose home it isn't raise its steal
/// pressure by 1; a push or pop by its home thread halves it.
#[test]
fn steal_pressure_counts_foreign_uses_and_halves_on_home_use() {
    let q: Queue<u32> = Queue::new();
    on_shard(0, || (0..10).for_each(|item| q.push(5, item)));
    assert_eq!(steal_pressure(&q, 0), 0);
    // Shard 1 steals 5 items from shard 0 and pops one of them from its own home.
    on_shard(1, || q.pop()).unwrap();
    assert_eq!(steal_pressure(&q, 0), 1, "one steal");
    assert_eq!(steal_pressure(&q, 1), 0, "a home pop");
    set_steal_pressure(&q, 0, 40);
    on_shard(0, || q.pop()).unwrap();
    assert_eq!(steal_pressure(&q, 0), 20, "a home pop halves it");
    on_shard(0, || q.push(5, 10));
    assert_eq!(steal_pressure(&q, 0), 10, "a home push halves it");
    // Uses by a thread whose home is another shard (via a forced shard lock).
    let (index, mut shard) = on_shard(0, || q.lock_some_shard());
    assert_eq!(index, 0);
    on_shard(2, || q.record_use(index, &mut shard));
    drop(shard);
    assert_eq!(steal_pressure(&q, 0), 11, "a foreign use adds 1");
}

/// A victim needs a high steal pressure before a thief takes it over.
#[test]
fn steal_pressure_threshold_is_1024() {
    assert_eq!(STEAL_PRESSURE_THRESHOLD, 1024);
}

/// Instead of stealing from a shard with high steal pressure, a thread makes that shard its home,
/// resets its steal pressure and pops from it directly; nothing is moved. The next thief then
/// steals from it instead of taking it over too.
#[test]
fn high_steal_pressure_victim_becomes_home() {
    let q: Queue<u32> = Queue::new();
    on_shard(0, || (0..10).for_each(|item| q.push(5, item)));
    on_shard(1, || q.push(1, 100));
    set_steal_pressure(&q, 0, STEAL_PRESSURE_THRESHOLD);
    let (item, home) = on_shard(1, || {
        let item = q.pop().unwrap().1;
        (item, thread_shard())
    });
    assert_eq!(item, 9, "the newest item of the victim");
    assert_eq!(home, 0, "the thread switched its home to the victim");
    assert_eq!(shard_len(&q, 0), 9, "nothing was moved out of the victim");
    assert_eq!(shard_len(&q, 1), 1, "the thief's shard is unchanged");
    assert_eq!(steal_pressure(&q, 0), 0, "reset by the takeover");
    on_shard(2, || q.pop()).unwrap();
    assert_eq!(shard_len(&q, 0), 4, "the next thief stole half");
    assert_eq!(steal_pressure(&q, 0), 1);
}

/// Below the threshold, a thread still steals half.
#[test]
fn low_steal_pressure_victim_is_stolen_from() {
    let q: Queue<u32> = Queue::new();
    on_shard(0, || (0..10).for_each(|item| q.push(5, item)));
    set_steal_pressure(&q, 0, STEAL_PRESSURE_THRESHOLD - 1);
    let home = on_shard(1, || {
        q.pop().unwrap();
        thread_shard()
    });
    assert_eq!(home, 1);
    assert_eq!(shard_len(&q, 0), 5);
    assert_eq!(shard_len(&q, 1), 4);
    assert_eq!(steal_pressure(&q, 0), STEAL_PRESSURE_THRESHOLD);
}

/// Runs `f` on a new thread whose home is shard 0 while shard 0 is locked; returns `f`'s result
/// and the thread's home shard afterwards. Fails if `f` waits for shard 0.
fn with_busy_home<R: Send + 'static>(
    q: &Arc<Queue<u32>>,
    f: impl FnOnce(&Queue<u32>) -> R + Send + 'static,
) -> (R, usize) {
    let guard = q.shards[0].shard.lock();
    let (sender, receiver) = std::sync::mpsc::channel();
    let worker = {
        let q = q.clone();
        std::thread::spawn(move || {
            set_thread_shard(0);
            let result = f(&q);
            sender.send((result, thread_shard())).unwrap();
        })
    };
    let result = receiver.recv_timeout(Duration::from_secs(5));
    drop(guard);
    worker.join().unwrap();
    result.expect("must not wait for the busy home shard")
}

/// A push with a busy home shard uses another shard, but only moves home to a shard with high
/// steal pressure.
#[test]
fn busy_home_push_switches_only_to_high_pressure_shard() {
    let q: Arc<Queue<u32>> = Arc::new(Queue::new());
    let ((), home) = with_busy_home(&q, |q| q.push(1, 1));
    assert_eq!(home, 0);
    assert_eq!(shard_len(&q, 0), 0, "pushed to another shard");

    for index in 1..SHARD_COUNT {
        set_steal_pressure(&q, index, STEAL_PRESSURE_THRESHOLD);
    }
    let ((), home) = with_busy_home(&q, |q| q.push(1, 2));
    assert_ne!(
        home, 0,
        "moved home to the high pressure shard it pushed to"
    );
    assert!(shard_len(&q, home) > 0);
    assert_eq!(steal_pressure(&q, home), 0, "reset by the home switch");
}

/// A pop with a busy home shard pops from a shard whose bit is set (it has items) and keeps its
/// home.
#[test]
fn busy_home_pop_uses_shard_with_items() {
    let q: Arc<Queue<u32>> = Arc::new(Queue::new());
    on_shard(3, || q.push(2, 7));
    let (popped, home) = with_busy_home(&q, |q| q.pop().map(|(_, item)| item));
    assert_eq!(popped, Some(7));
    assert_eq!(home, 0, "the home shard is kept");
    assert!(all_shards_empty(&q));
    assert_eq!(
        steal_pressure(&q, 3),
        1,
        "a direct pop by a non-home thread, not a steal"
    );
}

/// Total steal pressure of shards `1..`, for pushes that land on some other shard than a busy shard
/// 0.
fn foreign_pressure<T>(q: &Queue<T>) -> u32 {
    (1..SHARD_COUNT).map(|index| steal_pressure(q, index)).sum()
}

/// A push or nonempty `push_many` that lands on another shard because the home is busy raises that
/// shard's steal pressure by 1 (once per batch). On its home, a nonempty `push_many` halves the
/// pressure once, and an empty one leaves it unchanged.
#[test]
fn pushes_update_steal_pressure() {
    let q: Arc<Queue<u32>> = Arc::new(Queue::new());
    let ((), home) = with_busy_home(&q, |q| q.push(1, 1));
    assert_eq!(home, 0);
    assert_eq!(foreign_pressure(&q), 1, "a foreign push");
    let ((), home) = with_busy_home(&q, |q| q.push_many([(1, 2), (1, 3)]));
    assert_eq!(home, 0);
    assert_eq!(foreign_pressure(&q), 2, "a foreign batch counts once");

    set_steal_pressure(&q, 5, 40);
    on_shard(5, || q.push_many([(1, 4), (1, 5)]));
    assert_eq!(steal_pressure(&q, 5), 20, "a home batch halves once");
    on_shard(5, || q.push_many(std::iter::empty()));
    assert_eq!(steal_pressure(&q, 5), 20, "an empty batch locks nothing");
}

/// Many threads push, pop, steal and search concurrently over many rounds. Checks that every item
/// is popped exactly once, and, in the quiescent phase at the end of each round (no pushes), the
/// ordering guarantee: no item of a higher priority is popped by a pop that starts after another
/// pop of a lower priority (or a `None`) has completed.
#[test]
fn stress_no_loss_no_duplicates_and_order() {
    const ROUNDS: u32 = 20;
    const PRODUCERS: u32 = 4;
    const CONSUMERS: u32 = 6;
    const PER_PRODUCER: u32 = 2_000;
    const PER_ROUND: u32 = PRODUCERS * PER_PRODUCER;

    /// Pops of the quiescent phase: `(start, end, priority or None)` in a global sequence.
    type QuiescentPop = (u64, u64, Option<u32>);

    let total = ROUNDS * PER_ROUND;
    let popped_count: Vec<AtomicU32> = (0..total).map(|_| AtomicU32::new(0)).collect();
    let q: Queue<u32> = Queue::new();
    let seq = AtomicU64::new(0);

    for round in 0..ROUNDS {
        let base = round * PER_ROUND;
        let producers_done = AtomicU32::new(0);
        let quiescent = AtomicBool::new(false);
        let quiescent_pops: Mutex<Vec<QuiescentPop>> = Mutex::new(Vec::new());
        std::thread::scope(|scope| {
            for consumer in 0..CONSUMERS {
                let (q, popped_count, seq, quiescent, quiescent_pops) =
                    (&q, &popped_count, &seq, &quiescent, &quiescent_pops);
                scope.spawn(move || {
                    set_thread_shard((consumer as usize * 5) % SHARD_COUNT);
                    let mut local = Vec::new();
                    loop {
                        let in_quiescent = quiescent.load(Ordering::Acquire);
                        let start = seq.fetch_add(1, Ordering::SeqCst);
                        let popped = q.pop();
                        let end = seq.fetch_add(1, Ordering::SeqCst);
                        if let Some((_, id)) = &popped {
                            popped_count[*id as usize].fetch_add(1, Ordering::Relaxed);
                        }
                        if in_quiescent {
                            local.push((start, end, popped.as_ref().map(|(p, _)| *p)));
                            if popped.is_none() {
                                break;
                            }
                        }
                    }
                    quiescent_pops.lock().extend(local);
                });
            }
            for producer in 0..PRODUCERS {
                let (q, producers_done) = (&q, &producers_done);
                scope.spawn(move || {
                    set_thread_shard((producer as usize * 7 + 3) % SHARD_COUNT);
                    let mut x = 0x9E37_79B9u32 ^ (producer << 8) ^ round;
                    let mut batch = Vec::new();
                    for i in 0..PER_PRODUCER {
                        x ^= x << 13;
                        x ^= x >> 17;
                        x ^= x << 5;
                        let id = base + producer * PER_PRODUCER + i;
                        // Mostly a few priorities (like real builds), sometimes a spread.
                        let priority = match x % 8 {
                            0..=3 => 0,
                            4 | 5 => 3,
                            6 => 7,
                            _ => x % 64,
                        };
                        if x % 32 < 4 {
                            batch.push((priority, id));
                            if batch.len() == 8 {
                                q.push_many(std::mem::take(&mut batch));
                            }
                        } else {
                            q.push(priority, id);
                        }
                    }
                    q.push_many(batch);
                    producers_done.fetch_add(1, Ordering::AcqRel);
                });
            }
            while producers_done.load(Ordering::Acquire) < PRODUCERS {
                std::thread::yield_now();
            }
            quiescent.store(true, Ordering::Release);
        });

        assert!(q.pop().is_none());
        assert!(all_shards_empty(&q), "round {round}: items left behind");
        assert_eq!(state(&q), 0);

        // Ordering in the quiescent phase.
        let pops = quiescent_pops.into_inner();
        let mut by_start = pops.clone();
        by_start.sort_by_key(|&(start, _, _)| start);
        for &(_, end, priority) in &pops {
            for &(start, _, later) in by_start.iter().rev() {
                if start < end {
                    break;
                }
                if let Some(later) = later {
                    assert!(
                        priority.is_some_and(|priority| later <= priority),
                        "round {round}: a pop of priority {later} started after a pop of \
                         {priority:?} ended"
                    );
                }
            }
        }
    }

    for (id, count) in popped_count.iter().enumerate() {
        assert_eq!(count.load(Ordering::Relaxed), 1, "item {id}");
    }
}
