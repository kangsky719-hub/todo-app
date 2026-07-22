const STORAGE_KEY = "todos";
const STATUSES = ["예정", "진행중", "완료"];
const STATUS_PROGRESS = { 예정: 0, 진행중: 50, 완료: 100 };
const PRIORITIES = ["높음", "보통", "낮음"];
const PRIO_RANK = { 높음: 0, 보통: 1, 낮음: 2 };

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
const priorityInput = document.getElementById("priority-input");
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
    priority: PRIORITIES.includes(t.priority) ? t.priority : "보통",
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
    priority: PRIORITIES.includes(r.priority) ? r.priority : "보통",
  };
}

// DB에 priority 컬럼이 아직 없으면 자동으로 빼고 저장 (SQL 실행 전 호환)
let priorityColumnMissing = false;

function toRow(t) {
  const row = {
    id: t.id,
    text: t.text,
    memo: t.memo,
    project: t.project,
    start_date: t.startDate,
    end_date: t.endDate,
    status: t.status,
  };
  if (!priorityColumnMissing) row.priority = t.priority;
  return row;
}

function isPriorityColumnError(error) {
  return !priorityColumnMissing && /priority/i.test(error.message || "");
}

function syncOkOrPriorityWarn() {
  if (priorityColumnMissing) {
    setSync("동기화됨 (우선순위 제외 — Supabase에 priority 컬럼 추가 필요)", true);
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
  if (error && isPriorityColumnError(error)) {
    priorityColumnMissing = true;
    ({ error } = await sb.from("todos").insert(toRow(todo)));
  }
  if (error) cloudError(error, "저장");
  else syncOkOrPriorityWarn();
}

async function cloudUpdate(todo) {
  let { error } = await sb.from("todos").update(toRow(todo)).eq("id", todo.id);
  if (error && isPriorityColumnError(error)) {
    priorityColumnMissing = true;
    ({ error } = await sb.from("todos").update(toRow(todo)).eq("id", todo.id));
  }
  if (error) cloudError(error, "수정");
  else syncOkOrPriorityWarn();
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
    if (insErr && isPriorityColumnError(insErr)) {
      priorityColumnMissing = true;
      ({ error: insErr } = await sb.from("todos").insert(items.map(toRow)));
    }
    if (insErr) return cloudError(insErr, "교체(저장)");
  }
  syncOkOrPriorityWarn();
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
  if (sortMode === "priority") {
    return [...arr].sort(
      (a, b) =>
        PRIO_RANK[a.priority] - PRIO_RANK[b.priority] ||
        a.endDate.localeCompare(b.endDate)
    );
  }
  if (sortMode === "end") {
    return [...arr].sort((a, b) =>
      a.endDate === b.endDate
        ? a.startDate.localeCompare(b.startDate)
        : a.endDate.localeCompare(b.endDate)
    );
  }
  return [...arr].sort((a, b) =>
    a.startDate === b.startDate
      ? a.endDate.localeCompare(b.endDate)
      : a.startDate.localeCompare(b.startDate)
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
  // 완료 업무는 D-day 없음. 반환: null | 0(오늘 마감) | 양수(남은 일수) | 음수(지연 일수)
  if (todo.status === "완료") return null;
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
  const todo = normalizeTodo({
    id: Date.now(),
    ...data,
    endDate: data.endDate < data.startDate ? data.startDate : data.endDate,
  });
  todos.push(todo);
  if (loadingCloud) pendingAdds.add(todo.id);
  persist();
  if (session && !loadingCloud) cloudInsert(todo);
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
  renderList();
  renderBoard();
  renderGantt();
  renderCalendar();
  renderStats();
  updateProjectDatalist();
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

  row.appendChild(projectField);
  row.appendChild(startField);
  row.appendChild(endField);
  row.appendChild(priorityField);

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
        dates.className = "board-card-dates";
        dates.textContent = `${todo.startDate} ~ ${todo.endDate}`;
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

  const sorted = sortByStart(searched);
  const today = todayStr();
  let minD = today;
  let maxD = today;
  sorted.forEach((t) => {
    if (t.startDate < minD) minD = t.startDate;
    if (t.endDate > maxD) maxD = t.endDate;
  });
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

function parseQuickInput(raw) {
  let text = raw.trim();
  if (!text) return null;
  const today = todayStr();
  const out = {
    project: "",
    priority: "보통",
    startDate: today,
    endDate: today,
    dateLabel: "오늘",
  };

  text = text.replace(/#(\S+)/, (_, p) => {
    out.project = p;
    return "";
  });
  text = text.replace(/!(높음|보통|낮음)/, (_, p) => {
    out.priority = p;
    return "";
  });

  let dateFound = null;
  let label = "";

  // "7/25", "7월 25일" 형식
  let m = text.match(/(\d{1,2})\s*[\/월]\s*(\d{1,2})\s*일?\s*(까지)?/);
  if (m) {
    const y = Number(today.slice(0, 4));
    dateFound = `${y}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
    label = `${Number(m[1])}/${Number(m[2])}`;
    text = text.replace(m[0], "");
  }
  // 오늘/내일/모레
  if (!dateFound) {
    m = text.match(/(오늘|내일|모레)\s*(까지)?/);
    if (m) {
      const offs = { 오늘: 0, 내일: 1, 모레: 2 };
      dateFound = addDays(today, offs[m[1]]);
      label = m[1];
      text = text.replace(m[0], "");
    }
  }
  // (다음주) X요일
  if (!dateFound) {
    m = text.match(/(다음\s*주\s*)?([일월화수목금토])요일\s*(까지)?/);
    if (m) {
      const dow = new Date(today).getUTCDay();
      let diff;
      if (m[1]) {
        // 다음주 X요일 = 다음 주(월요일 시작)의 해당 요일
        const toNextMonday = ((1 - dow + 7) % 7) || 7;
        diff = toNextMonday + ((DOW_MAP[m[2]] - 1 + 7) % 7);
      } else {
        // 가장 가까운 X요일 (오늘 포함)
        diff = (DOW_MAP[m[2]] - dow + 7) % 7;
      }
      dateFound = addDays(today, diff);
      label = (m[1] ? "다음주 " : "") + m[2] + "요일";
      text = text.replace(m[0], "");
    }
  }

  if (dateFound && dateFound >= today) {
    out.endDate = dateFound;
    out.dateLabel = label;
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
  parts.push(`마감 ${p.endDate} (${p.dateLabel})`);
  if (p.priority !== "보통") parts.push(`우선순위 ${p.priority}`);
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

function checkDeadlineNotifications(force = false) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (!force && localStorage.getItem(NOTIFIED_KEY) === todayStr()) return;

  const overdue = todos.filter(isOverdue).length;
  const dueToday = todos.filter((t) => dDay(t) === 0).length;
  const dueTomorrow = todos.filter((t) => dDay(t) === 1).length;
  if (overdue + dueToday + dueTomorrow === 0) return;

  const parts = [];
  if (overdue) parts.push(`지연 ${overdue}건`);
  if (dueToday) parts.push(`오늘 마감 ${dueToday}건`);
  if (dueTomorrow) parts.push(`내일 마감 ${dueTomorrow}건`);
  try {
    new Notification("업무 진행 관리", { body: parts.join(" · ") });
    localStorage.setItem(NOTIFIED_KEY, todayStr());
  } catch (e) {
    console.error("notification", e);
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
});

setInterval(() => checkDeadlineNotifications(), 30 * 60 * 1000);

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
  if (!text) {
    input.focus();
    input.placeholder = "⚠ 할 일 제목을 입력해주세요";
    return;
  }
  input.placeholder = "할 일을 입력하세요";
  if (!startInput.value || !endInput.value) {
    alert("시작일과 종료일을 선택해주세요.");
    return;
  }
  addTodo({
    text,
    project: projectInput.value.trim(),
    memo: memoInput.value.trim(),
    startDate: startInput.value,
    endDate: endInput.value,
    status: statusInput.value,
    priority: priorityInput.value,
  });
  input.value = "";
  memoInput.value = "";
  input.focus();
  startInput.value = todayStr();
  endInput.value = todayStr();
  statusInput.value = "예정";
  priorityInput.value = "보통";
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
    if (currentView === "gantt") renderGantt();
    if (currentView === "calendar") renderCalendar();
    if (currentView === "stats") renderStats();
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
setDate();
updateNotifyBtn();
