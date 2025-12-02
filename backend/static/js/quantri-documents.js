(function () {
  const PAGE_ROUTE = "/quantri/quanlyhethong.html";
  const inboundStatuses = [
    "RECEIVED",
    "WAITING_ASSIGNMENT",
    "PROCESSING",
    "PENDING_LEADER_APPROVAL",
    "REGISTERED",
    "DISPATCHED",
  ];
  const outboundStatuses = [
    "DRAFT",
    "SUBMITTED",
    "APPROVED",
    "PENDING_CLERK_CHECK",
    "REGISTERED",
    "ISSUED",
  ];

  function getDocumentApi() {
    const api = window.ApiClient;
    return api?.documents ?? null;
  }

  function extractItems(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.results)) return payload.results;
    if (Array.isArray(payload.items)) return payload.items;
    return [];
  }

  function updateKpiCards(summary = {}, analytics = {}) {
    const serverText = document.getElementById("qt-card-server-text");
    const serverMeta = document.getElementById("qt-card-server-meta");
    const latestSync = summary?.latest_sync;
    if (serverText) {
      serverText.textContent = latestSync
        ? "Hoạt động ổn định"
        : "Đang kiểm tra kết nối";
    }
    if (serverMeta) {
      serverMeta.textContent = latestSync
        ? `Đồng bộ lúc ${formatDateTime(latestSync)}`
        : "Chưa có dữ liệu hệ thống";
    }

    const totalCases = Number(summary?.total_cases) || 0;
    const totalDocs = Number(summary?.total_documents) || 0;
    const dbText = document.getElementById("qt-card-db-text");
    const dbMeta = document.getElementById("qt-card-db-meta");
    if (dbText) {
      dbText.textContent = `${formatNumber(totalCases)} hồ sơ`;
    }
    if (dbMeta) {
      dbMeta.textContent = `${formatNumber(totalDocs)} văn bản`;
    }

    const securityText = document.getElementById("qt-card-security-text");
    if (securityText) {
      securityText.textContent = `${formatNumber(
        Number(summary?.pending_queue) || 0
      )} tác vụ đang chờ`;
    }
    const securityMeta = document.getElementById("qt-card-security-meta");
    if (securityMeta) {
      const inbound = analytics?.document_counts?.inbound ?? 0;
      const outbound = analytics?.document_counts?.outbound ?? 0;
      if (inbound || outbound) {
        securityMeta.textContent = `Đến ${formatNumber(inbound)} • Đi ${formatNumber(
          outbound
        )}`;
      } else {
        securityMeta.textContent = "Đang tổng hợp dữ liệu";
      }
    }

    const storage = summary?.storage || {};
    const used = Number(storage?.total_bytes) || 0;
    const capacity = Number(storage?.capacity_bytes) || 0;
    const storageText = document.getElementById("qt-card-storage-text");
    if (storageText) {
      const percent = capacity
        ? Math.min(100, Math.round((used / capacity) * 100))
        : 0;
      storageText.textContent = `${percent}% đã sử dụng`;
    }
    const storageMeta = document.getElementById("qt-card-storage-meta");
    if (storageMeta) {
      storageMeta.textContent = capacity
        ? `${humanReadableStorage(used)} / ${humanReadableStorage(capacity)}`
        : "Đang thu thập dữ liệu lưu trữ";
    }
  }

  function updatePerformance(summary = {}, analytics = {}) {
    const efficiency = Number(analytics?.processing_efficiency?.rate) || 0;
    const overdue = Number(analytics?.overdue_rate?.rate) || 0;
    const queueCount = Number(summary?.pending_queue) || 0;
    const totalDocs = Number(summary?.total_documents) || 0;
    const queuePercent = totalDocs
      ? Math.min(100, Math.round((queueCount / totalDocs) * 100))
      : 0;

    const efficiencyEl = document.getElementById("qt-perf-efficiency");
    const efficiencyBar = document.getElementById("qt-perf-efficiency-bar");
    if (efficiencyEl) {
      efficiencyEl.textContent = `${efficiency}%`;
    }
    if (efficiencyBar) {
      efficiencyBar.style.width = `${Math.min(100, Math.max(0, efficiency))}%`;
    }

    const overdueEl = document.getElementById("qt-perf-overdue");
    const overdueBar = document.getElementById("qt-perf-overdue-bar");
    if (overdueEl) {
      overdueEl.textContent = `${overdue}%`;
    }
    if (overdueBar) {
      overdueBar.style.width = `${Math.min(100, Math.max(0, overdue))}%`;
    }

    const queueEl = document.getElementById("qt-perf-queue");
    const queueBar = document.getElementById("qt-perf-queue-bar");
    if (queueEl) {
      queueEl.textContent = `${formatNumber(queueCount)} tác vụ đang chờ`;
    }
    if (queueBar) {
      queueBar.style.width = `${queuePercent}%`;
    }
  }

  function renderMaintenanceSchedule(backups = [], queueItems = []) {
    const tbody = document.getElementById("qt-maintenance-body");
    if (!tbody) return;
    const rows = [];

    if (backups.length) {
      backups.slice(0, 3).forEach((backup) => {
        const title = escapeHtml(backup?.title || "Sao lưu hệ thống");
        const statusLabel = escapeHtml(
          backup?.status_label || backup?.status || "—"
        );
        const time = formatDateTime(backup?.created_at);
        const size = humanReadableStorage(Number(backup?.size_bytes) || 0);
        rows.push(`
          <tr>
            <td class="py-2 pr-4 font-medium text-slate-700">
              ${title}
              <div class="text-[11px] text-slate-500">
                ${size !== "0 GB" ? `Kích thước: ${size}` : ""}
              </div>
            </td>
            <td class="py-2 pr-4">${time || "—"}</td>
            <td class="py-2 pr-4 text-emerald-600 font-medium">${statusLabel}</td>
            <td class="py-2 pr-2 text-right">
              <button
                class="inline-flex items-center justify-center gap-2 h-8 px-3 rounded-md border border-slate-200 bg-white text-[12px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                data-action="refresh-archive"
              >
                Làm mới
              </button>
            </td>
          </tr>
        `);
      });
    }

    if (queueItems.length) {
      queueItems.slice(0, 3).forEach((item) => {
        const label = escapeHtml(item?.label || "Tác vụ lưu trữ");
        const statusLabel = escapeHtml(item?.status_label || item?.status || "—");
        const time = formatDateTime(item?.created_at || item?.started_at);
        const metaParts = [];
        if (item?.category) {
          metaParts.push(`Danh mục: ${escapeHtml(item.category)}`);
        }
        if (typeof item?.progress === "number") {
          metaParts.push(`Tiến độ: ${Math.round(item.progress)}%`);
        }
        rows.push(`
          <tr>
            <td class="py-2 pr-4 font-medium text-slate-700">
              ${label}
              ${metaParts.length ? `<div class="text-[11px] text-slate-500">${metaParts.join(" • ")}</div>` : ""}
            </td>
            <td class="py-2 pr-4">${time || "—"}</td>
            <td class="py-2 pr-4 text-amber-600 font-medium">${statusLabel}</td>
            <td class="py-2 pr-2 text-right">
              <button
                class="inline-flex items-center justify-center gap-2 h-8 px-3 rounded-md border border-slate-200 bg-white text-[12px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                data-action="refresh-archive"
              >
                Làm mới
              </button>
            </td>
          </tr>
        `);
      });
    }

    if (!rows.length) {
      rows.push(`
        <tr>
          <td colspan="4" class="py-4 text-sm text-slate-500 text-center">
            Hiện không có lịch bảo trì cụ thể.
          </td>
        </tr>
      `);
    }

    tbody.innerHTML = rows.join("");
  }

  async function fetchAnalyticsDashboard() {
    const api = window.ApiClient;
    if (!api?.request) {
      throw new Error("API analytics chưa sẵn sàng");
    }
    return api.request("/api/v1/analytics/dashboard");
  }

  function updateStatusCounts(directionKey, statuses, counts = {}) {
    statuses.forEach((status) => {
      const el = document.getElementById(`qt-${directionKey}-${status}`);
      if (!el) return;
      const value = Number.isFinite(counts[status]) ? counts[status] : 0;
      el.textContent = formatNumber(value);
    });
  }

  async function loadDocumentStatusSummary() {
    const api = window.ApiClient;
    if (!api?.request) {
      return;
    }
    try {
      const response = await api.request("/api/v1/analytics/documents/status-summary");
      const data = response?.data || response || {};
      updateStatusCounts("inbound", inboundStatuses, data.INBOUND);
      updateStatusCounts("outbound", outboundStatuses, data.OUTBOUND);
    } catch (error) {
      console.error("[quantri] loadDocumentStatusSummary failed", error);
    }
  }

  async function loadArchiveData() {
    const archive = window.ApiClient?.archive;
    if (!archive) return;
    try {
      const [summaryRes, backupsRes, queueRes, analyticsRes] = await Promise.all([
        archive.summary(),
        archive.backups.list({ page_size: 3 }),
        archive.queue.list({ page_size: 3 }),
        fetchAnalyticsDashboard(),
      ]);
      const summary = summaryRes?.data ?? summaryRes ?? {};
      const backups = extractItems(backupsRes);
      const queueItems = extractItems(queueRes);
      const analyticsData = analyticsRes?.data ?? analyticsRes ?? {};
      updateKpiCards(summary, analyticsData);
      updatePerformance(summary, analyticsData);
      renderMaintenanceSchedule(backups, queueItems);
    } catch (error) {
      console.error("[quantri] loadArchiveData failed", error);
      const body = document.getElementById("qt-maintenance-body");
      if (body) {
        body.innerHTML = `
          <tr>
            <td colspan="4" class="py-4 text-sm text-rose-500 text-center">
              Không thể tải lịch bảo trì.
            </td>
          </tr>
        `;
      }
      showToast("Không thể tải dữ liệu hệ thống", "error");
    }
  }

  const AUDIT_ACTIONS = new Set(["CREATE", "UPDATE", "DELETE", "LOGIN", "EXPORT", "APPROVE"]);
  const AUDIT_ENTITIES = new Set(["document", "case", "user", "other"]);

  const auditFilterRefs = {
    form: null,
    action: null,
    entity: null,
    actor: null,
  };

  async function resolveActorId(value) {
    if (!value) return null;
    const numeric = Number.parseInt(value, 10);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }
    const api = window.ApiClient;
    if (!api?.users?.list) {
      return null;
    }
    try {
      const response = await api.users.list({ q: value, page_size: 1 });
      const items = Array.isArray(response?.items)
        ? response.items
        : response?.data ?? response;
      const normalized = Array.isArray(items) ? items : Array.isArray(response?.data) ? response.data : [];
      const first = normalized[0];
      if (first && first.user_id) {
        return first.user_id;
      }
    } catch (error) {
      console.error("[quantri] resolveActorId failed", error);
    }
    return null;
  }

  function collectAuditFilters(refs = auditFilterRefs) {
    const filters = {};
    const actionValue = refs.action?.value?.trim();
    const entityValue = refs.entity?.value?.trim();
    const actorValue = refs.actor?.value?.trim();
    if (actionValue) {
      filters.action = actionValue.toUpperCase();
    }
    if (entityValue) {
      const normalized = entityValue.toLowerCase();
      if (AUDIT_ENTITIES.has(normalized)) {
        filters.entity_type = normalized;
      }
    }
    if (actorValue) filters.actor = actorValue;
    return filters;
  }

  function renderAuditLogs(logs = []) {
    const container = document.getElementById("qt-audit-log-list");
    if (!container) return;
    if (!logs.length) {
      container.innerHTML = `<li class="rounded-lg border border-slate-100 p-3 text-[13px] text-slate-500">Chưa có nhật ký hoạt động.</li>`;
      return;
    }
    container.innerHTML = logs
      .slice(0, 6)
      .map((item) => {
        const time = formatDateTime(item.at || item.created_at || item.timestamp);
        const ip = item.ip || "—";
        const action = item.action || "Hành động";
        const entity = item.entity_type || "Hệ thống";
        const details = item.after_json || item.before_json || "";
        return `<li class="rounded-lg border border-slate-100 p-3">
          <div class="flex items-center justify-between">
            <span class="font-semibold text-slate-700">${escapeHtml(time || "—")} • ${escapeHtml(action)}</span>
            <span class="text-[12px] text-slate-500">IP: ${escapeHtml(ip)}</span>
          </div>
          <p class="mt-1 text-[12.5px] text-slate-600">Đối tượng: ${escapeHtml(entity || "—")}</p>
          <p class="mt-1 text-[12.5px] text-slate-500 line-clamp-2">${escapeHtml(
            details
          )}</p>
        </li>`;
      })
      .join("");
  }

  async function loadAuditLogs(filters = {}) {
    const auditApi = window.ApiClient?.audit;
    const container = document.getElementById("qt-audit-log-list");
    if (!auditApi || !container) return;
    container.innerHTML = `<li class="rounded-lg border border-slate-100 p-3 text-[13px] text-slate-500">Đang tải nhật ký...</li>`;
    const params = { page_size: 10 };
    Object.entries(filters || {}).forEach(([key, value]) => {
      if (value) {
        params[key] = value;
      }
    });
    if (params.actor) {
      const resolved = await resolveActorId(String(params.actor));
      if (resolved) {
        params.actor = resolved;
      } else {
        delete params.actor;
      }
    }
    try {
      const response = await auditApi.list(params);
      const logs = extractItems(response);
      renderAuditLogs(logs);
    } catch (error) {
      console.error("[quantri] loadAuditLogs failed", error);
      container.innerHTML = `<li class="rounded-lg border border-slate-100 p-3 text-[13px] text-rose-500">Không thể tải nhật ký.</li>`;
      showToast("Không thể tải nhật ký hệ thống", "error");
    }
  }

  async function queueMaintenanceJob(label, category) {
    const queueApi = window.ApiClient?.archive?.queue;
    if (!queueApi) {
      showToast("Không thể đưa tác vụ vào hàng đợi", "error");
      return;
    }
    try {
      await queueApi.create({ label, category });
      showToast("Đã tạo tác vụ kiểm tra hạ tầng.", "success");
      await loadArchiveData();
    } catch (error) {
      console.error("[quantri] queueMaintenanceJob failed", error);
      showToast("Không thể khởi tạo tác vụ", "error");
    }
  }

  async function triggerBackup() {
    const backupApi = window.ApiClient?.archive?.backups;
    if (!backupApi) {
      showToast("Không thể khởi tạo sao lưu", "error");
      return;
    }
    try {
      await backupApi.create({ method: "manual" });
      showToast("Yêu cầu sao lưu đã được gửi.", "success");
      await loadArchiveData();
    } catch (error) {
      console.error("[quantri] triggerBackup failed", error);
      showToast("Không thể tạo sao lưu mới", "error");
    }
  }

  function showToast(message, type = "info") {
    if (window.AdminRuntime && typeof window.AdminRuntime.toast === "function") {
      window.AdminRuntime.toast(message, type);
    } else {
      console[type === "error" ? "error" : "log"](message);
    }
  }

  async function handleAction(event) {
    event.preventDefault();
    const action = event.currentTarget?.dataset?.action;
    if (!action) return;
    if (action === "health") {
      await loadArchiveData();
    } else if (action === "optimize-db") {
      await queueMaintenanceJob("Kiểm tra tính toàn vẹn dữ liệu", "integrity");
    } else if (action === "backup") {
      await triggerBackup();
    } else if (action === "audit") {
      await loadAuditLogs(collectAuditFilters());
    } else if (action === "fw-reload") {
      showToast("Đã nạp lại tường lửa (giả lập).", "success");
    } else if (action === "security-patch") {
      showToast("Đang kiểm tra bản vá (giả lập).", "info");
    } else if (action === "view-logs") {
      document.getElementById("qt-audit-log-list")?.scrollIntoView({
        behavior: "smooth",
      });
    } else if (action === "refresh-archive") {
      await loadArchiveData();
    }
  }

  function bindActionButtons() {
    document.querySelectorAll("[data-action]").forEach((btn) => {
      btn.removeEventListener("click", handleAction);
      btn.addEventListener("click", handleAction);
    });
  }

  function waitForApiClient(timeout = 4000) {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        if (window.ApiClient?.documents) {
          resolve();
          return;
        }
        if (Date.now() - start >= timeout) {
          resolve();
          return;
        }
        setTimeout(check, 100);
      };
      check();
    });
  }

  async function init() {
    if (!document.body?.dataset?.page) return;
    const current = document.body.dataset.page.toLowerCase();
    if (current !== "quanlyhethong") {
      return;
    }
    await waitForApiClient();
    const docApi = getDocumentApi();
    if (!docApi) {
      console.warn("[quantri] Document API không sẵn sàng.");
      return;
    }
    await loadDocumentStatusSummary();
    auditFilterRefs.form = document.getElementById("qt-log-filter-form");
    auditFilterRefs.action = document.getElementById("qt-log-filter-action");
    auditFilterRefs.entity = document.getElementById("qt-log-filter-entity");
    auditFilterRefs.actor = document.getElementById("qt-log-filter-actor");
    auditFilterRefs.form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      await loadAuditLogs(collectAuditFilters());
    });
    loadArchiveData();
    loadAuditLogs();
    bindActionButtons();
  }

  document.addEventListener("DOMContentLoaded", () => {
    init().catch((error) => console.error("[quantri] init failed", error));
  });
})();
