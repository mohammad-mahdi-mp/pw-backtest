//! pw-app binary — thin launcher over the library (`pw_app_lib::run`).

fn main() {
    if let Err(err) = pw_app_lib::run() {
        eprintln!("pw-app: fatal: {err}");
        std::process::exit(1);
    }
}
