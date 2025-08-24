use turbo_tasks_build::generate_register;

fn main() {
    println!("cargo::rustc-check-cfg=cfg(codspeed)");

    generate_register();
}
