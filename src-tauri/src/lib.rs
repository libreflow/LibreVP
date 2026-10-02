use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

// Must mirror src/utils.ts's VIDEO_EXTENSIONS -- there's no practical way to
// share a single source of truth between the Rust and TS sides for a list
// this small, so keep the two in sync by hand if either changes.
const VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "mkv", "avi", "mov", "webm", "m4v", "flv", "wmv", "ts", "mpg", "mpeg",
];

fn is_video_path(arg: &str) -> bool {
    let lower = arg.to_lowercase();
    VIDEO_EXTENSIONS
        .iter()
        .any(|ext| lower.ends_with(&format!(".{ext}")))
}

// `args[0]` is always the exe's own path, never the file to open -- skip it.
// The rest are OS-launch argv (double-clicking an associated file passes its
// full path as the sole argument) or single-instance's forwarded argv from a
// second launch attempt; either way, the first argument that looks like a
// video path (not a flag, not something else) is what we want.
fn find_video_arg(args: &[String]) -> Option<String> {
    args.iter().skip(1).find(|a| is_video_path(a)).cloned()
}

struct InitialFile(Mutex<Option<String>>);

// Consumed exactly once by the frontend on startup (after the player is
// ready to accept a loadFile call) -- `.take()` clears it so a later
// re-render/remount doesn't re-trigger the same initial file.
#[tauri::command]
fn get_initial_file(state: tauri::State<InitialFile>) -> Option<String> {
    state.0.lock().unwrap().take()
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let initial_file = find_video_arg(&std::env::args().collect::<Vec<_>>());

    let mut builder = tauri::Builder::default();

    // Must be the very first plugin registered (see tauri-plugin-single-instance
    // docs) so it can intercept a second launch before anything else runs.
    // Without this, double-clicking a second video file while LibreVP is
    // already open spawns a whole separate window/mpv instance instead of
    // reusing the existing one.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            focus_main_window(app);
            if let Some(path) = find_video_arg(&args) {
                // The window already exists and the frontend has long since
                // attached its listener by this point, so a plain emit (no
                // "is anyone listening yet" race like the startup path below)
                // is enough to hand off the new file.
                let _ = app.emit("open-file", path);
            }
        }));
    }

    builder
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_libmpv::init())
        .manage(InitialFile(Mutex::new(initial_file)))
        .invoke_handler(tauri::generate_handler![get_initial_file])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
