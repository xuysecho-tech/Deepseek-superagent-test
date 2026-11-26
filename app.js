(() => {
  "use strict";

  const STORAGE_KEY = "simple-todo:v1";
  const FILTERS = ["all", "active", "completed"];
  const TRASH_ICON = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 7h16"/>
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
      <path d="m6 7 1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12"/>
      <path d="M10 11v5M14 11v5"/>
    </svg>`;

  const EMPTY_COPY = {
    all: { title: "还没有待办", text: "添加第一件，让今天井井有条。" },
    active: { title: "全部完成啦", text: "没有未完成的待办，去喝杯水吧。" },
    completed: { title: "暂无已完成", text: "完成一件待办后会出现在这里。" },
  };

  const els = {
    form: document.querySelector("#todo-form"),
    input: document.querySelector("#todo-input"),
    list: document.querySelector("#todo-list"),
    empty: document.querySelector("#empty-state"),
    emptyTitle: document.querySelector("#empty-title"),
    emptyText: document.querySelector("#empty-text"),
    filters: Array.from(document.querySelectorAll("[data-filter]")),
    counts: {
      all: document.querySelector('[data-count="all"]'),
      active: document.querySelector('[data-count="active"]'),
      completed: document.querySelector('[data-count="completed"]'),
    },
    clear: document.querySelector("#clear-completed"),
    progress: document.querySelector("#progress"),
    progressRing: document.querySelector("#progress-ring"),
    progressValue: document.querySelector("#progress-value"),
    summary: document.querySelector("#summary"),
    today: document.querySelector("#today"),
    status: document.querySelector("#status"),
  };

  const state = {
    todos: loadTodos(),
    filter: "all",
  };

  function uid() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `todo-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function loadTodos() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((todo) => todo && typeof todo.id === "string" && typeof todo.title === "string" && todo.title.trim() !== "")
        .map((todo) => ({ id: todo.id, title: todo.title.trim(), done: todo.done === true }));
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

  function announce(message) {
    els.status.textContent = "";
    window.requestAnimationFrame(() => {
      els.status.textContent = message;
    });
  }

  function setToday() {
    const now = new Date();
    const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(now);
    els.today.textContent = `${now.getMonth() + 1}月${now.getDate()}日 · ${weekday}`;
  }

  function visibleTodos() {
    if (state.filter === "active") return state.todos.filter((todo) => !todo.done);
    if (state.filter === "completed") return state.todos.filter((todo) => todo.done);
    return state.todos;
  }

  function createItem(todo) {
    const item = document.createElement("li");
    item.className = "todo-item";
    item.dataset.id = todo.id;
    if (todo.done) item.classList.add("is-done");

    const main = document.createElement("label");
    main.className = "todo-item__main";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "todo-item__checkbox";
    checkbox.checked = todo.done;
    checkbox.setAttribute("aria-label", `标记「${todo.title}」为${todo.done ? "未完成" : "已完成"}`);
    checkbox.addEventListener("change", () => toggleTodo(todo.id));

    const box = document.createElement("span");
    box.className = "todo-item__box";
    box.setAttribute("aria-hidden", "true");

    const title = document.createElement("span");
    title.className = "todo-item__title";
    title.textContent = todo.title;

    main.append(checkbox, box, title);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "todo-item__delete";
    remove.setAttribute("aria-label", `删除「${todo.title}」`);
    remove.innerHTML = TRASH_ICON;
    remove.addEventListener("click", () => deleteTodo(todo.id));

    item.append(main, remove);
    return item;
  }

  function render() {
    const { todos, filter } = state;
    const total = todos.length;
    const done = todos.filter((todo) => todo.done).length;
    const active = total - done;
    const visible = visibleTodos();

    const activeElement = document.activeElement;
    const focusedItem = activeElement && activeElement.closest ? activeElement.closest(".todo-item") : null;
    const focusState = focusedItem
      ? {
          id: focusedItem.dataset.id,
          selector: activeElement.classList.contains("todo-item__delete") ? ".todo-item__delete" : ".todo-item__checkbox",
        }
      : null;

    els.list.replaceChildren(...visible.map(createItem));
    els.empty.hidden = visible.length > 0;

    const copy = EMPTY_COPY[filter];
    els.emptyTitle.textContent = copy.title;
    els.emptyText.textContent = copy.text;

    els.counts.all.textContent = String(total);
    els.counts.active.textContent = String(active);
    els.counts.completed.textContent = String(done);

    els.summary.textContent = total === 0 ? "还没有待办" : `共 ${total} 项 · 待完成 ${active} 项`;

    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
    els.progressRing.style.setProperty("--progress", `${percent * 3.6}deg`);
    els.progressValue.textContent = `${percent}%`;
    els.progress.setAttribute("aria-label", `完成进度 ${percent}%`);

    els.clear.disabled = done === 0;

    for (const button of els.filters) {
      const isActive = button.dataset.filter === filter;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    }

    // 重新渲染列表后把键盘焦点还给原来的勾选框/删除按钮。
    if (focusState) {
      const target = els.list.querySelector(
        `[data-id="${CSS.escape(focusState.id)}"] ${focusState.selector}`,
      );
      if (target) target.focus();
    }
  }

  function addTodo(rawTitle) {
    const title = rawTitle.trim();
    if (!title) {
      els.input.focus();
      return;
    }
    state.todos.unshift({ id: uid(), title, done: false });
    saveTodos();
    render();
    announce(`已添加「${title}」`);
  }

  function toggleTodo(id) {
    const todo = state.todos.find((item) => item.id === id);
    if (!todo) return;
    todo.done = !todo.done;
    saveTodos();
    render();
    announce(todo.done ? `已完成「${todo.title}」` : `已恢复「${todo.title}」`);
  }

  function deleteTodo(id) {
    const index = state.todos.findIndex((item) => item.id === id);
    if (index === -1) return;
    const [removed] = state.todos.splice(index, 1);
    saveTodos();
    render();
    announce(`已删除「${removed.title}」`);
  }

  function clearCompleted() {
    const done = state.todos.filter((todo) => todo.done);
    if (done.length === 0) return;
    state.todos = state.todos.filter((todo) => !todo.done);
    saveTodos();
    render();
    announce(`已清除 ${done.length} 项已完成待办`);
  }

  function setFilter(filter) {
    if (!FILTERS.includes(filter) || filter === state.filter) return;
    state.filter = filter;
    render();
  }

  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    addTodo(els.input.value);
    els.input.value = "";
    els.input.focus();
  });

  for (const button of els.filters) {
    button.addEventListener("click", () => setFilter(button.dataset.filter));
  }

  els.clear.addEventListener("click", clearCompleted);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      els.input.value = "";
      els.input.blur();
    }
  });

  setToday();
  render();
})();
