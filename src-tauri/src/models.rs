use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Plan {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Module {
    pub id: String,
    #[serde(default)]
    pub plan_id: String,
    #[serde(default)]
    pub parent_module_id: Option<String>,
    #[serde(default)]
    pub finished: bool,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Course {
    pub id: String,
    pub module_id: String,
    pub name: String,
    pub credits: Option<f32>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoursePoolItem {
    pub id: String,
    pub group_id: String,
    pub name: String,
    pub credits: Option<f32>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoursePoolGroup {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppData {
    #[serde(default)]
    pub plans: Vec<Plan>,
    #[serde(default)]
    pub modules: Vec<Module>,
    #[serde(default)]
    pub courses: Vec<Course>,
    #[serde(default)]
    pub course_pool_groups: Vec<CoursePoolGroup>,
    #[serde(default)]
    pub course_pool: Vec<CoursePoolItem>,
}

impl AppData {
    pub fn normalize(mut self) -> Self {
        let needs_default_plan = !self.modules.is_empty()
            && (self.plans.is_empty()
                || self
                    .modules
                    .iter()
                    .any(|module| module.plan_id.is_empty()));

        if needs_default_plan {
            let fallback_plan_id = self
                .plans
                .first()
                .map(|plan| plan.id.clone())
                .unwrap_or_else(|| "plan-migrated".to_string());

            if self.plans.is_empty() {
                self.plans.push(Plan {
                    id: fallback_plan_id.clone(),
                    name: "Default Plan".to_string(),
                });
            }

            for module in &mut self.modules {
                if module.plan_id.is_empty() {
                    module.plan_id = fallback_plan_id.clone();
                }
            }
        }

        if !self.course_pool.is_empty() && self.course_pool_groups.is_empty() {
            let fallback_group_id = "semester-migrated".to_string();
            self.course_pool_groups.push(CoursePoolGroup {
                id: fallback_group_id.clone(),
                name: "Ungrouped".to_string(),
            });

            for course in &mut self.course_pool {
                course.group_id = fallback_group_id.clone();
            }
        } else if let Some(first_group_id) = self.course_pool_groups.first().map(|group| group.id.clone()) {
            for course in &mut self.course_pool {
                if course.group_id.is_empty() {
                    course.group_id = first_group_id.clone();
                }
            }
        }

        self
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct PlanSummary {
    pub plan_id: String,
    pub plan_name: String,
    pub module_count: usize,
    pub course_count: usize,
    pub total_credits: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModuleSummary {
    pub module_id: String,
    pub module_name: String,
    pub course_count: usize,
    pub total_credits: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct AppSummary {
    pub total_courses: usize,
    pub total_credits: f32,
    pub total_modules: usize,
    pub plans: Vec<PlanSummary>,
    pub modules: Vec<ModuleSummary>,
}

impl AppSummary {
    pub fn from_data(data: &AppData, selected_plan_id: Option<&str>) -> Self {
        let visible_modules = data
            .modules
            .iter()
            .filter(|module| selected_plan_id.is_none_or(|plan_id| module.plan_id == plan_id))
            .collect::<Vec<_>>();

        let visible_courses = data
            .courses
            .iter()
            .filter(|course| visible_modules.iter().any(|module| module.id == course.module_id))
            .collect::<Vec<_>>();

        let plans = data
            .plans
            .iter()
            .map(|plan| {
                let plan_modules = data
                    .modules
                    .iter()
                    .filter(|module| module.plan_id == plan.id)
                    .collect::<Vec<_>>();
                let plan_courses = data
                    .courses
                    .iter()
                    .filter(|course| plan_modules.iter().any(|module| module.id == course.module_id))
                    .collect::<Vec<_>>();

                PlanSummary {
                    plan_id: plan.id.clone(),
                    plan_name: plan.name.clone(),
                    module_count: plan_modules.len(),
                    course_count: plan_courses.len(),
                    total_credits: plan_courses
                        .iter()
                        .map(|course| course.credits.unwrap_or(0.0))
                        .sum(),
                }
            })
            .collect::<Vec<_>>();

        let modules = visible_modules
            .iter()
            .map(|module| {
                let module_courses = visible_courses
                    .iter()
                    .filter(|course| course.module_id == module.id)
                    .collect::<Vec<_>>();

                ModuleSummary {
                    module_id: module.id.clone(),
                    module_name: module.name.clone(),
                    course_count: module_courses.len(),
                    total_credits: module_courses
                        .iter()
                        .map(|course| course.credits.unwrap_or(0.0))
                        .sum(),
                }
            })
            .collect::<Vec<_>>();

        Self {
            total_courses: visible_courses.len(),
            total_credits: visible_courses
                .iter()
                .map(|course| course.credits.unwrap_or(0.0))
                .sum(),
            total_modules: visible_modules.len(),
            plans,
            modules,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateModulePayload {
    pub plan_id: String,
    pub parent_module_id: Option<String>,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct CoursePayload {
    pub module_id: String,
    pub name: String,
    pub credits: Option<f32>,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CoursePoolPayload {
    pub group_id: String,
    pub name: String,
    pub credits: Option<f32>,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CoursePoolGroupPayload {
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct AddCourseFromPoolPayload {
    pub module_id: String,
    pub course_pool_id: String,
}

#[derive(Debug, Serialize)]
pub struct Snapshot {
    pub plans: Vec<Plan>,
    pub modules: Vec<Module>,
    pub courses: Vec<Course>,
    pub course_pool_groups: Vec<CoursePoolGroup>,
    pub course_pool: Vec<CoursePoolItem>,
    pub summary: AppSummary,
}
