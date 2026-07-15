const STORAGE_KEY = "todos";
const STATUSES = ["예정", "진행중", "완료"];
const STATUS_PROGRESS = { 예정: 0, 진행중: 50, 완료: 100 };

let todos = loadTodos();
let currentFilter = "all";
let currentView = "list";

const form = document.getElementById("todo-form");
const input = document.getElementById("todo-input");
const startInput = document.getElementById("start-input");
const endInput = document.getElementById("end-input");
const statusInput = document.getElementById("status-input");
const list = document.getElementById("todo-list");
const itemsLeft = document.getElementById("items-left");
const clearCompletedBtn = document.getElementById("clear-completed");
const filterBtns = document.querySelectorAll(".filter-btn");
const viewTabs = document.querySelectorAll(".view-tab");
const listView = document.getElementById("list-view");
const ganttView = document.getElementById("gantt-view");
const ganttChart = document.getElementById("gantt-chart");
const dateEl = document.getElementById("date");

function loadTodos() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? JSON.parse(raw) : [];
  return parsed.map((t) => ({
    startDate: t.startDate || todayStr(),
    endDate: t.endDate || t.startDate || todayStr(),
    status: STATUSES.includes(t.status) ? t.status : (t.completed ? "완료" : "예정"),
    ...t,
  }));
}

function saveTodos() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function setDate() {
  const today = new Date();
  dateEl.textContent = today.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

function addTodo(text, startDate, endDate, status) {
  todos.push({
    id: Date.now(),
    text,
    startDate,
    endDate: endDate < startDate ? startDate : endDate,
    status,
  });
  saveTodos();
  render();
}

function setStatus(id, status) {
  const todo = todos.find((t) => t.id === id);
  if (todo) todo.status = status;
  saveTodos();
  render();
}

function deleteTodo(id) {
  todos = todos.filter((t) => t.id !== id);
  saveTodos();
  render();
}

function clearCompleted() {
  todos = todos.filter((t) => t.status !== "완료");
  saveTodos();
  render();
}

function getFilteredTodos() {
  if (currentFilter === "all") return todos;
  return todos.filter((t) => t.status === currentFilter);
}

function render() {
  renderList();
  renderGantt();
}

function renderList() {
  const filtered = getFilteredTodos();
  list.innerHTML = "";

  if (filtered.length === 0) {
    const empty = document.createElement("li");
    empty.className = "empty-state";
    empty.textContent = "할 일이 없습니다";
    list.appendChild(empty);
  } else {
    filtered.forEach((todo) => {
      const li = document.createElement("li");
      li.className = `todo-item status-${todo.status}` + (todo.status === "완료" ? " completed" : "");

      const main = document.createElement("div");
      main.className = "todo-main";

      const text = document.createElement("span");
      text.className = "todo-text";
      text.textContent = todo.text;

      const dates = document.createElement("span");
      dates.className = "todo-dates";
      dates.textContent = `${todo.startDate} ~ ${todo.endDate}`;

      main.appendChild(text);
      main.appendChild(dates);

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

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "todo-delete";
      deleteBtn.textContent = "×";
      deleteBtn.addEventListener("click", () => deleteTodo(todo.id));

      li.appendChild(main);
      li.appendChild(statusSelect);
      li.appendChild(deleteBtn);
      list.appendChild(li);
    });
  }

  const activeCount = todos.filter((t) => t.status !== "완료").length;
  itemsLeft.textContent = `${activeCount}개 남음`;
}

function renderGantt() {
  ganttChart.innerHTML = "";

  if (todos.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "할 일이 없습니다";
    ganttChart.appendChild(empty);
    return;
  }

  const starts = todos.map((t) => new Date(t.startDate).getTime());
  const ends = todos.map((t) => new Date(t.endDate).getTime());
  const minDate = Math.min(...starts);
  const maxDate = Math.max(...ends);
  const dayMs = 24 * 60 * 60 * 1000;
  const totalRange = Math.max(maxDate - minDate, dayMs);

  const header = document.createElement("div");
  header.className = "gantt-header";
  const startLabel = document.createElement("span");
  startLabel.textContent = new Date(minDate).toLocaleDateString("ko-KR");
  const endLabel = document.createElement("span");
  endLabel.textContent = new Date(maxDate).toLocaleDateString("ko-KR");
  header.appendChild(startLabel);
  header.appendChild(endLabel);
  ganttChart.appendChild(header);

  todos.forEach((todo) => {
    const row = document.createElement("div");
    row.className = "gantt-row";

    const label = document.createElement("div");
    label.className = "gantt-label";
    label.textContent = todo.text;
    label.title = todo.text;

    const track = document.createElement("div");
    track.className = "gantt-track";

    const taskStart = new Date(todo.startDate).getTime();
    const taskEnd = new Date(todo.endDate).getTime();
    const leftPct = ((taskStart - minDate) / totalRange) * 100;
    const widthPct = Math.max(((taskEnd - taskStart) / totalRange) * 100, 2);

    const bar = document.createElement("div");
    bar.className = `gantt-bar status-${todo.status}`;
    bar.style.left = `${leftPct}%`;
    bar.style.width = `${widthPct}%`;
    bar.title = `${todo.text} (${todo.status})`;

    const fill = document.createElement("div");
    fill.className = "gantt-bar-fill";
    fill.style.width = `${STATUS_PROGRESS[todo.status]}%`;

    bar.appendChild(fill);
    track.appendChild(bar);
    row.appendChild(label);
    row.appendChild(track);
    ganttChart.appendChild(row);
  });
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || !startInput.value || !endInput.value) return;
  addTodo(text, startInput.value, endInput.value, statusInput.value);
  input.value = "";
  input.focus();
  startInput.value = todayStr();
  endInput.value = todayStr();
  statusInput.value = "예정";
});

clearCompletedBtn.addEventListener("click", clearCompleted);

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

startInput.value = todayStr();
endInput.value = todayStr();
setDate();
render();
