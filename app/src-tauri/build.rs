//! Tauri build script: codegen for the tauri.conf.json context (window
//! definitions, capabilities, icons). Runs before the crate compiles.

fn main() {
    #[allow(clippy::panic)] // build scripts report configuration errors by panicking
    tauri_build::build();
}
