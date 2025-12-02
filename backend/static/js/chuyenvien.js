/* ============================================================
   chuyenvien.js
   Common helpers + page specific interactions for giao diện chuyên viên
   - Header demo toasts
   - Dashboard progress animation
   - Văn bản đến: tìm kiếm, lọc, tiếp nhận (demo localStorage)
   - Văn bản đi: tìm kiếm, lọc, toasts thao tác nhanh
   - Hồ sơ công việc: tìm kiếm, lọc mức độ/ trạng thái (demo)
   - Toast helper + debounce, xuất ra window.TrisApp cho trang con dùng chung
============================================================ */

(function () {
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

  const PAGE_ALIASES = {
    "dashboard-chuyenvien": "dashboard",
  };

  const STORAGE_KEYS = {
    incomingAccepted: "vb_accepted",
  };

  const storage = getSafeStorage();

  exposeGlobals();

  onReady(() => {
    const page = detectPageId();

    setupHeaderInteractions();

    const handlers = {
      dashboard: initDashboardPage,
      vanbanden: initVanBanDen,
      "vanbanden-detail": initVanBanDenDetailPage,
      vanbandi: initVanBanDi,
      "vanbandi-taomoi": initVanBanDiCreate,
      hosocongviec: initHoSoCongViec,
      "hosocongviec-detail": initHoSoCongViecDetail,
      danhmuc: initDanhMuc,
      baocaothongke: initBaoCaoThongKe,
      taikhoan: initTaiKhoan,
      thongbaonhacviec: initThongBao,
    };

    (handlers[page] || noop)();
  });

  function onReady(callback) {
    if (typeof callback !== "function") return;
    const run = () => {
      if (window.Layout?.isReady) {
        callback();
        return;
      }
      if (window.Layout) {
        window.addEventListener("layout:ready", callback, { once: true });
        return;
      }
      callback();
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      run();
    }
  }

  /* ============== COMMON ============== */

  function detectPageId() {
    const bodyAttr = document.body?.dataset?.page;
    if (bodyAttr) {
      const normalized = bodyAttr.toLowerCase();
      return PAGE_ALIASES[normalized] || normalized;
    }
    const fragment = (location.pathname || "").split("/").pop() || "";
    const clean = fragment.split(/[?#]/)[0];
    return clean.replace(/\.html$/i, "").toLowerCase() || "dashboard";
  }

  function setupHeaderInteractions() {
    const sidebar = $("#sidebar");
    const btnSidebar = $("#btnSidebar") || $("#btn-sidebar");
    if (btnSidebar && sidebar) {
      btnSidebar.addEventListener("click", () => {
        const open = sidebar.classList.toggle("is-open");
        sidebar.classList.toggle("hidden", !open);
        btnSidebar.setAttribute("aria-expanded", String(open));
      });
    }

    $("#notifBtn")?.addEventListener("click", () => {
      showToast("Bạn có 3 thông báo mới.");
    });
    $("#msgBtn")?.addEventListener("click", () => {
      showToast("Bạn có 1 tin nhắn nội bộ mới.");
    });
  }

  function animateDashboardProgress() {
    const bars = $$("[data-progress-value]");
    if (bars.length) {
      bars.forEach((bar) => {
        const raw = Number.parseFloat(bar.dataset.progressValue);
        const target = Number.isFinite(raw) ? raw : calculatePercentWidth(bar);
        animateBar(bar, target);
      });
      return;
    }

    const fallback = [];
    fallback.push(...document.querySelectorAll(".progress-bar-dashboard"));
    fallback.push(...document.getElementsByClassName("w-[17%]"));
    fallback.push(
      ...document.getElementsByClassName("h-full"),
      ...document.getElementsByClassName("bg-blue-600")
    );
    fallback.forEach((bar) => animateBar(bar, calculatePercentWidth(bar)));
  }

  function initDashboardPage() {
    animateDashboardProgress();
    const layout = window.Layout || {};
    const ready =
      layout.authPromise && typeof layout.authPromise.then === "function"
        ? layout.authPromise
        : Promise.resolve();
    ready
      .then(loadDashboardWidgets)
      .catch((error) =>
        console.error("[chuyenvien] Không thể xác thực dashboard:", error)
      );
  }

  async function loadDashboardWidgets() {
    const api = window.ApiClient;
    const helpers = window.DocHelpers;
    if (!api || typeof api.request !== "function") {
      console.warn("[chuyenvien] ApiClient chưa sẵn sàng; bỏ qua dashboard.");
      return;
    }
    try {
      const response = await api.request("/api/v1/analytics/leader-dashboard", {
        params: { scope: "personal" },
      });
      const payload = response?.data;
      if (!response?.success || !payload) {
        console.warn("[chuyenvien] API dashboard trả về dữ liệu không hợp lệ.");
        return;
      }
      updateDashboardKPIs(payload);
      renderPendingDocuments(payload.pending_documents || [], helpers);
      renderApprovalTimeline(payload.approval_timeline || [], helpers);
      renderTaskProgress(payload.task_progress || {}, helpers);
      renderNotifications(payload.notifications || [], helpers);
      animateDashboardProgress();
    } catch (error) {
      console.error("[chuyenvien] Lỗi tải dashboard:", error);
    }
  }

  function updateDashboardKPIs(payload) {
    const totals = payload.pending_counts || {};
    const pendingCount =
      (Number.isFinite(totals.approval) ? totals.approval : 0) +
      (Number.isFinite(totals.sign) ? totals.sign : 0);
    const task = payload.task_progress || {};
    const completed = Number.isFinite(task.completed) ? task.completed : 0;
    const totalTasks = Number.isFinite(task.total) ? task.total : 0;
    const rate = totalTasks ? Math.round((completed / totalTasks) * 100) : 0;
    setText("[data-kpi=\"vb-can-xu-ly\"]", pendingCount);
    setText("[data-kpi=\"task-done\"]", completed);
    setText("[data-kpi=\"task-total\"]", totalTasks);
    const rateNode = document.querySelector("[data-kpi=\"task-rate\"]");
    if (rateNode) {
      rateNode.textContent = `${rate}%`;
    }
    const progressBar = document.querySelector("[data-kpi=\"task-progress-bar\"]");
    if (progressBar) {
      progressBar.dataset.progressValue = String(rate);
      progressBar.parentElement?.setAttribute("aria-valuenow", String(rate));
    }
    setText(
      "[data-kpi=\"notif-unread\"]",
      (payload.notifications || []).filter((item) => !item.read).length
    );
  }

  function renderPendingDocuments(items, helpers) {
    const list = document.getElementById("vb-list");
    if (!list) return;
    const escape = createEscaper(helpers);
    const rows = Array.isArray(items) ? items.slice(0, 6) : [];
    if (!rows.length) {
      list.innerHTML =
        '<li class="px-4 py-6 text-center text-[13px] text-slate-500">Không có văn bản cần xử lý trong thời điểm này.</li>';
      return;
    }
    list.innerHTML = rows
      .map((item) => renderPendingDocItem(item, escape))
      .join("");
  }

  function renderPendingDocItem(item, escape) {
    const title = escape(item.title || "Văn bản");
    const code = item.code ? `Số: ${escape(item.code)}` : "";
    const due = formatDashboardDate(item.due_at);
    const dueSpan = due
      ? `<span class="font-medium text-slate-600">Hạn: ${escape(due)}</span>`
      : "";
    const meta = [code, dueSpan].filter(Boolean).join(" · ");
    const deptLine = item.department
      ? `<div class="text-[12px] text-slate-500">Đơn vị xử lý: ${escape(
          item.department
        )}</div>`
      : "";
    const statusLabel = item.status || "Chưa xác định";
    const badgeClass = getStatusChipClass(statusLabel, !!item.is_overdue);
    return `
      <li class="px-4 py-3 flex items-start justify-between gap-4 hover:bg-slate-50/60">
        <div class="min-w-0">
          <p class="font-medium text-slate-900 truncate">${title}</p>
          <p class="text-[12.5px] text-slate-500 mt-0.5">${meta || "Đang cập nhật"}</p>
          ${deptLine}
        </div>
        <div class="flex items-center gap-2">
          <span class="rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass}">${escape(
            statusLabel
          )}</span>
          <button
            class="grid place-items-center w-7 h-7 rounded-full hover:bg-slate-100"
            title="Chi tiết"
            type="button"
            aria-label="Chi tiết ${title}"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-500" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 14a1.5 1.5 0 110 3 1.5 1.5 0 010-3z"/>
            </svg>
          </button>
        </div>
      </li>
    `;
  }

  function renderApprovalTimeline(items, helpers) {
    const list = document.querySelector(
      "[data-source=\"document_workflow_logs\"]"
    );
    if (!list) return;
    if (!Array.isArray(items) || !items.length) {
      list.innerHTML =
        '<li class="px-4 py-6 text-center text-[13px] text-slate-500">Không có nhật ký xử lý gần đây.</li>';
      return;
    }
    const escape = createEscaper(helpers);
    list.innerHTML = items
      .slice(0, 6)
      .map((item) => renderTimelineItem(item, escape))
      .join("");
  }

  function renderTimelineItem(item, escape) {
    const title = escape(
      item.title || (item.code ? item.code : "Nhật ký xử lý")
    );
    const actionText = escape(item.action || "Log");
    const timestamp = formatDashboardDateTime(item.timestamp);
    const actor = item.actor ? ` — ${escape(item.actor)}` : "";
    const statusLine = item.status
      ? `<p class="text-[12px] text-slate-400">Trạng thái: ${escape(
          item.status
        )}</p>`
      : "";
    const noteLine = item.note
      ? `<p class="text-[12px] text-slate-400">Ghi chú: ${escape(item.note)}</p>`
      : "";
    const badgeClass = getTimelineBadgeClass(item.status, item.is_overdue);
    return `
      <li class="px-4 py-3 flex items-center justify-between hover:bg-slate-50/60">
        <div class="flex items-start gap-3">
          <div class="mt-0.5 text-blue-600 font-semibold text-[13px]">LOG</div>
          <div>
            <p class="font-medium">${title}</p>
            <p class="text-[12.5px] text-slate-500">
              ${timestamp}${actor}
            </p>
            ${statusLine}
            ${noteLine}
          </div>
        </div>
        <span class="px-3 py-1.5 rounded-md ${badgeClass} text-[12px] font-medium text-slate-700">
          ${actionText}
        </span>
      </li>
    `;
  }

  function renderTaskProgress(taskProgress, helpers) {
    const list = document.getElementById("task-list");
    if (!list) return;
    const escape = createEscaper(helpers);
    const completed = Number.isFinite(taskProgress.completed)
      ? taskProgress.completed
      : 0;
    const total = Number.isFinite(taskProgress.total) ? taskProgress.total : 0;
    const rate = total ? Math.round((completed / total) * 100) : 0;
    setText("[data-kpi=\"task-done\"]", completed);
    setText("[data-kpi=\"task-total\"]", total);
    const rateNode = document.querySelector("[data-kpi=\"task-rate\"]");
    if (rateNode) {
      rateNode.textContent = `${rate}%`;
    }
    const progressBar = document.querySelector("[data-kpi=\"task-progress-bar\"]");
    if (progressBar) {
      progressBar.dataset.progressValue = String(rate);
      progressBar.parentElement?.setAttribute("aria-valuenow", String(rate));
    }
    const items = Array.isArray(taskProgress.items)
      ? taskProgress.items.slice(0, 6)
      : [];
    if (!items.length) {
      list.innerHTML =
        '<li class="text-[13px] text-slate-500 text-center">Chưa có nhiệm vụ được ghi nhận.</li>';
      return;
    }
    list.innerHTML = items
      .map((task) => renderTaskItem(task, escape))
      .join("");
  }

  function renderTaskItem(task, escape) {
    const title = escape(task.title || "Công việc");
    const due = formatDashboardDate(task.due_at);
    const status = task.status || "Chưa xác định";
    const badgeClass = getTaskBadgeClass(status);
    const dueLine = due
      ? `<div class="text-[12px] text-slate-500">Hạn: ${escape(due)}</div>`
      : "";
    return `
      <li class="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
        <div class="flex-1 min-w-0">
          <p class="text-[14px] font-medium truncate">${title}</p>
          ${dueLine}
        </div>
        <span class="px-2.5 py-1 rounded-full text-xs font-semibold ${badgeClass}">
          ${escape(status)}
        </span>
      </li>
    `;
  }

  function renderNotifications(items, helpers) {
    const list = document.querySelector("#thong-bao-moi [data-source=\"notifications\"]");
    if (!list) return;
    const escape = createEscaper(helpers);
    if (!Array.isArray(items) || !items.length) {
      list.innerHTML =
        '<li class="px-3 py-3 rounded-lg border-b border-slate-100"><div class="flex items-start gap-3"><div class="mt-0.5 text-blue-600">🔔</div><div class="flex-1"><p class="font-medium text-[14px] text-slate-500">Không có thông báo mới</p></div></div></li>';
      return;
    }
    list.innerHTML = items
      .map((item, index) => renderNotificationItem(item, escape, index === items.length - 1))
      .join("");
  }

  function renderNotificationItem(item, escape, isLast) {
    const title = escape(item.title || "Thông báo");
    const body = escape(item.body || "");
    const time = formatDashboardDateTime(item.sent_at);
    const hasLink = Boolean(item.link);
    const link = sanitizeLink(item.link);
    const heading = hasLink && link
      ? `<a href="${link}" class="hover:underline" target="_blank" rel="noreferrer">${title}</a>`
      : title;
    const unreadDot = item.read
      ? ""
      : '<span class="w-2 h-2 rounded-full bg-blue-600 mt-2" aria-label="Chưa đọc"></span>';
    const borderClass = isLast ? "" : "border-b border-slate-100";
    return `
      <li class="px-3 py-3 rounded-lg hover:bg-slate-50 ${borderClass}">
        <div class="flex items-start gap-3">
          <div class="mt-0.5 text-blue-600">🔔</div>
          <div class="flex-1 min-w-0">
            <p class="font-medium text-[14px]">${heading}</p>
            <p class="text-[12.5px] text-slate-500">${body}</p>
            <div class="text-[12px] text-slate-400 mt-1">${time}</div>
          </div>
          ${unreadDot}
        </div>
      </li>
    `;
  }

  function setText(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.textContent = String(value ?? "");
  }

  function createEscaper(helpers) {
    return (value) => {
      if (!value && value !== 0) return "";
      if (helpers?.escapeHtml) {
        return helpers.escapeHtml(String(value));
      }
      return String(value);
    };
  }

  function formatDashboardDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return [
        String(date.getDate()).padStart(2, "0"),
        String(date.getMonth() + 1).padStart(2, "0"),
        date.getFullYear(),
      ].join("/");
    }
    const trimmed = String(value).split("T")[0];
    if (/^\\d{4}-\\d{2}-\\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split("-");
      return `${d}/${m}/${y}`;
    }
    return String(value);
  }

  function formatDashboardDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("vi-VN", { hour12: false });
  }

  function getStatusChipClass(status, isOverdue) {
    if (isOverdue) {
      return "bg-rose-50 text-rose-700";
    }
    const text = (status || "").toLowerCase();
    if (text.includes("chờ") || text.includes("cho")) {
      return "bg-amber-50 text-amber-700";
    }
    if (text.includes("đang") || text.includes("dang")) {
      return "bg-blue-50 text-blue-700";
    }
    if (
      text.includes("hoàn") ||
      text.includes("hoan") ||
      text.includes("kết") ||
      text.includes("ket")
    ) {
      return "bg-emerald-50 text-emerald-700";
    }
    return "bg-slate-100 text-slate-700";
  }

  function getTimelineBadgeClass(status, isOverdue) {
    if (isOverdue) {
      return "bg-rose-50 text-rose-700";
    }
    const text = (status || "").toLowerCase();
    if (
      text.includes("hoàn") ||
      text.includes("hoan") ||
      text.includes("đã") ||
      text.includes("da")
    ) {
      return "bg-emerald-50 text-emerald-700";
    }
    if (
      text.includes("quá") ||
      text.includes("qua") ||
      text.includes("trễ") ||
      text.includes("tre")
    ) {
      return "bg-rose-50 text-rose-700";
    }
    return "bg-slate-100 text-slate-700";
  }

  function getTaskBadgeClass(status) {
    const text = (status || "").toLowerCase();
    if (text.includes("hoàn") || text.includes("hoan")) {
      return "bg-emerald-50 text-emerald-700";
    }
    if (text.includes("dang") || text.includes("đang")) {
      return "bg-blue-50 text-blue-700";
    }
    if (
      text.includes("quá") ||
      text.includes("qua") ||
      text.includes("trễ") ||
      text.includes("tre")
    ) {
      return "bg-rose-50 text-rose-700";
    }
    return "bg-slate-100 text-slate-700";
  }

  function sanitizeLink(value) {
    if (!value) return "";
    const trimmed = String(value).trim();
    if (!trimmed) return "";
    let normalized = trimmed;
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = normalized.startsWith("/")
        ? normalized
        : `/${normalized.replace(/^\/+/, "")}`;
    }
    return encodeURI(normalized);
  }

  function animateBar(bar, targetPercent) {
    if (!bar || targetPercent <= 0) return;
    bar.style.width = "0%";
    bar.style.transition = "width .8s ease";
    requestAnimationFrame(() => {
      bar.style.width = `${targetPercent}%`;
    });
  }

  function calculatePercentWidth(bar) {
    const parent = bar?.parentElement;
    if (!parent) return 0;
    const parentWidth = parent.getBoundingClientRect().width;
    if (!parentWidth) return 0;
    const barWidth = bar.getBoundingClientRect().width;
    return parentWidth ? (barWidth / parentWidth) * 100 : 0;
  }

  function getFilterControls() {
    const heading = $$("section h3").find((el) =>
      /tìm kiếm và lọc/i.test(el.textContent || "")
    );
    const section = heading?.closest("section") || null;
    if (!section) {
      return {
        section: null,
        searchInput: null,
        selects: [],
        advBtn: null,
      };
    }
    return {
      section,
      searchInput: section.querySelector('input[type="text"]'),
      selects: Array.from(section.querySelectorAll("select")),
      advBtn: section.querySelector("button"),
    };
  }

  function attachIconActions(tbody, options = {}) {
    if (!tbody) return;
    const { getLabel = () => "", actionTexts = {} } = options;
    const textMap = {
      view: "Xem",
      log: "Nhật ký xử lý",
      dl: "Tải xuống",
      ...actionTexts,
    };
    tbody.addEventListener("click", (event) => {
      const btn = event.target.closest("button.btn-icon");
      if (!btn) return;
      const action = btn.dataset.action || "view";
      const row = btn.closest("tr");
      const label = getLabel(row) || "";
      const prefix = textMap[action] || "Thao tác";
      const message = label ? `${prefix} — ${label}` : prefix;
      showToast(message);
    });
  }

  function updateSummaryCount(summaryEl, count) {
    if (!summaryEl) return;
    if (!summaryEl.dataset.template) {
      summaryEl.dataset.template = summaryEl.textContent.replace(
        /\d+/g,
        "{count}"
      );
    }
    const tpl = summaryEl.dataset.template;
    summaryEl.textContent = tpl.includes("{count}")
      ? tpl.replace("{count}", count)
      : `Hiển thị ${count}`;
  }

  /* ============== VĂN BẢN ĐẾN ============== */

  function initVanBanDen() {
    if (window.CVIncomingListOverride) {
      return;
    }
    const api = window.ApiClient;
    const helpers = window.DocHelpers;
    if (!api || !helpers) {
      console.warn(
        "[chuyenvien] ApiClient hoặc DocHelpers chưa sẵn sàng; bỏ qua tới văn bản đến."
      );
      return;
    }

    const tableBody =
      document.getElementById("vbDenBody") ||
      document.querySelector("#cv-incoming-list tbody");
    if (!tableBody) return;

    const detailView = createDetailView(
      "#cv-incoming-list",
      "#cv-incoming-detail",
      renderDocDetail
    );

    const { searchInput, selects, advBtn } = getFilterControls();
    const statusSel =
      document.getElementById("statusFilter") || selects?.[0] || null;
    const urgencySel =
      document.getElementById("urgencyFilter") || selects?.[1] || null;
    const summary =
      document.querySelector("[data-summary='incoming']") ||
      document
        .querySelector("#cv-incoming-list")
        ?.closest("section")
        ?.querySelector("h2 + p") ||
      null;
    const globalSearch = document.getElementById("globalSearch");
    const pageSearch =
      document.getElementById("pageSearch") || searchInput || null;
    const rowCounter = document.querySelector("[data-count='rows']");

    const state = {
      keyword: "",
      globalKeyword: "",
      status: "all",
      urgency: "all",
    };

    let normalizedDocs = [];
    let currentDocs = [];

    const acceptedDocs = new Set(loadAccepted());

    const debouncedFilter = debounce(applyFilters, 160);

    registerSearch(pageSearch, "keyword");
    if (searchInput && searchInput !== pageSearch) {
      registerSearch(searchInput, "keyword");
    }
    registerSearch(globalSearch, "globalKeyword");

    statusSel?.addEventListener("change", (event) => {
      state.status = mapStatusFilter(event.target.value);
      applyFilters();
    });

    urgencySel?.addEventListener("change", (event) => {
      state.urgency = mapUrgencyFilter(event.target.value);
      applyFilters();
    });

    advBtn?.addEventListener("click", () =>
      showToast("Bộ lọc nâng cao sẽ được kích hoạt khi triển khai đầy đủ API.")
    );

    tableBody.addEventListener("click", (event) => {
      const detailBtn = event.target.closest("[data-open-detail]");
      if (detailBtn && detailView) {
        event.preventDefault();
        const row = detailBtn.closest("tr");
        if (row) {
          detailView.show(buildDocDataset(row));
        }
        return;
      }

      const acceptBtn = event.target.closest("[data-action='accept']");
      if (acceptBtn) {
        const row = acceptBtn.closest("tr");
        if (row) {
          handleAcceptRow(row);
          persistAcceptedRow(row);
        }
      }
    });

    attachIconActions(tableBody, {
      getLabel(row) {
        return row?.dataset?.docTitle || row?.dataset?.docId || "văn bản";
      },
      actionTexts: {
        log: "Nhật ký văn bản",
        download: "Tải tệp",
      },
    });

    const layout = window.Layout || {};
    const authReady =
      layout.authPromise && typeof layout.authPromise.then === "function"
        ? layout.authPromise
        : Promise.resolve();

    authReady
      .then(loadDocuments)
      .catch(() => renderErrorRow("Không thể xác thực người dùng hiện tại."));

    function registerSearch(input, key) {
      if (!input) return;
      input.addEventListener("input", (event) => {
        state[key] = event.target.value || "";
        debouncedFilter();
      });
    }

    function loadDocuments() {
      const docApi = api.documents;
      if (!docApi) {
        renderErrorRow('Chua cau hinh Document API.');
        return Promise.resolve();
      }
      renderLoading();
      return docApi
        .list({
          doc_direction: 'den',
          ordering: '-created_at',
          page_size: 50,
        })
        .then((data) => {
          const payload = api.extractItems(data) || [];
          normalizedDocs = payload.map((item) =>
            helpers.normalizeInboundDoc(item)
          );
          applyFilters();
        })
        .catch((error) => {
          console.error('[chuyenvien] Loi tai van ban den:', error);
          renderErrorRow(helpers.resolveErrorMessage(error));
        });
    }


    function applyFilters() {
      if (!normalizedDocs.length) {
        renderEmptyRow();
        updateSummaryCount(summary, 0);
        if (rowCounter) rowCounter.textContent = "0";
        return;
      }

      const keyword = activeKeyword();
      const normalizedKeyword = helpers.normalizeText(keyword);
      currentDocs = normalizedDocs.filter((doc) => {
        if (state.status !== "all" && doc.statusKey !== state.status) {
          return false;
        }
        if (state.urgency !== "all" && doc.urgencyKey !== state.urgency) {
          return false;
        }
        if (normalizedKeyword && !doc.searchText.includes(normalizedKeyword)) {
          return false;
        }
        return true;
      });

      renderRows(currentDocs);
      updateSummaryCount(summary, currentDocs.length);
      if (rowCounter) {
        rowCounter.textContent = String(currentDocs.length);
      }
    }

    function activeKeyword() {
      const local = (state.keyword || "").trim();
      if (local) return local;
      return (state.globalKeyword || "").trim();
    }

    function renderRows(list) {
      tableBody.innerHTML = "";
      if (!list.length) {
        renderEmptyRow();
        return;
      }
      const fragment = document.createDocumentFragment();
      list.forEach((doc) => {
        fragment.appendChild(createRow(doc));
      });
      tableBody.appendChild(fragment);
      applyAcceptedState();
    }

    function createRow(doc) {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-50/60";
      tr.dataset.docId = doc.id != null ? String(doc.id) : "";
      tr.dataset.docDirection = doc.docDirection || "den";
      tr.dataset.docTitle = doc.title || "";
      tr.dataset.docCode = doc.number || "";
      tr.dataset.docReceivedNumber = doc.incomingNumber || "";
      tr.dataset.docIssuedDate = doc.issuedDate || "";
      tr.dataset.docReceivedDate = doc.receivedDate || "";
      tr.dataset.docSender = doc.sender || "";
      tr.dataset.docReceiver = doc.department || "";
      tr.dataset.docField = doc.docType || "";
      tr.dataset.docType = doc.docType || "";
      tr.dataset.docUrgency = doc.urgencyLabel || "";
      tr.dataset.docSecurity = doc.securityLabel || "";
      tr.dataset.docStatus = doc.statusLabel || "";
      tr.dataset.docDepartment = doc.department || "";
      tr.dataset.docDue = doc.dueDate || "";
      tr.__docData = doc;
      const statusClass = inboundStatusClass(doc.statusKey);
      const urgencyClass = urgencyChipClass(doc.urgencyKey);
      const securityClass = securityChipClass(doc.securityLabel);
      const docId =
        tr.dataset.docId ||
        doc.document_id ||
        doc.raw?.document_id ||
        doc.raw?.id ||
        "";
      const direction =
        (doc.docDirection || doc.direction || "den").toString().toLowerCase();
      const basePath =
        direction === "di" ? "/chuyenvien/vanbandi/" : "/chuyenvien/vanbanden/";
      const detailHref = docId
        ? `${basePath}${encodeURIComponent(docId)}/`
        : `vanbanden-detail.html?id=${encodeURIComponent(docId)}`;
      const attachmentText = doc.hasAttachments ? "Có" : "Không";

      tr.innerHTML = [
        '<td class="py-3 pl-6 pr-3">',
        `  <div class="font-medium text-slate-800 truncate">${helpers.escapeHtml(
          doc.title || "Văn bản"
        )}</div>`,
        doc.department
          ? `  <div class="text-[12.5px] text-slate-500">Đơn vị xử lý: ${helpers.escapeHtml(
              doc.department
            )}</div>`
          : "",
        "</td>",
        '<td class="px-3 py-3 text-[13px] text-slate-600">',
        doc.number
          ? `  <div class="doc-number">${helpers.escapeHtml(doc.number)}</div>`
          : "",
        doc.incomingNumber && doc.incomingNumber !== doc.number
          ? `  <div class="text-[12px] text-slate-500">Số đến: ${helpers.escapeHtml(
              doc.incomingNumber
            )}</div>`
          : "",
        "</td>",
        '<td class="px-3 py-3 text-[13px]">',
        doc.issuedDate
          ? `  <div>Ban hành: ${helpers.escapeHtml(
              helpers.formatDate(doc.issuedDate)
            )}</div>`
          : "",
        doc.receivedDate
          ? `  <div class="text-[12px] text-slate-500">Đến: ${helpers.escapeHtml(
              helpers.formatDate(doc.receivedDate)
            )}</div>`
          : "",
        "</td>",
        '<td class="px-3 py-3 text-[13px]">',
        doc.docType
          ? `  <div>Loại: ${helpers.escapeHtml(doc.docType)}</div>`
          : "",
        doc.assigneeCount
          ? `  <div class="text-[12px] text-slate-500">Phân công: ${helpers.escapeHtml(
              String(doc.assigneeCount)
            )}</div>`
          : "",
        "</td>",
        '<td class="px-3 py-3 text-[13px]">',
        doc.urgencyLabel
          ? `  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold ${urgencyClass}">${helpers.escapeHtml(
              doc.urgencyLabel
            )}</span>`
          : "",
        doc.securityLabel
          ? `  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold ml-1 ${securityClass}">${helpers.escapeHtml(
              doc.securityLabel
            )}</span>`
          : "",
        "</td>",
        '<td class="px-3 py-3 text-[13px]">',
        doc.sender ? `  <div>${helpers.escapeHtml(doc.sender)}</div>` : "",
        doc.creatorName
          ? `  <div class="text-[12px] text-slate-500">Tiếp nhận: ${helpers.escapeHtml(
              doc.creatorName
            )}</div>`
          : "",
        "</td>",
        '<td class="px-3 py-3 text-[13px]">',
        doc.department
          ? `  <div>Chủ trì: ${helpers.escapeHtml(doc.department)}</div>`
          : "",
        doc.dueDate
          ? `  <div class="text-[12px] text-slate-500">Hạn xử lý: ${helpers.escapeHtml(
              helpers.formatDate(doc.dueDate)
            )}</div>`
          : "",
        "</td>",
        `<td class="px-3 py-3 text-slate-500 whitespace-nowrap">${helpers.escapeHtml(
          attachmentText
        )}</td>`,
        `<td class="px-3 py-3"><span class="px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass}">${helpers.escapeHtml(
          doc.statusLabel
        )}</span></td>`,
        '<td class="px-3 py-3">',
        '  <div class="flex items-center justify-end gap-2 pr-3">',
        `    <a href="${detailHref}" class="w-8 h-8 grid place-items-center rounded-full border border-slate-200 hover:bg-slate-100" title="Xem chi tiết" data-open-detail="1">`,
        '      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">',
        '        <circle cx="11" cy="11" r="7"></circle>',
        '        <line x1="16.65" y1="16.65" x2="21" y2="21"></line>',
        "      </svg>",
        "    </a>",
        '    <button type="button" class="btn-icon" data-action="log" title="Nhật ký xử lý">',
        '      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">',
        '        <path d="M4 4h16v16H4z"></path>',
        '        <path d="M8 4v4h8V4"></path>',
        "      </svg>",
        "    </button>",
        '    <button type="button" class="btn-icon" data-action="dl" title="Tải xuống">',
        '      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">',
        '        <path d="M12 5v14"></path>',
        '        <path d="m19 12-7 7-7-7"></path>',
        "      </svg>",
        "    </button>",
        '    <button type="button" class="px-3 py-1.5 rounded-lg border border-blue-200 text-[12.5px] font-semibold text-blue-600 hover:bg-blue-50 transition" data-action="accept">',
        "      Tiếp nhận",
        "    </button>",
        "  </div>",
        "</td>",
      ]
        .filter(Boolean)
        .join("");
      return tr;
    }

    function renderLoading() {
      tableBody.innerHTML =
        '<tr><td colspan="10" class="py-6 text-center text-[13px] text-slate-500">Đang tải dữ liệu...</td></tr>';
    }

    function renderEmptyRow() {
      tableBody.innerHTML =
        '<tr><td colspan="10" class="py-6 text-center text-[13px] text-slate-500">Không có văn bản phù hợp với bộ lọc.</td></tr>';
    }

    function renderErrorRow(message) {
      tableBody.innerHTML = `<tr><td colspan="10" class="py-6 text-center text-[13px] text-rose-600">${helpers.escapeHtml(
        message
      )}</td></tr>`;
    }

    function mapStatusFilter(raw) {
      if (!raw) return "all";
      return helpers.normalizeText(raw) || "all";
    }

    function mapUrgencyFilter(raw) {
      const value = helpers.normalizeText(raw);
      if (!value || value.includes("tat")) return "all";
      if (value.includes("rat") || value.includes("hoa")) return "ratkhan";
      if (value.includes("khan")) return "khan";
      if (value.includes("cao")) return "cao";
      if (value.includes("thuong")) return "thuong";
      return "all";
    }

    function inboundStatusClass(key) {
      switch (key) {
        case "phan-cong":
          return "bg-violet-100 text-violet-700";
        case "dang-xu-ly":
          return "bg-amber-100 text-amber-700";
        case "hoan-tat":
          return "bg-emerald-100 text-emerald-700";
        case "luu-tru":
          return "bg-slate-100 text-slate-700";
        case "thu-hoi":
          return "bg-rose-100 text-rose-700";
        default:
          return "bg-slate-900 text-white";
      }
    }

    function urgencyChipClass(key) {
      switch (key) {
        case "ratkhan":
          return "bg-rose-100 text-rose-700";
        case "khan":
          return "bg-amber-100 text-amber-700";
        case "cao":
          return "bg-orange-100 text-orange-700";
        default:
          return "bg-slate-100 text-slate-700";
      }
    }

    function securityChipClass(label) {
      const value = helpers.normalizeText(label);
      if (!value) return "bg-slate-200 text-slate-700";
      if (value.includes("tuyet")) return "bg-rose-100 text-rose-700";
      if (value.includes("mat")) return "bg-red-100 text-red-700";
      return "bg-slate-200 text-slate-700";
    }

    function handleAcceptRow(row, options = {}) {
      if (!row || row.dataset.accepted === "true") return;
      const { silent = false } = options;
      const doc = row.__docData;
      const statusCell = row.children?.[8];
      if (statusCell) {
        statusCell.innerHTML =
          '<span class="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Đang xử lý</span>';
      }
      const button = row.querySelector("[data-action='accept']");
      if (button) {
        button.textContent = "Đã tiếp nhận";
        button.classList.add("opacity-60", "cursor-not-allowed");
        button.setAttribute("disabled", "true");
      }
      row.dataset.accepted = "true";
      row.dataset.docStatus = "Đang xử lý";
      if (doc) {
        doc.statusKey = "processing";
        doc.statusLabel = "Đang xử lý";
      }
      if (!silent) {
        showToast(
        doc?.number
          ? `Đã tiếp nhận văn bản ${doc.number}`
          : "Đã tiếp nhận văn bản."
        );
      }
    }

    function persistAcceptedRow(row) {
      const id =
        row?.dataset?.docId || row?.dataset?.docCode || getDocIdFromRow(row);
      if (!id) return;
      acceptedDocs.add(id);
      saveAccepted(Array.from(acceptedDocs));
    }

    function applyAcceptedState() {
      if (!acceptedDocs.size) return;
      const rows = $$("tr", tableBody);
      rows.forEach((row) => {
        const id =
          row?.dataset?.docId || row?.dataset?.docCode || getDocIdFromRow(row);
        if (id && acceptedDocs.has(id)) {
          handleAcceptRow(row, { silent: true });
        }
      });
    }

    applyAcceptedState();

    attachIconActions(tableBody, {
      getLabel(row) {
        const id = getDocIdFromRow(row);
        if (id) return `văn bản ${id}`;
        const title =
          row?.dataset?.docTitle ||
          safeText(row?.querySelector(".font-medium"));
        return title || "văn bản";
      },
    });

    document
      .querySelector("[data-action='assign']")
      ?.addEventListener("click", () =>
        showToast("Phân công: CV được phép trong phạm vi tổ/nhóm.")
      );
    document
      .querySelector("[data-action='open-logs']")
      ?.addEventListener("click", () =>
        showToast("Mở nhật ký văn bản (chỉ xem/ghi chú theo phân quyền).")
      );
    document
      .querySelector("[data-action='export']")
      ?.addEventListener("click", () =>
        showToast("Xuất hồ sơ (Excel/PDF) — kết nối API để tải về.")
      );

    const noteBtn = document.querySelector("[data-action='add-note']");
    if (noteBtn) {
      noteBtn.addEventListener("click", () => {
        const input = document.getElementById("noteInput");
        const list = document.getElementById("cvDocNotes");
        if (!input || !list) return;
        const text = (input.value || "").trim();
        if (!text) return;
        const li = document.createElement("li");
        li.className = "rounded-lg border border-slate-100 p-3";
        const now = new Date().toISOString().slice(0, 16).replace("T", " ");
        li.innerHTML = `
          <div class="flex items-center justify-between text-[13px]">
            <span class="font-medium text-slate-700">Nguyễn Văn An</span>
            <span class="text-[12px] text-slate-400">${now}</span>
          </div>
          <p class="mt-1 text-[12.5px] text-slate-600"></p>
        `;
        li.querySelector("p").textContent = text;
        list.prepend(li);
        input.value = "";
        showToast("Đã thêm ghi chú nội bộ.");
      });
    }

    const searchInputs = [searchInput, pageSearch, globalSearch].filter(
      Boolean
    );
    const normalize = (value) =>
      (value || "")
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const rows = $$("tr", tableBody);

    const applyLegacyFilters = () => {
      const kwSource =
        searchInputs.map((input) => input.value?.trim()).find(Boolean) || "";
      const keyword = normalize(kwSource);
      const statusValue = (statusSel?.value || "").trim();
      const urgencyValue = (urgencySel?.value || "").trim();

      let visible = 0;
      rows.forEach((row) => {
        const data = {
          status: row.dataset.docStatus || safeText(row.children?.[6]),
          urgency: row.dataset.docUrgency || safeText(row.children?.[5]),
        };

        const haystack = normalize(
          [
            row.dataset.docTitle,
            row.dataset.docCode,
            row.dataset.docSender,
            row.dataset.docReceiver,
            safeText(row),
          ]
            .filter(Boolean)
            .join(" ")
        );
        const okKw = !keyword || haystack.includes(keyword);
        const okStatus =
          !statusValue || normalize(data.status) === normalize(statusValue);
        const okUrgency =
          !urgencyValue || normalize(data.urgency) === normalize(urgencyValue);

        const show = okKw && okStatus && okUrgency;
        row.style.display = show ? "" : "none";
        if (show) visible++;
      });

      updateSummaryCount(summary, visible);
      if (rowCounter) {
        rowCounter.textContent = String(visible);
      }
    };

    searchInputs.forEach((input) =>
      input.addEventListener("input", debounce(applyFilters, 120))
    );
    statusSel?.addEventListener("change", applyFilters);
    urgencySel?.addEventListener("change", applyFilters);
    advBtn?.addEventListener("click", () =>
      showToast("Bộ lọc nâng cao đang demo, sẽ kết nối back-end sau.")
    );

    applyFilters();
  }

  /* ============== VĂN BẢN ĐI ============== */

  function initVanBanDi() {
    if (window.CVOutgoingListOverride) {
      return;
    }
    const api = window.ApiClient;
    const helpers = window.DocHelpers;
    if (!api || !helpers) {
      console.warn(
        "[chuyenvien] ApiClient hoặc DocHelpers chưa sẵn sàng; bỏ qua tới văn bản đi."
      );
      return;
    }

    const tableBody =
      document.querySelector("#vbDiTable tbody") ||
      document.querySelector("#cv-outgoing-list tbody");
    if (!tableBody) return;

    const detailView = createDetailView(
      "#cv-outgoing-list",
      "#cv-outgoing-detail",
      renderDocDetail
    );

    const { searchInput, selects, advBtn } = getFilterControls();
    const statusSel = selects?.[0] || null;
    const summary =
      tableBody.closest("section")?.querySelector("h2 + p") || null;
    const globalSearch = document.getElementById("globalSearch");
    const rowCounter = document.querySelector("[data-count='rows']");

    const state = {
      keyword: "",
      globalKeyword: "",
      status: "all",
    };

    let normalizedDocs = [];
    let currentDocs = [];

    const debouncedFilter = debounce(applyFilters, 160);

    registerSearch(searchInput, "keyword");
    if (globalSearch) {
      registerSearch(globalSearch, "globalKeyword");
    }

    statusSel?.addEventListener("change", (event) => {
      state.status = mapStatusFilter(event.target.value);
      applyFilters();
    });

    advBtn?.addEventListener("click", () =>
      showToast("Bộ lọc nâng cao sẽ được bổ sung khi kết nối đầy đủ API.")
    );

    tableBody.addEventListener("click", (event) => {
      const detailBtn = event.target.closest("[data-open-detail]");
      if (detailBtn && detailView) {
        event.preventDefault();
        const row = detailBtn.closest("tr");
        if (row) {
          detailView.show(buildDocDataset(row));
        }
        return;
      }
    });

    attachIconActions(tableBody, {
      getLabel(row) {
        return row?.dataset?.docTitle || row?.dataset?.docId || "văn bản";
      },
      actionTexts: {
        log: "Nhật ký phát hành",
        download: "Tải tệp",
      },
    });

    const layout = window.Layout || {};
    const authReady =
      layout.authPromise && typeof layout.authPromise.then === "function"
        ? layout.authPromise
        : Promise.resolve();

    authReady
      .then(loadDocuments)
      .catch(() => renderErrorRow("Không thể xác thực người dùng hiện tại."));

    function registerSearch(input, key) {
      if (!input) return;
      input.addEventListener("input", (event) => {
        state[key] = event.target.value || "";
        debouncedFilter();
      });
    }

    function loadDocuments() {
      const docApi = api.documents;
      if (!docApi) {
        renderErrorRow('Chua cau hinh Document API.');
        return Promise.resolve();
      }
      renderLoading();
      const baseParams = {
        ordering: '-updated_at',
        page_size: 50,
      };
      return Promise.all([
        docApi.list(Object.assign({}, baseParams, { doc_direction: 'du_thao' })),
        docApi.list(Object.assign({}, baseParams, { doc_direction: 'di' })),
      ])
        .then(([draftResp, outboundResp]) => {
          const drafts = (api.extractItems(draftResp) || []).map((item) => {
            const normalized = helpers.normalizeOutboundDoc(item);
            normalized.statusKey = normalized.statusKey || 'draft';
            if (!normalized.statusLabel || normalized.statusKey === 'draft') {
              normalized.statusLabel = 'Soan thao';
            }
            return normalized;
          });
          const published = (api.extractItems(outboundResp) || []).map((item) =>
            helpers.normalizeOutboundDoc(item)
          );
          normalizedDocs = drafts.concat(published);
          applyFilters();
        })
        .catch((error) => {
          console.error('[chuyenvien] Loi tai van ban di:', error);
          renderErrorRow(helpers.resolveErrorMessage(error));
        });
    }


    function applyFilters() {
      if (!normalizedDocs.length) {
        renderEmptyRow();
        updateSummaryCount(summary, 0);
        if (rowCounter) rowCounter.textContent = "0";
        return;
      }

      const keyword = activeKeyword();
      const normalizedKeyword = helpers.normalizeText(keyword);
      currentDocs = normalizedDocs.filter((doc) => {
        if (state.status !== "all" && doc.statusKey !== state.status) {
          return false;
        }
        if (normalizedKeyword && !doc.searchText.includes(normalizedKeyword)) {
          return false;
        }
        return true;
      });

      renderRows(currentDocs);
      updateSummaryCount(summary, currentDocs.length);
      if (rowCounter) {
        rowCounter.textContent = String(currentDocs.length);
      }
    }

    function activeKeyword() {
      const local = (state.keyword || "").trim();
      if (local) return local;
      return (state.globalKeyword || "").trim();
    }

    function renderRows(list) {
      tableBody.innerHTML = "";
      if (!list.length) {
        renderEmptyRow();
        return;
      }
      const fragment = document.createDocumentFragment();
      list.forEach((doc) => {
        fragment.appendChild(createRow(doc));
      });
      tableBody.appendChild(fragment);
    }

    function createRow(doc) {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-50/60";
      tr.dataset.docId = doc.id != null ? String(doc.id) : "";
      tr.dataset.docDirection = doc.docDirection || "di";
      tr.dataset.docTitle = doc.title || "";
      tr.dataset.docCode = doc.number || "";
      tr.dataset.docIssuedDate = doc.issuedDate || "";
      tr.dataset.docDispatchAt = doc.publishedDate || "";
      tr.dataset.docSigner = doc.signer || "";
      tr.dataset.docReceiver = doc.recipients || "";
      tr.dataset.docUrgency = doc.urgencyLabel || "";
      tr.dataset.docStatus = doc.statusLabel || "";
      tr.__docData = doc;
      const urgencyClass = urgencyChipClass(doc.urgencyKey);
      const statusClass = outboundStatusClass(doc.statusKey);
      const docId =
        tr.dataset.docId ||
        doc.document_id ||
        doc.raw?.document_id ||
        doc.raw?.id ||
        "";
      const detailHref = docId
        ? `/chuyenvien/vanbandi/${encodeURIComponent(docId)}/`
        : `vanbandi-detail.html?id=${encodeURIComponent(docId)}`;

      tr.innerHTML = [
        '<td class="py-2 pr-3">',
        `  <a href="${detailHref}" class="text-blue-700 hover:underline inline-flex items-center gap-2">`,
        '    <span class="badge-dot bg-blue-600"></span>',
            `    ${helpers.escapeHtml(doc.title || "Văn bản")}`,
        "  </a>",
        "</td>",
            `<td class="py-2 px-3">${helpers.escapeHtml(doc.number || "—")}</td>`,
        '<td class="py-2 px-3">',
            doc.issuedDate
              ? `  <div>Ngày ký: ${helpers.escapeHtml(
                  helpers.formatDate(doc.issuedDate)
                )}</div>`
              : "",
            doc.publishedDate
              ? `  <div class="text-[12px] text-slate-500">Phát hành: ${helpers.escapeHtml(
                  helpers.formatDate(doc.publishedDate)
                )}</div>`
              : "",
        "</td>",
            `<td class="py-2 px-3">${helpers.escapeHtml(
          doc.recipients || "—"
        )}</td>`,
        '<td class="py-2 px-3">',
        doc.urgencyLabel
          ? `  <span class="inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold ${urgencyClass}">${helpers.escapeHtml(
              doc.urgencyLabel
            )}</span>`
          : "",
        "</td>",
        `<td class="py-2 px-3"><span class="px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass}">${helpers.escapeHtml(
          doc.statusLabel
        )}</span></td>`,
        '<td class="py-2 pl-3 pr-0">',
        '  <div class="flex items-center justify-end gap-2">',
        '    <button class="btn-icon" title="Xem" data-open-detail="1" type="button">',
        '      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">',
        '        <circle cx="11" cy="11" r="7"></circle>',
        '        <line x1="16.65" y1="16.65" x2="21" y2="21"></line>',
        "      </svg>",
        "    </button>",
        '    <button class="btn-icon" title="Nhật ký phát hành" data-action="log" type="button">',
        '      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">',
        '        <path d="M4 4h16v16H4z"></path>',
        '        <path d="M8 4v4h8V4"></path>',
        "      </svg>",
        "    </button>",
        '    <button class="btn-icon" title="Tải xuống" data-action="dl" type="button">',
        '      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">',
        '        <path d="M12 5v14"></path>',
        '        <path d="m19 12-7 7-7-7"></path>',
        "      </svg>",
        "    </button>",
        "  </div>",
        "</td>",
      ]
        .filter(Boolean)
        .join("");
      return tr;
    }

    function renderLoading() {
      tableBody.innerHTML =
        '<tr><td colspan="7" class="py-6 text-center text-[13px] text-slate-500">Đang tải dữ liệu...</td></tr>';
    }

    function renderEmptyRow() {
      tableBody.innerHTML =
        '<tr><td colspan="7" class="py-6 text-center text-[13px] text-slate-500">Không có văn bản phù hợp với bộ lọc.</td></tr>';
    }

    function renderErrorRow(message) {
      tableBody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-[13px] text-rose-600">${helpers.escapeHtml(
        message
      )}</td></tr>`;
    }

    function mapStatusFilter(raw) {
      const value = helpers.normalizeText(raw);
      if (!value || value.includes("tat")) return "all";
      if (value.includes("phat")) return "published";
      if (value.includes("cho_duyet") || value.includes("submitted")) return "submitted";
      if (value.includes("cho_ky") || value.includes("pending")) return "submitted"; // Map pending-sign to submitted/processing? Let's map to submitted for now as "Chờ duyệt"
      if (value.includes("duyet") || value.includes("approved") || value.includes("processing")) return "processing";
      if (value.includes("dang") || value.includes("draft")) return "draft";
      return "all";
    }

    function outboundStatusClass(key) {
      switch (key) {
        case "published":
          return "bg-emerald-50 text-emerald-700";
        case "registered":
          return "bg-teal-100 text-teal-700";
        case "processing":
          return "bg-blue-100 text-blue-700";
        case "submitted":
          return "bg-amber-100 text-amber-700";
        default:
          return "bg-slate-100 text-slate-700";
      }
    }

    function urgencyChipClass(key) {
      switch (key) {
        case "ratkhan":
          return "bg-rose-100 text-rose-700";
        case "khan":
          return "bg-amber-100 text-amber-700";
        case "cao":
          return "bg-orange-100 text-orange-700";
        default:
          return "bg-slate-100 text-slate-700";
      }
    }
  }

  /* ============== HỒ SƠ CÔNG VIỆC ============== */

  function initHoSoCongViec() {
    const api = window.ApiClient;
    const helpers = window.DocHelpers;
    if (!api || !helpers) {
      console.warn(
        "[chuyenvien] ApiClient hoặc DocHelpers chưa sẵn sàng; bỏ qua hồ sơ công việc."
      );
      return;
    }

    const table = document.getElementById("cvCaseTable");
    const tbody = table?.tBodies?.[0];
    if (!tbody) return;

    const { searchInput, selects, advBtn } = getFilterControls();
    const statusSel = selects?.[0] || null;
    const prioritySel = selects?.[1] || null;
    const summary = table.closest("section")?.querySelector("h2 + p") || null;
    const rowCounter = document.querySelector("[data-count='rows']");

    const kpiEls = {
      total: document.querySelector("[data-case-kpi='total']"),
      inProgress: document.querySelector("[data-case-kpi='in-progress']"),
      done: document.querySelector("[data-case-kpi='done']"),
      overdue: document.querySelector("[data-case-kpi='overdue']"),
    };

    const state = {
      keyword: "",
      status: "all",
      priority: "all",
    };

    let normalizedCases = [];
    const debouncedFilter = debounce(applyFilters, 140);

    registerSearch(searchInput, "keyword");

    statusSel?.addEventListener("change", (event) => {
      state.status = normalizeFilterValue(event.target.value);
      applyFilters();
    });
    prioritySel?.addEventListener("change", (event) => {
      state.priority = normalizeFilterValue(event.target.value);
      applyFilters();
    });
    advBtn?.addEventListener("click", () =>
      showToast("Bộ lọc nâng cao đang được cập nhật cùng backend.")
    );

    attachIconActions(tbody, {
      getLabel(row) {
        const title = row?.dataset?.caseTitle;
        const id = row?.dataset?.caseId;
        return title ? `hồ sơ "${title}"` : id ? `hồ sơ #${id}` : "hồ sơ";
      },
      actionTexts: {
        view: "Xem hồ sơ",
      },
    });

    const layout = window.Layout || {};
    const authReady =
      layout.authPromise && typeof layout.authPromise.then === "function"
        ? layout.authPromise
        : Promise.resolve();

    authReady
      .then(loadCases)
      .catch(() => renderErrorRow("Không thể xác thực người dùng hiện tại."));

    function registerSearch(input, key) {
      if (!input) return;
      input.addEventListener("input", (event) => {
        state[key] = (event.target.value || "").trim();
        debouncedFilter();
      });
    }

    function normalizeFilterValue(raw) {
      const cleaned = (raw || "").trim();
      return cleaned ? helpers.normalizeText(cleaned) : "all";
    }

    function loadCases() {
      renderLoading();
      return api
        .cases.list({ ordering: "-created_at", page_size: 50 })
        .then((data) => {
          const items = api.extractItems(data);
          normalizedCases = Array.isArray(items)
            ? items.map((item) => normalizeCase(item))
            : [];
          applyFilters();
        })
        .catch((error) => {
          console.error("[chuyenvien] Lỗi tải hồ sơ công việc:", error);
          renderErrorRow(helpers.resolveErrorMessage(error));
        });
    }

    function normalizeCase(raw) {
      if (!raw || typeof raw !== "object") {
        return createEmptyCase();
      }
      const statusName =
        raw.status_name ||
        raw.status?.name ||
        raw.status?.code ||
        "Chưa xác định";
      const leaderName = raw.leader?.full_name || raw.leader?.username || "—";
      const department = raw.department?.name || "";
      const createdAt = shortDate(raw.created_at);
      const dueDate = shortDate(raw.deadline);
      const priority = raw.priority || "Thường";
      const description =
        raw.goal || raw.instruction || department || "—";
      const progressPercent = computeProgressPercent(raw);
      const normalizedStatus = helpers.normalizeText(statusName);
      const isDone = /hoan thanh|da hoan thanh|done|completed|dong/.test(
        normalizedStatus
      );
      const dueTimestamp = parseDate(raw.deadline);
      const isOverdue =
        Boolean(dueTimestamp) && Date.now() > dueTimestamp && !isDone;
      const searchText = helpers.normalizeText(
        [raw.title, leaderName, department, statusName, description]
          .filter(Boolean)
          .join(" ")
      );

      return {
        id: raw.id,
        title: raw.title || "Hồ sơ công việc",
        department,
        leaderName,
        statusName,
        priority,
        createdAt,
        dueDate,
        progressPercent,
        description,
        isDone,
        isOverdue,
        searchText,
      };
    }

    function createEmptyCase() {
      return {
        id: null,
        title: "Hồ sơ công việc",
        department: "",
        leaderName: "",
        statusName: "",
        priority: "",
        createdAt: "",
        dueDate: "",
        progressPercent: 0,
        description: "",
        isDone: false,
        isOverdue: false,
        searchText: "",
      };
    }

    function shortDate(value) {
      if (!value) return "";
      if (typeof value === "string") {
        return value.slice(0, 10);
      }
      const timestamp = parseDate(value);
      return timestamp ? new Date(timestamp).toISOString().slice(0, 10) : "";
    }

    function parseDate(value) {
      if (!value) return null;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      return date.getTime();
    }

    function computeProgressPercent(raw) {
      if (!raw) return 0;
      const created = parseDate(raw.created_at);
      const due = parseDate(raw.deadline);
      if (!created || !due) {
        const statusKey = helpers.normalizeText(raw.status_name);
        if (/hoan thanh|done|completed/.test(statusKey)) {
          return 100;
        }
        return 0;
      }
      const total = due - created;
      if (total <= 0) {
        return created >= due ? 100 : 0;
      }
      const now = Date.now();
      const percent = Math.round(((now - created) / total) * 100);
      return Math.max(0, Math.min(100, percent));
    }

    function applyFilters() {
      if (!normalizedCases.length) {
        renderEmptyRow();
        updateSummaryCount(summary, 0);
        if (rowCounter) rowCounter.textContent = "0";
        updateKPIs([]);
        return;
      }

      const keyword = state.keyword || "";
      const normalizedKeyword = helpers.normalizeText(keyword);
      const filtered = normalizedCases.filter((item) => {
        if (state.status !== "all" && state.status) {
          if (!matchesStatusFilter(item)) {
            return false;
          }
        }
        if (state.priority !== "all" && state.priority) {
          if (!matchesPriorityFilter(item)) {
            return false;
          }
        }
        if (
          normalizedKeyword &&
          normalizedKeyword.length &&
          !item.searchText.includes(normalizedKeyword)
        ) {
          return false;
        }
        return true;
      });

      if (!filtered.length) {
        renderEmptyRow();
      } else {
        renderRows(filtered);
      }

      updateSummaryCount(summary, filtered.length);
      if (rowCounter) {
        rowCounter.textContent = String(filtered.length);
      }
      updateKPIs(filtered);
    }

    function matchesStatusFilter(item) {
      if (!item.statusName) return false;
      const text = helpers.normalizeText(item.statusName);
      return text.includes(state.status);
    }

    function matchesPriorityFilter(item) {
      if (!item.priority) return false;
      const text = helpers.normalizeText(item.priority);
      return text.includes(state.priority);
    }

    function renderRows(list) {
      tbody.innerHTML = "";
      const fragment = document.createDocumentFragment();
      list.forEach((item) => {
        fragment.appendChild(createRow(item));
      });
      tbody.appendChild(fragment);
    }

    function createRow(item) {
      const tr = document.createElement("tr");
      tr.className = "border-b border-slate-100 bg-white";
      tr.dataset.caseId = item.id ? String(item.id) : "";
      tr.dataset.caseTitle = item.title || "";
      tr.dataset.caseStatus = item.statusName || "";
      tr.dataset.casePriority = item.priority || "";
      tr.dataset.caseDepartment = item.department || "";

      // Determine role prefix from current path (default to 'chuyenvien')
      const pathPrefix = window.location.pathname.split('/')[1] || 'chuyenvien';
      const detailHref = `/${pathPrefix}/hosocongviec/${encodeURIComponent(
        item.id || ""
      )}/`;
      const progressPercent = Math.max(
        0,
        Math.min(100, Math.round(item.progressPercent ?? 0))
      );
      const progressBar = `
        <div class="w-28 h-2 rounded-full bg-slate-200">
          <div
            class="h-full bg-slate-700 rounded-full"
            style="width:${progressPercent}%;"
          ></div>
        </div>
        <div class="text-xs text-slate-500 mt-1">${progressPercent}% tiến độ</div>
      `;

      tr.innerHTML = [
        '<td class="py-3 pr-3 align-top">',
        '  <div class="font-medium break-words">',
        `    <a href="${helpers.escapeHtml(
          detailHref
        )}" class="text-blue-700 hover:underline flex flex-wrap items-center gap-2">`,
        '      <span class="badge-dot bg-blue-600"></span>',
        `      ${helpers.escapeHtml(item.title || "Hồ sơ công việc")}`,
        "    </a>",
        "  </div>",
        item.description
          ? `  <div class="text-xs text-slate-500">${helpers.escapeHtml(
              item.description
            )}</div>`
          : "",
        "</td>",
        `<td class="py-3 pr-3 whitespace-nowrap align-top">${helpers.escapeHtml(
          item.leaderName || "—"
        )}</td>`,
        `<td class="py-3 pr-3 whitespace-nowrap align-top">${helpers.escapeHtml(
          item.createdAt
        )}</td>`,
        `<td class="py-3 pr-3 whitespace-nowrap text-rose-600 font-medium align-top">${helpers.escapeHtml(
          item.dueDate || ""
        )}</td>`,
        `<td class="py-3 pr-3 align-top">${progressBar}</td>`,
        '<td class="py-3 pr-3 whitespace-nowrap align-top">',
        '  <span class="chip chip--default" data-priority-chip></span>',
        "</td>",
        '<td class="py-3 pr-3 whitespace-nowrap align-top">',
        '  <span class="chip chip--default" data-status-chip></span>',
        "</td>",
        '<td class="py-3 pr-0 text-right align-top">',
        '  <div class="flex items-center justify-end gap-2">',
        `    <a href="${helpers.escapeHtml(
          detailHref
        )}" class="btn-icon" title="Xem" data-open-case="${
          item.id || ""
        }">`,
        "      👁️",
        "    </a>",
        "  </div>",
        "</td>",
      ].join("");

      const priorityChip = tr.querySelector("[data-priority-chip]");
      applyCasePriorityChip(priorityChip, item.priority);

      const statusChip = tr.querySelector("[data-status-chip]");
      applyCaseStatusChip(statusChip, item.statusName);

      return tr;
    }

    function renderLoading() {
      tbody.innerHTML =
        '<tr><td colspan="8" class="py-6 text-center text-sm text-slate-500">Đang tải danh sách hồ sơ...</td></tr>';
    }

    function renderEmptyRow() {
      tbody.innerHTML =
        '<tr><td colspan="8" class="py-6 text-center text-sm text-slate-500">Không tìm thấy hồ sơ phù hợp.</td></tr>';
    }

    function renderErrorRow(message) {
      tbody.innerHTML = `<tr><td colspan="8" class="py-6 text-center text-sm text-rose-600">${helpers.escapeHtml(
        message
      )}</td></tr>`;
      if (rowCounter) rowCounter.textContent = "0";
      updateSummaryCount(summary, 0);
      updateKPIs([]);
    }

  function updateKPIs(list) {
    const total = list.length;
    const done = list.filter((item) => item.isDone).length;
    const overdue = list.filter((item) => item.isOverdue).length;
    const inProgress = total - done;
      if (kpiEls.total) kpiEls.total.textContent = String(total);
      if (kpiEls.inProgress)
        kpiEls.inProgress.textContent = String(Math.max(inProgress, 0));
      if (kpiEls.done) kpiEls.done.textContent = String(done);
    if (kpiEls.overdue) kpiEls.overdue.textContent = String(overdue);
  }
}

  function initHoSoCongViecDetail() {
    const api = window.ApiClient;
    const helpers = window.DocHelpers;
    if (!api || !helpers) {
      console.warn(
        "[chuyenvien] ApiClient hoặc DocHelpers chưa sẵn sàng; bỏ qua chi tiết hồ sơ công việc."
      );
      return;
    }

    // Extract case ID from URL path or query parameter
    // Supports both: /chuyenvien/hosocongviec/44/ and /chuyenvien/hosocongviec-detail.html?id=44
    const searchParams = new URLSearchParams(location.search);
    let caseId = null;
    
    // First try to get from path (e.g., /chuyenvien/hosocongviec/44/)
    const pathMatch = location.pathname.match(/\/hosocongviec\/(\d+)\/?$/);
    if (pathMatch) {
      caseId = pathMatch[1];
    }
    
    // Fallback to query parameter for backward compatibility
    if (!caseId) {
      caseId = searchParams.get("id");
    }
    
    // Declare errorBox early to avoid temporal dead zone error
    const errorBox = document.querySelector("[data-case-error]");
    
    if (!caseId) {
      return showCaseError("Thiếu mã hồ sơ để hiển thị chi tiết.");
    }

    const summaryTitleEls = document.querySelectorAll("[data-case-title]");
    const descriptionEl = document.querySelector("[data-case-description]");
    const statusChipEl = document.querySelector("[data-case-status-chip]");
    const priorityChipEl = document.querySelector("[data-case-priority-chip]");
    const codeEls = document.querySelectorAll("[data-case-code]");
    const departmentEl = document.querySelector("[data-case-department]");
    const leaderEl = document.querySelector("[data-case-leader]");
    const assigneeEl = document.querySelector("[data-case-assignee]");
    const deadlineEl = document.querySelector("[data-case-deadline]");
    const createdEl = document.querySelector("[data-case-created]");
    const taskCountEl = document.querySelector("[data-case-task-count]");
    const membersBody = document.querySelector("[data-case-members]");
    const tasksList = document.querySelector("[data-case-tasks]");
    const activityList = document.querySelector("[data-case-activity]");
    const docsList = document.querySelector("[data-case-docs]");
    const metrics = {
      completed: document.querySelector("[data-case-metric='tasks-completed']"),
      overdue: document.querySelector("[data-case-metric='tasks-overdue']"),
      open: document.querySelector("[data-case-metric='tasks-open']"),
      docs: document.querySelector("[data-case-metric='docs-count']"),
    };
    loadCaseDetail();

    function loadCaseDetail() {
      clearError();
      
      // Get case data from DOM (server-rendered)
      const caseRoot = document.querySelector("#case-detail-root");
      if (!caseRoot) {
        return showCaseError("Không tìm thấy thông tin hồ sơ trên trang.");
      }
      
      // Extract case data from DOM elements
      const caseData = extractCaseDataFromDOM();
      if (!caseData) {
        return showCaseError("Không thể đọc dữ liệu hồ sơ.");
      }
      
      // Render case summary from DOM data
      renderCaseSummary(caseData);
      
      // Load sub-resources via API
      renderMembersPlaceholder();
      renderTasksMessage("Đang tải nhiệm vụ...");
      renderActivityMessage("Đang tải nhật ký hoạt động...");
      renderDocsMessage("Đang tải văn bản liên quan...");

      Promise.allSettled([
        api.cases.tasks(caseId),
        api.cases.activityLogs(caseId),
        api.cases.documents(caseId),
      ])
        .then(([tasksResult, logsResult, docsResult]) => {
          if (tasksResult.status === "fulfilled") {
            renderTasks(tasksResult.value);
          } else {
            console.error("Lỗi tải nhiệm vụ:", tasksResult.reason);
            renderTasks([]);
          }

          if (logsResult.status === "fulfilled") {
            renderActivity(logsResult.value);
          } else {
            console.error("Lỗi tải nhật ký:", logsResult.reason);
            renderActivity([]);
          }

          if (docsResult.status === "fulfilled") {
            renderDocs(docsResult.value);
          } else {
            console.error("Lỗi tải văn bản liên quan:", docsResult.reason);
            renderDocs([]);
          }
        })
        .catch((error) => {
          console.error("Lỗi hiển thị chi tiết hồ sơ:", error);
          showCaseError(helpers.resolveErrorMessage(error));
        });
    }
    
    function extractCaseDataFromDOM() {
      // Extract data from rendered template
      const titleEl = document.querySelector("[data-case-title]");
      const descriptionEl = document.querySelector("[data-case-description]");
      const statusChipEl = document.querySelector("[data-case-status-chip]");
      const priorityChipEl = document.querySelector("[data-case-priority-chip]");
      const codeEl = document.querySelector("[data-case-code]");
      const departmentEl = document.querySelector("[data-case-department]");
      const leaderEl = document.querySelector("[data-case-leader]");
      const assigneeEl = document.querySelector("[data-case-assignee]");
      const deadlineEl = document.querySelector("[data-case-deadline]");
      const createdEl = document.querySelector("[data-case-created]");
      
      return {
        case_id: caseId,
        id: caseId,
        title: titleEl?.textContent?.trim() || "Hồ sơ công việc",
        description: descriptionEl?.textContent?.trim() || "",
        status_name: statusChipEl?.textContent?.trim() || "",
        priority: priorityChipEl?.textContent?.trim() || "Thường",
        case_code: codeEl?.textContent?.trim() || "",
        department: { name: departmentEl?.textContent?.trim() || "—" },
        leader: { full_name: leaderEl?.textContent?.trim() || "—" },
        assignees: assigneeEl?.textContent?.trim() ? [{ full_name: assigneeEl.textContent.trim() }] : [],
        due_date: deadlineEl?.textContent?.trim() || null,
        created_at: createdEl?.textContent?.trim() || null,
        tasks: [],
      };
    }

    function renderCaseSummary(data) {
      if (!data) {
        return showCaseError("Không tìm thấy dữ liệu hồ sơ.");
      }
      const title = data.title || "Hồ sơ công việc";
      const description =
        data.goal ||
        data.instruction ||
        data.description ||
        "Không có mô tả thêm.";
      const statusName = data.status_name;
      const priorityLabel = data.priority || "Thường";
      const code = data.case_code || data.id || "";
      const department = data.department?.name || "—";
      const leaderName = data.leader?.full_name || data.leader?.username || "—";
      const assigneeName =
        data.assignees?.[0]?.full_name ||
        data.assignees?.[0]?.username ||
        assigneeEl?.textContent ||
        "Chưa phân công";
      const deadline = formatDateValue(data.due_date || data.deadline);
      const created = formatDateValue(data.created_at);
      const tasksCount = Array.isArray(data.tasks) ? data.tasks.length : data.assignees?.length || 0;

      summaryTitleEls.forEach((el) => (el.textContent = title));
      if (descriptionEl) descriptionEl.textContent = description;
      if (codeEls.length) {
        codeEls.forEach((el) => (el.textContent = code));
      }
      if (departmentEl) departmentEl.textContent = department;
      if (leaderEl) leaderEl.textContent = leaderName;
      if (assigneeEl) assigneeEl.textContent = assigneeName;
      if (deadlineEl) deadlineEl.textContent = deadline || "—";
      if (createdEl) createdEl.textContent = created || "—";
      if (taskCountEl) taskCountEl.textContent = `${tasksCount} nhiệm vụ`;

      if (statusChipEl) {
        const statusText = statusName || data.status?.name || data.status?.code || "Chưa xác định";
        applyCaseStatusChip(statusChipEl, statusText);
      }
      if (priorityChipEl) {
        applyCasePriorityChip(priorityChipEl, priorityLabel);
      }

      renderMembers(data);
    }

    function renderMembersPlaceholder() {
      if (!membersBody) return;
      membersBody.innerHTML = `
        <tr>
          <td colspan="4" class="px-5 py-8 text-center text-sm text-slate-500">
            Đang tải thành viên...
          </td>
        </tr>
      `;
    }

    function renderMembers(caseData) {
      if (!membersBody) return;
      const department = caseData.department?.name || "—";
      const rows = [];
      if (caseData.leader) {
        rows.push(createMemberRow(caseData.leader, "Chủ trì", department));
      }
      const assignees = Array.isArray(caseData.assignees) ? caseData.assignees : [];
      assignees.forEach((user) => {
        rows.push(createMemberRow(user, "Chuyên viên", department));
      });
      if (!rows.length) {
        membersBody.innerHTML = `
          <tr>
            <td colspan="4" class="px-5 py-8 text-center text-sm text-slate-500">
              Chưa có thành viên tham gia.
            </td>
          </tr>
        `;
        return;
      }
      membersBody.innerHTML = rows.join("");
    }

    function createMemberRow(user, role, unit) {
      const name =
        user?.full_name || user?.name || user?.username || "Người dùng";
      return [
        '<tr class="border-b border-slate-100">',
        `  <td class="px-5 py-3">${helpers.escapeHtml(name)}</td>`,
        `  <td class="px-5 py-3"><span class="chip chip--blue">${helpers.escapeHtml(
          role
        )}</span></td>`,
        `  <td class="px-5 py-3">${helpers.escapeHtml(unit)}</td>`,
        '  <td class="px-5 py-3">—</td>',
        "</tr>",
      ].join("");
    }

    function renderTasks(list) {
      const tasks = Array.isArray(list) ? list : [];
      if (!tasksList) return;
      if (!tasks.length) {
        renderTasksMessage("Hiện chưa có nhiệm vụ.");
        updateTaskMetrics(tasks);
        return;
      }
      tasksList.innerHTML = "";
      const fragment = document.createDocumentFragment();
      tasks.forEach((task) => {
        const li = document.createElement("li");
        li.className = "rounded-lg border border-slate-100 p-3";
        const status = (task.status || "OPEN").toUpperCase();
        const statusLabel = mapTaskStatus(status);
        const statusClass = mapTaskStatusClass(status);
        const dueText = task.due_at ? formatDateValue(task.due_at) : "";
        const assignee =
          task.assignee?.full_name ||
          task.assignee?.username ||
          "Chưa có người đảm nhiệm";
        li.innerHTML = [
          '<div class="flex items-center justify-between gap-2">',
          '  <div>',
          `    <div class="font-medium text-slate-700">${helpers.escapeHtml(
            task.title || "Nhiệm vụ mới"
          )}</div>`,
          `    <div class="text-[12px] text-slate-500">` +
            (dueText
              ? `Hạn: ${helpers.escapeHtml(dueText)} • `
              : "Hạn: Chưa rõ • ") +
            `Người giao: ${helpers.escapeHtml(assignee)}</div>`,
          "  </div>",
          `  <span class="${statusClass}">${helpers.escapeHtml(statusLabel)}</span>`,
          "</div>",
          task.note
            ? `<p class="mt-2 text-[12px] text-slate-500">${helpers.escapeHtml(
                task.note
              )}</p>`
            : "",
        ].join("");
        fragment.appendChild(li);
      });
      tasksList.innerHTML = "";
      tasksList.appendChild(fragment);
      updateTaskMetrics(tasks);
    }

    function renderTasksMessage(message) {
      if (!tasksList) return;
      tasksList.innerHTML = `
        <li class="rounded-lg border border-slate-100 p-3 text-center text-sm text-slate-500">
          ${helpers.escapeHtml(message)}
        </li>
      `;
      updateTaskMetrics([]);
    }

    function renderActivity(list) {
      const logs = Array.isArray(list) ? list : [];
      if (!activityList) return;
      if (!logs.length) {
        activityList.innerHTML = `
          <li class="rounded-lg border border-slate-100 p-3 text-center text-sm text-slate-500">
            Chưa có nhật ký.
          </li>
        `;
        return;
      }
      activityList.innerHTML = "";
      const fragment = document.createDocumentFragment();
      logs.forEach((log) => {
        const li = document.createElement("li");
        li.className = "rounded-lg border border-slate-100 p-3";
        const actor =
          log.actor?.full_name || log.actor?.username || "Hệ thống";
        const at = log.at ? formatDateValue(log.at, true) : "—";
        const note = log.note || log.meta?.note || "";
        const action = mapActivityAction(log.action);
        li.innerHTML = [
          '<div class="flex items-center justify-between">',
          `  <span class="font-semibold text-slate-700">${helpers.escapeHtml(
            at
          )} • ${helpers.escapeHtml(action)}</span>`,
          `  <span class="text-[12px] text-slate-500">${helpers.escapeHtml(
            actor
          )}</span>`,
          "</div>",
          note
            ? `<p class="mt-1 text-[12.5px] text-slate-600">${helpers.escapeHtml(
                note
              )}</p>`
            : "",
        ].join("");
        fragment.appendChild(li);
      });
      activityList.appendChild(fragment);
    }

    function renderActivityMessage(message) {
      if (!activityList) return;
      activityList.innerHTML = `
        <li class="rounded-lg border border-slate-100 p-3 text-center text-sm text-slate-500">
          ${helpers.escapeHtml(message)}
        </li>
      `;
    }

    function renderDocs(caseDocs) {
      const docs = Array.isArray(caseDocs) ? caseDocs : [];
      if (!docsList) return;
      if (!docs.length) {
        renderDocsMessage("Chưa có văn bản liên quan.");
        setMetric(metrics.docs, 0);
        return;
      }
      Promise.all(
        docs.map((entry) =>
          api.documents
            .retrieve(entry.document_id)
            .then((detail) => ({ entry, detail }))
            .catch(() => ({ entry, detail: null }))
        )
      ).then((items) => {
        docsList.innerHTML = "";
        const fragment = document.createDocumentFragment();
        items.forEach(({ entry, detail }) => {
          const li = document.createElement("li");
          li.className = "rounded-lg border border-slate-100 p-3";
          const direction =
            detail?.doc_direction ||
            detail?.direction ||
            detail?.docDirection ||
            "den";
          const docLabel =
            direction === "di" ? "Văn bản đi" : "Văn bản đến";
          const number =
            detail?.outgoing_number ||
            detail?.incoming_number ||
            detail?.document_code ||
            detail?.number ||
            `#${entry.document_id}`;
          const title =
            detail?.title ||
            detail?.summary ||
            number ||
            `Văn bản ${entry.document_id}`;
          const dateValue =
            detail?.issued_date ||
            detail?.received_date ||
            detail?.created_at ||
            detail?.published_date ||
            "";
          const dateLabel = dateValue ? formatDateValue(dateValue) : "—";
      const basePath =
        direction === "di"
          ? "/chuyenvien/vanbandi/"
          : "/chuyenvien/vanbanden/";
      const docId = entry.document_id || "";
      const href = docId
        ? `${basePath}${encodeURIComponent(docId)}/`
        : `${direction === "di" ? "vanbandi-detail.html" : "vanbanden-detail.html"}?id=${encodeURIComponent(
            docId
          )}`;
          li.innerHTML = [
            "<div class=\"flex items-center justify-between gap-3\">",
            "  <div>",
            `    <div class="font-medium text-slate-700">${helpers.escapeHtml(
              title
            )}</div>`,
            `    <div class="text-[12px] text-slate-500">${helpers.escapeHtml(
              docLabel
            )} • ${helpers.escapeHtml(dateLabel)}</div>`,
            "  </div>",
            `  <a class="text-sm font-medium text-blue-600 hover:underline" href="${helpers.escapeHtml(
              href
            )}">Xem</a>`,
            "</div>",
          ].join("");
          fragment.appendChild(li);
        });
        docsList.appendChild(fragment);
        setMetric(metrics.docs, items.length);
      });
    }

    function renderDocsMessage(message) {
      if (!docsList) return;
      docsList.innerHTML = `
        <li class="rounded-lg border border-slate-100 p-3 text-center text-sm text-slate-500">
          ${helpers.escapeHtml(message)}
        </li>
      `;
    }

    function updateTaskMetrics(tasks) {
      const total = tasks.length;
      const completed = tasks.filter((task) => task.status === "DONE").length;
      const overdue = tasks.filter((task) => isTaskOverdue(task)).length;
      const open = tasks.filter(
        (task) => task.status !== "DONE" && task.status !== "CANCELLED"
      ).length;
      setMetric(metrics.completed, `${completed} / ${total}`);
      setMetric(metrics.overdue, overdue);
      setMetric(metrics.open, open);
      if (taskCountEl) taskCountEl.textContent = `${total} nhiệm vụ`;
    }

    function setMetric(el, value) {
      if (!el) return;
      el.textContent = String(value);
    }

    function isTaskOverdue(task) {
      if (!task || !task.due_at) return false;
      const due = parseDate(task.due_at);
      if (!due) return false;
      if (task.status === "DONE" || task.status === "CANCELLED") return false;
      return Date.now() > due;
    }

    function mapTaskStatus(status) {
      switch (status) {
        case "IN_PROGRESS":
          return "Đang làm";
        case "DONE":
          return "Hoàn thành";
        case "CANCELLED":
          return "Hủy";
        default:
          return "Mới";
      }
    }

    function mapTaskStatusClass(status) {
      switch (status) {
        case "IN_PROGRESS":
          return "chip chip--amber";
        case "DONE":
          return "chip chip--green";
        case "CANCELLED":
          return "chip chip--rose";
        default:
          return "chip chip--default";
      }
    }

    function mapActivityAction(raw) {
      if (!raw) return "Hoạt động";
      const key = raw.toUpperCase();
      const actionLabels = {
        CREATE: "Tạo hồ sơ",
        UPDATE: "Cập nhật",
        CLOSE: "Đóng hồ sơ",
        REOPEN: "Mở lại",
        ASSIGN: "Phân công",
      };
      return actionLabels[key] || key;
    }

    function formatDateValue(value, includeTime = false) {
      if (!value) return "";
      if (includeTime) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleString("vi-VN");
      }
      if (typeof value === "string") {
        const pure = value.split("T")[0];
        if (pure) {
          return helpers.formatDate(pure);
        }
      }
      const parsed = parseDate(value);
      if (!parsed) return "";
      return helpers.formatDate(new Date(parsed).toISOString().slice(0, 10));
    }

    function parseDate(value) {
      if (!value) return null;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      return date.getTime();
    }

    function showCaseError(message) {
      if (errorBox) {
        errorBox.textContent = message || "Không thể tải chi tiết hồ sơ.";
        errorBox.classList.remove("hidden");
      }
    }

    function clearError() {
      if (errorBox) {
        errorBox.textContent = "";
        errorBox.classList.add("hidden");
      }
    }
  }

  function initVanBanDiCreate() {
    if (!document.body) return;
    if (!document.body.dataset.role) {
      document.body.dataset.role = "CV";
    }
    document.body.dataset.feature = "outgoing-create";
    if (document.body.dataset.cvDraftShortcut === "true") return;

    const handleShortcut = (event) => {
      const key = (event.key || "").toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "s") {
        event.preventDefault();
        document
          .querySelector('[data-action="save-draft"]')
          ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    };

    document.addEventListener("keydown", handleShortcut);
    document.body.dataset.cvDraftShortcut = "true";

    const api = window.ApiClient;
    const helpers = window.DocHelpers;
    const form = document.getElementById("draftForm");
    const feedbackEl = document.getElementById("draftFeedback");
    const saveBtn = document.querySelector('[data-action="save-draft"]');
    const submitBtn = document.querySelector('[data-action="submit-approval"]');
    const previewBtn = document.querySelector('[data-action="preview-draft"]');
    const docIdInput = document.getElementById("draftDocumentId");
    if (!api || !helpers || !form || !saveBtn || !submitBtn) {
      return;
    }
    const docApi = api.documents;
    if (!docApi) {
      console.warn("[chuyenvien] Document API chưa sẵn sàng; bỏ qua thao tác dự thảo.");
      return;
    }
    const draftEndpoint = form.getAttribute("action") || "/chuyenvien/vanbandi-taomoi/";

    const releaseFields = {
      issueNumber: form.querySelector("[data-field='issue-number']"),
      dispatchAt: form.querySelector("[data-field='dispatch-at']"),
      dispatchMethod: form.querySelector("[data-field='dispatch-method']"),
      dispatchStatus: form.querySelector("[data-field='dispatch-status']"),
    };
    const noteInput = document.querySelector('[data-action="note-input"]');
    const noteAddButton = document.querySelector('[data-action="add-note"]');
    const noteList = document.getElementById("noteList");
    const noteMessageEl = document.getElementById("ld-comment-message");
    const attachmentList = document.getElementById("attachmentList");
    const fileInput = document.getElementById("fileDraft");
    const uploadAttachmentBtn = document.querySelector('[data-action="upload-attachment"]');
    const auditList = document.getElementById("auditList");
    const approvalSteps = document.getElementById("approvalStepsEdit");
    form.action = draftEndpoint;

    let saving = false;

    const setFeedback = (message, tone = "info") => {
      if (!feedbackEl) return;
      const toneClass =
        tone === "error"
          ? "text-rose-600"
          : tone === "success"
          ? "text-emerald-600"
          : "text-slate-600";
      feedbackEl.className =
        "rounded-md border px-3 py-2 text-[13px] " +
        (tone === "error"
          ? "border-rose-100 bg-rose-50"
          : tone === "success"
          ? "border-emerald-100 bg-emerald-50"
          : "border-slate-100 bg-slate-50");
      feedbackEl.classList.add(toneClass);
      if (!message) {
        feedbackEl.classList.add("hidden");
        feedbackEl.textContent = "";
        return;
      }
      feedbackEl.classList.remove("hidden");
      feedbackEl.textContent = message;
    };

    const collectPayload = () => {
      const formData = new FormData(form);
      const pick = (name) => (formData.get(name) || "").toString().trim();
      const recipients = (pick("receivers") || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      return {
        doc_direction: "du_thao",
        title: pick("title"),
        document_code: pick("code"),
        document_type_name: pick("doc_type"),
        field: pick("field"),
        department_name: pick("department"),
        owner: pick("owner"),
        urgency_level: pick("urgency"),
        security_level: pick("security"),
        receivers: recipients,
        due_date: pick("due_sign") || null,
        expected_finish: pick("due_issue") || null,
        summary: pick("abstract"),
        content: pick("quick_content"),
      };
    };

    const validatePayload = (payload) => {
      const result = helpers.validateDocumentPayload
        ? helpers.validateDocumentPayload(payload)
        : { isValid: Boolean(payload.title) };
      if (!result.isValid) {
        const message = Array.isArray(result.errors)
          ? result.errors.join(" ")
          : "Thông tin dự thảo chưa hợp lệ.";
        setFeedback(message, "error");
        return false;
      }
      return true;
    };

    const urlParams = new URLSearchParams(window.location.search);
    const initialDocId =
      (docIdInput?.value?.trim() || "") ||
      urlParams.get("document_id") ||
      urlParams.get("documentId") ||
      document.body?.dataset?.documentId ||
      document.body?.dataset?.docId ||
      "";
    let currentDocId = initialDocId ? String(initialDocId).trim() : "";
    if (docIdInput) docIdInput.value = currentDocId;

    const getDocId = () => currentDocId;
    const setDocId = (value) => {
      currentDocId = value ? String(value).trim() : "";
      if (docIdInput) docIdInput.value = currentDocId;
    };

    async function persistDraft(showToastOnSuccess = true) {
      if (saving) {
        return getDocId();
      }
      const payload = collectPayload();
      if (!validatePayload(payload)) {
        return null;
      }
      saving = true;
      setFeedback("Đang lưu dự thảo...", "info");
      try {
        const currentId = getDocId();
        const payloadWithDefaults = { ...payload };
        if (!payloadWithDefaults.receivers?.length) {
          delete payloadWithDefaults.receivers;
        }
        const response = currentId
          ? await api.documents.update(currentId, payloadWithDefaults)
          : await api.documents.create(payloadWithDefaults);
        const newId =
          response?.document_id ||
          response?.documentId ||
          response?.id ||
          currentId;
        if (newId) {
          setDocId(String(newId));
          await refreshDraftView();
        }
        if (showToastOnSuccess) {
          setFeedback("Đã lưu dự thảo.", "success");
          showToast("Đã lưu dự thảo văn bản.");
        } else {
          setFeedback("", "info");
        }
        return newId;
      } catch (error) {
        console.error("[chuyenvien] Lỗi lưu dự thảo:", error);
        setFeedback(helpers.resolveErrorMessage(error), "error");
        return null;
      } finally {
        saving = false;
      }
    }

    saveBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      await persistDraft();
    });

    submitBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      const submitFn =
        api?.documents && typeof api.documents.submit === "function"
          ? api.documents.submit
          : null;
      if (!submitFn) {
        setFeedback(
          "Trình ký dự thảo đang chạy qua giao diện Văn bản và Quy trình.",
          "warn"
        );
        return;
      }
      const draftId = await persistDraft(false);
      if (!draftId) {
        setFeedback("Chưa có dữ liệu để trình ký.", "error");
        return;
      }
      try {
        const comment =
          form.elements?.abstract?.value?.trim() ||
          "Trình duyệt dự thảo từ giao diện chuyên viên.";
        await submitFn(draftId, { note: comment });
        return;
      } catch (error) {
        console.error("[chuyenvien] Lỗi trình ký:", error);
        setFeedback(helpers.resolveErrorMessage(error), "error");
      }
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      saveBtn.click();
    });

    previewBtn?.addEventListener("click", async (event) => {
      event.preventDefault();
      const draftId = await persistDraft(false);
      if (draftId) {
        showToast("Đã cập nhật dự thảo, vui lòng mở bản PDF để xem trước.");
      }
    });

    const commentApi = api.comments;
    const refreshLogsBtn = document.querySelector('[data-action="refresh-logs"]');
    const setNoteMessage = (text = "", isError = false) => {
      if (!noteMessageEl) return;
      noteMessageEl.textContent = text;
      noteMessageEl.classList.toggle("text-rose-500", Boolean(isError));
      noteMessageEl.classList.toggle("text-emerald-600", Boolean(text) && !isError);
    };

    noteAddButton?.addEventListener("click", async () => {
      const docId = getDocId();
      if (!docId) {
        setNoteMessage("Phải lưu dự thảo để thêm ghi chú.", true);
        return;
      }
      const text = noteInput?.value?.trim();
      if (!text) {
        setNoteMessage("Ghi chú không được để trống.", true);
        return;
      }
      setNoteMessage("Đang gửi ghi chú...");
      const payload = { entity_type: "document", entity_id: Number(docId), content: text };
      const sender = commentApi?.create
        ? commentApi.create(payload)
        : api.request("/api/v1/comments/", {
            method: "POST",
            body: payload,
          });
      try {
        await sender;
        noteInput.value = "";
        setNoteMessage("Đã lưu ghi chú.", false);
        await loadDraftComments(docId);
      } catch (error) {
        console.error("[chuyenvien] Lỗi gửi ghi chú:", error);
        setNoteMessage(helpers.resolveErrorMessage(error), true);
      }
    });

    uploadAttachmentBtn?.addEventListener("click", () => {
      fileInput?.click();
    });

    fileInput?.addEventListener("change", async (event) => {
      const docId = getDocId();
      if (!docId) {
        setFeedback("Phải lưu dự thảo trước khi đính kèm.", "error");
        return;
      }
      const file = event.target.files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append("file", file);
      try {
        await docApi.uploadAttachment(docId, formData);
        await loadDraftAttachments(docId);
        showToast("Đã thêm tệp đính kèm.");
      } catch (error) {
        console.error("[chuyenvien] Lỗi upload tệp:", error);
        setFeedback(helpers.resolveErrorMessage(error), "error");
      } finally {
        event.target.value = "";
      }
    });

    attachmentList?.addEventListener("click", async (event) => {
      const target = event.target.closest("[data-action]");
      if (!target) return;
      const docId = getDocId();
      if (!docId) {
        setFeedback("Phải lưu dự thảo để thao tác tệp.", "error");
        return;
      }
      const action = target.dataset.action;
      const attachmentId = target.dataset.attachmentId;
      if (!attachmentId) return;
      if (action === "dl-attachment") {
        try {
          const url = docApi.attachmentDownloadUrl
            ? docApi.attachmentDownloadUrl(docId, attachmentId)
            : null;
          if (url) {
            window.open(url, "_blank");
          }
        } catch (error) {
          console.error("[chuyenvien] Lỗi tải xuống:", error);
        }
        return;
      }
      if (action === "rm-attachment") {
        try {
          await docApi.deleteAttachment(docId, attachmentId);
          await loadDraftAttachments(docId);
          showToast("Đã xóa tệp đính kèm.");
        } catch (error) {
          console.error("[chuyenvien] Lỗi xóa tệp:", error);
          setFeedback(helpers.resolveErrorMessage(error), "error");
        }
      }
    });

    refreshLogsBtn?.addEventListener("click", () => {
      const docId = getDocId();
      if (docId) {
        loadDraftLogs(docId);
      }
    });

    function formatDateValue(value, includeTime = false) {
      if (!value) return "";
      if (includeTime) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return date.toLocaleString("vi-VN");
      }
      if (typeof value === "string") {
        const pure = value.split("T")[0];
        if (pure) {
          return helpers.formatDate(pure);
        }
      }
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      return helpers.formatDate(
        new Date(date.getTime()).toISOString().slice(0, 10)
      );
    }

    async function refreshDraftView() {
      const docId = getDocId();
      if (!docId) return;
      try {
        const doc = await docApi.retrieve(docId);
        updateReleaseInfo(doc);
        await Promise.allSettled([
          loadDraftAttachments(docId),
          loadDraftLogs(docId),
          loadDraftComments(docId),
          loadDraftApprovals(docId),
        ]);
      } catch (error) {
        console.error("[chuyenvien] Lỗi tải dữ liệu dự thảo:", error);
      }
    }

    function updateReleaseInfo(doc) {
      if (releaseFields.issueNumber) {
        releaseFields.issueNumber.textContent =
          doc.issue_number || doc.document_code || "—";
      }
      if (releaseFields.dispatchAt) {
        releaseFields.dispatchAt.textContent = formatDateValue(
          doc.issued_date || doc.created_at
        ) || "—";
      }
      if (releaseFields.dispatchMethod) {
        releaseFields.dispatchMethod.textContent =
          doc.dispatch?.method ||
          doc.dispatch_method ||
          doc.delivery_method ||
          "—";
      }
      if (releaseFields.dispatchStatus) {
        releaseFields.dispatchStatus.textContent =
          doc.dispatch?.status || doc.status_name || "—";
      }
    }

    async function loadDraftAttachments(docId) {
      if (!docApi.attachments) return;
      try {
        const payload = await docApi.attachments(docId, {
          params: { exclude_log: 1 },
        });
        const items =
          Array.isArray(payload) || !payload
            ? payload
            : payload.items || payload.results || [];
        renderAttachmentsList(Array.isArray(items) ? items : []);
      } catch (error) {
        console.error("[chuyenvien] Lỗi tải đính kèm:", error);
        renderAttachmentsList([]);
      }
    }

    function renderAttachmentsList(list) {
      if (!attachmentList) return;
      const items = Array.isArray(list) ? list : [];
      if (!items.length) {
        attachmentList.innerHTML =
          '<li class="text-slate-500">Chưa có tệp đính kèm.</li>';
        return;
      }
      attachmentList.innerHTML = items
        .map((item) => {
          const id = item.id || item.attachment_id;
          const name =
            item.name || item.file_name || item.filename || "Tệp đính kèm";
          const uploadedAt =
            formatDateValue(item.uploaded_at || item.created_at) || "—";
          const uploader =
            item.uploaded_by?.full_name ||
            item.uploaded_by?.username ||
            "Người dùng";
          return `<li class="rounded-lg border border-slate-100 p-3 flex items-center justify-between gap-3">
            <div>
              <div class="font-medium text-slate-700">${helpers.escapeHtml(name)}</div>
              <div class="text-[12px] text-slate-500">Tải lên: ${helpers.escapeHtml(
                uploader
              )} • ${helpers.escapeHtml(uploadedAt)}</div>
            </div>
            <div class="flex items-center gap-2">
              <button type="button" class="btn-icon" data-action="dl-attachment" data-attachment-id="${helpers.escapeHtml(
                String(id || "")
              )}">⬇</button>
              <button type="button" class="btn-icon text-rose-500" data-action="rm-attachment" data-attachment-id="${helpers.escapeHtml(
                String(id || "")
              )}">✖</button>
            </div>
          </li>`;
        })
        .join("");
    }

    async function loadDraftLogs(docId) {
      if (!docApi.workflowLogs) return;
      try {
        const payload = await docApi.workflowLogs(docId);
        const items =
          Array.isArray(payload) || !payload
            ? payload
            : payload.items || payload.results || [];
        renderAuditList(Array.isArray(items) ? items : []);
      } catch (error) {
        console.error("[chuyenvien] Lỗi tải nhật ký:", error);
        renderAuditList([]);
      }
    }

    function renderAuditList(list) {
      if (!auditList) return;
      const items = Array.isArray(list) ? list : [];
      if (!items.length) {
        auditList.innerHTML =
          '<li class="text-slate-500">Chưa có nhật ký thao tác.</li>';
        return;
      }
      auditList.innerHTML = items
        .map((entry) => {
          const actor =
            entry.actor?.full_name ||
            entry.actor?.username ||
            entry.user?.full_name ||
            "Hệ thống";
          const action = entry.action || entry.note || "Hoạt động";
          const time =
            formatDateValue(entry.acted_at || entry.created_at, true) || "—";
          const note = entry.note || entry.detail || "";
          const from = entry.from_status || entry.from_status_name || "";
          const to = entry.to_status || entry.to_status_name || "";
          return `<li class="rounded-lg border border-slate-100 p-3 space-y-1 text-[13px]">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-slate-800">${helpers.escapeHtml(
                action
              )}</span>
              <span class="text-[12px] text-slate-500">${helpers.escapeHtml(
                time
              )}</span>
            </div>
            ${note ? `<p class="text-[12px] text-slate-500">${helpers.escapeHtml(note)}</p>` : ""}
            ${(from || to)
              ? `<div class="text-[12px] text-slate-400">Từ ${helpers.escapeHtml(
                  from
                )} → ${helpers.escapeHtml(to)}</div>`
              : ""}
            <div class="text-[12px] text-slate-400">Thực hiện bởi ${helpers.escapeHtml(
              actor
            )}</div>
          </li>`;
        })
        .join("");
    }

    async function loadDraftComments(docId) {
      if (!noteList) return;
      const params = { entity_type: "document", entity_id: Number(docId) };
      try {
        const payload = commentApi?.list
          ? await commentApi.list(params)
          : await api.request(api.buildUrl("/api/v1/comments/", params));
        const items =
          Array.isArray(payload) || !payload
            ? payload
            : payload.items || payload.results || [];
        renderNotes(Array.isArray(items) ? items : []);
      } catch (error) {
        console.error("[chuyenvien] Lỗi tải ghi chú:", error);
        renderNotes([]);
      }
    }

    function renderNotes(list) {
      if (!noteList) return;
      const entries = Array.isArray(list) ? list : [];
      if (!entries.length) {
        noteList.innerHTML =
          '<li class="text-slate-500">Chưa có ghi chú.</li>';
        return;
      }
      noteList.innerHTML = entries
        .map((entry) => {
          const author =
            entry.user?.full_name ||
            entry.user?.username ||
            entry.actor?.full_name ||
            "Người dùng";
          const at = formatDateValue(entry.created_at || entry.createdAt, true) || "—";
          return `<li class="rounded-lg border border-slate-100 p-3 text-[13px]">
            <div class="flex items-center justify-between">
              <span class="font-medium text-slate-700">${helpers.escapeHtml(author)}</span>
              <span class="text-[12px] text-slate-400">${helpers.escapeHtml(at)}</span>
            </div>
            <p class="mt-1 text-[12.5px] text-slate-600">${helpers.escapeHtml(
              entry.content || entry.note || entry.message || ""
            )}</p>
          </li>`;
        })
        .join("");
    }

    async function loadDraftApprovals(docId) {
      if (!docApi.approvals) return;
      try {
        const payload = await docApi.approvals(docId);
        const items =
          Array.isArray(payload) || !payload
            ? payload
            : payload.items || payload.results || [];
        renderApprovalSteps(Array.isArray(items) ? items : []);
      } catch (error) {
        console.error("[chuyenvien] Lỗi tải luồng duyệt:", error);
      }
    }

    function renderApprovalSteps(list) {
      if (!approvalSteps) return;
      const entries = Array.isArray(list) ? list : [];
      if (!entries.length) {
        approvalSteps.innerHTML =
          '<li class="text-slate-500">Chưa có bước duyệt.</li>';
        return;
      }
      approvalSteps.innerHTML = entries
        .map((step, index) => {
          const title =
            step.name ||
            step.label ||
            step.user?.full_name ||
            `Bước ${index + 1}`;
          const desc = step.instruction || step.note || step.summary || "";
          const status = step.status?.name || step.status || "Chưa xử lý";
          const due = formatDateValue(step.due_at || step.due_date, false) || "—";
          return `<li class="rounded-lg border border-slate-100 p-3 space-y-1">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-slate-800">${helpers.escapeHtml(title)}</span>
              <span class="text-[12px] text-slate-500">${helpers.escapeHtml(status)}</span>
            </div>
            <p class="text-[12px] text-slate-500">${helpers.escapeHtml(desc)}</p>
            <div class="flex items-center justify-between text-[12px] text-slate-400">
              <span>Hạn: ${helpers.escapeHtml(due)}</span>
              <span>${helpers.escapeHtml(step.department?.name || "" )}</span>
            </div>
          </li>`;
        })
        .join("");
    }

    if (currentDocId) {
      refreshDraftView();
    }
  }

  function initVanBanDenDetailPage() {
    const api = window.ApiClient;
    const helpers = window.DocHelpers || {};
    if (!api || !helpers) {
      console.warn("[chuyenvien] ApiClient hoặc DocHelpers chưa sẵn sàng; bỏ qua trang chi tiết văn bản đến.");
      return;
    }
    const docApi = api.documents;
    if (!docApi) {
      console.warn("[chuyenvien] ApiClient.documents chưa sẵn sàng.");
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const metaElement = document.getElementById("doc-detail-meta");

    function normalizeDocId(candidate) {
      if (candidate === undefined || candidate === null) return "";
      const value = String(candidate).trim();
      return /^\d+$/.test(value) ? value : "";
    }

    function resolveDocId() {
      const candidates = [
        params.get("id"),
        params.get("document_id"),
        params.get("documentId"),
        metaElement?.dataset?.docId,
        metaElement?.dataset?.documentId,
        document.body?.dataset?.docId,
        document.body?.dataset?.documentId,
        window.CURRENT_DOCUMENT_ID,
      ];
      const dataEl = document.querySelector("[data-doc-id],[data-document-id]");
      if (dataEl) {
        candidates.push(dataEl.dataset?.docId || dataEl.dataset?.documentId);
      }
      const path = window.location.pathname || "";
      const pathMatch = path.match(/\/(\d+)(?:\/)?$/);
      if (pathMatch && pathMatch[1]) {
        candidates.push(pathMatch[1]);
      } else {
        const segments = path.split("/").filter(Boolean);
        const tail = segments.pop();
        if (tail) candidates.push(tail);
      }
      for (const c of candidates) {
        const normalized = normalizeDocId(c);
        if (normalized) return normalized;
      }
      return "";
    }

    const docId = resolveDocId();
    if (!docId) {
      console.warn("[chuyenvien] Thiếu document_id khi mở chi tiết văn bản đến.");
      return;
    }

    const workflowLib = window.DocWorkflow || null;
    const workflowContainer = document.getElementById("doc-workflow-panel");
    const inboundApi =
      workflowLib && typeof workflowLib.ensureInboundDocsClient === "function"
        ? workflowLib.ensureInboundDocsClient(api)
        : null;
    const roleName = document.body?.dataset?.role || "chuyenvien";
    const currentUser = typeof api.getCurrentUser === "function" ? api.getCurrentUser() : null;
    const currentUserId = currentUser?.id || currentUser?.user_id || currentUser?.userId || null;
    let workflowInstance = null;
    let assignmentsCache = [];

    function buildPrefill(doc, normalized) {
      return {
        received_number: doc?.received_number || normalized?.incomingNumber || "",
        received_date: normalized?.receivedDate || doc?.received_date || "",
        sender: doc?.sender || normalized?.sender || "",
      };
    }

    function isCurrentAssignee(list) {
      if (!currentUserId) return false;
      const source = Array.isArray(list) ? list : assignmentsCache;
      return source.some((item) => {
        const userId = item?.user_id || item?.user?.user_id || item?.user?.id;
        return userId && String(userId) === String(currentUserId);
      });
    }

    function updateWorkflow(doc, normalized, assignments) {
      if (!workflowContainer || !workflowLib || typeof workflowLib.mount !== "function" || !inboundApi) {
        return;
      }
      const payload = {
        stateKey: normalized.statusKey,
        prefill: buildPrefill(doc, normalized),
        isAssignee: isCurrentAssignee(assignments),
      };
      if (!workflowInstance) {
        workflowInstance = workflowLib.mount({
          container: workflowContainer,
          docId,
          role: roleName,
          api: inboundApi,
          stateKey: payload.stateKey,
          prefill: payload.prefill,
          isAssignee: payload.isAssignee,
          onStateChange: () => refreshDetail(),
        });
      } else {
        workflowInstance.update(payload);
      }
    }

    function refreshDetail() {
      return docApi
        .retrieve(docId)
        .then((doc) => {
          const normalized = helpers.normalizeInboundDoc
            ? helpers.normalizeInboundDoc(doc)
            : {
                statusKey: doc?.status?.code || "tiep-nhan",
                incomingNumber: doc?.incoming_number,
                receivedDate: doc?.received_date,
                sender: doc?.sender,
              };
          assignmentsCache = Array.isArray(doc?.assignees) ? doc.assignees : [];
          updateWorkflow(doc, normalized, assignmentsCache);
        })
        .catch((error) => {
          console.error("[chuyenvien] Lỗi tải chi tiết văn bản đến:", error);
        });
    }

    refreshDetail();
  }

  function initDanhMuc() {
    const helper = window.CatalogPage && window.CatalogPage.initReadonlyCatalog;
    if (typeof helper === "function") {
      helper();
    } else {
      console.warn("[chuyenvien] CatalogPage helper chưa sẵn sàng.");
    }
  }

  function initBaoCaoThongKe() {
    if (typeof Chart === "undefined") return;

    const barCtx = document.getElementById("barDocs");
    const pieCtx = document.getElementById("pieTasks");
    const lineCtx = document.getElementById("linePerf");

    if (barCtx) {
      new Chart(barCtx, {
        type: "bar",
        data: {
          labels: ["T1", "T2", "T3", "T4", "T5", "T6"],
          datasets: [
            { label: "Đến", data: [5, 8, 6, 9, 4, 10] },
            { label: "Đi", data: [4, 5, 3, 6, 7, 8] },
            { label: "Đã xử lý", data: [3, 7, 6, 7, 5, 8] },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom" } },
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 3 } },
            x: { grid: { display: false } },
          },
        },
      });
    }

    if (pieCtx) {
      new Chart(pieCtx, {
        type: "pie",
        data: {
          labels: [
            "Chưa bắt đầu (30%)",
            "Đang thực hiện (10%)",
            "Đã hoàn thành (0%)",
            "Trễ hạn (60%)",
          ],
          datasets: [{ data: [30, 10, 0, 60] }],
        },
        options: {
          plugins: { legend: { position: "right" } },
        },
      });
    }

    if (lineCtx) {
      new Chart(lineCtx, {
        type: "line",
        data: {
          labels: ["Tuần 1", "Tuần 2", "Tuần 3", "Tuần 4", "Tuần 5", "Tuần 6"],
          datasets: [
            {
              label: "Đúng hạn (%)",
              data: [90, 92, 86, 93, 88, 92],
              tension: 0.3,
            },
            {
              label: "Chất lượng (%)",
              data: [88, 90, 85, 91, 87, 90],
              tension: 0.3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: "bottom" } },
          scales: {
            y: { min: 0, max: 100, ticks: { stepSize: 25 } },
            x: { grid: { drawOnChartArea: false } },
          },
        },
      });
    }
  }

  function initTaiKhoan() {
    const fields = ["inpName", "inpEmail", "inpPhone", "inpDept"]
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    if (!fields.length) return;

    const btnEdit = document.getElementById("btnEdit");
    const btnSave = document.getElementById("btnSave");
    const btnCancel = document.getElementById("btnCancel");
    const displayName = document.getElementById("displayName");
    const displayUsername = document.getElementById("displayUsername");
    const displayRole = document.getElementById("displayRole");
    const displaySince = document.getElementById("displaySince");
    const avatar =
      document.querySelector("[data-avatar-initials]") ||
      document.querySelector('[aria-label="Ảnh đại diện"]');

    const layout = window.Layout || {};
    const api = window.ApiClient || null;

    let backup = {};

    const setEditable = (enabled) => {
      fields.forEach((field) => (field.disabled = !enabled));
      btnEdit?.classList.toggle("hidden", enabled);
      btnSave?.classList.toggle("hidden", !enabled);
      btnCancel?.classList.toggle("hidden", !enabled);
    };

    const applyUserProfile = (user) => {
      if (!user) return;
      const fullName = (user.full_name || user.name || "").trim();
      const username = (user.username || "").trim();
      const email = (user.email || "").trim();
      const phone = (user.phone || "").trim();
      const department =
        user.department_name ||
        user.department ||
        (layout.roleConfig?.user?.department || "").trim();
      const roleLabel =
        user.role_name ||
        user.roleName ||
        layout.roleConfig?.user?.roleName ||
        displayRole?.textContent ||
        "";

      if (displayName) {
        displayName.textContent = fullName || username || "--";
      }
      if (displayUsername) {
        displayUsername.textContent = username ? `@${username}` : "@--";
      }
      if (displayRole) {
        displayRole.textContent = roleLabel || "--";
      }
      if (displaySince && displaySince.textContent?.includes("chưa có")) {
        const createdAt = user.created_at || user.createdAt || "";
        if (createdAt) {
          try {
            const date = new Date(createdAt);
            if (!Number.isNaN(date.getTime())) {
              displaySince.textContent = `Tài khoản tạo ngày ${date.toLocaleDateString(
                "vi-VN"
              )}`;
            }
          } catch (err) {
            // ignore parsing error
          }
        }
      }

      const nameInput = document.getElementById("inpName");
      const emailInput = document.getElementById("inpEmail");
      const phoneInput = document.getElementById("inpPhone");
      const deptInput = document.getElementById("inpDept");

      if (nameInput) nameInput.value = fullName || "";
      if (emailInput) emailInput.value = email || "";
      if (phoneInput) phoneInput.value = phone || "";
      if (deptInput) deptInput.value = department || "";

      const initials =
        user.initials ||
        layout.userDisplay?.initials ||
        deriveInitials(fullName || username);
      if (avatar) {
        avatar.textContent = initials || "--";
      }
    };

    const deriveInitials = (value) => {
      const raw = (value || "").trim();
      if (!raw) return "--";
      const parts = raw.split(/\s+/).filter(Boolean);
      if (!parts.length) return raw.slice(0, 2).toUpperCase();
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      const first = parts[0][0] || "";
      const last = parts[parts.length - 1][0] || "";
      return (first + last).toUpperCase();
    };

    btnEdit?.addEventListener("click", () => {
      backup = Object.fromEntries(fields.map((el) => [el.id, el.value]));
      setEditable(true);
    });

    btnCancel?.addEventListener("click", () => {
      fields.forEach((field) => {
        field.value = backup[field.id] ?? field.value;
      });
      setEditable(false);
      showToast("Đã huỷ chỉnh sửa");
    });

  async function handleProfileSave() {
    const name = document.getElementById("inpName")?.value?.trim();
    const email = document.getElementById("inpEmail")?.value?.trim();
    const phone = document.getElementById("inpPhone")?.value?.trim();
    console.debug("[chuyenvien] handleProfileSave invoked", { name, email, phone });

      if (!name) {
        showToast("Vui lòng nhập họ và tên");
        return;
      }
      if (email && !/^\S+@\S+\.\S+$/.test(email)) {
        showToast("Email không hợp lệ");
        return;
      }
      if (phone && !/^[0-9]{9,11}$/.test(phone)) {
        showToast("Số điện thoại không hợp lệ");
        return;
      }
      if (!api || typeof api.updateProfile !== "function") {
        showToast("Không thể lưu thông tin lúc này");
        return;
      }

      const originalLabel = btnSave?.textContent || "Lưu thay đổi";
      setEditable(false);
      btnSave.disabled = true;
      btnSave.textContent = "Đang lưu...";

      try {
        const updatedUser = await api.updateProfile({
          full_name: name,
          email,
          phone,
        });
        if (updatedUser) {
          layout.user = updatedUser;
          applyUserProfile(updatedUser);
        }
        showToast("Đã lưu thông tin tài khoản");
      } catch (err) {
        const message =
          err?.data?.detail ||
          err?.message ||
          "Không thể lưu thông tin. Vui lòng thử lại";
        showToast(message);
      } finally {
        btnSave.disabled = false;
        btnSave.textContent = originalLabel;
      }
    }

    btnSave?.addEventListener("click", handleProfileSave);

    const signinList = document.getElementById("signinList");

    function escapeHtml(value) {
      const text = String(value || "");
      const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
      return text.replace(/[&<>"']/g, (ch) => map[ch] || ch);
    }

    function formatDateTime(value) {
      if (!value) return null;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      return date.toLocaleString("vi-VN");
    }

    function renderSessions(records = []) {
      if (!signinList) return;
      const sessions = Array.isArray(records) ? records : [];
      if (!sessions.length) {
        signinList.innerHTML =
          '<li class="px-4 py-3 text-[13px] text-slate-500">Chưa có phiên đăng nhập nào.</li>';
        return;
      }
      const currentSession =
        api && typeof api.getSessionId === "function" ? api.getSessionId() : null;
      signinList.innerHTML = sessions
        .map((session) => {
          const sessionId = String(session.session_id || session.id || "");
          if (!sessionId) return "";
          const issued = formatDateTime(session.issued_at || session.issuedAt);
          const expires = formatDateTime(session.expires_at || session.expiresAt);
          const device = session.user_agent || session.device || "Trình duyệt không xác định";
          const ip = session.ip || "IP ẩn danh";
          const revoked = Boolean(session.revoked);
          const isCurrent =
            currentSession && currentSession.toString() === sessionId.toString();
          const badgeClass = revoked
            ? "chip chip--rose"
            : isCurrent
            ? "chip chip--blue"
            : "chip chip--green";
          const badgeLabel = revoked
            ? "Đã thu hồi"
            : isCurrent
            ? "Phiên hiện tại"
            : "Hoạt động";
          const safeId = sessionId.replace(/["']/g, "");
          const actionButton =
            !revoked && !isCurrent
              ? `<button type="button" data-revoke-session="${safeId}" class="text-[12px] text-slate-900 hover:underline">Thu hồi</button>`
              : "";
          return `
            <li class="px-4 py-3 flex items-center justify-between">
              <div>
                <div class="font-medium text-[13.5px]">${escapeHtml(device)}</div>
                <div class="text-[12px] text-slate-500">
                  ${issued ? `Đăng nhập lúc ${escapeHtml(issued)}` : "Thời điểm không xác định"}
                  ${ip ? ` • IP ${escapeHtml(ip)}` : ""}
                </div>
                ${
                  expires
                    ? `<div class="text-[11px] text-slate-400">Hết hạn ${escapeHtml(
                        expires
                      )}</div>`
                    : ""
                }
              </div>
              <div class="flex items-center gap-2">
                <span class="${badgeClass}">${badgeLabel}</span>
                ${actionButton}
              </div>
            </li>
          `;
        })
        .join("");
    }

    async function loadSessions() {
      if (!signinList) return;
      if (!api || typeof api.listSessions !== "function") {
        renderSessions();
        return;
      }
      signinList.innerHTML =
        '<li class="px-4 py-3 text-[13px] text-slate-500">Đang tải phiên đăng nhập...</li>';
      try {
        const records = await api.listSessions();
        renderSessions(records);
      } catch (err) {
        console.error("[chuyenvien] loadSessions failed", err);
        signinList.innerHTML =
          '<li class="px-4 py-3 text-[13px] text-rose-600">Không thể tải lịch sử đăng nhập.</li>';
      }
    }

    signinList?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-revoke-session]");
      if (!button) return;
      const sessionId = button.dataset.revokeSession;
      if (!sessionId || !api || typeof api.revokeSession !== "function") return;
      button.disabled = true;
      try {
        await api.revokeSession(sessionId);
        showToast("Đã thu hồi phiên đăng nhập.", "success");
        await loadSessions();
      } catch (err) {
        const message =
          err?.data?.detail || err?.message || "Không thể thu hồi phiên đăng nhập.";
        showToast(message, "error");
      } finally {
        button.disabled = false;
      }
    });

    const modal = document.getElementById("pwdModal");
    const openPwd = document.getElementById("btnOpenPwd");
    const closePwd = document.getElementById("pwdClose");
    const cancelPwd = document.getElementById("pwdCancel");
    const submitPwd = document.getElementById("pwdSubmit");

    const showModal = () => modal?.classList.remove("hidden");
    const hideModal = () => modal?.classList.add("hidden");

    openPwd?.addEventListener("click", showModal);
    closePwd?.addEventListener("click", hideModal);
    cancelPwd?.addEventListener("click", hideModal);
    modal?.addEventListener("click", (event) => {
      if (event.target === modal) hideModal();
    });

    submitPwd?.addEventListener("click", async () => {
      const cur = document.getElementById("curPwd")?.value?.trim();
      const newPwd = document.getElementById("newPwd")?.value?.trim();
      const cfm = document.getElementById("cfmPwd")?.value?.trim();

      if (!cur || !newPwd || !cfm) {
        showToast("Vui lòng nhập đầy đủ thông tin");
        return;
      }
      if (newPwd.length < 8) {
        showToast("Mật khẩu mới tối thiểu 8 ký tự");
        return;
      }
      if (newPwd !== cfm) {
        showToast("Xác nhận mật khẩu không khớp");
        return;
      }
      if (!api || typeof api.changePassword !== "function") {
        showToast("Không thể đổi mật khẩu lúc này");
        return;
      }

      console.debug("[chuyenvien] changePassword request", { current: cur, new: newPwd });
      submitPwd.disabled = true;
      try {
        await api.changePassword({
          current_password: cur,
          new_password: newPwd,
          new_password_confirm: cfm,
        });
        const lastChanged = document.getElementById("pwdLastChanged");
        if (lastChanged) {
          lastChanged.textContent = new Date().toLocaleDateString("vi-VN");
        }
        ["curPwd", "newPwd", "cfmPwd"].forEach((id) => {
          const input = document.getElementById(id);
          if (input) input.value = "";
        });
        hideModal();
        showToast("Đã cập nhật mật khẩu");
      } catch (err) {
        const message =
          err?.data?.detail ||
          err?.message ||
          "Không thể đổi mật khẩu. Vui lòng thử lại";
        showToast(message, "error");
      } finally {
        submitPwd.disabled = false;
      }
    });

    loadSessions();

    const currentUser =
      layout.user ||
      (api && typeof api.getCurrentUser === "function"
        ? api.getCurrentUser()
        : null);
    applyUserProfile(currentUser);
    if (typeof layout.ensureUser === "function") {
      layout
        .ensureUser()
        .then((user) => {
          if (user) applyUserProfile(user);
        })
        .catch(() => {});
    }

    setEditable(false);
    layout.setupLogoutHandler?.();
  }

  function initThongBao() {
    const list = document.getElementById("notifList");
    if (!list) return;

    const searchInput = document.getElementById("q");
    const typeSelect = document.getElementById("type");
    const statusSelect = document.getElementById("status");
    const counter = document.getElementById("count");
    const emptyState = document.getElementById("emptyState");

    const state = { items: [], isLoading: false };

    const escapeHtmlLocal = (value) => {
      const helper = window.Layout?.helpers?.escapeHtml;
      if (typeof helper === "function") return helper(value);
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
    };

    const channelLabel = (value) => {
      const map = { app: "Ứng dụng", email: "Email", sms: "SMS", push: "Push" };
      return map[value?.toLowerCase?.() || ""] || "Thông báo";
    };

    const statusLabel = (status) => {
      const map = {
        PENDING: { label: "Đang chờ", cls: "bg-amber-50 text-amber-700" },
        SENT: { label: "Đã gửi", cls: "bg-emerald-50 text-emerald-700" },
        CLEARED: { label: "Đã kết thúc", cls: "bg-slate-100 text-slate-700" },
      };
      return map[status?.toUpperCase?.() || ""] || { label: "Trạng thái", cls: "bg-slate-100 text-slate-700" };
    };


    const renderItem = (item) => {
      if (item.kind === "reminder") {
        const stat = statusLabel(item.status);
        const due = window.NotificationApi?.formatDateTime(item.dueAt) || "";
        return `
          <li class="card p-0 overflow-hidden notif-item" data-kind="reminder" data-id="${escapeHtmlLocal(item.id)}">
            <div class="flex items-start gap-3 px-4 py-3 bg-amber-50/60 border-l-4 border-amber-200">
              <div class="text-amber-600 mt-0.5">⏰</div>
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-3">
                  <h4 class="font-semibold truncate">${escapeHtmlLocal(item.title || "Nhắc việc")}</h4>
                  <span class="chip chip--default shrink-0">Nhắc việc</span>
                </div>
                <p class="text-sm text-slate-600">${escapeHtmlLocal(item.body || "")}</p>
                <div class="text-xs text-slate-400 mt-1">
                  Hạn: ${escapeHtmlLocal(due || "Chưa có")} • ${escapeHtmlLocal(item.entityType || "")}${item.entityId ? ` #${escapeHtmlLocal(item.entityId)}` : ""}
                </div>
              </div>
              <span class="rounded-full px-2 py-0.5 text-[12px] ${stat.cls}">${escapeHtmlLocal(stat.label)}</span>
            </div>
          </li>
        `;
      }
      const sentAt = window.NotificationApi?.formatDateTime(item.sentAt) || "";
      const unreadClass = item.readAt ? "" : "bg-blue-50/70 border-l-4 border-blue-200";
      const statusText = item.readAt ? "Đã đọc" : "Chưa đọc";
      return `
        <li class="card p-0 overflow-hidden notif-item ${item.readAt ? "" : "is-unread"}" data-kind="notification" data-id="${escapeHtmlLocal(item.id)}">
          <div class="notif-card flex items-start gap-3 px-4 py-3 ${unreadClass}">
            <div class="text-blue-600 mt-0.5">🔔</div>
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-3">
                <h4 class="font-semibold truncate">${escapeHtmlLocal(item.title || "Thông báo")}</h4>
                <span class="chip chip--default shrink-0">${escapeHtmlLocal(channelLabel(item.channel))}</span>
              </div>
              <p class="text-sm text-slate-600">${escapeHtmlLocal(item.body || "")}</p>
              <div class="text-xs text-slate-400 mt-1">
                ${sentAt ? `Gửi: ${escapeHtmlLocal(sentAt)}` : ""}
              </div>
            </div>
            <div class="shrink-0 flex items-center gap-2">
              <span class="chip chip--default ${item.readAt ? "" : "bg-blue-100 text-blue-700"}">${escapeHtmlLocal(statusText)}</span>
              <button class="btn-icon" type="button" data-action="mark" data-tooltip="Đánh dấu đã đọc" aria-label="Đánh dấu đã đọc">✔</button>
            </div>
          </div>
        </li>
      `;
    };

    const applyFilters = () => {
      const keyword = (searchInput?.value || "").toLowerCase().trim();
      const typeValue = typeSelect?.value || "";
      const statusValue = statusSelect?.value || "";

      return state.items.filter((item) => {
        const text = `${item.title || ""} ${item.body || ""}`.toLowerCase();
        const matchKeyword = !keyword || text.includes(keyword);
        const matchType = !typeValue || item.kind === typeValue;
        let matchStatus = true;
        if (statusValue === "unread") {
          matchStatus = item.kind === "notification" && !item.readAt;
        } else if (statusValue === "read") {
          matchStatus = item.kind === "notification" && !!item.readAt;
        } else if (statusValue) {
          matchStatus =
            item.kind === "reminder" &&
            (item.status || "").toUpperCase() === statusValue.toUpperCase();
        }
        return matchKeyword && matchType && matchStatus;
      });
    };

    const refresh = () => {
      const filtered = applyFilters();
      if (list) {
        list.innerHTML = filtered.map(renderItem).join("");
      }
      if (counter) counter.textContent = String(filtered.length);
      if (emptyState) emptyState.classList.toggle("hidden", filtered.length > 0);
    };

    list.addEventListener("click", async (event) => {
      const btn = event.target.closest("button[data-action='mark']");
      if (!btn) return;
      const li = event.target.closest("li[data-id]");
      if (!li) return;
      const id = li.dataset.id;
      const item = state.items.find((it) => String(it.id) === String(id));
      if (!item || item.kind !== "notification") return;
      try {
        const api = window.NotificationApi;
        if (!api) return;
        await api.markNotificationRead(id);
        item.readAt = new Date().toISOString();
        refresh();
        showToast("Đã đánh dấu đã đọc.");
      } catch (err) {
        console.error("[chuyenvien] mark read failed", err);
        showToast("Không thể đánh dấu đã đọc", "error");
      }
    });

    const loadData = async () => {
      if (state.isLoading) return;
      state.isLoading = true;
      try {
        const api = window.NotificationApi;
        if (!api) {
          showToast("NotificationApi chưa sẵn sàng", "error");
          return;
        }
        const [notiRaw, remindRaw] = await Promise.all([
          api.fetchNotifications().catch(() => []),
          api.fetchReminders().catch(() => []),
        ]);
        const notifications = (notiRaw || []).map((n) => ({
          kind: "notification",
          ...api.normalizeNotification(n),
        }));
        const reminders = (remindRaw || []).map((r) => ({
          kind: "reminder",
          ...api.normalizeReminder(r),
        }));
        state.items = [...notifications, ...reminders];
        refresh();
      } catch (err) {
        console.error("[chuyenvien] load notifications failed", err);
        showToast("Không thể tải thông báo & nhắc việc", "error");
      } finally {
        state.isLoading = false;
      }
    };

    const refreshIntervalMs = 60 * 1000;
    let pollTimer = null;

    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const startPolling = () => {
      stopPolling();
      pollTimer = setInterval(() => {
        if (!state.isLoading) {
          loadData();
        }
      }, refreshIntervalMs);
    };

    const debounced = debounce(refresh, 120);
    searchInput?.addEventListener("input", debounced);
    typeSelect?.addEventListener("change", refresh);
    statusSelect?.addEventListener("change", refresh);

    loadData().finally(startPolling);
  }

  /* ============== HELPERS ============== */

  function noop() {}

  function createDetailView(listSelector, detailSelector, onShow) {
    const listEl = document.querySelector(listSelector);
    const detailEl = document.querySelector(detailSelector);
    if (!listEl || !detailEl) return null;

    const scrollToEl = (el) => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const top = Math.max(0, rect.top + window.scrollY - 72);
      window.scrollTo({ top, behavior: "smooth" });
    };

    const hide = () => {
      detailEl.classList.add("hidden");
      listEl.classList.remove("hidden");
      scrollToEl(listEl);
    };

    detailEl
      .querySelectorAll("[data-action='back-to-list']")
      .forEach((btn) => btn.addEventListener("click", hide));

    return {
      show(payload = {}) {
        if (typeof onShow === "function") {
          onShow(payload);
        }
        listEl.classList.add("hidden");
        detailEl.classList.remove("hidden");
        scrollToEl(detailEl);
      },
      hide,
    };
  }

  function renderDocDetail(doc = {}) {
    const id = doc.id || doc.code || doc.title || "Chi tiết";
    setTextById("cvDocBreadcrumb", `Văn bản • ${id}`);
    applyDirectionChip(
      document.getElementById("cvDocDirection"),
      doc.direction
    );
    applyStatusChip(document.getElementById("cvDocStatus"), doc.status);
    applyUrgencyChip(document.getElementById("cvDocUrgency"), doc.urgency);
    applySecurityChip(document.getElementById("cvDocSecurity"), doc.security);

    setTextById("cvDocTitle", doc.title);
    setTextById("cvDocCode", doc.code);
    setTextById("cvDocReceivedNumber", doc.receivedNumber || doc.issueNumber);
    setTextById("cvDocIssuedDate", doc.issuedDate);
    setTextById("cvDocReceivedDate", doc.receivedDate);
    setTextById("cvDocSender", doc.sender);
    setTextById("cvDocReceiver", doc.receiver);
    setTextById("cvDocField", doc.field);
    setTextById("cvDocType", doc.type);
    setTextById("cvDocDepartment", doc.department);
    setTextById("cvDocDue", doc.due);
    setTextById("cvDocIssueNumber", doc.issueNumber);
    setTextById("cvDocSigner", doc.signer);
    setTextById("cvDocSigningMethod", doc.signingMethod);
    setTextById("cvDocIssuedBy", doc.issuedBy);
    setTextById("cvDocDispatchMethod", doc.dispatchMethod);
    setTextById("cvDocDispatchStatus", doc.dispatchStatus);
    setTextById("cvDocDispatchAt", doc.dispatchAt);
  }

  function renderCaseDetail(caseData = {}) {
    const id =
      caseData.id || caseData.code || caseData.title || "Hồ sơ công việc";
    setTextById("cvCaseBreadcrumb", `Hồ sơ công việc • ${id}`);
    setTextById("cvCaseTitle", caseData.title);
    setTextById("cvCaseCode", caseData.code);
    setTextById("cvCaseType", caseData.type);
    setTextById("cvCaseDepartment", caseData.department);
    setTextById("cvCaseLeader", caseData.leader);
    setTextById("cvCaseOwner", caseData.owner);
    setTextById("cvCaseDue", caseData.dueDate);
    setTextById("cvCaseCreatedAt", caseData.createdAt);
    setTextById("cvCaseStatusText", caseData.status);
    setTextById("cvCaseTaskCount", caseData.taskCount);

    applyCaseStatusChip(
      document.getElementById("cvCaseStatus"),
      caseData.status
    );
    applyCasePriorityChip(
      document.getElementById("cvCasePriority"),
      caseData.priority
    );
  }

  function buildDocDataset(row) {
    if (!row) return {};
    const urgencySpan = row.children?.[4]?.querySelectorAll("span") || [];
    const statusChip = row.children?.[8]?.querySelector("span");

    return {
      id: row.dataset.docId || getDocIdFromRow(row),
      direction: row.dataset.docDirection || "den",
      title:
        row.dataset.docTitle ||
        safeText(row.querySelector(".font-medium")) ||
        safeText(row.querySelector("a")),
      code:
        row.dataset.docCode ||
        safeText(row.children?.[1]?.firstElementChild) ||
        safeText(row.children?.[1]),
      receivedNumber:
        row.dataset.docReceivedNumber ||
        stripLabel(safeText(row.children?.[1]?.lastElementChild)),
      issuedDate:
        row.dataset.docIssuedDate ||
        stripLabel(safeText(row.children?.[2]?.firstElementChild)),
      receivedDate:
        row.dataset.docReceivedDate ||
        stripLabel(safeText(row.children?.[2]?.lastElementChild)),
      sender:
        row.dataset.docSender || safeText(row.children?.[5]?.firstElementChild),
      receiver:
        row.dataset.docReceiver ||
        stripLabel(safeText(row.children?.[5]?.lastElementChild)),
      field:
        row.dataset.docField || safeText(row.children?.[3]?.firstElementChild),
      type:
        row.dataset.docType ||
        stripLabel(safeText(row.children?.[3]?.lastElementChild)),
      urgency:
        row.dataset.docUrgency ||
        safeText(urgencySpan?.[0]) ||
        safeText(row.children?.[4]),
      security: row.dataset.docSecurity || safeText(urgencySpan?.[1]) || "",
      status:
        row.dataset.docStatus ||
        safeText(statusChip) ||
        safeText(row.children?.[8]),
      department:
        row.dataset.docDepartment ||
        safeText(row.children?.[6]?.firstElementChild),
      due:
        row.dataset.docDue ||
        stripLabel(safeText(row.children?.[6]?.lastElementChild)) ||
        safeText(row.children?.[7]),
      issueNumber:
        row.dataset.docIssueNumber ||
        row.dataset.docReceivedNumber ||
        stripLabel(safeText(row.children?.[1]?.lastElementChild)),
      signer: row.dataset.docSigner || "",
      signingMethod: row.dataset.docSigningMethod || "",
      issuedBy: row.dataset.docIssuedBy || "",
      dispatchMethod: row.dataset.docDispatchMethod || "",
      dispatchStatus: row.dataset.docDispatchStatus || "",
      dispatchAt: row.dataset.docDispatchAt || "",
    };
  }

  function buildCaseDataset(row) {
    if (!row) return {};
    const dataset = row.dataset || {};
    return {
      id: dataset.caseId || dataset.docId || getDocIdFromRow(row),
      code:
        dataset.caseCode ||
        safeText(row.children?.[0]?.querySelector("strong")) ||
        safeText(row.children?.[0]),
      title:
        dataset.caseTitle ||
        safeText(row.children?.[0]?.querySelector("a")) ||
        safeText(row.children?.[0]),
      type: dataset.caseType || "",
      status: dataset.caseStatus || safeText(row.children?.[6]),
      priority: dataset.casePriority || safeText(row.children?.[5]),
      department: dataset.caseDepartment || "",
      leader: dataset.caseLeader || safeText(row.children?.[1]),
      owner: dataset.caseOwner || "",
      dueDate:
        dataset.caseDue ||
        stripLabel(safeText(row.children?.[3])) ||
        safeText(row.children?.[3]),
      createdAt:
        dataset.caseCreatedAt ||
        stripLabel(safeText(row.children?.[2])) ||
        safeText(row.children?.[2]),
      taskCount: dataset.caseTaskCount || "",
    };
  }

  function setTextById(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value && value.trim ? value.trim() || "—" : value || "—";
  }

  function applyDirectionChip(el, direction) {
    if (!el) return;
    const map = {
      den: {
        text: "Văn bản đến",
        classes: "bg-blue-50 text-blue-700",
      },
      di: {
        text: "Văn bản đi",
        classes: "bg-emerald-50 text-emerald-700",
      },
      du_thao: {
        text: "Văn bản dự thảo",
        classes: "bg-violet-50 text-violet-700",
      },
    };
    const key = toLower(direction);
    const entry = map[key] || map.den;
    setChip(el, entry.classes, entry.text);
  }

  function applyStatusChip(el, status) {
    if (!el) return;
    const map = {
      "chưa xử lý": "bg-slate-900 text-white",
      "đang xử lý": "bg-amber-100 text-amber-700",
      "đã xử lý": "bg-emerald-50 text-emerald-700",
      "đã phát hành": "bg-blue-100 text-blue-700",
      "bị từ chối": "bg-rose-100 text-rose-700",
    };
    const key = toLower(status);
    const classes = map[key] || "bg-slate-200 text-slate-700";
    setChip(el, classes, status || "Chưa xác định");
  }

  function applyUrgencyChip(el, urgency) {
    if (!el) return;
    const map = {
      "hỏa tốc": "bg-rose-100 text-rose-700",
      khẩn: "bg-amber-100 text-amber-700",
      cao: "bg-orange-100 text-orange-700",
      thường: "bg-slate-100 text-slate-700",
    };
    const key = toLower(urgency);
    const classes = map[key] || "bg-slate-100 text-slate-700";
    setChip(el, classes, urgency || "—");
  }

  function applySecurityChip(el, security) {
    if (!el) return;
    const map = {
      mật: "bg-rose-100 text-rose-700",
      "tuyệt mật": "bg-red-200 text-red-800",
      "không mật": "bg-slate-100 text-slate-600",
      thường: "bg-slate-200 text-slate-700",
    };
    const key = toLower(security);
    const classes = map[key] || "bg-slate-200 text-slate-700";
    setChip(el, classes, security || "—");
  }

  function setChip(el, classes, text) {
    el.className = `px-2.5 py-1 rounded-full text-xs font-semibold ${classes}`;
    el.textContent = text;
  }

  function applyCaseStatusChip(el, status) {
    if (!el) return;
    const map = {
      "đang thực hiện": "bg-blue-50 text-blue-700",
      "chờ xử lý": "bg-slate-200 text-slate-700",
      "hoàn thành": "bg-emerald-50 text-emerald-700",
      "đóng hồ sơ": "bg-slate-900 text-white",
      "tạm dừng": "bg-amber-100 text-amber-700",
      "trễ hạn": "bg-rose-100 text-rose-700",
    };
    const key = toLower(status);
    const classes = map[key] || "bg-slate-200 text-slate-700";
    setChip(el, classes, status || "Chưa xác định");
  }

  function applyCasePriorityChip(el, priority) {
    if (!el) return;
    const map = {
      cao: "bg-rose-100 text-rose-700",
      khẩn: "bg-rose-100 text-rose-700",
      "trung bình": "bg-amber-100 text-amber-700",
      thấp: "bg-slate-100 text-slate-700",
      thường: "bg-slate-100 text-slate-700",
    };
    const key = toLower(priority);
    const classes = map[key] || "bg-slate-100 text-slate-700";
    setChip(el, classes, priority || "—");
  }

  function stripLabel(text) {
    if (!text) return "";
    return text.replace(/^[^:]+:\s*/i, "").trim();
  }

  function matchTaskPriority(priorityText, selected) {
    if (!selected) return true;
    const text = priorityText || "";
    switch (selected) {
      case "cao":
        return /cao|khẩn/.test(text);
      case "trung bình":
        return /trung bình|thường/.test(text);
      case "thấp":
        return /thấp/.test(text);
      default:
        return text.includes(selected);
    }
  }

  function getDocIdFromRow(row) {
    if (!row) return "";
    const id = safeText(row.children?.[1]);
    if (id) return id;
    const tbody = row.parentElement;
    if (!tbody) return "";
    const index = Array.from(tbody.children).indexOf(row);
    return `ROW_${index}`;
  }

  function setRowAccepted(row) {
    if (!row || row.dataset.accepted === "true") return;
    row.dataset.accepted = "true";

    const statusCell = row.children?.[6];
    if (statusCell) {
      statusCell.innerHTML = '<span class="chip chip--blue">Đang xử lý</span>';
    }

    const btn = $$("button", row).find((b) =>
      /tiếp nhận/i.test(b.textContent || "")
    );
    if (btn) {
      btn.textContent = "Đã tiếp nhận";
      btn.classList.add("is-done");
      btn.setAttribute("disabled", "true");
    }
  }

  function loadAccepted() {
    if (!storage) return [];
    try {
      const raw = storage.getItem(STORAGE_KEYS.incomingAccepted);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveAccepted(list) {
    if (!storage) return;
    try {
      storage.setItem(STORAGE_KEYS.incomingAccepted, JSON.stringify(list));
    } catch {
      /* ignore quota errors */
    }
  }

  function getSafeStorage() {
    try {
      const ls = window.localStorage;
      if (!ls) return null;
      const probe = "__cv_probe__";
      ls.setItem(probe, "1");
      ls.removeItem(probe);
      return ls;
    } catch {
      return null;
    }
  }

  function safeText(node) {
    return (node && node.textContent ? node.textContent : "").trim();
  }

  function toLower(value) {
    return (value || "").toString().trim().toLowerCase();
  }

  function showToast(message = "Đã thực hiện") {
    if (!document.body) return;
    let el = document.querySelector(".toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.remove("show");
    void el.offsetWidth; // restart animation
    el.classList.add("show");
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => {
      el.classList.remove("show");
    }, 1800);
  }

  function debounce(fn, delay = 150) {
    let timer;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function initBaoCaoThongKe() {
    if (typeof window.initChuyenVienAnalytics === 'function') {
      window.initChuyenVienAnalytics();
    } else {
      console.warn('Analytics module not loaded');
      setTimeout(() => {
        if (typeof window.initChuyenVienAnalytics === 'function') {
          window.initChuyenVienAnalytics();
        }
      }, 500);
    }
  }

  function exposeGlobals() {
    window.TrisApp = Object.assign({}, window.TrisApp, {
      showToast,
      debounce,
    });
  }
})();
