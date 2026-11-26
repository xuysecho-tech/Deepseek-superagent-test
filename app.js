(() => {
  "use strict";

  const STORAGE_KEY = "simple-todo:v1";
  const THEME_KEY = "simple-todo:theme";
  const TOAST_DURATION = 6000;
  const DAY_MS = 86400000;
  const PRIORITIES = ["low", "medium", "high"];
  const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
  const PRIORITY_LABEL = { low: "低", medium: "中", high: "高" };
  const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  const VIEW_META = {
    today: { eyebrow: "Today", title: "今天" },
    tomorrow: { eyebrow: "Tomorrow", title: "明天" },
    next7: { eyebrow: "Next 7 days", title: "未来七天" },
    all: { eyebrow: "All tasks", title: "全部待办" },
    overdue: { eyebrow: "Overdue", title: "已逾期" },
    completed: { eyebrow: "Completed", title: "已完成" },
  };

  const EMPTY_COPY = {
    today: { title: "今天还没有待办", text: "点击「添加」安排今天的第一件事。" },
    tomorrow: { title: "明天还没有安排", text: "提前计划，明天更从容。" },
    next7: { title: "未来七天没有待办", text: "把接下来要做的事加进来吧。" },
    all: { title: "还没有待办", text: "添加第一件，让一切井井有条。" },
    overdue: { title: "没有逾期任务", text: "保持得很好，继续加油。" },
    completed: { title: "还没有已完成", text: "完成任务后会出现在这里。" },
  };

  const PENCIL_ICON = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3Z"/>
      <path d="m14.5 6.5 3 3"/>
    </svg>`;
  const TRASH_ICON = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 7h16"/>
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
      <path d="m6 7 1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12"/>
      <path d="M10 11v5M14 11v5"/>
    </svg>`;

  const els = {
    navItems: Array.from(document.querySelectorAll("[data-view]")),
    navCounts: Array.from(document.querySelectorAll("[data-view-count]")),
    themeToggle: document.querySelector("#theme-toggle"),
    themeLabel: document.querySelector("#theme-label"),
    themeMeta: document.querySelector("#theme-color"),
    searchInput: document.querySelector("#search-input"),
    searchClear: document.querySelector("#search-clear"),
    addTask: document.querySelector("#add-task"),
    eyebrow: document.querySelector("#view-eyebrow"),
    title: document.querySelector("#view-title"),
    subtitle: document.querySelector("#view-subtitle"),
    mainContent: document.querySelector("#main-content"),
    list: document.querySelector("#task-list"),
    empty: document.querySelector("#empty-state"),
    emptyTitle: document.querySelector("#empty-title"),
    emptyText: document.querySelector("#empty-text"),
    listCount: document.querySelector("#list-count"),
    clearCompleted: document.querySelector("#clear-completed"),
    todayCompleted: document.querySelector("#today-completed"),
    todayCompletedCount: document.querySelector("#today-completed-count"),
    todayCompletedList: document.querySelector("#today-completed-list"),
    progressText: document.querySelector("#today-progress-text"),
    progressFill: document.querySelector("#today-progress-fill"),
    progressTrack: document.querySelector("#today-progress-track"),
    status: document.querySelector("#status"),
    dialog: document.querySelector("#task-dialog"),
    dialogTitle: document.querySelector("#dialog-title"),
    dialogSubmit: document.querySelector("#dialog-submit"),
    dialogForm: document.querySelector("#task-form"),
    dialogClose: document.querySelector("#dialog-close"),
    dialogCancel: document.querySelector("#dialog-cancel"),
    titleInput: document.querySelector("#task-title"),
    titleError: document.querySelector("#title-error"),
    notesInput: document.querySelector("#task-notes"),
    dateInput: document.querySelector("#task-date"),
    quickDateButtons: Array.from(document.querySelectorAll("[data-quick-date]")),
    priorityInputs: Array.from(document.querySelectorAll('input[name="priority"]')),
    toast: document.querySelector("#toast"),
    toastText: document.querySelector("#toast-text"),
    toastUndo: document.querySelector("#toast-undo"),
  };

  const state = {
    todos: loadTodos(),
    view: "today",
    query: "",
  };

  let editingId = null;
  let undoState = null;
  let undoTimer = null;

  // ---- 基础工具 ----

  function uid() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `todo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function dateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function parseDateKey(key) {
    const [year, month, day] = key.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  function isValidDateKey(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function addDays(key, amount) {
    const date = parseDateKey(key);
    date.setDate(date.getDate() + amount);
    return dateKey(date);
  }

  function daysFromToday(key) {
    const today = parseDateKey(dateKey());
    return Math.round((parseDateKey(key) - today) / DAY_MS);
  }

  function formatShort(key) {
    const date = parseDateKey(key);
    const now = new Date();
    if (date.getFullYear() === now.getFullYear()) {
      return `${date.getMonth() + 1}月${date.getDate()}日`;
    }
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  }

  function formatFull(key) {
    const date = parseDateKey(key);
    const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(date);
    return `${date.getMonth() + 1}月${date.getDate()}日 · ${weekday}`;
  }

  function weekdayName(key) {
    return WEEKDAYS[parseDateKey(key).getDay()];
  }

  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function isTypingTarget(target) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    if (target.tagName === "TEXTAREA") return true;
    if (target.tagName !== "INPUT") return false;
    return ["text", "search", "email", "number", "password", "tel", "url"].includes(target.type);
  }

  // ---- 数据 ----

  function loadTodos() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const now = Date.now();
      return parsed
        .filter((todo) => todo && typeof todo.id === "string" && typeof todo.title === "string" && todo.title.trim() !== "")
        .map((todo, index) => ({
          id: todo.id,
          title: todo.title.trim(),
          notes: typeof todo.notes === "string" ? todo.notes : "",
          dueDate: isValidDateKey(todo.dueDate) ? todo.dueDate : null,
          priority: PRIORITIES.includes(todo.priority) ? todo.priority : "medium",
          done: todo.done === true,
          createdAt: Number.isFinite(todo.createdAt) ? todo.createdAt : now - (parsed.length - index),
          completedAt: Number.isFinite(todo.completedAt) ? todo.completedAt : todo.done === true ? now : null,
        }));
    } catch (error) {
      return [];
    }
  }

  function saveTodos() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.todos));
    } catch (error) {
      // 隐私模式等场景下无法写入，页面仍可正常使用。
    }
  }

  // ---- 主题 ----

  function storedTheme() {
    try {
      const theme = localStorage.getItem(THEME_KEY);
      return theme === "dark" || theme === "light" ? theme : null;
    } catch (error) {
      return null;
    }
  }

  function applyTheme(theme, persist) {
    document.documentElement.dataset.theme = theme;
    const dark = theme === "dark";
    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch (error) {
        // 主题仍会立即生效，只是无法记住选择。
      }
    }
    els.themeLabel.textContent = dark ? "浅色模式" : "深色模式";
    els.themeToggle.setAttribute("aria-label", dark ? "切换到浅色模式" : "切换到深色模式");
    if (els.themeMeta) {
      els.themeMeta.setAttribute("content", dark ? "#0b0d13" : "#f3f4fa");
    }
  }

  function initTheme() {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    applyTheme(current, false);
    if (typeof window.matchMedia === "function") {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      media.addEventListener?.("change", (event) => {
        if (storedTheme()) return;
        applyTheme(event.matches ? "dark" : "light", false);
      });
    }
  }

  // ---- 任务与视图 ----

  function activeTasks() {
    return state.todos.filter((todo) => !todo.done);
  }

  function completedTodayTasks() {
    const today = dateKey();
    return state.todos.filter(
      (todo) =>
        todo.done &&
        ((Number.isFinite(todo.completedAt) && dateKey(new Date(todo.completedAt)) === today) || todo.dueDate === today),
    );
  }

  function viewCounts() {
    const today = dateKey();
    const tomorrow = addDays(today, 1);
    const weekEnd = addDays(today, 6);
    const active = activeTasks();
    const count = (predicate) => active.filter(predicate).length;
    return {
      today: count((todo) => todo.dueDate === today),
      tomorrow: count((todo) => todo.dueDate === tomorrow),
      next7: count((todo) => Boolean(todo.dueDate) && todo.dueDate >= today && todo.dueDate <= weekEnd),
      all: active.length,
      overdue: count((todo) => Boolean(todo.dueDate) && todo.dueDate < today),
      completed: state.todos.filter((todo) => todo.done).length,
    };
  }

  function viewTasks(view) {
    const today = dateKey();
    const tomorrow = addDays(today, 1);
    const weekEnd = addDays(today, 6);
    const active = activeTasks();
    switch (view) {
      case "today":
        return active.filter((todo) => todo.dueDate === today);
      case "tomorrow":
        return active.filter((todo) => todo.dueDate === tomorrow);
      case "next7":
        return active.filter((todo) => Boolean(todo.dueDate) && todo.dueDate >= today && todo.dueDate <= weekEnd);
      case "overdue":
        return active.filter((todo) => Boolean(todo.dueDate) && todo.dueDate < today);
      case "completed":
        return state.todos.filter((todo) => todo.done);
      default:
        return active;
    }
  }

  function sortForView(list, view) {
    return [...list].sort((a, b) => {
      if (view === "completed") return (b.completedAt || 0) - (a.completedAt || 0);
      if (a.dueDate !== b.dueDate) {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate < b.dueDate ? -1 : 1;
      }
      const priority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (priority !== 0) return priority;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }

  function matchesQuery(todo) {
    const query = state.query.trim().toLowerCase();
    if (!query) return true;
    return todo.title.toLowerCase().includes(query) || todo.notes.toLowerCase().includes(query);
  }

  function isVisibleInView(todo, view) {
    if (view === "completed") return todo.done;
    if (todo.done) return false;
    const today = dateKey();
    switch (view) {
      case "today":
        return todo.dueDate === today;
      case "tomorrow":
        return todo.dueDate === addDays(today, 1);
      case "next7":
        return Boolean(todo.dueDate) && todo.dueDate >= today && todo.dueDate <= addDays(today, 6);
      case "overdue":
        return Boolean(todo.dueDate) && todo.dueDate < today;
      default:
        return true;
    }
  }

  function viewForTask(todo) {
    const today = dateKey();
    if (!todo.dueDate) return "all";
    if (todo.dueDate === today) return "today";
    if (todo.dueDate === addDays(today, 1)) return "tomorrow";
    if (todo.dueDate < today) return "overdue";
    if (todo.dueDate <= addDays(today, 6)) return "next7";
    return "all";
  }

  function dueChipInfo(todo) {
    if (!todo.dueDate) return null;
    const diff = daysFromToday(todo.dueDate);
    if (todo.done) {
      if (diff === 0) return { label: "今天", tone: "done" };
      if (diff === 1) return { label: "明天", tone: "done" };
      return { label: formatShort(todo.dueDate), tone: "done" };
    }
    if (diff === 0) return { label: "今天", tone: "today" };
    if (diff === 1) return { label: "明天", tone: "soon" };
    if (diff < 0) return { label: `逾期 ${formatShort(todo.dueDate)}`, tone: "overdue" };
    if (diff <= 7) return { label: weekdayName(todo.dueDate), tone: "soon" };
    return { label: formatShort(todo.dueDate), tone: "normal" };
  }

  function emptyCopyFor(view) {
    if (state.query.trim()) {
      return { title: "没有匹配的待办", text: "换个关键词试试，或清空搜索。" };
    }
    if (view === "today" && completedTodayTasks().length > 0) {
      return { title: "今天的待办都完成了", text: "很好，休息一下，或者添加新的安排。" };
    }
    return EMPTY_COPY[view] || EMPTY_COPY.all;
  }

  function subtitleForView(counts) {
    const today = dateKey();
    switch (state.view) {
      case "today":
        return `${formatFull(today)} · 待完成 ${counts.today} 项`;
      case "tomorrow":
        return `${formatFull(addDays(today, 1))} · 待完成 ${counts.tomorrow} 项`;
      case "next7":
        return `${formatShort(today)} 至 ${formatShort(addDays(today, 6))} · 待完成 ${counts.next7} 项`;
      case "overdue":
        return counts.overdue > 0 ? `共 ${counts.overdue} 项已逾期` : "没有逾期任务";
      case "completed":
        return `共 ${counts.completed} 项已完成`;
      default:
        return `共 ${counts.all} 项待完成`;
    }
  }

  // ---- 渲染 ----

  function createTask(todo, view) {
    const item = document.createElement("li");
    item.className = "task";
    item.dataset.id = todo.id;
    if (todo.done) item.classList.add("is-done");

    const checkLabel = document.createElement("label");
    checkLabel.className = "task__check";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "task__checkbox";
    checkbox.checked = todo.done;
    checkbox.setAttribute("aria-label", `标记「${todo.title}」为${todo.done ? "未完成" : "已完成"}`);
    checkbox.addEventListener("change", () => toggleTodo(todo.id));

    const box = document.createElement("span");
    box.className = "task__box";
    box.setAttribute("aria-hidden", "true");

    checkLabel.append(checkbox, box);

    const main = document.createElement("div");
    main.className = "task__main";

    const title = document.createElement("button");
    title.type = "button";
    title.className = "task__title";
    title.textContent = todo.title;
    title.setAttribute("aria-label", `编辑「${todo.title}」`);
    title.addEventListener("click", () => openTaskDialog(todo));
    main.append(title);

    if (todo.notes) {
      const notes = document.createElement("p");
      notes.className = "task__notes";
      notes.textContent = todo.notes;
      main.append(notes);
    }

    const meta = document.createElement("div");
    meta.className = "task__meta";

    const chipInfo = dueChipInfo(todo);
    if (chipInfo) {
      const chip = document.createElement("span");
      chip.className = `date-chip date-chip--${chipInfo.tone}`;
      chip.textContent = chipInfo.label;
      meta.append(chip);
    } else if (view === "all") {
      const chip = document.createElement("span");
      chip.className = "date-chip date-chip--none";
      chip.textContent = "未安排";
      meta.append(chip);
    }

    if (!todo.done) {
      const priority = document.createElement("span");
      priority.className = `priority priority--${todo.priority}`;
      priority.title = `${PRIORITY_LABEL[todo.priority]}优先级`;
      priority.innerHTML = `<span class="priority__dot" aria-hidden="true"></span>${PRIORITY_LABEL[todo.priority]}`;
      meta.append(priority);
    }

    if (todo.done && todo.completedAt) {
      const doneChip = document.createElement("span");
      doneChip.className = "date-chip date-chip--done";
      doneChip.textContent = `完成于 ${formatTimestamp(todo.completedAt)}`;
      meta.append(doneChip);
    }

    main.append(meta);

    const actions = document.createElement("div");
    actions.className = "task__actions";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "task__tool task__edit";
    edit.setAttribute("aria-label", `编辑「${todo.title}」`);
    edit.setAttribute("title", "编辑任务");
    edit.innerHTML = PENCIL_ICON;
    edit.addEventListener("click", () => openTaskDialog(todo));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "task__tool task__delete";
    remove.setAttribute("aria-label", `删除「${todo.title}」`);
    remove.setAttribute("title", "删除任务");
    remove.innerHTML = TRASH_ICON;
    remove.addEventListener("click", () => deleteTodo(todo.id));

    actions.append(edit, remove);
    item.append(checkLabel, main, actions);
    return item;
  }

  function captureFocus() {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !active.closest) return null;
    const task = active.closest(".task");
    if (!task) return null;
    let selector = null;
    if (active.classList.contains("task__checkbox")) selector = ".task__checkbox";
    else if (active.classList.contains("task__edit")) selector = ".task__edit";
    else if (active.classList.contains("task__delete")) selector = ".task__delete";
    return selector ? { id: task.dataset.id, selector } : null;
  }

  function restoreFocus(focusState) {
    if (!focusState) return;
    const target = document.querySelector(
      `.task[data-id="${CSS.escape(focusState.id)}"] ${focusState.selector}`,
    );
    if (target) target.focus();
  }

  function render() {
    const counts = viewCounts();

    for (const element of els.navCounts) {
      element.textContent = String(counts[element.dataset.viewCount] ?? 0);
    }
    const overdueCount = document.querySelector('[data-view-count="overdue"]');
    if (overdueCount) overdueCount.classList.toggle("nav__count--danger", counts.overdue > 0);

    for (const button of els.navItems) {
      const active = button.dataset.view === state.view;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }

    const doneToday = completedTodayTasks();
    const todayTotal = counts.today + doneToday.length;
    const percent = todayTotal === 0 ? 0 : Math.round((doneToday.length / todayTotal) * 100);
    els.progressText.textContent = `${doneToday.length} / ${todayTotal}`;
    els.progressFill.style.width = `${percent}%`;
    els.progressTrack.setAttribute("aria-valuenow", String(percent));

    const meta = VIEW_META[state.view];
    els.eyebrow.textContent = meta.eyebrow;
    els.title.textContent = meta.title;
    els.subtitle.textContent = subtitleForView(counts);
    document.title = `${meta.title} · 今日待办`;

    const visible = sortForView(viewTasks(state.view).filter(matchesQuery), state.view);
    const focusState = captureFocus();
    els.list.replaceChildren(...visible.map((todo) => createTask(todo, state.view)));
    els.empty.hidden = visible.length > 0;
    if (visible.length === 0) {
      const copy = emptyCopyFor(state.view);
      els.emptyTitle.textContent = copy.title;
      els.emptyText.textContent = copy.text;
    }

    els.listCount.textContent = state.query.trim() ? `找到 ${visible.length} 项` : `共 ${visible.length} 项`;
    els.clearCompleted.hidden = !(state.view === "completed" && counts.completed > 0 && !state.query.trim());

    if (state.view === "today") {
      const done = doneToday.filter(matchesQuery).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
      els.todayCompleted.hidden = done.length === 0;
      els.todayCompletedCount.textContent = String(done.length);
      els.todayCompletedList.replaceChildren(...done.map((todo) => createTask(todo, "today")));
    } else {
      els.todayCompleted.hidden = true;
    }

    restoreFocus(focusState);
  }

  function announce(message) {
    els.status.textContent = "";
    window.requestAnimationFrame(() => {
      els.status.textContent = message;
    });
  }

  // ---- 任务操作 ----

  function toggleTodo(id) {
    const todo = state.todos.find((item) => item.id === id);
    if (!todo) return;
    todo.done = !todo.done;
    todo.completedAt = todo.done ? Date.now() : null;
    saveTodos();
    render();
    announce(todo.done ? `已完成「${todo.title}」` : `已恢复「${todo.title}」`);
  }

  function deleteTodo(id) {
    const index = state.todos.findIndex((item) => item.id === id);
    if (index === -1) return;
    const [removed] = state.todos.splice(index, 1);
    undoState = () => {
      state.todos.splice(Math.min(index, state.todos.length), 0, removed);
    };
    saveTodos();
    render();
    showToast(`已删除「${removed.title}」`);
  }

  function clearCompleted() {
    const completed = state.todos.filter((todo) => todo.done);
    if (completed.length === 0) return;
    const removed = [];
    state.todos = state.todos.filter((todo, index) => {
      if (!todo.done) return true;
      removed.push({ todo, index });
      return false;
    });
    undoState = () => {
      for (const entry of removed) {
        state.todos.splice(Math.min(entry.index, state.todos.length), 0, entry.todo);
      }
    };
    saveTodos();
    render();
    showToast(`已清除 ${completed.length} 项已完成`);
  }

  function undoLast() {
    if (!undoState) return;
    const action = undoState;
    undoState = null;
    action();
    saveTodos();
    render();
    hideToast();
    announce("已撤销");
  }

  // ---- 添加 / 编辑弹窗 ----

  function defaultDateForView() {
    switch (state.view) {
      case "today":
      case "next7":
      case "overdue":
        return dateKey();
      case "tomorrow":
        return addDays(dateKey(), 1);
      default:
        return "";
    }
  }

  function setPriority(value) {
    for (const input of els.priorityInputs) {
      input.checked = input.value === value;
    }
  }

  function getPriority() {
    const checked = els.priorityInputs.find((input) => input.checked);
    return checked ? checked.value : "medium";
  }

  function openTaskDialog(todo) {
    if (els.dialog.open) return;
    editingId = todo ? todo.id : null;
    els.dialogTitle.textContent = todo ? "编辑任务" : "新建任务";
    els.dialogSubmit.textContent = todo ? "保存" : "添加任务";
    els.titleInput.value = todo ? todo.title : "";
    els.notesInput.value = todo ? todo.notes : "";
    els.dateInput.value = todo ? todo.dueDate || "" : defaultDateForView();
    setPriority(todo ? todo.priority : "medium");
    els.titleError.hidden = true;
    els.dialog.showModal();
    els.titleInput.focus();
    els.titleInput.select();
  }

  function closeDialog() {
    editingId = null;
    if (els.dialog.open) els.dialog.close();
  }

  function handleSubmit(event) {
    event.preventDefault();
    const title = els.titleInput.value.trim();
    if (!title) {
      els.titleError.hidden = false;
      els.titleInput.focus();
      return;
    }
    els.titleError.hidden = true;

    const data = {
      title,
      notes: els.notesInput.value.trim(),
      dueDate: els.dateInput.value || null,
      priority: getPriority(),
    };

    const editedId = editingId;
    let addedTodo = null;

    if (editingId) {
      const todo = state.todos.find((item) => item.id === editingId);
      if (todo) {
        Object.assign(todo, data);
        announce(`已更新「${title}」`);
      }
    } else {
      addedTodo = {
        id: uid(),
        ...data,
        done: false,
        createdAt: Date.now(),
        completedAt: null,
      };
      state.todos.unshift(addedTodo);
      state.query = "";
      els.searchInput.value = "";
      els.searchClear.hidden = true;
      announce(`已添加「${title}」`);
    }

    saveTodos();
    closeDialog();

    if (addedTodo && !isVisibleInView(addedTodo, state.view)) {
      state.view = viewForTask(addedTodo);
    }
    render();

    if (addedTodo) {
      els.addTask.focus();
      els.mainContent.scrollTop = 0;
    } else if (editedId) {
      const titleButton = document.querySelector(`.task[data-id="${CSS.escape(editedId)}"] .task__title`);
      (titleButton || els.addTask).focus();
    }
  }

  // ---- Toast / 撤销 ----

  function showToast(message) {
    els.toastText.textContent = message;
    els.toast.hidden = false;
    els.toast.classList.remove("is-visible");
    void els.toast.offsetWidth;
    els.toast.classList.add("is-visible");
    window.clearTimeout(undoTimer);
    undoTimer = window.setTimeout(hideToast, TOAST_DURATION);
  }

  function hideToast() {
    window.clearTimeout(undoTimer);
    undoTimer = null;
    els.toast.classList.remove("is-visible");
    window.setTimeout(() => {
      if (!els.toast.classList.contains("is-visible")) els.toast.hidden = true;
    }, 200);
    undoState = null;
  }

  // ---- 事件绑定 ----

  els.dialogForm.addEventListener("submit", handleSubmit);
  els.dialogClose.addEventListener("click", closeDialog);
  els.dialogCancel.addEventListener("click", closeDialog);
  els.dialog.addEventListener("close", () => {
    editingId = null;
  });
  els.dialog.addEventListener("click", (event) => {
    if (event.target === els.dialog) els.dialog.close();
  });
  els.titleInput.addEventListener("input", () => {
    if (els.titleInput.value.trim()) els.titleError.hidden = true;
  });

  for (const button of els.quickDateButtons) {
    button.addEventListener("click", () => {
      const kind = button.dataset.quickDate;
      if (kind === "today") els.dateInput.value = dateKey();
      else if (kind === "tomorrow") els.dateInput.value = addDays(dateKey(), 1);
      else els.dateInput.value = "";
    });
  }

  els.addTask.addEventListener("click", () => openTaskDialog());

  for (const button of els.navItems) {
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      if (!VIEW_META[view]) return;
      if (view === state.view) {
        if (state.query) {
          state.query = "";
          els.searchInput.value = "";
          els.searchClear.hidden = true;
          render();
        }
        return;
      }
      state.view = view;
      state.query = "";
      els.searchInput.value = "";
      els.searchClear.hidden = true;
      els.mainContent.scrollTop = 0;
      render();
    });
  }

  els.searchInput.addEventListener("input", () => {
    state.query = els.searchInput.value;
    els.searchClear.hidden = els.searchInput.value.length === 0;
    render();
  });

  els.searchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    if (state.query) clearSearch();
    els.searchInput.blur();
  });

  function clearSearch() {
    state.query = "";
    els.searchInput.value = "";
    els.searchClear.hidden = true;
    render();
  }

  els.searchClear.addEventListener("click", () => {
    clearSearch();
    els.searchInput.focus();
  });

  els.themeToggle.addEventListener("click", () => {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    applyTheme(current === "dark" ? "light" : "dark", true);
  });

  els.clearCompleted.addEventListener("click", clearCompleted);
  els.toastUndo.addEventListener("click", undoLast);

  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !isTypingTarget(event.target) && !els.dialog.open) {
      if (undoState) {
        event.preventDefault();
        undoLast();
      }
      return;
    }

    if (event.key === "/" && !isTypingTarget(event.target) && !els.dialog.open) {
      event.preventDefault();
      els.searchInput.focus();
      return;
    }

    if (
      event.key.toLowerCase() === "n" &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !isTypingTarget(event.target) &&
      !els.dialog.open
    ) {
      event.preventDefault();
      openTaskDialog();
      return;
    }

    if (event.key === "Escape" && !els.dialog.open && state.query) {
      clearSearch();
      els.searchInput.blur();
    }
  });

  initTheme();
  render();
})();
