const STORAGE_KEY = "todos";
const STATUSES = ["예정", "진행중", "완료"];
const STATUS_PROGRESS = { 예정: 0, 진행중: 50, 완료: 100 };
const PRIORITIES = ["높음", "보통", "낮음"];
const PRIO_RANK = { 높음: 0, 보통: 1, 낮음: 2 };
const RECURRENCES = ["없음", "매일", "매주", "매월"];

/* ---------- Supabase ---------- */

const SUPABASE_URL = "https://spbdgzttmkawxkhferxb.supabase.co";
const SUPABASE_KEY = "sb_publishable_uFai1IUvgUWTYmQ9AwHuYw_CTUrMjYt";
const sb = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;

let session = null;
let todos = [];
let currentFilter = "all";
let currentView = "list";
let editingId = null;
let searchQuery = "";
let sortMode = "start";

// 프로젝트별 색상 (애플 시스템 색 기반 8색 팔레트 — 라이트/다크 공용)
const PROJECT_PALETTE = [
  "#0066cc", // 파랑
  "#34c759", // 초록
  "#ff9500", // 주황
  "#af52de", // 보라
  "#ff2d55", // 분홍
  "#00b8c4", // 청록
  "#a2845e", // 갈색
  "#8e8e93", // 회색
];
let projectColorMap = {};
try {
  projectColorMap = JSON.parse(localStorage.getItem("projectColors") || "{}");
} catch {
  projectColorMap = {};
}
let colorBy = localStorage.getItem("colorBy") || "status";

// 승인 집계 (MES 조회 건수 배치 입력) — 로컬 저장만, 클라우드 전송 안 함
const APPROVAL_TYPES = ["order", "출하승인", "기타"];
let approvalLogs = [];
try {
  approvalLogs = JSON.parse(localStorage.getItem("approvalLogs") || "[]");
} catch {
  approvalLogs = [];
}
function saveApprovals() {
  localStorage.setItem("approvalLogs", JSON.stringify(approvalLogs));
}

function saveProjectColors() {
  localStorage.setItem("projectColors", JSON.stringify(projectColorMap));
}

function projectColorIndex(project) {
  if (projectColorMap[project] == null) {
    const used = new Set(Object.values(projectColorMap));
    let idx = 0;
    while (idx < PROJECT_PALETTE.length && used.has(idx)) idx++;
    if (idx >= PROJECT_PALETTE.length)
      idx = Object.keys(projectColorMap).length % PROJECT_PALETTE.length;
    projectColorMap[project] = idx;
    saveProjectColors();
  }
  return projectColorMap[project];
}

function projectColor(project) {
  if (!project) return "var(--color-ink-muted-48)";
  return PROJECT_PALETTE[projectColorIndex(project)];
}

const form = document.getElementById("todo-form");
const input = document.getElementById("todo-input");
const projectInput = document.getElementById("project-input");
const projectList = document.getElementById("project-list");
const memoInput = document.getElementById("memo-input");
const startInput = document.getElementById("start-input");
const endInput = document.getElementById("end-input");
const statusInput = document.getElementById("status-input");
const list = document.getElementById("todo-list");
const itemsLeft = document.getElementById("items-left");
const clearCompletedBtn = document.getElementById("clear-completed");
const exportBtn = document.getElementById("export-btn");
const importBtn = document.getElementById("import-btn");
const importFile = document.getElementById("import-file");
const filterBtns = document.querySelectorAll(".filter-btn");
const viewTabs = document.querySelectorAll(".view-tab");
const listView = document.getElementById("list-view");
const ganttView = document.getElementById("gantt-view");
const ganttChart = document.getElementById("gantt-chart");
const boardView = document.getElementById("board-view");
const boardEl = document.getElementById("board");
const summaryEl = document.getElementById("summary");
const searchInput = document.getElementById("search-input");
const sortSelect = document.getElementById("sort-select");
const colorbySelect = document.getElementById("colorby-select");
const projectLegend = document.getElementById("project-legend");
const boardKey = document.getElementById("board-key");
const ganttKey = document.getElementById("gantt-key");
const calendarKey = document.getElementById("calendar-key");
const priorityInput = document.getElementById("priority-input");
const recurrenceInput = document.getElementById("recurrence-input");
const notifyBtn = document.getElementById("notify-btn");
const quickForm = document.getElementById("quick-form");
const quickInput = document.getElementById("quick-input");
const quickPreview = document.getElementById("quick-preview");
const detailForm = document.getElementById("detail-form");
const calendarView = document.getElementById("calendar-view");
const statsView = document.getElementById("stats-view");
const calGrid = document.getElementById("calendar-grid");
const calTitle = document.getElementById("cal-title");
const calPrev = document.getElementById("cal-prev");
const calNext = document.getElementById("cal-next");
const calTodayBtn = document.getElementById("cal-today");
const statsEl = document.getElementById("stats");
const approvalView = document.getElementById("approval-view");
const approvalForm = document.getElementById("approval-form");
const approvalDate = document.getElementById("approval-date");
const approvalType = document.getElementById("approval-type");
const approvalCount = document.getElementById("approval-count");
const approvalBody = document.getElementById("approval-body");
const dateEl = document.getElementById("date");

const authEmail = document.getElementById("auth-email");
const authPassword = document.getElementById("auth-password");
const loginBtn = document.getElementById("login-btn");
const signupBtn = document.getElementById("signup-btn");
const logoutBtn = document.getElementById("logout-btn");
const authLoggedOut = document.getElementById("auth-logged-out");
const authLoggedIn = document.getElementById("auth-logged-in");
const authUser = document.getElementById("auth-user");

/* ---------- 데이터 유틸 ---------- */

function normalizeTodo(t) {
  // 날짜 정규화: 둘 다 비면 '기간 미정', 한쪽만 있으면 나머지를 채움, 뒤집히면 보정
  let s = t.startDate || "";
  let e = t.endDate || "";
  if (s && e && e < s) e = s;
  if (s && !e) e = s;
  if (e && !s) s = e;
  return {
    id: t.id || Date.now() + Math.floor(Math.random() * 1000),
    text: t.text || "",
    memo: t.memo || "",
    project: t.project || "",
    startDate: s,
    endDate: e,
    status: STATUSES.includes(t.status) ? t.status : t.completed ? "완료" : "예정",
    priority: PRIORITIES.includes(t.priority) ? t.priority : "보통",
    recurrence: RECURRENCES.includes(t.recurrence) ? t.recurrence : "없음",
    completedAt: t.completedAt || (t.status === "완료" ? t.completedAt || "" : ""),
  };
}

function isUndated(t) {
  return !t.endDate;
}

function fromRow(r) {
  return {
    id: r.id,
    text: r.text,
    memo: r.memo || "",
    project: r.project || "",
    startDate: r.start_date || "",
    endDate: r.end_date || "",
    status: r.status,
    priority: PRIORITIES.includes(r.priority) ? r.priority : "보통",
    recurrence: RECURRENCES.includes(r.recurrence) ? r.recurrence : "없음",
    completedAt: r.completed_at || "",
  };
}

// DB에 아직 없는 선택 컬럼은 자동으로 빼고 저장 (SQL 실행 전에도 앱이 동작)
// 컬럼명(앱 필드) → DB 컬럼명 매핑
const OPTIONAL_COLS = {
  priority: "priority",
  recurrence: "recurrence",
  completedAt: "completed_at",
};
const missingCols = new Set();

function toRow(t) {
  const row = {
    id: t.id,
    text: t.text,
    memo: t.memo,
    project: t.project,
    status: t.status,
  };
  row.start_date = t.startDate || null;
  row.end_date = t.endDate || null;
  if (!missingCols.has("priority")) row.priority = t.priority;
  if (!missingCols.has("recurrence")) row.recurrence = t.recurrence;
  if (!missingCols.has("completedAt")) row.completed_at = t.completedAt || null;
  return row;
}

// 에러 메시지에서 누락된 선택 컬럼을 찾아 표시. 새로 발견하면 true 반환(재시도용)
function detectMissingColumn(error) {
  const msg = error.message || "";
  let found = false;
  for (const [field, col] of Object.entries(OPTIONAL_COLS)) {
    if (missingCols.has(field)) continue;
    const re = new RegExp(`\\b${col}\\b`, "i");
    if (re.test(msg)) {
      missingCols.add(field);
      found = true;
    }
  }
  return found;
}

function syncOkOrWarn() {
  if (missingCols.size > 0) {
    const labels = [...missingCols].map((f) =>
      f === "priority" ? "우선순위" : f === "recurrence" ? "반복" : "완료일"
    );
    setSync(`동기화됨 (${labels.join("·")} 제외 — Supabase 컬럼 추가 필요)`, true);
  } else {
    syncOk();
  }
}

function loadLocal() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? JSON.parse(raw) : [];
  return parsed.map(normalizeTodo);
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

const syncStatus = document.getElementById("sync-status");

function setSync(msg, isError) {
  if (!syncStatus) return;
  syncStatus.textContent = msg;
  syncStatus.classList.toggle("sync-error", !!isError);
}

function syncOk() {
  const t = new Date().toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  setSync(`동기화됨 · ${t}`);
}

function cloudError(error, action) {
  console.error(action, error);
  const msg = error.message || "";
  if (/null value|not-null/i.test(msg) && /start_date|end_date/i.test(msg)) {
    setSync(
      "기간 미정 업무는 클라우드 저장 전 SQL 필요 (날짜 컬럼 NULL 허용). 로컬에는 저장됨",
      true
    );
    return;
  }
  setSync(`${action} 실패: ${error.message}`, true);
}

async function cloudLoad() {
  const { data, error } = await sb.from("todos").select("*");
  if (error) {
    cloudError(error, "불러오기");
    return null;
  }
  return data.map(fromRow);
}

async function cloudInsert(todo) {
  let { error } = await sb.from("todos").insert(toRow(todo));
  if (error && detectMissingColumn(error)) {
    ({ error } = await sb.from("todos").insert(toRow(todo)));
  }
  if (error) cloudError(error, "저장");
  else syncOkOrWarn();
}

async function cloudUpdate(todo) {
  let { error } = await sb.from("todos").update(toRow(todo)).eq("id", todo.id);
  if (error && detectMissingColumn(error)) {
    ({ error } = await sb.from("todos").update(toRow(todo)).eq("id", todo.id));
  }
  if (error) cloudError(error, "수정");
  else syncOkOrWarn();
}

async function cloudDelete(id) {
  const { error } = await sb.from("todos").delete().eq("id", id);
  if (error) cloudError(error, "삭제");
  else syncOk();
}

async function cloudReplaceAll(items) {
  const { error: delErr } = await sb.from("todos").delete().neq("id", -1);
  if (delErr) return cloudError(delErr, "교체(삭제)");
  if (items.length) {
    let { error: insErr } = await sb.from("todos").insert(items.map(toRow));
    if (insErr && detectMissingColumn(insErr)) {
      ({ error: insErr } = await sb.from("todos").insert(items.map(toRow)));
    }
    if (insErr) return cloudError(insErr, "교체(저장)");
  }
  syncOkOrWarn();
}

function persist() {
  saveLocal();
}

/* ---------- 인증 ---------- */

function updateAuthUI() {
  const loggedIn = !!session;
  authLoggedOut.classList.toggle("hidden", loggedIn);
  authLoggedIn.classList.toggle("hidden", !loggedIn);
  if (loggedIn) authUser.textContent = session.user.email;
}

let loadingCloud = false;
const pendingAdds = new Set();

async function initData() {
  if (session && sb) {
    loadingCloud = true;
    setSync("클라우드에서 불러오는 중…");
    const cloud = await cloudLoad();
    loadingCloud = false;
    if (cloud === null) {
      todos = loadLocal();
      render();
      return;
    }
    const local = loadLocal();
    if (cloud.length === 0 && local.length > 0) {
      // 클라우드가 비어 있고 이 브라우저에 데이터가 있으면 자동 업로드 (내 데이터이므로 안전)
      todos = local;
      await cloudReplaceAll(local);
    } else {
      // 클라우드를 기준으로 하되, 불러오는 사이에 화면에서 추가한 항목은 유지 + 업로드
      const cloudIds = new Set(cloud.map((t) => t.id));
      const pendingNew = todos.filter(
        (t) => pendingAdds.has(t.id) && !cloudIds.has(t.id)
      );
      todos = [...cloud, ...pendingNew];
      pendingNew.forEach((t) => cloudInsert(t));
      if (!pendingNew.length) syncOk();
    }
    pendingAdds.clear();
    saveLocal();
  } else {
    todos = loadLocal();
  }
  render();
  checkDeadlineNotifications();
}

async function login() {
  const email = authEmail.value.trim();
  const password = authPassword.value;
  if (!email || !password) return alert("이메일과 비밀번호를 입력해주세요.");
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) alert(`로그인 실패: ${error.message}`);
}

async function signup() {
  const email = authEmail.value.trim();
  const password = authPassword.value;
  if (!email || !password) return alert("이메일과 비밀번호를 입력해주세요.");
  if (password.length < 6) return alert("비밀번호는 6자 이상이어야 합니다.");
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) return alert(`회원가입 실패: ${error.message}`);
  if (data.session) return; // 이메일 확인 꺼져 있으면 바로 로그인됨
  alert("확인 이메일을 보냈습니다. 메일함에서 인증 후 로그인해주세요.");
}

async function logout() {
  await sb.auth.signOut();
}

/* ---------- 공통 유틸 ---------- */

function todayStr() {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function diffDays(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}

function isOverdue(todo) {
  return !isUndated(todo) && todo.status !== "완료" && todo.endDate < todayStr();
}

function setDate() {
  dateEl.textContent = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function sortByStart(arr) {
  // 기간 미정 업무는 항상 맨 뒤로
  const byUndated = (a, b) => (isUndated(a) ? 1 : 0) - (isUndated(b) ? 1 : 0);
  if (sortMode === "priority") {
    return [...arr].sort(
      (a, b) =>
        byUndated(a, b) ||
        PRIO_RANK[a.priority] - PRIO_RANK[b.priority] ||
        a.endDate.localeCompare(b.endDate)
    );
  }
  if (sortMode === "end") {
    return [...arr].sort(
      (a, b) =>
        byUndated(a, b) ||
        (a.endDate === b.endDate
          ? a.startDate.localeCompare(b.startDate)
          : a.endDate.localeCompare(b.endDate))
    );
  }
  return [...arr].sort(
    (a, b) =>
      byUndated(a, b) ||
      (a.startDate === b.startDate
        ? a.endDate.localeCompare(b.endDate)
        : a.startDate.localeCompare(b.startDate))
  );
}

function applySearch(arr) {
  if (!searchQuery) return arr;
  const q = searchQuery.toLowerCase();
  return arr.filter(
    (t) =>
      t.text.toLowerCase().includes(q) ||
      t.project.toLowerCase().includes(q) ||
      t.memo.toLowerCase().includes(q)
  );
}

function dDay(todo) {
  // 완료·미정 업무는 D-day 없음. 반환: null | 0(오늘 마감) | 양수(남은 일수) | 음수(지연 일수)
  if (todo.status === "완료" || isUndated(todo)) return null;
  return diffDays(todayStr(), todo.endDate);
}

function getProjects() {
  return [...new Set(todos.map((t) => t.project).filter(Boolean))];
}

function updateProjectDatalist() {
  projectList.innerHTML = "";
  getProjects().forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p;
    projectList.appendChild(opt);
  });
}

/* ---------- 데이터 조작 ---------- */

function addTodo(data) {
  const todo = normalizeTodo({ id: Date.now(), ...data });
  todos.push(todo);
  if (loadingCloud) pendingAdds.add(todo.id);
  persist();
  if (session && !loadingCloud) cloudInsert(todo);
  render();
}

function updateTodo(id, data) {
  const idx = todos.findIndex((t) => t.id === id);
  if (idx === -1) return;
  todos[idx] = normalizeTodo({ ...todos[idx], ...data });
  persist();
  if (session) cloudUpdate(todos[idx]);
  render();
}

function nextRecurDate(dateStr, recurrence) {
  if (recurrence === "매일") return addDays(dateStr, 1);
  if (recurrence === "매주") return addDays(dateStr, 7);
  if (recurrence === "매월") {
    const d = new Date(dateStr);
    d.setUTCMonth(d.getUTCMonth() + 1);
    return d.toISOString().slice(0, 10);
  }
  return dateStr;
}

// 반복 업무가 완료되면 다음 회차를 자동 생성
function spawnNextOccurrence(todo) {
  const next = normalizeTodo({
    id: Date.now() + Math.floor(Math.random() * 1000),
    text: todo.text,
    memo: todo.memo,
    project: todo.project,
    startDate: nextRecurDate(todo.startDate, todo.recurrence),
    endDate: nextRecurDate(todo.endDate, todo.recurrence),
    status: "예정",
    priority: todo.priority,
    recurrence: todo.recurrence,
  });
  // 완료된 원본은 기록으로 남기고 반복은 새 회차가 이어받음
  todo.recurrence = "없음";
  todos.push(next);
  if (session) cloudInsert(next);
  return next;
}

function setStatus(id, status) {
  const todo = todos.find((t) => t.id === id);
  if (!todo) return;
  const wasCompleted = todo.status === "완료";
  todo.status = status;
  let spawned = null;
  if (status === "완료") {
    if (!todo.completedAt) todo.completedAt = todayStr();
    if (!wasCompleted && todo.recurrence && todo.recurrence !== "없음") {
      spawned = spawnNextOccurrence(todo);
    }
  } else {
    todo.completedAt = "";
  }
  persist();
  if (session) cloudUpdate(todo);
  render();
  if (spawned) {
    setSync(`반복 업무 다음 회차 생성됨 (${spawned.endDate})`);
  }
}

function deleteTodo(id) {
  todos = todos.filter((t) => t.id !== id);
  persist();
  if (session) cloudDelete(id);
  render();
}

function clearCompleted() {
  const removed = todos.filter((t) => t.status === "완료");
  todos = todos.filter((t) => t.status !== "완료");
  persist();
  if (session) removed.forEach((t) => cloudDelete(t.id));
  render();
}

function getFilteredTodos() {
  const base = applySearch(todos);
  if (currentFilter === "all") return base;
  if (currentFilter === "지연") return base.filter(isOverdue);
  if (currentFilter === "오늘마감")
    return base.filter((t) => dDay(t) === 0);
  if (currentFilter === "임박")
    return base.filter((t) => {
      const d = dDay(t);
      return d !== null && d >= 0 && d <= 3;
    });
  return base.filter((t) => t.status === currentFilter);
}

function render() {
  renderSummary();
  renderProjectLegend();
  renderProjectKeys();
  renderList();
  renderBoard();
  renderGantt();
  renderCalendar();
  renderStats();
  renderNoteTasks(); // 노트의 '이 날짜의 업무' 스트립 갱신 (textarea는 건드리지 않음)
  updateProjectDatalist();
  updateSwSummary();
}

/* ---------- 프로젝트 색상 범례/관리 ---------- */

function renderProjectLegend() {
  projectLegend.innerHTML = "";
  const projects = getProjects();
  if (projects.length === 0) {
    projectLegend.style.display = "none";
    return;
  }
  projectLegend.style.display = "flex";

  const caption = document.createElement("span");
  caption.className = "legend-caption";
  caption.textContent = "프로젝트";
  projectLegend.appendChild(caption);

  projects.forEach((p) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "proj-legend-chip";
    chip.title = "클릭하면 색상 변경";
    const dot = document.createElement("span");
    dot.className = "proj-dot";
    dot.style.background = projectColor(p);
    const name = document.createElement("span");
    name.textContent = p;
    const count = document.createElement("span");
    count.className = "proj-legend-count";
    count.textContent = todos.filter((t) => t.project === p).length;
    chip.appendChild(dot);
    chip.appendChild(name);
    chip.appendChild(count);
    chip.addEventListener("click", (e) => openColorPicker(p, e.currentTarget));
    projectLegend.appendChild(chip);
  });
}

// 보드·간트·캘린더 우측 상단 프로젝트 색상 키
function fillProjectKey(container) {
  if (!container) return;
  container.innerHTML = "";
  const projects = getProjects();
  if (projects.length === 0) {
    container.style.display = "none";
    return;
  }
  container.style.display = "flex";
  projects.forEach((p) => {
    const item = document.createElement("span");
    item.className = "proj-key-item";
    const dot = document.createElement("span");
    dot.className = "proj-dot";
    dot.style.background = projectColor(p);
    item.appendChild(dot);
    item.appendChild(document.createTextNode(p));
    container.appendChild(item);
  });
}

function renderProjectKeys() {
  fillProjectKey(boardKey);
  fillProjectKey(ganttKey);
  fillProjectKey(calendarKey);
}

let colorPickerEl = null;

function openColorPicker(project, anchor) {
  closeColorPicker();
  const pop = document.createElement("div");
  pop.className = "color-picker";
  PROJECT_PALETTE.forEach((col, idx) => {
    const sw = document.createElement("button");
    sw.type = "button";
    sw.className = "color-swatch" + (projectColorIndex(project) === idx ? " selected" : "");
    sw.style.background = col;
    sw.addEventListener("click", () => {
      projectColorMap[project] = idx;
      saveProjectColors();
      closeColorPicker();
      render();
    });
    pop.appendChild(sw);
  });
  document.body.appendChild(pop);
  const r = anchor.getBoundingClientRect();
  const pw = pop.offsetWidth || 160;
  // 뷰포트 기준 고정 위치 (화면 밖으로 나가지 않게 클램프)
  let left = r.left;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  if (left < 8) left = 8;
  pop.style.top = `${r.bottom + 6}px`;
  pop.style.left = `${left}px`;
  colorPickerEl = pop;
  setTimeout(() => document.addEventListener("click", onDocClickForPicker), 0);
}

function onDocClickForPicker(e) {
  if (colorPickerEl && !colorPickerEl.contains(e.target)) closeColorPicker();
}

function closeColorPicker() {
  if (colorPickerEl) {
    colorPickerEl.remove();
    colorPickerEl = null;
    document.removeEventListener("click", onDocClickForPicker);
  }
}

/* ---------- 요약 대시보드 ---------- */

function setFilter(filter) {
  currentFilter = filter;
  filterBtns.forEach((b) =>
    b.classList.toggle("active", b.dataset.filter === filter)
  );
  document.querySelectorAll(".summary-chip").forEach((c) =>
    c.classList.toggle("active", c.dataset.filter === filter)
  );
  renderList();
}

function renderSummary() {
  summaryEl.innerHTML = "";
  const overdue = todos.filter(isOverdue).length;
  const dueToday = todos.filter((t) => dDay(t) === 0).length;
  const dueSoon = todos.filter((t) => {
    const d = dDay(t);
    return d !== null && d >= 0 && d <= 3;
  }).length;
  const inProgress = todos.filter((t) => t.status === "진행중").length;

  const chips = [
    { label: "지연", value: overdue, filter: "지연", danger: overdue > 0 },
    { label: "오늘 마감", value: dueToday, filter: "오늘마감", danger: dueToday > 0 },
    { label: "3일 내 마감", value: dueSoon, filter: "임박", danger: false },
    { label: "진행중", value: inProgress, filter: "진행중", danger: false },
  ];

  chips.forEach((c) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className =
      "summary-chip" +
      (c.danger ? " danger" : "") +
      (currentFilter === c.filter ? " active" : "");
    chip.dataset.filter = c.filter;
    const num = document.createElement("span");
    num.className = "summary-num";
    num.textContent = c.value;
    const label = document.createElement("span");
    label.className = "summary-label";
    label.textContent = c.label;
    chip.appendChild(num);
    chip.appendChild(label);
    chip.addEventListener("click", () => {
      // 같은 칩을 다시 누르면 전체 보기로 복귀
      setFilter(currentFilter === c.filter ? "all" : c.filter);
    });
    summaryEl.appendChild(chip);
  });
}

/* ---------- 목록 뷰 ---------- */

function renderList() {
  const filtered = sortByStart(getFilteredTodos());
  list.innerHTML = "";

  if (filtered.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "할 일이 없습니다";
    list.appendChild(empty);
  } else {
    const projects = getProjects();
    const useGroups = projects.length > 0;
    const groups = new Map();
    filtered.forEach((t) => {
      const key = useGroups ? t.project || "기타" : "";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    });

    groups.forEach((items, groupName) => {
      if (groupName) {
        const header = document.createElement("li");
        header.className = "project-header";
        if (groupName !== "기타") {
          const dot = document.createElement("span");
          dot.className = "proj-dot";
          dot.style.background = projectColor(groupName);
          header.appendChild(dot);
        }
        header.appendChild(document.createTextNode(groupName));
        list.appendChild(header);
      }
      items.forEach((todo) => {
        list.appendChild(
          todo.id === editingId ? renderEditItem(todo) : renderItem(todo)
        );
      });
    });
  }

  const activeCount = todos.filter((t) => t.status !== "완료").length;
  const overdueCount = todos.filter(isOverdue).length;
  itemsLeft.textContent =
    `${activeCount}개 남음` + (overdueCount ? ` · 지연 ${overdueCount}개` : "");
}

function renderItem(todo) {
  const li = document.createElement("li");
  li.className =
    `todo-item status-${todo.status}` +
    (todo.status === "완료" ? " completed" : "") +
    (isOverdue(todo) ? " overdue" : "");
  if (todo.project) {
    li.style.borderLeft = `3px solid ${projectColor(todo.project)}`;
    li.style.paddingLeft = "10px";
  }

  const main = document.createElement("div");
  main.className = "todo-main";

  const text = document.createElement("span");
  text.className = "todo-text";
  text.textContent = todo.text;
  if (todo.recurrence !== "없음") {
    const rec = document.createElement("span");
    rec.className = "recur-badge";
    rec.textContent = `🔁 ${todo.recurrence}`;
    text.appendChild(rec);
  }

  const dates = document.createElement("span");
  dates.className = "todo-dates" + (isUndated(todo) ? " undated" : "");
  dates.textContent = isUndated(todo)
    ? "기간 미정"
    : `${todo.startDate} ~ ${todo.endDate}`;
  if (todo.priority !== "보통") {
    const prio = document.createElement("span");
    prio.className = `prio-chip prio-${todo.priority}`;
    prio.textContent = todo.priority;
    dates.prepend(prio);
  }
  if (isOverdue(todo)) {
    const badge = document.createElement("span");
    badge.className = "overdue-badge";
    badge.textContent = "지연";
    dates.appendChild(badge);
  } else {
    const d = dDay(todo);
    if (d !== null && d >= 0 && d <= 7) {
      const dd = document.createElement("span");
      dd.className = "dday-badge" + (d === 0 ? " today" : "");
      dd.textContent = d === 0 ? "오늘 마감" : `D-${d}`;
      dates.appendChild(dd);
    }
  }

  main.appendChild(text);
  main.appendChild(dates);

  if (todo.memo) {
    const memo = document.createElement("span");
    memo.className = "todo-memo";
    memo.textContent = todo.memo;
    main.appendChild(memo);
  }

  const statusSelect = document.createElement("select");
  statusSelect.className = `status-select status-select-${todo.status}`;
  STATUSES.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    if (s === todo.status) opt.selected = true;
    statusSelect.appendChild(opt);
  });
  statusSelect.addEventListener("change", (e) => setStatus(todo.id, e.target.value));

  const editBtn = document.createElement("button");
  editBtn.className = "todo-edit";
  editBtn.textContent = "수정";
  editBtn.addEventListener("click", () => {
    editingId = todo.id;
    renderList();
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "todo-delete";
  deleteBtn.textContent = "×";
  deleteBtn.title = "삭제";
  deleteBtn.addEventListener("click", () => deleteTodo(todo.id));

  li.appendChild(main);
  li.appendChild(statusSelect);
  li.appendChild(editBtn);
  li.appendChild(deleteBtn);
  return li;
}

function renderEditItem(todo) {
  const li = document.createElement("li");
  li.className = "todo-item editing";

  const formEl = document.createElement("div");
  formEl.className = "edit-form";

  const textField = document.createElement("input");
  textField.type = "text";
  textField.value = todo.text;

  const row = document.createElement("div");
  row.className = "edit-row";

  const projectField = document.createElement("input");
  projectField.type = "text";
  projectField.value = todo.project;
  projectField.placeholder = "프로젝트";
  projectField.setAttribute("list", "project-list");

  const startField = document.createElement("input");
  startField.type = "date";
  startField.value = todo.startDate;

  const endField = document.createElement("input");
  endField.type = "date";
  endField.value = todo.endDate;

  const priorityField = document.createElement("select");
  PRIORITIES.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    if (p === todo.priority) opt.selected = true;
    priorityField.appendChild(opt);
  });

  const recurrenceField = document.createElement("select");
  RECURRENCES.forEach((rc) => {
    const opt = document.createElement("option");
    opt.value = rc;
    opt.textContent = rc === "없음" ? "반복 없음" : rc;
    if (rc === todo.recurrence) opt.selected = true;
    recurrenceField.appendChild(opt);
  });

  row.appendChild(projectField);
  row.appendChild(startField);
  row.appendChild(endField);
  row.appendChild(priorityField);
  row.appendChild(recurrenceField);

  const memoField = document.createElement("textarea");
  memoField.rows = 2;
  memoField.value = todo.memo;
  memoField.placeholder = "메모 (선택)";

  const actions = document.createElement("div");
  actions.className = "edit-actions";

  const saveBtn = document.createElement("button");
  saveBtn.className = "edit-save";
  saveBtn.textContent = "저장";
  saveBtn.addEventListener("click", () => {
    const text = textField.value.trim();
    if (!text || !startField.value || !endField.value) return;
    editingId = null;
    updateTodo(todo.id, {
      text,
      project: projectField.value.trim(),
      memo: memoField.value.trim(),
      startDate: startField.value,
      endDate: endField.value,
      priority: priorityField.value,
      recurrence: recurrenceField.value,
    });
  });

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "edit-cancel";
  cancelBtn.textContent = "취소";
  cancelBtn.addEventListener("click", () => {
    editingId = null;
    renderList();
  });

  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);

  formEl.appendChild(textField);
  formEl.appendChild(row);
  formEl.appendChild(memoField);
  formEl.appendChild(actions);
  li.appendChild(formEl);
  return li;
}

/* ---------- 보드 뷰 (노션식 칸반) ---------- */

function renderBoard() {
  boardEl.innerHTML = "";

  STATUSES.forEach((status) => {
    const col = document.createElement("div");
    col.className = "board-col";
    col.dataset.status = status;

    const head = document.createElement("div");
    head.className = "board-col-head";
    const dot = document.createElement("span");
    dot.className = `legend-dot legend-${status}`;
    const name = document.createElement("span");
    name.className = "board-col-name";
    name.textContent = status;
    const count = document.createElement("span");
    count.className = "board-col-count";
    head.appendChild(dot);
    head.appendChild(name);
    head.appendChild(count);
    col.appendChild(head);

    const cardsWrap = document.createElement("div");
    cardsWrap.className = "board-cards";

    const items = sortByStart(
      applySearch(todos).filter((t) => t.status === status)
    );
    count.textContent = items.length;

    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "board-empty";
      empty.textContent = "없음";
      cardsWrap.appendChild(empty);
    } else {
      items.forEach((todo) => {
        const card = document.createElement("div");
        card.className = "board-card" + (isOverdue(todo) ? " overdue" : "");
        if (!isOverdue(todo) && todo.project) {
          card.style.borderLeft = `3px solid ${projectColor(todo.project)}`;
        }

        if (todo.project) {
          const proj = document.createElement("div");
          proj.className = "board-card-project";
          proj.textContent = todo.project;
          card.appendChild(proj);
        }

        const title = document.createElement("div");
        title.className = "board-card-title";
        title.textContent = todo.text;
        card.appendChild(title);

        const dates = document.createElement("div");
        dates.className = "board-card-dates" + (isUndated(todo) ? " undated" : "");
        dates.textContent = isUndated(todo)
          ? "기간 미정"
          : `${todo.startDate} ~ ${todo.endDate}`;
        if (todo.priority !== "보통") {
          const prio = document.createElement("span");
          prio.className = `prio-chip prio-${todo.priority}`;
          prio.textContent = todo.priority;
          dates.prepend(prio);
        }
        if (isOverdue(todo)) {
          const badge = document.createElement("span");
          badge.className = "overdue-badge";
          badge.textContent = "지연";
          dates.appendChild(badge);
        } else {
          const d = dDay(todo);
          if (d !== null && d >= 0 && d <= 7) {
            const dd = document.createElement("span");
            dd.className = "dday-badge" + (d === 0 ? " today" : "");
            dd.textContent = d === 0 ? "오늘 마감" : `D-${d}`;
            dates.appendChild(dd);
          }
        }
        card.appendChild(dates);

        if (todo.memo) {
          const memo = document.createElement("div");
          memo.className = "board-card-memo";
          memo.textContent = todo.memo;
          card.appendChild(memo);
        }

        attachCardDrag(card, todo);
        cardsWrap.appendChild(card);
      });
    }

    col.appendChild(cardsWrap);
    boardEl.appendChild(col);
  });
}

function attachCardDrag(card, todo) {
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;

  const columnUnder = (e) => {
    card.style.pointerEvents = "none";
    const el = document.elementFromPoint(e.clientX, e.clientY);
    card.style.pointerEvents = "";
    return el ? el.closest(".board-col") : null;
  };

  card.addEventListener("pointerdown", (e) => {
    dragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    card.setPointerCapture(e.pointerId);
  });

  card.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < 6) return;
    moved = true;
    card.classList.add("dragging");
    card.style.transform = `translate(${dx}px, ${dy}px)`;

    const col = columnUnder(e);
    document
      .querySelectorAll(".board-col")
      .forEach((c) => c.classList.toggle("drag-over", c === col && c.dataset.status !== todo.status));
  });

  const finish = (e) => {
    if (!dragging) return;
    dragging = false;
    card.classList.remove("dragging");
    card.style.transform = "";
    document.querySelectorAll(".board-col").forEach((c) => c.classList.remove("drag-over"));
    if (!moved) return;
    const col = columnUnder(e);
    if (col && col.dataset.status !== todo.status) {
      setStatus(todo.id, col.dataset.status);
    }
  };

  card.addEventListener("pointerup", finish);
  card.addEventListener("pointercancel", finish);
}

/* ---------- 간트차트 뷰 (노션식 드래그 타임라인) ---------- */

const CELL_W = 32;
let ganttScrollLeft = null;

function renderGantt() {
  if (currentView === "gantt") {
    const prev = ganttChart.querySelector(".gantt-scroll");
    if (prev) ganttScrollLeft = prev.scrollLeft;
  }
  ganttChart.innerHTML = "";

  const searched = applySearch(todos);
  if (searched.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "할 일이 없습니다";
    ganttChart.appendChild(empty);
    return;
  }

  const datedTodos = searched.filter((t) => !isUndated(t));
  const undatedTodos = searched.filter(isUndated);

  if (datedTodos.length === 0) {
    // 날짜 있는 업무가 없으면 타임라인은 생략하고 미정 모음만
    appendUndatedSection(ganttChart, undatedTodos);
    return;
  }

  const sorted = sortByStart(datedTodos);
  const today = todayStr();
  let minD = null;
  let maxD = null;
  sorted.forEach((t) => {
    if (minD === null || t.startDate < minD) minD = t.startDate;
    if (maxD === null || t.endDate > maxD) maxD = t.endDate;
  });
  if (minD > today) minD = today;
  if (maxD < today) maxD = today;
  const rangeStart = addDays(minD, -3);
  const rangeEnd = addDays(maxD, 7);
  const nDays = diffDays(rangeStart, rangeEnd) + 1;
  const days = Array.from({ length: nDays }, (_, i) => addDays(rangeStart, i));
  const gridW = nDays * CELL_W;

  // 범례 + 안내
  const legend = document.createElement("div");
  legend.className = "gantt-legend";
  STATUSES.forEach((s) => {
    const item = document.createElement("span");
    item.className = "legend-item";
    const dot = document.createElement("span");
    dot.className = `legend-dot legend-${s}`;
    item.appendChild(dot);
    item.appendChild(document.createTextNode(s));
    legend.appendChild(item);
  });
  const hint = document.createElement("span");
  hint.className = "gantt-hint";
  hint.textContent = "막대를 끌면 일정 이동 · 양끝을 끌면 기간 조절";
  legend.appendChild(hint);
  ganttChart.appendChild(legend);

  const scroll = document.createElement("div");
  scroll.className = "gantt-scroll";

  // 월 헤더
  const monthRow = document.createElement("div");
  monthRow.className = "gantt-grid-row gantt-month-row";
  const mCorner = document.createElement("div");
  mCorner.className = "gantt-sticky-label gantt-corner";
  monthRow.appendChild(mCorner);
  const months = document.createElement("div");
  months.className = "gantt-cells";
  months.style.width = `${gridW}px`;
  let i = 0;
  while (i < nDays) {
    const d = new Date(days[i]);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    let j = i;
    while (j < nDays) {
      const dj = new Date(days[j]);
      if (dj.getUTCFullYear() !== y || dj.getUTCMonth() !== m) break;
      j++;
    }
    const seg = document.createElement("div");
    seg.className = "gantt-month";
    seg.style.left = `${i * CELL_W}px`;
    seg.style.width = `${(j - i) * CELL_W}px`;
    seg.textContent = `${y}년 ${m + 1}월`;
    months.appendChild(seg);
    i = j;
  }
  monthRow.appendChild(months);
  scroll.appendChild(monthRow);

  // 일 헤더
  const dayRow = document.createElement("div");
  dayRow.className = "gantt-grid-row gantt-day-row";
  const dCorner = document.createElement("div");
  dCorner.className = "gantt-sticky-label gantt-corner";
  dayRow.appendChild(dCorner);
  const dayCells = document.createElement("div");
  dayCells.className = "gantt-cells";
  dayCells.style.width = `${gridW}px`;
  days.forEach((ds, idx) => {
    const d = new Date(ds);
    const dow = d.getUTCDay();
    const cell = document.createElement("div");
    cell.className =
      "gantt-day" +
      (dow === 0 || dow === 6 ? " weekend" : "") +
      (ds === today ? " today" : "");
    cell.style.left = `${idx * CELL_W}px`;
    cell.textContent = d.getUTCDate();
    dayCells.appendChild(cell);
  });
  dayRow.appendChild(dayCells);
  scroll.appendChild(dayRow);

  // 프로젝트 그룹
  const projects = getProjects();
  const useGroups = projects.length > 0;
  const groups = new Map();
  sorted.forEach((t) => {
    const key = useGroups ? t.project || "기타" : "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  });

  groups.forEach((items, groupName) => {
    if (groupName) {
      const gr = document.createElement("div");
      gr.className = "gantt-grid-row gantt-group-row";
      const gl = document.createElement("div");
      gl.className = "gantt-sticky-label gantt-group-label";
      gl.textContent = groupName;
      gr.appendChild(gl);
      const gc = document.createElement("div");
      gc.className = "gantt-cells";
      gc.style.width = `${gridW}px`;
      gr.appendChild(gc);
      scroll.appendChild(gr);
    }

    items.forEach((todo) => {
      const row = document.createElement("div");
      row.className = "gantt-grid-row gantt-task-row";

      const label = document.createElement("div");
      label.className = "gantt-sticky-label";
      label.textContent = todo.text;
      label.title = todo.memo ? `${todo.text}\n${todo.memo}` : todo.text;
      row.appendChild(label);

      const cells = document.createElement("div");
      cells.className = "gantt-cells";
      cells.style.width = `${gridW}px`;

      days.forEach((ds, idx) => {
        const dow = new Date(ds).getUTCDay();
        const c = document.createElement("div");
        c.className =
          "gantt-cell" +
          (dow === 0 || dow === 6 ? " weekend" : "") +
          (ds === today ? " today" : "");
        c.style.left = `${idx * CELL_W}px`;
        cells.appendChild(c);
      });

      const startIdx = diffDays(rangeStart, todo.startDate);
      const dur = diffDays(todo.startDate, todo.endDate) + 1;
      const bar = document.createElement("div");
      bar.className =
        `gantt-bar status-${todo.status}` + (isOverdue(todo) ? " overdue" : "");
      bar.style.left = `${startIdx * CELL_W}px`;
      bar.style.width = `${dur * CELL_W}px`;
      bar.title = `${todo.text} · ${todo.startDate} ~ ${todo.endDate} (${todo.status})`;
      if (colorBy === "project" && todo.project) {
        bar.style.background = projectColor(todo.project);
        bar.style.opacity = todo.status === "완료" ? "0.5" : "1";
      }

      const hl = document.createElement("div");
      hl.className = "gantt-handle left";
      const hr = document.createElement("div");
      hr.className = "gantt-handle right";
      bar.appendChild(hl);
      bar.appendChild(hr);

      attachBarDrag(bar, todo, rangeStart, rangeEnd);
      cells.appendChild(bar);
      row.appendChild(cells);
      scroll.appendChild(row);
    });
  });

  ganttChart.appendChild(scroll);

  if (currentView === "gantt") {
    scroll.scrollLeft =
      ganttScrollLeft !== null
        ? ganttScrollLeft
        : Math.max(0, (diffDays(rangeStart, today) - 3) * CELL_W);
  }

  appendUndatedSection(ganttChart, undatedTodos);
}

// 기간 미정 업무 모음 (간트·캘린더 공용) — 칩 클릭 시 상세 폼으로 날짜 지정 유도
function appendUndatedSection(container, items) {
  if (!items || items.length === 0) return;
  const sec = document.createElement("div");
  sec.className = "undated-section";
  const head = document.createElement("div");
  head.className = "undated-head";
  head.textContent = `기간 미정 (${items.length})`;
  sec.appendChild(head);
  const wrap = document.createElement("div");
  wrap.className = "undated-chips";
  items.forEach((todo) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `undated-chip status-${todo.status}`;
    if (todo.project) {
      const dot = document.createElement("span");
      dot.className = "proj-dot";
      dot.style.background = projectColor(todo.project);
      chip.appendChild(dot);
    }
    chip.appendChild(document.createTextNode(todo.text));
    chip.title = "클릭하면 날짜를 지정할 수 있어요";
    chip.addEventListener("click", () => {
      editingId = todo.id;
      currentView = "list";
      viewTabs.forEach((t) =>
        t.classList.toggle("active", t.dataset.view === "list")
      );
      document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
      listView.classList.remove("hidden");
      renderList();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    wrap.appendChild(chip);
  });
  sec.appendChild(wrap);
  container.appendChild(sec);
}

function attachBarDrag(bar, todo, rangeStart, rangeEnd) {
  let mode = null;
  let startX = 0;
  let origStart = null;
  let origEnd = null;
  let pendingStart = null;
  let pendingEnd = null;

  bar.addEventListener("pointerdown", (e) => {
    mode = e.target.classList.contains("gantt-handle")
      ? e.target.classList.contains("left")
        ? "l"
        : "r"
      : "m";
    startX = e.clientX;
    origStart = todo.startDate;
    origEnd = todo.endDate;
    pendingStart = origStart;
    pendingEnd = origEnd;
    bar.setPointerCapture(e.pointerId);
    bar.classList.add("dragging");
    e.preventDefault();
  });

  bar.addEventListener("pointermove", (e) => {
    if (!mode) return;
    let delta = Math.round((e.clientX - startX) / CELL_W);

    if (mode !== "r") {
      const minDelta = diffDays(origStart, rangeStart);
      if (delta < minDelta) delta = minDelta;
    }
    if (mode !== "l") {
      const maxDelta = diffDays(origEnd, rangeEnd);
      if (delta > maxDelta) delta = maxDelta;
    }

    let ns = origStart;
    let ne = origEnd;
    if (mode === "m") {
      ns = addDays(origStart, delta);
      ne = addDays(origEnd, delta);
    } else if (mode === "l") {
      ns = addDays(origStart, delta);
      if (ns > ne) ns = ne;
    } else {
      ne = addDays(origEnd, delta);
      if (ne < ns) ne = ns;
    }
    pendingStart = ns;
    pendingEnd = ne;

    bar.style.left = `${diffDays(rangeStart, ns) * CELL_W}px`;
    bar.style.width = `${(diffDays(ns, ne) + 1) * CELL_W}px`;
    bar.title = `${todo.text} · ${ns} ~ ${ne}`;
  });

  const finish = (e) => {
    if (!mode) return;
    bar.classList.remove("dragging");
    try {
      bar.releasePointerCapture(e.pointerId);
    } catch {}
    const changed = pendingStart !== origStart || pendingEnd !== origEnd;
    mode = null;
    if (changed) {
      updateTodo(todo.id, { startDate: pendingStart, endDate: pendingEnd });
    }
  };

  bar.addEventListener("pointerup", finish);
  bar.addEventListener("pointercancel", finish);
}

/* ---------- 자연어 빠른 추가 ---------- */

const DOW_MAP = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
// 한글 기간 표현 → 일수
const KO_DURATION = {
  하루: 1, 이틀: 2, 사흘: 3, 나흘: 4, 닷새: 5, 엿새: 6,
  이레: 7, 여드레: 8, 아흐레: 9, 열흘: 10, 보름: 15,
  일주일: 7, 한주: 7, 두주: 14, 한달: 30, 두달: 60,
};

function addMonths(dateStr, n) {
  const d = new Date(dateStr);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

function lastDayOfMonth(dateStr) {
  const d = new Date(dateStr);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
}

// 텍스트에서 첫 날짜 표현을 찾아 { date, matched, label } 반환 (없으면 null)
function resolveDateToken(text, today) {
  const y = Number(today.slice(0, 10).slice(0, 4));
  let m;

  // 오늘/내일/모레/글피
  m = text.match(/(오늘|내일|모레|글피)/);
  if (m) {
    const off = { 오늘: 0, 내일: 1, 모레: 2, 글피: 3 }[m[1]];
    return { date: addDays(today, off), matched: m[0], label: m[1] };
  }

  // N일 후/뒤, N주 후/뒤, N개월(달) 후/뒤
  m = text.match(/(\d+)\s*(일|주|개월|달)\s*(후|뒤)/);
  if (m) {
    const n = Number(m[1]);
    let date;
    if (m[2] === "일") date = addDays(today, n);
    else if (m[2] === "주") date = addDays(today, n * 7);
    else date = addMonths(today, n);
    return { date, matched: m[0], label: m[0] };
  }

  // (이번주/다음주/다다음주) X요일
  m = text.match(/(이번\s*주|다음\s*주|다다음\s*주)?\s*([일월화수목금토])요일/);
  if (m) {
    const dow = new Date(today).getUTCDay();
    const target = DOW_MAP[m[2]];
    let diff;
    const week = (m[1] || "").replace(/\s/g, "");
    if (week === "다음주") {
      const toNextMon = ((1 - dow + 7) % 7) || 7;
      diff = toNextMon + ((target - 1 + 7) % 7);
    } else if (week === "다다음주") {
      const toNextMon = ((1 - dow + 7) % 7) || 7;
      diff = toNextMon + 7 + ((target - 1 + 7) % 7);
    } else {
      diff = (target - dow + 7) % 7; // 이번주/생략: 가장 가까운 (오늘 포함)
    }
    const prefix = week ? week + " " : "";
    return { date: addDays(today, diff), matched: m[0], label: prefix + m[2] + "요일" };
  }

  // 이번달/다음달 + 초/말(일)
  m = text.match(/(이번\s*달|다음\s*달)\s*(초|말|말일)?/);
  if (m) {
    const base = m[1].replace(/\s/g, "") === "다음달" ? addMonths(today, 1) : today;
    const first = base.slice(0, 8) + "01";
    let date, label;
    if (m[2] === "초") {
      date = first;
      label = m[1].replace(/\s/g, "") + " 초";
    } else {
      date = lastDayOfMonth(base);
      label = m[1].replace(/\s/g, "") + " 말";
    }
    return { date, matched: m[0], label };
  }

  // M월 D일 / M/D
  m = text.match(/(\d{1,2})\s*[\/월]\s*(\d{1,2})\s*일?/);
  if (m) {
    const mm = String(m[1]).padStart(2, "0");
    const dd = String(m[2]).padStart(2, "0");
    let date = `${y}-${mm}-${dd}`;
    // 한 달 이상 지난 날짜만 내년으로 (며칠 전이면 올해로 유지)
    if (date < today && diffDays(date, today) > 31) date = `${y + 1}-${mm}-${dd}`;
    return { date, matched: m[0], label: `${Number(m[1])}/${Number(m[2])}` };
  }

  return null;
}

// 텍스트에서 소요 기간(일수) 표현을 찾아 { days, matched } 반환
function resolveDuration(text) {
  // 숫자: N일(간/동안/짜리/걸리는), N주, N개월/달
  let m = text.match(/(\d+)\s*(일|주|개월|달)\s*(간|동안|짜리|걸리는|소요)?/);
  if (m) {
    const n = Number(m[1]);
    if (m[2] === "일") return { days: n, matched: m[0] };
    if (m[2] === "주") return { days: n * 7, matched: m[0] };
    return { days: n * 30, matched: m[0] }; // 개월/달 ≈ 30일
  }
  // 한글: 이틀/사흘/일주일/보름 등 (+ 선택적 간/동안/짜리/걸리는)
  const koKeys = Object.keys(KO_DURATION).join("|");
  m = text.match(new RegExp(`(${koKeys})\\s*(간|동안|짜리|걸리는|소요)?`));
  if (m) return { days: KO_DURATION[m[1]], matched: m[0] };
  return null;
}

function parseQuickInput(raw) {
  let text = " " + raw.trim() + " ";
  if (!raw.trim()) return null;
  const today = todayStr();
  const out = {
    project: "",
    priority: "보통",
    recurrence: "없음",
    startDate: "",
    endDate: "",
    dateLabel: "기간 미정",
  };

  // 1) 프로젝트 (#이름)
  text = text.replace(/#(\S+)/, (_, p) => {
    out.project = p;
    return " ";
  });

  // 2) 우선순위 — !높음 / 자연어(긴급·급함·중요 → 높음, 사소·천천히 → 낮음)
  let pm = text.match(/!(높음|보통|낮음)/);
  if (pm) {
    out.priority = pm[1];
    text = text.replace(pm[0], " ");
  } else if (/긴급|급함|급한|급하게|중요|최우선|ASAP/i.test(text)) {
    out.priority = "높음";
    text = text.replace(/긴급히?|급함|급한|급하게|중요한?|최우선|ASAP/gi, " ");
  } else if (/사소|천천히|나중에|여유/.test(text)) {
    out.priority = "낮음";
    text = text.replace(/사소한?|천천히|나중에|여유롭게|여유있게/g, " ");
  }

  // 3) 반복 (매일/매주/매월). "매주 화요일"이면 요일은 4)에서 날짜로 처리됨
  let rm = text.match(/\*?(매일|매주|매월)/);
  if (rm) {
    out.recurrence = rm[1];
    text = text.replace(rm[0], " ");
  }

  // 4) 날짜: 먼저 범위(A~B, A부터 B까지)를 시도, 없으면 단일 날짜 + 소요기간
  let handled = false;

  // 4a) 범위: "A ~ B" / "A - B" / "A 부터 B 까지" / "A 에서 B"
  const rangeSplit = text.split(/\s*(?:~|—|-|부터|에서)\s*/);
  if (rangeSplit.length >= 2) {
    // 앞 조각의 마지막 날짜 = 시작, 뒤 조각의 첫 날짜 = 종료
    const left = resolveDateToken(rangeSplit[0], today);
    const rightText = rangeSplit.slice(1).join(" ");
    // 종료 요일/날짜는 시작일 기준으로 해석 (예: 월요일부터 금요일 = 그 주의 금요일)
    const right = resolveDateToken(rightText, left ? left.date : today);
    if (left && right) {
      let s = left.date, e = right.date;
      if (e < s) e = s;
      out.startDate = s;
      out.endDate = e;
      out.dateLabel = `${left.label} ~ ${right.label}`;
      text = text.replace(left.matched, " ").replace(right.matched, " ");
      // 남은 연결어·구분자 정리 (공백으로 둘러싸인 것만 → 제목 훼손 방지)
      text = text.replace(/\s(?:부터|까지|에서)(?=\s)/g, " ").replace(/\s*[~—-]\s*/g, " ");
      handled = true;
    }
  }

  // 4b) 단일 날짜 (+ 소요기간)
  if (!handled) {
    const d = resolveDateToken(text, today);
    if (d) text = text.replace(d.matched, " "); // 날짜 먼저 제거 → "3주 후"가 기간으로 오인식되지 않음
    const dur = resolveDuration(text); // 날짜 제거 후 남은 텍스트에서 기간 탐색
    if (d) {
      out.startDate = d.date;
      out.endDate = d.date;
      out.dateLabel = d.label;
      if (dur) {
        out.endDate = addDays(d.date, dur.days - 1);
        out.dateLabel = `${d.label}부터 ${dur.days}일`;
        text = text.replace(dur.matched, " ");
      }
      // 날짜 자리 옆에 남은 연결어만 정리 (공백 경계)
      text = text.replace(/\s(?:부터|까지|에서)(?=\s|$)/g, " ");
    } else if (dur) {
      // 날짜 없이 기간만 → 오늘부터 시작
      out.startDate = today;
      out.endDate = addDays(today, dur.days - 1);
      out.dateLabel = `오늘부터 ${dur.days}일`;
      text = text.replace(dur.matched, " ");
    }
  }

  out.text = text.replace(/\s+/g, " ").trim();
  return out.text ? out : null;
}

function updateQuickPreview() {
  const p = parseQuickInput(quickInput.value);
  if (!p) {
    quickPreview.classList.add("hidden");
    return;
  }
  quickPreview.classList.remove("hidden");
  const parts = [`"${p.text}"`];
  if (p.project) parts.push(`프로젝트 ${p.project}`);
  parts.push(p.endDate ? `마감 ${p.endDate} (${p.dateLabel})` : "기간 미정");
  if (p.priority !== "보통") parts.push(`우선순위 ${p.priority}`);
  if (p.recurrence !== "없음") parts.push(`반복 ${p.recurrence}`);
  quickPreview.textContent = "→ " + parts.join(" · ");
}

quickInput.addEventListener("input", updateQuickPreview);

quickForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const p = parseQuickInput(quickInput.value);
  if (!p) return;
  addTodo({
    text: p.text,
    project: p.project,
    memo: "",
    startDate: p.startDate,
    endDate: p.endDate,
    status: "예정",
    priority: p.priority,
    recurrence: p.recurrence,
  });
  quickInput.value = "";
  quickPreview.classList.add("hidden");
  quickInput.focus();
});

/* ---------- 캘린더 뷰 ---------- */

let calMonth = todayStr().slice(0, 7); // "YYYY-MM"

function renderCalendar() {
  const [y, mo] = calMonth.split("-").map(Number);
  calTitle.textContent = `${y}년 ${mo}월`;
  calGrid.innerHTML = "";

  const first = `${calMonth}-01`;
  const firstDow = new Date(first).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;
  const gridStart = addDays(first, -firstDow);
  const today = todayStr();
  const searched = applySearch(todos);

  for (let i = 0; i < totalCells; i++) {
    const ds = addDays(gridStart, i);
    const inMonth = ds.slice(0, 7) === calMonth;
    const dow = i % 7;
    const cell = document.createElement("div");
    cell.className =
      "cal-cell" +
      (inMonth ? "" : " other-month") +
      (ds === today ? " today" : "") +
      (dow === 0 || dow === 6 ? " weekend" : "");

    const num = document.createElement("div");
    num.className = "cal-num";
    num.textContent = Number(ds.slice(8, 10));
    cell.appendChild(num);

    const dayTodos = searched.filter(
      (t) => t.startDate <= ds && ds <= t.endDate
    );
    dayTodos.slice(0, 3).forEach((t) => {
      const chip = document.createElement("div");
      chip.className =
        `cal-chip status-${t.status}` + (isOverdue(t) ? " overdue" : "");
      chip.textContent = t.text;
      chip.title = `${t.text} (${t.startDate}~${t.endDate} · ${t.status})`;
      if (colorBy === "project" && t.project) {
        chip.style.background = projectColor(t.project);
        if (t.status === "완료") chip.style.opacity = "0.5";
      }
      cell.appendChild(chip);
    });
    if (dayTodos.length > 3) {
      const more = document.createElement("div");
      more.className = "cal-more";
      more.textContent = `+${dayTodos.length - 3}건 더`;
      cell.appendChild(more);
    }

    cell.addEventListener("click", (e) => {
      if (e.target.closest(".cal-chip")) return;
      startInput.value = ds;
      endInput.value = ds;
      detailForm.open = true;
      window.scrollTo({ top: 0, behavior: "smooth" });
      input.focus();
    });

    calGrid.appendChild(cell);
  }

  const undatedBox = document.getElementById("calendar-undated");
  if (undatedBox) {
    undatedBox.innerHTML = "";
    appendUndatedSection(undatedBox, searched.filter(isUndated));
  }
}

function shiftCalMonth(d) {
  let [y, m] = calMonth.split("-").map(Number);
  m += d;
  if (m < 1) {
    m = 12;
    y--;
  }
  if (m > 12) {
    m = 1;
    y++;
  }
  calMonth = `${y}-${String(m).padStart(2, "0")}`;
  renderCalendar();
}

calPrev.addEventListener("click", () => shiftCalMonth(-1));
calNext.addEventListener("click", () => shiftCalMonth(1));
calTodayBtn.addEventListener("click", () => {
  calMonth = todayStr().slice(0, 7);
  renderCalendar();
});

/* ---------- 통계 뷰 ---------- */

function el(tag, cls, textContent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (textContent !== undefined) e.textContent = textContent;
  return e;
}

function renderStats() {
  statsEl.innerHTML = "";

  const total = todos.length;
  if (total === 0) {
    statsEl.appendChild(el("div", "empty-state", "할 일이 없습니다"));
    return;
  }

  const done = todos.filter((t) => t.status === "완료").length;
  const inProg = todos.filter((t) => t.status === "진행중").length;
  const planned = todos.filter((t) => t.status === "예정").length;
  const overdueList = todos.filter(isOverdue);
  const rate = Math.round((done / total) * 100);

  // 핵심 지표 타일
  const tiles = el("div", "stat-tiles");
  [
    ["전체 업무", `${total}건`, false],
    ["완료율", `${rate}%`, false],
    ["진행중", `${inProg}건`, false],
    ["지연", `${overdueList.length}건`, overdueList.length > 0],
  ].forEach(([label, value, danger]) => {
    const tile = el("div", "stat-tile" + (danger ? " danger" : ""));
    tile.appendChild(el("div", "stat-value", value));
    tile.appendChild(el("div", "stat-label", label));
    tiles.appendChild(tile);
  });
  statsEl.appendChild(tiles);

  // 상태 분포 스택바
  const distSection = el("div", "stat-section");
  distSection.appendChild(el("h3", "stat-heading", "상태 분포"));
  const stack = el("div", "stat-stack");
  [
    ["예정", planned],
    ["진행중", inProg],
    ["완료", done],
  ].forEach(([s, n]) => {
    if (n === 0) return;
    const seg = el("div", `stat-stack-seg seg-${s}`);
    seg.style.width = `${(n / total) * 100}%`;
    seg.title = `${s} ${n}건`;
    stack.appendChild(seg);
  });
  distSection.appendChild(stack);
  const stackLegend = el("div", "stat-stack-legend");
  [
    ["예정", planned],
    ["진행중", inProg],
    ["완료", done],
  ].forEach(([s, n]) => {
    const item = el("span", "legend-item");
    item.appendChild(el("span", `legend-dot legend-${s}`));
    item.appendChild(document.createTextNode(`${s} ${n}`));
    stackLegend.appendChild(item);
  });
  distSection.appendChild(stackLegend);
  statsEl.appendChild(distSection);

  // 주간 완료 실적 (최근 8주, completedAt 기준)
  const weekSection = el("div", "stat-section");
  weekSection.appendChild(el("h3", "stat-heading", "주간 완료 실적 (최근 8주)"));
  const today = todayStr();
  const todayDow = new Date(today).getUTCDay();
  // 이번 주 월요일
  const thisMonday = addDays(today, todayDow === 0 ? -6 : 1 - todayDow);
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const start = addDays(thisMonday, -7 * i);
    const end = addDays(start, 6);
    const count = todos.filter(
      (t) => t.completedAt && t.completedAt >= start && t.completedAt <= end
    ).length;
    weeks.push({ start, end, count, isThis: i === 0 });
  }
  const maxCount = Math.max(1, ...weeks.map((w) => w.count));
  const chart = el("div", "week-chart");
  weeks.forEach((w) => {
    const col = el("div", "week-col" + (w.isThis ? " current" : ""));
    const barWrap = el("div", "week-bar-wrap");
    const bar = el("div", "week-bar");
    bar.style.height = `${(w.count / maxCount) * 100}%`;
    if (w.count > 0) bar.appendChild(el("span", "week-bar-num", String(w.count)));
    bar.title = `${w.start} ~ ${w.end}: ${w.count}건 완료`;
    barWrap.appendChild(bar);
    col.appendChild(barWrap);
    col.appendChild(el("div", "week-label", `${Number(w.start.slice(5, 7))}/${Number(w.start.slice(8, 10))}`));
    chart.appendChild(col);
  });
  weekSection.appendChild(chart);
  const totalDone = todos.filter((t) => t.completedAt).length;
  if (totalDone === 0) {
    weekSection.appendChild(
      el("p", "stat-empty", "이 기능 추가 이후 완료한 업무부터 집계됩니다")
    );
  }
  statsEl.appendChild(weekSection);

  // 프로젝트별 진행률
  const projects = getProjects();
  if (projects.length > 0) {
    const projSection = el("div", "stat-section");
    projSection.appendChild(el("h3", "stat-heading", "프로젝트별 진행률"));
    const items = [...projects, ""];
    items.forEach((p) => {
      const list = todos.filter((t) => (t.project || "") === p);
      if (list.length === 0) return;
      const pDone = list.filter((t) => t.status === "완료").length;
      const pOver = list.filter(isOverdue).length;
      const pct = Math.round((pDone / list.length) * 100);

      const row = el("div", "stat-proj");
      const head = el("div", "stat-proj-head");
      head.appendChild(el("span", "stat-proj-name", p || "기타"));
      const meta = el("span", "stat-proj-meta", `${pDone}/${list.length} · ${pct}%`);
      if (pOver > 0) {
        meta.appendChild(el("span", "stat-proj-overdue", ` 지연 ${pOver}`));
      }
      head.appendChild(meta);
      row.appendChild(head);
      const bar = el("div", "stat-bar");
      const fill = el("div", "stat-bar-fill");
      fill.style.width = `${pct}%`;
      bar.appendChild(fill);
      row.appendChild(bar);
      projSection.appendChild(row);
    });
    statsEl.appendChild(projSection);
  }

  // 다가오는 7일 마감
  const upcoming = todos
    .filter((t) => {
      const d = dDay(t);
      return d !== null && d >= 0 && d <= 7;
    })
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
  const upSection = el("div", "stat-section");
  upSection.appendChild(el("h3", "stat-heading", "다가오는 7일 마감"));
  if (upcoming.length === 0) {
    upSection.appendChild(el("p", "stat-empty", "7일 내 마감 예정 업무가 없습니다"));
  } else {
    upcoming.forEach((t) => {
      const d = dDay(t);
      const row = el("div", "stat-row");
      row.appendChild(
        el("span", "stat-row-dday" + (d === 0 ? " today" : ""), d === 0 ? "오늘" : `D-${d}`)
      );
      row.appendChild(el("span", "stat-row-text", t.text));
      row.appendChild(el("span", "stat-row-meta", t.project || ""));
      upSection.appendChild(row);
    });
  }
  statsEl.appendChild(upSection);

  // 지연 업무
  if (overdueList.length > 0) {
    const odSection = el("div", "stat-section");
    odSection.appendChild(el("h3", "stat-heading", "지연 업무"));
    overdueList
      .sort((a, b) => a.endDate.localeCompare(b.endDate))
      .forEach((t) => {
        const days = -dDay(t);
        const row = el("div", "stat-row");
        row.appendChild(el("span", "stat-row-dday overdue", `+${days}일`));
        row.appendChild(el("span", "stat-row-text", t.text));
        row.appendChild(el("span", "stat-row-meta", t.project || ""));
        odSection.appendChild(row);
      });
    statsEl.appendChild(odSection);
  }
}

/* ---------- 마감 알림 ---------- */

const NOTIFIED_KEY = "notifiedOn";

function updateNotifyBtn() {
  if (!("Notification" in window)) {
    notifyBtn.style.display = "none";
    return;
  }
  if (Notification.permission === "granted") notifyBtn.textContent = "알림 켜짐 ✓";
  else if (Notification.permission === "denied") notifyBtn.textContent = "알림 차단됨";
  else notifyBtn.textContent = "알림 켜기";
}

function deadlineCounts() {
  return {
    overdue: todos.filter(isOverdue).length,
    dueToday: todos.filter((t) => dDay(t) === 0).length,
    dueTomorrow: todos.filter((t) => dDay(t) === 1).length,
  };
}

// 서비스 워커가 백그라운드에서 읽을 수 있도록 마감 요약을 Cache Storage에 기록
async function updateSwSummary() {
  if (!("caches" in window)) return;
  try {
    const c = deadlineCounts();
    const cache = await caches.open("todo-meta");
    await cache.put(
      "/__summary",
      new Response(JSON.stringify({ ...c, date: todayStr() }), {
        headers: { "Content-Type": "application/json" },
      })
    );
  } catch (e) {
    /* 무시 */
  }
}

function checkDeadlineNotifications(force = false) {
  updateSwSummary();
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (!force && localStorage.getItem(NOTIFIED_KEY) === todayStr()) return;

  const { overdue, dueToday, dueTomorrow } = deadlineCounts();
  if (overdue + dueToday + dueTomorrow === 0) return;

  const parts = [];
  if (overdue) parts.push(`지연 ${overdue}건`);
  if (dueToday) parts.push(`오늘 마감 ${dueToday}건`);
  if (dueTomorrow) parts.push(`내일 마감 ${dueTomorrow}건`);
  try {
    new Notification("업무 진행 관리", {
      body: parts.join(" · "),
      icon: "icon-192.png",
    });
    localStorage.setItem(NOTIFIED_KEY, todayStr());
  } catch (e) {
    console.error("notification", e);
  }
}

// 지원 브라우저(설치된 PWA)에서 주기적 백그라운드 마감 확인 등록 — 최선 노력
async function registerPeriodicSync() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg && "periodicSync" in reg) {
      const status = await navigator.permissions
        .query({ name: "periodic-background-sync" })
        .catch(() => ({ state: "denied" }));
      if (status.state === "granted") {
        await reg.periodicSync.register("check-deadlines", {
          minInterval: 12 * 60 * 60 * 1000, // 12시간
        });
      }
    }
  } catch (e) {
    /* 미지원 브라우저는 무시 */
  }
}

notifyBtn.addEventListener("click", async () => {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  } else if (Notification.permission === "denied") {
    alert(
      "브라우저가 이 사이트의 알림을 차단하고 있어요.\n주소창 왼쪽 자물쇠 아이콘 → 알림 → 허용으로 바꿔주세요."
    );
  }
  updateNotifyBtn();
  checkDeadlineNotifications(true);
  registerPeriodicSync();
});

setInterval(() => checkDeadlineNotifications(), 30 * 60 * 1000);
registerPeriodicSync();

/* ---------- 승인 집계 ---------- */

function addApproval(date, type, count) {
  approvalLogs.push({
    id: Date.now() + Math.floor(Math.random() * 1000),
    date,
    type,
    count,
  });
  saveApprovals();
  renderApprovals();
}

function deleteApproval(id) {
  approvalLogs = approvalLogs.filter((a) => a.id !== id);
  saveApprovals();
  renderApprovals();
}

function ymOf(dateStr) {
  return dateStr.slice(0, 7);
}

function renderApprovals() {
  approvalBody.innerHTML = "";

  if (approvalLogs.length === 0) {
    approvalBody.appendChild(
      el("div", "empty-state", "아직 기록이 없습니다. 위에서 승인 건수를 입력해보세요.")
    );
    return;
  }

  const today = todayStr();
  const thisYm = ymOf(today);
  const thisMonday = addDays(
    today,
    new Date(today).getUTCDay() === 0 ? -6 : 1 - new Date(today).getUTCDay()
  );

  // 이번 달 합계 (구분별 + 총)
  const monthLogs = approvalLogs.filter((a) => ymOf(a.date) === thisYm);
  const weekLogs = approvalLogs.filter((a) => a.date >= thisMonday && a.date <= today);
  const sumBy = (logs, type) =>
    logs.filter((a) => !type || a.type === type).reduce((s, a) => s + a.count, 0);

  const tiles = el("div", "stat-tiles");
  [
    ["이번 달 총", sumBy(monthLogs), false],
    ["order", sumBy(monthLogs, "order"), false],
    ["출하승인", sumBy(monthLogs, "출하승인"), false],
    ["이번 주", sumBy(weekLogs), false],
  ].forEach(([label, value]) => {
    const tile = el("div", "stat-tile");
    tile.appendChild(el("div", "stat-value", String(value)));
    tile.appendChild(el("div", "stat-label", label));
    tiles.appendChild(tile);
  });
  approvalBody.appendChild(tiles);

  // 최근 6개월 막대그래프 (총 건수 기준)
  const months = [];
  const base = new Date(today + "T00:00:00Z");
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1));
    const ym = d.toISOString().slice(0, 7);
    months.push({ ym, count: sumBy(approvalLogs.filter((a) => ymOf(a.date) === ym)) });
  }
  const maxC = Math.max(1, ...months.map((m) => m.count));
  const section = el("div", "stat-section");
  section.appendChild(el("h3", "stat-heading", "최근 6개월 승인 실적"));
  const chart = el("div", "week-chart");
  months.forEach((m) => {
    const col = el("div", "week-col" + (m.ym === thisYm ? " current" : ""));
    const wrap = el("div", "week-bar-wrap");
    const bar = el("div", "week-bar");
    bar.style.height = `${(m.count / maxC) * 100}%`;
    if (m.count > 0) bar.appendChild(el("span", "week-bar-num", String(m.count)));
    bar.title = `${m.ym}: ${m.count}건`;
    wrap.appendChild(bar);
    col.appendChild(wrap);
    col.appendChild(el("div", "week-label", m.ym.slice(5) + "월"));
    chart.appendChild(col);
  });
  section.appendChild(chart);
  approvalBody.appendChild(section);

  // 기록 목록 (최근순)
  const logSection = el("div", "stat-section");
  logSection.appendChild(el("h3", "stat-heading", "기록"));
  [...approvalLogs]
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
    .slice(0, 60)
    .forEach((a) => {
      const row = el("div", "approval-log-row");
      row.appendChild(el("span", "approval-log-date", a.date));
      row.appendChild(el("span", `approval-log-type type-${a.type}`, a.type));
      row.appendChild(el("span", "approval-log-count", `${a.count}건`));
      const del = el("button", "approval-log-del", "×");
      del.title = "삭제";
      del.addEventListener("click", () => deleteApproval(a.id));
      row.appendChild(del);
      logSection.appendChild(row);
    });
  approvalBody.appendChild(logSection);
}

approvalForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const date = approvalDate.value || todayStr();
  const type = approvalType.value;
  const count = parseInt(approvalCount.value, 10);
  if (!count || count < 1) {
    approvalCount.focus();
    return;
  }
  addApproval(date, type, count);
  approvalCount.value = "";
  approvalCount.focus();
});

/* ---------- 업무 노트 (일일 업무일지) ---------- */
// 노트는 사내 정보가 담길 수 있어 클라우드 전송 없이 이 기기(localStorage)에만 저장.
// 백업은 푸터의 내보내기/가져오기(JSON)에 포함됨.

const noteView = document.getElementById("note-view");
const notePrev = document.getElementById("note-prev");
const noteNext = document.getElementById("note-next");
const noteTodayBtn = document.getElementById("note-today");
const noteDatePick = document.getElementById("note-date-pick");
const notePrintBtn = document.getElementById("note-print");
const noteDayNum = document.getElementById("note-day-num");
const noteDayTitle = document.getElementById("note-day-title");
const noteDaySub = document.getElementById("note-day-sub");
const noteTasksEl = document.getElementById("note-tasks");
const noteTemplatesEl = document.getElementById("note-templates");
const noteText = document.getElementById("note-text");
const noteSaveStatus = document.getElementById("note-save-status");
const noteToTaskBtn = document.getElementById("note-to-task");
const noteSearch = document.getElementById("note-search");
const notePastList = document.getElementById("note-past-list");
const notePrintArea = document.getElementById("note-print-area");

let workNotes = {};
try {
  workNotes = JSON.parse(localStorage.getItem("workNotes") || "{}");
} catch {
  workNotes = {};
}
let noteDate = todayStr();
let noteSaveTimer = null;

function saveNotesToStorage() {
  localStorage.setItem("workNotes", JSON.stringify(workNotes));
}

function flushNoteSave() {
  if (noteSaveTimer) {
    clearTimeout(noteSaveTimer);
    noteSaveTimer = null;
  }
  const text = noteText.value;
  if (text.trim() === "") delete workNotes[noteDate];
  else workNotes[noteDate] = text;
  saveNotesToStorage();
}

function markNoteSaved() {
  const t = new Date().toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  noteSaveStatus.textContent = `저장됨 · ${t}`;
}

// 제약 제조 현장용 템플릿
const NOTE_TEMPLATES = [
  {
    name: "인수인계",
    build: (d) =>
      `[인수인계] ${d}\n■ 생산 현황\n- \n■ 설비 상태\n- \n■ 미결 사항 / 주의\n- \n■ 다음 근무 요청사항\n- `,
  },
  {
    name: "생산일지",
    build: (d) =>
      `[생산일지] ${d}\n■ 금일 생산 품목 / 배치\n- \n■ 진행 상황\n- \n■ 특이사항 (일탈·이슈)\n- \n■ 조치 및 결과\n- `,
  },
  {
    name: "회의록",
    build: (d) =>
      `[회의록] 제목: \n일시: ${d}  장소: \n참석: \n■ 논의 내용\n- \n■ 결정 사항\n- \n■ 액션 아이템 (담당 / 기한)\n- `,
  },
  {
    name: "이슈기록",
    build: (d) =>
      `[이슈] 제목: \n발생: ${d}  공정/설비: \n내용: \n임시조치: \n후속조치 필요: \n관련 보고: `,
  },
  {
    name: "현장순회",
    build: (d) =>
      `[현장순회] ${d}\n■ 안전\n- \n■ 품질 / GMP\n- \n■ 5S / 방충방서\n- \n■ 발견사항 → 조치\n- `,
  },
];

function renderNoteTemplates() {
  noteTemplatesEl.innerHTML = "";
  NOTE_TEMPLATES.forEach((tpl) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "note-tpl-btn";
    btn.textContent = tpl.name;
    btn.addEventListener("click", () => {
      const block = tpl.build(noteDate);
      noteText.value = noteText.value.trim()
        ? noteText.value.replace(/\s+$/, "") + "\n\n" + block
        : block;
      flushNoteSave();
      markNoteSaved();
      noteText.focus();
      noteText.scrollTop = noteText.scrollHeight;
    });
    noteTemplatesEl.appendChild(btn);
  });
}

function renderNoteHero() {
  const d = new Date(noteDate);
  noteDayNum.textContent = d.getUTCDate();
  noteDayTitle.textContent = `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 · ${
    ["일", "월", "화", "수", "목", "금", "토"][d.getUTCDay()]
  }요일`;
  const today = todayStr();
  const diff = diffDays(today, noteDate);
  let rel;
  if (diff === 0) rel = "오늘";
  else if (diff === -1) rel = "어제";
  else if (diff === 1) rel = "내일";
  else rel = diff < 0 ? `${-diff}일 전` : `${diff}일 후`;
  noteDaySub.textContent = `${rel} · ${Math.ceil(d.getUTCDate() / 7)}주차`;
  noteDatePick.value = noteDate;
}

// 이 날짜에 걸쳐 있는 업무를 자동으로 보여주는 스트립
function renderNoteTasks() {
  if (!noteTasksEl) return;
  noteTasksEl.innerHTML = "";
  const dayTodos = sortByStart(
    todos.filter(
      (t) => !isUndated(t) && t.startDate <= noteDate && noteDate <= t.endDate
    )
  );
  const head = document.createElement("div");
  head.className = "note-tasks-head";
  head.textContent = dayTodos.length
    ? `이 날짜의 업무 ${dayTodos.length}건`
    : "이 날짜에 걸린 업무 없음 — 위 빠른 추가로 등록하세요";
  noteTasksEl.appendChild(head);

  dayTodos.forEach((todo) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `note-task-chip status-${todo.status}`;
    if (todo.project) {
      chip.style.borderLeft = `3px solid ${projectColor(todo.project)}`;
    }
    const dot = document.createElement("span");
    dot.className = `legend-dot legend-${todo.status}`;
    chip.appendChild(dot);
    chip.appendChild(document.createTextNode(todo.text));
    if (todo.endDate === noteDate && todo.status !== "완료") {
      const b = document.createElement("span");
      b.className = "note-task-due";
      b.textContent = "마감";
      chip.appendChild(b);
    }
    chip.title = `${todo.text} (${todo.startDate}~${todo.endDate} · ${todo.status}) — 클릭하면 수정`;
    chip.addEventListener("click", () => {
      editingId = todo.id;
      currentView = "list";
      viewTabs.forEach((t) =>
        t.classList.toggle("active", t.dataset.view === "list")
      );
      document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
      listView.classList.remove("hidden");
      renderList();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    noteTasksEl.appendChild(chip);
  });
}

function renderPastNotes() {
  notePastList.innerHTML = "";
  const q = (noteSearch.value || "").toLowerCase();
  const dates = Object.keys(workNotes)
    .filter((d) => !q || workNotes[d].toLowerCase().includes(q))
    .sort()
    .reverse()
    .slice(0, 30);
  if (dates.length === 0) {
    const empty = document.createElement("p");
    empty.className = "stat-empty";
    empty.textContent = q ? "검색 결과가 없습니다" : "저장된 노트가 아직 없습니다";
    notePastList.appendChild(empty);
    return;
  }
  dates.forEach((d) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "note-past-row" + (d === noteDate ? " current" : "");
    const dateEl2 = document.createElement("span");
    dateEl2.className = "note-past-date";
    dateEl2.textContent = d;
    const preview = document.createElement("span");
    preview.className = "note-past-preview";
    const firstLine =
      workNotes[d].split("\n").find((l) => l.trim() !== "") || "";
    preview.textContent = firstLine.slice(0, 60);
    row.appendChild(dateEl2);
    row.appendChild(preview);
    row.addEventListener("click", () => openNote(d));
    notePastList.appendChild(row);
  });
}

function openNote(date) {
  flushNoteSave(); // 이전 날짜 내용 먼저 저장
  noteDate = date;
  noteText.value = workNotes[noteDate] || "";
  noteSaveStatus.textContent = workNotes[noteDate] ? "저장됨" : "";
  renderNoteHero();
  renderNoteTasks();
  renderPastNotes();
}

notePrev.addEventListener("click", () => openNote(addDays(noteDate, -1)));
noteNext.addEventListener("click", () => openNote(addDays(noteDate, 1)));
noteTodayBtn.addEventListener("click", () => openNote(todayStr()));
noteDatePick.addEventListener("change", () => {
  if (noteDatePick.value) openNote(noteDatePick.value);
});

noteText.addEventListener("input", () => {
  if (noteSaveTimer) clearTimeout(noteSaveTimer);
  noteSaveStatus.textContent = "입력 중…";
  noteSaveTimer = setTimeout(() => {
    flushNoteSave();
    markNoteSaved();
    renderPastNotes();
  }, 600);
});

noteSearch.addEventListener("input", renderPastNotes);

// 노트에서 선택한 문장 → 할 일 (자연어 파서 재사용, 날짜 없으면 노트 날짜로)
noteToTaskBtn.addEventListener("click", () => {
  const sel = noteText.value
    .substring(noteText.selectionStart, noteText.selectionEnd)
    .split("\n")
    .map((l) => l.replace(/^[-•■\s\[\]]+/, "").trim())
    .find((l) => l !== "");
  if (!sel) {
    alert("노트에서 할 일로 만들 문장을 드래그로 선택한 뒤 눌러주세요.");
    return;
  }
  const p = parseQuickInput(sel);
  if (!p) return;
  if (!p.endDate) {
    p.startDate = noteDate;
    p.endDate = noteDate;
  }
  addTodo({
    text: p.text,
    project: p.project,
    memo: `${noteDate} 노트에서 추가`,
    startDate: p.startDate,
    endDate: p.endDate,
    status: "예정",
    priority: p.priority,
    recurrence: p.recurrence,
  });
  noteSaveStatus.textContent = `✓ 할 일 추가됨: ${p.text}`;
});

// 인쇄: 노트 내용만 담은 인쇄 영역을 채우고 print
notePrintBtn.addEventListener("click", () => {
  flushNoteSave();
  const d = new Date(noteDate);
  const dayTodos = sortByStart(
    todos.filter(
      (t) => !isUndated(t) && t.startDate <= noteDate && noteDate <= t.endDate
    )
  );
  const taskLines = dayTodos
    .map((t) => `· [${t.status}] ${t.text}${t.project ? ` (${t.project})` : ""}`)
    .join("\n");
  notePrintArea.innerHTML = "";
  const h = document.createElement("h1");
  h.textContent = `업무 노트 — ${noteDate} (${["일", "월", "화", "수", "목", "금", "토"][d.getUTCDay()]})`;
  const pre = document.createElement("pre");
  pre.textContent =
    (taskLines ? `[이 날짜의 업무]\n${taskLines}\n\n` : "") +
    (workNotes[noteDate] || "(작성된 노트 없음)");
  notePrintArea.appendChild(h);
  notePrintArea.appendChild(pre);
  window.print();
});

renderNoteTemplates();

/* ---------- 백업 ---------- */

function exportTodos() {
  const payload = {
    app: "todo-app",
    exportedAt: new Date().toISOString(),
    todos,
    workNotes,
    approvalLogs,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `업무백업_${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importTodos(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      // 신형식({todos, workNotes, approvalLogs}) / 구형식(배열) 모두 지원
      const list = Array.isArray(data) ? data : data.todos;
      if (!Array.isArray(list)) throw new Error("형식 오류");
      if (
        todos.length > 0 &&
        !confirm(`현재 ${todos.length}개 항목을 백업 파일(${list.length}개)로 교체할까요?`)
      )
        return;
      todos = list.map(normalizeTodo);
      persist();
      if (!Array.isArray(data)) {
        if (data.workNotes && typeof data.workNotes === "object") {
          workNotes = data.workNotes;
          saveNotesToStorage();
        }
        if (Array.isArray(data.approvalLogs)) {
          approvalLogs = data.approvalLogs;
          saveApprovals();
        }
      }
      if (session) cloudReplaceAll(todos);
      render();
      openNote(noteDate);
    } catch {
      alert("올바른 백업 파일이 아닙니다.");
    }
  };
  reader.readAsText(file);
}

/* ---------- 이벤트 ---------- */

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) {
    input.focus();
    input.placeholder = "⚠ 할 일 제목을 입력해주세요";
    return;
  }
  input.placeholder = "할 일을 입력하세요";
  // 날짜는 선택 사항 — 비워두면 '기간 미정'으로 저장됨
  addTodo({
    text,
    project: projectInput.value.trim(),
    memo: memoInput.value.trim(),
    startDate: startInput.value,
    endDate: endInput.value,
    status: statusInput.value,
    priority: priorityInput.value,
    recurrence: recurrenceInput.value,
  });
  input.value = "";
  memoInput.value = "";
  input.focus();
  startInput.value = todayStr();
  endInput.value = todayStr();
  statusInput.value = "예정";
  priorityInput.value = "보통";
  recurrenceInput.value = "없음";
});

clearCompletedBtn.addEventListener("click", clearCompleted);
exportBtn.addEventListener("click", exportTodos);
importBtn.addEventListener("click", () => importFile.click());
importFile.addEventListener("change", () => {
  if (importFile.files[0]) importTodos(importFile.files[0]);
  importFile.value = "";
});

filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    setFilter(btn.dataset.filter);
  });
});

searchInput.addEventListener("input", () => {
  searchQuery = searchInput.value.trim();
  renderList();
  renderBoard();
  if (currentView === "gantt") renderGantt();
  if (currentView === "calendar") renderCalendar();
});

sortSelect.addEventListener("change", () => {
  sortMode = sortSelect.value;
  renderList();
  renderBoard();
  if (currentView === "gantt") renderGantt();
});

colorbySelect.value = colorBy;
colorbySelect.addEventListener("change", () => {
  colorBy = colorbySelect.value;
  localStorage.setItem("colorBy", colorBy);
  renderGantt();
  renderCalendar();
});

viewTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    viewTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentView = tab.dataset.view;
    listView.classList.toggle("hidden", currentView !== "list");
    boardView.classList.toggle("hidden", currentView !== "board");
    ganttView.classList.toggle("hidden", currentView !== "gantt");
    calendarView.classList.toggle("hidden", currentView !== "calendar");
    statsView.classList.toggle("hidden", currentView !== "stats");
    approvalView.classList.toggle("hidden", currentView !== "approval");
    noteView.classList.toggle("hidden", currentView !== "note");
    if (currentView === "gantt") renderGantt();
    if (currentView === "calendar") renderCalendar();
    if (currentView === "stats") renderStats();
    if (currentView === "approval") renderApprovals();
    if (currentView === "note") openNote(noteDate);
  });
});

let booted = false;

if (sb) {
  loginBtn.addEventListener("click", login);
  signupBtn.addEventListener("click", signup);
  logoutBtn.addEventListener("click", logout);
  authPassword.addEventListener("keydown", (e) => {
    if (e.key === "Enter") login();
  });
  // 첫 인증 이벤트(INITIAL_SESSION)가 올 때 한 번만 초기화 →
  // "로컬 먼저 그리고 클라우드가 덮어쓰는" 경쟁 문제 제거
  sb.auth.onAuthStateChange((_event, sess) => {
    const changed = (sess?.user?.id || null) !== (session?.user?.id || null);
    session = sess;
    updateAuthUI();
    if (!booted || changed) {
      booted = true;
      initData();
    }
  });
  // 혹시 인증 이벤트가 안 오는 환경이면 2초 후 로컬 데이터라도 표시
  setTimeout(() => {
    if (!booted) {
      booted = true;
      initData();
    }
  }, 2000);
} else {
  document.getElementById("auth-bar").classList.add("hidden");
  initData();
}

startInput.value = todayStr();
endInput.value = todayStr();
approvalDate.value = todayStr();
setDate();
updateNotifyBtn();
