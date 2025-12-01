(function () {
  const PAGE_ID = "vanbandi";
  const STATUS_META = {
    DRAFT: { label: "Dự thảo", className: "bg-slate-100 text-slate-700" },
    SUBMITTED: { label: "Đã trình", className: "bg-blue-100 text-blue-700" },
    PENDING_CLERK_CHECK: { label: "Chờ kiểm tra", className: "bg-yellow-100 text-yellow-700" },
    REGISTERED: { label: "Đã vào sổ", className: "bg-purple-100 text-purple-700" },
    ISSUED: { label: "Đã phát hành", className: "bg-green-100 text-green-700" },
    ARCHIVED: { label: "Đã lưu trữ", className: "bg-gray-100 text-gray-700" },
    HUY_PHAT_HANH: { label: "Hủy phát hành", className: "bg-rose-100 text-rose-700" },
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

  window.VTOutboundListOverride = true;

  const api = window.ApiClient;
  const docApi = api?.documents;
  if (!docApi) {
    console.warn("[vanthu] Document API chưa sẵn sàng; bỏ qua danh sách văn bản đi.");
    return;
  }

  const listEl = document.getElementById("outbox-list");
  const countEl = document.getElementById("total-count");
  const statusBtn = document.getElementById("btn-status");
  const statusMenu = document.getElementById("menu-status");
  const levelBtn = document.getElementById("btn-level");
  const levelMenu = document.getElementById("menu-level");
  const statusLabel = document.getElementById("status-label");
  const levelLabel = document.getElementById("level-label");
  const searchInput = document.getElementById("search-outbox");
  const rangeFromEl = document.getElementById("range-from");
  const rangeToEl = document.getElementById("range-to");
  const rangeTotalEl = document.getElementById("range-total");
  const prevBtn = document.getElementById("btn-prev");
  const nextBtn = document.getElementById("btn-next");
  const kpi = {
    draft: document.getElementById("kpi-soanthao"),
    submitted: document.getElementById("kpi-choky"),
    approved: document.getElementById("kpi-dakyduyet"),
    issued: document.getElementById("kpi-daphathanh"),
  };

  const state = { status: "", level: "", q: "", page: 1, pageSize: 20 };

  const layout = window.Layout || {};
  const ready = layout.authPromise && typeof layout.authPromise.then === "function"
    ? layout.authPromise
    : Promise.resolve();

  ready.then(() => {
    attachDropdown(statusBtn, statusMenu, statusLabel, (value) => {
      state.status = value;
      state.page = 1;
      loadDocuments();
    });
    attachDropdown(levelBtn, levelMenu, levelLabel, (value) => {
      state.level = value;
      state.page = 1;
      loadDocuments();
    });
    attachSearch();
    prevBtn?.addEventListener("click", () => {
      if (state.page > 1) {
        state.page -= 1;
        loadDocuments();
      }
    });
    nextBtn?.addEventListener("click", () => {
      state.page += 1;
      loadDocuments();
    });
    loadDocuments();
  }).catch(() => renderEmpty("Không thể xác thực người dùng hiện tại."));

  function attachDropdown(button, menu, label, onSelect) {
    if (!button || !menu || !label) return;
    button.addEventListener("click", () => {
      menu.classList.toggle("hidden");
    });
    menu.addEventListener("click", (event) => {
      const item = event.target.closest("[data-status], [data-level]");
      if (!item) return;
      const value = item.dataset.status || item.dataset.level || "";
      label.textContent = item.textContent.trim();
      menu.classList.add("hidden");
      onSelect(value);
    });
    document.addEventListener("click", (event) => {
      if (!menu.contains(event.target) && event.target !== button) {
        menu.classList.add("hidden");
      }
    });
  }

  function attachSearch() {
    if (!searchInput) return;
    const handler = debounce(() => {
      state.q = (searchInput.value || "").trim();
      state.page = 1;
      loadDocuments();
    }, 250);
    searchInput.addEventListener("input", handler);
  }

  function buildFilters() {
    const filters = {
      direction: "OUTBOUND",
      ordering: "-created_at",
      page: state.page,
      page_size: state.pageSize,
      include: "assignments,dispatches",
    };
    if (state.status) {
      filters.status = state.status;
    }
    if (state.level) {
      filters.urgency_level = state.level.toUpperCase();
    }
    if (state.q) {
      filters.q = state.q;
    }
    return filters;
  }

  function loadDocuments() {
    if (!listEl) return;
    renderLoading();
    docApi
      .list(buildFilters())
      .then((payload) => {
        const items = api.extractItems(payload) || [];
        renderList(items);
        updateKPIs(items);
        updatePagination(payload, items.length);
        if (countEl) {
          const total = payload?.total_items ?? items.length;
          countEl.textContent = String(total);
        }
      })
      .catch((error) => {
        console.error("[vanthu] Lỗi tải văn bản đi:", error);
        renderEmpty("Không thể tải danh sách văn bản.");
      });
  }

  function renderList(items) {
    if (!listEl) return;
    if (!items.length) {
      renderEmpty("Không có văn bản phù hợp.");
      return;
    }
    listEl.innerHTML = "";
    const fragment = document.createDocumentFragment();
    items.forEach((doc) => {
      fragment.appendChild(createListItem(doc));
    });
    listEl.appendChild(fragment);
  }

  function renderLoading() {
    if (!listEl) return;
    listEl.innerHTML =
      '<li class="bg-white border border-slate-200 rounded-xl p-4 text-[13px] text-slate-500 text-center">Đang tải dữ liệu...</li>';
  }

  function renderEmpty(message) {
    if (!listEl) return;
    listEl.innerHTML = `<li class="bg-white border border-slate-200 rounded-xl p-6 text-[13px] text-rose-600 text-center">${escapeHtml(
      message
    )}</li>`;
  }

  function createListItem(doc) {
    const li = document.createElement("li");
    li.className = "bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3";
    const detailId = doc.id || doc.document_id || doc.pk || "";
    const detailUrl = detailId
      ? `/vanthu/vanbandi/${encodeURIComponent(detailId)}/`
      : "/vanthu/vanbandi/";
    const statusKey = normalizeStatus(
      doc.status?.code || doc.status?.name || doc.status || doc.state || doc.status_name
    );
    const statusMeta = STATUS_META[statusKey] || { label: statusKey.replace(/_/g, " "), className: "bg-slate-100 text-slate-600" };
    const urgency = getUrgency(doc);
    const urgencyBadge = URGENCY_BADGES[urgency] || URGENCY_BADGES.thuong;
    const title = doc.title || doc.subject || "Văn bản đi";
    const number = doc.document_code || doc.issue_number || doc.number || "—";
    const issued = formatDate(doc.issued_date || doc.created_at);
    const signer = doc.signer?.full_name || doc.creator?.full_name || "—";
    const recipients = doc.recipients || doc.receiver || "—";
    const due = formatDate(doc.expected_finish || doc.due_date);

    li.innerHTML = `
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0 space-y-1">
          <h4 class="text-[15px] font-semibold text-slate-800 line-clamp-1">${escapeHtml(
            title
          )}</h4>
          <div class="text-[12px] text-slate-500 flex flex-wrap gap-2">
            <span>Số: ${escapeHtml(number)}</span>
            <span>Ban hành: ${escapeHtml(issued)}</span>
            <span>Người ký: ${escapeHtml(signer)}</span>
          </div>
        </div>
        <a
          href="${escapeHtml(detailUrl)}"
          class="btn-outline rounded-full px-4 py-1 text-[13px] font-medium text-slate-700"
          title="Chi tiết"
          >Chi tiết</a
        >
      </div>
      <div class="flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
        <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${urgencyBadge.className}">
          ${escapeHtml(urgencyBadge.label)}
        </span>
        <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${statusMeta.className}">
          ${escapeHtml(statusMeta.label)}
        </span>
        <span>Người nhận: ${escapeHtml(recipients)}</span>
        <span>Hạn xử lý: ${escapeHtml(due)}</span>
      </div>
    `;
    return li;
  }

  function normalizeStatus(value) {
    if (!value) return "DRAFT";
    return value.toString().trim().toUpperCase().replace(/\s+/g, "_");
  }

  function getUrgency(doc) {
    const raw =
      (doc.important_level || doc.urgency?.name || doc.urgency?.code || doc.urgency_level || "")
        .toString()
        .toLowerCase();
    if (/rat/.test(raw)) return "ratkhan";
    if (/khan/.test(raw)) return "khan";
    if (/cao/.test(raw)) return "cao";
    return "thuong";
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      return String(value).split("T")[0] || String(value);
    }
    return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
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

  function updateKPIs(items) {
    const counters = { draft: 0, submitted: 0, approved: 0, issued: 0 };
    (items || []).forEach((doc) => {
      const status = normalizeStatus(
        doc.status?.code || doc.status?.name || doc.status || doc.state || doc.status_name
      );
      if (status === "DRAFT") counters.draft += 1;
      if (status === "SUBMITTED" || status === "RETURNED") counters.submitted += 1;
      if (status === "APPROVED" || status === "PENDING_CLERK_CHECK") counters.approved += 1;
      if (status === "ISSUED") counters.issued += 1;
    });
    if (kpi.draft) kpi.draft.textContent = counters.draft;
    if (kpi.submitted) kpi.submitted.textContent = counters.submitted;
    if (kpi.approved) kpi.approved.textContent = counters.approved;
    if (kpi.issued) kpi.issued.textContent = counters.issued;
  }

  function updatePagination(payload, currentCount) {
    if (!rangeFromEl || !rangeToEl || !rangeTotalEl) return;
    const meta = api.extractPageMeta ? api.extractPageMeta(payload) : null;
    if (!meta) {
      rangeFromEl.textContent = "1";
      rangeToEl.textContent = String(currentCount || 0);
      rangeTotalEl.textContent = String(currentCount || 0);
      return;
    }
    const total = meta.totalItems || currentCount || 0;
    const page = meta.page || 1;
    const pageSize = meta.pageSize || currentCount || 1;
    const from = Math.min((page - 1) * pageSize + 1, total || 1);
    const to = Math.min(from + Math.max(currentCount - 1, 0), total || from);
    rangeFromEl.textContent = String(from);
    rangeToEl.textContent = String(to);
    rangeTotalEl.textContent = String(total);
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = to >= total;
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }
})();
