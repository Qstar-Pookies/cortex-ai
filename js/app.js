/* ============================================================
   Cortex AI — interface logic
   ============================================================ */

(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const STORE_KEY = "cortex.chats.v1";
  const THEME_KEY = "cortex.theme";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- element refs ---------- */
  const app = $("#app");
  const stage = $("#stage");
  const scrollEl = $("#scroll");
  const thread = $("#thread");
  const heroSub = $("#heroSub");
  const promptEl = $("#prompt");
  const composer = $("#composer");
  const sendBtn = $("#sendBtn");
  const composerHint = $("#composerHint");
  const newChatBtn = $("#newChatBtn");
  const historyEl = $("#history");
  const historySearch = $("#historySearch");
  const sidebarOpenBtn = $("#sidebarOpen");
  const sidebarCloseBtn = $("#sidebarClose");
  const scrim = $("#scrim");
  const palette = $("#palette");
  const paletteInput = $("#paletteInput");
  const paletteList = $("#paletteList");
  const toasts = $("#toasts");
  const chatTitle = $("#chatTitle");
  const attachBtn = $("#attachBtn");
  const fileInput = $("#fileInput");
  const composerFiles = $("#composerFiles");

  const sendArrow = $(".send__arrow", sendBtn);
  const sendStop = $(".send__stop", sendBtn);

  const mobileQuery = window.matchMedia("(max-width: 900px)");

  /* ---------- state ---------- */
  const state = {
    conversations: [],
    activeId: null,
    messages: [],
    streaming: false,
    token: 0,
    paletteIndex: 0,
    paletteResults: [],
    attachments: [],
  };

  /* ---------- tiny utils ---------- */
  const uid = () => {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function icon(name, className = "ic") {
    return `<svg class="${className}"><use href="#i-${name}"/></svg>`;
  }

  function formatTime(ts) {
    if (!ts) return "now";
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function titleFrom(text) {
    const clean = String(text).replace(/\s+/g, " ").trim();
    if (!clean) return "New chat";
    return clean.length > 46 ? clean.slice(0, 44).trimEnd() + "…" : clean;
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (error) {
      /* fall through */
    }

    try {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      area.style.pointerEvents = "none";
      document.body.append(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      return ok;
    } catch (error) {
      return false;
    }
  }

  /* ---------- toasts ---------- */
  function toast(message, type = "info") {
    const el = document.createElement("div");
    el.className = "toast" + (type === "success" ? " toast--success" : "");
    el.innerHTML =
      `<span class="toast__icon">${icon(type === "success" ? "check" : "sparkle")}</span>` +
      `<span class="toast__text"></span>`;
    el.querySelector(".toast__text").textContent = message;
    toasts.append(el);

    const remove = () => {
      if (!el.isConnected) return;
      el.classList.add("is-leaving");
      setTimeout(() => el.remove(), 320);
    };

    setTimeout(remove, 3000);
  }

  /* ---------- theme ---------- */
  function currentTheme() {
    return document.documentElement.dataset.theme === "light" ? "light" : "dark";
  }

  function syncThemeMeta() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", currentTheme() === "dark" ? "#070a12" : "#f4f6fb");
  }

  function setTheme(theme, announce = false) {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (error) {
      /* private mode */
    }
    syncThemeMeta();
    if (announce) toast(theme === "dark" ? "Dark mode" : "Light mode");
  }

  function toggleTheme() {
    setTheme(currentTheme() === "dark" ? "light" : "dark", true);
  }

  /* ---------- conversations ---------- */
  function seedConversations() {
    const seeds = [
      {
        title: "Quantum computing, explained",
        prompt: "Explain quantum computing like I'm a developer, then tell me where it actually helps.",
        age: 0,
      },
      {
        title: "Fix a flaky Python test",
        prompt: "My Python test is flaky and only fails in the full suite. Help me debug it.",
        age: 1,
      },
      {
        title: "7 days in Tokyo",
        prompt: "Plan a 7-day trip to Tokyo on a budget, with no tourist traps.",
        age: 3,
      },
    ];

    const now = Date.now();

    return seeds.map((seed, index) => {
      const created = now - seed.age * 86400000 - (index + 1) * 1500000;
      const data = window.CortexChat.reply(seed.prompt);

      return {
        id: uid(),
        title: seed.title,
        createdAt: created,
        updatedAt: created + 60000,
        messages: [
          { id: uid(), role: "user", content: seed.prompt, ts: created },
          {
            id: uid(),
            role: "assistant",
            content: data.content,
            thinking: data.thinking,
            thoughtFor: 4,
            ts: created + 52000,
          },
        ],
      };
    });
  }

  function loadConversations() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORE_KEY);
    } catch (error) {
      raw = null;
    }

    if (raw === null) {
      state.conversations = seedConversations();
      persist();
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      state.conversations = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      state.conversations = seedConversations();
      persist();
      return;
    }

    for (const conversation of state.conversations) {
      if (!Array.isArray(conversation.messages)) conversation.messages = [];
      for (const message of conversation.messages) {
        if (!message.id) message.id = uid();
      }
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state.conversations.slice(0, 40)));
    } catch (error) {
      /* storage full or blocked — the demo still works in memory */
    }
  }

  function activeConversation() {
    return state.conversations.find((conversation) => conversation.id === state.activeId) || null;
  }

  function ensureConversation(prompt) {
    const existing = activeConversation();
    if (existing) {
      state.messages = existing.messages;
      return existing;
    }

    const conversation = {
      id: uid(),
      title: titleFrom(prompt),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };

    state.conversations.unshift(conversation);
    state.activeId = conversation.id;
    state.messages = conversation.messages;
    return conversation;
  }

  function saveConversation(conversation) {
    if (!conversation) return;
    conversation.updatedAt = Date.now();
    persist();
  }

  /* ---------- sidebar history ---------- */
  function dayLabel(ts) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    if (ts >= start) return "Today";
    if (ts >= start - 86400000) return "Yesterday";
    if (ts >= start - 7 * 86400000) return "Previous 7 days";
    return "Older";
  }

  function renderHistory() {
    const query = (historySearch.value || "").trim().toLowerCase();
    const conversations = state.conversations
      .filter((conversation) => {
        return !query || conversation.title.toLowerCase().includes(query);
      })
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));

    historyEl.innerHTML = "";

    if (!conversations.length) {
      const empty = document.createElement("p");
      empty.className = "history__empty";
      empty.textContent = query
        ? "No chats match that search."
        : "No chats yet — start one above.";
      historyEl.append(empty);
      return;
    }

    const groups = new Map();
    for (const conversation of conversations) {
      const label = dayLabel(conversation.updatedAt || conversation.createdAt || Date.now());
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(conversation);
    }

    for (const [label, items] of groups) {
      const group = document.createElement("div");
      group.className = "history__group";

      const heading = document.createElement("p");
      heading.className = "history__label";
      heading.textContent = label;
      group.append(heading);

      for (const conversation of items) {
        const item = document.createElement("div");
        item.className = "history__item" + (conversation.id === state.activeId ? " is-active" : "");
        item.dataset.id = conversation.id;
        item.setAttribute("role", "button");
        item.tabIndex = 0;
        item.innerHTML =
          `${icon("chat")}` +
          `<span class="history__title"></span>` +
          `<button class="history__delete" type="button" aria-label="Delete chat">${icon("trash")}</button>`;

        item.querySelector(".history__title").textContent = conversation.title;
        item.querySelector(".history__delete").dataset.deleteId = conversation.id;
        group.append(item);
      }

      historyEl.append(group);
    }
  }

  function loadConversation(id) {
    const conversation = state.conversations.find((entry) => entry.id === id);
    if (!conversation) return;

    if (state.streaming) stopStreaming();

    state.activeId = conversation.id;
    state.messages = conversation.messages;
    renderThread();
    setEmpty(false);
    renderHistory();
    updateChatTitle();
    closeSidebarIfMobile();
    requestAnimationFrame(() => scrollToBottom(true, true));
  }

  function deleteConversation(id) {
    const index = state.conversations.findIndex((conversation) => conversation.id === id);
    if (index < 0) return;

    const wasActive = state.activeId === id;
    state.conversations.splice(index, 1);

    if (wasActive) {
      if (state.streaming) stopStreaming();
      newChat(false);
    }

    persist();
    renderHistory();
    toast("Chat deleted");
  }

  /* ---------- rendering messages ---------- */
  function buildUserMessage(message) {
    const article = document.createElement("article");
    article.className = "msg msg--user";
    article.innerHTML =
      `<div class="msg__bubble"></div>` +
      `<div class="msg__avatar msg__avatar--user" aria-hidden="true">Q</div>`;
    article.querySelector(".msg__bubble").textContent = message.content;
    return article;
  }

  function buildThinking(message, options = {}) {
    const panel = document.createElement("div");
    panel.className = "think";
    panel.innerHTML =
      `<button class="think__head" type="button" aria-expanded="false">` +
      `${icon("bulb")}` +
      `<span class="think__label"></span>` +
      `${icon("chevron", "ic think__chevron")}` +
      `</button>` +
      `<div class="think__body"><div class="think__inner"><div class="think__lines"></div></div></div>`;

    const label = panel.querySelector(".think__label");
    const lines = panel.querySelector(".think__lines");
    const head = panel.querySelector(".think__head");

    if (options.live) {
      label.textContent = "Thinking…";
      panel.classList.add("is-open", "is-thinking");
      head.setAttribute("aria-expanded", "true");
    } else {
      label.textContent = message.thoughtFor ? `Thought for ${message.thoughtFor}s` : "Thought process";
    }

    for (const line of message.thinking || []) {
      const row = document.createElement("div");
      row.className = "think__line";
      row.textContent = line;
      lines.append(row);
    }

    head.addEventListener("click", () => {
      const open = panel.classList.toggle("is-open");
      head.setAttribute("aria-expanded", String(open));
    });

    return panel;
  }

  function buildActions(message) {
    const row = document.createElement("div");
    row.className = "msg__actions";

    const make = (name, label) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "action-btn";
      button.innerHTML = `${icon(name)}<span>${label}</span>`;
      return button;
    };

    const copy = make("copy", "Copy");
    copy.addEventListener("click", async () => {
      if (!message.content) return;
      const ok = await copyText(message.content);
      toast(ok ? "Copied to clipboard" : "Copy failed", ok ? "success" : "info");
    });

    const regenerate = make("refresh", "Regenerate");
    regenerate.addEventListener("click", () => regenerateMessage(message));

    const like = make("like", "Good");
    like.addEventListener("click", () => {
      const on = like.classList.toggle("is-on");
      if (on) {
        dislike.classList.remove("is-on");
        toast("Glad it helped", "success");
      }
    });

    const dislike = make("dislike", "Bad");
    dislike.addEventListener("click", () => {
      const on = dislike.classList.toggle("is-on");
      if (on) {
        like.classList.remove("is-on");
        toast("Noted — thanks for the feedback");
      }
    });

    row.append(copy, regenerate, like, dislike);
    return row;
  }

  function buildAssistantMessage(message, options = {}) {
    const article = document.createElement("article");
    article.className = "msg msg--assistant";

    const avatar = document.createElement("div");
    avatar.className = "msg__avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.innerHTML = `<img class="msg__avatar__img" src="assets/logo.svg" alt="">`;

    const main = document.createElement("div");
    main.className = "msg__main";

    const meta = document.createElement("div");
    meta.className = "msg__meta";
    meta.innerHTML =
      `<span class="msg__name">Cortex</span>` +
      `<span class="msg__badge">AI</span>` +
      `<span class="msg__time"></span>`;
    meta.querySelector(".msg__time").textContent = options.live ? "now" : formatTime(message.ts);

    main.append(meta);

    const content = document.createElement("div");
    content.className = "prose";
    if (!options.live) content.innerHTML = window.CortexChat.render(message.content || "");
    main.append(content);

    main.append(buildActions(message));
    article.append(avatar, main);
    return article;
  }

  function renderThread() {
    thread.innerHTML = "";
    for (const message of state.messages) {
      thread.append(
        message.role === "user" ? buildUserMessage(message) : buildAssistantMessage(message)
      );
    }
  }

  /* ---------- followups ---------- */
  function buildFollowups(items) {
    const wrap = document.createElement("div");
    wrap.className = "followups";
    for (const text of items) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "followup";
      chip.innerHTML = `${icon("plus")}<span></span>`;
      chip.querySelector("span").textContent = text;
      chip.addEventListener("click", () => usePrompt(text));
      wrap.append(chip);
    }
    return wrap;
  }

  function usePrompt(text) {
    promptEl.value = text;
    autoGrow();
    updateSendUI();
    promptEl.focus();
    composer.classList.remove("is-nudged");
    void composer.offsetWidth;
    composer.classList.add("is-nudged");
    setTimeout(() => composer.classList.remove("is-nudged"), 600);
  }

  /* ---------- attachments ---------- */
  const MAX_FILES = 4;
  const MAX_FILE_BYTES = 12 * 1024 * 1024; // 12 MB hard cap for anything we mention
  const MAX_INLINE_BYTES = 48 * 1024;      // only inline text content up to 48 KB
  const TEXT_HINT = /\.(txt|md|markdown|json|jsonl|csv|tsv|log|ya?ml|toml|ini|env|js|jsx|ts|tsx|mjs|cjs|py|rb|go|rs|java|c|h|cpp|cs|php|sh|bash|sql|html|htm|css|xml|svg|srt|vtt)$/i;
  const TEXT_TYPE = /^text\/|application\/(json|xml|javascript|x-yaml|graphql)/;

  function formatBytes(bytes) {
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB";
    if (bytes >= 1024) return Math.max(1, Math.round(bytes / 1024)) + " KB";
    return bytes + " B";
  }

  function fileTypeLabel(file) {
    if (file.type) return file.type.split("/")[1].split("+")[0].toUpperCase();
    const match = /\.([a-z0-9]+)$/i.exec(file.name || "");
    return match ? match[1].toUpperCase() : "FILE";
  }

  function renderAttachments() {
    if (!composerFiles) return;
    composerFiles.innerHTML = "";
    for (const fileState of state.attachments) {
      const chip = document.createElement("div");
      chip.className = "composer__file";

      const name = document.createElement("span");
      name.className = "composer__file-name";
      name.textContent = fileState.name;
      name.title = fileState.name;

      const meta = document.createElement("span");
      meta.className = "composer__file-meta";
      meta.textContent = `${fileTypeLabel(fileState)} · ${formatBytes(fileState.size)}`;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "composer__file-remove";
      remove.setAttribute("aria-label", `Remove ${fileState.name}`);
      remove.innerHTML = '<svg class="ic"><use href="#i-x"/></svg>';
      remove.addEventListener("click", () => {
        state.attachments = state.attachments.filter((item) => item !== fileState);
        renderAttachments();
        updateSendUI();
      });

      if (fileState.pending) {
        meta.textContent = "reading…";
        chip.classList.add("is-pending");
      }

      chip.append(icon("clip"), name, meta, remove);
      composerFiles.append(chip);
    }
  }

  async function acceptFiles(fileList) {
    const files = Array.from(fileList || []).slice(0, MAX_FILES);
    if (files.length === 0) return;

    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        toast(`${file.name} is too large (max 12 MB)`, "error");
        continue;
      }
      if (state.attachments.length >= MAX_FILES) {
        toast(`Up to ${MAX_FILES} files at a time`, "info");
        break;
      }

      const fileState = {
        name: file.name || "file",
        size: file.size,
        type: file.type,
        content: "",
        pending: true,
      };
      state.attachments.push(fileState);
      renderAttachments();
      updateSendUI();

      try {
        if (TEXT_HINT.test(fileState.name) || (file.type && TEXT_TYPE.test(file.type))) {
          if (file.size <= MAX_INLINE_BYTES) {
            fileState.content = await file.text();
          } else {
            const head = await file.slice(0, MAX_INLINE_BYTES).text();
            fileState.content = head + `\n… (truncated after ${formatBytes(MAX_INLINE_BYTES)})`;
          }
        }
        // non-text files (images, pdfs, zips…) are kept as name/size only
      } catch {
        fileState.content = "";
      }

      fileState.pending = false;
      renderAttachments();
      updateSendUI();
    }

    fileInput.value = "";
  }

  function attachmentsPrompt(text) {
    const parts = [];
    if (text) parts.push(text);
    for (const fileState of state.attachments) {
      if (fileState.content) {
        parts.push(`--- Attached file: ${fileState.name} ---\n${fileState.content}`);
      } else {
        parts.push(`(The user attached a file: ${fileState.name}, ${fileTypeLabel(fileState)}, ${formatBytes(fileState.size)}. Its contents could not be read as text.)`);
      }
    }
    return parts.join("\n\n");
  }

  /* ---------- streaming ---------- */
  function updateSendUI() {
    const hasText = promptEl.value.trim().length > 0;
    const hasFiles = state.attachments.length > 0;
    sendBtn.disabled = !state.streaming && !hasText && !hasFiles;
    sendBtn.classList.toggle("is-stop", state.streaming);
    sendBtn.setAttribute("aria-label", state.streaming ? "Stop generating" : "Send message");
    sendArrow.hidden = state.streaming;
    sendStop.hidden = !state.streaming;
    composer.classList.toggle("is-busy", state.streaming);
    composerHint.textContent = state.streaming ? "Generating…" : (hasFiles ? "File attached" : "Enter to send");
  }

  function stopStreaming() {
    if (!state.streaming) return;
    state.token += 1;
    state.streaming = false;
    updateSendUI();
    for (const caret of $$(".caret", thread)) caret.remove();
    toast("Stopped generating");
  }

  function isNearBottom(threshold = 200) {
    return scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < threshold;
  }

  function scrollToBottom(force = false, instant = false) {
    requestAnimationFrame(() => {
      if (!force && !isNearBottom()) return;
      scrollEl.scrollTo({
        top: scrollEl.scrollHeight,
        behavior: instant || reduceMotion.matches ? "auto" : "smooth",
      });
    });
  }

  function scrollIfNearBottom() {
    if (!isNearBottom(180)) return;
    scrollEl.scrollTop = scrollEl.scrollHeight;
  }

  async function runAssistant(prompt, conversation, messages) {
    const token = ++state.token;
    state.streaming = true;
    updateSendUI();

    const data = await window.CortexChat.replyAsync(
      prompt,
      messages.filter((item) => item?.role && item?.content).slice(0, -1).slice(-10)
    );

    if (data.fallback) {
      toast("NIM unreachable — using local replies", "info");
    }
    const message = {
      id: uid(),
      role: "assistant",
      content: "",
      thinking: null,
      thoughtFor: null,
      ts: Date.now(),
    };

    const element = buildAssistantMessage(message, { live: true });
    thread.setAttribute("aria-busy", "true");
    thread.append(element);
    messages.push(message);
    saveConversation(conversation);
    scrollToBottom(true);

    const isCurrent = () => token === state.token;

    // streaming pass
    const contentEl = $(".prose", element);
    let buffer = "";

    if (isCurrent() && contentEl) {
      const tokens = data.content.match(/\s+|\S+/g) || [];

      for (let index = 0; index < tokens.length; index += 1) {
        if (!isCurrent()) break;
        buffer += tokens[index];
        contentEl.innerHTML = window.CortexChat.render(buffer) + '<span class="caret"></span>';

        if (index % 2 === 0) {
          await wait(15 + Math.random() * 16);
        }
        if (index % 7 === 0) scrollIfNearBottom();
      }
    }

    const stopped = !isCurrent();
    const hasContent = buffer.trim().length > 0;

    if (stopped && !hasContent) {
      // nothing was generated yet — remove the empty bubble
      element.remove();
      const index = messages.indexOf(message);
      if (index >= 0) messages.splice(index, 1);
      thread.setAttribute("aria-busy", "false");
      saveConversation(conversation);
      return;
    }

    message.content = buffer;

    if (contentEl) {
      contentEl.innerHTML = window.CortexChat.render(buffer);
    }

    if (!stopped) {
      if (data.followups && data.followups.length) {
        const main = $(".msg__main", element);
        if (main) main.append(buildFollowups(data.followups));
      }

      state.streaming = false;
      updateSendUI();
    }

    thread.setAttribute("aria-busy", "false");
    saveConversation(conversation);
    scrollIfNearBottom();

    if (!stopped) {
      const last = messages[messages.length - 1];
      if (last === message) renderHistory();
    }
  }

  function regenerateMessage(message) {
    if (state.streaming) {
      toast("Stop the current answer first");
      return;
    }

    const messages = state.messages;
    const index = messages.indexOf(message);
    if (index < 0) return;

    const previousUser = [...messages.slice(0, index)].reverse().find((entry) => entry.role === "user");
    if (!previousUser) return;

    messages.splice(index, messages.length - index);
    renderThread();
    saveConversation(activeConversation());
    runAssistant(previousUser.content, activeConversation(), messages);
  }

  /* ---------- sending ---------- */
  function setEmpty(empty) {
    stage.classList.toggle("is-empty", empty);
    if (empty) {
      chatTitle.classList.remove("is-visible");
      chatTitle.textContent = "";
    }
  }

  function updateChatTitle() {
    const conversation = activeConversation();
    if (!conversation) {
      chatTitle.classList.remove("is-visible");
      chatTitle.textContent = "";
      return;
    }
    chatTitle.textContent = conversation.title;
    chatTitle.classList.add("is-visible");
  }

  function send(override) {
    if (state.streaming) {
      stopStreaming();
      return;
    }

    const text = (override == null ? promptEl.value : override).trim();
    const files = override == null ? state.attachments.slice() : [];
    if (!text && files.length === 0) return;

    const fileFootnote = files.length
      ? "\n\n" + files.map((f) => `📎 \`${f.name}\` — ${fileTypeLabel(f)}, ${formatBytes(f.size)}`).join("\n")
      : "";
    const displayText = (text || `Here are my files: ${files.map((f) => f.name).join(", ")}.`) + fileFootnote;

    const conversation = ensureConversation(displayText);
    const messages = state.messages;

    if (messages.length === 0) conversation.title = titleFrom(text || files[0].name);

    const userMessage = {
      id: uid(),
      role: "user",
      content: displayText,
      ts: Date.now(),
    };

    messages.push(userMessage);
    thread.append(buildUserMessage(userMessage));

    state.attachments = [];
    if (composerFiles) composerFiles.innerHTML = "";
    if (fileInput) fileInput.value = "";

    promptEl.value = "";
    autoGrow();
    updateSendUI();
    setEmpty(false);
    closeSidebarIfMobile();

    conversation.updatedAt = Date.now();
    persist();
    renderHistory();
    updateChatTitle();
    scrollToBottom(true);

    runAssistant(attachmentsPrompt(text), conversation, messages);
  }

  function newChat(announce = true) {
    if (state.streaming) stopStreaming();

    const conversation = {
      id: uid(),
      title: "Untitled chat",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
    };
    state.conversations.unshift(conversation);
    state.activeId = conversation.id;
    state.messages = conversation.messages;

    thread.innerHTML = "";
    promptEl.value = "";
    autoGrow();
    updateSendUI();
    setEmpty(true);
    renderHistory();
    updateChatTitle();
    closeSidebarIfMobile();
    persist();

    if (!mobileQuery.matches) promptEl.focus();
    if (announce) toast("New chat ready");
  }

  /* ---------- textarea ---------- */
  function autoGrow() {
    promptEl.style.height = "auto";
    const height = clamp(promptEl.scrollHeight, 58, 200);
    promptEl.style.height = height + "px";
  }

  function closeSidebarIfMobile() {
    if (mobileQuery.matches) app.classList.remove("sidebar-open");
  }

  /* ---------- sidebar ---------- */
  function openSidebar() {
    if (mobileQuery.matches) app.classList.add("sidebar-open");
    else app.classList.remove("sidebar-collapsed");
  }

  function closeSidebar() {
    if (mobileQuery.matches) app.classList.remove("sidebar-open");
    else app.classList.add("sidebar-collapsed");
  }

  /* ---------- share ---------- */
  async function shareChat() {
    const ok = await copyText(window.location.href);
    toast(ok ? "Share link copied" : "Could not copy the link", ok ? "success" : "info");
  }

  /* ---------- command palette ---------- */
  function commands() {
    return [
      { icon: "plus", label: "New chat", hint: "⌘⇧O", run: () => newChat() },
      { icon: "share", label: "Copy share link", hint: "⌘C", run: shareChat },
      {
        icon: "trash",
        label: "Clear all chats",
        hint: "destructive",
        run: clearAllChats,
      },
    ];
  }

  function renderPalette(query = "") {
    const normalized = query.trim().toLowerCase();
    state.paletteResults = commands().filter((command) => {
      return !normalized || command.label.toLowerCase().includes(normalized);
    });

    state.paletteIndex = clamp(state.paletteIndex, 0, Math.max(0, state.paletteResults.length - 1));
    paletteList.innerHTML = "";

    if (!state.paletteResults.length) {
      const empty = document.createElement("p");
      empty.className = "palette__empty";
      empty.textContent = "No commands match that.";
      paletteList.append(empty);
      return;
    }

    state.paletteResults.forEach((command, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "palette__item" + (index === state.paletteIndex ? " is-active" : "");
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(index === state.paletteIndex));
      item.innerHTML = `${icon(command.icon)}<span></span><kbd></kbd>`;
      item.querySelector("span").textContent = command.label;
      item.querySelector("kbd").textContent = command.hint;
      item.addEventListener("click", () => runCommand(index));
      item.addEventListener("pointermove", () => setPaletteIndex(index));
      paletteList.append(item);
    });
  }

  function setPaletteIndex(index) {
    if (!state.paletteResults.length) return;
    state.paletteIndex = clamp(index, 0, state.paletteResults.length - 1);

    $$(".palette__item", paletteList).forEach((item, itemIndex) => {
      const active = itemIndex === state.paletteIndex;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-selected", String(active));
    });

    const activeItem = $(".palette__item.is-active", paletteList);
    if (activeItem) activeItem.scrollIntoView({ block: "nearest" });
  }

  function openPalette() {
    palette.hidden = false;
    paletteInput.value = "";
    state.paletteIndex = 0;
    renderPalette("");
    requestAnimationFrame(() => paletteInput.focus());
  }

  function closePalette() {
    palette.hidden = true;
  }

  function runCommand(index) {
    const command = state.paletteResults[index];
    if (!command) return;
    closePalette();
    command.run();
  }

  function clearAllChats() {
    if (!state.conversations.length) {
      toast("There's nothing to clear");
      return;
    }

    if (!window.confirm("Clear every chat? This can't be undone.")) return;

    if (state.streaming) stopStreaming();
    state.conversations = [];
    state.activeId = null;
    state.messages = [];
    thread.innerHTML = "";
    setEmpty(true);
    persist();
    renderHistory();
    updateChatTitle();
    toast("All chats cleared");
  }

  /* ---------- hero typing ---------- */
  function typeHeroSubtitle() {
    const text = "Your second brain for code, ideas, and everything in between.";
    if (reduceMotion.matches) {
      heroSub.textContent = text;
      return;
    }

    const node = document.createTextNode("");
    const caret = document.createElement("span");
    caret.className = "caret";
    heroSub.append(node, caret);

    let index = 0;
    const timer = setInterval(() => {
      index += 1;
      node.textContent = text.slice(0, index);
      if (index >= text.length) {
        clearInterval(timer);
        setTimeout(() => caret.remove(), 1600);
      }
    }, 26);
  }

  /* ---------- events ---------- */
  function bindEvents() {
    // composer
    promptEl.addEventListener("input", () => {
      autoGrow();
      updateSendUI();
    });

    promptEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        if (!state.streaming) send();
      }
    });

    composer.addEventListener("submit", (event) => {
      event.preventDefault();
      send();
    });

    // attachments
    if (attachBtn) {
      attachBtn.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", () => acceptFiles(fileInput.files));
      composer.addEventListener("dragover", (event) => {
        event.preventDefault();
        composer.classList.add("is-dragover");
      });
      composer.addEventListener("dragleave", () => composer.classList.remove("is-dragover"));
      composer.addEventListener("drop", (event) => {
        event.preventDefault();
        composer.classList.remove("is-dragover");
        acceptFiles(event.dataTransfer?.files);
      });
    }

    sendBtn.addEventListener("click", (event) => {
      if (state.streaming) {
        event.preventDefault();
        stopStreaming();
      }
    });

    // code copy delegation
    // sidebar
    newChatBtn.addEventListener("click", () => newChat());
    if (sidebarOpenBtn) sidebarOpenBtn.addEventListener("click", openSidebar);
    if (sidebarCloseBtn) sidebarCloseBtn.addEventListener("click", closeSidebar);
    scrim.addEventListener("click", () => app.classList.remove("sidebar-open"));
    historySearch.addEventListener("input", renderHistory);

    historyEl.addEventListener("click", (event) => {
      const remove = event.target.closest("[data-delete-id]");
      if (remove) {
        event.stopPropagation();
        deleteConversation(remove.dataset.deleteId);
        return;
      }

      const item = event.target.closest(".history__item");
      if (item) loadConversation(item.dataset.id);
    });

    historyEl.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const item = event.target.closest(".history__item");
      if (!item || event.target.closest("[data-delete-id]")) return;
      event.preventDefault();
      loadConversation(item.dataset.id);
    });

    // topbar click binding is no longer needed

    // code copy delegation
    thread.addEventListener("click", async (event) => {
      const button = event.target.closest(".codeblock__copy");
      if (!button) return;
      const block = button.closest(".codeblock");
      const code = block ? block.querySelector("pre") : null;
      if (!code) return;

      const ok = await copyText(code.textContent);
      if (!ok) {
        toast("Copy failed");
        return;
      }

      button.textContent = "Copied";
      button.classList.add("is-copied");
      setTimeout(() => {
        button.textContent = "Copy";
        button.classList.remove("is-copied");
      }, 1600);
    });

    // palette
    paletteInput.addEventListener("input", () => {
      state.paletteIndex = 0;
      renderPalette(paletteInput.value);
    });

    paletteInput.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setPaletteIndex(state.paletteIndex + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setPaletteIndex(state.paletteIndex - 1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        runCommand(state.paletteIndex);
      }
    });

    palette.addEventListener("click", (event) => {
      if (event.target === palette) closePalette();
    });

    // global keys
    document.addEventListener("keydown", (event) => {
      const mod = event.metaKey || event.ctrlKey;

      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (palette.hidden) openPalette();
        else closePalette();
        return;
      }

      if (mod && event.shiftKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        newChat();
        return;
      }

      if (event.key === "Escape") {
        if (!palette.hidden) closePalette();
        if (app.classList.contains("sidebar-open")) app.classList.remove("sidebar-open");
        return;
      }

      const typing =
        event.target instanceof HTMLElement &&
        (event.target.matches("input, textarea") || event.target.isContentEditable);

      if (event.key === "/" && !typing && palette.hidden) {
        event.preventDefault();
        promptEl.focus();
      }
    });

    // breakpoint cleanup
    mobileQuery.addEventListener?.("change", () => {
      app.classList.remove("sidebar-open");
      if (!mobileQuery.matches) app.classList.remove("sidebar-collapsed");
    });
  }

  /* ---------- boot ---------- */
  function init() {
    loadConversations();

    renderHistory();
    typeHeroSubtitle();
    updateSendUI();
    syncThemeMeta();
    bindEvents();

    if (!mobileQuery.matches) {
      promptEl.focus({ preventScroll: true });
    }
  }

  init();
})();
