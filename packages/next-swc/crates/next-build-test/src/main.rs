use std::str::FromStr;

use next_build_test::{main_inner, Strategy};
use turbo_tasks::TurboTasks;
use turbo_tasks_malloc::TurboMalloc;
use turbopack_binding::turbo::tasks_memory::MemoryBackend;

// #[global_allocator]
// static ALLOC: turbo_tasks_malloc::TurboMalloc =
// turbo_tasks_malloc::TurboMalloc;

fn main() {
    let mut factor = std::env::args()
        .nth(2)
        .map(|s| s.parse().unwrap())
        .unwrap_or(num_cpus::get());
    let strat = std::env::args()
        .nth(1)
        .map(|s| Strategy::from_str(&s))
        .transpose()
        .unwrap()
        .unwrap_or(Strategy::Sequential);

    let limit = std::env::args()
        .nth(3)
        .map(|s| s.parse().unwrap())
        .unwrap_or(1);

    if strat == Strategy::Sequential {
        factor = 1;
    }

    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .on_thread_stop(|| {
            TurboMalloc::thread_stop();
            println!("threads stopped");
        })
        .build()
        .unwrap()
        .block_on(async {
            let tt = TurboTasks::new(MemoryBackend::new(usize::MAX));
            let x = tt.run_once(main_inner(strat, factor, limit)).await;
            println!("done");
            x
        })
        .unwrap();
}
