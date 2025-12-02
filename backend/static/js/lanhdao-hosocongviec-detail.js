(function () {
  console.log("[LD] ========================================");
  console.log("[LD] FILE LOADED: lanhdao-hosocongviec-detail.js");
  console.log("[LD] ========================================");
  
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) =>
    Array.from(root.querySelectorAll(selector));

  // --- API & Helpers ---
  const api = window.ApiClient;
  const helpers = window.DocHelpers;

  function toArray(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.results)) return payload.results;
    if (Array.isArray(payload.participants)) return payload.participants;
    return [];
  }

  // Helper function to format date with optional time
  function formatDateValue(value, includeTime = false) {
    if (!value) return "—";

    let date;
    if (typeof value === "string") {
      if (
        value.includes("T") ||
        value.includes("Z") ||
        value.includes("+") ||
        value.includes("-", 10)
      ) {
        date = new Date(value);
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m, d] = value.split("-").map(Number);
        date = new Date(y, m - 1, d);
      } else {
        date = new Date(value);
      }
    } else if (value instanceof Date) {
      date = value;
    } else {
      date = new Date(value);
    }

    if (Number.isNaN(date.getTime())) {
      if (typeof value === "string") {
        const dateMatch = value.match(/^(\d{4}-\d{2}-\d{2})/);
        if (dateMatch) {
          const [y, m, d] = dateMatch[1].split("-");
          return includeTime
            ? `${d}/${m}/${y} ${value.slice(11, 16) || ""}`.trim()
            : `${d}/${m}/${y}`;
        }
      }
      return "—";
    }

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const dateStr = `${day}/${month}/${year}`;

    if (includeTime) {
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `${dateStr} ${hours}:${minutes}`;
    }

    return dateStr;
  }

  // --- State ---
  let caseId = null;
  let caseData = null;
  let activityLogs = [];
  let pendingSpecialists = []; // Specialists to be assigned (not yet confirmed)

  // --- Initialization ---
  function onReady(callback) {
    console.log("[LD] onReady called, readyState:", document.readyState);
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  onReady(() => {
    console.log("[LD] ========================================");
    console.log("[LD] DOM READY - Starting initialization");
    console.log("[LD] ========================================");
    caseId = getCaseId();
    console.log("[LD] Case ID from URL:", caseId);
    if (!caseId) {
      showError("Không tìm thấy ID hồ sơ.");
      return;
    }

    // Initial check for buttons
    const allButtons = $$("[data-assign-button]");
    allButtons.forEach((btn) => {
      if (btn) {
        setActionButtonVisibility(btn, true);
        setAssignEnabled(btn, true);
      }
    });

    // Load data
    const caseIdFromUrl = getCaseId();
    if (caseIdFromUrl) {
      caseId = caseIdFromUrl;

      // Try to read pre-rendered data
      const preRenderedData = readCaseData();
      console.log("[LD] Pre-rendered data:", preRenderedData ? "Found" : "Not found");
      
      if (preRenderedData) {
        caseData = preRenderedData;
        console.log("[LD] Case data:", {
          id: caseData.id,
          status: caseData.status,
          title: caseData.title
        });
        renderCaseInfo(caseData);

        // Show form immediately if status is CHO_PHAN_CONG
        const rawStatusValue =
          caseData.status?.code || caseData.status?.name || caseData.status;
        console.log("[LD] Checking status for form visibility:", rawStatusValue);
        if (isWaitingAssignmentStatus(rawStatusValue)) {
          console.log(
            "[LD] onReady: Status is CHO_PHAN_CONG, showing form"
          );
          showAssignForm();
        }

        loadCaseDetail();
      } else {
        console.log("[LD] Loading case data via API...");
        api
          .request(`/api/v1/cases/${caseId}/`)
          .then((data) => {
            caseData = data;
            renderCaseInfo(data);

            // Show form immediately if status is CHO_PHAN_CONG
            const rawStatusValue =
              data.status?.code || data.status?.name || data.status;
            if (isWaitingAssignmentStatus(rawStatusValue)) {
              console.log(
                "[LD] onReady: Status is CHO_PHAN_CONG, showing form"
              );
              showAssignForm();
            }

            loadCaseDetail();
          })
          .catch((err) => {
            console.error("[LD] Error loading case detail:", err);
            showError("Không thể tải thông tin hồ sơ.");
          });
      }
    } else {
      showError("Không tìm thấy ID hồ sơ.");
    }

    // Attach event listeners once DOM is ready
    setTimeout(() => {
      // Attach form submit listener
      const form = $("#ld-assign-form");
      if (form && !form.hasAttribute("data-listener-attached")) {
        form.addEventListener("submit", handleAssignSubmit);
        form.setAttribute("data-listener-attached", "true");
        console.log("[LD] Attached submit listener to assign form");
      }

      // Attach final confirmation button listener
      const confirmBtn = $("#btn-final-confirm");
      if (confirmBtn && !confirmBtn.hasAttribute("data-listener-attached")) {
        confirmBtn.addEventListener("click", handleFinalConfirmation);
        confirmBtn.setAttribute("data-listener-attached", "true");
      }

      // Initialize pending specialists UI
      renderPendingSpecialists();
    }, 100);

    setupInteractions();
    setupWorkflowActions();
    setupMemberManagement();
  });

  function getCaseId() {
    const root = document.querySelector("#case-detail-root");
    if (root?.dataset?.caseId) return root.dataset.caseId;
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1];
    if (/^\d+$/.test(lastPart)) return lastPart;
    const matches = window.location.pathname.match(/\/([a-f0-9-]{36})\/?$/);
    if (matches) return matches[1];
    const params = new URLSearchParams(window.location.search);
    if (params.has("id")) return params.get("id");
    return null;
  }

  function readCaseData() {
    const script = document.getElementById("case-data");
    if (!script) return null;
    try {
      return JSON.parse(script.textContent || "{}");
    } catch (error) {
      console.error("Cannot parse case-data JSON", error);
      return null;
    }
  }

  // Simple function to check if status is CHO_PHAN_CONG (waiting for assignment)
  function isWaitingAssignmentStatus(status) {
    const code = getStatusCode(status);
    return code === "CHO_PHAN_CONG";
  }

  // Get normalized status code for display purposes
  function getStatusCode(status) {
    if (!status) return null;
    let code = status;
    if (typeof status === "object") {
      code = status.code || status.case_status_name || status.name || null;
    }
    return code ? String(code).toUpperCase() : null;
  }

  // --- Loading Data ---
  async function loadCaseDetail() {
    try {
      renderLoading();
      if (!caseData) {
        showError("Thiếu dữ liệu hồ sơ.");
        return;
      }
      await Promise.allSettled([
        loadParticipants(),
        loadTasks(),
        loadActivityLogsAndComments(),
        loadRelatedDocs(),
        loadAttachments(),
      ]);
    } catch (error) {
      console.error("[lanhdao-hosocongviec-detail] Error loading case:", error);
      showError(helpers.resolveErrorMessage(error));
    }
  }

  async function loadParticipants() {
    try {
      const participantsRes = await api.request(
        `/api/v1/cases/${caseId}/participants/`
      );
      const participants = toArray(participantsRes);
      renderParticipants(participants);

      // Update form visibility after loading participants
      if (caseData) {
        const isWaitingAssignment = isWaitingAssignmentStatus(caseData.status);

        if (isWaitingAssignment) {
          console.log("[LD] loadParticipants: Showing form");
          showAssignForm();
        } else {
          hideAssignForm();
        }
      }
    } catch (error) {
      console.error("Error loading participants:", error);
      renderPlaceholder("case-members", "Không thể tải thành viên.");
    }
  }

  async function loadTasks() {
    try {
      const tasksRes = await api.request(`/api/v1/cases/${caseId}/tasks/`);
      const tasks = toArray(tasksRes);
      renderTasks(tasks);
      updateTaskMetrics(tasks);
    } catch (error) {
      console.error("Error loading tasks:", error);
      renderPlaceholder("case-tasks", "Không thể tải nhiệm vụ.");
    }
  }

  async function loadActivityLogs() {
    try {
      const logsRes = await api.request(`/api/v1/cases/${caseId}/activity-logs/`);
      renderActivityLogs(toArray(logsRes));
    } catch (error) {
      console.error("Error loading logs:", error);
      renderPlaceholder("case-activity", "Không thể tải nhật ký.");
    }
  }

  async function loadRelatedDocs() {
    try {
      const docsRes = await api.request(`/api/v1/cases/${caseId}/documents/`);
      const docs = toArray(docsRes);
      renderRelatedDocs(docs);
      updateDocMetrics(docs);
    } catch (error) {
      console.error("Error loading docs:", error);
      renderPlaceholder("case-docs", "Không thể tải văn bản liên quan.");
    }
  }

  // --- Rendering ---
  function renderLoading() {
    // Optional: show loading state on UI elements
  }

  function showError(msg) {
    const errorEl = $("[data-case-error]");
    if (errorEl) {
      errorEl.textContent = msg;
      errorEl.classList.remove("hidden");
    } else {
      alert(msg);
    }
  }

  function renderCaseInfo(data) {
    setText("[data-case-title]", data.title);
    setText("[data-case-description]", data.description || "Không có mô tả");
    setText("[data-case-code]", data.case_code);
    setText("[data-case-department]", data.department?.name || "—");
    setText("[data-case-leader]", data.leader?.full_name || "—");

    // Prefer explicit assignees list, fallback to owner
    let assigneeDisplay = "—";
    if (Array.isArray(data.assignees) && data.assignees.length > 0) {
      assigneeDisplay = data.assignees
        .map((u) => u.full_name || u.username || u.id)
        .join(", ");
    } else if (data.owner) {
      assigneeDisplay =
        data.owner.full_name || data.owner.username || data.owner.id || "—";
    }
    setText("[data-case-assignee]", assigneeDisplay);
    setText("[data-case-deadline]", formatDateValue(data.due_date, true));
    setText("[data-case-created]", formatDateValue(data.created_at, false));

    const statusEl = $("[data-case-status-chip]");
    const statusCode = getStatusCode(data.status);

    if (statusEl) {
      statusEl.textContent =
        data.status?.name || data.status_name || data.status || "—";
      statusEl.className =
        "px-2.5 py-1 rounded-full text-xs font-semibold " +
        getStatusColor(statusCode);
    }

    const priorityEl = $("[data-case-priority-chip]");
    if (priorityEl) {
      priorityEl.textContent = getPriorityLabel(data.priority);
      priorityEl.className =
        "px-2.5 py-1 rounded-full text-xs font-semibold " +
        getPriorityColor(data.priority);
    }

    // Update Workflow Actions Visibility
    const isWaitingAssignment = isWaitingAssignmentStatus(data.status);
    updateActionButtons(statusCode, isWaitingAssignment);

    // Show form if status is CHO_PHAN_CONG
    if (isWaitingAssignment) {
      console.log(
        "[LD] renderCaseInfo: Status is CHO_PHAN_CONG, showing form"
      );
      showAssignForm();

      // Load candidate specialists - KHÔNG FILTER theo department
      // để có thể chọn specialist từ bất kỳ phòng ban nào
      console.log("[LD] Loading ALL specialists (no department filter)");
      loadCandidateSpecialists(null).catch((err) =>
        console.error("[LD] Error loading specialists:", err)
      );
    } else {
      // Hide form if status is not CHO_PHAN_CONG
      hideAssignForm();
    }
  }

  function renderParticipants(list) {
    const tbody = $("[data-case-members]");
    if (!tbody) return;
    tbody.innerHTML = "";

    if (!list || list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="px-5 py-4 text-center text-sm text-slate-500">Chưa có thành viên.</td></tr>`;
      return;
    }

    const caseDueDate = caseData?.due_date || null;
    const isOverdue = caseDueDate && new Date(caseDueDate) < new Date();
    
    // Check if we can manage members (not CHO_DUYET_DONG or DONG)
    const statusCode = getStatusCode(caseData?.status);
    const normalizedStatus = statusCode ? String(statusCode).toUpperCase().trim() : "";
    const canManage = normalizedStatus !== "CHO_DUYET_DONG" && normalizedStatus !== "DONG";

    list.forEach((p) => {
      const tr = document.createElement("tr");

      let dueDateDisplay = "—";
      let dueDateClass = "text-slate-500 text-xs";
      let overdueIndicator = "";

      if (caseDueDate && p.role_on_case === "assignee") {
        dueDateDisplay = formatDateValue(caseDueDate, true);
        if (isOverdue) {
          dueDateClass = "text-rose-600 text-xs font-medium";
          overdueIndicator =
            '<span class="ml-1.5 inline-flex items-center rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-700" title="Quá hạn">QH</span>';
        } else {
          dueDateClass = "text-slate-700 text-xs";
        }
      }

      let participationDate = "—";
      if (caseData?.created_at) {
        participationDate = formatDateValue(caseData.created_at, true);
      }

      let instruction = "";
      if (
        activityLogs &&
        activityLogs.length > 0 &&
        p.role_on_case === "assignee"
      ) {
        const assignLogs = activityLogs.filter(
          (log) =>
            (log.action &&
              (log.action === "ASSIGN" || log.action.includes("ASSIGN"))) ||
            (log.type === "log" &&
              log.action &&
              log.action.includes("phân công"))
        );
        if (assignLogs.length > 0) {
          const assignLog = assignLogs[0];
          instruction =
            assignLog.note || assignLog.comment || assignLog.detail || "";
        }
      }
      
      // ✅ Extract user_id robustly - check all possible fields
      const participantUserId = 
        p.user?.user_id || 
        p.user?.id || 
        p.user?.pk || 
        p.user_id || 
        p.id || 
        p.pk;
      
      // Debug log if userId is missing
      if (!participantUserId) {
        console.warn("[LD] renderParticipants: Participant missing user_id", p);
      }
      
      // Render delete button only if we can manage AND have valid user_id
      const deleteButtonHtml = canManage && participantUserId
        ? `<button 
            class="text-rose-600 hover:text-rose-700 text-sm font-medium"
            data-delete-member="${participantUserId}"
          >
            Xóa
          </button>`
        : `<span class="text-slate-400 text-sm">—</span>`;

      tr.innerHTML = `
        <td class="px-5 py-3">
          <div class="font-medium text-slate-700">${helpers.escapeHtml(
            p.user?.full_name || p.user?.username || "—"
          )}</div>
        </td>
        <td class="px-5 py-3">
          <span class="px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-600">
            ${getRoleLabel(p.role_on_case)}
          </span>
        </td>
        <td class="px-5 py-3 text-slate-600">${helpers.escapeHtml(
          p.user?.department?.name || p.user?.department_name || "—"
        )}</td>
        <td class="px-5 py-3">
          <div class="flex items-center gap-1">
            <span class="${dueDateClass}">${dueDateDisplay}</span>
            ${overdueIndicator}
            ${
              instruction
                ? `<span class="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 text-blue-600 text-[10px] font-semibold cursor-help hover:bg-blue-200 transition-colors" title="${helpers.escapeHtml(
                    instruction
                  )}">i</span>`
                : ""
            }
          </div>
        </td>
        <td class="px-5 py-3 text-slate-500 text-xs">
          ${participationDate}
        </td>
        <td class="px-5 py-3">
          ${deleteButtonHtml}
        </td>
      `;
      tbody.appendChild(tr);
    });
  }


  function renderTasks(list) {
    const container = $("[data-case-tasks]");
    if (!container) return;
    container.innerHTML = "";

    if (!list || list.length === 0) {
      container.innerHTML = `<li class="text-center text-sm text-slate-500 py-2">Chưa có nhiệm vụ.</li>`;
      return;
    }
    
    // Check if we can manage tasks (not CHO_DUYET_DONG or DONG)
    const statusCode = getStatusCode(caseData?.status);
    const normalizedStatus = statusCode ? String(statusCode).toUpperCase().trim() : "";
    const canManage = normalizedStatus !== "CHO_DUYET_DONG" && normalizedStatus !== "DONG";

    list.forEach((task) => {
      const li = document.createElement("li");
      li.className = "rounded-lg border border-slate-100 p-3";
      
      // Render action buttons only if we can manage
      const actionButtonsHtml = canManage
        ? `<button class="text-blue-600 hover:text-blue-700 text-sm" 
                  data-edit-task="${task.task_id}"
                  data-task-data='${JSON.stringify(task)}'>
            Sửa
          </button>
          <button class="text-rose-600 hover:text-rose-700 text-sm" 
                  data-delete-task="${task.task_id}">
            Xóa
          </button>`
        : '';
      
      li.innerHTML = `
        <div class="flex items-center justify-between gap-2">
          <div class="flex-1">
            <div class="font-medium text-slate-700">${helpers.escapeHtml(
              task.title
            )}</div>
            <div class="text-[12px] text-slate-500">
              Phụ trách: ${helpers.escapeHtml(
                task.assignee?.full_name || "—"
              )} • 
              Hạn: ${formatDateValue(task.due_at, true)}
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded text-xs font-medium ${getTaskStatusColor(
              task.status
            )}">
              ${task.status}
            </span>
            ${actionButtonsHtml}
          </div>
        </div>
      `;
      container.appendChild(li);
    });

    setText("[data-case-task-count]", `${list.length} nhiệm vụ`);
  }

  function renderActivityLogs(list) {
    const container = $("[data-case-activity]");
    if (!container) return;
    container.innerHTML = "";

    if (!list || list.length === 0) {
      container.innerHTML = `<li class="text-center text-sm text-slate-500 py-2">Chưa có nhật ký.</li>`;
      return;
    }

    list.forEach((log) => {
      const li = document.createElement("li");
      li.className = "rounded-lg border border-slate-100 p-3 space-y-1";
      li.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="font-semibold text-slate-700 text-sm">${helpers.escapeHtml(
            log.action
          )}</span>
          <span class="text-[11px] text-slate-400">${formatDateValue(
            log.at,
            true
          )}</span>
        </div>
        <p class="text-[13px] text-slate-600">${helpers.escapeHtml(
          log.note || ""
        )}</p>
        <div class="text-[11px] text-slate-400">Bởi: ${helpers.escapeHtml(
          log.actor?.full_name || "Hệ thống"
        )}</div>
      `;
      container.appendChild(li);
    });
  }

  function renderRelatedDocs(listPayload) {
    const list = toArray(listPayload);
    const container = $("[data-case-docs]");
    if (!container) return;
    container.innerHTML = "";

    if (!list || list.length === 0) {
      container.innerHTML = `<li class="text-center text-sm text-slate-500 py-2">Chưa có văn bản liên quan.</li>`;
      return;
    }

    list.forEach((item) => {
      const doc = item.document;
      const li = document.createElement("li");
      li.className =
        "rounded-lg border border-slate-100 p-3 flex items-center justify-between gap-3";
      const docUrl =
        doc.direction === "di"
          ? `/lanhdao/vanbandi-detail.html?id=${doc.id}`
          : `/lanhdao/vanbanden-detail.html?id=${doc.id}`;

      li.innerHTML = `
        <div>
          <a href="${docUrl}" class="font-medium text-slate-700 hover:text-blue-600 block">
            ${helpers.escapeHtml(doc.document_code || "—")}
          </a>
          <div class="text-[12px] text-slate-500 line-clamp-1">
            ${helpers.escapeHtml(doc.title || doc.subject || "—")}
          </div>
        </div>
        <span class="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 whitespace-nowrap">
          ${doc.direction === "di" ? "Đi" : "Đến"}
        </span>
      `;
      container.appendChild(li);
    });
  }

  function updateTaskMetrics(tasksPayload) {
    const tasks = toArray(tasksPayload);
    if (!tasks) return;
    const total = tasks.length;
    const completed = tasks.filter(
      (t) => t.status === "DONE" || t.status === "Hoàn thành"
    ).length;
    const overdue = tasks.filter((t) => {
      if (t.status === "DONE" || !t.due_at) return false;
      return new Date(t.due_at) < new Date();
    }).length;
    const open = total - completed;

    setText('[data-case-metric="tasks-completed"]', `${completed} / ${total}`);
    setText('[data-case-metric="tasks-overdue"]', overdue);
    setText('[data-case-metric="tasks-open"]', open);
  }

  function updateDocMetrics(docsPayload) {
    const docs = toArray(docsPayload);
    if (!docs) return;
    setText('[data-case-metric="docs-count"]', docs.length);
  }

  function setupInteractions() {
    const btnAddActivity = $("[data-action='add-activity']");
    if (btnAddActivity) {
      btnAddActivity.addEventListener("click", () => {
        const note = prompt("Nhập nội dung nhật ký:");
        if (note && note.trim()) {
          postComment(note.trim());
        }
      });
    }
    setupTaskManagement();
    setupFileUpload();
  }

  async function postComment(content) {
    try {
      await api.request("/api/v1/comments/", {
        method: "POST",
        body: { entity_type: "case", entity_id: caseId, content: content },
      });
      loadActivityLogsAndComments();
    } catch (error) {
      console.error("Error posting comment:", error);
      alert("Không thể lưu nhật ký: " + helpers.resolveErrorMessage(error));
    }
  }

  async function loadActivityLogsAndComments() {
    try {
      const [logs, comments] = await Promise.all([
        api.request(`/api/v1/cases/${caseId}/activity-logs/`),
        api.request(`/api/v1/comments/?entity_type=case&entity_id=${caseId}`),
      ]);

      const logList = toArray(logs);
      const commentList = toArray(comments);

      activityLogs = logList;

      const combined = [
        ...logList.map((l) => ({ ...l, type: "log", at: l.at })),
        ...commentList.map((c) => ({
          action: "Bình luận",
          note: c.content,
          actor: c.user,
          at: c.created_at,
          type: "comment",
        })),
      ];

      combined.sort((a, b) => new Date(b.at) - new Date(a.at));
      renderActivityLogs(combined);

      const tbody = $("[data-case-members]");
      if (
        tbody &&
        tbody.children.length > 0 &&
        !tbody.querySelector("[data-case-members-placeholder]")
      ) {
        try {
          const participantsRes = await api.request(
            `/api/v1/cases/${caseId}/participants/`
          );
          renderParticipants(toArray(participantsRes));
        } catch (e) {
          console.error("Error reloading participants after activity logs:", e);
        }
      }
    } catch (e) {
      console.error("Error loading merged logs:", e);
    }
  }

  function setText(selector, value) {
    const el = $(selector);
    if (el) el.textContent = value;
  }

  function renderPlaceholder(dataAttr, msg) {
    const container = $(`[data-${dataAttr}]`);
    if (!container) return;
    const tag = (container.tagName || "").toUpperCase();
    if (tag === "TBODY") {
      const colspan = dataAttr === "case-members" ? 6 : 4;
      container.innerHTML = `<tr><td colspan="${colspan}" class="px-5 py-8 text-center text-sm text-slate-500">${msg}</td></tr>`;
      return;
    }
    const wrapper =
      tag === "UL" || tag === "OL"
        ? `<li class="rounded-lg border border-slate-100 p-3 text-center text-sm text-slate-500">${msg}</li>`
        : `<div class="rounded-lg border border-slate-100 p-3 text-center text-sm text-slate-500">${msg}</div>`;
    container.innerHTML = wrapper;
  }

  function getStatusColor(code) {
    const normalized = code ? String(code).toUpperCase().trim().replace(/\s+/g, '_') : '';
    const map = {
      'MOI_TAO': 'bg-blue-50 text-blue-700',
      'CHO_PHAN_CONG': 'bg-amber-50 text-amber-700',
      'DA_PHAN_CONG': 'bg-purple-50 text-purple-700',
      'DANG_THUC_HIEN': 'bg-emerald-50 text-emerald-700',
      'TAM_DUNG': 'bg-slate-50 text-slate-700',
      'CHO_DUYET_DONG': 'bg-orange-50 text-orange-700',
      'DONG': 'bg-gray-50 text-gray-700'
    };
    return map[normalized] || 'bg-slate-50 text-slate-700';
  }

  function getPriorityLabel(priority) {
    const map = {
      LOW: "Thấp",
      MEDIUM: "Trung bình",
      HIGH: "Cao",
      URGENT: "Khẩn cấp",
    };
    return map[priority] || priority || "Thường";
  }

  function getPriorityColor(priority) {
    const map = {
      LOW: "bg-slate-100 text-slate-700",
      MEDIUM: "bg-blue-50 text-blue-700",
      HIGH: "bg-amber-100 text-amber-700",
      URGENT: "bg-rose-100 text-rose-700",
    };
    return map[priority] || "bg-slate-100 text-slate-700";
  }

  function getRoleLabel(role) {
    const map = { owner: "Chủ trì", assignee: "Phối hợp", watcher: "Theo dõi" };
    return map[role] || role;
  }

  function getTaskStatusColor(status) {
    if (status === "DONE" || status === "Hoàn thành")
      return "bg-emerald-100 text-emerald-700";
    if (status === "IN_PROGRESS" || status === "Đang làm")
      return "bg-blue-100 text-blue-700";
    if (status === "CANCELLED" || status === "Đã hủy")
      return "bg-rose-100 text-rose-700";
    return "bg-slate-100 text-slate-600";
  }

  async function loadAttachments() {
    try {
      const attachmentsRes = await api.request(
        `/api/v1/cases/${caseId}/attachments/`
      );
      const attachments = toArray(attachmentsRes);
      renderAttachments(attachments);
    } catch (error) {
      console.error("Error loading attachments:", error);
      renderPlaceholder("case-attachments", "Không thể tải tệp đính kèm.");
    }
  }

  function renderAttachments(listPayload) {
    const list = toArray(listPayload);
    const container = $("[data-case-attachments]");
    if (!container) return;
    container.innerHTML = "";

    if (!list || list.length === 0) {
      container.innerHTML = `<li class="text-center text-sm text-slate-500 py-2">Chưa có tệp đính kèm.</li>`;
      return;
    }

    list.forEach((att) => {
      const li = document.createElement("li");
      li.className =
        "rounded-lg border border-slate-100 p-3 flex items-center justify-between gap-3";
      const sizeKB = att.file_size ? Math.round(att.file_size / 1024) : 0;

      li.innerHTML = `
        <div>
          <div class="font-medium text-slate-700">${helpers.escapeHtml(
            att.file_name || "—"
          )}</div>
          <div class="text-[12px] text-slate-500">${sizeKB} KB • ${formatDateValue(
        att.uploaded_at,
        true
      )}</div>
        </div>
        <div class="flex items-center gap-2">
          <button class="text-rose-600 hover:text-rose-700 text-sm" data-delete-file="${
            att.attachment_id
          }">Xóa</button>
        </div>
      `;
      container.appendChild(li);
    });
  }

  function setupFileUpload() {
    const btnUpload = $("[data-action='upload-file']");
    if (btnUpload) {
      btnUpload.addEventListener("click", () => {
        const modal = document.getElementById("modalUploadFile");
        if (modal) modal.showModal();
      });
    }

    const form = $("[data-form='upload-file']");
    if (form) {
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        try {
          await api.request(`/api/v1/cases/${caseId}/attachments/`, {
            method: "POST",
            body: formData,
            headers: {},
          });
          document.getElementById("modalUploadFile").close();
          form.reset();
          await loadAttachments();
          alert("Đã tải lên tệp thành công.");
        } catch (error) {
          alert("Lỗi tải lên: " + helpers.resolveErrorMessage(error));
        }
      });
    }

    document.addEventListener("click", async (e) => {
      const deleteBtn = e.target.closest("[data-delete-file]");
      if (!deleteBtn) return;
      if (!confirm("Xác nhận xóa tệp này?")) return;
      const attachmentId = deleteBtn.dataset.deleteFile;
      try {
        await api.request(
          `/api/v1/cases/${caseId}/attachments/${attachmentId}/`,
          { method: "DELETE" }
        );
        await loadAttachments();
        alert("Đã xóa tệp.");
      } catch (error) {
        alert("Lỗi xóa tệp: " + helpers.resolveErrorMessage(error));
      }
    });
  }

  function setupTaskManagement() {
    const btnAdd = $("[data-action='add-task']");
    if (btnAdd) {
      btnAdd.addEventListener("click", async () => {
        await populateTaskAssignees();
        const modal = document.getElementById("modalAddTask");
        if (modal) modal.showModal();
      });
    }

    const formAdd = $("[data-form='add-task']");
    if (formAdd) {
      console.log("[LD] setupTaskManagement: Attaching submit listener to add-task form");
      formAdd.addEventListener("submit", async (e) => {
        e.preventDefault();
        console.log("[LD] add-task form submitted");
        const formData = new FormData(e.target);
        
        // Validate title is not empty
        const title = formData.get("title");
        console.log("[LD] Task title value:", title, "| Type:", typeof title, "| Length:", title ? title.length : 0);
        
        if (!title || !title.trim()) {
          console.warn("[LD] Title validation failed - showing alert");
          alert("Vui lòng nhập tiêu đề nhiệm vụ.");
          return;
        }
        
        console.log("[LD] Title validation passed, preparing payload");
        
        // Build payload - only include assignee_id if it has a valid value
        const assigneeId = formData.get("assignee_id");
        const dueAt = formData.get("due_at");
        const note = formData.get("note");
        
        const payload = {
          title: title.trim(),
          note: note || "",
        };
        
        // Only add assignee_id if it's not empty and not 'undefined'
        if (assigneeId && assigneeId.trim() && assigneeId !== 'undefined') {
          payload.assignee_id = assigneeId.trim();
        }
        
        // Only add due_at if it's not empty
        if (dueAt && dueAt.trim()) {
          payload.due_at = dueAt.trim();
        }
        
        console.log("[LD] Sending payload to API:", payload);
        try {
          await api.request(`/api/v1/cases/${caseId}/tasks/`, {
            method: "POST",
            body: payload,
          });
          document.getElementById("modalAddTask").close();
          formAdd.reset();
          await loadTasks();
          showToast("Đã thêm nhiệm vụ thành công!", "success");
        } catch (error) {
          console.error("[LD] Error creating task:", error);
          showToast("Lỗi thêm nhiệm vụ: " + helpers.resolveErrorMessage(error), "error");
        }
      });
      console.log("[LD] Submit listener attached successfully");
    } else {
      console.warn("[LD] setupTaskManagement: Form with data-form='add-task' NOT FOUND!");
    }

    document.addEventListener("click", async (e) => {
      const editBtn = e.target.closest("[data-edit-task]");
      if (editBtn) {
        const taskId = editBtn.dataset.editTask;
        const taskData = editBtn.dataset.taskData
          ? JSON.parse(editBtn.dataset.taskData)
          : {};
        const modal = document.getElementById("modalEditTask");
        const form = $("[data-form='edit-task']");
        if (modal && form) {
          form.querySelector("[name='task_id']").value = taskId;
          form.querySelector("[name='title']").value = taskData.title || "";
          form.querySelector("[name='status']").value =
            taskData.status || "OPEN";
          modal.showModal();
        }
      }

      const deleteBtn = e.target.closest("[data-delete-task]");
      if (deleteBtn) {
        if (!confirm("Xác nhận xóa nhiệm vụ?")) return;
        const taskId = deleteBtn.dataset.deleteTask;
        try {
          await api.request(`/api/v1/case-tasks/${taskId}/`, { method: "DELETE" });
          await loadTasks();
          showToast("Đã xóa nhiệm vụ thành công!", "success");
        } catch (error) {
          showToast("Lỗi xóa nhiệm vụ: " + helpers.resolveErrorMessage(error), "error");
        }
      }
    });

    const formEdit = $("[data-form='edit-task']");
    if (formEdit) {
      formEdit.addEventListener("submit", async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const taskId = formData.get("task_id");
        const payload = {
          title: formData.get("title"),
          status: formData.get("status"),
        };
        try {
          await api.request(`/api/v1/case-tasks/${taskId}/`, {
            method: "PATCH",
            body: payload,
          });
          document.getElementById("modalEditTask").close();
          await loadTasks();
          showToast("Đã cập nhật nhiệm vụ thành công!", "success");
        } catch (error) {
          showToast("Lỗi cập nhật nhiệm vụ: " + helpers.resolveErrorMessage(error), "error");
        }
      });
      
    }
  }

  async function populateTaskAssignees() {
    const select = $("[data-task-assignees]");
    if (!select) return;
    select.innerHTML = '<option value="">-- Chọn người phụ trách --</option>';
    try {
      const participants = await api.request(
        `/api/v1/cases/${caseId}/participants/`
      );
      participants.forEach((p) => {
        const user = p.user;
        
        // DEBUG: Log participant data
        console.log("[LD] Participant:", {
          username: user?.username,
          full_name: user?.full_name,
          role_on_case: p.role_on_case,
          user_role: user?.role
        });
        
        if (!user) return;

        // FILTER: Do not show Watchers (Văn thư/Theo dõi) in task assignment
        if (p.role_on_case === 'watcher' || user.role === 'VT') {
          console.log("[LD] FILTERED OUT:", user.username, "- role_on_case:", p.role_on_case, "user.role:", user.role);
          return;
        }
        
        const userId = user.user_id || user.id || user.pk || user.username;
        if (!userId) return;
        
        console.log("[LD] ADDING to dropdown:", user.username);
        const option = document.createElement("option");
        option.value = userId;
        option.textContent = user.full_name || user.username || "—";
        select.appendChild(option);
      });
      
      console.log("[LD] Populated task assignees, total options:", select.options.length - 1);
    } catch (error) {
      console.error("Error loading participants for task assignees:", error);
    }
  }

  function setActionButtonVisibility(button, visible) {
    if (!button) return;
    if (visible) {
      button.hidden = false;
      button.classList.remove("hidden");
      button.removeAttribute("hidden");
    } else {
      button.hidden = true;
      button.classList.add("hidden");
      button.setAttribute("hidden", "hidden");
    }
  }

  function updateActionButtons(statusCode, isWaitingAssignment) {
    const assignButtons = $$("[data-assign-button]");
    const confirmAssignButton = $('[data-action="confirm-assign"]');
    const addMemberButton = $('[data-action="add-member"]');
    const addTaskButton = $('[data-action="add-task"]');
    const buttons = {
      pause: $('[data-action="pause"]'),
      resume: $('[data-action="resume"]'),
      approve: $('[data-action="approve_close"]'),
      reject: $('[data-action="reject_close"]'),
      request_close: $('[data-action="request_close"]'), // LD should NOT have this
    };

    console.log("[LD] updateActionButtons called:", { statusCode, isWaitingAssignment });

    // Hide all non-assign buttons first
    if (buttons.pause) setActionButtonVisibility(buttons.pause, false);
    if (buttons.resume) setActionButtonVisibility(buttons.resume, false);
    if (buttons.approve) setActionButtonVisibility(buttons.approve, false);
    if (buttons.reject) setActionButtonVisibility(buttons.reject, false);
    if (buttons.request_close) setActionButtonVisibility(buttons.request_close, false); // Always hide for LD

    const normalizedStatus = statusCode
      ? String(statusCode).toUpperCase().trim().replace(/\s+/g, '_')
      : "";

    console.log("[LD] Normalized status (after replace):", normalizedStatus);

    // Determine if we can manage members and tasks
    // LD can only manage from CHO_PHAN_CONG onwards, NOT at MOI_TAO
    // Block management at: MOI_TAO, CHO_DUYET_DONG, DONG
    const canManage = normalizedStatus !== "MOI_TAO" && 
                      normalizedStatus !== "CHO_DUYET_DONG" && 
                      normalizedStatus !== "DONG";
    
    // Strict rule: Cannot assign/add members in DANG_THUC_HIEN
    // Only allow in TAM_DUNG or other valid statuses (excluding waiting assignment which is handled separately)
    const canManageMembers = canManage && normalizedStatus !== "DANG_THUC_HIEN";

    // Check if we're in a status that allows assignment operations
    const isWaitingOrPaused = isWaitingAssignment || normalizedStatus === "TAM_DUNG";

    // Toggle between "Assign" (CHO_PHAN_CONG) and "Add Member" (TAM_DUNG, etc.)
    if (isWaitingAssignment) {
      // Show assignment workflow buttons only
      assignButtons.forEach((btn) => {
        if (btn) {
          setActionButtonVisibility(btn, true);
          setAssignEnabled(btn, true);
        }
      });
      // Show confirm assign button in CHO_PHAN_CONG
      if (confirmAssignButton) setActionButtonVisibility(confirmAssignButton, true);

      // Hide add member button
      if (addMemberButton) setActionButtonVisibility(addMemberButton, false);
    } else {
      // Hide assignment workflow buttons
      assignButtons.forEach((btn) => {
        if (btn) setActionButtonVisibility(btn, false);
      });
      
      // Hide confirm assign button (only needed in CHO_PHAN_CONG)
      if (confirmAssignButton) setActionButtonVisibility(confirmAssignButton, false);

      // Show add member button if we can manage members (e.g. TAM_DUNG)
      if (addMemberButton) {
        setActionButtonVisibility(addMemberButton, canManageMembers);
        if (canManageMembers) {
          addMemberButton.disabled = false;
          addMemberButton.classList.remove("opacity-50", "cursor-not-allowed");
        } else {
          addMemberButton.disabled = true;
          addMemberButton.classList.add("opacity-50", "cursor-not-allowed");
        }
      }
    }
    
    // Handle add task button - only enabled in CHO_PHAN_CONG and TAM_DUNG, NOT in DANG_THUC_HIEN
    if (addTaskButton) {
      setActionButtonVisibility(addTaskButton, canManageMembers);
      if (canManageMembers) {
        addTaskButton.disabled = false;
        addTaskButton.classList.remove("opacity-50", "cursor-not-allowed");
      } else {
        addTaskButton.disabled = true;
        addTaskButton.classList.add("opacity-50", "cursor-not-allowed");
      }
    }

    // Handle other statuses
    if (
      normalizedStatus === "DANG_THUC_HIEN" ||
      normalizedStatus.includes("DANG_THUC_HIEN")
    ) {
      console.log("[LD] Status is DANG_THUC_HIEN, showing pause button");
      if (buttons.pause) setActionButtonVisibility(buttons.pause, true);
    } else if (
      normalizedStatus === "TAM_DUNG" ||
      normalizedStatus.includes("TAM_DUNG")
    ) {
      console.log("[LD] Status is TAM_DUNG, showing resume button");
      if (buttons.resume) setActionButtonVisibility(buttons.resume, true);
    } else if (
      normalizedStatus === "CHO_DUYET_DONG" ||
      normalizedStatus.includes("CHO_DUYET_DONG")
    ) {
      console.log("[LD] Status is CHO_DUYET_DONG, showing approve/reject buttons");
      if (buttons.approve) {
         console.log("[LD] Showing approve button");
         setActionButtonVisibility(buttons.approve, true);
      } else {
         console.warn("[LD] Approve button not found in DOM");
      }
      
      if (buttons.reject) {
         console.log("[LD] Showing reject button");
         setActionButtonVisibility(buttons.reject, true);
      } else {
         console.warn("[LD] Reject button not found in DOM");
      }
    } else {
      console.log("[LD] Status does not match any special actions:", normalizedStatus);
    }
    
    console.log("[LD] Button visibility updated, canManage:", canManage);
  }

  function showToast(message, type = "success") {
    const toast = $("#toast");
    const toastMessage = $("#toastMessage");
    if (!toast || !toastMessage) return;
    toastMessage.textContent = message;
    const colors = {
      success: "bg-emerald-600 text-white",
      error: "bg-rose-600 text-white",
      info: "bg-blue-600 text-white",
      warning: "bg-amber-600 text-white",
    };
    toast.className = `fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg transition-all duration-300 z-50 ${
      colors[type] || colors.success
    }`;
    toast.style.transform = "translateY(0)";
    toast.style.opacity = "1";
    setTimeout(() => {
      toast.style.transform = "translateY(20px)";
      toast.style.opacity = "0";
    }, 3000);
  }

  async function handleAssign() {
    const modal = $("#modalAssign");
    if (!modal) return;
    modal.showModal();
    const form = modal.querySelector('[data-form="assign"]');
    if (!form) return;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const note = formData.get("note") || "";
      try {
        await api.request(`/api/v1/cases/${caseId}/assign/`, {
          method: "POST",
          body: { note },
        });
        modal.close();
        showToast("Đã phân công hồ sơ thành công!", "success");
        setTimeout(() => window.location.reload(), 1500);
      } catch (error) {
        showToast(error.message || "Không thể phân công hồ sơ", "error");
      }
    };
  }

  async function handlePause() {
    const modal = $("#modalPause");
    if (!modal) return;
    modal.showModal();
    const form = modal.querySelector('[data-form="pause"]');
    if (!form) return;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const reason = formData.get("reason");
      if (!reason || !reason.trim()) {
        showToast("Vui lòng nhập lý do tạm dừng", "warning");
        return;
      }
      try {
        await api.request(`/api/v1/cases/${caseId}/pause/`, {
          method: "POST",
          body: { reason: reason.trim() },
        });
        modal.close();
        showToast("Đã tạm dừng hồ sơ", "success");
        setTimeout(() => window.location.reload(), 1500);
      } catch (error) {
        showToast(error.message || "Không thể tạm dừng hồ sơ", "error");
      }
    };
  }

  async function handleResume() {
    const modal = $("#modalResume");
    if (!modal) return;
    modal.showModal();
    const form = modal.querySelector('[data-form="resume"]');
    if (!form) return;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const note = formData.get("note") || "";
      try {
        await api.request(`/api/v1/cases/${caseId}/resume/`, {
          method: "POST",
          body: { note },
        });
        modal.close();
        showToast("Đã tiếp tục hồ sơ", "success");
        setTimeout(() => window.location.reload(), 1500);
      } catch (error) {
        showToast(error.message || "Không thể tiếp tục hồ sơ", "error");
      }
    };
  }

  async function handleApproveClose() {
    const modal = $("#modalApproveClose");
    if (!modal) return;
    modal.showModal();
    const form = modal.querySelector('[data-form="approve-close"]');
    if (!form) return;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const note = formData.get("note") || "";
      try {
        await api.request(`/api/v1/cases/${caseId}/approve_close/`, {
          method: "POST",
          body: { note },
        });
        modal.close();
        showToast("Đã duyệt đóng hồ sơ", "success");
        setTimeout(() => window.location.reload(), 1500);
      } catch (error) {
        showToast(error.message || "Không thể duyệt đóng hồ sơ", "error");
      }
    };
  }

  async function handleRejectClose() {
    const modal = $("#modalRejectClose");
    if (!modal) return;
    modal.showModal();
    const form = modal.querySelector('[data-form="reject-close"]');
    if (!form) return;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const reason = formData.get("reason");
      if (!reason || !reason.trim()) {
        showToast("Vui lòng nhập lý do từ chối", "warning");
        return;
      }
      try {
        await api.request(`/api/v1/cases/${caseId}/reject_close/`, {
          method: "POST",
          body: { reason: reason.trim() },
        });
        modal.close();
        showToast("Đã từ chối đóng hồ sơ", "success");
        setTimeout(() => window.location.reload(), 1500);
      } catch (error) {
        showToast(error.message || "Không thể từ chối đóng hồ sơ", "error");
      }
    };
  }

  function setAssignEnabled(btn, enabled) {
    if (!btn) return;
    if (enabled) {
      btn.disabled = false;
      btn.classList.remove("opacity-50", "cursor-not-allowed");
    } else {
      btn.disabled = true;
      btn.classList.add("opacity-50", "cursor-not-allowed");
    }
  }

  function setupWorkflowActions() {
    const assignButtons = $$('[data-action="assign"]');
    assignButtons.forEach((btn) => {
      // Check if listener already attached
      if (btn.hasAttribute("data-assign-click-listener")) {
        return;
      }

      btn.addEventListener("click", () => {
        if (btn.id === "btnAssignMember") {
          // Open assignment modal for CHO_PHAN_CONG status
          const modal = $("#modalAssignment");
          if (modal) {
            modal.showModal();
            // Load specialists into modal dropdown
            const modalSelect = document.querySelector("#assignment-assignee");
            if (modalSelect) {
              loadCandidateSpecialists(null).catch(err => 
                console.error("[LD] Error loading specialists for modal:", err)
              );
            }
          }
        } else {
          const modalAddMember = $("#modalAddMember");
          if (modalAddMember) {
            handleAddMember();
          } else {
            handleAssign();
          }
        }
      });

      btn.setAttribute("data-assign-click-listener", "true");
    });

    const btnConfirmAssign = $('[data-action="confirm-assign"]');
    if (btnConfirmAssign) {
      btnConfirmAssign.addEventListener("click", handleFinalConfirmation);
    }

    const btnPause = $('[data-action="pause"]');
    if (btnPause) btnPause.addEventListener("click", handlePause);
    const btnResume = $('[data-action="resume"]');
    if (btnResume) btnResume.addEventListener("click", handleResume);
    const btnApprove = $('[data-action="approve_close"]');
    if (btnApprove) btnApprove.addEventListener("click", handleApproveClose);
    const btnReject = $('[data-action="reject_close"]');
    if (btnReject) btnReject.addEventListener("click", handleRejectClose);
  }

  // Setup member management
  function setupMemberManagement() {
    const btnAdd = $('[data-action="add-member"]');
    if (btnAdd) {
      btnAdd.addEventListener("click", handleAddMember);
    }
    
    // Handle delete member
    document.addEventListener("click", async (e) => {
      const deleteBtn = e.target.closest("[data-delete-member]");
      if (!deleteBtn) return;
      const userId = deleteBtn.dataset.deleteMember;
      await handleDeleteMember(userId);
    });
  }

  function showAssignForm() {
    const wrapper = $("#ld-assign-wrapper");
    if (wrapper) wrapper.classList.remove("hidden");
  }

  function hideAssignForm() {
    const wrapper = $("#ld-assign-wrapper");
    if (wrapper) wrapper.classList.add("hidden");
  }

  // Populate member select based on role
  async function populateMemberSelect(role = 'assignee') {
    const select = document.querySelector('[data-add-member-users]');
    if (!select) return;

    // Clear current options
    select.innerHTML = '<option value="">-- Đang tải... --</option>';

    try {
      let users = [];
      if (role === 'watcher') {
        // Load VT users using Clerk API (accessible by LD)
        const payload = await api.clerks.list();
        users = Array.isArray(payload) ? payload : (payload.results || []);
      } else {
        // Load Specialists (CV)
        try {
            const payload = await api.specialists.list({ ordering: 'full_name' });
            users = Array.isArray(payload) ? payload : (payload.results || []);
        } catch (e) {
            console.warn("[LD] Specialists API failed, fallback to users API", e);
            const payload = await api.users.list({ role: 'CV', ordering: 'full_name' });
            users = Array.isArray(payload) ? payload : (payload.results || []);
        }
      }

      // Render options
      if (users.length === 0) {
        select.innerHTML = '<option value="">-- Không tìm thấy người dùng --</option>';
      } else {
        select.innerHTML = '<option value="">-- Chọn người dùng --</option>' + 
          users.map(u => `<option value="${u.id || u.user_id}">${u.full_name || u.username} (${u.department_name || '---'})</option>`).join('');
      }
    } catch (err) {
      console.error("[LD] Error loading users:", err);
      select.innerHTML = '<option value="">-- Lỗi tải dữ liệu --</option>';
    }
  }

  async function handleAddMember() {
    const modal = $("#modalAddMember");
    if (!modal) return;
    
    // Initial populate
    const form = modal.querySelector('[data-form="add-member-simple"]');
    if (!form) return;

    const roleSelect = form.querySelector('[data-role-select]');
    if (roleSelect) {
        // Reset to default
        roleSelect.value = 'assignee';
        // Attach listener
        roleSelect.onchange = () => populateMemberSelect(roleSelect.value);
    }

    await populateMemberSelect('assignee');
    modal.showModal();
    
    form.onsubmit = async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const userId = formData.get("user_id");
      const roleOnCase = formData.get("role_on_case");
      
      console.log("[LD] handleAddMember submit:", { userId, roleOnCase });
      
      if (!userId || !roleOnCase) {
        showToast("Vui lòng chọn đầy đủ thông tin", "warning");
        return;
      }
      try {
        const existingParticipants = await api.request(
          `/api/v1/cases/${caseId}/participants/`
        );
        
        console.log("[LD] Existing participants:", existingParticipants);
        
        const normalized = (
          Array.isArray(existingParticipants)
            ? existingParticipants
            : existingParticipants?.participants || []
        )
          .map((item) => {
            const user = item.user;
            // ✅ Only accept UUID fields, NOT username
            const normalizedUserId = user?.user_id || user?.id || user?.pk;
            if (!normalizedUserId || !item.role_on_case) {
              console.warn("[LD] Skipping participant with invalid user_id:", item);
              return null;
            }
            return {
              user_id: String(normalizedUserId), // Ensure string format
              role_on_case: item.role_on_case,
            };
          })
          .filter(Boolean);
          
        console.log("[LD] Normalized existing participants:", normalized);
        
        // Filter out existing user (if re-adding with different role)
        const filtered = normalized.filter((item) => item.user_id !== userId);
        
        // Add new participant
        filtered.push({ 
          user_id: String(userId),
          role_on_case: roleOnCase 
        });
        
        console.log("[LD] Final participants payload:", { participants: filtered });
        
        await api.request(`/api/v1/cases/${caseId}/participants/`, {
          method: "PUT",
          body: { participants: filtered },
        });
        
        showToast("Đã thêm thành viên thành công");
        modal.close();
        form.reset();
        await loadParticipants();
      } catch (err) {
        console.error("[LD] handleAddMember error:", err);
        showToast(err.message || "Không thể thêm thành viên", "error");
      }
    };
  }

  async function handleDeleteMember(userId) {
    if (!confirm("Bạn có chắc chắn muốn xóa thành viên này khỏi hồ sơ?")) return;

    try {
      const existingParticipants = await api.request(
        `/api/v1/cases/${caseId}/participants/`
      );

      const normalized = (
        Array.isArray(existingParticipants)
          ? existingParticipants
          : existingParticipants?.participants || []
      )
        .map((item) => {
          const user = item.user;
          const normalizedUserId = user?.user_id || user?.id || user?.pk;
          if (!normalizedUserId || !item.role_on_case) return null;
          return {
            user_id: String(normalizedUserId),
            role_on_case: item.role_on_case,
          };
        })
        .filter(Boolean);

      // Filter out the user to delete
      const filtered = normalized.filter((item) => item.user_id !== String(userId));

      if (filtered.length === normalized.length) {
        showToast("Thành viên không tồn tại trong danh sách", "warning");
        return;
      }

      await api.request(`/api/v1/cases/${caseId}/participants/`, {
        method: "PUT",
        body: { participants: filtered },
      });

      showToast("Đã xóa thành viên thành công");
      await loadParticipants();
    } catch (err) {
      console.error("[LD] handleDeleteMember error:", err);
      showToast(err.message || "Không thể xóa thành viên", "error");
    }
  }

  // Show message in assign form
  function showAssignMessage(text, isError) {
    const assignMessage = $("#ld-assign-message");
    if (!assignMessage) return;
    assignMessage.textContent = text || "";
    assignMessage.classList.toggle("text-rose-500", Boolean(isError));
    assignMessage.classList.toggle(
      "text-emerald-600",
      Boolean(!isError && text)
    );
  }

  // === PENDING SPECIALISTS MANAGEMENT ===
  function addPendingSpecialist(specialist, taskData) {
    // specialist: { user_id, full_name, department_name }
    // taskData: { title, due_at }
    const userId = specialist.user_id || specialist.id;

    // Check if already added
    const existing = pendingSpecialists.find((s) => s.user_id === userId);
    if (existing) {
      showAssignMessage("Chuyên viên này đã được thêm vào danh sách.", true);
      return false;
    }

    pendingSpecialists.push({
      user_id: userId,
      full_name: specialist.full_name || specialist.username,
      department_name:
        specialist.department_name || specialist.department?.name || "",
      task: taskData || { title: "", due_at: "" },
    });

    renderPendingSpecialists();
    showAssignMessage(
      `Đã thêm ${specialist.full_name || specialist.username}`,
      false
    );
    return true;
  }

  function removePendingSpecialist(userId) {
    const index = pendingSpecialists.findIndex((s) => s.user_id === userId);
    if (index >= 0) {
      const removed = pendingSpecialists.splice(index, 1)[0];
      renderPendingSpecialists();
      showAssignMessage(`Đã xóa ${removed.full_name}`, false);
    }
  }

  function updatePendingSpecialistTask(userId, taskData) {
    const specialist = pendingSpecialists.find((s) => s.user_id === userId);
    if (specialist) {
      specialist.task = taskData;
    }
  }

  function renderPendingSpecialists() {
    const container = $("#pending-specialists-list");
    if (!container) return;

    if (pendingSpecialists.length === 0) {
      container.innerHTML = `
        <div class="text-sm text-slate-500 text-center py-3">
          Chưa có chuyên viên nào được chọn. Vui lòng chọn chuyên viên và nhấn "Thêm vào danh sách".
        </div>
      `;

      // Hide/disable final confirmation button
      const confirmBtn = $("#btn-final-confirm");
      if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.classList.add("opacity-50", "cursor-not-allowed");
      }
      return;
    }

    // Enable final confirmation button
    const confirmBtn = $("#btn-final-confirm");
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.classList.remove("opacity-50", "cursor-not-allowed");
    }

    container.innerHTML = pendingSpecialists
      .map(
        (specialist, index) => `
      <div class="border border-slate-200 rounded-lg p-3 space-y-3" data-specialist-id="${
        specialist.user_id
      }">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium text-slate-700">${helpers.escapeHtml(
              specialist.full_name
            )}</div>
            <div class="text-xs text-slate-500">${helpers.escapeHtml(
              specialist.department_name || "—"
            )}</div>
          </div>
          <button 
            type="button"
            class="text-rose-600 hover:text-rose-700 text-sm font-medium"
            data-remove-pending="${specialist.user_id}"
          >
            Xóa
          </button>
        </div>
        
        <div class="space-y-2 border-t border-slate-100 pt-3">
          <div>
            <label class="text-xs font-medium text-slate-700">Nhiệm vụ</label>
            <input 
              type="text"
              class="w-full px-3 py-2 border border-slate-200 rounded-md text-sm"
              placeholder="Nhập nhiệm vụ cho chuyên viên này"
              value="${helpers.escapeHtml(specialist.task?.title || "")}"
              data-task-title="${specialist.user_id}"
            />
          </div>
          <div>
            <label class="text-xs font-medium text-slate-700">Hạn xử lý</label>
            <input 
              type="datetime-local"
              class="w-full px-3 py-2 border border-slate-200 rounded-md text-sm"
              value="${specialist.task?.due_at || ""}"
              data-task-due="${specialist.user_id}"
            />
          </div>
        </div>
      </div>
    `
      )
      .join("");

    // Attach event listeners for task inputs
    pendingSpecialists.forEach((specialist) => {
      const titleInput = container.querySelector(
        `[data-task-title="${specialist.user_id}"]`
      );
      const dueInput = container.querySelector(
        `[data-task-due="${specialist.user_id}"]`
      );

      if (titleInput) {
        titleInput.addEventListener("input", (e) => {
          updatePendingSpecialistTask(specialist.user_id, {
            title: e.target.value,
            due_at: dueInput?.value || "",
          });
        });
      }

      if (dueInput) {
        dueInput.addEventListener("change", (e) => {
          updatePendingSpecialistTask(specialist.user_id, {
            title: titleInput?.value || "",
            due_at: e.target.value,
          });
        });
      }
    });

    // Attach remove buttons
    container.querySelectorAll("[data-remove-pending]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const userId = btn.dataset.removePending;
        removePendingSpecialist(userId);
      });
    });
  }

  function loadCandidateSpecialists(departmentId) {
    console.log("[LD] loadCandidateSpecialists called with departmentId:", departmentId);
    
    const assignSelect = $("#ld-assign-assignee");
    if (!assignSelect) {
      console.warn("[LD] Assign select element not found");
      return Promise.resolve();
    }

    const extractUsers = (payload) => {
      if (typeof api?.extractItems === "function")
        return api.extractItems(payload);
      return toArray(payload);
    };

    const doLoad = (params, client) => {
      console.log("[LD] Loading specialists with params:", params);
      console.log("[LD] Using client:", client === api.specialists ? "api.specialists" : "api.users");
      
      showAssignMessage("", false);
      return client
        .list(params)
        .then((payload) => {
          console.log("[LD] Specialists API response:", payload);
          const users = extractUsers(payload);
          console.log("[LD] Extracted users count:", users.length);
          renderAssignOptions(users);
          return users;
        })
        .catch((error) => {
          console.error("[LD] Error loading specialists:", error);
          showAssignMessage("Không tải được danh sách chuyên viên.", true);
          renderAssignOptions([]);
          throw error;
        });
    };

    const params = { ordering: "full_name" };
    if (departmentId) params.department_id = departmentId;
    
    // Check if api.specialists exists
    const client = api?.specialists?.list ? api.specialists : api.users;
    if (client === api.users) {
      console.log("[LD] Fallback to api.users, adding role filter");
      params.role = "CV";
    }

    console.log("[LD] Final params:", params);
    return doLoad(params, client);
  }

  function renderAssignOptions(users) {
    console.log("[LD] renderAssignOptions called with:", users);
    
    // Try modal first, fallback to inline form (for backwards compatibility)
    const assignSelect = $("#assignment-assignee") || $("#ld-assign-assignee");
    if (!assignSelect) {
      console.warn("[LD] Assign select not found in renderAssignOptions");
      return;
    }
    
    assignSelect.innerHTML = '<option value="">Chọn chuyên viên</option>';
    const list = Array.isArray(users) ? users : [];
    
    console.log("[LD] Rendering", list.length, "specialists");
    
    list.forEach((user, index) => {
      let id = user.user_id || user.id || user.pk;
      if (!id) {
        console.warn("[LD] User at index", index, "has no ID:", user);
        return;
      }
      
      const originalId = String(id);
      id = String(id).replace(/-/g, "").toLowerCase();
      const option = document.createElement("option");
      option.value = id;
      option.dataset.originalId = originalId;
      
      const labelParts = [];
      if (user.full_name) labelParts.push(user.full_name);
      const dept = user.department_name || user.department?.name || "";
      if (dept) labelParts.push(`(${dept})`);
      
      option.textContent =
        labelParts.length > 0
          ? labelParts.join(" ")
          : user.username || user.email || option.value;
      
      console.log("[LD] Adding option:", option.textContent, "(value:", option.value, ")");
      assignSelect.appendChild(option);
    });
    
    console.log("[LD] Finished rendering. Total options:", assignSelect.options.length);
  }

  async function handleAssignSubmit(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const assignSelect = $("#ld-assign-assignee");
    if (!assignSelect) return;

    const selectedOption = assignSelect.options[assignSelect.selectedIndex];
    if (!selectedOption || !selectedOption.value) {
      showAssignMessage("Vui lòng chọn chuyên viên.", true);
      return;
    }

    // Get specialist data from the option
    const specialist = {
      user_id: selectedOption.dataset.originalId || selectedOption.value,
      full_name: selectedOption.textContent.split("(")[0].trim(),
      department_name: selectedOption.textContent.match(/\((.*?)\)/)?.[1] || "",
    };

    // Add to pending list
    const added = addPendingSpecialist(specialist);

    if (added) {
      // Reset the select
      assignSelect.selectedIndex = 0;

      // Focus on first task input for the newly added specialist
      setTimeout(() => {
        const taskInput = document.querySelector(
          `[data-task-title="${specialist.user_id}"]`
        );
        if (taskInput) taskInput.focus();
      }, 100);
    }
  }

  async function handleFinalConfirmation() {
    const confirmBtn = $("#btnConfirmAssign");
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = "Đang xử lý...";
    }

    try {
      // Step 1: Get existing participants to validate
      const existingParticipants = await api.request(
        `/api/v1/cases/${caseId}/participants/`
      );
      
      const participants = Array.isArray(existingParticipants) 
        ? existingParticipants 
        : (existingParticipants.participants || []);

      // Check if there are any assignees (role 'assignee')
      const hasAssignee = participants.some(p => p.role_on_case === 'assignee');

      if (!hasAssignee) {
        showToast("Vui lòng phân công ít nhất một chuyên viên trước khi xác nhận.", "warning");
        if (confirmBtn) {
          confirmBtn.disabled = false;
          confirmBtn.textContent = "Xác nhận phân công";
        }
        return;
      }

      // Step 2: Confirm assignment (transition status)
      const payload = {
        participants: participants.map(p => ({
          user_id: p.user.id || p.user.user_id || p.user.pk,
          role_on_case: p.role_on_case,
          instruction: p.instruction || ""
        })),
        tasks: [] 
      };

      await api.request(`/api/v1/cases/${caseId}/assign/`, {
        method: "POST",
        body: payload,
      });

      showToast("Đã phân công hồ sơ thành công!", "success");
      setTimeout(() => window.location.reload(), 1500);

    } catch (error) {
      console.error("[LD] Error in final confirmation:", error);
      showToast(error.message || "Không thể hoàn tất phân công.", "error");

      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Xác nhận phân công";
      }
    }
  }
})();
