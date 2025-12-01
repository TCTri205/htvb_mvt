(function () {
  const STATUS_LABELS = {
    RECEIVED: "Tiếp nhận",
    WAITING_ASSIGNMENT: "Chờ phân công",
    PROCESSING: "Đang xử lý",
    PENDING_LEADER_APPROVAL: "Chờ lãnh đạo",
    PENDING_CLERK_CHECK: "Chờ văn thư",
    REGISTERED: "Đã vào sổ",
    DISPATCHED: "Đã phát hành",
    ARCHIVED: "Đã lưu trữ",
    THU_HOI: "Đã thu hồi",
    TIEP_NHAN: "Tiếp nhận",
    PHAN_CONG: "Chờ phân công",
    DANG_XU_LY: "Đang xử lý",
    DANG_KY: "Đã vào sổ",
    HOAN_TAT: "Đã hoàn tất",
    LUU_TRU: "Đã lưu trữ",
  };

  const STATUS_BADGES = {
    RECEIVED: "bg-slate-100 text-slate-700",
    WAITING_ASSIGNMENT: "bg-sky-50 text-sky-600",
    PROCESSING: "bg-amber-100 text-amber-700",
    PENDING_LEADER_APPROVAL: "bg-blue-50 text-blue-700",
    PENDING_CLERK_CHECK: "bg-emerald-100 text-emerald-600",
    REGISTERED: "bg-slate-200 text-slate-700",
    DISPATCHED: "bg-amber-100 text-amber-700",
    ARCHIVED: "bg-slate-200 text-slate-600",
    THU_HOI: "bg-rose-100 text-rose-700",
    TIEP_NHAN: "bg-slate-100 text-slate-700",
    PHAN_CONG: "bg-sky-50 text-sky-600",
    DANG_XU_LY: "bg-amber-100 text-amber-700",
    DANG_KY: "bg-slate-200 text-slate-700",
    HOAN_TAT: "bg-amber-100 text-amber-700",
    LUU_TRU: "bg-slate-200 text-slate-600",
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

  function formatDate(value) {
    if (!value) {
      return "";
    }
    const iso = String(value).split("T")[0];
    const parts = iso.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return String(value);
  }

  function normalizeStatusKey(doc) {
    if (!doc) {
      return "RECEIVED";
    }
    const raw =
      (doc.status?.code || doc.status?.name || doc.status || doc.state || doc.status_name || "")
        .toString()
        .toUpperCase()
        .replace(/\s+/g, "_");
    return raw || "RECEIVED";
  }

  function canonicalStatusKey(doc) {
    const normalized = normalizeStatusKey(doc);
    return STATUS_CANONICAL_MAP[normalized] || normalized;
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

  function buildUrgencyBadge(doc) {
    const level = getUrgencyLevel(doc);
    const badge = URGENCY_BADGES[level] || URGENCY_BADGES.thuong;
    return `<span class="${badge.className}">${escapeHtml(badge.label)}</span>`;
  }

  function resolveErrorMessage(error) {
    if (!error) {
      return "Không thể tải dữ liệu từ máy chủ.";
    }
    if (error.data) {
      if (typeof error.data === "string") return error.data;
      if (error.data.detail) return String(error.data.detail);
      if (error.data.message) return String(error.data.message);
    }
    if (error.message) return String(error.message);
    return "Không thể tải dữ liệu từ máy chủ.";
  }

  function showToast(message, type) {
    const toast = document.getElementById("toast");
    if (!toast) {
      console.log(message);
      return;
    }
    toast.textContent = message;
    toast.classList.remove("show", "toast--success", "toast--error", "toast--warn");
    if (type === "error") {
      toast.classList.add("toast--error");
    } else if (type === "success") {
      toast.classList.add("toast--success");
    } else if (type === "warn") {
      toast.classList.add("toast--warn");
    }
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function createListItem(doc) {
    const rawStatusKey = normalizeStatusKey(doc);
    const statusKey = canonicalStatusKey(doc);
    const detailId = doc.id || doc.document_id || doc.uuid || doc.pk || "";
    const detailUrl = detailId ? `/vanthu/vanbanden/${encodeURIComponent(String(detailId))}/` : "#";
    const label = STATUS_LABELS[statusKey] || STATUS_LABELS[rawStatusKey] || statusKey;
    const badgeClass =
      STATUS_BADGES[statusKey] || STATUS_BADGES[rawStatusKey] || "bg-slate-100 text-slate-600";
    const title = doc.title || doc.subject || "Văn bản đến";
    const summary = doc.summary || doc.note || "";
    const number = doc.number || doc.document_code || doc.incoming_number || "";
    const sender = doc.from_org_name || doc.sender || "";
    const department = doc.main_department_name || doc.department?.name || "";
    const assignee = doc.current_assignee?.full_name || doc.assignee_name || "";
    const receivedAt = formatDate(doc.received_date || doc.created_at);
    const deadline = formatDate(doc.due_date || doc.deadline || doc.expected_finish);
    const urgencyBadge = buildUrgencyBadge(doc);
    const li = document.createElement("li");
    li.className = "bg-white border border-slate-200 rounded-xl p-4 shadow-sm";
    li.innerHTML = `
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h4 class="text-[15px] font-semibold text-slate-800 truncate">${escapeHtml(title)}</h4>
          <div class="mt-2 flex flex-wrap items-center gap-3 text-[12.5px] text-slate-500">
            ${number ? `<span class="inline-flex items-center gap-1">Số: ${escapeHtml(number)}</span>` : ""}
            ${receivedAt ? `<span class="inline-flex items-center gap-1">Ngày đến: ${escapeHtml(receivedAt)}</span>` : ""}
            ${sender ? `<span class="inline-flex items-center gap-1">Cơ quan: ${escapeHtml(sender)}</span>` : ""}
          </div>
        </div>
        <a
          href=${escapeAttr(detailUrl)}
          class="btn-outline rounded-full px-4 py-1 text-[13px] font-medium text-slate-700"
          title="Chi tiết"
          >Chi tiết</a
        >
      </div>
      <div class="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
        <span class="inline-flex items-center gap-1 rounded-full border ${badgeClass} px-2 py-1 font-semibold">
          ${escapeHtml(label)}
        </span>
        ${urgencyBadge}
        ${department ? `<span class="text-slate-600">Phòng: ${escapeHtml(department)}</span>` : ""}
        ${assignee ? `<span class="text-slate-600">Chuyên viên: ${escapeHtml(assignee)}</span>` : ""}
        ${deadline ? `<span class="text-slate-600">Hạn: ${escapeHtml(deadline)}</span>` : ""}
      </div>
      <p class="mt-3 text-[13px] text-slate-500 line-clamp-2">${escapeHtml(summary)}</p>
    `;
    return li;
  }

  if (!window.pageHandlers) {
    window.pageHandlers = {};
  }

  window.pageHandlers["vanbanden"] = function () {
    const api = window.ApiClient;
    const documentApi = api?.documents;
    if (!documentApi) {
      console.warn("[vanthu] Document API không được khởi tạo.");
      return;
    }

    const listEl = document.getElementById("inbox-list");
    const countEl = document.getElementById("total-count");
    const statusLabel = document.getElementById("status-label");
    const statusMenu = document.getElementById("menu-status");
    const levelLabel = document.getElementById("level-label");
    const levelMenu = document.getElementById("menu-level");
    const searchInput = document.getElementById("search-inbox");
    const urgentBtn = document.getElementById("btn-filter-khan");
    const dateFromInput = document.getElementById("filter-received-from");
    const dateToInput = document.getElementById("filter-received-to");

    if (!listEl) {
      console.warn("[vanthu] Không tìm thấy danh sách văn bản đến.");
      return;
    }

    const kpis = {
      RECEIVED: document.getElementById("kpi-received"),
      WAITING_ASSIGNMENT: document.getElementById("kpi-waiting-assignment"),
      PROCESSING: document.getElementById("kpi-processing"),
      PENDING_LEADER_APPROVAL: document.getElementById("kpi-pending-leader-approval"),
      PENDING_CLERK_CHECK: document.getElementById("kpi-pending-clerk-check"),
      REGISTERED: document.getElementById("kpi-registered"),
      DISPATCHED: document.getElementById("kpi-dispatched"),
      ARCHIVED: document.getElementById("kpi-archived"),
    };
    const urgentStatEl = document.getElementById("kpi-khan-cap");

    const state = {
      status: "all",
      level: "all",
      keyword: "",
      receivedFrom: "",
      receivedTo: "",
      page: 1,
      pageSize: 20,
    };

    const layout = window.Layout || {};
    const ready =
      layout.authPromise && typeof layout.authPromise.then === "function"
        ? layout.authPromise
        : Promise.resolve();

    ready
      .then(() => fetchDocuments())
      .catch(() => renderMessage("Không thể xác thực người dùng hiện tại."));

    if (statusMenu) {
      statusMenu.addEventListener("click", (event) => {
        const button = event.target.closest("[data-status]");
        if (!button) return;
        state.status = button.dataset.status || "all";
        if (statusLabel) {
          statusLabel.textContent = button.dataset.label || button.textContent;
        }
        state.page = 1;
        fetchDocuments();
      });
    }

    if (levelMenu) {
      levelMenu.addEventListener("click", (event) => {
        const button = event.target.closest("[data-level]");
        if (!button) return;
        state.level = button.dataset.level || "all";
        if (levelLabel) {
          levelLabel.textContent = button.dataset.label || button.textContent;
        }
        state.page = 1;
        fetchDocuments();
      });
    }

    if (urgentBtn) {
      urgentBtn.addEventListener("click", () => {
        const active = state.level === "khan";
        state.level = active ? "all" : "khan";
        if (levelLabel) {
          levelLabel.textContent = state.level === "khan" ? "Khẩn" : "Tất cả mức độ";
        }
        urgentBtn.classList.toggle("bg-amber-500/10", !active);
        urgentBtn.classList.toggle("border-amber-200", !active);
        state.page = 1;
        fetchDocuments();
      });
    }

    if (searchInput) {
      const handleSearch = debounce(() => {
        state.keyword = (searchInput.value || "").trim();
        state.page = 1;
        fetchDocuments();
      }, 250);
      searchInput.addEventListener("input", handleSearch);
    }

    if (dateFromInput) {
      dateFromInput.addEventListener("change", () => {
        state.receivedFrom = dateFromInput.value || "";
        state.page = 1;
        fetchDocuments();
      });
    }

    if (dateToInput) {
      dateToInput.addEventListener("change", () => {
        state.receivedTo = dateToInput.value || "";
        state.page = 1;
        fetchDocuments();
      });
    }

    function mapLevelParam(level) {
      switch (level) {
        case "thuong":
          return "THUONG";
        case "cao":
          return "CAO";
        case "khan":
          return ["KHAN", "RAT_KHAN"];
        case "ratkhan":
          return "RAT_KHAN";
        default:
          return null;
      }
    }

    function buildFilters() {
      const filters = {
        direction: "INBOUND",
        ordering: "-received_date",
        page: state.page,
        page_size: state.pageSize,
        include: "assignments,dispatches",
      };
      if (state.status && state.status !== "all") {
        filters.status = state.status;
      }
      if (state.keyword) {
        filters.q = state.keyword;
      }
      if (state.receivedFrom) {
        filters.received_date_from = state.receivedFrom;
      }
      if (state.receivedTo) {
        filters.received_date_to = state.receivedTo;
      }
      const levelParam = mapLevelParam(state.level);
      if (levelParam) {
        filters.urgency_level = levelParam;
      }
      return filters;
    }

    function fetchDocuments() {
      renderLoading();
      return documentApi
        .list(buildFilters())
        .then((response) => {
          const items = api.extractItems(response);
          const meta = api.extractPageMeta(response);
          if (countEl) {
            countEl.textContent = String(meta.totalItems || items.length);
          }
          renderList(items);
          updateKPIs(items);
        })
        .catch((error) => {
          const message = resolveErrorMessage(error);
          showToast(message, "error");
          renderMessage(message);
        });
    }

    function renderList(items) {
      if (!listEl) return;
      if (!items || !items.length) {
        renderEmpty();
        return;
      }
      listEl.innerHTML = "";
      const fragment = document.createDocumentFragment();
      items.forEach((doc) => fragment.appendChild(createListItem(doc)));
      listEl.appendChild(fragment);
    }

    function renderLoading() {
      if (!listEl) return;
      listEl.innerHTML =
        '<li class="px-4 py-8 text-center text-sm text-slate-500">Đang tải danh sách văn bản…</li>';
    }

    function renderEmpty() {
      if (!listEl) return;
      listEl.innerHTML =
        '<li class="px-4 py-8 text-center text-sm text-slate-500">Không có văn bản nào phù hợp.</li>';
      updateKPIs([]);
    }

    function updateKPIs(items) {
      const counters = Object.keys(kpis).reduce((acc, key) => {
        acc[key] = 0;
        return acc;
      }, {});
      let urgentCount = 0;
      (items || []).forEach((doc) => {
        const status = canonicalStatusKey(doc);
        if (status in counters) {
          counters[status] += 1;
        }
        const level = getUrgencyLevel(doc);
        if (level === "khan" || level === "ratkhan") {
          urgentCount += 1;
        }
      });
      Object.entries(kpis).forEach(([status, element]) => {
        if (element) {
          element.textContent = String(counters[status] || 0);
        }
      });
      if (urgentStatEl) {
        urgentStatEl.textContent = String(urgentCount);
      }
    }

    function renderMessage(message) {
      if (!listEl) return;
      listEl.innerHTML = `<li class="px-4 py-8 text-center text-sm text-slate-500">${escapeHtml(
        message
      )}</li>`;
    }
  };
})();
