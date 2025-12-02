(function () {
  function onReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  function getDocId() {
    const query = new URLSearchParams(window.location.search);
    if (query.has("id")) {
      return query.get("id");
    }
    const parts = window.location.pathname.split("/").filter(Boolean);
    return parts.pop() || null;
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

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      const str = String(value).split("T")[0];
      if (str) return str.split("-").reverse().join("/");
      return String(value);
    }
    return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    return `${formatDate(date)} ${time}`;
  }

  function formatUser(user) {
    if (!user) return "—";
    if (typeof user === "string") return user;
    return user.full_name || user.name || user.username || "—";
  }

  function toArray(payload) {
    if (!payload) return [];
    // Handle direct array responses (from non-paginated endpoints like specialists)
    if (Array.isArray(payload)) return payload;
    // Handle paginated responses
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.results)) return payload.results;
    return [];
  }

  // Use shared status handling from status-constants.js
  const OutboundStatusModule = window.OutboundStatus || {};
  const normalizeStatus = OutboundStatusModule.normalizeStatus || ((raw) => {
    console.warn("[CV] OutboundStatus module not loaded");
    return "DRAFT";
  });

  // CV can only edit in DRAFT status (RETURNED removed)
  const EDITABLE_STATUSES = new Set(["DRAFT"]);

  onReady(() => {
    const docId = getDocId();
    if (!docId) {
      console.warn("[chuyenvien] Thiếu document_id cho chi tiết văn bản đi.");
      return;
    }
    const api = window.ApiClient;
    const docApi = api?.documents;
    if (!docApi) {
      console.warn("[chuyenvien] Document API không sẵn sàng cho chi tiết.");
      return;
    }

    window.CVOutboundDetailOverride = true;

    const errorEl = document.getElementById("doc-detail-error");
    const directionBadge = document.getElementById("doc-badge-direction");
    const statusBadge = document.getElementById("doc-badge-status");
    const urgencyBadge = document.getElementById("doc-badge-urgency");
    const titleEl = document.getElementById("doc-title");
    const summaryEl = document.getElementById("doc-summary");
    const metaCode = document.getElementById("doc-meta-code");
    const metaIssue = document.getElementById("doc-meta-issue");
    const metaIssued = document.getElementById("doc-meta-issued");
    const metaSignDate = document.getElementById("doc-meta-sign-date");
    const metaSigner = document.getElementById("doc-meta-signer");
    const metaSignMethod = document.getElementById("doc-meta-sign-method");
    const metaDepartment = document.getElementById("doc-meta-department");
    const metaPublisher = document.getElementById("doc-meta-publisher");
    const metaRecipients = document.getElementById("doc-meta-recipients");
    const assignmentsBody = document.getElementById("doc-assignments-body");
    const approvalsList = document.getElementById("doc-approvals");
    const approvalsCount = document.getElementById("doc-approval-count");
    const attachmentsList = document.getElementById("doc-attachment-list");
    const logsList = document.getElementById("doc-log-list");
    const dispatchList = document.getElementById("doc-dispatch-list");
    const dispatchNumberEl = document.getElementById("doc-dispatch-number");
    const dispatchDateEl = document.getElementById("doc-dispatch-date");
    const dispatchMethodEl = document.getElementById("doc-dispatch-methods");
    const versionsList = document.getElementById("doc-versions-list");
    const assignWrapper = document.getElementById("cv-assign-wrapper");
    const assignForm = document.getElementById("cv-assign-form");
    const assignSelect = document.getElementById("cv-assign-assignee");
    const assignDueAt = document.getElementById("cv-assign-due");
    const assignInstruction = document.getElementById("cv-assign-instruction");
    const assignSubmit = document.getElementById("cv-assign-submit");
    const assignMessage = document.getElementById("cv-assign-message");
    const attachmentForm = document.getElementById("cv-attachment-form");
    const attachmentInput = document.getElementById("cv-attachment-file");
    const attachmentSubmit = document.getElementById("cv-attachment-submit");
    const attachmentMessage = document.getElementById("cv-attachment-message");
    const workflowPanel = document.getElementById("doc-workflow-panel");
    const workflowTool = window.DocumentUIWorkflow;
    const commentList = document.getElementById("doc-comment-list");
    const commentForm = document.getElementById("cv-comment-form");
    const commentContent = document.getElementById("cv-comment-content");
    const commentMessage = document.getElementById("cv-comment-message");
    const commentToggle = document.getElementById("cv-comment-toggle");
    const commentApi = api?.comments;
    const commentEntityId = Number.parseInt(docId, 10);
    let currentNormalizedStatus = "DRAFT";

    function showError(message) {
      if (!errorEl) return;
      errorEl.textContent = message;
      errorEl.classList.remove("hidden");
    }

    function clearError() {
      if (!errorEl) return;
      errorEl.textContent = "";
      errorEl.classList.add("hidden");
    }

    function renderDoc(doc) {
      clearError();
      if (!doc) {
        showError("Không tìm thấy dữ liệu.");
        return;
      }
      if (directionBadge) directionBadge.textContent = doc.direction || "Văn bản đi";
      if (urgencyBadge) urgencyBadge.textContent = doc.important_level || "Thường";
      const normalizedStatus = normalizeStatus(
        doc.status?.code || doc.status?.name || doc.status || doc.state || doc.status_name
      );
      if (statusBadge) {
        // Use DocHelpers if available, otherwise fallback to local map
        if (window.DocHelpers && typeof window.DocHelpers.mapOutboundStatusLabel === 'function') {
             // Need to map canonical status back to helper key if they differ, 
             // but helper uses 'processing', 'submitted' etc.
             // Let's just use a local map for safety and consistency with other detail pages
             const statusMap = {
                DRAFT: "Dự thảo",
                SUBMITTED: "Đã trình lãnh đạo",
                PENDING_CLERK_CHECK: "Chờ văn thư kiểm tra",
                REGISTERED: "Đã vào sổ",
                ISSUED: "Đã phát hành",
                ARCHIVED: "Đã lưu trữ",
                HUY_PHAT_HANH: "Hủy phát hành",
             };
             statusBadge.textContent = statusMap[normalizedStatus] || normalizedStatus;
        } else {
             const statusMap = {
                DRAFT: "Dự thảo",
                SUBMITTED: "Đã trình lãnh đạo",
                PENDING_CLERK_CHECK: "Chờ văn thư kiểm tra",
                REGISTERED: "Đã vào sổ",
                ISSUED: "Đã phát hành",
                ARCHIVED: "Đã lưu trữ",
                HUY_PHAT_HANH: "Hủy phát hành",
             };
             statusBadge.textContent = statusMap[normalizedStatus] || normalizedStatus;
        }
      }
      if (titleEl) titleEl.textContent = doc.title || doc.subject || "Văn bản đi";
      if (summaryEl) summaryEl.textContent = doc.summary || doc.note || "—";
      if (metaCode) metaCode.textContent = doc.document_code || "—";
      if (metaIssue) metaIssue.textContent = doc.issue_number || "—";
      if (metaIssued) metaIssued.textContent = formatDate(doc.issued_date || doc.created_at);
      if (metaSignDate) metaSignDate.textContent = formatDate(doc.sign_date || doc.presented_at);
      if (metaSigner) metaSigner.textContent = formatUser(doc.signer || doc.signer_id);
      if (metaSignMethod) metaSignMethod.textContent = doc.sign_method || doc.signature_method || "—";
      if (metaDepartment) metaDepartment.textContent = doc.department?.name || "—";
      if (metaPublisher) metaPublisher.textContent = doc.publisher?.name || doc.sender || "—";
      if (metaRecipients) metaRecipients.textContent = doc.receivers?.join(", ") || doc.recipients || "—";
      currentNormalizedStatus = normalizedStatus;
      updateAssignmentVisibility(normalizedStatus);
      updateAttachmentVisibility(normalizedStatus);
      
      console.log("[chuyenvien-vanbandi-detail] Document status:", {
        raw: doc.status,
        normalized: normalizedStatus,
        isEditable: EDITABLE_STATUSES.has(normalizedStatus),
        editableStatuses: Array.from(EDITABLE_STATUSES)
      });
      
      // Chỉ load danh sách chuyên viên khi văn bản ở trạng thái có thể phân công (DRAFT)
      if (EDITABLE_STATUSES.has(normalizedStatus)) {
        console.log("[chuyenvien-vanbandi-detail] Status is editable, loading candidate CVs...");
        // Lấy department ID - ưu tiên các trường có thể có
        const departmentId =
          doc.main_department_id ||
          doc.department?.id ||
          doc.department?.department_id ||
          doc.department_id;
        console.log("[chuyenvien-vanbandi-detail] Department ID resolved:", departmentId, "from doc:", {
          main_department_id: doc.main_department_id,
          "department?.id": doc.department?.id,
          "department?.department_id": doc.department?.department_id,
          department_id: doc.department_id
        });
        // Đảm bảo departmentId là số hợp lệ
        const normalizedDeptId = departmentId ? parseInt(departmentId, 10) : null;
        console.log("[chuyenvien-vanbandi-detail] Calling loadCandidateCvs with deptId:", normalizedDeptId);
        loadCandidateCvs(isNaN(normalizedDeptId) ? null : normalizedDeptId)
          .then(() => {
            console.log("[chuyenvien-vanbandi-detail] loadCandidateCvs completed successfully");
          })
          .catch((err) => {
            console.error("[chuyenvien-vanbandi-detail] loadCandidateCvs failed:", err);
          });
      } else {
        console.log("[chuyenvien-vanbandi-detail] Status is NOT editable, clearing assignment options");
        // Clear assignment options khi không ở trạng thái editable
        if (assignSelect) {
          assignSelect.innerHTML = '<option value="">Chọn chuyên viên</option>';
        }
      }
      
      mountWorkflow(doc);
    }

    function updateAssignmentVisibility(status) {
      if (!assignWrapper) return;
      const isVisible = EDITABLE_STATUSES.has(status);
      assignWrapper.classList.toggle("hidden", !isVisible);
      if (!isVisible) {
        showAssignMessage("", false);
      }
    }

    function updateAttachmentVisibility(status) {
      if (!attachmentForm) return;
      const isVisible = EDITABLE_STATUSES.has(status);
      attachmentForm.classList.toggle("hidden", !isVisible);
      if (!isVisible) {
        showAttachmentMessage("", false);
      }
    }

    function showAssignMessage(text, isError) {
      if (!assignMessage) return;
      assignMessage.textContent = text || "";
      assignMessage.classList.toggle("text-rose-500", Boolean(isError));
      assignMessage.classList.toggle("text-emerald-600", Boolean(!isError && text));
    }

    function showAttachmentMessage(text, isError) {
      if (!attachmentMessage) return;
      attachmentMessage.textContent = text || "";
      attachmentMessage.classList.toggle("text-rose-500", Boolean(isError));
      attachmentMessage.classList.toggle("text-emerald-600", Boolean(!isError && text));
    }

    function renderAssignOptions(users) {
      console.log("[renderAssignOptions] Called with users:", users, "count:", Array.isArray(users) ? users.length : 0);
      
      if (!assignSelect) {
        console.warn("[renderAssignOptions] assignSelect not found");
        return;
      }
      
      assignSelect.innerHTML = '<option value="">Chọn chuyên viên</option>';
      const list = Array.isArray(users) ? users : [];
      
      console.log("[renderAssignOptions] Processing", list.length, "users");
      
      list.forEach((user, index) => {
        console.log(`[renderAssignOptions] Processing user ${index}:`, user);
        // API specialists trả về user_id, ưu tiên user_id trước
        const id = user.user_id || user.id || user.pk;
        if (!id) {
          console.warn(`[renderAssignOptions] User ${index} has no id, skipping:`, user);
          return;
        }
        const option = document.createElement("option");
        option.value = String(id);
        const labelParts = [];
        if (user.full_name) labelParts.push(user.full_name);
        // Lấy tên phòng ban - ưu tiên department_name từ API
        const dept =
          user.department_name ||
          user.department?.name ||
          user.department?.department_name ||
          user.organisation?.name ||
          user.organization?.name ||
          "";
        if (dept) labelParts.push(`(${dept})`);
        const label =
          labelParts.length > 0
            ? labelParts.join(" ")
            : user.username || user.email || option.value;
        option.textContent = label;
        console.log(`[renderAssignOptions] Adding option: value=${option.value}, text=${option.textContent}`);
        assignSelect.appendChild(option);
      });
      
      console.log("[renderAssignOptions] Final select has", assignSelect.options.length, "options");
    }

    async function loadCandidateCvs(departmentId) {
    if (!assignSelect) return;
    
    try {
      assignSelect.disabled = true;
      assignSelect.innerHTML = '<option value="">Đang tải...</option>';
      showAssignMessage("", false);

      const departmentIdToUse = Number.isFinite(departmentId)
        ? departmentId
        : departmentId
        ? Number.parseInt(departmentId, 10)
        : null;
      
      console.log("[loadCandidateCvs] Starting load with deptId:", departmentIdToUse);
      
      let users = [];
      let usedFallback = false;
      
      try {
        users = await tryLoadSpecialists(departmentIdToUse);
        console.log("[loadCandidateCvs] Loaded specialists count:", users.length);
        console.log("[loadCandidateCvs] Specialists data:", users);
        
        if (users.length === 0) {
          // Fallback to users API if specialists returns empty
          console.log("[loadCandidateCvs] Specialists empty, trying users API as fallback...");
          try {
            users = await tryLoadUsers(departmentIdToUse);
            usedFallback = true;
            console.log("[loadCandidateCvs] Loaded users count (fallback):", users.length);
            console.log("[loadCandidateCvs] Users data (fallback):", users);
          } catch (fallbackErr) {
            console.warn("[loadCandidateCvs] Fallback to users API also failed:", fallbackErr);
            // Continue with empty array, will show message below
          }
        }
      } catch (err) {
        // Try fallback on error
        console.warn("[loadCandidateCvs] Specialists API failed, trying users API as fallback...", err);
        console.error("[CV] Error details:", {
          message: err?.message,
          status: err?.status,
          data: err?.data,
          code: err?.code
        });
        
        try {
          users = await tryLoadUsers(departmentIdToUse);
          usedFallback = true;
          console.log("[loadCandidateCvs] Loaded users count (fallback):", users.length);
          console.log("[loadCandidateCvs] Users data (fallback):", users);
        } catch (fallbackErr) {
          // Both failed
          console.error("[loadCandidateCvs] Both specialists and users API failed");
          throw new Error(`Không thể tải danh sách chuyên viên: ${fallbackErr?.message || err?.message || "Lỗi không xác định"}`);
        }
      }

      assignSelect.innerHTML = '<option value="">-- Chọn chuyên viên --</option>';
      
      if (users.length === 0) {
        console.warn("[loadCandidateCvs] No specialists found for department:", departmentIdToUse);
        showAssignMessage("Không tìm thấy chuyên viên nào.", false);
      } else {
        const source = usedFallback ? "users API (fallback)" : "specialists API";
        console.log(`[loadCandidateCvs] Rendering ${users.length} specialists from ${source} to dropdown`);
        renderAssignOptions(users);
        console.log("[loadCandidateCvs] Successfully populated dropdown with specialists");
      }
    } catch (err) {
      console.error("[CV] Failed to load specialists list:", err);
      const errorMsg = err?.message || "Không thể tải danh sách chuyên viên. Vui lòng thử lại.";
      showAssignMessage(errorMsg, true);
      assignSelect.innerHTML = '<option value="">Lỗi tải dữ liệu</option>';
    } finally {
      assignSelect.disabled = false;
    }
  }
  
  async function tryLoadSpecialists(departmentId) {
    const api = window.ApiClient;
    if (!api?.specialists?.list) {
      throw new Error("API chuyên viên không khả dụng");
    }
    
    const params = { ordering: "full_name" };
    if (departmentId) {
      params.department_id = departmentId;
    }
    
    const response = await api.specialists.list(params);
    return toArray(response);
  }
  
  async function tryLoadUsers(departmentId) {
    const api = window.ApiClient;
    if (!api?.users?.list) {
      throw new Error("API người dùng không khả dụng");
    }
    
    const params = { role: "CV", ordering: "full_name" };
    if (departmentId) {
      params.department_id = departmentId;
    }
    
    const response = await api.users.list(params);
    return toArray(response);
  }

    function handleAssignSubmit(event) {
      event.preventDefault();
      if (!assignSelect) return;
      if (!EDITABLE_STATUSES.has(currentNormalizedStatus)) {
        showAssignMessage("Chỉ văn bản ở trạng thái Dự thảo mới được phân công thêm thành viên.", true);
        return;
      }
      const assigneeId = assignSelect.value;
      if (!assigneeId) {
        showAssignMessage("Phải chọn chuyên viên cần phân công.", true);
        return;
      }
      const dueAt = assignDueAt?.value || null;
      const instruction = assignInstruction?.value?.trim() || null;
      const payload = {
        assignments: [
          {
            user_id: assigneeId,
            role: "assignee",
            due_at: dueAt,
            instruction,
            is_owner: true,
          },
        ],
        append: true,
      };
      if (assignSubmit) {
        assignSubmit.disabled = true;
        assignSubmit.textContent = "Đang phân công…";
      }
      docApi
        .updateAssignments(docId, payload)
        .then(() => {
          showAssignMessage("Đã phân công thành viên.", false);
          if (assignForm && typeof assignForm.reset === "function") {
            assignForm.reset();
          }
          return fetchAssignments();
        })
        .catch((error) => {
          console.warn("[chuyenvien] Lỗi phân công:", error);
          showAssignMessage(
            error?.message || "Không thể phân công chuyên viên.",
            true
          );
        })
        .finally(() => {
          if (assignSubmit) {
            assignSubmit.disabled = false;
            assignSubmit.textContent = "Phân công";
          }
        });
    }

    function handleAttachmentSubmit(event) {
      event.preventDefault();
      if (!attachmentInput) return;
      if (!EDITABLE_STATUSES.has(currentNormalizedStatus)) {
        showAttachmentMessage("Chỉ văn bản ở trạng thái Dự thảo mới được thêm tệp đính kèm.", true);
        return;
      }
      const file = attachmentInput.files?.[0];
      if (!file) {
        showAttachmentMessage("Chưa chọn tệp để tải lên.", true);
        return;
      }
      const formData = new FormData();
      formData.append("file", file);
      if (attachmentSubmit) {
        attachmentSubmit.disabled = true;
        attachmentSubmit.textContent = "Đang tải lên…";
      }
      docApi
        .uploadAttachment(docId, formData)
        .then(() => {
          showAttachmentMessage("Đã tải tệp đính kèm.", false);
          if (attachmentInput) {
            attachmentInput.value = "";
          }
          return fetchAttachments();
        })
        .catch((error) => {
          console.warn("[chuyenvien] Lỗi tải tệp đính kèm:", error);
          showAttachmentMessage(error?.message || "Không thể tải tệp lên.", true);
        })
        .finally(() => {
          if (attachmentSubmit) {
            attachmentSubmit.disabled = false;
            attachmentSubmit.textContent = "Tải lên";
          }
        });
    }

    function mountWorkflow(doc) {
      if (!workflowTool || !workflowPanel) return;
      const status = normalizeStatus(
        doc.status?.code || doc.status?.name || doc.status || doc.state || doc.status_name
      );
      const payload = {
        container: workflowPanel,
        docId,
        direction: "OUTBOUND",
        status,
        role: "CV",
        route: "vanbandi",
        allowWithdraw: false,
      };
      if (!window._cvOutboundWorkflow) {
        window._cvOutboundWorkflow = workflowTool.mount(payload);
        return;
      }
      if (typeof window._cvOutboundWorkflow.update === "function") {
        window._cvOutboundWorkflow.update(status);
      }
    }

    function renderAssignments(list) {
      if (!assignmentsBody) return;
      assignmentsBody.innerHTML = "";
      const items = Array.isArray(list) ? list : [];
      if (!items.length) {
        assignmentsBody.innerHTML =
          '<tr><td colspan="5" class="px-5 py-4 text-center text-sm text-slate-500">Chưa có phân công.</td></tr>';
        return;
      }
      items.forEach((item) => {
        const row = document.createElement("tr");
        const assignee = formatUser(item.user || item.assignee);
        const assignor = formatUser(item.assigned_by);
        const due = formatDate(item.due_at || item.due_date);
        const roleLabel = item.role_on_doc || item.role || "—";
        const statusLabel = item.active ? "Đang xử lý" : "Hoàn tất";
        row.innerHTML = `
          <td class="px-5 py-3">
            <div class="font-semibold text-slate-800">${escapeHtml(assignee)}</div>
            <div class="text-[12px] text-slate-500">${escapeHtml(roleLabel)}</div>
          </td>
          <td class="px-5 py-3">
            <span class="chip chip--blue">${escapeHtml(roleLabel)}</span>
          </td>
          <td class="px-5 py-3">${escapeHtml(assignor)}</td>
          <td class="px-5 py-3">${escapeHtml(due)}</td>
          <td class="px-5 py-3">
            <span class="chip chip--amber">${escapeHtml(statusLabel)}</span>
          </td>
        `;
        assignmentsBody.appendChild(row);
      });
    }

    function renderApprovals(list) {
      if (!approvalsList) return;
      const items = Array.isArray(list) ? list : [];
      if (!items.length) {
        approvalsList.innerHTML =
          '<li class="text-[13px] text-slate-500">Chưa có quy trình duyệt.</li>';
        if (approvalsCount) approvalsCount.textContent = "0";
        return;
      }
      approvalsList.innerHTML = items
        .map((step) => {
          const approver = formatUser(step.approver || step.approver_id);
          const decision = step.decision || step.status || "Chưa quyết";
          const note = step.note || step.comment || "";
          const time = formatDateTime(step.decided_at || step.updated_at || step.created_at);
          return `<li class="rounded-lg border border-slate-100 p-3 text-[13px]">
            <div class="flex items-center justify-between">
              <strong>${escapeHtml(step.type || step.step || "Duyệt")}</strong>
              <span class="text-[12px] text-slate-500">${escapeHtml(decision)}</span>
            </div>
            <p class="text-[13px] text-slate-500 mb-1">${escapeHtml(note)}</p>
            <div class="text-[12px] text-slate-400">Người thực hiện: ${escapeHtml(
              approver
            )} • ${escapeHtml(time)}</div>
          </li>`;
        })
        .join("");
      if (approvalsCount) {
        approvalsCount.textContent = String(items.length);
      }
    }

    function renderAttachments(list) {
      if (!attachmentsList) return;
      const items = Array.isArray(list) ? list : [];
      if (!items.length) {
        attachmentsList.innerHTML =
          '<li class="text-slate-500">Chưa có đính kèm.</li>';
        return;
      }
      attachmentsList.innerHTML = items
        .map((file) => {
          const name = file.name || file.filename || "Tệp đính kèm";
          const uploaded = formatDateTime(file.created_at || file.uploaded_at);
          let url = "#";
          if (file.id && typeof docApi.attachmentDownloadUrl === "function") {
            try {
              url = docApi.attachmentDownloadUrl(docId, file.id);
            } catch (err) {
              url = "#";
            }
          }
          return `<li class="rounded-lg border border-slate-100 p-3 flex items-center justify-between gap-3">
            <div>
              <div class="font-medium text-slate-700">${escapeHtml(name)}</div>
              <div class="text-[12px] text-slate-500">Tải lên: ${formatDateTime(
                file.created_at || file.uploaded_at
              )}</div>
            </div>
            <a class="text-slate-500" href="${escapeHtml(url)}" target="_blank">⬇</a>
          </li>`;
        })
        .join("");
    }

    function renderLogs(list) {
      if (!logsList) return;
      const items = Array.isArray(list) ? list : [];
      if (!items.length) {
        logsList.innerHTML = '<li class="text-slate-500">Chưa có nhật ký.</li>';
        return;
      }
      logsList.innerHTML = items
        .map((entry) => {
          const actor = formatUser(entry.actor || entry.actor_id);
          const action = entry.action || entry.note || "Hoạt động";
          const time = formatDateTime(entry.acted_at || entry.created_at);
          const from = entry.from_status || entry.from_status_name || "";
          const to = entry.to_status || entry.to_status_name || "";
          return `<li class="rounded-lg border border-slate-100 p-3 space-y-1 text-[13px]">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-slate-800">${escapeHtml(action)}</span>
              <span class="text-[12px] text-slate-500">${escapeHtml(time)}</span>
            </div>
            <p class="text-[12px] text-slate-500">${escapeHtml(entry.description || entry.note || "")}</p>
            ${from || to ? `<div class="text-[12px] text-slate-500">Từ ${escapeHtml(
              from
            )} → ${escapeHtml(to)}</div>` : ""}
            <div class="text-[12px] text-slate-400">Thực hiện bởi ${escapeHtml(actor)}</div>
          </li>`;
        })
        .join("");
    }

    function renderDispatches(list) {
      if (!dispatchList) return;
      const items = Array.isArray(list) ? list : [];
      if (!items.length) {
        dispatchList.innerHTML =
          '<li class="text-slate-500">Chưa có lịch gửi.</li>';
        if (dispatchNumberEl) dispatchNumberEl.textContent = "—";
        if (dispatchDateEl) dispatchDateEl.textContent = "—";
        if (dispatchMethodEl) dispatchMethodEl.textContent = "—";
        return;
      }
      dispatchList.innerHTML = items
        .map((item) => {
          const receiver = item.to_org_name || item.organization?.name || "Đơn vị nhận";
          const channel = item.channel || item.method || "—";
          const status = item.status || "—";
          const time = formatDateTime(item.sent_at || item.created_at);
          const tracking = item.tracking_no ? `Tracking: ${escapeHtml(item.tracking_no)}` : "";
          return `<li class="rounded-lg border border-slate-100 p-3 space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-slate-800">${escapeHtml(receiver)}</span>
              <span class="text-[12px] text-slate-500">${escapeHtml(status)}</span>
            </div>
            <div class="text-[12px] text-slate-500">
              ${escapeHtml(channel)} • ${escapeHtml(time)} ${tracking ? "• " + tracking : ""}
            </div>
          </li>`;
        })
        .join("");
      const latest = items[0];
      if (dispatchNumberEl) dispatchNumberEl.textContent = latest?.tracking_no || "—";
      if (dispatchDateEl) dispatchDateEl.textContent = formatDate(latest?.sent_at);
      if (dispatchMethodEl) dispatchMethodEl.textContent = latest?.channel || latest?.method || "—";
    }

    function renderVersions(list) {
      if (!versionsList) return;
      const items = Array.isArray(list) ? list : [];
      if (!items.length) {
        versionsList.innerHTML =
          '<li class="text-slate-500">Chưa có phiên bản.</li>';
        return;
      }
      versionsList.innerHTML = items
        .map((version) => {
          const label = version.label || `Phiên bản ${version.version || "?"}`;
          const time = formatDateTime(version.decided_at || version.created_at);
          return `<li class="rounded-lg border border-slate-100 p-3">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-slate-800">${escapeHtml(label)}</span>
              <span class="text-[12px] text-slate-500">${escapeHtml(time)}</span>
            </div>
            <p class="text-[12px] text-slate-500">${escapeHtml(version.note || "")}</p>
          </li>`;
        })
        .join("");
    }

    function renderComments(list) {
      if (!commentList) return;
      const items = Array.isArray(list) ? list : [];
      if (!items.length) {
        commentList.innerHTML =
          '<li class="text-slate-500">Chưa có trao đổi.</li>';
        return;
      }
      commentList.innerHTML = items
        .map((entry) => {
          const actor = formatUser(entry.user);
          const at = formatDate(entry.created_at || entry.updated_at);
          const content = escapeHtml(entry.content || entry.comment || entry.note || "");
          return `<li class="rounded-lg border border-slate-100 p-3">
            <div class="flex items-center justify-between gap-3">
              <span class="font-medium text-slate-700">${escapeHtml(actor)}</span>
              <span class="text-[12px] text-slate-400">${escapeHtml(at)}</span>
            </div>
            <p class="mt-1 text-[13px] text-slate-600 leading-relaxed">${content}</p>
          </li>`;
        })
        .join("");
    }

    function showCommentMessage(text, isError) {
      if (!commentMessage) return;
      commentMessage.textContent = text || "";
      commentMessage.classList.toggle("text-rose-500", Boolean(isError));
      commentMessage.classList.toggle("text-emerald-600", Boolean(!isError && text));
    }

    function fetchAssignments() {
      if (!docApi.assignments) {
        renderAssignments([]);
        return Promise.resolve();
      }
      return docApi
        .assignments(docId)
        .then((payload) => renderAssignments(toArray(payload)))
        .catch((error) => {
          console.warn("[chuyenvien] Lỗi tải phân công:", error);
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
        .then((payload) => renderApprovals(toArray(payload)))
        .catch((error) => {
          console.warn("[chuyenvien] Lỗi tải trình ký:", error);
          renderApprovals([]);
        });
    }

    function fetchAttachments() {
      if (!docApi.attachments) {
        renderAttachments([]);
        return Promise.resolve();
      }
      return docApi
        .attachments(docId)
        .then((payload) => renderAttachments(toArray(payload)))
        .catch((error) => {
          console.warn("[chuyenvien] Lỗi tải đính kèm:", error);
          renderAttachments([]);
        });
    }

    function fetchLogs() {
      if (!docApi.workflowLogs) {
        renderLogs([]);
        return Promise.resolve();
      }
      return docApi
        .workflowLogs(docId)
        .then((payload) => renderLogs(toArray(payload)))
        .catch((error) => {
          console.warn("[chuyenvien] Lỗi tải nhật ký:", error);
          renderLogs([]);
        });
    }

    function fetchDispatches() {
      if (!docApi.dispatches) {
        renderDispatches([]);
        return Promise.resolve();
      }
      return docApi
        .dispatches(docId)
        .then((payload) => renderDispatches(toArray(payload)))
        .catch((error) => {
          console.warn("[chuyenvien] Lỗi tải dispatch:", error);
          renderDispatches([]);
        });
    }

    function fetchVersions() {
      if (!docApi.versions) {
        renderVersions([]);
        return Promise.resolve();
      }
      return docApi
        .versions(docId)
        .then((payload) => renderVersions(toArray(payload)))
        .catch((error) => {
          console.warn("[chuyenvien] Lỗi tải phiên bản:", error);
          renderVersions([]);
        });
    }

    function fetchComments() {
      if (!commentList || !api?.request || !api?.buildUrl) {
        return Promise.resolve();
      }
      if (Number.isNaN(commentEntityId)) {
        showCommentMessage("Thiếu mã văn bản hợp lệ để tải bình luận.", true);
        renderComments([]);
        return Promise.resolve();
      }
      const params = { entity_type: "document", entity_id: commentEntityId };
      const loader = commentApi?.list
        ? commentApi.list(params)
        : api.request(api.buildUrl("/api/v1/comments/", params));
      return loader
        .then((payload) =>
          renderComments(Array.isArray(payload) ? payload : toArray(payload))
        )
        .catch((error) => {
          console.warn("[chuyenvien] Lỗi tải bình luận:", error);
          showCommentMessage("Không tải được bình luận.", true);
          renderComments([]);
        });
    }

    function handleCommentSubmit(event) {
      event.preventDefault();
      if (!commentContent || !api?.request) return;
      if (Number.isNaN(commentEntityId)) {
        showCommentMessage("Không xác định được văn bản để gửi bình luận.", true);
        return;
      }
      const content = commentContent.value.trim();
      if (!content) {
        showCommentMessage("Nội dung bình luận không được để trống.", true);
        return;
      }
      showCommentMessage("", false);
      const payload = {
        entity_type: "document",
        entity_id: commentEntityId,
        content,
      };
      const submitter = commentApi?.create
        ? commentApi.create(payload)
        : api.request("/api/v1/comments/", { method: "POST", body: payload });
      submitter
        .then(() => {
          commentContent.value = "";
          showCommentMessage("Đã gửi bình luận.", false);
          return fetchComments();
        })
        .catch((error) => {
          console.warn("[chuyenvien] Lỗi gửi bình luận:", error);
          showCommentMessage(
            error?.message
              ? `Không gửi được bình luận: ${error.message}`
              : "Không gửi được bình luận.",
            true
          );
        });
    }

    function loadDocument() {
      clearError();
      docApi
        .retrieve(docId)
        .then((doc) => {
          renderDoc(doc);
          return Promise.all([
            fetchAssignments(),
            fetchApprovals(),
            fetchAttachments(),
            fetchLogs(),
            fetchDispatches(),
            fetchVersions(),
            fetchComments(),
          ]);
        })
        .catch((error) => {
          console.error("[chuyenvien] Lỗi tải chi tiết văn bản đi:", error);
          showError("Không thể tải chi tiết văn bản.");
        });
    }

    if (assignForm) {
      assignForm.addEventListener("submit", handleAssignSubmit);
    }
    if (attachmentForm) {
      attachmentForm.addEventListener("submit", handleAttachmentSubmit);
    }
    if (commentForm) {
      commentForm.addEventListener("submit", handleCommentSubmit);
    }
    if (commentToggle && commentContent) {
      commentToggle.addEventListener("click", () => {
        commentContent.focus();
        if (typeof commentContent.scrollIntoView === "function") {
          commentContent.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    }
    loadDocument();
  });
})();
