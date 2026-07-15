const STORAGE_KEY = "todos";
const STATUSES = ["예정", "진행중", "완료"];
const STATUS_PROGRESS = { 예정: 0, 진행중: 50, 완료: 100 };

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
  return {
    id: t.id || Date.now() + Math.floor(Math.random() * 1000),
    text: t.text || "",
    memo: t.memo || "",
    project: t.project || "",
    startDate: t.startDate || todayStr(),
    endDate: t.endDate || t.startDate || todayStr(),
    status: STATUSES.includes(t.status) ? t.status : t.completed ? "완료" : "예정",
  };
}

function fromRow(r) {
  return {
    id: r.id,
    text: r.text,
    memo: r.memo || "",
    project: r.project || "",
    startDate: r.start_date,
    endDate: r.end_date,
    status: r.status,
  };
}

function toRow(t) {
  return {
    id: t.id,
    text: t.text,
    memo: t.memo,
    project: t.project,
    start_date: t.startDate,
    end_date: t.endDate,
    status: t.status,
  };
}

function loadLocal() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? JSON.parse(raw) : [];
  return parsed.map(normalizeTodo);
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

function cloudError(error, action) {
  console.error(action, error);
  alert(`클라우드 ${action} 중 오류가 발생했습니다: ${error.message}`);
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
  const { error } = await sb.from("todos").insert(toRow(todo));
  if (error) cloudError(error, "저장");
}

async function cloudUpdate(todo) {
  const { error } = await sb.from("todos").update(toRow(todo)).eq("id", todo.id);
  if (error) cloudError(error, "수정");
}

async function cloudDelete(id) {
  const { error } = await sb.from("todos").delete().eq("id", id);
  if (error) cloudError(error, "삭제");
}

async function cloudReplaceAll(items) {
  const { error: delErr } = await sb.from("todos").delete().neq("id", -1);
  if (delErr) return cloudError(delErr, "교체(삭제)");
  if (items.length) {
    const { error: insErr } = await sb.from("todos").insert(items.map(toRow));
    if (insErr) cloudError(insErr, "교체(저장)");
  }
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

async function initData() {
  if (session && sb) {
    const cloud = await cloudLoad();
    if (cloud === null) return;
    const local = loadLocal();
    if (cloud.length === 0 && local.length > 0) {
      if (confirm(`이 브라우저에 저장된 ${local.length}개 항목을 클라우드로 업로드할까요?`)) {
        todos = local;
        await cloudReplaceAll(local);
      } else {
        todos = [];
      }
    } else {
      todos = cloud;
    }
    saveLocal();
  } else {
    todos = loadLocal();
  }
  render();
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

function isOverdue(todo) {
  return todo.status !== "완료" && todo.endDate < todayStr();
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
  return [...arr].sort((a, b) =>
    a.startDate === b.startDate
      ? a.endDate.localeCompare(b.endDate)
      : a.startDate.localeCompare(b.startDate)
  );
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
  const todo = normalizeTodo({
    id: Date.now(),
    ...data,
    endDate: data.endDate < data.startDate ? data.startDate : data.endDate,
  });
  todos.push(todo);
  persist();
  if (session) cloudInsert(todo);
  render();
}

function updateTodo(id, data) {
  const idx = todos.findIndex((t) => t.id === id);
  if (idx === -1) return;
  todos[idx] = normalizeTodo({
    ...todos[idx],
    ...data,
    endDate: data.endDate < data.startDate ? data.startDate : data.endDate,
  });
  persist();
  if (session) cloudUpdate(todos[idx]);
  render();
}

function setStatus(id, status) {
  const todo = todos.find((t) => t.id === id);
  if (!todo) return;
  todo.status = status;
  persist();
  if (session) cloudUpdate(todo);
  render();
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
  if (currentFilter === "all") return todos;
  if (currentFilter === "지연") return todos.filter(isOverdue);
  return todos.filter((t) => t.status === currentFilter);
}

function render() {
  renderList();
  renderGantt();
  updateProjectDatalist();
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
        header.textContent = groupName;
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

  const main = document.createElement("div");
  main.className = "todo-main";

  const text = document.createElement("span");
  text.className = "todo-text";
  text.textContent = todo.text;

  const dates = document.createElement("span");
  dates.className = "todo-dates";
  dates.textContent = `${todo.startDate} ~ ${todo.endDate}`;
  if (isOverdue(todo)) {
    const badge = document.createElement("span");
    badge.className = "overdue-badge";
    badge.textContent = "지연";
    dates.appendChild(badge);
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

  row.appendChild(projectField);
  row.appendChild(startField);
  row.appendChild(endField);

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

/* ---------- 간트차트 뷰 ---------- */

function renderGantt() {
  ganttChart.innerHTML = "";

  if (todos.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "할 일이 없습니다";
    ganttChart.appendChild(empty);
    return;
  }

  const sorted = sortByStart(todos);
  const dayMs = 24 * 60 * 60 * 1000;
  const todayMs = new Date(todayStr()).getTime();
  const starts = sorted.map((t) => new Date(t.startDate).getTime());
  const ends = sorted.map((t) => new Date(t.endDate).getTime());
  const minDate = Math.min(...starts, todayMs);
  const maxDate = Math.max(...ends, todayMs);
  const totalRange = Math.max(maxDate - minDate, dayMs);
  const todayPct = ((todayMs - minDate) / totalRange) * 100;

  const header = document.createElement("div");
  header.className = "gantt-header";
  const startLabel = document.createElement("span");
  startLabel.textContent = new Date(minDate).toLocaleDateString("ko-KR");
  const todayLabel = document.createElement("span");
  todayLabel.className = "gantt-today-label";
  todayLabel.textContent = "오늘";
  const endLabel = document.createElement("span");
  endLabel.textContent = new Date(maxDate).toLocaleDateString("ko-KR");
  header.appendChild(startLabel);
  header.appendChild(todayLabel);
  header.appendChild(endLabel);
  ganttChart.appendChild(header);

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
      const gh = document.createElement("div");
      gh.className = "project-header gantt-group";
      gh.textContent = groupName;
      ganttChart.appendChild(gh);
    }
    items.forEach((todo) => {
      const row = document.createElement("div");
      row.className = "gantt-row";

      const label = document.createElement("div");
      label.className = "gantt-label";
      label.textContent = todo.text;
      label.title = todo.memo ? `${todo.text}\n${todo.memo}` : todo.text;

      const track = document.createElement("div");
      track.className = "gantt-track";

      const taskStart = new Date(todo.startDate).getTime();
      const taskEnd = new Date(todo.endDate).getTime();
      const leftPct = ((taskStart - minDate) / totalRange) * 100;
      const widthPct = Math.max(((taskEnd - taskStart) / totalRange) * 100, 2);

      const bar = document.createElement("div");
      bar.className =
        `gantt-bar status-${todo.status}` + (isOverdue(todo) ? " overdue" : "");
      bar.style.left = `${leftPct}%`;
      bar.style.width = `${widthPct}%`;
      bar.title = `${todo.text} (${todo.status}${isOverdue(todo) ? " · 지연" : ""})`;

      const fill = document.createElement("div");
      fill.className = "gantt-bar-fill";
      fill.style.width = `${STATUS_PROGRESS[todo.status]}%`;
      bar.appendChild(fill);

      const todayLine = document.createElement("div");
      todayLine.className = "gantt-today-line";
      todayLine.style.left = `${todayPct}%`;

      track.appendChild(bar);
      track.appendChild(todayLine);
      row.appendChild(label);
      row.appendChild(track);
      ganttChart.appendChild(row);
    });
  });
}

/* ---------- 백업 ---------- */

function exportTodos() {
  const blob = new Blob([JSON.stringify(todos, null, 2)], {
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
      if (!Array.isArray(data)) throw new Error("형식 오류");
      if (
        todos.length > 0 &&
        !confirm(`현재 ${todos.length}개 항목을 백업 파일(${data.length}개)로 교체할까요?`)
      )
        return;
      todos = data.map(normalizeTodo);
      persist();
      if (session) cloudReplaceAll(todos);
      render();
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
  if (!text || !startInput.value || !endInput.value) return;
  addTodo({
    text,
    project: projectInput.value.trim(),
    memo: memoInput.value.trim(),
    startDate: startInput.value,
    endDate: endInput.value,
    status: statusInput.value,
  });
  input.value = "";
  memoInput.value = "";
  input.focus();
  startInput.value = todayStr();
  endInput.value = todayStr();
  statusInput.value = "예정";
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
    filterBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderList();
  });
});

viewTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    viewTabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentView = tab.dataset.view;
    listView.classList.toggle("hidden", currentView !== "list");
    ganttView.classList.toggle("hidden", currentView !== "gantt");
  });
});

if (sb) {
  loginBtn.addEventListener("click", login);
  signupBtn.addEventListener("click", signup);
  logoutBtn.addEventListener("click", logout);
  authPassword.addEventListener("keydown", (e) => {
    if (e.key === "Enter") login();
  });
  sb.auth.onAuthStateChange((_event, sess) => {
    const changed = (sess?.user?.id || null) !== (session?.user?.id || null);
    session = sess;
    updateAuthUI();
    if (changed) initData();
  });
} else {
  document.getElementById("auth-bar").classList.add("hidden");
}

startInput.value = todayStr();
endInput.value = todayStr();
setDate();
initData();
