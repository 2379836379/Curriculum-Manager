mod models;
mod storage;

use std::path::PathBuf;
use std::sync::Mutex;

use models::{
    AddCourseFromPoolPayload, AppData, AppSummary, Course, CoursePayload, CoursePoolGroup,
    CoursePoolGroupPayload, CoursePoolItem, CoursePoolPayload, CreateModulePayload, Module, Plan,
    Snapshot,
};
use tauri::{AppHandle, Manager, State};

struct AppState {
    path: PathBuf,
    data: Mutex<AppData>,
}

impl AppState {
    fn save(&self) -> Result<(), String> {
        let data = self
            .data
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;
        storage::save(&self.path, &data)
    }
}

fn make_id(prefix: &str) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};

    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    format!("{prefix}-{nanos}")
}

fn summary_for(data: &AppData, selected_plan_id: Option<&str>) -> AppSummary {
    AppSummary::from_data(data, selected_plan_id)
}

fn app_state(handle: &AppHandle) -> Result<AppState, String> {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let project_dir = manifest_dir
        .parent()
        .ok_or_else(|| "failed to resolve project root directory".to_string())?
        .to_path_buf();
    let data_dir = project_dir.join("data");

    std::fs::create_dir_all(&data_dir)
        .map_err(|error| format!("failed to create data directory: {error}"))?;

    let path = data_dir.join("course-check-data.json");

    let legacy_app_dir = handle
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data directory: {error}"))?;
    let legacy_path = legacy_app_dir.join("course-check-data.json");

    let data = if path.exists() {
        storage::load(&path)?
    } else if legacy_path.exists() {
        storage::load(&legacy_path)?
    } else {
        AppData::default()
    };

    storage::save(&path, &data)?;

    Ok(AppState {
        path,
        data: Mutex::new(data),
    })
}

#[tauri::command]
fn get_snapshot(
    selected_plan_id: Option<String>,
    state: State<'_, AppState>,
) -> Result<Snapshot, String> {
    let data = state
        .data
        .lock()
        .map_err(|_| "state lock poisoned".to_string())?;

    Ok(Snapshot {
        plans: data.plans.clone(),
        modules: data.modules.clone(),
        courses: data.courses.clone(),
        course_pool_groups: data.course_pool_groups.clone(),
        course_pool: data.course_pool.clone(),
        summary: summary_for(&data, selected_plan_id.as_deref()),
    })
}

#[tauri::command]
fn create_plan(name: String, state: State<'_, AppState>) -> Result<Plan, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("plan name cannot be empty".to_string());
    }

    let plan = Plan {
        id: make_id("plan"),
        name: trimmed.to_string(),
    };

    {
        let mut data = state
            .data
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;
        data.plans.push(plan.clone());
    }

    state.save()?;
    Ok(plan)
}

#[tauri::command]
fn update_plan(id: String, name: String, state: State<'_, AppState>) -> Result<Plan, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("plan name cannot be empty".to_string());
    }

    let updated_plan = {
        let mut data = state
            .data
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;

        let plan = data
            .plans
            .iter_mut()
            .find(|plan| plan.id == id)
            .ok_or_else(|| "plan not found".to_string())?;

        plan.name = trimmed.to_string();
        plan.clone()
    };

    state.save()?;
    Ok(updated_plan)
}

#[tauri::command]
fn delete_plan(id: String, state: State<'_, AppState>) -> Result<(), String> {
    {
        let mut data = state
            .data
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;

        if data.modules.iter().any(|module| module.plan_id == id) {
            return Err("plan still contains modules".to_string());
        }

        let before = data.plans.len();
        data.plans.retain(|plan| plan.id != id);
        if before == data.plans.len() {
            return Err("plan not found".to_string());
        }
    }

    state.save()
}

#[tauri::command]
fn create_module(
    payload: CreateModulePayload,
    state: State<'_, AppState>,
) -> Result<Module, String> {
    let trimmed = payload.name.trim();
    if trimmed.is_empty() {
        return Err("module name cannot be empty".to_string());
    }

    let module = {
        let mut data = state
            .data
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;

        if !data.plans.iter().any(|plan| plan.id == payload.plan_id) {
            return Err("plan not found".to_string());
        }

        let module = Module {
            id: make_id("module"),
            plan_id: payload.plan_id,
            parent_module_id: payload.parent_module_id,
            finished: false,
            name: trimmed.to_string(),
        };
        data.modules.push(module.clone());
        module
    };

    state.save()?;
    Ok(module)
}

#[tauri::command]
fn delete_module(id: String, state: State<'_, AppState>) -> Result<(), String> {
    {
        let mut data = state
            .data
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;

        if data.courses.iter().any(|course| course.module_id == id) {
            return Err("module still contains courses".to_string());
        }
        if data
            .modules
            .iter()
            .any(|module| module.parent_module_id.as_deref() == Some(id.as_str()))
        {
            return Err("module still contains child modules".to_string());
        }

        let before = data.modules.len();
        data.modules.retain(|module| module.id != id);
        if before == data.modules.len() {
            return Err("module not found".to_string());
        }
    }

    state.save()
}

#[tauri::command]
fn toggle_module_finished(id: String, state: State<'_, AppState>) -> Result<Module, String> {
    let updated_module = {
        let mut data = state
            .data
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;

        let module = data
            .modules
            .iter_mut()
            .find(|module| module.id == id)
            .ok_or_else(|| "module not found".to_string())?;

        module.finished = !module.finished;
        module.clone()
    };

    state.save()?;
    Ok(updated_module)
}

#[tauri::command]
fn create_course(payload: CoursePayload, state: State<'_, AppState>) -> Result<Course, String> {
    let name = payload.name.trim();
    if name.is_empty() {
        return Err("course name cannot be empty".to_string());
    }
    if let Some(credits) = payload.credits {
        if credits < 0.0 {
            return Err("credits cannot be negative".to_string());
        }
    }

    let course = {
        let mut data = state
            .data
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;

        if !data.modules.iter().any(|module| module.id == payload.module_id) {
            return Err("module not found".to_string());
        }

        let course = Course {
            id: make_id("course"),
            module_id: payload.module_id,
            name: name.to_string(),
            credits: payload.credits,
            note: payload.note.filter(|value| !value.trim().is_empty()),
        };
        data.courses.push(course.clone());
        course
    };

    state.save()?;
    Ok(course)
}

#[tauri::command]
fn create_course_pool_group(
    payload: CoursePoolGroupPayload,
    state: State<'_, AppState>,
) -> Result<CoursePoolGroup, String> {
    let name = payload.name.trim();
    if name.is_empty() {
        return Err("semester name cannot be empty".to_string());
    }

    let group = {
        let mut data = state
            .data
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;

        if data
            .course_pool_groups
            .iter()
            .any(|group| group.name.trim().eq_ignore_ascii_case(name))
        {
            return Err("semester already exists".to_string());
        }

        let group = CoursePoolGroup {
            id: make_id("semester"),
            name: name.to_string(),
        };
        data.course_pool_groups.push(group.clone());
        group
    };

    state.save()?;
    Ok(group)
}

#[tauri::command]
fn delete_course_pool_group(id: String, state: State<'_, AppState>) -> Result<(), String> {
    {
        let mut data = state
            .data
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;

        let group = data
            .course_pool_groups
            .iter()
            .find(|group| group.id == id)
            .cloned()
            .ok_or_else(|| "semester group not found".to_string())?;

        let removed_course_names = data
            .course_pool
            .iter()
            .filter(|course| course.group_id == id)
            .map(|course| course.name.clone())
            .collect::<Vec<_>>();

        data.course_pool_groups.retain(|item| item.id != id);
        data.course_pool.retain(|course| course.group_id != id);
        data.courses
            .retain(|course| !removed_course_names.iter().any(|name| name == &course.name));

        if data.course_pool_groups.is_empty() && !data.course_pool.is_empty() {
            return Err(format!(
                "failed to delete semester group {}",
                group.name
            ));
        }
    }

    state.save()
}

#[tauri::command]
fn create_course_pool_item(
    payload: CoursePoolPayload,
    state: State<'_, AppState>,
) -> Result<CoursePoolItem, String> {
    let name = payload.name.trim();
    if name.is_empty() {
        return Err("course name cannot be empty".to_string());
    }
    if let Some(credits) = payload.credits {
        if credits < 0.0 {
            return Err("credits cannot be negative".to_string());
        }
    }

    let course_pool_item = {
        let mut data = state
            .data
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;

        if !data
            .course_pool_groups
            .iter()
            .any(|group| group.id == payload.group_id)
        {
            return Err("semester group not found".to_string());
        }

        if data
            .course_pool
            .iter()
            .any(|item| item.name.trim().eq_ignore_ascii_case(name))
        {
            return Err("course name already exists in course pool".to_string());
        }

        let course_pool_item = CoursePoolItem {
            id: make_id("pool-course"),
            group_id: payload.group_id,
            name: name.to_string(),
            credits: payload.credits,
            note: payload.note.filter(|value| !value.trim().is_empty()),
        };
        data.course_pool.push(course_pool_item.clone());
        course_pool_item
    };

    state.save()?;
    Ok(course_pool_item)
}

#[tauri::command]
fn create_course_from_pool(
    payload: AddCourseFromPoolPayload,
    state: State<'_, AppState>,
) -> Result<Course, String> {
    let course = {
        let mut data = state
            .data
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;

        if !data.modules.iter().any(|module| module.id == payload.module_id) {
            return Err("module not found".to_string());
        }

        let pool_item = data
            .course_pool
            .iter()
            .find(|item| item.id == payload.course_pool_id)
            .cloned()
            .ok_or_else(|| "course pool item not found".to_string())?;

        let course = Course {
            id: make_id("course"),
            module_id: payload.module_id,
            name: pool_item.name,
            credits: pool_item.credits,
            note: pool_item.note,
        };
        data.courses.push(course.clone());
        course
    };

    state.save()?;
    Ok(course)
}

#[tauri::command]
fn delete_course_pool_item(id: String, state: State<'_, AppState>) -> Result<(), String> {
    {
        let mut data = state
            .data
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;

        let removed_course = data
            .course_pool
            .iter()
            .find(|course| course.id == id)
            .cloned();

        let Some(removed_course) = removed_course else {
            return Err("course pool item not found".to_string());
        };

        data.course_pool.retain(|course| course.id != id);
        data.courses.retain(|course| course.name != removed_course.name);
    }

    state.save()
}

#[tauri::command]
fn delete_course(id: String, state: State<'_, AppState>) -> Result<(), String> {
    {
        let mut data = state
            .data
            .lock()
            .map_err(|_| "state lock poisoned".to_string())?;
        let before = data.courses.len();
        data.courses.retain(|course| course.id != id);
        if before == data.courses.len() {
            return Err("course not found".to_string());
        }
    }

    state.save()
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let state = app_state(&app.handle())?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_snapshot,
            create_plan,
            update_plan,
            delete_plan,
            create_module,
            delete_module,
            toggle_module_finished,
            create_course,
            create_course_pool_group,
            delete_course_pool_group,
            create_course_pool_item,
            create_course_from_pool,
            delete_course_pool_item,
            delete_course
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
