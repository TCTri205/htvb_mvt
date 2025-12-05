(function () {
  // CRITICAL: Set this flag FIRST, before any checks, to prevent chuyenvien.js from running old code
  window.CVOutgoingListOverride = true;
  
  const PAGE_ID = "vanbandi";
  const STATUS_META = {
    DRAFT: { label: "Dự thảo", classes: "bg-slate-100 text-slate-700" },
    SUBMITTED: { label: "Đã trình", classes: "bg-blue-100 text-blue-700" },
    APPROVED: { label: "Đã ký duyệt", classes: "bg-emerald-50 text-emerald-700" },
    PENDING_CLERK_CHECK: { label: "Chờ kiểm tra", classes: "bg-yellow-100 text-yellow-700" },
    REGISTERED: { label: "Đã vào sổ", classes: "bg-purple-100 text-purple-700" },
    ISSUED: { label: "Đã phát hành", classes: "bg-green-100 text-green-700" },
    ARCHIVED: { label: "Đã lưu trữ", classes: "bg-gray-100 text-gray-700" },
    HUY_PHAT_HANH: { label: "Hủy phát hành", classes: "bg-rose-100 text-rose-700" },
  };

  const URGENCY_BADGES = {
    ratkhan: { label: "Rất khẩn", classes: "chip chip-danger" },
    khan: { label: "Khẩn", classes: "chip chip-danger" },
    cao: { label: "Cao", classes: "chip chip-info" },
    thuong: { label: "Thường", classes: "chip chip-muted" },
  };

  if ((document.body?.dataset?.page || "").toLowerCase() !== PAGE_ID) {
    return;
  }

  const api = window.ApiClient;
  const docApi = api?.documents;
  if (!docApi) {
    console.warn("[chuyenvien] Document API không sẵn sàng.");
    return;
  }

  const tableBody = document.getElementById("docTableBody");
  const statusSelect = document.querySelector('select[data-filter="status"]');
  const levelSelect = document.querySelector('select[data-filter="level"]');
  const searchInput = document.querySelector('input[data-filter="q"]');
  const summaryCount = document.querySelector("[data-count='rows']");
  const state = { q: "", status: "", level: "", page: 1, pageSize: 20, myTasks: false };
  const btnMyTasks = document.getElementById("btnMyTasks");

  const layout = window.Layout || {};
  const ready =
    layout.authPromise && typeof layout.authPromise.then === "function"
      ? layout.authPromise
      : Promise.resolve();

  ready
    .then(() => {
      attachFilters();
      loadDocuments();
    })
    .catch(() => renderEmpty("Không thể xác thực người dùng hiện tại."));

  function attachFilters() {
    if (statusSelect) {
      statusSelect.addEventListener("change", () => {
        state.status = statusSelect.value || "";
        state.page = 1;
        loadDocuments();
      });
    }
    if (levelSelect) {
      levelSelect.addEventListener("change", () => {
        state.level = levelSelect.value || "";
        state.page = 1;
        loadDocuments();
      });
    }
    if (searchInput) {
      const handler = debounce(() => {
        state.q = (searchInput.value || "").trim();
        state.page = 1;
        loadDocuments();
      }, 250);
      searchInput.addEventListener("input", handler);
    }
    // My Tasks filter button
    if (btnMyTasks) {
      btnMyTasks.addEventListener("click", () => {
        state.myTasks = !state.myTasks;
        btnMyTasks.classList.toggle("active", state.myTasks);
        state.page = 1;
        loadDocuments();
      });
    }
  }

  function buildFilters() {
    const filters = {
      direction: "OUTBOUND",
      ordering: "-created_at",
      page: state.page,
      page_size: state.pageSize,
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
    if (!tableBody) return;
    renderLoading();
    docApi
      .list(buildFilters())
      .then((payload) => {
        const items = api.extractItems ? api.extractItems(payload) || [] : [];
        renderRows(items);
        updateSummary(items.length);
      })
      .catch((error) => {
        console.error("[chuyenvien] Lỗi tải văn bản đi:", error);
        renderEmpty("Không thể tải danh sách.");
      });
  }

  function renderRows(items) {
    if (!tableBody) return;
    // Apply myTasks filter (client-side)
    let filtered = items || [];
    if (state.myTasks) {
      const AI = window.ActionIndicator;
      if (AI && typeof AI.outboundNeedsAction === "function") {
        filtered = filtered.filter((doc) => AI.outboundNeedsAction(doc));
      }
    }
    if (!filtered.length) {
      renderEmpty("Không có văn bản phù hợp.");
      updateSummary(0);
      return;
    }
    tableBody.innerHTML = "";
    const fragment = document.createDocumentFragment();
    filtered.forEach((doc) => fragment.appendChild(createRow(doc)));
    tableBody.appendChild(fragment);
    updateSummary(filtered.length);
  }

  function renderLoading() {
    if (!tableBody) return;
    tableBody.innerHTML =
      '<tr><td colspan="7" class="py-6 text-center text-sm text-slate-500">Đang tải dữ liệu văn bản đi…</td></tr>';
  }

  function renderEmpty(message) {
    if (!tableBody) return;
    tableBody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-sm text-rose-600">${escapeHtml(
      message
    )}</td></tr>`;
  }

  function updateSummary(count) {
    if (!summaryCount) return;
    summaryCount.textContent = String(count || 0);
  }

  function createRow(doc) {
    // Check if document needs action from current user
    const AI = window.ActionIndicator;
    const needsAction = AI && typeof AI.outboundNeedsAction === "function" ? AI.outboundNeedsAction(doc) : false;
    
    const row = document.createElement("tr");
    row.className = "hover:bg-slate-50/60" + (needsAction ? " action-card" : "");
    row.dataset.needsAction = needsAction ? "1" : "0";
    const detailId = doc.id || doc.document_id || doc.pk || "";
    const detailUrl = detailId
      ? `/chuyenvien/vanbandi/${encodeURIComponent(detailId)}/`
      : "/chuyenvien/vanbandi.html";
    const statusKey = normalizeStatus(
      doc.status?.code || doc.status?.name || doc.status || doc.state || doc.status_name
    );
    const statusMeta = STATUS_META[statusKey] || {
      label: statusKey.replace(/_/g, " "),
      classes: "bg-slate-100 text-slate-700",
    };
    const urgencyKey = getUrgencyLevel(doc);
    const urgencyBadge = URGENCY_BADGES[urgencyKey] || URGENCY_BADGES.thuong;
    const number = doc.document_code || doc.issue_number || "—";
    const issue = formatDate(doc.issued_date || doc.created_at);
    const dispatch = formatDate(doc.dispatched_date || doc.dispatched_at || doc.published_date);
    const recipients = doc.recipients || doc.receiver || "—";
    const due = formatDate(doc.expected_finish || doc.due_date);
    const signer =
      doc.signer?.full_name || doc.creator?.full_name || doc.signer || "—";

    row.innerHTML = `
      <td class="py-2 pr-3">
        <a
          href="${escapeHtml(detailUrl)}"
          class="text-blue-700 font-semibold hover:underline"
        >
          ${escapeHtml(doc.title || doc.subject || "Văn bản đi")}
        </a>
        <div class="text-[12px] text-slate-500">
          Người ký: ${escapeHtml(signer)}
        </div>
      </td>
      <td class="py-2 px-3 text-[12px] text-slate-500">
        ${escapeHtml(number)}
      </td>
      <td class="py-2 px-3">
        <div class="text-[12px] text-slate-500">Ký: ${escapeHtml(issue)}</div>
        <div class="text-[12px] text-slate-500">Phát hành: ${escapeHtml(dispatch)}</div>
      </td>
      <td class="py-2 px-3 text-[12px] text-slate-500">
        ${escapeHtml(recipients)}
      </td>
      <td class="py-2 px-3 text-[12px] text-slate-500 space-y-1">
        <span class="${urgencyBadge.classes}">${escapeHtml(urgencyBadge.label)}</span>
      </td>
      <td class="py-2 px-3 whitespace-nowrap">
        <span class="px-2.5 py-1 rounded-full text-[12px] font-semibold ${statusMeta.classes}">
          ${escapeHtml(statusMeta.label)}
        </span>
      </td>
      <td class="py-2 pl-3 pr-0 text-right text-[12px] relative">
        ${needsAction ? '<span class="action-indicator" style="position:absolute;top:8px;right:8px;width:8px;height:8px;background:#22c55e;border-radius:50%;animation:action-pulse 2s ease-in-out infinite;"></span>' : ''}
        <a
          href="${escapeHtml(detailUrl)}"
          class="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
        >
          Chi tiết
        </a>
      </td>
    `;
    return row;
  }

  function normalizeStatus(value) {
    if (!value) return "DRAFT";
    return value.toString().trim().toUpperCase().replace(/\s+/g, "_");
  }

  function getUrgencyLevel(doc) {
    const raw =
      (doc.important_level || doc.urgency?.name || doc.urgency?.code || doc.urgency_level || "")
        .toString()
        .toLowerCase();
    if (/rat|hỏa/.test(raw)) return "ratkhan";
    if (/khan/.test(raw)) return "khan";
    if (/cao/.test(raw)) return "cao";
    return "thuong";
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      const pure = String(value).split("T")[0];
      return pure ? pure.split("-").reverse().join("/") : String(value);
    }
    return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}/${date.getFullYear()}`;
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

  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }
})();
