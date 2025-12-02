/**
 * lanhdao-dashboard.js
 * Fetches live dashboard data for lãnh đạo and renders dynamic widgets.
 */

(function () {
  "use strict";

  const SELECTORS = {
    error: "#dashboardError",
    pendingList: "#approve-list",
    approvalList: "#approval-tracking",
    taskList: "#unitTaskList",
    alertList: "#alertList",
    kpiPendingApprove: "#kpiPendingApprove",
    kpiPendingSign: "#kpiPendingSign",
    kpiDone: "#kpiDone",
    kpiTotal: "#kpiTotal",
    kpiLate: "#kpiLate",
    kpiRate: "#kpiRate",
    unitProgressBar: "#unitProgressBar",
    unitDone: "#unitDone",
    unitTotal: "#unitTotal",
  };

  const DATE_FORMAT = new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const DATETIME_FORMAT = new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  function onReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  function init() {
    if (document.body.dataset.page !== "dashboard") {
      return;
    }
    fetchDashboardData();
    window.LanhDaoDashboard = window.LanhDaoDashboard || {};
    window.LanhDaoDashboard.refresh = fetchDashboardData;
  }

  async function fetchDashboardData() {
    if (!window.ApiClient || typeof window.ApiClient.request !== "function") {
      console.warn("[lanhdao-dashboard] ApiClient chưa sẵn sàng");
      return;
    }

    hideError();
    setLoading(true);

    try {
      const response = await window.ApiClient.request("/api/v1/analytics/leader-dashboard", {
        params: { scope: "all" },
      });
      if (!response || !response.success) {
        throw new Error("API trả về payload không hợp lệ");
      }
      renderDashboard(response.data || {});
    } catch (error) {
      console.error("[lanhdao-dashboard] Lỗi tải dữ liệu:", error);
      showError("Không tải được dữ liệu Dashboard. Vui lòng thử lại sau.");
    } finally {
      setLoading(false);
    }
  }

  function renderDashboard(data) {
    const taskProgress = data.task_progress || {};
    const pendingCounts = data.pending_counts || {};

    renderKPIs(taskProgress, pendingCounts);
    renderPendingDocuments(data.pending_documents || [], pendingCounts);
    renderApprovalTimeline(data.approval_timeline || []);
    renderTaskList(taskProgress);
    renderNotifications(data.notifications || []);
  }

  function renderKPIs(taskProgress, pendingCounts) {
    updateText(SELECTORS.kpiPendingApprove, pendingCounts.approval ?? 0);
    updateText(SELECTORS.kpiPendingSign, pendingCounts.sign ?? 0);
    updateText(SELECTORS.kpiLate, taskProgress.late ?? 0);

    const completed = Number(taskProgress.completed) || 0;
    const total = Number(taskProgress.total) || 0;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

    updateText(SELECTORS.kpiDone, completed);
    updateText(SELECTORS.kpiTotal, total);
    updateText(SELECTORS.kpiRate, `${rate}%`);
    updateText(SELECTORS.unitDone, completed);
    updateText(SELECTORS.unitTotal, total);

    const bar = document.querySelector(SELECTORS.unitProgressBar);
    if (bar) {
      bar.style.width = `${rate}%`;
    }
  }

  function renderPendingDocuments(items, counts) {
    const list = document.querySelector(SELECTORS.pendingList);
    if (!list) return;
    list.innerHTML = "";

    if (!items.length) {
      list.appendChild(createPlaceholder("Không có văn bản cần phê duyệt."));
      return;
    }

    items.forEach((doc) => {
      list.appendChild(createPendingDocumentItem(doc));
    });
  }

  function renderApprovalTimeline(items) {
    const list = document.querySelector(SELECTORS.approvalList);
    if (!list) return;
    list.innerHTML = "";

    if (!items.length) {
      list.appendChild(createPlaceholder("Không có bước phê duyệt gần đây."));
      return;
    }

    items.forEach((step) => {
      list.appendChild(createApprovalStep(step));
    });
  }

  function renderTaskList(taskProgress) {
    const list = document.querySelector(SELECTORS.taskList);
    if (!list) return;
    list.innerHTML = "";

    const entries = taskProgress.items || [];
    if (!entries.length) {
      list.appendChild(createPlaceholder("Chưa có công việc nào để hiển thị."));
      return;
    }

    entries.forEach((task) => {
      list.appendChild(createTaskItem(task));
    });
  }

  function renderNotifications(items) {
    const list = document.querySelector(SELECTORS.alertList);
    if (!list) return;
    list.innerHTML = "";

    if (!items.length) {
      list.appendChild(createPlaceholder("Không có thông báo mới."));
      return;
    }

    items.forEach((note) => {
      list.appendChild(createNotificationItem(note));
    });
  }

  function createPlaceholder(message) {
    const li = document.createElement("li");
    li.className = "px-4 py-3 text-sm text-slate-500";
    li.textContent = message;
    return li;
  }

  function createPendingDocumentItem(doc) {
    const li = document.createElement("li");
    li.className =
      "px-4 py-3 flex items-start justify-between gap-4 hover:bg-slate-50/60";

    const info = document.createElement("div");
    const title = document.createElement("p");
    title.className = "font-medium";
    title.textContent = doc.title || doc.code || "Văn bản chưa có tiêu đề";
    info.appendChild(title);

    const meta = document.createElement("p");
    meta.className = "text-[12.5px] text-slate-500";
    const dueLabel = doc.due_at
      ? `Hạn: ${formatDate(doc.due_at)}`
      : "Chưa có hạn";
    const codeLabel = doc.code ? `${doc.code} • ` : "";
    meta.textContent = `${codeLabel}${doc.status || "Chờ xử lý"} • ${dueLabel}`;
    info.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "flex flex-col items-end gap-2";

    const badge = document.createElement("span");
    badge.className = getBadgeClassesForDirection(doc.direction);
    badge.textContent = doc.status || "Đang chờ";
    actions.appendChild(badge);

    const link = document.createElement("a");
    link.href = getDocumentDetailUrl(doc);
    link.className =
      "px-3 py-1.5 rounded-md bg-slate-900 text-white text-[12px] font-medium hover:bg-slate-700";
    link.textContent = "Chi tiết";
    link.addEventListener("click", (event) => {
      if (!link.href) {
        event.preventDefault();
      }
    });
    actions.appendChild(link);

    li.appendChild(info);
    li.appendChild(actions);
    return li;
  }

  function createApprovalStep(step) {
    const li = document.createElement("li");
    li.className =
      "px-4 py-3 flex items-center justify-between hover:bg-slate-50/60 gap-4";

    const left = document.createElement("div");
    left.className = "flex items-start gap-3";
    const badgeLabel = document.createElement("div");
    badgeLabel.className = "mt-0.5 text-indigo-600 font-semibold text-[13px]";
    badgeLabel.textContent = "STEP";
    left.appendChild(badgeLabel);

    const info = document.createElement("div");
    const heading = document.createElement("p");
    heading.className = "font-medium";
    heading.textContent = `${step.code || "VB"} • ${step.action || "Bước"}`;
    info.appendChild(heading);

    const detail = document.createElement("p");
    detail.className = "text-[12.5px] text-slate-500";
    detail.textContent = step.timestamp
      ? `${formatDateTime(step.timestamp)} — ${step.status || "Đang xử lý"}`
      : `${step.status || "Đang xử lý"}`;
    info.appendChild(detail);

    if (step.actor) {
      const actorLine = document.createElement("p");
      actorLine.className = "text-[12px] text-slate-400";
      actorLine.textContent = `Người duyệt: ${step.actor}`;
      info.appendChild(actorLine);
    }

    if (step.note) {
      const note = document.createElement("p");
      note.className = "text-[12px] text-slate-400 italic mt-0.5";
      note.textContent = step.note;
      info.appendChild(note);
    }

    left.appendChild(info);

    const statusBadge = document.createElement("span");
    statusBadge.className = getBadgeClassesForStatus(step.status);
    statusBadge.textContent = step.status || "Chờ xử lý";

    li.appendChild(left);
    li.appendChild(statusBadge);
    return li;
  }

  function createTaskItem(task) {
    const li = document.createElement("li");
    li.className =
      "flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2";

    const info = document.createElement("div");
    const title = document.createElement("span");
    title.className = "text-[14px] font-medium";
    title.textContent = task.title || "Công việc chưa có tên";
    info.appendChild(title);

    const meta = document.createElement("p");
    meta.className = "text-[12px] text-slate-500";
    const caseLabel = task.case_code || task.case_title || "";
    meta.textContent = caseLabel;
    info.appendChild(meta);

    const statusArea = document.createElement("div");
    statusArea.className = "flex flex-col items-end gap-1";

    const statusBadge = document.createElement("span");
    statusBadge.className = getBadgeClassesForTask(task.status);
    statusBadge.textContent = task.status || "Chưa bắt đầu";
    statusArea.appendChild(statusBadge);

    const due = document.createElement("span");
    due.className = "text-[12px] text-slate-400";
    due.textContent = task.due_at
      ? `Hạn: ${formatDate(task.due_at)}`
      : "Chưa có hạn";
    statusArea.appendChild(due);

    li.appendChild(info);
    li.appendChild(statusArea);
    return li;
  }

  function createNotificationItem(note) {
    const li = document.createElement("li");
    li.className =
      "px-3 py-3 rounded-lg hover:bg-slate-50 border-b border-slate-100 last:border-b-0";

    const wrapper = document.createElement("div");
    wrapper.className = "flex items-start gap-3";

    const icon = document.createElement("div");
    icon.className = "mt-0.5 text-blue-600";
    icon.textContent = "🔔";
    wrapper.appendChild(icon);

    const content = document.createElement("div");
    content.className = "flex-1";
    const title = document.createElement("p");
    title.className = "font-medium text-[14px]";
    if (note.link) {
      const anchor = document.createElement("a");
      anchor.href = note.link;
      anchor.className = "hover:underline";
      anchor.textContent = note.title || "Thông báo mới";
      title.appendChild(anchor);
    } else {
      title.textContent = note.title || "Thông báo mới";
    }
    content.appendChild(title);

    if (note.body) {
      const description = document.createElement("p");
      description.className = "text-[12.5px] text-slate-500";
      description.textContent = note.body;
      content.appendChild(description);
    }

    if (note.sent_at) {
      const timestamp = document.createElement("div");
      timestamp.className = "text-[12px] text-slate-400 mt-1";
      timestamp.textContent = formatDate(note.sent_at);
      content.appendChild(timestamp);
    }

    wrapper.appendChild(content);

    const statusDot = document.createElement("span");
    statusDot.className = [
      "w-2",
      "h-2",
      "rounded-full",
      "mt-2",
      note.read ? "bg-slate-300" : "bg-blue-600",
    ].join(" ");
    wrapper.appendChild(statusDot);

    li.appendChild(wrapper);
    return li;
  }

  function formatDate(value) {
    if (!value) {
      return "";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.valueOf())) {
      return value;
    }
    return DATE_FORMAT.format(parsed);
  }

  function formatDateTime(value) {
    if (!value) {
      return "";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.valueOf())) {
      return value;
    }
    return DATETIME_FORMAT.format(parsed);
  }

  function getBadgeClassesForDirection(direction) {
    const key = String(direction || "").toLowerCase();
    if (key === "di") {
      return "rounded-full px-2.5 py-1 text-xs font-semibold bg-sky-50 text-sky-700";
    }
    return "rounded-full px-2.5 py-1 text-xs font-semibold bg-amber-50 text-amber-700";
  }

  function getBadgeClassesForStatus(status) {
    if (!status) {
      return "rounded-full px-2.5 py-1 text-[12px] font-medium bg-slate-100 text-slate-600";
    }
    const normalized = String(status).toUpperCase();
    if (normalized.includes("APPROVE") || normalized.includes("ĐÃ KÝ")) {
      return "rounded-full px-2.5 py-1 text-[12px] font-medium bg-emerald-50 text-emerald-700";
    }
    if (normalized.includes("REJECT") || normalized.includes("TỪ CHỐI")) {
      return "rounded-full px-2.5 py-1 text-[12px] font-medium bg-rose-50 text-rose-700";
    }
    return "rounded-full px-2.5 py-1 text-[12px] font-medium bg-amber-50 text-amber-700";
  }

  function getBadgeClassesForTask(status) {
    const normalized = String(status || "").toUpperCase();
    if (normalized === "DONE") {
      return "px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700";
    }
    if (normalized === "IN_PROGRESS") {
      return "px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700";
    }
    if (normalized === "CANCELLED") {
      return "px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700";
    }
    return "px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700";
  }

  function getDocumentDetailUrl(doc) {
    const docId = encodeURIComponent(doc.document_id || "");
    if (!docId) {
      return "#";
    }
    const direction = String(doc.direction || "den").toLowerCase();
    const base =
      direction === "di" ? "/lanhdao/vanbandi-detail.html" : "/lanhdao/vanbanden-detail.html";
    return `${base}?id=${docId}`;
  }

  function updateText(selector, value) {
    const element = document.querySelector(selector);
    if (element) {
      element.textContent = value ?? "0";
    }
  }

  function showError(message) {
    const el = document.querySelector(SELECTORS.error);
    if (!el) return;
    el.textContent = message;
    el.classList.remove("hidden");
  }

  function hideError() {
    const el = document.querySelector(SELECTORS.error);
    if (!el) return;
    el.textContent = "";
    el.classList.add("hidden");
  }

  function setLoading(active) {
    document.body?.setAttribute("data-dashboard-loading", active ? "true" : "false");
  }

  onReady(init);
})();
