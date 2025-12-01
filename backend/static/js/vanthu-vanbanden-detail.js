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
  };

  const URGENCY_INFO = {
    ratkhan: { label: "Rất khẩn", className: "chip chip-danger" },
    khan: { label: "Khẩn", className: "chip chip-danger" },
    cao: { label: "Cao", className: "chip chip-info" },
    thuong: { label: "Thường", className: "chip chip-muted" },
  };

  const LOG_ATTACHMENT_TYPE = "nhat_ky_xu_ly";

  const CLERK_PENDING_STATUS_KEYS = new Set([
    "PENDING_CLERK_CHECK",
    "CHO_VAN_THU",
    "CHO_VT",
    "VT_PENDING_CHECK",
    "PENDING_CLERK",
    "PENDING_VAN_THU",
  ]);

  function onReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  function getDocId() {
    const meta = document.getElementById("doc-detail-meta");
    if (meta?.dataset?.docId) {
      return String(meta.dataset.docId).trim();
    }
    const queryId = new URLSearchParams(window.location.search).get("id");
    if (queryId) {
      return String(queryId).trim();
    }
    const segments = window.location.pathname
      .split("/")
      .filter((segment) => Boolean(segment));
    const last = segments[segments.length - 1];
    if (last && /\d+/.test(last)) {
      return last;
    }
    return null;
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

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(String(value).replace(/\.\d+Z$/, "Z"));
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(
      2,
      "0"
    )}`;
    return `${formatDate(date)} ${time}`;
  }

  function normalizeStatus(raw) {
    if (!raw) return "RECEIVED";
    const value = String(raw).trim().toUpperCase().replace(/\s+/g, "_");
    const cleaned = value.replace(/[^A-Z0-9_]/g, "_");
    return cleaned || "RECEIVED";
  }

  function formatStatusLabel(status) {
    if (!status) return "";
    if (typeof status === "string") return status;
    if (typeof status === "object") {
      return status.name || status.code || status.status_name || "";
    }
    return String(status);
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

  function formatUser(user) {
    if (!user) return "Người dùng";
    if (typeof user === "string") return user;
    return user.full_name || user.name || user.username || "Người dùng";
  }

  function isLogAttachment(file) {
    if (!file) return false;
    const type = String(file.attachment_type || file.type || "").toLowerCase();
    return type === LOG_ATTACHMENT_TYPE;
  }

  function toArray(payload, api) {
    if (typeof api?.extractItems === "function") {
      return api.extractItems(payload) || [];
    }
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.results)) return payload.results;
    return [];
  }

  function getAttachmentDownloadUrl(file, docId, docApi) {
    if (!file) return "#";
    const attachmentId = file.id || file.attachment_id;
    if (attachmentId && docApi && typeof docApi.attachmentDownloadUrl === "function") {
      try {
        const url = docApi.attachmentDownloadUrl(docId, attachmentId);
        if (url) return url;
      } catch (_error) {
        /* no-op */
      }
    }
    return file.file_url || file.url || "#";
  }

  function buildAttachmentLogEntry(file, docId, docApi) {
    if (!file) return null;
    const attachmentId = file.id || file.attachment_id;
    const name = file.file_name || file.name || file.filename || "Tệp đính kèm";
    return {
      action: "Đính kèm tệp xử lý",
      note: file.note || "",
      actor: file.uploaded_by || file.uploader,
      actor_id:
        file.uploaded_by_id ||
        (file.uploaded_by && (file.uploaded_by.id || file.uploaded_by.pk)) ||
        file.uploader_id,
      acted_at: file.uploaded_at || file.created_at,
      attachment: {
        id: attachmentId,
        name,
        url: getAttachmentDownloadUrl(file, docId, docApi),
      },
    };
  }

  onReady(() => {
    const api = window.ApiClient;
    const docApi = api?.documents;
    if (!docApi) {
      console.warn("[vanthu] Document API không sẵn sàng cho chi tiết văn bản đến.");
      return;
    }

    const docId = getDocId();
    if (!docId) {
      console.warn("[vanthu] Không tìm thấy ID văn bản trong URL hoặc DOM.");
      return;
    }

    const summaryEl = document.getElementById("doc-summary");
    const titleEl = document.getElementById("doc-title");
    const directionBadge = document.getElementById("doc-badge-direction");
    const statusBadge = document.getElementById("doc-badge-status");
    const urgencyBadge = document.getElementById("doc-badge-urgency");
    const metaCode = document.getElementById("doc-meta-code");
    const metaNumber = document.getElementById("doc-meta-number");
    const metaReceived = document.getElementById("doc-meta-received");
    const metaIssued = document.getElementById("doc-meta-issued");
    const metaSender = document.getElementById("doc-meta-sender");
    const metaReceivedBy = document.getElementById("doc-meta-received-by");
    const metaField = document.getElementById("doc-meta-field");
    const metaDeadline = document.getElementById("doc-meta-deadline");
    const assignmentsBody = document.getElementById("doc-assignments-body");
    const approvalsList = document.getElementById("doc-approvals");
    const approvalsCount = document.getElementById("doc-approval-count");
    const logsList = document.getElementById("doc-log-list");
    const attachmentsList = document.getElementById("doc-attachment-list");
    const dispatchList = document.getElementById("doc-dispatch-list");
    const dispatchNumberEl = document.getElementById("doc-dispatch-number");
    const dispatchDateEl = document.getElementById("doc-dispatch-date");
    const dispatchMethodEl = document.getElementById("doc-dispatch-methods");
    const errorEl = document.getElementById("doc-detail-error");
    const workflowPanel = document.getElementById("doc-workflow-panel");
    const clerkCheckCard = document.getElementById("clerk-check-card");
    const clerkCheckForm = document.getElementById("clerk-check-form");
    const clerkCheckButton = document.getElementById("clerk-check-submit");
    const clerkCheckFeedback = document.getElementById("clerk-check-feedback");
    const registerSelect = document.getElementById("clerk-check-register");
    const registerHint = document.getElementById("clerk-check-register-hint");
    const workflowActionSelect = document.querySelector('[data-wf="action-select"]');
    const workflowLib = window.DocumentUIWorkflow;
    let workflowInstance = null;
    const clerkCheckButtonDefaultText = clerkCheckButton?.textContent?.trim() || "Kiểm tra & vào sổ";
    let currentStatusKey = "";
    let registerBooksLoaded = false;
    let registerBooksLoading = false;

    function showError(message) {
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove("hidden");
      }
    }

    function clearError() {
      if (errorEl) {
        errorEl.textContent = "";
        errorEl.classList.add("hidden");
      }
    }

    function renderDoc(doc) {
      if (!doc) return;
      const fallbackStatus =
        doc.status?.code || doc.status?.name || doc.status || doc.state || doc.status_name;
      const statusKey = doc.status_key || normalizeStatus(fallbackStatus);
      const urgencyLevel = getUrgencyLevel(doc);
      if (directionBadge) {
        directionBadge.textContent = "Văn bản đến";
      }
      if (statusBadge) {
        statusBadge.textContent = STATUS_LABELS[statusKey] || statusKey;
        statusBadge.className = `px-2.5 py-1 rounded-full ${STATUS_BADGES[statusKey] || "bg-slate-100 text-slate-700"}`;
      }
      if (urgencyBadge) {
        const info = URGENCY_INFO[urgencyLevel] || URGENCY_INFO.thuong;
        urgencyBadge.textContent = info.label;
        urgencyBadge.className = `px-2.5 py-1 rounded-full ${info.className}`;
      }
      if (titleEl) {
        titleEl.textContent = doc.title || doc.subject || "Văn bản đến";
      }
      if (summaryEl) {
        summaryEl.textContent =
          doc.summary || doc.note || doc.content || doc.description || "—";
      }
      if (metaCode) {
        metaCode.textContent = doc.document_code || doc.number || doc.document_number || "—";
      }
      if (metaNumber) {
        metaNumber.textContent = doc.received_number || doc.number || "—";
      }
      if (metaReceived) {
        metaReceived.textContent = formatDate(doc.received_date || doc.created_at);
      }
      if (metaIssued) {
        metaIssued.textContent = formatDate(doc.issued_date || doc.registered_at);
      }
      if (metaSender) {
        metaSender.textContent = doc.from_org_name || doc.sender || "—";
      }
      if (metaReceivedBy) {
        metaReceivedBy.textContent = formatUser(doc.received_by) || formatUser(doc.created_by);
      }
      if (metaField) {
        metaField.textContent = doc.department?.name || doc.main_department_name || "—";
      }
      if (metaDeadline) {
        metaDeadline.textContent = formatDate(doc.due_date || doc.deadline || doc.expected_finish);
      }
      currentStatusKey = statusKey;
      if (workflowLib) {
        mountWorkflow(statusKey);
      }
      updateClerkCheckCard(statusKey);
    }

    function mountWorkflow(statusKey) {
      if (!workflowLib || !workflowPanel) {
        return;
      }
      const mountPayload = {
        container: workflowPanel,
        docId,
        role: document.body?.dataset?.role || "VT",
        status: statusKey,
        direction: "INBOUND",
        route: "vanbanden",
        allowWithdraw: false,
      };
      if (!workflowInstance) {
        workflowInstance = workflowLib.mount(mountPayload);
        return;
      }
      if (typeof workflowInstance.update === "function") {
        workflowInstance.update(statusKey);
      }
    }

    const workflowSubmit = workflowPanel?.querySelector('[data-wf="submit"]');
    const workflowMessage = workflowPanel?.querySelector('[data-wf="message"]');

    function setWorkflowMessage(text, isError) {
      if (!workflowMessage) return;
      workflowMessage.textContent = text || "";
      workflowMessage.classList.remove("text-rose-600", "text-slate-500");
      if (!text) return;
      workflowMessage.classList.add(isError ? "text-rose-600" : "text-slate-500");
    }

    function runWorkflowRemoteAction(apiFn, busyText, failureText) {
      if (!docId) {
        setWorkflowMessage("Không tìm thấy mã văn bản.", true);
        return;
      }
      if (!apiFn) {
        setWorkflowMessage("Không thể gửi yêu cầu.", true);
        return;
      }
      workflowSubmit?.setAttribute("disabled", "true");
      setWorkflowMessage(busyText, false);
      apiFn(docId, {})
        .then(() => {
          window.location.reload();
        })
        .catch((error) => {
          console.error("[vanthu] Lỗi workflow:", error);
          setWorkflowMessage(
            error?.message ? `${failureText}: ${error.message}` : failureText,
            true
          );
        })
        .finally(() => {
          workflowSubmit?.removeAttribute("disabled");
        });
    }

    function handleWorkflowAction(event) {
      const action = (workflowActionSelect?.value || "").trim().toUpperCase();
      let apiFn = null;
      let busyText = "";
      let failureText = "";
      if (action === "VT_DISPATCH_RESULT") {
        apiFn =
          api?.documents?.dispatchResult &&
          typeof api.documents.dispatchResult === "function"
            ? api.documents.dispatchResult.bind(api.documents)
            : null;
        busyText = "Đang phát hành kết quả...";
        failureText = "Không thể phát hành kết quả";
      } else if (action === "VT_ARCHIVE_INBOUND") {
        apiFn =
          api?.documents?.archiveInbound &&
          typeof api.documents.archiveInbound === "function"
            ? api.documents.archiveInbound.bind(api.documents)
            : null;
        busyText = "Đang lưu trữ hồ sơ...";
        failureText = "Không thể lưu trữ hồ sơ";
      }
      if (!apiFn) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      runWorkflowRemoteAction(apiFn, busyText, failureText);
    }

    workflowSubmit?.addEventListener("click", handleWorkflowAction, {
      capture: true,
    });

    function getSelectedWorkflowActionKey() {
      if (!workflowActionSelect) {
        return "";
      }
      return (workflowActionSelect.value || "").trim().toUpperCase();
    }

    function shouldShowClerkCheck(statusKey, actionKey) {
      const normalizedAction = (actionKey || "").trim().toUpperCase();
      if (normalizedAction !== "VT_FINAL_CHECK_OK_INBOUND") {
        return false;
      }
      if (!statusKey) {
        return false;
      }
      const normalizedStatus = String(statusKey || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "_");
      if (CLERK_PENDING_STATUS_KEYS.has(normalizedStatus)) {
        return true;
      }
      if (/CLERK|VAN_THU|VT/.test(normalizedStatus) && /(PENDING|CHO)/.test(normalizedStatus)) {
        return true;
      }
      return false;
    }

    function updateClerkCheckCard(statusKey) {
      const actionKey = getSelectedWorkflowActionKey();
      const show = shouldShowClerkCheck(statusKey, actionKey);
      if (clerkCheckCard) {
        clerkCheckCard.classList.toggle("hidden", !show);
        clerkCheckCard.setAttribute("aria-hidden", show ? "false" : "true");
      }
      if (!show) {
        setClerkCheckMessage("");
        setClerkCheckButtonLoading(false);
        resetRegisterSelect();
        return;
      }
      ensureRegisterBooksLoaded();
    }

    function resetRegisterSelect() {
      if (!registerSelect) {
        return;
      }
      registerSelect.value = "";
      registerSelect.disabled = true;
      if (registerHint) {
        registerHint.textContent = "Chọn sổ dùng cho văn bản đến (được phân loại theo năm và đơn vị).";
      }
    }

    function setRegisterSelectLoading() {
      if (!registerSelect) {
        return;
      }
      registerSelect.disabled = true;
      registerSelect.innerHTML = '<option value="">Đang tải danh sách sổ đăng ký…</option>';
      if (registerHint) {
        registerHint.textContent = "Đang tải danh sách sổ đăng ký…";
      }
    }

    function setRegisterSelectEmpty(message) {
      if (!registerSelect) {
        return;
      }
      registerSelect.innerHTML = `<option value="">${escapeHtml(message)}</option>`;
      registerSelect.disabled = true;
      if (registerHint) {
        registerHint.textContent = message;
      }
    }

    function setRegisterSelectError(message) {
      setRegisterSelectEmpty(message);
    }

    function populateRegisterSelect(items) {
      if (!registerSelect) {
        return;
      }
      const options = items
        .map((item) => {
          const label = `${item.name || "Sổ đăng ký"} • ${item.year || "—"}`;
          return `<option value="${escapeAttr(item.register_id)}">${escapeHtml(label)}</option>`;
        })
        .join("");
      registerSelect.innerHTML = '<option value="">— Chọn sổ đăng ký —</option>' + options;
      registerSelect.disabled = false;
      if (registerHint) {
        registerHint.textContent = "Chọn sổ đăng ký phù hợp để ghi số đến.";
      }
    }

    function ensureRegisterBooksLoaded() {
      if (registerBooksLoaded || registerBooksLoading) {
        if (registerBooksLoaded && registerSelect) {
          registerSelect.disabled = false;
        }
        return;
      }
      if (!api?.registerBooks?.list) {
        setRegisterSelectError("Không có API sổ đăng ký.");
        return;
      }
      registerBooksLoading = true;
      setRegisterSelectLoading();
      api.registerBooks
        .list({ direction: "den", is_active: true, page_size: 150 })
        .then((response) => {
          const items = toArray(response, api);
          registerBooksLoaded = true;
          if (!items.length) {
            setRegisterSelectEmpty("Hiện chưa có sổ đăng ký nào cho văn bản đến.");
            return;
          }
          populateRegisterSelect(items);
        })
        .catch((error) => {
          console.error("[vanthu] Không tải được sổ đăng ký:", error);
          setRegisterSelectError("Không thể tải danh sách sổ đăng ký.");
        })
        .finally(() => {
          registerBooksLoading = false;
        });
    }

    function setClerkCheckMessage(message, isError = false) {
      if (!clerkCheckFeedback) {
        return;
      }
      if (!message) {
        clerkCheckFeedback.textContent = "";
        clerkCheckFeedback.classList.add("hidden");
        clerkCheckFeedback.classList.remove("text-rose-600", "text-slate-500");
        return;
      }
      clerkCheckFeedback.textContent = message;
      clerkCheckFeedback.classList.remove("hidden");
      clerkCheckFeedback.classList.toggle("text-rose-600", isError);
      clerkCheckFeedback.classList.toggle("text-slate-500", !isError);
    }

    function setClerkCheckButtonLoading(isLoading) {
      if (!clerkCheckButton) {
        return;
      }
      clerkCheckButton.disabled = isLoading;
      clerkCheckButton.textContent = isLoading ? "Đang kiểm tra..." : clerkCheckButtonDefaultText;
    }

    function handleClerkCheckSubmit(event) {
      event.preventDefault();
      if (!docId) {
        setClerkCheckMessage("Không tìm thấy mã văn bản.", true);
        return;
      }
      if (!registerSelect || registerSelect.disabled) {
        setClerkCheckMessage("Không có sổ đăng ký hợp lệ để chọn.", true);
        return;
      }
      const registerValue = (registerSelect.value || "").trim();
      if (!registerValue) {
        setClerkCheckMessage("Vui lòng chọn sổ đăng ký.", true);
        return;
      }
      const registerBookId = Number(registerValue);
      if (!Number.isFinite(registerBookId) || registerBookId <= 0) {
        setClerkCheckMessage("Sổ đăng ký không hợp lệ.", true);
        return;
      }
      const finalizeFn =
        api?.documents?.finalizeRegistration &&
        typeof api.documents.finalizeRegistration === "function"
          ? api.documents.finalizeRegistration.bind(api.documents)
          : null;
      if (!finalizeFn) {
        setClerkCheckMessage("Không thể gửi yêu cầu Kiểm tra & vào sổ.", true);
        return;
      }
      const payload = { register_book_id: registerBookId };
      setClerkCheckButtonLoading(true);
      setClerkCheckMessage("Đang gửi yêu cầu Kiểm tra & vào sổ...", false);
      finalizeFn(docId, payload)
        .then(() => {
          window.location.reload();
        })
        .catch((error) => {
          console.error("[vanthu] Lỗi khi gửi yêu cầu Kiểm tra & vào sổ:", error);
          setClerkCheckButtonLoading(false);
          setClerkCheckMessage(
            error?.message
              ? `Không thể gửi yêu cầu Kiểm tra & vào sổ: ${error.message}`
              : "Không thể gửi yêu cầu Kiểm tra & vào sổ.",
            true
          );
        });
    }

    function initClerkCheckForm() {
      if (!clerkCheckForm) {
        updateClerkCheckCard(null);
        return;
      }
      clerkCheckForm.addEventListener("submit", handleClerkCheckSubmit);
      resetRegisterSelect();
      if (workflowActionSelect) {
        workflowActionSelect.addEventListener("change", () => {
          updateClerkCheckCard(currentStatusKey);
        });
      }
      setClerkCheckMessage("");
      setClerkCheckButtonLoading(false);
      updateClerkCheckCard(currentStatusKey);
    }

    function renderAssignments(items) {
      if (!assignmentsBody) {
        return;
      }
      assignmentsBody.innerHTML = "";
      if (!Array.isArray(items) || !items.length) {
        assignmentsBody.appendChild(
          createPlaceholderRow("Chưa có phân công xử lý.")
        );
        return;
      }
      items.forEach((item) => {
        assignmentsBody.appendChild(buildAssignmentRow(item));
      });
    }

    function buildAssignmentRow(item) {
      const tr = document.createElement("tr");
      const assignee = formatUser(item.user || item.assignee);
      const assignor = formatUser(item.assigned_by);
      const due = formatDate(item.due_at || item.due_date);
      const roleLabel = assignmentRoleLabel(item.role_on_doc || item.role);
      const stateLabel = item.active ? "Đang xử lý" : "Đã hoàn thành";
      tr.innerHTML = `
        <td class="px-5 py-3">
          <div class="font-semibold text-slate-800">${escapeHtml(assignee)}</div>
          <small class="text-[12px] text-slate-500">${escapeHtml(roleLabel)}</small>
        </td>
        <td class="px-5 py-3">
          <span class="chip chip--blue">${escapeHtml(roleLabel)}</span>
        </td>
        <td class="px-5 py-3">
          ${escapeHtml(assignor)}
        </td>
        <td class="px-5 py-3">
          ${escapeHtml(due)}
        </td>
        <td class="px-5 py-3">
          <span class="chip chip--amber">${escapeHtml(stateLabel)}</span>
        </td>
      `;
      return tr;
    }

    function assignmentRoleLabel(role) {
      switch ((role || "").toLowerCase()) {
        case "owner":
        case "chu_tri":
          return "Chủ trì";
        case "assignee":
        case "phoi_hop":
          return "Phối hợp";
        case "watcher":
          return "Theo dõi";
        default:
          return role || "Đã giao";
      }
    }

    function createPlaceholderRow(message) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="px-5 py-3 text-center text-[13px] text-slate-500" colspan="5">${escapeHtml(
        message
      )}</td>`;
      return tr;
    }

    function renderApprovals(items) {
      if (!approvalsList) return;
      const list = Array.isArray(items) ? items : [];
      if (!list.length) {
        approvalsList.innerHTML =
          '<li class="text-[13px] text-slate-500">Chưa có quy trình trình ký.</li>';
        if (approvalsCount) approvalsCount.textContent = "0";
        return;
      }
      approvalsList.innerHTML = list
        .map((step) => {
          const approver = formatUser(step.approver || step.approver_id);
          const decision = step.decision || step.status || "";
          const decidedAt = formatDateTime(step.decided_at || step.updated_at);
          const note = step.note || step.comment || "";
          return `<li class="rounded-lg border border-slate-100 p-3 text-[13px]">
            <div class="flex items-center justify-between text-slate-700">
              <strong>Bước ${step.step_no || "?"} • ${escapeHtml(step.type || step.step || "Duyệt")}</strong>
              <span class="text-[12px] text-slate-500">${escapeHtml(decision || "Chưa quyết")}</span>
            </div>
            <p class="text-[13px] text-slate-500 mb-1">${escapeHtml(note)}</p>
            <div class="text-[12px] text-slate-400">Người thực hiện: ${escapeHtml(approver)} • ${escapeHtml(
              decidedAt
            )}</div>
          </li>`;
        })
        .join("");
      if (approvalsCount) {
        approvalsCount.textContent = String(list.length);
      }
    }

    function renderLogs(items) {
      if (!logsList) return;
      const list = Array.isArray(items) ? items : [];
      if (!list.length) {
        logsList.innerHTML =
          '<li class="text-[13px] text-slate-500">Chưa có nhật ký xử lý.</li>';
        return;
      }
      logsList.innerHTML = list
        .map((entry) => {
          const actor = formatUser(
            entry.actor || entry.actor_id || entry.uploaded_by || entry.uploader
          );
          const description = entry.note || entry.description || entry.detail || "";
          const action = entry.action || (entry.attachment ? "Đính kèm tệp xử lý" : "Hoạt động");
          const time = formatDateTime(entry.acted_at || entry.created_at);
          const fromStatus = formatStatusLabel(entry.from_status || entry.from_status_name);
          const toStatus = formatStatusLabel(entry.to_status || entry.to_status_name);
          const attachment = entry.attachment;
          const attachmentHtml = attachment
            ? `<div class="text-[13px] text-blue-700"><a href="${escapeAttr(
                attachment.url || "#"
              )}" target="_blank" rel="noreferrer">Tải file: ${escapeHtml(
                attachment.name || "Tệp xử lý"
              )}</a></div>`
            : "";
          const noteHtml = description
            ? `<p class="text-[13px] text-slate-500 mb-1">${escapeHtml(description)}</p>`
            : "";
          return `<li class="rounded-lg border border-slate-100 p-3 space-y-1 text-[13px]">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-slate-800">${escapeHtml(action)}</span>
              <span class="text-[12px] text-slate-500">${escapeHtml(time)}</span>
            </div>
            ${noteHtml}
            ${attachmentHtml}
            ${
              fromStatus || toStatus
                ? `<div class="text-[12px] text-slate-500">Từ ${escapeHtml(
                    fromStatus
                  )} → ${escapeHtml(toStatus)}</div>`
                : ""
            }
            <div class="text-[12px] text-slate-500">Thực hiện bởi ${escapeHtml(actor)}</div>
          </li>`;
        })
        .join("");
    }

    function renderAttachments(items) {
      if (!attachmentsList) return;
      const list = Array.isArray(items) ? items : [];
      const visible = list.filter((file) => !isLogAttachment(file));
      if (!list.length) {
        attachmentsList.innerHTML =
          '<li class="text-[13px] text-slate-500">Chưa có đính kèm.</li>';
        return;
      }
      if (!visible.length) {
        attachmentsList.innerHTML =
          '<li class="text-[13px] text-slate-500">Chưa có đính kèm.</li>';
        return;
      }
      attachmentsList.innerHTML = visible
        .map((file) => {
          const name = file.name || file.file_name || file.filename || "Tệp đính kèm";
          const uploadedAt = formatDateTime(file.created_at || file.uploaded_at);
          const attachmentId = file.id || file.attachment_id;
          let downloadUrl = "#";
          if (attachmentId && typeof docApi.attachmentDownloadUrl === "function") {
            try {
              downloadUrl = docApi.attachmentDownloadUrl(docId, attachmentId);
            } catch (error) {
              downloadUrl = "#";
            }
          }
          const uploaderLabel = formatUser(file.uploaded_by || file.uploader);
          return `<li class="rounded-lg border border-slate-100 p-3 text-[13px]">
            <a href="${escapeAttr(downloadUrl)}" target="_blank" class="font-semibold text-slate-800">${escapeHtml(
              name
            )}</a>
            <div class="text-[12px] text-slate-500">Tải lên bởi ${escapeHtml(
              uploaderLabel
            )} • ${escapeHtml(uploadedAt)}</div>
          </li>`;
        })
        .join("");
    }

    function renderDispatches(items) {
      if (!dispatchList) return;
      const list = Array.isArray(items) ? items : [];
      if (!list.length) {
        dispatchList.innerHTML =
          '<li class="text-[13px] text-slate-500">Chưa có lịch gửi.</li>';
        if (dispatchNumberEl) dispatchNumberEl.textContent = "—";
        if (dispatchDateEl) dispatchDateEl.textContent = "—";
        if (dispatchMethodEl) dispatchMethodEl.textContent = "—";
        return;
      }
      dispatchList.innerHTML = list
        .map((item) => {
          const receiver =
            item.organization?.name || item.to_org_name || item.recipient || "Đơn vị nhận";
          const status = item.status || item.dispatch_status || "—";
          const channel = item.channel || item.method || "—";
          const time = formatDateTime(item.sent_at || item.created_at);
          const tracking = item.tracking_no ? `Tracking: ${escapeHtml(item.tracking_no)}` : "";
          return `<li class="rounded-lg border border-slate-100 p-3 space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-slate-700">${escapeHtml(receiver)}</span>
              <span class="text-[12px] text-slate-500">${escapeHtml(status)}</span>
            </div>
            <div class="text-[12px] text-slate-500">${escapeHtml(channel)} • ${escapeHtml(
              time
            )} ${tracking ? " • " + tracking : ""}</div>
          </li>`;
        })
        .join("");
      const latest = list[0];
      if (dispatchNumberEl) {
        dispatchNumberEl.textContent = latest?.tracking_no || latest?.id || "—";
      }
      if (dispatchDateEl) {
        dispatchDateEl.textContent = formatDate(latest?.sent_at);
      }
      if (dispatchMethodEl) {
        dispatchMethodEl.textContent = latest?.channel || latest?.method || "—";
      }
    }

    function fetchAssignments() {
      if (!docApi.assignments) {
        renderAssignments([]);
        return Promise.resolve();
      }
      return docApi
        .assignments(docId)
        .then((payload) => renderAssignments(toArray(payload, api)))
        .catch((error) => {
          console.warn("[vanthu] Lỗi tải phân công:", error);
          renderAssignments([]);
        });
    }

    function fetchApprovals() {
      if (!docApi.approvals) {
        renderApprovals([]);
        return Promise.resolve();
      }
      return docApi
        .approvals(docId)
        .then((payload) => renderApprovals(toArray(payload, api)))
        .catch((error) => {
          console.warn("[vanthu] Lỗi tải trình ký:", error);
          renderApprovals([]);
        });
    }

    function fetchAttachments() {
      if (!docApi.attachments) {
        renderAttachments([]);
        return Promise.resolve();
      }
      return docApi
        .attachments(docId, { params: { exclude_log: 1 } })
        .then((payload) => renderAttachments(toArray(payload, api)))
        .catch((error) => {
          console.warn("[vanthu] Lỗi tải đính kèm:", error);
          renderAttachments([]);
        });
    }

    function fetchLogs() {
      const tasks = [];
      if (docApi.workflowLogs) {
        tasks.push(
          docApi
            .workflowLogs(docId)
            .then((payload) => toArray(payload, api))
            .catch((error) => {
              console.warn("[vanthu] Lỗi tải nhật ký:", error);
              return [];
            })
        );
      }
      if (docApi.attachments) {
        tasks.push(
          docApi
            .attachments(docId)
            .then((payload) =>
              toArray(payload, api)
                .filter((file) => isLogAttachment(file))
                .map((file) => buildAttachmentLogEntry(file, docId, docApi))
                .filter(Boolean)
            )
            .catch((error) => {
              console.warn("[vanthu] Lỗi tải nhật ký từ tệp:", error);
              return [];
            })
        );
      }
      if (!tasks.length) {
        renderLogs([]);
        return Promise.resolve();
      }
      return Promise.all(tasks).then((chunks) => {
        const merged = [];
        chunks.forEach((chunk) => {
          if (Array.isArray(chunk)) {
            merged.push(...chunk);
          }
        });
        merged.sort((a, b) => {
          const ta = new Date(a?.acted_at || a?.created_at || 0).getTime();
          const tb = new Date(b?.acted_at || b?.created_at || 0).getTime();
          return tb - ta;
        });
        renderLogs(merged);
      });
    }

    function fetchDispatches() {
      if (!docApi.dispatches) {
        renderDispatches([]);
        return Promise.resolve();
      }
      return docApi
        .dispatches(docId)
        .then((payload) => renderDispatches(toArray(payload, api)))
        .catch((error) => {
          console.warn("[vanthu] Lỗi tải lịch gửi:", error);
          renderDispatches([]);
        });
    }

    function loadDocument() {
      clearError();
      if (summaryEl) {
        summaryEl.textContent = "Đang tải dữ liệu văn bản…";
      }
      return docApi
        .retrieve(docId)
        .then((doc) => {
          renderDoc(doc);
          return Promise.all([
            fetchAssignments(),
            fetchApprovals(),
            fetchAttachments(),
            fetchLogs(),
            fetchDispatches(),
          ]);
        })
        .catch((error) => {
          console.error("[vanthu] Lỗi tải chi tiết văn bản đến:", error);
          showError("Không thể tải chi tiết văn bản.");
        });
    }

    initClerkCheckForm();
    loadDocument();
  });
})();
