fn main() {
    #[allow(clippy::panic)] // build scripts report configuration errors by panicking
    tauri_build::build();
}
