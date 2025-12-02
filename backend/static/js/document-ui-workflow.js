(function () {
  const STATUS_FLOW = {
    INBOUND: [
      { key: "WAITING_ASSIGNMENT", label: "Chờ phân công" },
      { key: "PROCESSING", label: "Đang xử lý" },
      { key: "PENDING_LEADER_APPROVAL", label: "Chờ lãnh đạo phê duyệt" },
      { key: "PENDING_CLERK_CHECK", label: "Chờ văn thư kiểm tra" },
      { key: "REGISTERED", label: "Đã vào sổ" },
      { key: "DISPATCHED", label: "Đã phát hành kết quả" },
      { key: "ARCHIVED", label: "Đã lưu trữ" },
      { key: "THU_HOI", label: "Thu hồi" },
    ],
    OUTBOUND: [
      { key: "DRAFT", label: "Dự thảo" },
      { key: "SUBMITTED", label: "Đã trình lãnh đạo" },
      { key: "PENDING_CLERK_CHECK", label: "Chờ văn thư kiểm tra" },
      { key: "REGISTERED", label: "Đã vào sổ" },
      { key: "ISSUED", label: "Đã phát hành" },
      { key: "ARCHIVED", label: "Đã lưu trữ" },
      { key: "HUY_PHAT_HANH", label: "Hủy phát hành" },
    ],
  };

  const ROLE_ALIAS = {
    vt: "VT",
    vanthu: "VT",
    cv: "CV",
    chuyenvien: "CV",
    ld: "LD",
    lanhdao: "LD",
    qt: "QT",
    quantri: "QT",
  };

  const LD_ASSIGN_ACTIONS = [
    { action: "LD_ASSIGN_OFFICER", label: "Phân công" },
  ];

  const ACTION_MATRIX = {
    INBOUND: {
      VT: {
        RECEIVED: [
          { action: "VT_REGISTER_INBOUND", label: "Đăng ký văn bản đến" },
        ],
        PENDING_CLERK_CHECK: [
          { action: "VT_FINAL_CHECK_OK_INBOUND", label: "Kiểm tra & vào sổ" },
          {
            action: "VT_FINAL_CHECK_REJECT_INBOUND",
            label: "Yêu cầu chỉnh sửa",
          },
        ],
        REGISTERED: [
          { action: "VT_DISPATCH_RESULT", label: "Phát hành kết quả" },
        ],
        DISPATCHED: [{ action: "VT_ARCHIVE_INBOUND", label: "Lưu trữ hồ sơ" }],
      },
      LD: {
        RECEIVED: LD_ASSIGN_ACTIONS,
        WAITING_ASSIGNMENT: LD_ASSIGN_ACTIONS,
        PENDING_LEADER_APPROVAL: [
          { action: "LD_APPROVE_INBOUND", label: "Phê duyệt kết quả" },
          { action: "LD_REQUEST_CHANGES_INBOUND", label: "Yêu cầu chỉnh sửa" },
        ],
        // VT is doing final check - LD has no actions at this stage
        PENDING_CLERK_CHECK: [],
      },
      CV: {
        PROCESSING: [
          { action: "CV_SUBMIT_FOR_APPROVAL", label: "Trình lãnh đạo" },
          { action: "CV_REQUEST_REASSIGN", label: "Đề xuất phân công lại" },
        ],
      },
      QT: {
        ANY: [{ action: "QT_RECALL_INBOUND", label: "Thu hồi hồ sơ" }],
      },
    },
    OUTBOUND: {
      VT: {
        DRAFT: [], // VT không can thiệp ở DRAFT (CV tạo và trình)
        SUBMITTED: [], // Chờ LD duyệt, VT không can thiệp
        PENDING_CLERK_CHECK: [
          { action: "VT_FINAL_CHECK_OK_OUTBOUND", label: "Kiểm tra & vào sổ" },
          {
            action: "VT_FINAL_CHECK_REJECT_OUTBOUND",
            label: "Từ chối (Báo lỗi)",
          },
        ],
        REGISTERED: [
          { action: "VT_ISSUE_OUTBOUND", label: "Phát hành văn bản" },
        ],
        ISSUED: [{ action: "VT_ARCHIVE_OUTBOUND", label: "Lưu trữ văn bản" }],
        ARCHIVED: [], // Trạng thái cuối, không có actions
        HUY_PHAT_HANH: [], // Trạng thái lỗi, cần QT xử lý
      },
      LD: {
        DRAFT: [], // LD không can thiệp ở DRAFT
        SUBMITTED: [
          { action: "LD_APPROVE_OUTBOUND", label: "Phê duyệt & Chuyển VT" },
          {
            action: "LD_REQUEST_CHANGES_OUTBOUND",
            label: "Trả lại",
          },
        ],
        PENDING_CLERK_CHECK: [], // VT đang kiểm tra, LD không can thiệp
        REGISTERED: [], // LD không can thiệp sau khi vào sổ
        ISSUED: [
          { action: "QT_CANCEL_ISSUED_OUTBOUND", label: "Hủy phát hành" },
        ],
        ARCHIVED: [
          { action: "QT_CANCEL_ISSUED_OUTBOUND", label: "Hủy phát hành" },
        ],
        HUY_PHAT_HANH: [], // Trạng thái lỗi, cần QT xử lý
      },
      CV: {
        DRAFT: [{ action: "CV_SUBMIT_DRAFT", label: "Trình lãnh đạo" }],
        SUBMITTED: [], // Chờ LD duyệt, CV không can thiệp
        PENDING_CLERK_CHECK: [], // VT đang kiểm tra, CV không can thiệp
        REGISTERED: [], // CV không can thiệp sau khi vào sổ
        ISSUED: [], // CV không can thiệp sau phát hành
        ARCHIVED: [], // Trạng thái cuối
        HUY_PHAT_HANH: [], // Trạng thái lỗi
      },
      QT: {
        DRAFT: [], // QT không can thiệp công việc thường
        SUBMITTED: [], // QT không can thiệp công việc thường
        PENDING_CLERK_CHECK: [], // QT không can thiệp công việc thường
        REGISTERED: [], // QT không can thiệp công việc thường
        ISSUED: [
          { action: "QT_CANCEL_ISSUED_OUTBOUND", label: "Hủy phát hành" },
        ],
        ARCHIVED: [
          { action: "QT_CANCEL_ISSUED_OUTBOUND", label: "Hủy phát hành" },
        ],
        HUY_PHAT_HANH: [], // Đã hủy rồi, không cần action
      },
    },
  };

  const ACTION_FIELD_MAP = {
    LD_APPROVE_OUTBOUND: {
      name: "note",
      label: "Ghi chú/ý kiến",
      type: "textarea",
      placeholder: "Ghi rõ ý kiến/phản hồi của lãnh đạo (không bắt buộc)",
    },
    LD_REQUEST_CHANGES_OUTBOUND: {
      name: "reason",
      label: "Lý do yêu cầu chỉnh sửa",
      type: "textarea",
      required: true,
      placeholder: "Mô tả chi tiết điểm cần chỉnh sửa",
    },
    LD_REQUEST_CHANGES_FROM_CLERK: {
      name: "note",
      label: "Nhận xét xử lý phản hồi từ văn thư",
      type: "textarea",
      placeholder:
        "Ghi rõ hướng dẫn hoặc phản hồi khi VT báo lỗi (không bắt buộc)",
    },
    QT_CANCEL_ISSUED_OUTBOUND: {
      name: "reason",
      label: "Lý do thu hồi",
      type: "textarea",
      required: true,
      placeholder: "Trình bày rõ lý do cần thu hồi văn bản",
    },
    VT_FINAL_CHECK_REJECT_OUTBOUND: {
      name: "reason",
      label: "Lý do yêu cầu chỉnh sửa",
      type: "textarea",
      placeholder:
        "Ghi rõ lỗi thể thức/nội dung cần chỉnh sửa (không bắt buộc)",
    },
    VT_FINAL_CHECK_OK_OUTBOUND: [
      {
        name: "register_book_id",
        label: "Chọn sổ đăng ký",
        type: "select",
        required: true,
        options: [],
        apiMethod: "registerBooks.list",
        apiParams: { direction: "di", is_active: true },
        optionValue: "register_id",
        optionLabel: (item) => `${item.name} (${item.year})`,
      },
      {
        name: "comment",
        label: "Ghi chú",
        type: "textarea",
        placeholder: "Ghi chú khi vào sổ (không bắt buộc)",
      },
    ],
    VT_REGISTER_OUTBOUND: [
      {
        name: "register_book_id",
        label: "Chọn sổ đăng ký",
        type: "select",
        required: true,
        options: [],
        apiMethod: "registerBooks.list",
        apiParams: { direction: "di", is_active: true },
        optionValue: "register_id",
        optionLabel: (item) => `${item.name} (${item.year})`,
      },
      {
        name: "comment",
        label: "Ghi chú",
        type: "textarea",
        placeholder: "Ghi chú khi vào sổ (không bắt buộc)",
      },
    ],
    VT_REGISTER_INBOUND: [
      {
        name: "register_book_id",
        label: "Chọn sổ đăng ký",
        type: "select",
        required: true,
        options: [],
        apiMethod: "registerBooks.list",
        apiParams: { direction: "den", is_active: true },
        optionValue: "register_id",
        optionLabel: (item) => `${item.name} (${item.year})`,
      },
      {
        name: "comment",
        label: "Ghi chú",
        type: "textarea",
        placeholder: "Ghi chú khi vào sổ (không bắt buộc)",
      },
    ],
    VT_ISSUE_OUTBOUND: [
      {
        name: "issue_number",
        label: "Số hiệu",
        type: "text",
        required: false,
        placeholder: "Để trống nếu đã có số (tự động từ sổ)",
      },
      {
        name: "issued_date",
        label: "Ngày ban hành",
        type: "date",
        required: true,
      },
      {
        name: "channels",
        label: "Nơi nhận",
        type: "text",
        placeholder: "Email, Portal, Giấy...",
      },
    ],
    sign: {
      name: "signature_hash",
      label: "Mã hash chữ ký",
      type: "text",
      placeholder: "Nhập hash chữ ký",
      required: true,
    },
  };

  const STATUS_ALIASES = {
    TRINH_DUYET: "SUBMITTED",
    DA_TRINH: "SUBMITTED",
    TRINH_LANH_DAO: "SUBMITTED",
    DA_TRINH_LANH_DAO: "SUBMITTED",
    TRINH_LD: "SUBMITTED",
    DA_TRINH_LD: "SUBMITTED",
    CHO_LANH_DAO_PHE_DUYET: "SUBMITTED",
    CHO_LD_PHE_DUYET: "SUBMITTED",
    // Map RETURNED aliases to DRAFT (status removed)
    BI_TRA_LAI: "DRAFT",
    DU_THAO: "DRAFT",
    TRA_LAI: "DRAFT",
    RETURNED: "DRAFT",
    // Map APPROVED aliases to PENDING_CLERK_CHECK (LD approval goes directly to clerk now)
    PHE_DUYET: "PENDING_CLERK_CHECK",
    LD_DA_PHE_DUYET: "PENDING_CLERK_CHECK",
    KY_SO: "PENDING_CLERK_CHECK",
    APPROVED: "PENDING_CLERK_CHECK",
    CHO_VAN_THU_KIEM_TRA: "PENDING_CLERK_CHECK",
    PHAT_HANH: "ISSUED",
    DA_PHAT_HANH: "ISSUED",
  };

  function buildStatusKey(raw) {
    if (!raw) return "";
    const normalized = String(raw).trim();
    if (!normalized) return "";
    return normalized
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/gi, "d")
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, "_")
      .replace(/__+/g, "_")
      .replace(/^_|_$/g, "");
  }

  function canonicalStatus(raw, direction) {
    if (!raw) return direction === "INBOUND" ? "RECEIVED" : "DRAFT";
    if (typeof raw === "object" && raw !== null) {
      if (raw.code) return canonicalStatus(raw.code, direction);
      if (raw.status_name) return canonicalStatus(raw.status_name, direction);
      if (raw.name) return canonicalStatus(raw.name, direction);
    }
    const key = buildStatusKey(raw);
    if (!key) return direction === "INBOUND" ? "RECEIVED" : "DRAFT";

    // INBOUND statuses: Map to canonical INBOUND states
    if (direction === "INBOUND") {
      const inboundAliases = {
        TIEP_NHAN: "RECEIVED",
        PHAN_CONG: "WAITING_ASSIGNMENT",
        DANG_XU_LY: "PROCESSING",
        DANG_KY: "REGISTERED",
        HOAN_TAT: "DISPATCHED",
        LUU_TRU: "ARCHIVED",
      };
      const alias = inboundAliases[key];
      if (alias) return alias;

      // Heuristics for INBOUND
      if (key.includes("TIEP_NHAN") || key.includes("RECEIVED")) return "RECEIVED";
      if (key.includes("CHO_PHAN_CONG") || key.includes("WAITING")) return "WAITING_ASSIGNMENT";
      if (key.includes("DANG_XU_LY") || key.includes("PROCESSING")) return "PROCESSING";
      if (key.includes("CHO_LANH_DAO") || key.includes("PENDING_LEADER")) return "PENDING_LEADER_APPROVAL";
      if (key.includes("CHO_VAN_THU") || key.includes("PENDING_CLERK") || key.includes("CLERK")) return "PENDING_CLERK_CHECK";
      if (key.includes("DANG_KY") || key.includes("REGISTERED")) return "REGISTERED";
      if (key.includes("PHAT_HANH") || key.includes("DISPATCHED")) return "DISPATCHED";
      if (key.includes("LUU_TRU") || key.includes("ARCHIVED")) return "ARCHIVED";
      if (key.includes("THU_HOI")) return "THU_HOI";

      // Return normalized key if no match
      return key;
    }

    // OUTBOUND statuses: Use existing STATUS_ALIASES
    const alias =
      STATUS_ALIASES[key] || STATUS_ALIASES[key.replace(/\s+/g, "_")];
    if (alias) return alias;

    // Heuristics for OUTBOUND
    const isSubmitted =
      key.includes("SUBMIT") ||
      key.includes("TRINH") ||
      key.includes("TRINH_LD") ||
      key.includes("TRINH_LANH") ||
      key.includes("PENDING_LEADER");
    if (isSubmitted) return "SUBMITTED";

    // RETURNED/TRA_LAI -> DRAFT (status removed)
    const isReturned = key.includes("RETURN") || key.includes("TRA_LAI");
    if (isReturned) return "DRAFT";

    // APPROVED/PHE_DUYET/KY_SO -> PENDING_CLERK_CHECK (LD approval goes directly to clerk)
    const isApproved =
      key.includes("APPROVE") ||
      key.includes("PHE_DUYET") ||
      key.includes("KY_SO");
    if (isApproved) return "PENDING_CLERK_CHECK";

    const isClerkCheck = key.includes("CLERK") || key.includes("VAN_THU");
    if (isClerkCheck) return "PENDING_CLERK_CHECK";

    // CRITICAL: Check for HUY_PHAT_HANH (canceled) BEFORE checking PHAT_HANH (issued)
    // Otherwise "HUY_PHAT_HANH" will match "PHAT_HANH" and return "ISSUED" incorrectly
    const isCanceled = key.includes("HUY") || key.includes("CANCEL");
    if (isCanceled) return "HUY_PHAT_HANH";

    const isIssued = key.includes("ISSUE") || key.includes("PHAT_HANH");
    if (isIssued) return "ISSUED";

    const isArchived = key.includes("ARCHIVE") || key.includes("LUU_TRU");
    if (isArchived) return "ARCHIVED";

    return key;
  }

  function normalizeRole(value) {
    if (!value) return "VT";
    const key = String(value).trim().toLowerCase();
    return ROLE_ALIAS[key] || value.toUpperCase();
  }

  function normalizeDirection(value) {
    if (!value) return "INBOUND";
    const key = String(value).trim().toUpperCase();
    return key === "OUTBOUND" ? "OUTBOUND" : "INBOUND";
  }

  function findStatusFlow(direction) {
    return STATUS_FLOW[direction] || STATUS_FLOW.INBOUND;
  }

  function buildSteps(flow, currentStatus) {
    return flow.map((step) => {
      const li = document.createElement("li");
      li.className = "text-sm";
      li.textContent = step.label;
      if (step.key === currentStatus) {
        li.classList.add("font-semibold", "text-blue-600");
      } else if (
        flow.findIndex((item) => item.key === step.key) <
        flow.findIndex((item) => item.key === currentStatus)
      ) {
        li.classList.add("text-slate-500");
      } else {
        li.classList.add("text-slate-400");
      }
      return li;
    });
  }

  function getActions(direction, role, status) {
    const flowMatrix = ACTION_MATRIX[direction] || ACTION_MATRIX.INBOUND;
    const roleMatrix = flowMatrix[role] || {};

    // Normalize status với direction để đảm bảo khớp với key trong ACTION_MATRIX
    const normalizedStatus = canonicalStatus(status, direction);

    console.debug("[DocumentUIWorkflow] getActions called", {
      direction,
      role,
      originalStatus: status,
      normalizedStatus,
      availableStatuses: Object.keys(roleMatrix),
      roleMatrixExists: !!roleMatrix,
    });

    // Tìm actions trực tiếp theo status đã normalize
    let direct = roleMatrix[normalizedStatus] || [];

    // Fallback: sử dụng ANY nếu có
    if (!direct.length && roleMatrix.ANY) {
      console.debug("[DocumentUIWorkflow] Using ANY actions fallback");
      return roleMatrix.ANY;
    }

    console.debug("[DocumentUIWorkflow] getActions result", {
      direction,
      role,
      normalizedStatus,
      actionsCount: direct.length,
      actions: direct.map((a) => a.action),
      directIsArray: Array.isArray(direct),
    });

    return direct;
  }

  function normalizeRoute(value) {
    const raw = String(value || "").trim();
    if (!raw) return "vanbanden";
    return raw.replace(/^\/+|\/+$/g, "");
  }

  function mount(options = {}) {
    const container =
      options.container || document.getElementById("doc-workflow-panel");
    if (!container) {
      return null;
    }

    const stepsEl = container.querySelector('[data-wf="steps"]');
    const selectEl = container.querySelector('[data-wf="action-select"]');
    const fieldsEl = container.querySelector('[data-wf="fields"]');
    const submitEl = container.querySelector('[data-wf="submit"]');
    const withdrawEl = container.querySelector('[data-wf="withdraw"]');
    const messageEl = container.querySelector('[data-wf="message"]');


    const direction = normalizeDirection(
      options.direction || container.dataset.direction
    );
    let currentStatus = canonicalStatus(
      options.status || container.dataset.status || "RECEIVED",
      direction
    );
    const role = normalizeRole(options.role || container.dataset.role);
    const route = normalizeRoute(options.route || container.dataset.route);
    const allowWithdraw =
      options.allowWithdraw || container.dataset.allowWithdraw === "1";
    const docId = options.docId || container.dataset.docId || null;


    const flow = findStatusFlow(direction);
    const dispatcher = window.WorkflowActionDispatcher;

    if (selectEl) {
      selectEl.addEventListener("change", () => {
        renderFields(selectEl.value);
      });
    }

    function renderSteps() {
      if (!stepsEl) return;
      stepsEl.innerHTML = "";
      const nodes = buildSteps(flow, currentStatus);
      nodes.forEach((node) => stepsEl.appendChild(node));
    }

    function renderActions() {
      if (!selectEl) return;

      // currentStatus đã được normalize trong mount() ở dòng 292, không cần normalize lại
      // Truyền trực tiếp currentStatus vào getActions (getActions sẽ normalize nếu cần)
      const actions = getActions(direction, role, currentStatus);
      selectEl.innerHTML = "";
      if (!actions.length) {
        console.warn("[DocumentUIWorkflow] No actions found", {
          direction,
          role,
          status: currentStatus,
          statusAlias: STATUS_ALIASES[currentStatus],
          roleMatrix: ACTION_MATRIX[direction]?.[role],
          availableStatuses: ACTION_MATRIX[direction]?.[role]
            ? Object.keys(ACTION_MATRIX[direction][role])
            : [],
        });
        selectEl.disabled = true;
        if (submitEl) submitEl.disabled = true;
        if (messageEl) {
          messageEl.textContent =
            "Không có hành động phù hợp ở trạng thái hiện tại.";
        }
        renderFields(null);
        return;
      }
      console.debug("[DocumentUIWorkflow] Actions resolved", {
        direction,
        role,
        status: currentStatus,
        actions: actions.map((entry) => entry.action),
      });
      selectEl.disabled = false;
      if (submitEl) submitEl.disabled = false;
      if (messageEl) {
        messageEl.textContent = "";
      }
      actions.forEach((entry) => {
        const option = document.createElement("option");
        option.value = entry.action;
        option.textContent = entry.label;
        selectEl.appendChild(option);
      });
      selectEl.value = actions[0].action;
      renderFields(actions[0].action);
    }

    function handleSubmit(event) {
      event.preventDefault();
      if (!selectEl || !docId) return;
      if (dispatcher && typeof dispatcher.submit === "function") {
        const action = selectEl.value;
        const payload = collectPayload(action);
        if (payload === false) {
          return;
        }
        dispatcher.submit(route, docId, action, payload || undefined);
      } else {
        console.warn(
          "[DocumentUIWorkflow] Workflow dispatcher không sẵn sàng."
        );
      }
    }

    function handleWithdraw(event) {
      event.preventDefault();
      if (!docId) return;
      const withdrawAction =
        direction === "INBOUND"
          ? "QT_RECALL_INBOUND"
          : "QT_CANCEL_ISSUED_OUTBOUND";
      if (dispatcher && typeof dispatcher.submit === "function") {
        dispatcher.submit(route, docId, withdrawAction);
      } else {
        console.warn(
          "[DocumentUIWorkflow] Workflow dispatcher không sẵn sàng (thu hồi)."
        );
      }
    }

    if (submitEl) {
      submitEl.addEventListener("click", handleSubmit);
    }

    if (withdrawEl) {
      withdrawEl.addEventListener("click", (event) => {
        if (!allowWithdraw) return;
        handleWithdraw(event);
      });
      withdrawEl.style.display = allowWithdraw ? "" : "none";
    }

    console.debug("[DocumentUIWorkflow] mount", {
      direction,
      role,
      normalizedRole: role,
      status: currentStatus,
      route,
      allowWithdraw,
      optionsStatus: options.status,
      optionsRole: options.role,
      containerStatus: container.dataset.status,
      containerRole: container.dataset.role,
      finalStatus: currentStatus,
      actionMatrixStructure: {
        hasOutbound: !!ACTION_MATRIX.OUTBOUND,
        hasLD: !!ACTION_MATRIX.OUTBOUND?.LD,
        hasSubmitted: !!ACTION_MATRIX.OUTBOUND?.LD?.SUBMITTED,
        submittedActions: ACTION_MATRIX.OUTBOUND?.LD?.SUBMITTED,
      },
    });
    renderSteps();
    renderActions();

    return {
      update(newStatus) {
        if (!newStatus) {
          console.warn("[DocumentUIWorkflow] update called with empty status");
          return;
        }
        const previousStatus = currentStatus;
        currentStatus = canonicalStatus(newStatus, direction);
        console.debug("[DocumentUIWorkflow] update called", {
          newStatus,
          previousStatus,
          normalizedStatus: currentStatus,
        });
        renderSteps();
        renderActions();
      },
    };

    async function renderFields(actionValue) {
      if (!fieldsEl) return;
      const actionKey = actionValue || (selectEl ? selectEl.value : null);
      let fieldCfg = ACTION_FIELD_MAP[actionKey];
      fieldsEl.innerHTML = "";
      if (!fieldCfg) {
        fieldsEl.classList.add("hidden");
        return;
      }
      fieldsEl.classList.remove("hidden");
      
      // Support both single field object and array of fields
      const fields = Array.isArray(fieldCfg) ? fieldCfg : [fieldCfg];
      
      for (const field of fields) {
        const label = document.createElement("label");
        label.className = "block space-y-1";
        const hintText = `${field.label}${field.required ? " *" : ""}`;
        label.innerHTML = `<span class="text-[13px] font-medium text-slate-700">${hintText}</span>`;
        
        let control;
        if (field.type === "select") {
          control = document.createElement("select");
          control.className = "w-full h-10 rounded-md border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-500";
          
          // Add default option
          const defaultOpt = document.createElement("option");
          defaultOpt.value = "";
          defaultOpt.textContent = field.required ? "-- Chọn --" : "-- Không chọn --";
          control.appendChild(defaultOpt);
          
          // Fetch options
          if (field.apiMethod) {
            try {
              const api = window.ApiClient;
              const parts = field.apiMethod.split(".");
              let func = api;
              for (const p of parts) {
                if (func) func = func[p];
              }
              
              if (typeof func === "function") {
                const resp = await func(field.apiParams || {});
                const items = api.extractItems ? api.extractItems(resp) : (resp.items || resp.results || []);
                
                items.forEach((item) => {
                  const opt = document.createElement("option");
                  opt.value = field.optionValue ? item[field.optionValue] : item.id;
                  opt.textContent = field.optionLabel ? field.optionLabel(item) : (item.name || item.label);
                  control.appendChild(opt);
                });
              }
            } catch (err) {
              console.error(`Failed to fetch options for ${field.name}:`, err);
            }
          } else if (field.fetchUrl) {
            try {
              const api = window.ApiClient;
              const resp = await api.request(field.fetchUrl, { method: "GET" });
              const items = api.extractItems ? api.extractItems(resp) : (resp.items || resp.results || []);
              
              items.forEach((item) => {
                const opt = document.createElement("option");
                opt.value = field.optionValue ? item[field.optionValue] : item.id;
                opt.textContent = field.optionLabel ? field.optionLabel(item) : (item.name || item.label);
                control.appendChild(opt);
              });
            } catch (err) {
              console.error(`Failed to fetch options for ${field.name}:`, err);
            }
          } else if (field.options) {
            field.options.forEach((opt) => {
              const optionEl = document.createElement("option");
              optionEl.value = opt.value;
              optionEl.textContent = opt.label;
              control.appendChild(optionEl);
            });
          }
        } else if (field.type === "textarea") {
          control = document.createElement("textarea");
          control.rows = 3;
          control.className = "w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-500";
        } else {
          control = document.createElement("input");
          control.type = field.type || "text";
          control.className = "w-full h-10 rounded-md border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-500";
        }
        
        control.name = field.name;
        control.placeholder = field.placeholder || "";
        if (field.required) {
          control.required = true;
        }
        
        label.appendChild(control);
        fieldsEl.appendChild(label);
      }
    }

    function collectPayload(actionValue) {
      if (!fieldsEl) return {};
      const actionKey = actionValue || (selectEl ? selectEl.value : null);
      const fieldCfg = ACTION_FIELD_MAP[actionKey];
      if (!fieldCfg) return {};
      
      // Support both single field object and array of fields
      const fields = Array.isArray(fieldCfg) ? fieldCfg : [fieldCfg];
      const payload = {};
      let isValid = true;

      for (const field of fields) {
        const input = fieldsEl.querySelector(`[name="${field.name}"]`);
        const value = input ? String(input.value || "").trim() : "";

        if (field.required && !value) {
          if (messageEl) {
            messageEl.textContent = `Vui lòng nhập đầy đủ thông tin yêu cầu cho trường "${field.label}".`;
            messageEl.className = "text-[12.5px] text-rose-600 mt-2";
          }
          isValid = false;
          break;
        }
        if (value) {
          payload[field.name] = value;
        }
      }
      
      if (!isValid) {
        return false;
      }
      return payload;
    }
  }

  window.DocumentUIWorkflow = { mount };
})();
