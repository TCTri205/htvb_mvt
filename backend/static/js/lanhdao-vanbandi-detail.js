(function () {
  function onReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  function getDocId() {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get("id");
    if (idParam) {
      return String(idParam).trim();
    }
    const segments = window.location.pathname.split("/").filter(Boolean);
    const tail = segments.pop();
    if (tail && /^\d+$/.test(tail)) {
      return tail;
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

  function formatDate(value) {
    if (!value) return "—";
    if (typeof value === "string" && value.length >= 10) {
      return value.slice(0, 10).split("-").reverse().join("/");
    }
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    return `${String(date.getDate()).padStart(2, "0")}/${String(
      date.getMonth() + 1
    ).padStart(2, "0")}/${date.getFullYear()}`;
  }
  const extractUser = window.ApiClient?.extractUser || ((obj) => obj || {});

  // Configuration - can be overridden via data attributes
  const CONFIG = {
    LOG_ATTACHMENT_TYPE: "nhat_ky_xu_ly",
  };

  function formatUser(user) {
    if (!user) return "—";
    if (typeof user === "string") return user;
    if (typeof user === "object") {
      return user.full_name || user.name || user.username || "—";
    }
    return String(user);
  }

  // Use shared status handling from status-constants.js
  const OutboundStatusModule = window.OutboundStatus || {};
  const normalizeStatus = OutboundStatusModule.normalizeStatus || ((raw) => {
    console.warn("[LD] OutboundStatus module not loaded, using fallback");
    return "DRAFT";
  });
  const formatStatusLabel = OutboundStatusModule.formatStatusLabel || ((status) => {
    if (!status) return "";
    if (typeof status === "string") return status;
    if (typeof status === "object") {
      return status.name || status.code || status.status_name || "";
    }
    return String(status);
  });

  function toArray(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.results)) return payload.results;
    return [];
  }

  function isLogAttachment(file) {
    if (!file) return false;
    const type = String(file.attachment_type || file.type || "").toLowerCase();
    return type === CONFIG.LOG_ATTACHMENT_TYPE;
  }

  onReady(() => {
    const docId = getDocId();
    if (!docId) {
      console.warn("[lanhdao] Không xác định được ID văn bản.");
      return;
    }

    // Modal overlay reference for dynamically created assignment detail modal
    let assignDetailModalOverlay = null;

    const api = window.ApiClient;
    const docApi = api?.documents;
    if (!docApi) {
      console.warn("[lanhdao] Document API chưa sẵn sàng cho chi tiết.");
      return;
    }

    if (typeof api?.ensureAuthenticated === "function") {
      api.ensureAuthenticated().catch(() => {
        window.location.href =
          "/auth/login/?next=" +
          encodeURIComponent(window.location.pathname + window.location.search);
      });
    }

    window.LDDetailOverride = true;

    const directionBadge = document.getElementById("doc-badge-direction");
    const urgencyBadge = document.getElementById("doc-badge-urgency");
    const statusBadge = document.getElementById("doc-badge-status");
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
    const workflowPanel = document.getElementById("doc-workflow-panel");
    const workflowTool = window.DocumentUIWorkflow;
    const dispatchList = document.getElementById("doc-dispatch-list");
    const dispatchNumberEl = document.getElementById("doc-dispatch-number");
    const dispatchDateEl = document.getElementById("doc-dispatch-date");
    const dispatchMethodEl = document.getElementById("doc-dispatch-methods");
    const versionsList = document.getElementById("doc-versions-list");
    const assignWrapper = document.getElementById("ld-assign-wrapper");
    const assignSelect = document.getElementById("ld-assign-assignee");
    const assignRole = document.getElementById("ld-assign-role");
    const assignInstruction = document.getElementById("ld-assign-instruction");
    const assignDueAt = document.getElementById("ld-assign-due");
    const assignMessage = document.getElementById("ld-assign-message");
    const assignSubmit = document.getElementById("ld-assign-submit");
    const commentList = document.getElementById("doc-comment-list");
    const commentForm = document.getElementById("ld-comment-form");
    const commentContent = document.getElementById("ld-comment-content");
    const commentMessage = document.getElementById("ld-comment-message");
    const commentApi = api?.comments;
    const commentEntityId = Number.parseInt(docId, 10);
    const ASSIGNABLE_STATUSES = new Set([
      "DRAFT",
      "CHO_PHAN_CONG",
      "PENDING_ASSIGNMENT",
    ]);
    const workflowActionSelect = document.getElementById("ld-workflow-action");
    const assignDetailModal = document.getElementById("ld-assign-detail-modal");
    const assignDetailClose = document.getElementById("ld-assign-detail-close");
    const assignDetailCloseBottom = document.getElementById(
      "ld-assign-detail-close-bottom"
    );
    const assignDetailAssignee = document.getElementById(
      "ld-assign-detail-assignee"
    );
    const assignDetailRole = document.getElementById("ld-assign-detail-role");
    const assignDetailAssignor = document.getElementById(
      "ld-assign-detail-assignor"
    );
    const assignDetailDue = document.getElementById("ld-assign-detail-due");
    const assignDetailAt = document.getElementById("ld-assign-detail-at");
    const assignDetailStatus = document.getElementById(
      "ld-assign-detail-status"
    );
    const assignDetailInstruction = document.getElementById(
      "ld-assign-detail-instruction"
    );

    const actionButtons = document.querySelectorAll("[data-doc-action]");
    actionButtons.forEach((btn) => {
      btn.disabled = true;
      btn.classList.add("opacity-60", "cursor-not-allowed");
      btn.title = "Thao tác qua luồng trạng thái.";
    });

    let currentNormalizedStatus = "DRAFT";
    let lastAssignMeta = { instruction: "", due_at: null };

    function isAssignActionSelected() {
      const value = workflowActionSelect?.value;
      return typeof value === "string" && value.startsWith("LD_ASSIGN");
    }

    function hasAssignActionOption() {
      if (!workflowActionSelect) return false;
      return Array.from(workflowActionSelect.options || []).some(
        (opt) => String(opt.value || "").toUpperCase() === "LD_ASSIGN_OFFICER"
      );
    }

    function toggleAssignFormVisibility(status) {
      if (!assignWrapper) return;
      if (status) {
        currentNormalizedStatus = status;
      }
      const shouldShow =
        ASSIGNABLE_STATUSES.has(currentNormalizedStatus) ||
        isAssignActionSelected() ||
        hasAssignActionOption();
      assignWrapper.classList.toggle("hidden", !shouldShow);
    }

    function renderDoc(doc) {
      const directionMap = {
        di: "Văn bản đi",
        den: "Văn bản đến",
        du_thao: "Dự thảo",
      };
      const docDirection = doc.doc_direction || doc.direction || "";
      const normalizedDirection =
        typeof docDirection === "string" ? docDirection.toLowerCase() : "";
      const directionLabel =
        directionMap[docDirection] ||
        directionMap[normalizedDirection] ||
        "Văn bản đi";

      if (directionBadge) {
        directionBadge.textContent = directionLabel;
      }
      if (urgencyBadge) {
        const level =
          doc.important_level ||
          doc.urgency?.name ||
          doc.urgency?.code ||
          doc.urgency_level?.name ||
          "Thường";
        urgencyBadge.textContent = level;
      }

      const normalizedStatus = normalizeStatus(
        doc.status?.code ||
          doc.status?.name ||
          doc.status ||
          doc.state ||
          doc.status_name
      );
      currentNormalizedStatus = normalizedStatus;
      
      // DEBUG: Log status info to help diagnose display issues
      console.log("[lanhdao-vanbandi-detail] renderDoc status debug:", {
        rawStatus: doc.status,
        statusCode: doc.status?.code,
        statusName: doc.status?.status_name,
        statusKey: doc.status?.name,
        normalizedStatus,
      });

      // Use shared status labels
      const getStatusLabel = OutboundStatusModule.getStatusLabel || ((s) => s);
      const statusLabel = getStatusLabel(normalizedStatus) || 
        formatStatusLabel(doc.status) ||
        normalizedStatus.replace(/_/g, " ");

      if (statusBadge) {
        statusBadge.textContent = statusLabel;
        
        const statusColorMap = {
          DRAFT: "bg-gray-100 text-gray-800",
          SUBMITTED: "bg-yellow-100 text-yellow-800",
          RETURNED: "bg-red-100 text-red-800",
          APPROVED: "bg-blue-100 text-blue-800",
          PENDING_CLERK_CHECK: "bg-orange-100 text-orange-800",
          REGISTERED: "bg-purple-100 text-purple-800",
          ISSUED: "bg-green-100 text-green-800",
          ARCHIVED: "bg-slate-100 text-slate-800",
          HUY_PHAT_HANH: "bg-rose-100 text-rose-800",
          CHO_PHAN_CONG: "bg-cyan-100 text-cyan-800",
          PENDING_ASSIGNMENT: "bg-cyan-100 text-cyan-800",
        };
        
        statusBadge.className = `px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColorMap[normalizedStatus] || "bg-gray-100 text-gray-800"}`;
      }
      if (titleEl) {
        titleEl.textContent = doc.title || doc.subject || "Văn bản đi";
      }
      if (summaryEl) {
        summaryEl.textContent =
          doc.summary || doc.note || doc.description || "—";
      }
      if (metaCode) metaCode.textContent = doc.document_code || "—";
      if (metaIssue)
        metaIssue.textContent = doc.issue_number || doc.document_code || "—";
      if (metaIssued)
        metaIssued.textContent = formatDate(doc.issued_date || doc.created_at);
      if (metaSignDate)
        metaSignDate.textContent = formatDate(
          doc.sign_date || doc.presented_at || doc.expected_publish_date
        );
      if (metaSigner)
        metaSigner.textContent =
          formatUser(doc.signed_by) ||
          formatUser(doc.signer) ||
          doc.signer_position ||
          "—";
      if (metaSignMethod) {
        const signingMethodMap = {
          DIGITAL: "Ký số",
          MANUAL: "Ký tay",
          STAMP: "Đóng dấu",
        };
        const method = doc.signing_method || doc.sign_method || "";
        const methodKey = typeof method === "string" ? method.toUpperCase() : "";
        metaSignMethod.textContent =
          signingMethodMap[method] ||
          signingMethodMap[methodKey] ||
          method ||
          "—";
      }
      if (metaDepartment) {
        metaDepartment.textContent =
          doc.department?.name ||
          doc.field?.name ||
          doc.created_by?.department?.name ||
          doc.main_department?.name ||
          "—";
      }
      if (metaPublisher) {
        metaPublisher.textContent = doc.publisher?.name || doc.sender || "—";
      }
      if (metaRecipients) {
        metaRecipients.textContent =
          (Array.isArray(doc.receivers) ? doc.receivers.join(", ") : "") ||
          doc.recipients ||
          "—";
      }
      toggleAssignFormVisibility(normalizedStatus);
      const departmentId =
        doc.main_department_id || doc.department?.id || doc.department_id;
      loadCandidateCvs(departmentId);
      mountWorkflow(doc);
    }

    function renderAssignOptions(users) {
      if (!assignSelect) return;
      const entries = Array.isArray(users) ? users : [];
      assignSelect.innerHTML = '<option value="">Chọn chuyên viên</option>';
      entries.forEach((user) => {
        const id = user.id || user.user_id || user.pk;
        if (!id) return;
        const option = document.createElement("option");
        option.value = String(id);
        const labelParts = [];
        if (user.full_name) labelParts.push(user.full_name);
        const dept =
          user.department_name ||
          user.department?.name ||
          user.department?.department_name ||
          "";
        if (dept) labelParts.push(`(${dept})`);
        const label =
          labelParts.length > 0
            ? `${labelParts.join(" ")}`
            : user.username || user.email || option.value;
        option.textContent = label;
        assignSelect.appendChild(option);
      });
    }

    async function loadCandidateCvs(departmentId) {
    if (!assignSelect) return;
    
    // Show loading state
    assignSelect.disabled = true;
    assignSelect.innerHTML = '<option value="">Đang tải...</option>';
    showAssignMessage("", false);
    
    console.log("[LD] Loading candidate specialists, department:", departmentId);
    
    try {
      // Try specialists API first
      const specialists = await tryLoadSpecialists(departmentId);
      if (specialists && specialists.length > 0) {
        console.log("[LD] Loaded specialists successfully:", specialists.length);
        renderAssignOptions(specialists);
        return;
      }
      console.log("[LD] No specialists found, trying users fallback");
    } catch (err) {
      console.warn("[LD] Specialists API failed:", err.message || err);
    }
    
    try {
      // Fallback to users API with role filter
      const users = await tryLoadUsers(departmentId);
      console.log("[LD] Loaded users successfully:", users.length);
      renderAssignOptions(users);
      
      if (users.length === 0) {
        showAssignMessage("Không tìm thấy chuyên viên nào.", false);
      }
    } catch (err) {
      console.error("[LD] Lỗi tải danh sách chuyên viên:", err);
      const errorMsg = err?.status === 403
        ? "Không có quyền truy cập danh sách chuyên viên."
        : "Không thể tải danh sách chuyên viên. Vui lòng thử lại.";
      showAssignMessage(errorMsg, true);
      renderAssignOptions([]);
    } finally {
      assignSelect.disabled = false;
    }
  }
  
  async function tryLoadSpecialists(departmentId) {
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

  function clearAssignMessage() {
      if (!assignMessage) return;
      assignMessage.textContent = "";
      assignMessage.classList.remove("text-rose-500", "text-emerald-600");
    }

    function showAssignMessage(text, isError) {
      if (!assignMessage) return;
      assignMessage.textContent = text;
      assignMessage.classList.toggle("text-rose-500", Boolean(isError));
      assignMessage.classList.toggle("text-emerald-600", !isError);
    }

    function handleAssignSubmit(event) {
      event.preventDefault();
      if (!assignSelect) return;
      clearAssignMessage();
      if (!ASSIGNABLE_STATUSES.has(currentNormalizedStatus)) {
        showAssignMessage(
          "Chỉ phân công khi văn bản đang ở trạng thái Dự thảo hoặc Đã trình.",
          true
        );
        return;
      }
      const assigneeId = assignSelect.value;
      if (!assigneeId) {
        showAssignMessage("Phải chọn chuyên viên chủ trì.", true);
        return;
      }
      const selectedRole = assignRole?.value || "assignee";
      const isOwner = selectedRole === "owner" || selectedRole === "assignee";
      const roleOnDoc = selectedRole === "owner" ? "assignee" : selectedRole;
      const instruction = assignInstruction?.value?.trim();
      const dueAt = assignDueAt?.value || null;
      if (assignSubmit) {
        assignSubmit.disabled = true;
        assignSubmit.textContent = "Đang phân công…";
      }

      if (!docApi?.updateAssignments) {
        showAssignMessage("API phân công không sẵn sàng.", true);
        if (assignSubmit) {
          assignSubmit.disabled = false;
          assignSubmit.textContent = "Phân công";
        }
        return;
      }

      const assignments = [
        {
          user_id: assigneeId,
          role: roleOnDoc,
          is_owner: isOwner,
          due_at: dueAt,
          instruction: instruction || null,
        },
      ];

      docApi
        .updateAssignments(docId, { assignments, append: true })
        .then(() => {
          showAssignMessage("Đã phân công thành công.", false);
          return Promise.all([
            fetchAssignments(),
            docApi.retrieve(docId).then((data) => renderDoc(data)),
          ]);
        })
        .catch((error) => {
          console.warn("[lanhdao] Lỗi phân công:", error);
          showAssignMessage(
            error?.message
              ? `Không thể phân công: ${error.message}`
              : "Không thể phân công.",
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

    function handleCommentSubmit(event) {
      event.preventDefault();
      if (!commentContent || !api?.request) return;
      if (Number.isNaN(commentEntityId)) {
        showCommentMessage(
          "Không xác định được văn bản để gửi bình luận.",
          true
        );
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
          console.warn("[lanhdao] Lỗi gửi bình luận:", error);
          showCommentMessage(
            error?.message
              ? `Không gửi được bình luận: ${error.message}`
              : "Không gửi được bình luận.",
            true
          );
        });
    }
    function showCommentMessage(text, isError) {
      if (!commentMessage) return;
      commentMessage.textContent = text || "";
      commentMessage.classList.toggle("text-rose-500", Boolean(isError));
      commentMessage.classList.toggle("text-emerald-600", !isError);
    }

    function mountWorkflow(doc) {
      if (!workflowTool || !workflowPanel) return;

      // Xử lý status từ document - ưu tiên các field theo thứ tự
      let rawStatus = null;
      if (doc.status) {
        // Nếu doc.status là object, ưu tiên code, status_name, name
        if (typeof doc.status === "object") {
          rawStatus =
            doc.status.code ||
            doc.status.status_name ||
            doc.status.name ||
            doc.status;
        } else {
          // Nếu là string, dùng trực tiếp
          rawStatus = doc.status;
        }
      }
      // Fallback: thử các field khác
      if (!rawStatus) {
        rawStatus =
          doc.status_name ||
          doc.state ||
          doc.status ||
          doc.status_key ||
          doc.statusKey;
      }

      const status = normalizeStatus(rawStatus);

      const payload = {
        container: workflowPanel,
        docId,
        direction: "OUTBOUND",
        status,
        role: "LD",
        route: "vanbandi",
        allowWithdraw: true,  // Leader can withdraw/cancel issued documents
      };
      // Instance key không bao gồm status để có thể reuse instance
      const instanceKey = `${payload.route}:${payload.direction}:${payload.role}`;
      console.debug("[lanhdao] mountWorkflow payload", {
        rawStatus,
        normalizedStatus: status,
        docStatus: doc.status,
        statusName: doc.status?.status_name ?? doc.status_name,
        statusCode: doc.status?.code,
        direction: doc.doc_direction || doc.direction,
        panelStatus: workflowPanel?.dataset?.status,
        datasetDirection: workflowPanel?.dataset?.direction,
        payloadRoute: payload.route,
        instanceKey,
        cachedKey: window._ldWorkflowInstanceKey,
        hasCachedInstance: !!window._ldWorkflowInstance,
      });

      const currentInstance = window._ldWorkflowInstance;

      // Nếu không có instance hoặc instance key khác, mount mới
      if (!currentInstance || window._ldWorkflowInstanceKey !== instanceKey) {
        console.debug("[lanhdao] Mounting new workflow instance");
        const instance = workflowTool.mount(payload);
        if (instance) {
          window._ldWorkflowInstance = instance;
          window._ldWorkflowInstanceKey = instanceKey;
          console.debug("[lanhdao] Workflow instance mounted successfully", {
            hasUpdateMethod: typeof instance.update === "function",
          });
        } else {
          console.warn("[lanhdao] Failed to mount workflow instance");
        }
        toggleAssignFormVisibility(status);
        return;
      }

      // Nếu đã có instance, update với status mới
      if (typeof currentInstance.update === "function") {
        console.debug("[lanhdao] Updating existing workflow instance", {
          newStatus: status,
        });
        currentInstance.update(status);
      } else {
        console.warn(
          "[lanhdao] Cached instance does not have update method, remounting"
        );
        const instance = workflowTool.mount(payload);
        if (instance) {
          window._ldWorkflowInstance = instance;
          window._ldWorkflowInstanceKey = instanceKey;
        }
      }
      toggleAssignFormVisibility(status);
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
        const roleLabel = assignmentRole(item.role_on_doc || item.role);
        const rawDue =
          item.due_at ||
          item.due_date ||
          item.dueAt ||
          lastAssignMeta.due_at ||
          null;
        const due = formatDate(rawDue);
        const statusText = item.active === false ? "Hoàn tất" : "Đang xử lý";
        const assignedAt = formatDate(item.assigned_at || item.assignedAt);
        const instruction =
          item.instruction || lastAssignMeta.instruction || "";
        row.innerHTML = `
          <td class="px-5 py-3">
            <div class="font-semibold text-slate-800">${escapeHtml(
              assignee
            )}</div>
            <div class="text-[12px] text-slate-500">${escapeHtml(
              roleLabel
            )}</div>
          </td>
          <td class="px-5 py-3">
            <span class="chip chip--blue">${escapeHtml(roleLabel)}</span>
          </td>
          <td class="px-5 py-3">${escapeHtml(assignor)}</td>
          <td class="px-5 py-3">${escapeHtml(due)}</td>
          <td class="px-5 py-3">
            <span class="chip chip--amber">${escapeHtml(statusText)}</span>
          </td>
        `;
        const detailCol = document.createElement("td");
        detailCol.className = "px-5 py-3";
        const detailBtn = document.createElement("button");
        detailBtn.type = "button";
        detailBtn.className =
          "h-9 rounded-md border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50";
        detailBtn.textContent = "Chi tiết";
        detailBtn.addEventListener("click", () =>
          openAssignDetail({
            assignee,
            role: roleLabel,
            assignor,
            due,
            status: statusText,
            assignedAt,
            instruction,
          })
        );
        detailCol.appendChild(detailBtn);
        row.appendChild(detailCol);
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
          const time = formatDate(
            step.decided_at || step.updated_at || step.created_at
          );
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
          const time = formatDate(item.sent_at || item.created_at);
          const tracking = item.tracking_no ? `Tracking: ${escapeHtml(item.tracking_no)}` : "";
          return `<li class="rounded-lg border border-slate-100 p-3 space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-slate-800">${escapeHtml(receiver)}</span>
              <span class="text-[12px] text-slate-500">${escapeHtml(status)}</span>
            </div>
            <div class="text-[12px] text-slate-500">${escapeHtml(channel)} • ${escapeHtml(time)} ${tracking ? "• " + tracking : ""}</div>
          </li>`;
        })
        .join("");
      const latest = items[0];
      if (dispatchNumberEl) dispatchNumberEl.textContent = latest?.tracking_no || latest?.id || "—";
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
          const time = formatDate(
            version.decided_at || version.created_at || version.updated_at
          );
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

    function assignmentRole(role) {
      if (!role) return "Đã giao";
      const value = role.toString().toLowerCase();
      if (value === "assignee" || value === "owner") return "Chủ trì";
      if (value === "watcher") return "Phối hợp";
      if (value.includes("chu_tri")) return "Chủ trì";
      if (value.includes("phoi")) return "Phối hợp";
      if (value.includes("watch")) return "Theo dõi";
      return role;
    }

    // Dynamically created modal for assignment details
    function openAssignDetail(detail) {
      const safe = (v) => window.OutboundStatus?.escapeHtml?.(v) || (v ? String(v) : "—");
      
      // Close existing modal if any to prevent stacking
      closeAssignDetail();
      
      // Create modal overlay
      assignDetailModalOverlay = document.createElement("div");
      assignDetailModalOverlay.className = "fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4";
      assignDetailModalOverlay.setAttribute("role", "dialog");
      assignDetailModalOverlay.setAttribute("aria-modal", "true");
      
      assignDetailModalOverlay.innerHTML = `
        <div class="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4" onclick="event.stopPropagation()">
          <div class="flex justify-between items-start">
            <h3 class="text-lg font-semibold text-slate-800">Chi tiết phân công</h3>
            <button 
              class="close-modal text-slate-400 hover:text-slate-600 transition-colors"
              aria-label="Đóng"
            >
              <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
              </svg>
            </button>
          </div>
          <dl class="space-y-2 text-sm">
            <div><dt class="font-medium text-slate-700">Người được giao:</dt><dd class="text-slate-600">${safe(detail.assignee)}</dd></div>
            <div><dt class="font-medium text-slate-700">Vai trò:</dt><dd class="text-slate-600">${safe(detail.role)}</dd></div>
            <div><dt class="font-medium text-slate-700">Người phân công:</dt><dd class="text-slate-600">${safe(detail.assignor)}</dd></div>
            <div><dt class="font-medium text-slate-700">Ngày phân công:</dt><dd class="text-slate-600">${safe(detail.assignedAt)}</dd></div>
            <div><dt class="font-medium text-slate-700">Hạn xử lý:</dt><dd class="text-slate-600">${safe(detail.due)}</dd></div>
            <div><dt class="font-medium text-slate-700">Trạng thái:</dt><dd class="text-slate-600">${safe(detail.status)}</dd></div>
            ${detail.instruction ? `<div><dt class="font-medium text-slate-700">Hướng dẫn:</dt><dd class="text-slate-600">${safe(detail.instruction)}</dd></div>` : ""}
          </dl>
          <button class="close-modal w-full h-10 bg-slate-100 hover:bg-slate-200 transition-colors rounded-md text-sm font-medium">
            Đóng
          </button>
        </div>
      `;
      
      document.body.appendChild(assignDetailModalOverlay);
      
      // Prevent body scroll while modal is open
      document.body.style.overflow = "hidden";
      
      // Bind close events to all close buttons
      assignDetailModalOverlay.querySelectorAll(".close-modal").forEach(btn => {
        btn.addEventListener("click", closeAssignDetail);
      });
      
      // Close on overlay click (not on content)
      assignDetailModalOverlay.addEventListener("click", (e) => {
        if (e.target === assignDetailModalOverlay) {
          closeAssignDetail();
        }
      });
    }

    function closeAssignDetail() {
      if (assignDetailModalOverlay && assignDetailModalOverlay.parentNode) {
        assignDetailModalOverlay.remove();
        assignDetailModalOverlay = null;
        document.body.style.overflow = "";
      }
    }

    function renderAttachments(list) {
      if (!attachmentsList) return;
      const items = Array.isArray(list) ? list : [];
      const visible = items.filter((item) => !isLogAttachment(item));
      if (!visible.length) {
        attachmentsList.innerHTML =
          '<li class="text-slate-500">Chưa có đính kèm.</li>';
        return;
      }
      attachmentsList.innerHTML = visible
        .map((item) => {
          const name = item.name || item.filename || "Tệp đính kèm";
          const uploaded = formatDate(item.created_at || item.uploaded_at);
          let download = "#";
          if (item.id && typeof docApi.attachmentDownloadUrl === "function") {
            try {
              download = docApi.attachmentDownloadUrl(docId, item.id);
            } catch (err) {
              download = "#";
            }
          }
          const uploaderLabel = formatUser(item.uploaded_by || item.uploader);
          return `<li class="rounded-lg border border-slate-100 p-3 flex items-center justify-between gap-3">
            <div>
              <div class="font-medium text-slate-700">${escapeHtml(name)}</div>
              <div class="text-[12px] text-slate-500">Tải lên: ${escapeHtml(
                uploaderLabel || "—"
              )} • ${escapeHtml(uploaded)}</div>
            </div>
            <a class="text-slate-500" href="${escapeHtml(
              download
            )}" target="_blank">⬇</a>
          </li>`;
        })
        .join("");
    }

    function renderLogs(list) {
      if (!logsList) return;
      lastAssignMeta = { instruction: "", due_at: null };
      const items = Array.isArray(list) ? list : [];
      if (!items.length) {
        logsList.innerHTML =
          '<li class="text-slate-500">Chưa có nhật ký xử lý.</li>';
        return;
      }
      items.forEach((entry) => {
        if (
          entry.action === "LD_ASSIGN_OFFICER" ||
          entry.action === "ASSIGNED"
        ) {
          if (!lastAssignMeta.instruction) {
            lastAssignMeta.instruction =
              entry.comment || entry.note || entry.detail || "";
          }
          const metaDue = entry.meta?.due_at || entry.meta?.dueAt;
          if (!lastAssignMeta.due_at && metaDue) {
            lastAssignMeta.due_at = metaDue;
          }
        }
      });
      logsList.innerHTML = items
        .map((entry) => {
          const actor = formatUser(entry.actor || entry.actor_id);
          const action = entry.action || entry.note || "Hoạt động";
          const time = formatDate(entry.acted_at || entry.created_at);
          const from = formatStatusLabel(
            entry.from_status || entry.from_status_name
          );
          const to = formatStatusLabel(entry.to_status || entry.to_status_name);
          return `<li class="rounded-lg border border-slate-100 p-3 space-y-1 text-[13px]">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-slate-800">${escapeHtml(
                action
              )}</span>
              <span class="text-[12px] text-slate-500">${escapeHtml(
                time
              )}</span>
            </div>
            <p class="text-[13px] text-slate-500">${escapeHtml(
              entry.note || entry.detail || ""
            )}</p>
            ${
              from || to
                ? `<div class="text-[12px] text-slate-400">Từ ${escapeHtml(
                    from
                  )} → ${escapeHtml(to)}</div>`
                : ""
            }
            <div class="text-[12px] text-slate-400">Thực hiện bởi ${escapeHtml(
              actor
            )}</div>
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
          const at = formatDate(entry.created_at);
          const content = escapeHtml(entry.content || "");
          return `<li class="rounded-lg border border-slate-100 p-3">
            <div class="flex items-center justify-between gap-3">
              <span class="font-medium text-slate-700">${escapeHtml(
                actor
              )}</span>
              <span class="text-[12px] text-slate-400">${escapeHtml(at)}</span>
            </div>
            <p class="mt-1 text-[13px] text-slate-600 leading-relaxed">${content}</p>
          </li>`;
        })
        .join("");
    }

    function fetchAssignments() {
      if (!docApi.assignments) {
        renderAssignments([]);
        return Promise.resolve();
      }
      return docApi
        .assignments(docId)
        .then((payload) => renderAssignments(toArray(payload)))
        .then(() => toggleAssignFormVisibility())
        .catch((error) => {
          console.warn("[lanhdao] Lỗi tải phân công:", error);
          renderAssignments([]);
        });
    }

    function fetchApprovals() {
      if (!approvalsList || !docApi.approvals) {
        renderApprovals([]);
        return Promise.resolve();
      }
      return docApi
        .approvals(docId)
        .then((payload) => renderApprovals(toArray(payload)))
        .catch((error) => {
          console.warn("[lanhdao] Lỗi tải trình ký:", error);
          renderApprovals([]);
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
          console.warn("[lanhdao] Lỗi tải dispatch:", error);
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
          console.warn("[lanhdao] Lỗi tải phiên bản:", error);
          renderVersions([]);
        });
    }

    function fetchAttachments() {
      if (!docApi.attachments) {
        renderAttachments([]);
        return Promise.resolve();
      }
      return docApi
        .attachments(docId, { params: { exclude_log: 1 } })
        .then((payload) => renderAttachments(toArray(payload)))
        .catch((error) => {
          console.warn("[lanhdao] Lỗi tải đính kèm:", error);
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
          console.warn("[lanhdao] Lỗi tải nhật ký:", error);
          renderLogs([]);
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
          console.warn("[lanhdao] Lỗi tải bình luận:", error);
          showCommentMessage("Không tải được bình luận.", true);
          renderComments([]);
        });
    }

    function loadDocument() {
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
          console.error("[lanhdao] Lỗi tải chi tiết văn bản đi:", error);
          if (error?.status === 401) {
            window.location.href =
              "/auth/login/?next=" +
              encodeURIComponent(
                window.location.pathname + window.location.search
              );
          }
        });
    }

    if (assignSubmit) {
      assignSubmit.addEventListener("click", handleAssignSubmit);
    }

    if (commentForm) {
      commentForm.addEventListener("submit", handleCommentSubmit);
    }

    if (workflowActionSelect) {
      workflowActionSelect.addEventListener("change", () =>
        toggleAssignFormVisibility()
      );
      if (typeof MutationObserver === "function") {
        const observer = new MutationObserver(() =>
          toggleAssignFormVisibility()
        );
        observer.observe(workflowActionSelect, {
          childList: true,
          attributes: true,
          subtree: true,
        });
      }
    } else {
      // Nếu UI workflow chưa mount, vẫn thử hiển thị form dựa trên trạng thái hiện tại
      toggleAssignFormVisibility(currentNormalizedStatus);
    }

    // Keyboard support for modal (ESC key to close)
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && assignDetailModalOverlay) {
        closeAssignDetail();
      }
    });

    loadDocument();
  });
})();
