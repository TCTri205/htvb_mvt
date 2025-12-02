;(function () {
  "use strict";

  const PROCESSED_STATUS_KEYS = [
    "REGISTERED",
    "DISPATCHED",
    "ARCHIVED",
    "ISSUED",
    "APPROVED",
  ];
  const URGENT_CANONICAL = new Set(["KHAN", "HOA_TOC"]);
  const URGENCY_BADGES = {
    KHAN: { classes: "bg-rose-600 text-white", label: "Khẩn" },
    HOA_TOC: { classes: "bg-rose-600 text-white", label: "Hỏa tốc" },
    DEFAULT: { classes: "bg-rose-600 text-white", label: "Khẩn" },
  };
  const DISPATCH_STATUS_BADGES = {
    PENDING: { classes: "bg-amber-50 text-amber-700", label: "Đang chuyển" },
    SENT: { classes: "bg-emerald-50 text-emerald-700", label: "Đã phát hành" },
    FAILED: { classes: "bg-rose-50 text-rose-700", label: "Lỗi gửi" },
    DEFAULT: { classes: "bg-slate-100 text-slate-600", label: "Đang xử lý" },
  };
  const DISPATCH_METHOD_LABELS = {
    buu_chinh: "Bưu chính",
    email: "Email",
    cong_dvc: "Cổng DVC",
  };

  const SELECTORS = {
    urgentList: "#list-khan",
    dispatchList: "#dispatch-tracking",
    notificationList: "#list-thongbao",
    kpiInbound: "#kpi-den-chua-xuly",
    kpiOutbound: "#kpi-di-chua-phathanh",
    kpiUrgent: "#kpi-khan",
    kpiArchived: "#kpi-luutru",
    inboundDone: "vb-den-progress",
    inboundTotal: "vb-den-total",
    inboundBar: "bar-vb-den",
    inboundPercent: "vb-den-percent",
    outboundDone: "vb-di-progress",
    outboundTotal: "vb-di-total",
    outboundBar: "bar-vb-di",
    outboundPercent: "vb-di-percent",
    tileInbound: "#tile-vb-den",
    tileOutbound: "#tile-vb-di",
    urgentBtn: "#btn-xem-khan",
    urgentAllBtn: "#btn-xem-tat-ca-khan",
  };

  const state = {
    loading: false,
  };

  function canonicalize(value) {
    if (!value) return "";
    let normalized = value;
    if (typeof normalized.normalize === "function") {
      normalized = normalized.normalize("NFD");
    }
    return normalized
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, "_")
      .replace(/[^A-Za-z0-9_]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+/, "")
      .replace(/_+$/, "")
      .toUpperCase();
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleDateString("vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }

  function formatDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toLocaleString("vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function setText(selector, value) {
    const el = document.querySelector(selector);
    if (!el) return;
    const formatted = value !== undefined && value !== null ? String(value) : "0";
    el.textContent = formatted;
  }

  function updateProgress(done, total, config) {
    const doneEl = document.getElementById(config.done);
    if (doneEl) {
      doneEl.textContent = String(done);
      doneEl.dataset.progress = String(done);
    }
    const totalEl = document.getElementById(config.total);
    if (totalEl) {
      totalEl.textContent = String(total);
      totalEl.dataset.total = String(total);
    }
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    const percentEl = document.getElementById(config.percent);
    if (percentEl) {
      percentEl.textContent = String(percent);
    }
    const barEl = document.getElementById(config.bar);
    if (barEl) {
      barEl.style.width = `${percent}%`;
    }
    if (config.tile) {
      const tileEl = document.querySelector(config.tile);
      if (tileEl) {
        tileEl.textContent = String(total);
      }
    }
  }

  function unwrapSuccess(result) {
    if (!result || result.status !== "fulfilled") {
      return null;
    }
    const payload = result.value;
    if (!payload) {
      return null;
    }
    if (payload.success && payload.data !== undefined) {
      return payload.data;
    }
    return payload;
  }

  function safeExtractItems(payload) {
    if (!payload) {
      return [];
    }
    if (typeof window.ApiClient?.extractItems === "function") {
      return window.ApiClient.extractItems(payload) || [];
    }
    if (Array.isArray(payload.items)) {
      return payload.items;
    }
    if (Array.isArray(payload.data)) {
      return payload.data;
    }
    if (Array.isArray(payload)) {
      return payload;
    }
    return [];
  }

  function extractTotalItems(payload) {
    if (!payload) return 0;
    if (typeof payload.total_items === "number") {
      return payload.total_items;
    }
    if (typeof payload.count === "number") {
      return payload.count;
    }
    return 0;
  }

  function createUrgentItem(doc) {
    const li = document.createElement("li");
    li.className = "px-4 py-3 flex items-start justify-between gap-4 hover:bg-slate-50/60";

    const info = document.createElement("div");
    const heading = document.createElement("p");
    heading.className = "font-medium";
    heading.textContent =
      doc.title || doc.number || `VB #${doc.id ?? doc.document_id ?? "?"}`;
    info.appendChild(heading);

    const meta = document.createElement("p");
    meta.className = "text-[12.5px] text-slate-500";
    const numberLabel = doc.number ? `Số: ${doc.number}` : "Số: chưa có";
    const dueDate = doc.received_date || doc.issued_date;
    const dueLabel = dueDate ? `Hạn: ${formatDate(dueDate)}` : "Hạn: chưa có";
    meta.textContent = `${numberLabel} · ${dueLabel}`;
    info.appendChild(meta);
    li.appendChild(info);

    const badgeGroup = document.createElement("div");
    badgeGroup.className = "flex items-center gap-2";

    const urgencyName = doc.urgency?.name || "";
    const urgencyBadge = document.createElement("span");
    urgencyBadge.className = "rounded-full text-xs font-semibold px-2.5 py-1";
    const canonical = canonicalize(urgencyName);
    const urgencyStyle = URGENCY_BADGES[canonical] || URGENCY_BADGES.DEFAULT;
    urgencyBadge.textContent = urgencyStyle.label;
    urgencyBadge.className += ` ${urgencyStyle.classes}`;
    badgeGroup.appendChild(urgencyBadge);

    const statusBadge = document.createElement("span");
    statusBadge.className = "rounded-full text-xs font-semibold px-2.5 py-1";
    const statusKey = (doc.status_key || canonicalize(doc.status_name || "")) || "";
    const statusStyle = DISPATCH_STATUS_BADGES[statusKey] || DISPATCH_STATUS_BADGES.DEFAULT;
    statusBadge.textContent =
      doc.status_name || statusStyle.label || "Đang xử lý";
    statusBadge.className += ` ${statusStyle.classes}`;
    badgeGroup.appendChild(statusBadge);

    li.appendChild(badgeGroup);
    return li;
  }

  function createDispatchItem(dispatch) {
    const li = document.createElement("li");
    li.className = "px-4 py-3 flex items-center justify-between hover:bg-slate-50/60";

    const info = document.createElement("div");
    info.className = "flex items-start gap-3";

    const directionTag = document.createElement("div");
    directionTag.className = "mt-0.5 text-blue-600 font-semibold text-[13px]";
    directionTag.textContent = "OUT";
    info.appendChild(directionTag);

    const detail = document.createElement("div");
    const title = document.createElement("p");
    title.className = "font-medium";
    title.textContent = `VB #${dispatch.document_id ?? "?"}`;
    detail.appendChild(title);

    const meta = document.createElement("p");
    meta.className = "text-[12.5px] text-slate-500";
    const partner =
      dispatch.organization?.name ||
      dispatch.contact?.full_name ||
      "Đơn vị liên quan chưa xác định";
    const method = DISPATCH_METHOD_LABELS[dispatch.method] || dispatch.method || "Phương thức";
    meta.textContent = `${partner} · ${method}`;
    detail.appendChild(meta);

    const tracking = document.createElement("p");
    tracking.className = "text-[12px] text-slate-400";
    const trackingNo = dispatch.tracking_no || "Chưa có tracking";
    const sentAt = dispatch.sent_at ? formatDateTime(dispatch.sent_at) : "Chưa gửi";
    tracking.textContent = `Tracking: ${trackingNo} · ${sentAt}`;
    detail.appendChild(tracking);

    info.appendChild(detail);
    li.appendChild(info);

    const badge = document.createElement("span");
    badge.className = "px-3 py-1.5 rounded-md text-[12px] font-medium";
    const key = (dispatch.status || "").toUpperCase();
    const style = DISPATCH_STATUS_BADGES[key] || DISPATCH_STATUS_BADGES.DEFAULT;
    badge.textContent = style.label;
    badge.className += ` ${style.classes}`;
    li.appendChild(badge);

    return li;
  }

  function createNotificationItem(note) {
    const li = document.createElement("li");
    li.className =
      "px-3 py-3 rounded-lg hover:bg-slate-50 border-b border-slate-100 last:border-b-0";

    const row = document.createElement("div");
    row.className = "flex items-start gap-3";

    const icon = document.createElement("div");
    icon.className = "mt-0.5 text-blue-600";
    icon.textContent = "🔔";
    row.appendChild(icon);

    const body = document.createElement("div");
    body.className = "flex-1";
    const title = document.createElement("p");
    title.className = "font-medium text-[14px]";
    title.textContent = note.title || "Thông báo";
    body.appendChild(title);

    if (note.body) {
      const message = document.createElement("p");
      message.className = "text-[12.5px] text-slate-500";
      message.textContent = note.body;
      body.appendChild(message);
    }

    if (note.sent_at) {
      const timestamp = document.createElement("div");
      timestamp.className = "text-[12px] text-slate-400 mt-1";
      timestamp.textContent = formatDateTime(note.sent_at);
      body.appendChild(timestamp);
    }

    row.appendChild(body);

    const action = document.createElement("button");
    action.type = "button";
    action.className =
      "px-3 py-1.5 rounded-md bg-slate-100 text-[12px] font-medium hover:bg-slate-200";
    action.textContent = note.read ? "Đã đọc" : "Đánh dấu đã đọc";
    if (note.read) {
      action.disabled = true;
    } else {
      action.addEventListener("click", () => markNotificationRead(note.notification_id, action));
    }
    row.appendChild(action);

    li.appendChild(row);
    return li;
  }

  async function markNotificationRead(notificationId, button) {
    if (!notificationId) return;
    button.disabled = true;
    try {
      if (window.NotificationApi?.markNotificationRead) {
        await window.NotificationApi.markNotificationRead(notificationId);
      } else if (window.ApiClient) {
        await window.ApiClient.request(`/api/v1/notifications/${notificationId}/read/`, {
          method: "POST",
        });
      }
      button.textContent = "Đã đọc";
    } catch (error) {
      console.error("[vanthu-dashboard] Failed to load dashboard data:", error);
      button.disabled = false;
    }
  }

  function renderList(containerSelector, items, creator, emptyMessage) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    container.innerHTML = "";
    if (!items.length) {
      const fallback = document.createElement("li");
      fallback.className = "px-3 py-3 text-sm text-slate-500";
      fallback.textContent = emptyMessage;
      container.appendChild(fallback);
      return;
    }
    items.forEach((item) => {
      const node = creator(item);
      if (node) {
        container.appendChild(node);
      }
    });
  }

  function updateKpis(kpiData, leaderData, priorityData, statusEntries) {
    const inboundPending = leaderData?.counts?.approval ?? 0;
    const outboundPending = leaderData?.counts?.sign ?? 0;
    setText(SELECTORS.kpiInbound, inboundPending);
    setText(SELECTORS.kpiOutbound, outboundPending);

    const urgentCount = (priorityData?.URGENT ?? 0) + (priorityData?.HIGH ?? 0);
    setText(SELECTORS.kpiUrgent, urgentCount);

    let archiveTotal = 0;
    if (Array.isArray(statusEntries)) {
      const archived = statusEntries.find(
        (entry) => canonicalize(entry?.name) === "ARCHIVED"
      );
      if (archived) {
        archiveTotal = Number(archived.documents_count || 0);
      }
    }
    if (!archiveTotal) {
      archiveTotal = kpiData?.total_documents?.current ?? 0;
    }
    setText(SELECTORS.kpiArchived, archiveTotal);
  }

  function setLoading(flag) {
    if (document.body) {
      document.body.dataset.dashboardLoading = flag ? "true" : "false";
    }
  }

  function bindNavigation() {
    const navUrl = "/vanthu/vanbanden.html";
    const primary = document.querySelector(SELECTORS.urgentBtn);
    const allBtn = document.querySelector(SELECTORS.urgentAllBtn);
    [primary, allBtn].forEach((btn) => {
      if (btn) {
        btn.addEventListener("click", () => {
          window.location.href = navUrl;
        });
      }
    });
  }

  async function loadDashboard() {
    const api = window.ApiClient;
    if (!api) {
      console.warn("[vanthu-dashboard] ApiClient chưa sẵn sàng.");
      return;
    }

    const processedParam = PROCESSED_STATUS_KEYS.join(",");
    const requests = [
      api.request("/api/v1/analytics/dashboard"),
      api.request("/api/v1/analytics/leader-dashboard", { params: { scope: "personal" } }),
      api.request("/api/v1/analytics/documents/by-priority", {
        params: { scope: "personal" },
      }),
      api.catalog.list("document-statuses", { with_counts: 1 }),
      api.dispatches.list({ ordering: "-sent_at", page_size: 5 }),
      api.notifications.list({ ordering: "-sent_at", page_size: 5 }),
      api.documents.list({
        doc_direction: "den",
        ordering: "-updated_at",
        page_size: 40,
      }),
      api.documents.list({
        doc_direction: "den",
        status: processedParam,
        page_size: 1,
      }),
      api.documents.list({
        doc_direction: "di",
        status: processedParam,
        page_size: 1,
      }),
    ];

    const [
      kpiResult,
      leaderResult,
      priorityResult,
      statusResult,
      dispatchResult,
      notificationsResult,
      urgentDocsResult,
      inboundProcessedResult,
      outboundProcessedResult,
    ] = await Promise.allSettled(requests);

    const kpiData = unwrapSuccess(kpiResult);
    const leaderData = unwrapSuccess(leaderResult);
    const priorityData = unwrapSuccess(priorityResult);
    const statusEntries = statusResult.status === "fulfilled" ? statusResult.value : [];
    const dispatchEntries = safeExtractItems(dispatchResult.value);
    const notifications = safeExtractItems(notificationsResult.value);
    const urgentDocs = safeExtractItems(urgentDocsResult.value);

    const inboundProcessed = extractTotalItems(inboundProcessedResult.value);
    const outboundProcessed = extractTotalItems(outboundProcessedResult.value);
    const inboundTotal = kpiData?.document_counts?.inbound ?? 0;
    const outboundTotal = kpiData?.document_counts?.outbound ?? 0;

    updateKpis(kpiData, leaderData, priorityData, statusEntries);

    updateProgress(inboundProcessed, inboundTotal, {
      done: SELECTORS.inboundDone,
      total: SELECTORS.inboundTotal,
      bar: SELECTORS.inboundBar,
      percent: SELECTORS.inboundPercent,
      tile: SELECTORS.tileInbound,
    });
    updateProgress(outboundProcessed, outboundTotal, {
      done: SELECTORS.outboundDone,
      total: SELECTORS.outboundTotal,
      bar: SELECTORS.outboundBar,
      percent: SELECTORS.outboundPercent,
      tile: SELECTORS.tileOutbound,
    });

    const filteredUrgent = urgentDocs
      .filter((doc) => URGENT_CANONICAL.has(canonicalize(doc?.urgency?.name)))
      .slice(0, 5);
    renderList(
      SELECTORS.urgentList,
      filteredUrgent,
      createUrgentItem,
      "Không có văn bản khẩn cấp trong danh sách."
    );

    renderList(
      SELECTORS.dispatchList,
      dispatchEntries,
      createDispatchItem,
      "Không có thông tin phát hành nào."
    );

    renderList(
      SELECTORS.notificationList,
      notifications,
      createNotificationItem,
      "Không có thông báo mới."
    );
  }

  function ensureAuthReady() {
    const layout = window.Layout;
    if (layout?.authPromise && typeof layout.authPromise.then === "function") {
      return layout.authPromise;
    }
    if (layout?.ensureUser && typeof layout.ensureUser === "function") {
      return layout.ensureUser();
    }
    return Promise.resolve(null);
  }

  window.initVanThuDashboard = function initVanThuDashboard() {
    if (state.loading) {
      return;
    }
    state.loading = true;
    setLoading(true);
    ensureAuthReady()
      .then(() => loadDashboard())
      .catch((error) => {
        console.error("[vanthu-dashboard] Failed to load dashboard data:", error);
      })
      .finally(() => {
        state.loading = false;
        setLoading(false);
      });
    bindNavigation();
  };

})();
