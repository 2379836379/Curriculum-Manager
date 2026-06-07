import "./styles.css";
import { invoke } from "@tauri-apps/api/core";

type View = "plan-home" | "course-pool";

type Plan = {
  id: string;
  name: string;
};

type Module = {
  id: string;
  plan_id: string;
  parent_module_id: string | null;
  finished: boolean;
  name: string;
};

type Course = {
  id: string;
  module_id: string;
  name: string;
  credits: number | null;
  note: string | null;
};

type CoursePoolItem = {
  id: string;
  name: string;
  credits: number | null;
  note: string | null;
};

type PlanSummary = {
  plan_id: string;
  plan_name: string;
  module_count: number;
  course_count: number;
  total_credits: number;
};

type ModuleSummary = {
  module_id: string;
  module_name: string;
  course_count: number;
  total_credits: number;
};

type AppSummary = {
  total_courses: number;
  total_credits: number;
  total_modules: number;
  plans: PlanSummary[];
  modules: ModuleSummary[];
};

type Snapshot = {
  plans: Plan[];
  modules: Module[];
  courses: Course[];
  course_pool: CoursePoolItem[];
  summary: AppSummary;
};

type CreateModulePayload = {
  plan_id: string;
  parent_module_id: string | null;
  name: string;
};

type CreateCoursePoolPayload = {
  name: string;
  credits: number | null;
  note: string | null;
};

type AddCourseFromPoolPayload = {
  module_id: string;
  course_pool_id: string;
};

const state = {
  view: "plan-home" as View,
  plans: [] as Plan[],
  modules: [] as Module[],
  courses: [] as Course[],
  coursePool: [] as CoursePoolItem[],
  summary: {
    total_courses: 0,
    total_credits: 0,
    total_modules: 0,
    plans: [],
    modules: []
  } as AppSummary,
  selectedPlanId: "",
  selectedModuleId: "",
  isCourseFormOpen: false,
  isChildModuleFormOpen: false,
  collapsedModuleIds: [] as string[]
};

const appRoot = document.querySelector<HTMLDivElement>("#app");

if (!appRoot) {
  throw new Error("未找到应用根节点");
}

const app = appRoot;

function formatCredits(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function modulesForSelectedPlan(): Module[] {
  return state.modules.filter((module) => module.plan_id === state.selectedPlanId);
}

function childModulesOf(parentModuleId: string | null): Module[] {
  return modulesForSelectedPlan().filter(
    (module) => (module.parent_module_id ?? null) === parentModuleId
  );
}

function hasChildModules(moduleId: string): boolean {
  return childModulesOf(moduleId).length > 0;
}

function isModuleCollapsed(moduleId: string): boolean {
  return state.collapsedModuleIds.includes(moduleId);
}

function coursesForSelectedModule(): Course[] {
  return state.courses.filter((course) => course.module_id === state.selectedModuleId);
}

function currentPlanSummary(): PlanSummary | undefined {
  return state.summary.plans.find((plan) => plan.plan_id === state.selectedPlanId);
}

function currentModuleSummary(): ModuleSummary | undefined {
  return state.summary.modules.find((module) => module.module_id === state.selectedModuleId);
}

function selectedPoolCourseSummary(course: CoursePoolItem): string {
  const parts = [course.credits === null ? "未设置学分" : `${formatCredits(course.credits)} 学分`];

  if (course.note) {
    parts.push(escapeHtml(course.note));
  }

  return parts.join(" | ");
}

function selectedPlanName(): string {
  return state.plans.find((plan) => plan.id === state.selectedPlanId)?.name ?? "未选择培养方案";
}

function selectedModuleName(): string {
  return modulesForSelectedPlan().find((module) => module.id === state.selectedModuleId)?.name ?? "未选择模块";
}

function render(): void {
  if (state.view === "course-pool") {
    renderCoursePoolPage();
    return;
  }

  if (!state.selectedPlanId) {
    renderPlanHome();
    return;
  }

  renderPlanWorkspace();
}

function renderModuleTree(parentModuleId: string | null, depth = 0): string {
  return childModulesOf(parentModuleId)
    .map((module) => {
      const summary = state.summary.modules.find((item) => item.module_id === module.id);
      const indent = depth * 18;
      const hasChildren = hasChildModules(module.id);
      const collapsed = isModuleCollapsed(module.id);

      return `
        <div class="module-node">
          <div class="module-row" style="padding-left: ${8 + indent}px;">
            ${
              hasChildren
                ? `
                  <button
                    type="button"
                    class="module-toggle"
                    data-module-toggle="${module.id}"
                    aria-label="${collapsed ? "展开子模块" : "收起子模块"}"
                  >
                    ${collapsed ? "+" : "-"}
                  </button>
                `
                : `<span class="module-toggle-placeholder"></span>`
            }
            <button
              type="button"
              class="module-item ${module.id === state.selectedModuleId ? "selected" : ""} ${module.finished ? "finished" : ""}"
              data-module-id="${module.id}"
            >
              <span class="module-name">${escapeHtml(module.name)}</span>
              <span class="module-meta">
                ${summary?.course_count ?? 0} 门课程 / ${formatCredits(summary?.total_credits ?? 0)} 学分
              </span>
            </button>
            <button
              type="button"
              class="module-finished-toggle ${module.finished ? "is-finished" : ""}"
              data-module-finished="${module.id}"
              aria-label="${module.finished ? "标记为未完成" : "标记为已完成"}"
            >
              ${module.finished ? "完成" : "待完成"}
            </button>
          </div>
          ${collapsed ? "" : renderModuleTree(module.id, depth + 1)}
        </div>
      `;
    })
    .join("");
}

function renderPlanHome(): void {
  app.innerHTML = `
    <div class="plan-shell">
      <section class="hero card">
        <p class="eyebrow">培养方案</p>
        <h1>培养方案管理</h1>
        <p class="hero-copy">先创建培养方案，再进入方案创建模块。课程统一在课程池中维护。</p>
        <form id="plan-form" class="hero-form">
          <label>
            <span>培养方案名称</span>
            <input
              name="name"
              type="text"
              placeholder="例如：2024级计算机科学与技术"
              maxlength="48"
              required
            />
          </label>
          <button type="submit">创建培养方案</button>
        </form>
      </section>

      <section class="card quick-entry-card">
        <div class="panel-header">
          <div>
            <p class="eyebrow">课程池</p>
            <h2>全局课程池</h2>
          </div>
          <span class="panel-badge">${state.coursePool.length} 门课程</span>
        </div>
        <p class="hero-copy">模块中添加课程时，统一从共享课程池中选择。</p>
        <button type="button" class="action-button" id="open-course-pool">进入课程池</button>
      </section>

      <section class="plan-grid">
        ${state.plans
          .map((plan) => {
            const summary = state.summary.plans.find((item) => item.plan_id === plan.id);
            return `
              <article class="plan-card card" data-plan-open="${plan.id}">
                <div class="plan-row">
                  <div class="plan-main">
                    <p class="eyebrow">方案</p>
                    <h2>${escapeHtml(plan.name)}</h2>
                  </div>
                  <div class="plan-metrics">
                    <span>${summary?.module_count ?? 0} 个模块</span>
                    <span>${summary?.course_count ?? 0} 门课程</span>
                    <strong>${formatCredits(summary?.total_credits ?? 0)} 学分</strong>
                  </div>
                  <div class="plan-actions">
                    <button type="button" class="secondary-button" data-plan-rename="${plan.id}">重命名</button>
                    <button type="button" class="danger-button" data-plan-delete="${plan.id}">删除</button>
                  </div>
                </div>
              </article>
            `;
          })
          .join("")}
        ${
          state.plans.length === 0
            ? `
              <article class="card empty-panel">
                <p>还没有培养方案，先创建一个方案再开始管理模块和课程。</p>
              </article>
            `
            : ""
        }
      </section>
    </div>
  `;

  bindEvents();
}

function renderCoursePoolPage(): void {
  app.innerHTML = `
    <div class="plan-shell">
      <section class="card pool-panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">课程池</p>
            <h1>全局课程池</h1>
          </div>
          <button type="button" class="ghost-button" id="back-to-home">返回首页</button>
        </div>

        <form id="course-pool-form" class="course-form">
          <label class="field-wide">
            <span>课程名称</span>
            <input
              name="name"
              type="text"
              placeholder="例如：高等数学"
              maxlength="64"
              required
            />
          </label>
          <label>
            <span>学分，可选</span>
            <input
              name="credits"
              type="number"
              min="0"
              step="0.5"
              placeholder="例如：3"
            />
          </label>
          <label class="field-wide">
            <span>备注</span>
            <textarea
              name="note"
              rows="3"
              placeholder="可选"
              maxlength="120"
            ></textarea>
          </label>
          <button type="submit">加入课程池</button>
        </form>

        <div class="course-list">
          ${
            state.coursePool.length === 0
              ? `
                <div class="empty-state">
                  <p>课程池里还没有课程。</p>
                </div>
              `
              : state.coursePool
                  .map(
                    (course) => `
                      <article class="course-item">
                        <div>
                          <h3>${escapeHtml(course.name)}</h3>
                          <p>${selectedPoolCourseSummary(course)}</p>
                        </div>
                        <div class="course-actions">
                          <button
                            type="button"
                            class="danger-button"
                            data-course-pool-delete="${course.id}"
                          >
                            删除
                          </button>
                        </div>
                      </article>
                    `
                  )
                  .join("")
          }
        </div>
      </section>
    </div>
  `;

  bindEvents();
}

function renderPlanWorkspace(): void {
  const visibleModules = modulesForSelectedPlan();
  const selectedPlanSummary = currentPlanSummary();
  const selectedModuleSummary = currentModuleSummary();
  const selectedCourses = coursesForSelectedModule();
  const hasModule = visibleModules.length > 0;

  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar card">
        <div class="panel-header">
          <div>
            <p class="eyebrow">模块</p>
            <h1>${escapeHtml(selectedPlanName())}</h1>
          </div>
          <button type="button" class="ghost-button" id="back-to-plans">返回培养方案</button>
        </div>

        <form id="module-form" class="stack">
          <label>
            <span>新建顶层模块</span>
            <input
              name="name"
              type="text"
              placeholder="例如：专业核心课"
              maxlength="32"
              required
            />
          </label>
          <button type="submit">添加模块</button>
        </form>

        <div class="module-list">
          ${renderModuleTree(null)}
        </div>
      </aside>

      <main class="content">
        <section class="stats-grid">
          <article class="card stat-card">
            <p class="eyebrow">方案学分</p>
            <strong>${formatCredits(state.summary.total_credits)}</strong>
            <span>当前方案总学分</span>
          </article>
          <article class="card stat-card">
            <p class="eyebrow">方案课程</p>
            <strong>${state.summary.total_courses}</strong>
            <span>当前方案课程总数</span>
          </article>
          <article class="card stat-card accent">
            <p class="eyebrow">当前模块</p>
            <strong>${formatCredits(selectedModuleSummary?.total_credits ?? 0)}</strong>
            <span>${escapeHtml(selectedModuleName())} | ${selectedPlanSummary?.course_count ?? 0} 门课程</span>
          </article>
        </section>

        <section class="card content-panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">课程</p>
              <h2>${escapeHtml(selectedModuleName())}</h2>
            </div>
            <div class="panel-toolbar">
              <button
                type="button"
                class="danger-button"
                id="delete-current-module"
                ${state.selectedModuleId ? "" : "disabled"}
              >
                删除模块
              </button>
              <button
                type="button"
                class="secondary-button"
                id="toggle-child-module-form"
                ${state.selectedModuleId ? "" : "disabled"}
              >
                ${state.isChildModuleFormOpen ? "收起子模块表单" : "添加子模块"}
              </button>
              <button
                type="button"
                class="secondary-button"
                id="toggle-course-form"
                ${state.selectedModuleId ? "" : "disabled"}
              >
                ${state.isCourseFormOpen ? "收起选课项" : "添加课程"}
              </button>
              <span class="panel-badge">
                ${selectedModuleSummary?.course_count ?? 0} 门课程
              </span>
            </div>
          </div>

          ${
            state.isChildModuleFormOpen
              ? `
                <form id="child-module-form" class="inline-form">
                  <label>
                    <span>子模块名称</span>
                    <input
                      name="name"
                      type="text"
                      placeholder="例如：数学基础"
                      maxlength="32"
                      ${state.selectedModuleId ? "required" : "disabled"}
                    />
                  </label>
                  <button type="submit" ${state.selectedModuleId ? "" : "disabled"}>保存子模块</button>
                </form>
              `
              : ""
          }

          ${
            state.isCourseFormOpen
              ? `
                <form id="course-form" class="course-form">
                  <label class="field-wide">
                    <span>从课程池选择课程</span>
                    <select name="coursePoolId" ${hasModule && state.coursePool.length > 0 ? "" : "disabled"}>
                      ${state.coursePool
                        .map(
                          (course) => `
                            <option value="${course.id}">
                              ${escapeHtml(course.name)}
                            </option>
                          `
                        )
                        .join("")}
                    </select>
                  </label>
                  <label>
                    <span>模块</span>
                    <select name="moduleId" ${hasModule ? "" : "disabled"}>
                      ${visibleModules
                        .map(
                          (module) => `
                            <option value="${module.id}" ${module.id === state.selectedModuleId ? "selected" : ""}>
                              ${escapeHtml(module.name)}
                            </option>
                          `
                        )
                        .join("")}
                    </select>
                  </label>
                  <button type="submit" ${hasModule && state.coursePool.length > 0 ? "" : "disabled"}>添加所选课程</button>
                </form>
              `
              : ""
          }

          <div class="course-list">
            ${
              selectedCourses.length === 0
                ? `
                  <div class="empty-state">
                    <p>${hasModule ? "这个模块里还没有课程。" : "请先在该培养方案中创建模块，再添加课程。"}</p>
                  </div>
                `
                : selectedCourses
                    .map(
                      (course) => `
                        <article class="course-item">
                          <div>
                            <h3>${escapeHtml(course.name)}</h3>
                            <p>
                              ${course.note ? escapeHtml(course.note) : "无备注"}
                            </p>
                          </div>
                          <div class="course-actions">
                            <span class="credits-pill">
                              ${course.credits === null ? "未设置学分" : `${formatCredits(course.credits)} 学分`}
                            </span>
                            <button
                              type="button"
                              class="danger-button"
                              data-course-id="${course.id}"
                            >
                              删除
                            </button>
                          </div>
                        </article>
                      `
                    )
                    .join("")
            }
          </div>
        </section>
      </main>
    </div>
  `;

  bindEvents();
}

function bindEvents(): void {
  const planForm = document.querySelector<HTMLFormElement>("#plan-form");
  const coursePoolForm = document.querySelector<HTMLFormElement>("#course-pool-form");
  const moduleForm = document.querySelector<HTMLFormElement>("#module-form");
  const childModuleForm = document.querySelector<HTMLFormElement>("#child-module-form");
  const courseForm = document.querySelector<HTMLFormElement>("#course-form");
  const openCoursePoolButton = document.querySelector<HTMLButtonElement>("#open-course-pool");
  const backToHomeButton = document.querySelector<HTMLButtonElement>("#back-to-home");
  const backButton = document.querySelector<HTMLButtonElement>("#back-to-plans");
  const toggleCourseFormButton = document.querySelector<HTMLButtonElement>("#toggle-course-form");
  const toggleChildModuleFormButton = document.querySelector<HTMLButtonElement>("#toggle-child-module-form");
  const deleteCurrentModuleButton = document.querySelector<HTMLButtonElement>("#delete-current-module");

  planForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(planForm);
    const name = String(formData.get("name") ?? "").trim();
    if (!name) {
      return;
    }

    const plan = await invoke<Plan>("create_plan", { name });
    state.selectedPlanId = plan.id;
    await refresh();
  });

  coursePoolForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(coursePoolForm);
    const name = String(formData.get("name") ?? "").trim();
    const note = String(formData.get("note") ?? "").trim();
    const creditsRaw = String(formData.get("credits") ?? "").trim();
    const credits = creditsRaw ? Number(creditsRaw) : null;

    if (!name || (credits !== null && (Number.isNaN(credits) || credits < 0))) {
      return;
    }

    const payload: CreateCoursePoolPayload = {
      name,
      credits,
      note: note || null
    };

    try {
      await invoke<CoursePoolItem>("create_course_pool_item", { payload });
      coursePoolForm.reset();
      await refresh();
    } catch (error) {
      window.alert(String(error));
    }
  });

  moduleForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(moduleForm);
    const name = String(formData.get("name") ?? "").trim();
    if (!name || !state.selectedPlanId) {
      return;
    }

    const payload: CreateModulePayload = {
      plan_id: state.selectedPlanId,
      parent_module_id: null,
      name
    };

    await invoke<Module>("create_module", { payload });
    moduleForm.reset();
    await refresh();
  });

  childModuleForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(childModuleForm);
    const name = String(formData.get("name") ?? "").trim();
    if (!name || !state.selectedPlanId || !state.selectedModuleId) {
      return;
    }

    const payload: CreateModulePayload = {
      plan_id: state.selectedPlanId,
      parent_module_id: state.selectedModuleId,
      name
    };

    await invoke<Module>("create_module", { payload });
    state.isChildModuleFormOpen = false;
    childModuleForm.reset();
    await refresh();
  });

  courseForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(courseForm);
    const coursePoolId = String(formData.get("coursePoolId") ?? "");
    const moduleId = String(formData.get("moduleId") ?? "");

    if (!coursePoolId || !moduleId) {
      return;
    }

    const payload: AddCourseFromPoolPayload = {
      module_id: moduleId,
      course_pool_id: coursePoolId
    };

    await invoke<Course>("create_course_from_pool", { payload });
    state.isCourseFormOpen = false;
    courseForm.reset();
    const select = courseForm.querySelector<HTMLSelectElement>('select[name="moduleId"]');
    if (select) {
      select.value = state.selectedModuleId;
    }
    await refresh();
  });

  openCoursePoolButton?.addEventListener("click", () => {
    state.view = "course-pool";
    render();
  });

  backToHomeButton?.addEventListener("click", () => {
    state.view = "plan-home";
    render();
  });

  document.querySelectorAll<HTMLElement>("[data-plan-open]").forEach((element) => {
    element.addEventListener("click", async () => {
      const planId = element.dataset.planOpen;
      if (!planId) {
        return;
      }

      state.view = "plan-home";
      state.selectedPlanId = planId;
      state.selectedModuleId = "";
      await refresh();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-course-pool-delete]").forEach((element) => {
    element.addEventListener("click", async () => {
      const coursePoolId = element.dataset.coursePoolDelete;
      if (!coursePoolId) {
        return;
      }

      await invoke("delete_course_pool_item", { id: coursePoolId });
      await refresh();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-plan-rename]").forEach((element) => {
    element.addEventListener("click", async (event) => {
      event.stopPropagation();
      const planId = element.dataset.planRename;
      if (!planId) {
        return;
      }

      const currentName = state.plans.find((plan) => plan.id === planId)?.name ?? "";
      const nextName = window.prompt("请输入新的培养方案名称", currentName)?.trim();
      if (!nextName || nextName === currentName) {
        return;
      }

      await invoke<Plan>("update_plan", { id: planId, name: nextName });
      await refresh();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-plan-delete]").forEach((element) => {
    element.addEventListener("click", async (event) => {
      event.stopPropagation();
      const planId = element.dataset.planDelete;
      if (!planId) {
        return;
      }

      const plan = state.plans.find((item) => item.id === planId);
      if (!plan) {
        return;
      }

      const confirmed = window.confirm(`确定删除培养方案“${plan.name}”吗？只有空方案才能删除。`);
      if (!confirmed) {
        return;
      }

      try {
        await invoke("delete_plan", { id: planId });
        await refresh();
      } catch (error) {
        window.alert(String(error));
      }
    });
  });

  document.querySelectorAll<HTMLElement>("[data-module-id]").forEach((element) => {
    element.addEventListener("click", () => {
      const moduleId = element.dataset.moduleId;
      if (!moduleId) {
        return;
      }

      state.selectedModuleId = moduleId;
      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-module-toggle]").forEach((element) => {
    element.addEventListener("click", () => {
      const moduleId = element.dataset.moduleToggle;
      if (!moduleId) {
        return;
      }

      if (isModuleCollapsed(moduleId)) {
        state.collapsedModuleIds = state.collapsedModuleIds.filter((id) => id !== moduleId);
      } else {
        state.collapsedModuleIds.push(moduleId);
      }

      render();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-module-finished]").forEach((element) => {
    element.addEventListener("click", async () => {
      const moduleId = element.dataset.moduleFinished;
      if (!moduleId) {
        return;
      }

      await invoke<Module>("toggle_module_finished", { id: moduleId });
      await refresh();
    });
  });

  document.querySelectorAll<HTMLElement>("[data-course-id]").forEach((element) => {
    element.addEventListener("click", async () => {
      const courseId = element.dataset.courseId;
      if (!courseId) {
        return;
      }

      await invoke("delete_course", { id: courseId });
      await refresh();
    });
  });

  backButton?.addEventListener("click", async () => {
    state.view = "plan-home";
    state.selectedPlanId = "";
    state.selectedModuleId = "";
    state.isCourseFormOpen = false;
    state.isChildModuleFormOpen = false;
    await refresh();
  });

  toggleCourseFormButton?.addEventListener("click", () => {
    state.isCourseFormOpen = !state.isCourseFormOpen;
    if (state.isCourseFormOpen) {
      state.isChildModuleFormOpen = false;
    }
    render();
  });

  toggleChildModuleFormButton?.addEventListener("click", () => {
    state.isChildModuleFormOpen = !state.isChildModuleFormOpen;
    if (state.isChildModuleFormOpen) {
      state.isCourseFormOpen = false;
    }
    render();
  });

  deleteCurrentModuleButton?.addEventListener("click", async () => {
    if (!state.selectedModuleId) {
      return;
    }

    await deleteModuleById(state.selectedModuleId);
  });
}

async function deleteModuleById(moduleId: string): Promise<void> {
  const moduleName = state.modules.find((module) => module.id === moduleId)?.name ?? "该模块";
  const confirmed = window.confirm(`确定删除模块“${moduleName}”吗？只有空模块才能删除。`);
  if (!confirmed) {
    return;
  }

  try {
    await invoke("delete_module", { id: moduleId });
    if (state.selectedModuleId === moduleId) {
      state.selectedModuleId = "";
      state.isCourseFormOpen = false;
      state.isChildModuleFormOpen = false;
    }
    await refresh();
  } catch (error) {
    window.alert(String(error));
  }
}

async function refresh(): Promise<void> {
  const snapshot = await invoke<Snapshot>("get_snapshot", {
    selectedPlanId: state.selectedPlanId || null
  });

  state.plans = snapshot.plans;
  state.modules = snapshot.modules;
  state.courses = snapshot.courses;
  state.coursePool = snapshot.course_pool;
  state.summary = snapshot.summary;

  const visibleModules = modulesForSelectedPlan();

  state.collapsedModuleIds = state.collapsedModuleIds.filter((id) =>
    visibleModules.some((module) => module.id === id)
  );

  if (!state.selectedPlanId || !state.plans.some((plan) => plan.id === state.selectedPlanId)) {
    state.selectedPlanId = "";
    state.selectedModuleId = "";
    state.isCourseFormOpen = false;
    state.isChildModuleFormOpen = false;
  } else if (!visibleModules.some((module) => module.id === state.selectedModuleId)) {
    state.selectedModuleId = visibleModules[0]?.id ?? "";
    if (!state.selectedModuleId) {
      state.isCourseFormOpen = false;
      state.isChildModuleFormOpen = false;
    }
  }

  render();
}

refresh().catch((error) => {
  app.innerHTML = `
    <div class="fatal-error">
      <h1>应用加载失败</h1>
      <p>${escapeHtml(String(error))}</p>
    </div>
  `;
});
