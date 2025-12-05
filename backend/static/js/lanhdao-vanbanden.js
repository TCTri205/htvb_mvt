(function () {
  const PAGE_ID = "vanbanden";
  const STATUS_MAP = {
    all: "",
    pending: "WAITING_ASSIGNMENT",
    processing: "PROCESSING",
    new: "RECEIVED",
    approved: "PENDING_LEADER_APPROVAL",
  };
  const LEVEL_MAP = {
    all: "",
    urgent: "KHAN",
    high: "CAO",
    normal: "THUONG",
  };

  const STATUS_INFO = {
    RECEIVED: { label: "Tiếp nhận", className: "bg-slate-100 text-slate-700" },
    WAITING_ASSIGNMENT: { label: "Chờ phân công", className: "bg-sky-50 text-sky-600" },
    PROCESSING: { label: "Đang xử lý", className: "bg-amber-100 text-amber-700" },
    PENDING_LEADER_APPROVAL: { label: "Chờ lãnh đạo", className: "bg-blue-50 text-blue-700" },
    PENDING_CLERK_CHECK: { label: "Chờ văn thư", className: "bg-emerald-100 text-emerald-600" },
    REGISTERED: { label: "Đã vào sổ", className: "bg-slate-200 text-slate-700" },
    DISPATCHED: { label: "Đã phát hành", className: "bg-amber-100 text-amber-700" },
    ARCHIVED: { label: "Đã lưu trữ", className: "bg-slate-200 text-slate-600" },
    THU_HOI: { label: "Đã thu hồi", className: "bg-rose-100 text-rose-700" },
  };

  const STATUS_CANONICAL_MAP = {
    TIEP_NHAN: "RECEIVED",
    PHAN_CONG: "WAITING_ASSIGNMENT",
    DANG_XU_LY: "PROCESSING",
    DANG_KY: "REGISTERED",
    HOAN_TAT: "DISPATCHED",
    LUU_TRU: "ARCHIVED",
  };

  const URGENCY_BADGES = {
    ratkhan: { label: "Rất khẩn", className: "chip chip-danger" },
    khan: { label: "Khẩn", className: "chip chip-danger" },
    cao: { label: "Cao", className: "chip chip-info" },
    thuong: { label: "Thường", className: "chip chip-muted" },
  };

  if ((document.body?.dataset?.page || "").toLowerCase() !== PAGE_ID) {
    return;
  }
  window.LDIncomingListOverride = true;

  const api = window.ApiClient;
  const docApi = api?.documents;
  if (!docApi) {
    console.warn("[lanhdao] Document API chưa sẵn sàng; bỏ qua danh sách văn bản đến.");
    return;
  }

  const docList = document.getElementById("docList");
  const totalLabel = document.getElementById("totalDoc");
  const searchInput = document.getElementById("searchTitle");
  const statusButton = document.getElementById("btnStatusFilter");
  const statusMenu = document.getElementById("statusMenu");
  const statusLabel = document.getElementById("statusLabel");
  const levelButton = document.getElementById("btnLevelFilter");
  const levelMenu = document.getElementById("levelMenu");
  const levelLabel = document.getElementById("levelLabel");
  const kpiPending = document.getElementById("kpiPending");
  const kpiApproved = document.getElementById("kpiApproved");
  const kpiProcessing = document.getElementById("kpiProcessing");
  const kpiUrgent = document.getElementById("kpiUrgent");

  const state = {
    q: "",
    status: "",
    level: "",
    myTasks: false, // Filter for items needing action
  };
  const btnMyTasks = document.getElementById("btnMyTasks");

  const layout = window.Layout || {};
  const ready =
    layout.authPromise && typeof layout.authPromise.then === "function"
      ? layout.authPromise
      : Promise.resolve();

  ready
    .then(() => {
      attachFilterMenus();
      attachSearch();
      loadDocuments();
    })
    .catch(() => renderEmpty("Không thể xác thực người dùng hiện tại."));

  function attachFilterMenus() {
    if (statusButton && statusMenu) {
      statusButton.addEventListener("click", () => {
        statusMenu.classList.toggle("hidden");
      });
      statusMenu.addEventListener("click", (event) => {
        const item = event.target.closest("[data-status]");
        if (!item) return;
        const raw = item.dataset.status || "all";
        state.status = STATUS_MAP[raw] ?? "";
        statusLabel.textContent = item.textContent.trim();
        statusMenu.classList.add("hidden");
        loadDocuments();
      });
      document.addEventListener("click", (event) => {
        if (!statusMenu.contains(event.target) && event.target !== statusButton) {
          statusMenu.classList.add("hidden");
        }
      });
    }
    if (levelButton && levelMenu) {
      levelButton.addEventListener("click", () => {
        levelMenu.classList.toggle("hidden");
      });
      levelMenu.addEventListener("click", (event) => {
        const item = event.target.closest("[data-level]");
        if (!item) return;
        const raw = item.dataset.level || "all";
        state.level = LEVEL_MAP[raw] ?? "";
        levelLabel.textContent = item.textContent.trim();
        levelMenu.classList.add("hidden");
        loadDocuments();
      });
      document.addEventListener("click", (event) => {
        if (!levelMenu.contains(event.target) && event.target !== levelButton) {
          levelMenu.classList.add("hidden");
        }
      });
    }
    // My Tasks filter button
    if (btnMyTasks) {
      btnMyTasks.addEventListener("click", () => {
        state.myTasks = !state.myTasks;
        btnMyTasks.classList.toggle("active", state.myTasks);
        loadDocuments();
      });
    }
  }

  function attachSearch() {
    if (!searchInput) return;
    const handler = debounce(() => {
      state.q = (searchInput.value || "").trim();
      loadDocuments();
    }, 250);
    searchInput.addEventListener("input", handler);
  }

  function buildFilters() {
    const filters = {
      direction: "INBOUND",
      ordering: "-received_date",
      include: "assignments",
    };
    if (state.status) {
      filters.status = state.status;
    }
    if (state.level) {
      filters.urgency_level = state.level;
    }
    if (state.q) {
      filters.q = state.q;
    }
    return filters;
  }

  function loadDocuments() {
    if (!docList) return;
    renderLoading();
    const filters = buildFilters();
    docApi
      .list(filters)
      .then((payload) => {
        const items = api.extractItems(payload) || [];
        renderRows(items);
        updateKPIs(items);
        if (totalLabel) {
          totalLabel.textContent = `(${items.length})`;
        }
      })
      .catch((error) => {
        console.error("[lanhdao] Lỗi tải văn bản đến:", error);
        renderEmpty("Không thể tải danh sách.");
      });
  }

  function renderRows(items) {
    if (!docList) return;
    // Apply client-side myTasks filter
    let filtered = items;
    if (state.myTasks) {
      const AI = window.ActionIndicator;
      if (AI && typeof AI.inboundNeedsAction === "function") {
        filtered = items.filter((doc) => AI.inboundNeedsAction(doc));
      }
    }
    if (!filtered.length) {
      renderEmpty(state.myTasks ? "Không có văn bản cần xử lý." : "Không có văn bản phù hợp.");
      return;
    }
    docList.innerHTML = "";
    const fragment = document.createDocumentFragment();
    filtered.forEach((doc) => fragment.appendChild(createCard(doc)));
    docList.appendChild(fragment);
  }

  function renderLoading() {
    if (!docList) return;
    docList.innerHTML =
      '<div class="px-4 py-8 text-center text-sm text-slate-500">Đang tải văn bản...</div>';
  }

  function renderEmpty(message) {
    if (!docList) return;
    docList.innerHTML = `<div class="px-4 py-8 text-center text-sm text-rose-600">${escapeHtml(
      message
    )}</div>`;
  }

  function escapeHtml(value) {
    return (value || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(String(value || "").trim());
  }

  function createCard(doc) {
    const card = document.createElement("article");
    // Check if document needs action from current user
    const AI = window.ActionIndicator;
    const needsAction = AI && typeof AI.inboundNeedsAction === "function" ? AI.inboundNeedsAction(doc) : false;
    card.className = "bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden" + (needsAction ? " action-card" : "");
    card.dataset.docId = doc.id || doc.document_id || "";
    card.dataset.needsAction = needsAction ? "1" : "0";
    const rawStatusKey = normalizeStatus(
      doc.status?.code || doc.status?.name || doc.status || doc.state || doc.status_name
    );
    const statusKey = canonicalStatus(rawStatusKey);
    const statusMeta = STATUS_INFO[statusKey] ||
      STATUS_INFO[rawStatusKey] || {
      label: statusKey.replace(/_/g, " ") || "Đang xử lý",
      className: "bg-slate-100 text-slate-700",
    };
    const urgency = getUrgencyLevel(doc);
    const urgencyBadge =
      URGENCY_BADGES[urgency] ||
      URGENCY_BADGES.thuong;
    const summary = doc.summary || doc.note || "";
    const assignee = doc.current_assignee?.full_name || doc.current_assignee?.name || "Chưa phân công";
    const assigned = Array.isArray(doc.assignments)
      ? doc.assignments
          .filter((item) => item.role_on_doc?.toLowerCase().includes("chu_tri"))
          .map((item) => item.user?.full_name || item.user?.name || item.user_id)
          .find(Boolean)
      : null;
    const detailId = doc.id || doc.document_id || doc.pk || "";
    const detailUrl = detailId
      ? `/lanhdao/vanbanden/${encodeURIComponent(detailId)}/`
      : "/lanhdao/vanbanden/";
    // Action indicator HTML
    const indicatorHtml = needsAction ? '<span class="action-indicator" title="Cần xử lý"></span>' : '';

    card.innerHTML = `
      ${indicatorHtml}
      <div class="px-4 py-4 space-y-3">
        <div class="flex flex-wrap items-center gap-2 text-[13px] text-slate-500">
          <span class="font-semibold text-slate-800">${escapeHtml(
            doc.title || doc.subject || "Văn bản đến"
          )}</span>
          <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ${urgencyBadge.className}">
            ${escapeHtml(urgencyBadge.label)}
          </span>
          <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ${statusMeta.className}">
            ${escapeHtml(statusMeta.label)}
          </span>
        </div>
        <div class="grid grid-cols-2 gap-4 text-[12px] text-slate-500">
          <div>Số văn bản: <span class="font-semibold text-slate-700">${escapeHtml(
            doc.number || doc.document_code || doc.incoming_number || "—"
          )}</span></div>
          <div>Ngày đến: <span class="font-semibold text-slate-700">${escapeHtml(
            formatDateValue(doc.received_date || doc.created_at)
          )}</span></div>
          <div>Cơ quan gửi: <span class="font-semibold text-slate-700">${escapeHtml(
            doc.from_org_name || doc.sender || "—"
          )}</span></div>
          <div>Hạn xử lý: <span class="font-semibold text-slate-700">${escapeHtml(
            formatDateValue(doc.deadline || doc.due_date || doc.expected_finish)
          )}</span></div>
          <div>Chủ trì: <span class="font-semibold text-slate-700">${escapeHtml(
            assigned || assignee
          )}</span></div>
          <div>Phòng/Loại: <span class="font-semibold text-slate-700">${escapeHtml(
            doc.department?.name || doc.main_department_name || doc.document_type?.name || "—"
          )}</span></div>
        </div>
        <p class="text-[12px] text-slate-500 line-clamp-2">${escapeHtml(summary)}</p>
      </div>
      <div class="px-4 pb-4 flex items-center justify-end gap-2">
        <a
          href="${escapeAttr(detailUrl)}"
          class="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >Chi tiết</a
        >
      </div>
    `;
    return card;
  }

  function formatDateValue(value) {
    if (!value) return "—";
    if (typeof value === "string" && value.length >= 10) {
      return value.slice(0, 10).split("-").reverse().join("/");
    }
    return String(value);
  }

  function normalizeStatus(raw) {
    if (!raw) return "RECEIVED";
    return String(raw).trim().toUpperCase().replace(/\s+/g, "_");
  }

  function canonicalStatus(statusKey) {
    if (!statusKey) return "RECEIVED";
    return STATUS_CANONICAL_MAP[statusKey] || statusKey;
  }

  function getUrgencyLevel(doc) {
    const raw =
      (doc.important_level || doc.urgency_level || doc.urgency?.code || doc.urgency?.name || "")
        .toString()
        .toLowerCase();
    if (/rat/.test(raw)) return "ratkhan";
    if (/khan/.test(raw)) return "khan";
    if (/cao/.test(raw)) return "cao";
    return "thuong";
  }

  function updateKPIs(items) {
    const counts = {
      pending: 0,
      approved: 0,
      processing: 0,
      urgent: 0,
    };
    items.forEach((doc) => {
      const rawStatus = normalizeStatus(
        doc.status?.code || doc.status?.name || doc.status || doc.state || doc.status_name
      );
      const status = canonicalStatus(rawStatus);
      if (status === "WAITING_ASSIGNMENT" || status === "RECEIVED") counts.pending += 1;
      if (status === "PENDING_LEADER_APPROVAL") counts.approved += 1;
      if (status === "PROCESSING") counts.processing += 1;
      const urgency = getUrgencyLevel(doc);
      if (urgency === "khan" || urgency === "ratkhan") counts.urgent += 1;
    });
    if (kpiPending) kpiPending.textContent = counts.pending;
    if (kpiApproved) kpiApproved.textContent = counts.approved;
    if (kpiProcessing) kpiProcessing.textContent = counts.processing;
    if (kpiUrgent) kpiUrgent.textContent = counts.urgent;
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }
})();
