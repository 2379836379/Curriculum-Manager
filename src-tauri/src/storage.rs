use std::fs;
use std::path::Path;

use serde::Deserialize;

use crate::models::{AppData, Course, Module};

#[derive(Deserialize)]
struct LegacyAppData {
    #[serde(default)]
    modules: Vec<LegacyModule>,
    #[serde(default)]
    courses: Vec<Course>,
}

#[derive(Deserialize)]
struct LegacyModule {
    id: String,
    name: String,
}

pub fn load(path: &Path) -> Result<AppData, String> {
    if !path.exists() {
        return Ok(AppData::default());
    }

    let raw = fs::read_to_string(path)
        .map_err(|error| format!("failed to read storage file: {error}"))?;
    if raw.trim().is_empty() {
        return Ok(AppData::default());
    }

    match serde_json::from_str::<AppData>(&raw) {
        Ok(data) => Ok(data.normalize()),
        Err(_) => {
            let legacy = serde_json::from_str::<LegacyAppData>(&raw)
                .map_err(|error| format!("failed to parse storage file: {error}"))?;

            Ok(AppData {
                plans: Vec::new(),
                modules: legacy
                    .modules
                    .into_iter()
                    .map(|module| Module {
                        id: module.id,
                        plan_id: String::new(),
                        parent_module_id: None,
                        finished: false,
                        name: module.name,
                    })
                    .collect(),
                courses: legacy.courses,
                course_pool: Vec::new(),
            }
            .normalize())
        }
    }
}

pub fn save(path: &Path, data: &AppData) -> Result<(), String> {
    let serialized = serde_json::to_string_pretty(data)
        .map_err(|error| format!("failed to serialize storage file: {error}"))?;
    fs::write(path, serialized).map_err(|error| format!("failed to write storage file: {error}"))
}
