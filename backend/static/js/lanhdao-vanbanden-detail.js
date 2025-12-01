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

  function escapeAttr(value) {
    return escapeHtml(String(value || "").trim());
  }

  function formatDate(value) {
    if (!value) return "—";
    if (typeof value === "string" && value.length >= 10) {
      return value.slice(0, 10).split("-").reverse().join("/");
    }
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value);
    return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}/${date.getFullYear()}`;
  }

  function formatDateTime(value) {
    if (!value) return "—";
    if (typeof value === "string" && value.length >= 16) {
      const datePart = value.slice(0, 10);
      const timePart = value.slice(11, 16);
      return `${datePart.split("-").reverse().join("/")} ${timePart}`;
    }
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(
      2,
      "0"
    )}`;
    return `${formatDate(date)} ${time}`;
  }

  const LOG_ATTACHMENT_TYPE = "nhat_ky_xu_ly";

  function formatUser(user) {
    if (!user) return "—";
    if (typeof user === "string") return user;
    if (typeof user === "object") {
      return user.full_name || user.name || user.username || "—";
    }
    return String(user);
  }

    const STATUS_CODE_ALIASES = {
      RECEIVED: "RECEIVED",
      TIEP_NHAN: "RECEIVED",
      "TIẾP_NHẬN": "RECEIVED",
      WAITING_ASSIGNMENT: "WAITING_ASSIGNMENT",
      CHO_PHAN_CONG: "WAITING_ASSIGNMENT",
      PROCESSING: "PROCESSING",
      DANG_XU_LY: "PROCESSING",
      PENDING_LEADER_APPROVAL: "PENDING_LEADER_APPROVAL",
      CHO_LANH_DAO_PHE_DUYET: "PENDING_LEADER_APPROVAL",
      PENDING_CLERK_CHECK: "PENDING_CLERK_CHECK",
      CHO_VAN_THU_KIEM_TRA: "PENDING_CLERK_CHECK",
      REGISTERED: "REGISTERED",
      DA_VAO_SO: "REGISTERED",
      DISPATCHED: "DISPATCHED",
      DA_PHAT_HANH_KET_QUA: "DISPATCHED",
      DA_PHAT_HANH: "DISPATCHED",
      ARCHIVED: "ARCHIVED",
      DA_LUU_TRU: "ARCHIVED",
      THU_HOI: "THU_HOI",
    };

    function buildStatusKey(value) {
      if (!value) return "";
      const text = String(value).trim();
      if (!text) return "";
      const accentFree = text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_")
        .replace(/[^A-Z0-9_]/gi, "_");
      return accentFree.toUpperCase().replace(/__+/g, "_").replace(/^_|_$/g, "");
    }

    function normalizeStatus(raw) {
      if (!raw) return "RECEIVED";
      if (typeof raw === "object" && raw !== null) {
        if (typeof raw.code === "string" && raw.code.trim()) {
          return normalizeStatus(raw.code);
        }
        if (typeof raw.status_name === "string" && raw.status_name.trim()) {
          return normalizeStatus(raw.status_name);
        }
        if (typeof raw.name === "string" && raw.name.trim()) {
          return normalizeStatus(raw.name);
        }
      }
      const key = buildStatusKey(raw);
      if (!key) return "RECEIVED";
      return STATUS_CODE_ALIASES[key] || key;
    }

    function formatStatusLabel(status) {
      if (!status) return "";
      if (typeof status === "string") {
        return status;
      }
      if (typeof status === "object") {
        return status.name || status.code || status.status_name || "";
      }
      return String(status);
    }

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
    return type === LOG_ATTACHMENT_TYPE;
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
    const docId = getDocId();
    if (!docId) {
      console.warn("[lanhdao] Không xác định được ID văn bản.");
      return;
    }

    const api = window.ApiClient;
    const docApi = api?.documents;
    if (!docApi) {
      console.warn("[lanhdao] Document API chưa sẵn sàng cho chi tiết.");
      return;
    }

    if (typeof api?.ensureAuthenticated === "function") {
      api.ensureAuthenticated().catch(() => {
        window.location.href = "/auth/login/?next=" + encodeURIComponent(window.location.pathname + window.location.search);
      });
    }

    window.LDDetailOverride = true;

    const directionBadge = document.getElementById("doc-badge-direction");
    const urgencyBadge = document.getElementById("doc-badge-urgency");
    const statusBadge = document.getElementById("doc-badge-status");
    const titleEl = document.getElementById("doc-title");
    const summaryEl = document.getElementById("doc-summary");
    const metaCode = document.getElementById("doc-meta-code");
    const metaNumber = document.getElementById("doc-meta-number");
    const metaIssued = document.getElementById("doc-meta-issued");
    const metaReceived = document.getElementById("doc-meta-received");
    const metaSender = document.getElementById("doc-meta-sender");
    const metaReceivedBy = document.getElementById("doc-meta-received-by");
    const metaField = document.getElementById("doc-meta-field");
    const metaDeadline = document.getElementById("doc-meta-deadline");
    const assignmentsBody = document.getElementById("doc-assignments-body");
    const attachmentsList = document.getElementById("doc-attachment-list");
    const logsList = document.getElementById("doc-log-list");
    const workflowPanel = document.getElementById("doc-workflow-panel");
    const workflowTool = window.DocumentUIWorkflow;
    const workflowDispatcher = window.WorkflowActionDispatcher;
    const identifierEl = document.getElementById("doc-meta-identifier");
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
    const ASSIGNABLE_STATUSES = new Set(["WAITING_ASSIGNMENT", "PROCESSING"]);
    const workflowActionSelect = document.getElementById("ld-workflow-action");
    const assignDetailModal = document.getElementById("ld-assign-detail-modal");
    const assignDetailClose = document.getElementById("ld-assign-detail-close");
    const assignDetailCloseBottom = document.getElementById("ld-assign-detail-close-bottom");
    const assignDetailAssignee = document.getElementById("ld-assign-detail-assignee");
    const assignDetailRole = document.getElementById("ld-assign-detail-role");
    const assignDetailAssignor = document.getElementById("ld-assign-detail-assignor");
    const assignDetailDue = document.getElementById("ld-assign-detail-due");
    const assignDetailAt = document.getElementById("ld-assign-detail-at");
    const assignDetailStatus = document.getElementById("ld-assign-detail-status");
    const assignDetailInstruction = document.getElementById("ld-assign-detail-instruction");

    const actionButtons = document.querySelectorAll("[data-doc-action]");
    actionButtons.forEach((btn) => {
      btn.disabled = true;
      btn.classList.add("opacity-60", "cursor-not-allowed");
      btn.title = "Thao tác qua luồng trạng thái.";
    });

    let currentNormalizedStatus = "RECEIVED";
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
      if (directionBadge) {
        directionBadge.textContent = doc.direction || "Văn bản đến";
      }
      if (urgencyBadge) {
        const level = doc.important_level || doc.urgency?.name || doc.urgency?.code || "Thường";
        urgencyBadge.textContent = level;
      }
      const normalizedStatus = normalizeStatus(
        doc.status?.code || doc.status?.name || doc.status || doc.state || doc.status_name
      );
      if (statusBadge) {
        const label = STATUS_LABELS[normalizedStatus] || normalizedStatus.replace(/_/g, " ");
        const badgeClass = STATUS_BADGES[normalizedStatus] || "bg-slate-900 text-white";
        statusBadge.textContent = label;
        statusBadge.className = `px-2.5 py-1 rounded-full text-xs font-semibold ${badgeClass}`;
      }
      if (titleEl) {
        titleEl.textContent = doc.title || doc.subject || "Văn bản đến";
      }
      if (summaryEl) {
        summaryEl.textContent =
          doc.summary || doc.note || doc.description || "—";
      }
      if (metaCode) metaCode.textContent = doc.document_code || doc.number || "—";
      if (metaNumber) metaNumber.textContent = doc.received_number || doc.number || "—";
      if (metaIssued) metaIssued.textContent = formatDate(doc.issued_date || doc.created_at);
      if (metaReceived) metaReceived.textContent = formatDate(doc.received_date);
      if (metaSender) metaSender.textContent = doc.from_org_name || doc.sender || "—";
      if (metaReceivedBy) {
        metaReceivedBy.textContent =
          formatUser(doc.received_by) || formatUser(doc.receiver) || "—";
      }
      if (metaField) {
        metaField.textContent = doc.department?.name || doc.field?.name || "—";
      }
      if (metaDeadline) {
        metaDeadline.textContent = formatDate(doc.due_date || doc.deadline);
      }
      if (identifierEl) {
        const code = doc.number || doc.document_code || "—";
        const directionLabel = (doc.direction || doc.doc_direction || "Văn bản đến").replace(/_/g, " ");
        identifierEl.textContent = `${code} • ${directionLabel}`;
      }
      toggleAssignFormVisibility(normalizedStatus);
      const departmentId = doc.main_department_id || doc.department?.id || doc.department_id;
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

    function loadCandidateCvs(departmentId) {
      if (!assignSelect) return Promise.resolve();

      const client = api?.specialists?.list ? api.specialists : api.users;
      if (!client || typeof client.list !== "function") return Promise.resolve();

      const params = { ordering: "full_name" };
      if (departmentId) params.department_id = departmentId;
      if (client === api.users) params.role = "CV";

      return client
        .list(params)
        .then((payload) => renderAssignOptions(toArray(payload)))
        .catch((error) => {
          console.warn("[lanhdao] Lỗi tải chuyên viên:", error);
          showAssignMessage("Không tải được danh sách chuyên viên. Vui lòng thử lại.", true);
          renderAssignOptions([]);
        });
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
      const assigneeId = assignSelect.value;
      if (!assigneeId) {
        showAssignMessage("Phải chọn chuyên viên chủ trì.", true);
        return;
      }
      const selectedRole = assignRole?.value || "assignee";
      const isOwner = selectedRole === "owner" || selectedRole === "assignee";
      const roleOnDoc = selectedRole === "owner" ? "assignee" : selectedRole;
      const payload = { assignees: assigneeId, role: roleOnDoc };
      const instruction = assignInstruction?.value?.trim();
      const dueAt = assignDueAt?.value || null;
      if (instruction) {
        payload.instruction = instruction;
      }
      if (dueAt) {
        payload.due_at = dueAt;
      }
      const assignViaApi = () => {
        if (!docApi?.updateAssignments) {
          return Promise.reject(new Error("API phân công không sẵn sàng."));
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
        return docApi
          .updateAssignments(docId, { assignments, append: true })
          .then(() => {
            showAssignMessage("Đã phân công thành công.", false);
            return fetchAssignments();
          })
          .catch((error) => {
            throw error;
          });
      };

      const assignViaForm = () => {
        if (!workflowDispatcher) {
          return Promise.reject(new Error("WorkflowActionDispatcher không sẵn sàng."));
        }
        return workflowDispatcher.submit("vanbanden", docId, "LD_ASSIGN_OFFICER", payload);
      };

      assignViaApi()
        .then(() => assignViaForm())
        .then(() =>
          docApi.retrieve(docId).then((doc) => {
            renderDoc(doc);
            return fetchAssignments();
          })
        )
        .catch((err) => {
          // If workflow submit failed but assignments saved, still refresh UI to reflect current data/state
          docApi.retrieve(docId).then((doc) => renderDoc(doc)).catch(() => {});
          return Promise.reject(err);
        })
        .catch((err) => {
          if (assignMessage && !assignMessage.textContent) {
            showAssignMessage(
              err?.message ? `Không thể phân công: ${err.message}` : "Không thể phân công.",
              true
            );
          }
          return Promise.reject(err);
        })
        .catch((error) => {
          console.warn("[lanhdao] Lỗi phân công:", error);
          showAssignMessage(
            error?.message ? `Không thể phân công: ${error.message}` : "Không thể phân công.",
            true
          );
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
      const payload = { entity_type: "document", entity_id: commentEntityId, content };
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
            error?.message ? `Không gửi được bình luận: ${error.message}` : "Không gửi được bình luận.",
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
      const status = normalizeStatus(
        doc.status?.code || doc.status?.name || doc.status || doc.state || doc.status_name
      );
      const payload = {
        container: workflowPanel,
        docId,
        direction: "INBOUND",
        status,
        role: "LD",
        route: "vanbanden",
        allowWithdraw: true,
      };
      if (!window._ldWorkflowInstance) {
        window._ldWorkflowInstance = workflowTool.mount(payload);
        toggleAssignFormVisibility(status);
        return;
      }
      if (typeof window._ldWorkflowInstance.update === "function") {
        window._ldWorkflowInstance.update(status);
        toggleAssignFormVisibility(status);
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
        const roleLabel = assignmentRole(item.role_on_doc || item.role);
        const rawDue =
          item.due_at ||
          item.due_date ||
          item.dueAt ||
          (lastAssignMeta.due_at || null);
        const due = formatDate(rawDue);
        const statusText = item.active === false ? "Hoàn tất" : "Đang xử lý";
        const assignedAt = formatDate(item.assigned_at || item.assignedAt);
        const instruction = item.instruction || lastAssignMeta.instruction || "";
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

    function openAssignDetail(detail) {
      if (!assignDetailModal) return;
      const safe = (v) => (v ? String(v) : "—");
      if (assignDetailAssignee) assignDetailAssignee.textContent = safe(detail.assignee);
      if (assignDetailRole) assignDetailRole.textContent = safe(detail.role);
      if (assignDetailAssignor) assignDetailAssignor.textContent = safe(detail.assignor);
      if (assignDetailDue) assignDetailDue.textContent = safe(detail.due);
      if (assignDetailAt) assignDetailAt.textContent = safe(detail.assignedAt);
      if (assignDetailStatus) assignDetailStatus.textContent = safe(detail.status);
      if (assignDetailInstruction) assignDetailInstruction.textContent = safe(detail.instruction);
      assignDetailModal.classList.remove("hidden");
      assignDetailModal.classList.add("flex");
    }

    function closeAssignDetail() {
      if (!assignDetailModal) return;
      assignDetailModal.classList.add("hidden");
      assignDetailModal.classList.remove("flex");
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
            <a class="text-slate-500" href="${escapeHtml(download)}" target="_blank">⬇</a>
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
        if (entry.action === "LD_ASSIGN_OFFICER" || entry.action === "ASSIGNED") {
          if (!lastAssignMeta.instruction) {
            lastAssignMeta.instruction = entry.comment || entry.note || entry.detail || "";
          }
          const metaDue = entry.meta?.due_at || entry.meta?.dueAt;
          if (!lastAssignMeta.due_at && metaDue) {
            lastAssignMeta.due_at = metaDue;
          }
        }
      });
      logsList.innerHTML = items
        .map((entry) => {
          const actor = formatUser(
            entry.actor || entry.actor_id || entry.uploaded_by || entry.uploader
          );
          const description = entry.note || entry.description || entry.detail || "";
          const action = entry.action || (entry.attachment ? "Đính kèm tệp xử lý" : "Hoạt động");
          const time = formatDateTime(entry.acted_at || entry.created_at);
          const from = formatStatusLabel(entry.from_status || entry.from_status_name);
          const to = formatStatusLabel(entry.to_status || entry.to_status_name);
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
            ${from || to ? `<div class="text-[12px] text-slate-400">Từ ${escapeHtml(
              from
            )} → ${escapeHtml(to)}</div>` : ""}
            <div class="text-[12px] text-slate-400">Thực hiện bởi ${escapeHtml(actor)}</div>
          </li>`;
        })
        .join("");
    }

    function renderComments(list) {
      if (!commentList) return;
      const items = Array.isArray(list) ? list : [];
      if (!items.length) {
        commentList.innerHTML = '<li class="text-slate-500">Chưa có trao đổi.</li>';
        return;
      }
      commentList.innerHTML = items
        .map((entry) => {
          const actor = formatUser(entry.user);
          const at = formatDate(entry.created_at);
          const content = escapeHtml(entry.content || "");
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
      const tasks = [];
      if (docApi.workflowLogs) {
        tasks.push(
          docApi
            .workflowLogs(docId)
            .then((payload) => toArray(payload))
            .catch((error) => {
              console.warn("[lanhdao] Lỗi tải nhật ký:", error);
              return [];
            })
        );
      }
      if (docApi.attachments) {
        tasks.push(
          docApi
            .attachments(docId)
            .then((payload) =>
              toArray(payload)
                .filter((file) => isLogAttachment(file))
                .map((file) => buildAttachmentLogEntry(file, docId, docApi))
                .filter(Boolean)
            )
            .catch((error) => {
              console.warn("[lanhdao] Lỗi tải nhật ký từ tệp:", error);
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
        .then((payload) => renderComments(Array.isArray(payload) ? payload : toArray(payload)))
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
          return Promise.all([fetchAssignments(), fetchAttachments(), fetchLogs(), fetchComments()]);
        })
        .catch((error) => {
          console.error("[lanhdao] Lỗi tải chi tiết văn bản đến:", error);
          if (error?.status === 401) {
            window.location.href =
              "/auth/login/?next=" + encodeURIComponent(window.location.pathname + window.location.search);
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
      workflowActionSelect.addEventListener("change", () => toggleAssignFormVisibility());
      if (typeof MutationObserver === "function") {
        const observer = new MutationObserver(() => toggleAssignFormVisibility());
        observer.observe(workflowActionSelect, { childList: true, attributes: true, subtree: true });
      }
    } else {
      // Nếu UI workflow chưa mount, vẫn thử hiển thị form dựa trên trạng thái hiện tại
      toggleAssignFormVisibility(currentNormalizedStatus);
    }

    if (assignDetailModal) {
      const overlayCloseHandlers = [assignDetailClose, assignDetailCloseBottom];
      overlayCloseHandlers.forEach((btn) => {
        if (btn) btn.addEventListener("click", closeAssignDetail);
      });
      assignDetailModal.addEventListener("click", (event) => {
        if (event.target === assignDetailModal) {
          closeAssignDetail();
        }
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          closeAssignDetail();
        }
      });
    }

    loadDocument();
  });
})();
