use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Serialize, PartialEq, Clone, Copy)]
#[serde(rename_all = "lowercase")]
pub enum WindowButton {
    Close,
    Maximize,
    Minimize,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct WindowButtonLayout {
    pub left: Vec<WindowButton>,
    pub right: Vec<WindowButton>,
}

pub fn default_layout() -> WindowButtonLayout {
    WindowButtonLayout {
        left: Vec::new(),
        right: vec![
            WindowButton::Minimize,
            WindowButton::Maximize,
            WindowButton::Close,
        ],
    }
}

pub fn detect() -> WindowButtonLayout {
    let desktop = std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default();
    if desktop_includes(&desktop, "KDE") {
        return detect_kde();
    }
    if desktop_includes(&desktop, "GNOME") {
        return detect_gnome();
    }
    default_layout()
}

fn desktop_includes(desktop: &str, environment: &str) -> bool {
    desktop
        .split(':')
        .any(|name| name.trim().eq_ignore_ascii_case(environment))
}

fn detect_kde() -> WindowButtonLayout {
    let Some(path) = kwinrc_path() else {
        return default_layout();
    };
    match std::fs::read_to_string(path) {
        Ok(contents) => parse_kwinrc(&contents),
        Err(error) => {
            eprintln!("Could not read kwinrc for window buttons: {error}");
            default_layout()
        }
    }
}

fn kwinrc_path() -> Option<PathBuf> {
    let config_home = std::env::var_os("XDG_CONFIG_HOME")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")))?;
    Some(config_home.join("kwinrc"))
}

fn detect_gnome() -> WindowButtonLayout {
    match std::process::Command::new("gsettings")
        .args(["get", "org.gnome.desktop.wm.preferences", "button-layout"])
        .output()
    {
        Ok(output) if output.status.success() => {
            parse_gsettings_layout(&String::from_utf8_lossy(&output.stdout))
        }
        Ok(output) => {
            let status = output.status;
            eprintln!("gsettings button-layout exited with status {status}");
            default_layout()
        }
        Err(error) => {
            eprintln!("Could not run gsettings for window buttons: {error}");
            default_layout()
        }
    }
}

pub fn parse_kwinrc(contents: &str) -> WindowButtonLayout {
    let mut left = String::new();
    let mut right = String::new();
    let mut in_decoration = false;
    let mut found_decoration = false;
    for line in contents.lines() {
        let line = line.trim();
        if let Some(header) = line.strip_prefix('[') {
            in_decoration = header.strip_suffix(']') == Some("org.kde.kdecoration2");
            found_decoration |= in_decoration;
        } else if in_decoration
            && let Some((key, value)) = line.split_once('=')
        {
            match key.trim() {
                "ButtonsOnLeft" => left = value.trim().to_owned(),
                "ButtonsOnRight" => right = value.trim().to_owned(),
                _ => {}
            }
        }
    }
    let layout = WindowButtonLayout {
        left: left.chars().filter_map(kwin_button).collect(),
        right: right.chars().filter_map(kwin_button).collect(),
    };
    if !found_decoration || (layout.left.is_empty() && layout.right.is_empty()) {
        return default_layout();
    }
    layout
}

fn kwin_button(letter: char) -> Option<WindowButton> {
    match letter {
        'X' => Some(WindowButton::Close),
        'A' => Some(WindowButton::Maximize),
        'I' => Some(WindowButton::Minimize),
        // M is the window menu and every other code is unknown; both are ignored.
        _ => None,
    }
}

pub fn parse_gsettings_layout(output: &str) -> WindowButtonLayout {
    let value = output.trim().trim_matches('\'');
    let (left, right) = value.split_once(':').unwrap_or((value, ""));
    let layout = WindowButtonLayout {
        left: gsettings_buttons(left),
        right: gsettings_buttons(right),
    };
    if layout.left.is_empty() && layout.right.is_empty() {
        return default_layout();
    }
    layout
}

fn gsettings_buttons(side: &str) -> Vec<WindowButton> {
    side.split(',')
        .map(str::trim)
        .filter_map(|name| match name {
            "close" => Some(WindowButton::Close),
            "maximize" => Some(WindowButton::Maximize),
            "minimize" => Some(WindowButton::Minimize),
            // appmenu and unknown entries are ignored.
            _ => None,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kwinrc_letters_are_mapped_in_order_and_unknown_codes_ignored() {
        let layout = parse_kwinrc(
            "[Effect-wobblywindows]\nEnabled=true\n\n[org.kde.kdecoration2]\nBorderSize=4\nButtonsOnLeft=XAI\nButtonsOnRight=MHZ\n",
        );
        assert_eq!(
            layout.left,
            vec![
                WindowButton::Close,
                WindowButton::Maximize,
                WindowButton::Minimize
            ]
        );
        assert_eq!(layout.right, vec![]);
    }

    #[test]
    fn kwinrc_without_decoration_buttons_uses_the_default() {
        assert_eq!(
            parse_kwinrc("[General]\nLibrary=org.kde.breeze\n"),
            default_layout()
        );
        assert_eq!(
            parse_kwinrc("[org.kde.kdecoration2]\nBorderSize=2\n"),
            default_layout()
        );
        assert_eq!(parse_kwinrc("not an ini file"), default_layout());
    }

    #[test]
    fn gsettings_layout_is_parsed_around_the_colon() {
        assert_eq!(
            parse_gsettings_layout("'appmenu:minimize,maximize,close'\n"),
            WindowButtonLayout {
                left: vec![],
                right: vec![
                    WindowButton::Minimize,
                    WindowButton::Maximize,
                    WindowButton::Close
                ],
            }
        );
        assert_eq!(
            parse_gsettings_layout("'close,minimize,maximize:appmenu'"),
            WindowButtonLayout {
                left: vec![
                    WindowButton::Close,
                    WindowButton::Minimize,
                    WindowButton::Maximize
                ],
                right: vec![],
            }
        );
    }

    #[test]
    fn gsettings_without_window_buttons_uses_the_default() {
        assert_eq!(parse_gsettings_layout("''"), default_layout());
        assert_eq!(parse_gsettings_layout("':'"), default_layout());
        assert_eq!(parse_gsettings_layout("'appmenu:'"), default_layout());
        assert_eq!(
            parse_gsettings_layout("'unrelated:appmenu'"),
            default_layout()
        );
    }

    #[test]
    fn default_layout_puts_minimize_maximize_close_on_the_right() {
        assert_eq!(
            default_layout(),
            WindowButtonLayout {
                left: vec![],
                right: vec![
                    WindowButton::Minimize,
                    WindowButton::Maximize,
                    WindowButton::Close
                ],
            }
        );
    }

    #[test]
    fn desktop_environment_detection_honors_colon_separated_lists() {
        assert!(desktop_includes("KDE", "KDE"));
        assert!(desktop_includes("KDE:GNOME", "KDE"));
        assert!(desktop_includes("ubuntu:GNOME", "GNOME"));
        assert!(desktop_includes("gnome", "GNOME"));
        assert!(!desktop_includes("XFCE", "GNOME"));
    }
}
