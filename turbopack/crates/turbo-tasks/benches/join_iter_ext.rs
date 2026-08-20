use std::{
    cell::{Cell, RefCell},
    future::Future,
    pin::Pin,
    rc::Rc,
    task::{Context, Poll, Waker},
};

use anyhow::Result;
use criterion::{BenchmarkId, Criterion, black_box};
use futures::task::noop_waker;
use turbo_tasks::{TryFlatJoinIterExt, TryJoinIterExt};

const INPUT_SIZES: [usize; 7] = [1, 10, 100, 300, 1_000, 3_000, 10_000];

#[derive(Clone, Copy, PartialEq, Eq)]
enum Completion {
    Immediate,
    SecondPoll,
    Sequential,
}

impl Completion {
    fn name(self) -> &'static str {
        match self {
            Completion::Immediate => "immediate",
            Completion::SecondPoll => "second_poll",
            Completion::Sequential => "sequential",
        }
    }

    fn expected_polls(self, input_size: usize) -> usize {
        match self {
            Completion::Immediate => 1,
            Completion::SecondPoll => 2,
            Completion::Sequential => input_size,
        }
    }
}

#[derive(Default)]
struct SecondPollState {
    wakers: RefCell<Vec<Waker>>,
}

impl SecondPollState {
    fn wake_pending(&self) {
        for waker in self.wakers.borrow_mut().drain(..) {
            waker.wake();
        }
    }
}

struct SequentialState {
    next: Cell<usize>,
    wakers: RefCell<Vec<Option<Waker>>>,
}

impl SequentialState {
    fn new(input_size: usize) -> Self {
        Self {
            next: Cell::new(0),
            wakers: RefCell::new(vec![None; input_size]),
        }
    }

    fn wake_pending(&self) {
        if let Some(waker) = self
            .wakers
            .borrow_mut()
            .get_mut(self.next.get())
            .and_then(Option::take)
        {
            waker.wake();
        }
    }
}

enum Schedule {
    Immediate,
    SecondPoll {
        polled: bool,
        state: Rc<SecondPollState>,
    },
    Sequential {
        target: usize,
        state: Rc<SequentialState>,
    },
}

impl Schedule {
    fn new(
        completion: Completion,
        index: usize,
        input_size: usize,
        second_poll_state: &Option<Rc<SecondPollState>>,
        sequential_state: &Option<Rc<SequentialState>>,
    ) -> Self {
        match completion {
            Completion::Immediate => Schedule::Immediate,
            Completion::SecondPoll => Schedule::SecondPoll {
                polled: false,
                state: second_poll_state.as_ref().unwrap().clone(),
            },
            Completion::Sequential => Schedule::Sequential {
                // `join_all` initially polls in iterator order. The last future resolves, then
                // the synchronous driver wakes one previously-pending future between outer polls.
                target: input_size - index - 1,
                state: sequential_state.as_ref().unwrap().clone(),
            },
        }
    }

    fn poll(&mut self, cx: &mut Context<'_>) -> Poll<()> {
        match self {
            Schedule::Immediate => Poll::Ready(()),
            Schedule::SecondPoll { polled, .. } if *polled => Poll::Ready(()),
            Schedule::SecondPoll { polled, state } => {
                *polled = true;
                // The synchronous driver wakes these after `join_all` has finished registering
                // each pending child with its large-input `FuturesOrdered` representation.
                state.wakers.borrow_mut().push(cx.waker().clone());
                Poll::Pending
            }
            Schedule::Sequential { target, state } if state.next.get() == *target => {
                state.next.set(*target + 1);
                Poll::Ready(())
            }
            Schedule::Sequential { target, state } => {
                state.wakers.borrow_mut()[*target] = Some(cx.waker().clone());
                Poll::Pending
            }
        }
    }
}

struct ValueFuture {
    input: u32,
    schedule: Schedule,
}

impl Future for ValueFuture {
    type Output = Result<u32>;

    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        self.schedule.poll(cx).map(|()| Ok(sync_value(self.input)))
    }
}

struct FlatValueFuture {
    input: u32,
    schedule: Schedule,
}

impl Future for FlatValueFuture {
    type Output = Result<[u32; 1]>;

    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Self::Output> {
        self.schedule
            .poll(cx)
            .map(|()| Ok([sync_value(self.input)]))
    }
}

#[inline(never)]
fn sync_value(input: u32) -> u32 {
    input.wrapping_mul(31).wrapping_add(7)
}

fn poll_to_ready<F, W>(future: F, expected_polls: usize, mut wake_pending: W) -> F::Output
where
    F: Future,
    W: FnMut(),
{
    let waker = noop_waker();
    let mut cx = Context::from_waker(&waker);
    let mut future = std::pin::pin!(future);

    for poll_count in 1..=expected_polls {
        if let Poll::Ready(output) = future.as_mut().poll(&mut cx) {
            assert_eq!(poll_count, expected_polls);
            return output;
        }
        wake_pending();
    }

    panic!("join future did not resolve after {expected_polls} polls");
}

struct CompletionStates {
    second_poll: Option<Rc<SecondPollState>>,
    sequential: Option<Rc<SequentialState>>,
}

impl CompletionStates {
    fn new(completion: Completion, input_size: usize) -> Self {
        Self {
            second_poll: (completion == Completion::SecondPoll)
                .then(|| Rc::new(SecondPollState::default())),
            sequential: (completion == Completion::Sequential)
                .then(|| Rc::new(SequentialState::new(input_size))),
        }
    }

    fn wake_pending(&self) {
        if let Some(state) = &self.second_poll {
            state.wake_pending();
        }
        if let Some(state) = &self.sequential {
            state.wake_pending();
        }
    }
}

fn bench_join<F, M>(c: &mut Criterion, name: &str, completion: Completion, make_future: M)
where
    F: Future<Output = Result<Vec<u32>>>,
    M: Fn(usize, &CompletionStates) -> F,
{
    let mut group = c.benchmark_group(format!("{name}/{}", completion.name()));

    for input_size in INPUT_SIZES {
        group.bench_with_input(
            BenchmarkId::new(name, input_size),
            &input_size,
            |b, &input_size| {
                b.iter(|| {
                    let states = CompletionStates::new(completion, input_size);
                    let future = make_future(input_size, &states);
                    black_box(
                        poll_to_ready(future, completion.expected_polls(input_size), || {
                            states.wake_pending()
                        })
                        .unwrap(),
                    )
                });
            },
        );
        group.bench_with_input(
            BenchmarkId::new("map_collect", input_size),
            &input_size,
            |b, &input_size| {
                b.iter(|| {
                    black_box(
                        (0..input_size)
                            .map(|index| sync_value(black_box(index as u32)))
                            .collect::<Vec<_>>(),
                    )
                });
            },
        );
    }
}

pub fn benchmark(c: &mut Criterion) {
    for completion in [
        Completion::Immediate,
        Completion::SecondPoll,
        Completion::Sequential,
    ] {
        bench_join(c, "try_join", completion, |input_size, states| {
            (0..input_size)
                .map(|index| ValueFuture {
                    input: black_box(index as u32),
                    schedule: Schedule::new(
                        completion,
                        index,
                        input_size,
                        &states.second_poll,
                        &states.sequential,
                    ),
                })
                .try_join()
        });
        bench_join(c, "try_flat_join", completion, |input_size, states| {
            (0..input_size)
                .map(|index| FlatValueFuture {
                    input: black_box(index as u32),
                    schedule: Schedule::new(
                        completion,
                        index,
                        input_size,
                        &states.second_poll,
                        &states.sequential,
                    ),
                })
                .try_flat_join()
        });
    }
}
