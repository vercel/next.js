#[macro_export]
macro_rules! register {
    () => {
        lazy_static::lazy_static! {
            static ref REGISTER: () = {
                turbo_tasks::register();
                include!(concat!(env!("OUT_DIR"), "/register_test_", module_path!(), ".rs"));
            };
        }
    };
}

#[macro_export]
macro_rules! run {
    ($($stmt:tt)+) => {{
        use turbo_tasks::TurboTasks;
        use turbo_tasks_memory::MemoryBackend;
        *REGISTER;
        let tt = TurboTasks::new(MemoryBackend::new());
        tt.run_once(async {
            $($stmt)+
            Ok(())
        })
        .await.unwrap();
    }};
}
