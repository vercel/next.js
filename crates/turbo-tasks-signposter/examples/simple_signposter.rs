#[cfg(target_os = "macos")]
fn main() {
    signposter::event!("Event");
    signposter::event!("Event with message", "Event message");

    let _interval = signposter::interval!("Interval");
    let _interval_with_message = signposter::interval!("Interval with message", "Interval message");
    let interval_with_end_message =
        signposter::interval!("Interval with end message", "Interval start message");
    interval_with_end_message.end_with_message("Interval end message");
}

#[cfg(not(target_os = "macos"))]
fn main() {
    println!("This example only works on macOS.");
}
