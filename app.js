(() => {
  "use strict";

  const STORAGE_KEY = "simple-todo:v1";
  const THEME_KEY = "simple-todo:theme";
  const FILTERS = ["all", "active", "completed"];
  const DRAG_THRESHOLD = 5;
  const TOAST_DURATION = 6000;

  const GRIP_ICON = `
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
      <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
      <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
    </svg>`;
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

  const EMPTY_COPY = {
    all: { title: "还没有待办", text: "添加第一件，让今天井井有条。" },
    active: { title: "全部完成啦", text: "没有未完成的待办，去喝杯水吧。" },
    completed: { title: "暂无已完成", text: "完成一件待办后会出现在这里。" },
  };
  const SEARCH_EMPTY = { title: "没有匹配的待办", text: "换个关键词试试，或按 Esc 关闭搜索。" };

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
    searchToggle: document.querySelector("#search-toggle"),
    searchBar: document.querySelector("#search-bar"),
    searchInput: document.querySelector("#search-input"),
    searchClear: document.querySelector("#search-clear"),
    themeToggle: document.querySelector("#theme-toggle"),
    themeMeta: document.querySelector("#theme-color"),
    progress: document.querySelector("#progress"),
    progressRing: document.querySelector("#progress-ring"),
    progressValue: document.querySelector("#progress-value"),
    summary: document.querySelector("#summary"),
    today: document.querySelector("#today"),
    status: document.querySelector("#status"),
    toast: document.querySelector("#toast"),
    toastText: document.querySelector("#toast-text"),
    toastUndo: document.querySelector("#toast-undo"),
  };

  const state = {
    todos: loadTodos(),
    filter: "all",
    query: "",
    searchOpen: false,
    editingId: null,
  };

  let undoState = null;
  let undoTimer = null;
  let dragState = null;

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
    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch (error) {
        // 主题仍会立即生效，只是无法记住选择。
      }
    }
    if (els.themeToggle) {
      els.themeToggle.setAttribute("aria-label", theme === "dark" ? "切换到浅色模式" : "切换到深色模式");
    }
    if (els.themeMeta) {
      els.themeMeta.setAttribute("content", theme === "dark" ? "#0e1016" : "#f3f4fa");
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

  function matchesQuery(todo) {
    const query = state.query.trim().toLowerCase();
    return query === "" || todo.title.toLowerCase().includes(query);
  }

  function visibleTodos() {
    let list = state.todos;
    if (state.filter === "active") list = list.filter((todo) => !todo.done);
    else if (state.filter === "completed") list = list.filter((todo) => todo.done);
    if (state.query.trim()) list = list.filter(matchesQuery);
    return list;
  }

  function focusSelectorFor(element) {
    if (!element || !element.classList) return null;
    if (element.classList.contains("todo-item__drag")) return ".todo-item__drag";
    if (element.classList.contains("todo-item__delete")) return ".todo-item__delete";
    if (element.classList.contains("todo-item__edit")) return ".todo-item__edit";
    if (element.classList.contains("todo-item__checkbox")) return ".todo-item__checkbox";
    return null;
  }

  function createItem(todo) {
    const item = document.createElement("li");
    item.className = "todo-item";
    item.dataset.id = todo.id;
    if (todo.done) item.classList.add("is-done");
    const editing = state.editingId === todo.id;
    if (editing) item.classList.add("is-editing");

    const drag = document.createElement("button");
    drag.type = "button";
    drag.className = "todo-item__drag";
    drag.setAttribute("aria-label", `拖动排序「${todo.title}」`);
    drag.setAttribute("title", "拖动排序；聚焦后可用 ↑ ↓ 移动");
    drag.innerHTML = GRIP_ICON;
    drag.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      moveTodo(todo.id, event.key === "ArrowUp" ? -1 : 1);
    });

    const check = document.createElement("label");
    check.className = "todo-item__check";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "todo-item__checkbox";
    checkbox.checked = todo.done;
    checkbox.disabled = editing;
    checkbox.setAttribute("aria-label", `标记「${todo.title}」为${todo.done ? "未完成" : "已完成"}`);
    checkbox.addEventListener("change", () => toggleTodo(todo.id));

    const box = document.createElement("span");
    box.className = "todo-item__box";
    box.setAttribute("aria-hidden", "true");

    check.append(checkbox, box);

    const content = document.createElement("div");
    content.className = "todo-item__content";

    if (editing) {
      const input = document.createElement("input");
      input.type = "text";
      input.className = "todo-item__edit-input";
      input.value = todo.title;
      input.maxLength = 200;
      input.setAttribute("aria-label", "编辑待办内容");
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          commitEdit(true, true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          commitEdit(false, true);
        }
      });
      input.addEventListener("blur", () => commitEdit(true, false));
      content.append(input);
    } else {
      const title = document.createElement("span");
      title.className = "todo-item__title";
      title.textContent = todo.title;
      title.addEventListener("dblclick", () => startEdit(todo.id));
      content.append(title);
    }

    const actions = document.createElement("div");
    actions.className = "todo-item__actions";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "todo-item__tool todo-item__edit";
    edit.setAttribute("aria-label", `编辑「${todo.title}」`);
    edit.setAttribute("title", "编辑");
    edit.innerHTML = PENCIL_ICON;
    edit.addEventListener("click", () => startEdit(todo.id));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "todo-item__tool todo-item__delete";
    remove.setAttribute("aria-label", `删除「${todo.title}」`);
    remove.setAttribute("title", "删除");
    remove.innerHTML = TRASH_ICON;
    remove.addEventListener("click", () => deleteTodo(todo.id));

    actions.append(edit, remove);

    item.append(drag, check, content, actions);
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
    const focusSelector = focusedItem ? focusSelectorFor(activeElement) : null;

    els.list.replaceChildren(...visible.map(createItem));
    els.empty.hidden = visible.length > 0;

    const copy = state.query.trim() ? SEARCH_EMPTY : EMPTY_COPY[filter];
    els.emptyTitle.textContent = copy.title;
    els.emptyText.textContent = copy.text;

    els.counts.all.textContent = String(total);
    els.counts.active.textContent = String(active);
    els.counts.completed.textContent = String(done);

    if (state.query.trim()) {
      els.summary.textContent = `找到 ${visible.length} 项匹配`;
    } else if (total === 0) {
      els.summary.textContent = "还没有待办";
    } else if (active === 0) {
      els.summary.textContent = `共 ${total} 项 · 全部完成`;
    } else {
      els.summary.textContent = `共 ${total} 项 · 待完成 ${active} 项`;
    }

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

    // 重新渲染列表后把键盘焦点还给原来的控件。
    if (focusedItem && focusSelector) {
      const target = els.list.querySelector(
        `[data-id="${CSS.escape(focusedItem.dataset.id)}"] ${focusSelector}`,
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
    const todo = { id: uid(), title, done: false };
    state.todos.unshift(todo);
    saveTodos();
    render();
    const node = els.list.querySelector(`[data-id="${CSS.escape(todo.id)}"]`);
    if (node) node.classList.add("is-new");
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

  function startEdit(id) {
    if (state.editingId === id) return;
    const todo = state.todos.find((item) => item.id === id);
    if (!todo) return;
    state.editingId = id;
    render();
    const input = els.list.querySelector(".todo-item__edit-input");
    if (input) {
      input.focus();
      input.select();
    }
  }

  function commitEdit(save, restoreFocus) {
    const id = state.editingId;
    if (!id) return;
    const input = els.list.querySelector(".todo-item__edit-input");
    const value = input ? input.value : "";
    state.editingId = null;

    const todo = state.todos.find((item) => item.id === id);
    if (save && todo) {
      const title = value.trim();
      if (title && title !== todo.title) {
        todo.title = title;
        saveTodos();
        announce(`已更新「${title}」`);
      }
    }

    render();

    if (restoreFocus) {
      const editButton = els.list.querySelector(`[data-id="${CSS.escape(id)}"] .todo-item__edit`);
      if (editButton) editButton.focus();
    }
  }

  function showToast(message) {
    els.toastText.textContent = message;
    els.toast.hidden = false;
    els.toast.classList.remove("is-visible");
    // 强制回流后再加类，保证每次都能播放出现动画，且不依赖 requestAnimationFrame 的时序。
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

  function applyOrder(orderedIds) {
    const visibleIds = new Set(orderedIds);
    const visible = state.todos.filter((todo) => visibleIds.has(todo.id));
    const byId = new Map(visible.map((todo) => [todo.id, todo]));
    let index = 0;
    state.todos = state.todos.map((todo) => (visibleIds.has(todo.id) ? byId.get(orderedIds[index++]) : todo));
  }

  function moveTodo(id, direction) {
    const visible = visibleTodos();
    const index = visible.findIndex((todo) => todo.id === id);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= visible.length) return;
    const from = state.todos.indexOf(visible[index]);
    const to = state.todos.indexOf(visible[target]);
    [state.todos[from], state.todos[to]] = [state.todos[to], state.todos[from]];
    saveTodos();
    render();
    announce(`已${direction < 0 ? "上移" : "下移"}「${visible[index].title}」`);
  }

  function setFilter(filter) {
    if (!FILTERS.includes(filter) || filter === state.filter) return;
    state.filter = filter;
    render();
  }

  function setSearchOpen(open) {
    state.searchOpen = open;
    els.searchBar.hidden = !open;
    els.searchToggle.setAttribute("aria-expanded", String(open));
    if (open) {
      els.searchInput.focus();
    } else {
      if (state.query) {
        state.query = "";
        render();
      }
      els.searchInput.value = "";
      els.searchClear.hidden = true;
    }
  }

  function onSearchInput() {
    state.query = els.searchInput.value;
    els.searchClear.hidden = els.searchInput.value.length === 0;
    render();
  }

  function isTypingTarget(target) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    if (target.tagName === "TEXTAREA") return true;
    if (target.tagName !== "INPUT") return false;
    return ["text", "search", "email", "number", "password", "tel", "url"].includes(target.type);
  }

  function onPointerDown(event) {
    const handle = event.target.closest ? event.target.closest(".todo-item__drag") : null;
    if (!handle) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const item = handle.closest(".todo-item");
    if (!item) return;
    dragState = { item, pointerId: event.pointerId, startY: event.clientY, active: false };
    if (handle.setPointerCapture) {
      try {
        handle.setPointerCapture(event.pointerId);
      } catch (error) {
        // 某些浏览器在指针已释放时会抛错，忽略即可。
      }
    }
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const delta = event.clientY - dragState.startY;
    if (!dragState.active) {
      if (Math.abs(delta) < DRAG_THRESHOLD) return;
      dragState.active = true;
      dragState.item.classList.add("is-dragging");
      document.body.classList.add("is-sorting");
    }
    event.preventDefault();
    const items = Array.from(els.list.querySelectorAll(".todo-item")).filter((item) => item !== dragState.item);
    const reference =
      items.find((item) => {
        const rect = item.getBoundingClientRect();
        return event.clientY < rect.top + rect.height / 2;
      }) || null;
    if (reference) els.list.insertBefore(dragState.item, reference);
    else els.list.appendChild(dragState.item);
  }

  function onPointerUp(event) {
    if (!dragState || (event && event.pointerId !== dragState.pointerId)) return;
    const { item, active } = dragState;
    dragState = null;
    item.classList.remove("is-dragging");
    document.body.classList.remove("is-sorting");
    if (!active) return;
    const orderedIds = Array.from(els.list.children).map((child) => child.dataset.id);
    applyOrder(orderedIds);
    saveTodos();
    render();
    announce("已调整排序");
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

  els.searchToggle.addEventListener("click", () => setSearchOpen(!state.searchOpen));
  els.searchInput.addEventListener("input", onSearchInput);
  els.searchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    setSearchOpen(false);
    els.searchToggle.focus();
  });
  els.searchClear.addEventListener("click", () => {
    els.searchInput.value = "";
    state.query = "";
    els.searchClear.hidden = true;
    render();
    els.searchInput.focus();
  });

  els.themeToggle.addEventListener("click", () => {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    applyTheme(current === "dark" ? "light" : "dark", true);
  });

  els.toastUndo.addEventListener("click", undoLast);

  els.list.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove, { passive: false });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  document.addEventListener("keydown", (event) => {
    if (event.key === "/" && !isTypingTarget(event.target)) {
      event.preventDefault();
      if (!state.searchOpen) setSearchOpen(true);
      else els.searchInput.focus();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !isTypingTarget(event.target)) {
      if (undoState) {
        event.preventDefault();
        undoLast();
      }
      return;
    }

    if (event.key === "Escape") {
      if (state.searchOpen) {
        setSearchOpen(false);
        els.searchToggle.focus();
      }
      if (els.input.value) {
        els.input.value = "";
        els.input.blur();
      }
    }
  });

  initTheme();
  setToday();
  render();
})();
