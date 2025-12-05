(function () {
  const PAGE_ID = "vanbanden";
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

  const URGENCY_BADGES = {
    ratkhan: { label: "Rất khẩn", className: "chip chip-danger" },
    khan: { label: "Khẩn", className: "chip chip-danger" },
    cao: { label: "Cao", className: "chip chip-info" },
    thuong: { label: "Thường", className: "chip chip-muted" },
  };

  function formatUser(user) {
    if (!user) return "—";
    if (typeof user === "string") return user;
    if (typeof user === "object") {
      return user.full_name || user.name || user.username || "—";
    }
    return String(user);
  }

  const bodyPage = document.body?.dataset?.page?.toLowerCase();
  if (bodyPage !== PAGE_ID) {
    return;
  }

  window.CVIncomingListOverride = true;

  const api = window.ApiClient;
  const docApi = api?.documents;
  if (!docApi) {
    console.warn("[chuyenvien] Document API chưa sẵn sàng; bỏ qua danh sách văn bản đến.");
    return;
  }

  const layout = window.Layout || {};
  const ready =
    layout.authPromise && typeof layout.authPromise.then === "function"
      ? layout.authPromise
      : Promise.resolve();

  const tableBody = document.getElementById("vbDenBody");
  const statusSelect = document.getElementById("statusFilter");
  const urgencySelect = document.getElementById("urgencyFilter");
  const searchInput = document.getElementById("pageSearch");
  const rangeFromEl = document.getElementById("range-from");
  const rangeToEl = document.getElementById("range-to");
  const rangeTotalEl = document.getElementById("range-total");
  const prevBtn = document.getElementById("btn-prev");
  const nextBtn = document.getElementById("btn-next");

  const state = {
    q: "",
    status: "",
    urgency: "",
    page: 1,
    pageSize: 20,
    myTasks: false, // Filter for items needing action
  };
  const btnMyTasks = document.getElementById("btnMyTasks");

  ready
    .then(() => {
      attachFilters();
      loadDocuments();
    })
    .catch(() => renderErrorRow("Không thể xác thực người dùng hiện tại."));

  function attachFilters() {
    if (statusSelect) {
      statusSelect.addEventListener("change", () => {
        state.status = statusSelect.value || "";
        state.page = 1;
        loadDocuments();
      });
    }
    if (urgencySelect) {
      urgencySelect.addEventListener("change", () => {
        state.urgency = urgencySelect.value || "";
        state.page = 1;
        loadDocuments();
      });
    }
    if (searchInput) {
      const onInput = debounce(() => {
        state.q = (searchInput.value || "").trim();
        state.page = 1;
        loadDocuments();
      }, 250);
      searchInput.addEventListener("input", onInput);
    }
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
      direction: "INBOUND",
      ordering: "-received_date",
      page: state.page,
      page_size: state.pageSize,
      include: "assignments",
    };
    if (state.status) {
      filters.status = state.status;
    }
    if (state.urgency) {
      const mapped = mapUrgencyFilter(state.urgency);
      if (mapped) {
        filters.urgency_level = mapped;
      }
    }
    if (state.q) {
      filters.q = state.q;
    }
    const currentUser = typeof api.getCurrentUser === "function" ? api.getCurrentUser() : null;
    const assigneeId = currentUser?.id || currentUser?.user_id || currentUser?.userId || null;
    if (assigneeId) {
      filters.assignee_id = assigneeId;
    }
    return filters;
  }

  function mapUrgencyFilter(value) {
    const raw = (value || "").toLowerCase();
    switch (raw) {
      case "cao":
        return "CAO";
      case "khan":
        return "KHAN";
      case "hoatoc":
      case "hoả tốc":
      case "hoatoc":
        return "RAT_KHAN";
      default:
        return "THUONG";
    }
  }

  function loadDocuments() {
    renderLoading();
    const filters = buildFilters();
    return docApi
      .list(filters)
      .then((payload) => {
        const items = api.extractItems(payload) || [];
        const meta = api.extractPageMeta ? api.extractPageMeta(payload) : null;
        renderRows(items);
        updatePagination(meta, items.length);
      })
      .catch((error) => {
        console.error("[chuyenvien] Lỗi tải danh sách văn bản đến:", error);
        renderErrorRow("Không thể tải danh sách.");
      });
  }

  function renderRows(items) {
    if (!tableBody) return;
    // Apply myTasks filter (client-side)
    let filtered = items || [];
    if (state.myTasks) {
      const AI = window.ActionIndicator;
      if (AI && typeof AI.inboundNeedsAction === "function") {
        filtered = filtered.filter((doc) => AI.inboundNeedsAction(doc));
      }
    }
    if (!filtered.length) {
      renderEmptyRow();
      return;
    }
    tableBody.innerHTML = "";
    const fragment = document.createDocumentFragment();
    filtered.forEach((doc) => fragment.appendChild(createRow(doc)));
    tableBody.appendChild(fragment);
  }

  function renderLoading() {
    if (!tableBody) return;
    tableBody.innerHTML =
      '<tr><td colspan="10" class="px-4 py-8 text-center text-sm text-slate-500">Đang tải danh sách...</td></tr>';
  }

  function renderEmptyRow() {
    if (!tableBody) return;
    tableBody.innerHTML =
      '<tr><td colspan="10" class="px-4 py-8 text-center text-sm text-slate-500">Không có văn bản nào phù hợp.</td></tr>';
  }

  function renderErrorRow(message) {
    if (!tableBody) return;
    tableBody.innerHTML = `<tr><td colspan="10" class="px-4 py-8 text-center text-sm text-rose-600">${escapeHtml(
      message
    )}</td></tr>`;
  }

  function updatePagination(meta, currentCount) {
    if (!meta) {
      if (prevBtn) prevBtn.disabled = state.page <= 1;
      if (nextBtn) nextBtn.disabled = currentCount < state.pageSize;
      return;
    }
    const total = meta.totalItems || currentCount;
    const page = meta.page || 1;
    const pageSize = meta.pageSize || currentCount || 1;
    const from = Math.min((page - 1) * pageSize + 1, total || 1);
    const to = Math.min(from + Math.max(currentCount - 1, 0), total || from);
    if (rangeFromEl) rangeFromEl.textContent = String(from);
    if (rangeToEl) rangeToEl.textContent = String(to);
    if (rangeTotalEl) rangeTotalEl.textContent = String(total || currentCount);
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = to >= total;
  }

  function createRow(doc) {
    const title = doc.title || doc.subject || "Văn bản đến";
    const number = doc.number || doc.document_code || doc.incoming_number || "—";
    const issued = formatDate(doc.issued_date || doc.received_date);
    const received = formatDate(doc.received_date);
    const department = doc.department?.name || doc.main_department_name || "—";
    const docType =
      doc.document_type?.name ||
      doc.document_type?.code ||
      doc.document_type ||
      doc.category ||
      "—";
    const sender = doc.from_org_name || doc.sender || "—";
    const receivedBy =
      formatUser(doc.received_by) ||
      formatUser(doc.receiver) ||
      "—";
    const assignee = formatUser(doc.current_assignee) || "Chưa phân công";
    const partners = buildPartnerList(doc.assignments || doc.assignments_data || []);
    const due = formatDate(doc.deadline || doc.due_date || doc.expected_finish);
    const rawStatusKey = normalizeStatus(
      doc.status?.code || doc.status?.name || doc.status || doc.state || doc.status_name
    );
    const statusKey = canonicalStatus(rawStatusKey);
    const statusMeta =
      STATUS_INFO[statusKey] ||
      STATUS_INFO[rawStatusKey] || { label: statusKey || rawStatusKey || "—", className: "bg-slate-100 text-slate-600" };
    const urgency = getUrgency(doc);
    const security = doc.security_level || doc.security?.name || "";
    const detailId = doc.id || doc.document_id || doc.pk || "";
    const detailUrl = detailId
      ? `/chuyenvien/vanbanden/${encodeURIComponent(detailId)}/`
      : "/chuyenvien/vanbanden/";

    // Check if document needs action from current user
    const AI = window.ActionIndicator;
    const needsAction = AI && typeof AI.inboundNeedsAction === "function" ? AI.inboundNeedsAction(doc) : false;

    return buildRowHtml({
      title,
      number,
      issued,
      received,
      department,
      docType,
      summary: doc.summary || doc.note || doc.content || "",
      sender,
      receivedBy,
      assignee,
      partners,
      due,
      statusLabel: statusMeta.label,
      statusClass: statusMeta.className,
      urgency,
      security,
      detailUrl,
      needsAction,
    });
  }

  function buildRowHtml(data) {
    const urgencyHtml = renderUrgency(data.urgency);
    const securityBadge = data.security
      ? `<span class="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[12px] font-semibold ml-1">${escapeHtml(
          data.security
        )}</span>`
      : "";
    // Action indicator HTML for rows needing action
    const indicatorHtml = data.needsAction ? '<span class="action-indicator" style="position:absolute;top:8px;left:8px;width:10px;height:10px;background:#22c55e;border-radius:50%;animation:action-pulse 2s ease-in-out infinite;"></span>' : '';
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50/60" + (data.needsAction ? " action-card relative" : "");
    tr.dataset.needsAction = data.needsAction ? "1" : "0";
    tr.innerHTML = `
        ${indicatorHtml}
        <td class="py-3 pl-6 pr-3">
          <div class="font-semibold text-slate-800">${escapeHtml(data.title)}</div>
          <p class="text-[12px] text-slate-500 line-clamp-2">${escapeHtml(
            data.summary || data.title
          )}</p>
        </td>
        <td class="px-3 py-3">
          <div class="text-[12px] text-slate-500">Số: ${escapeHtml(data.number)}</div>
          <div class="text-[12px] text-slate-500">Loại: ${escapeHtml(data.docType)}</div>
        </td>
        <td class="px-3 py-3 whitespace-nowrap text-[12px] text-slate-500">
          <div>Ban hành: ${escapeHtml(data.issued)}</div>
          <div>Đến: ${escapeHtml(data.received)}</div>
        </td>
        <td class="px-3 py-3 text-[12px] text-slate-500">
          <div>Phòng: ${escapeHtml(data.department)}</div>
          <div>Loại: ${escapeHtml(data.docType)}</div>
        </td>
        <td class="px-3 py-3 text-[13px] space-y-1">
          ${urgencyHtml}
          ${securityBadge}
        </td>
        <td class="px-3 py-3 text-[12px] text-slate-500">
          <div>Người gửi: ${escapeHtml(data.sender)}</div>
          <div>Tiếp nhận: ${escapeHtml(data.receivedBy)}</div>
        </td>
        <td class="px-3 py-3 text-[12px] text-slate-500">
          <div>Chủ trì: ${escapeHtml(data.assignee)}</div>
          <div>Phối hợp: ${escapeHtml(data.partners)}</div>
        </td>
        <td class="px-3 py-3 text-[12px] text-slate-500">${escapeHtml(data.due)}</td>
        <td class="px-3 py-3 whitespace-nowrap">
          <span class="px-2.5 py-1 rounded-full ${escapeAttr(data.statusClass)} text-[12px] font-semibold">${escapeHtml(
            data.statusLabel
          )}</span>
        </td>
        <td class="px-3 py-3 text-right">
          <div class="flex items-center justify-end gap-2 pr-3">
            <a
              href="${escapeAttr(data.detailUrl)}"
              class="w-8 h-8 grid place-items-center rounded-full border border-slate-200 hover:bg-slate-100"
              title="Chi tiết"
            >👁</a>
            <button
              class="w-8 h-8 grid place-items-center rounded-full border border-slate-200 hover:bg-slate-100"
              type="button"
              title="Nhật ký"
            >🗂</button>
            <button
              class="w-8 h-8 grid place-items-center rounded-full border border-slate-200 hover:bg-slate-100"
              type="button"
              title="Tải xuống"
            >⬇</button>
          </div>
        </td>
      `;
    return tr;
  }

  function renderUrgency(level) {
    if (!level) {
      return "";
    }
    const key = level.toLowerCase();
    const badge = URGENCY_BADGES[key] || URGENCY_BADGES.thuong;
    return `<span class="${badge.className}">${badge.label}</span>`;
  }

  function buildPartnerList(assignments) {
    if (!Array.isArray(assignments) || !assignments.length) {
      return "—";
    }
    const partners = assignments
      .filter((item) => String(item.role_on_doc || item.role || "")
        .toLowerCase()
        .includes("phoi"))
      .map((item) => formatUser(item.user || item.assignee || item.user_id));
    if (!partners.length) {
      return "—";
    }
    return partners.join(", ");
  }

  const STATUS_CANONICAL_MAP = {
    TIEP_NHAN: "RECEIVED",
    PHAN_CONG: "WAITING_ASSIGNMENT",
    DANG_XU_LY: "PROCESSING",
    DANG_KY: "REGISTERED",
    HOAN_TAT: "DISPATCHED",
    LUU_TRU: "ARCHIVED",
  };

  function normalizeStatus(value) {
    if (!value) return "RECEIVED";
    return value.toString().trim().toUpperCase().replace(/\s+/g, "_");
  }

  function canonicalStatus(statusKey) {
    if (!statusKey) return "RECEIVED";
    return STATUS_CANONICAL_MAP[statusKey] || statusKey;
  }

  function getUrgency(doc) {
    const raw =
      doc.important_level ||
      doc.urgency?.name ||
      doc.urgency?.code ||
      doc.urgency_level ||
      "";
    if (!raw) return "thuong";
    if (/rat/.test(raw.toLowerCase())) return "ratkhan";
    if (/khan/.test(raw.toLowerCase())) return "khan";
    if (/cao/.test(raw.toLowerCase())) return "cao";
    return "thuong";
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(String(value).replace(/\.\d+Z$/, "Z"));
    if (Number.isNaN(date.getTime())) {
      return String(value).split("T")[0] || String(value);
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

  function escapeAttr(value) {
    return escapeHtml(String(value || "").trim());
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }
})();
