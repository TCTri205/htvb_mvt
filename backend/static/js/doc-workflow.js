/* ===================================================================
   doc-workflow.js
   Shared inbound workflow renderer + action binder for all roles.
   =================================================================== */

(function (global) {
  const docHelpers = global.DocHelpers || {};
  const fallbackStateFlow = [
    { key: "tiep-nhan", label: "Tiếp nhận", transitionLabel: "Gán số đến", action: "register", next: "dang-ky" },
    { key: "dang-ky", label: "Đăng ký", transitionLabel: "Phân công", action: "assign", next: "phan-cong" },
    { key: "phan-cong", label: "Phân công", transitionLabel: "Bắt đầu xử lý", action: "start", next: "dang-xu-ly" },
    { key: "dang-xu-ly", label: "Đang xử lý", transitionLabel: "Hoàn tất", action: "complete", next: "hoan-tat" },
    { key: "hoan-tat", label: "Hoàn tất", transitionLabel: "Lưu trữ", action: "archive", next: "luu-tru" },
    { key: "luu-tru", label: "Lưu trữ", transitionLabel: "", action: null, next: null },
    { key: "thu-hoi", label: "Thu hồi", transitionLabel: "", action: null, next: null },
  ];
  const inboundStateFlow =
    typeof docHelpers.getInboundStateFlow === "function" ? docHelpers.getInboundStateFlow() : fallbackStateFlow;
  const inboundStateIndex = {};
  inboundStateFlow.forEach((item, idx) => {
    inboundStateIndex[item.key] = idx;
  });

  const ROLE_ALIAS = {
    vanthu: "VT",
    vt: "VT",
    chuyenvien: "CV",
    cv: "CV",
    lanhdao: "LD",
    ld: "LD",
    quantri: "QT",
    qt: "QT",
  };

  const ROLE_ACTIONS = {
    VT: {
      "tiep-nhan": ["register"],
      "dang-ky": ["assign"],
      "hoan-tat": ["archive"],
    },
    CV: {
      "phan-cong": ["start"],
      "dang-xu-ly": ["complete"],
    },
    LD: {
      "dang-ky": ["assign"],
      "dang-xu-ly": ["complete"],
    },
    QT: {
      "hoan-tat": ["archive"],
    },
  };

  const WITHDRAW_STATES = new Set(["dang-ky", "phan-cong", "dang-xu-ly"]);
  const WITHDRAW_ROLES = new Set(["QT"]);

  const ACTION_ENDPOINTS = {
    register: "register",
    assign: "assign",
    start: "start",
    complete: "complete",
    archive: "archive",
    withdraw: "withdraw",
  };

  function normalizeAssigneeList(raw) {
    if (raw == null) {
      return [];
    }
    if (Array.isArray(raw)) {
      return raw
        .map((item) => (item ?? "").toString().trim())
        .filter((item) => Boolean(item));
    }
    const text = typeof raw === "string" ? raw : String(raw);
    return text
      .split(/[\s,]+/)
      .map((item) => item.trim())
      .filter((item) => Boolean(item));
  }

  const ACTION_CONFIG = {
    register: {
      label: "Gán số đến",
      fields: [
        { name: "received_number", type: "number", label: "Số đến", required: true },
        { name: "received_date", type: "date", label: "Ngày đến", required: true },
        { name: "sender", type: "text", label: "Cơ quan gửi", required: true },
      ],
      buildPayload(values) {
        const numeric = String(values.received_number || "").replace(/\D/g, "");
        const number = Number.parseInt(numeric, 10);
        if (!Number.isFinite(number)) {
          throw new Error("Số đến không hợp lệ.");
        }
        if (!values.received_date) {
          throw new Error("Vui lòng chọn ngày đến.");
        }
        const sender = (values.sender || "").trim();
        if (!sender) {
          throw new Error("Vui lòng nhập cơ quan gửi.");
        }
        return {
          received_number: number,
          received_date: values.received_date,
          sender,
        };
      },
    },
    assign: {
      label: "Phân công",
      fields: [
        {
          name: "assignees",
          type: "specialist-picker",
          label: "Lựa chọn phân công",
          required: true,
        },
        { name: "due_at", type: "datetime-local", label: "Hạn xử lý", required: false },
      ],
      buildPayload(values) {
        const assignees = normalizeAssigneeList(values.assignees);
        if (!assignees.length) {
          throw new Error("Cần ít nhất 1 chuyên viên để phân công.");
        }
        const payload = { assignees };
        if (values.due_at) {
          const dueDate = new Date(values.due_at);
          if (Number.isNaN(dueDate.getTime())) {
            throw new Error("Hạn xử lý không hợp lệ.");
          }
          payload.due_at = dueDate.toISOString();
        }
        return payload;
      },
    },
    start: {
      label: "Bắt đầu xử lý",
      fields: [],
      buildPayload() {
        return {};
      },
    },
    complete: {
      label: "Hoàn tất",
      fields: [],
      buildPayload() {
        return {};
      },
    },
    archive: {
      label: "Lưu trữ",
      fields: [],
      buildPayload() {
        return {};
      },
    },
    withdraw: {
      label: "Thu hồi",
      fields: [],
      buildPayload() {
        return {};
      },
    },
  };

  function mapRoleCode(role) {
    if (!role) return "VT";
    const normalized = String(role).toLowerCase();
    return ROLE_ALIAS[normalized] || normalized.toUpperCase();
  }

  function sanitizeState(value) {
    if (value && Object.prototype.hasOwnProperty.call(inboundStateIndex, value)) {
      return value;
    }
    return "tiep-nhan";
  }

  function dispatchInboundAction(action, docId, payload) {
    if (!docId) {
      return Promise.reject(new Error("Thiếu document_id"));
    }
    const dispatcher = global.WorkflowActionDispatcher;
    if (!dispatcher || typeof dispatcher.submit !== "function") {
      return Promise.reject(
        new Error("WorkflowActionDispatcher không khả dụng. Hãy chắc chắn form MVT đã được hiển thị.")
      );
    }
    dispatcher.submit("vanbanden", docId, action, payload);
    return Promise.resolve();
  }

  function ensureInboundDocsClient(api) {
    if (!api) return null;
    const docApi = api.document || api.documents || null;
    if (!docApi) {
      return null;
    }
    const facade = {
      list(params) {
        return docApi.list({ ...(params || {}), direction: "INBOUND" });
      },
      retrieve(id, params) {
        if (!id) throw new Error("Thiếu document_id");
        return docApi.retrieve(id, params);
      },
      create(payload) {
        const client = window.ApiClient;
        if (!client || typeof client.request !== "function") {
          return Promise.reject(new Error("ApiClient không khả dụng để tạo văn bản."));
        }
        return client.request("/api/v1/inbound-docs/create/", {
          method: "POST",
          body: payload,
        });
      },
      receive(id, payload) {
        return dispatchInboundAction("receive", id, payload);
      },
      register(id, payload) {
        return dispatchInboundAction("register", id, payload);
      },
      assign(id, payload) {
        return dispatchInboundAction("assign", id, payload);
      },
      start(id, payload) {
        return dispatchInboundAction("start", id, payload);
      },
      complete(id, payload) {
        return dispatchInboundAction("complete", id, payload);
      },
      archive(id, payload) {
        return dispatchInboundAction("archive", id, payload);
      },
      withdraw(id, payload) {
        return dispatchInboundAction("withdraw", id, payload);
      },
      import(payload) {
        return docApi.import(payload, { direction: "INBOUND" });
      },
      export(params) {
        return docApi.export({ ...(params || {}), direction: "INBOUND" });
      },
    };
    return facade;
  }

  function resolveError(error) {
    if (docHelpers.resolveErrorMessage) {
      return docHelpers.resolveErrorMessage(error);
    }
    if (!error) return "Không thể thực hiện hành động.";
    if (error.data) {
      if (typeof error.data === "string") return error.data;
      if (error.data.detail) return String(error.data.detail);
      if (error.data.message) return String(error.data.message);
    }
    if (error.message) return String(error.message);
    return "Không thể thực hiện hành động.";
  }

  function determineAvailableActions(roleCode, stateKey, context) {
    const matrix = ROLE_ACTIONS[roleCode] || {};
    const base = Array.isArray(matrix[stateKey]) ? matrix[stateKey].slice() : [];
    if (WITHDRAW_STATES.has(stateKey) && WITHDRAW_ROLES.has(roleCode)) {
      base.push("withdraw");
    }
    return base.filter((action) => {
      if (action === "start" && !context.isAssignee) {
        return false;
      }
      if (action === "complete" && roleCode === "CV" && !context.isAssignee) {
        return false;
      }
      return true;
    });
  }

  function getStateMeta(key) {
    return inboundStateFlow.find((item) => item.key === key) || null;
  }

  function determineNextState(currentState, action) {
    if (action === "withdraw") {
      return "thu-hoi";
    }
    const meta = getStateMeta(currentState);
    if (meta && meta.action === action && meta.next) {
      return meta.next;
    }
    return currentState;
  }

  function normalizeDateValue(value) {
    if (!value) return "";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  }

  function normalizeDateTimeValue(value) {
    if (!value) return "";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
      return value.slice(0, 16);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}T${hours}:${minutes}`;
  }

  function createStepElement(step, status) {
    const li = document.createElement("li");
    li.className = "flex items-start gap-3";
    const statusClass =
      status === "done"
        ? "bg-emerald-500"
        : status === "current"
        ? "bg-blue-600"
        : status === "upcoming"
        ? "bg-slate-200"
        : "bg-slate-200";
    const statusText =
      status === "done" ? "Đã xong" : status === "current" ? "Đang thực hiện" : "Chưa thực hiện";
    li.innerHTML = [
      `<span class="mt-1 w-2.5 h-2.5 rounded-full ${statusClass}"></span>`,
      '<div class="flex-1 min-w-0">',
      `  <p class="text-[13px] font-semibold text-slate-800">${escapeHtml(step.label)}</p>`,
      step.transitionLabel
        ? `  <p class="text-[12px] text-slate-500">${escapeHtml(step.transitionLabel)}</p>`
        : "",
      `  <p class="text-[11px] uppercase tracking-wide text-slate-400 mt-1">${statusText}</p>`,
      "</div>",
    ]
      .filter(Boolean)
      .join("\n");
    return li;
  }

  function escapeHtml(value) {
    if (docHelpers.escapeHtml) {
      return docHelpers.escapeHtml(value);
    }
    return (value || "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function mount(options = {}) {
    const container = options.container;
    if (!container) {
      return null;
    }
    const refs = {
      steps: container.querySelector("[data-wf='steps']") || container.querySelector(".wf-steps"),
      actionSelect: container.querySelector("[data-wf='action-select']"),
      fields: container.querySelector("[data-wf='fields']"),
      submit: container.querySelector("[data-wf='submit']"),
      message: container.querySelector("[data-wf='message']"),
      withdrawToggle: container.querySelector("[data-wf='withdraw']"),
    };

    const state = {
      docId: options.docId,
      roleCode: mapRoleCode(options.role),
      api: options.api || ensureInboundDocsClient(options.apiClient || global.ApiClient),
      currentState: sanitizeState(options.stateKey),
      defaults: { ...(options.prefill || {}) },
      isAssignee: Boolean(options.isAssignee),
      onStateChange: typeof options.onStateChange === "function" ? options.onStateChange : null,
      currentAction: null,
    };

    state.specialists = [];
    state.specialistFilter = "";
    state.specialistSelections = new Set(normalizeAssigneeList(state.defaults.assignees));
    state.specialistLoading = false;
    state.specialistError = null;
    state.specialistPromise = null;

    if (refs.actionSelect) {
      refs.actionSelect.addEventListener("change", () => {
        state.currentAction = refs.actionSelect.value;
        renderFields();
      });
    }
    if (refs.submit) {
      refs.submit.addEventListener("click", (event) => {
        event.preventDefault();
        handleSubmit();
      });
    }
    if (refs.withdrawToggle) {
      refs.withdrawToggle.addEventListener("click", (event) => {
        event.preventDefault();
        if (!refs.actionSelect) return;
        const optionsList = Array.from(refs.actionSelect.options || []);
        const withdrawOption = optionsList.find((opt) => opt.value === "withdraw");
        if (withdrawOption) {
          refs.actionSelect.value = "withdraw";
          state.currentAction = "withdraw";
          renderFields();
        }
      });
    }

    renderSteps();
    renderActions();

    function renderSteps() {
      if (!refs.steps) return;
      const fragment = document.createDocumentFragment();
      const currentIdx = inboundStateIndex[state.currentState] ?? 0;
      inboundStateFlow.forEach((step, idx) => {
        let status = "upcoming";
        if (state.currentState === "thu-hoi") {
          status = step.key === "thu-hoi" ? "current" : "done";
        } else if (idx < currentIdx) {
          status = "done";
        } else if (idx === currentIdx) {
          status = "current";
        }
        fragment.appendChild(createStepElement(step, status));
      });
      refs.steps.innerHTML = "";
      refs.steps.appendChild(fragment);
    }

    function renderActions() {
      if (!refs.actionSelect) return;
      const available = determineAvailableActions(state.roleCode, state.currentState, state);
      refs.actionSelect.innerHTML = "";
      if (refs.withdrawToggle) {
        const canWithdraw = available.includes("withdraw");
        refs.withdrawToggle.disabled = !canWithdraw;
        refs.withdrawToggle.classList.toggle("opacity-60", !canWithdraw);
        refs.withdrawToggle.classList.toggle("cursor-not-allowed", !canWithdraw);
      }

      if (!available.length) {
        refs.actionSelect.disabled = true;
        state.currentAction = null;
        if (refs.fields) refs.fields.innerHTML = "";
        if (refs.submit) refs.submit.disabled = true;
        setMessage("Không có hành động phù hợp cho vai trò hiện tại.", "info");
        return;
      }
      refs.actionSelect.disabled = false;
      refs.submit && (refs.submit.disabled = false);
      available.forEach((action) => {
        const config = ACTION_CONFIG[action];
        const option = document.createElement("option");
        option.value = action;
        option.textContent = config ? config.label : action;
        refs.actionSelect.appendChild(option);
      });
      const first = available[0];
      refs.actionSelect.value = first;
      state.currentAction = first;
      renderFields();
    }

    function renderFields() {
      if (!refs.fields) return;
      refs.fields.innerHTML = "";
      const action = state.currentAction;
      const config = action ? ACTION_CONFIG[action] : null;
      if (!config || !config.fields || !config.fields.length) {
        refs.fields.classList.add("hidden");
        return;
      }
      refs.fields.classList.remove("hidden");
      config.fields.forEach((field) => {
        const wrapper = document.createElement("label");
        wrapper.className = "block space-y-1";
        const text =
          field.label ||
          ({
            received_number: "Số đến",
            received_date: "Ngày đến",
            sender: "Cơ quan gửi",
          }[field.name] || field.name);
        wrapper.innerHTML = `<span class="text-[13px] font-medium text-slate-700">${escapeHtml(text)}${
          field.required ? ' <span class="text-rose-600">*</span>' : ""
        }</span>`;
        let control;
        let hiddenField = null;
        if (field.type === "specialist-picker") {
          const picker = createSpecialistPicker(field);
          control = picker.container;
          hiddenField = picker.hiddenInput;
        } else {
          if (field.type === "textarea") {
            control = document.createElement("textarea");
            control.rows = 3;
          } else {
            control = document.createElement("input");
            control.type = field.type || "text";
          }
          control.dataset.wfField = field.name;
          control.className =
            "mt-1 w-full border border-slate-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-500";
          if (field.placeholder) {
            control.placeholder = field.placeholder;
          }
          const defaultValue = state.defaults[field.name];
          if (defaultValue) {
            if (field.type === "date") {
              control.value = normalizeDateValue(defaultValue);
            } else if (field.type === "datetime-local") {
              control.value = normalizeDateTimeValue(defaultValue);
            } else {
              control.value = defaultValue;
            }
          }
        }
        if (control) {
          wrapper.appendChild(control);
        }
        if (hiddenField) {
          wrapper.appendChild(hiddenField);
        }
        refs.fields.appendChild(wrapper);
      });
    }

    function createSpecialistPicker(field) {
      const container = document.createElement("div");
      container.className = "mt-1 space-y-2";
      const searchInput = document.createElement("input");
      searchInput.type = "search";
      searchInput.placeholder = "Tìm chuyên viên hoặc phòng ban";
      searchInput.value = state.specialistFilter;
      searchInput.className =
        "w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-600/20";
      const summaryEl = document.createElement("p");
      summaryEl.className = "text-[12px] text-slate-500";
      const listEl = document.createElement("div");
      listEl.className =
        "space-y-2 max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white p-3 text-slate-700";
      const hiddenInput = document.createElement("input");
      hiddenInput.type = "hidden";
      hiddenInput.dataset.wfField = field.name;
      searchInput.addEventListener("input", (event) => {
        state.specialistFilter = event.target.value;
        renderSpecialistList(listEl, hiddenInput, summaryEl);
      });
      container.appendChild(searchInput);
      container.appendChild(summaryEl);
      container.appendChild(listEl);
      renderSpecialistList(listEl, hiddenInput, summaryEl);
      ensureSpecialistsLoaded().then(() => renderSpecialistList(listEl, hiddenInput, summaryEl));
      syncSpecialistHiddenValue(hiddenInput);
      return { container, hiddenInput };
    }

    function ensureSpecialistsLoaded() {
      if (state.specialists.length) {
        return Promise.resolve(state.specialists);
      }
      if (state.specialistPromise) {
        return state.specialistPromise;
      }
      const client = global.ApiClient?.specialists;
      if (!client || typeof client.list !== "function") {
        state.specialistError = "Danh sách chuyên viên hiện không khả dụng.";
        return Promise.resolve([]);
      }
      state.specialistLoading = true;
      state.specialistError = null;
      state.specialistPromise = client
        .list()
        .then((payload) => {
          const items = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.results)
            ? payload.results
            : [];
          state.specialists = items
            .map((item) => ({
              user_id: item.user_id || item.id || item.userId,
              username: item.username || "",
              full_name: item.full_name || item.name || item.fullName || "",
              department_name:
                item.department_name ||
                (item.department && item.department.name) ||
                "",
              department_id:
                item.department_id ||
                (item.department && item.department.department_id) ||
                null,
            }))
            .filter((entry) => Boolean(entry.user_id));
          return state.specialists;
        })
        .catch((error) => {
          state.specialistError = resolveError(error);
          return [];
        })
        .finally(() => {
          state.specialistLoading = false;
          state.specialistPromise = null;
        });
      return state.specialistPromise;
    }

    function filterSpecialists(query) {
      const normalized = (query || "").trim().toLowerCase();
      if (!normalized) {
        return state.specialists;
      }
      return state.specialists.filter((item) => {
        return (
          (item.full_name && item.full_name.toLowerCase().includes(normalized)) ||
          (item.username && item.username.toLowerCase().includes(normalized)) ||
          (item.department_name && item.department_name.toLowerCase().includes(normalized))
        );
      });
    }

    function renderSpecialistList(listEl, hiddenInput, summaryEl) {
      if (!listEl) return;
      listEl.innerHTML = "";
      if (state.specialistLoading) {
        const hint = document.createElement("p");
        hint.className = "text-[12px] text-slate-500";
        hint.textContent = "Đang tải danh sách chuyên viên…";
        listEl.appendChild(hint);
        updateSpecialistSummary(summaryEl);
        return;
      }
      if (state.specialistError) {
        const hint = document.createElement("p");
        hint.className = "text-[12px] text-rose-600";
        hint.textContent = state.specialistError;
        listEl.appendChild(hint);
        updateSpecialistSummary(summaryEl);
        syncSpecialistHiddenValue(hiddenInput);
        return;
      }
      const items = filterSpecialists(state.specialistFilter);
      if (!items.length) {
        const hint = document.createElement("p");
        hint.className = "text-[12px] text-slate-500";
        hint.textContent = "Không có chuyên viên phù hợp.";
        listEl.appendChild(hint);
        updateSpecialistSummary(summaryEl);
        syncSpecialistHiddenValue(hiddenInput);
        return;
      }
      items.forEach((item) => {
        const row = document.createElement("label");
        row.className =
          "flex cursor-pointer items-start gap-2 rounded-md border border-slate-100 px-2 py-2 hover:border-slate-300";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = item.user_id;
        checkbox.checked = state.specialistSelections.has(String(item.user_id));
        checkbox.className =
          "mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:border-blue-500 focus:ring-blue-600";
        checkbox.addEventListener("change", () =>
          toggleSpecialistSelection(item.user_id, checkbox.checked, hiddenInput, summaryEl)
        );
        const info = document.createElement("div");
        info.className = "flex flex-col text-[13px]";
        const nameEl = document.createElement("span");
        nameEl.className = "font-medium text-slate-900";
        nameEl.textContent = item.full_name || item.username || "Chuyên viên";
        const deptEl = document.createElement("span");
        deptEl.className = "text-[12px] text-slate-500";
        deptEl.textContent = item.department_name || "Phòng ban đang cập nhật";
        info.appendChild(nameEl);
        info.appendChild(deptEl);
        row.appendChild(checkbox);
        row.appendChild(info);
        listEl.appendChild(row);
      });
      syncSpecialistHiddenValue(hiddenInput);
      updateSpecialistSummary(summaryEl);
    }

    function toggleSpecialistSelection(userId, selected, hiddenInput, summaryEl) {
      const normalized = (userId ?? "").toString().trim();
      if (!normalized) {
        return;
      }
      if (selected) {
        state.specialistSelections.add(normalized);
      } else {
        state.specialistSelections.delete(normalized);
      }
      syncSpecialistHiddenValue(hiddenInput);
      updateSpecialistSummary(summaryEl);
    }

    function syncSpecialistHiddenValue(hiddenInput) {
      if (!hiddenInput) return;
      hiddenInput.value = Array.from(state.specialistSelections).join(",");
    }

    function updateSpecialistSummary(summaryEl) {
      if (!summaryEl) return;
      const count = state.specialistSelections.size;
      summaryEl.textContent = count
        ? `Đã chọn ${count} chuyên viên`
        : "Chưa có chuyên viên nào được chọn.";
    }

    function collectValues() {
      if (!refs.fields) return {};
      const inputs = refs.fields.querySelectorAll("[data-wf-field]");
      const result = {};
      inputs.forEach((input) => {
        result[input.dataset.wfField] = input.value || "";
      });
      return result;
    }

    function handleSubmit() {
      if (!state.docId) {
        setMessage("Thiếu ID văn bản để thực hiện.", "error");
        return;
      }
      const action = state.currentAction;
      if (!action) {
        setMessage("Không có hành động để thực hiện.", "warn");
        return;
      }
      const endpoint = ACTION_ENDPOINTS[action];
      if (!endpoint) {
        setMessage("Hành động chưa được cấu hình.", "error");
        return;
      }
      const api = state.api;
      if (!api || typeof api[endpoint] !== "function") {
        setMessage("Chưa cấu hình API cho hành động này.", "error");
        return;
      }
      const config = ACTION_CONFIG[action];
      if (!config) {
        setMessage("Thiếu cấu hình hành động.", "error");
        return;
      }
      let payload = {};
      try {
        payload = config.buildPayload ? config.buildPayload(collectValues(), state) : {};
      } catch (err) {
        setMessage(err.message, "warn");
        return;
      }
      setLoading(true);
      api[endpoint](state.docId, payload)
        .then(() => {
          setMessage("Đã thực hiện hành động thành công.", "success");
          const nextState = determineNextState(state.currentState, action);
          if (nextState !== state.currentState) {
            state.currentState = nextState;
            renderSteps();
            renderActions();
          }
        if (state.onStateChange) {
          try {
            state.onStateChange(state.currentState, { action });
          } catch (_) {
            /* no-op */
          }
        }
        })
        .catch((error) => {
          setMessage(resolveError(error), "error");
        })
        .finally(() => {
          setLoading(false);
        });
    }

    function setMessage(message, type) {
      if (!refs.message) return;
      if (!message) {
        refs.message.textContent = "";
        refs.message.className = "";
        return;
      }
      const classes = ["text-[12.5px]", "mt-2"];
      if (type === "error") {
        classes.push("text-rose-600");
      } else if (type === "success") {
        classes.push("text-emerald-600");
      } else if (type === "warn") {
        classes.push("text-amber-600");
      } else {
        classes.push("text-slate-500");
      }
      refs.message.className = classes.join(" ");
      refs.message.textContent = message;
    }

    function setLoading(isLoading) {
      if (refs.submit) {
        refs.submit.disabled = isLoading;
        refs.submit.textContent = isLoading ? "Đang xử lý..." : "Thực hiện";
      }
      if (refs.actionSelect) {
        refs.actionSelect.disabled = isLoading;
      }
    }

    function update(payload = {}) {
      if (payload.stateKey) {
        state.currentState = sanitizeState(payload.stateKey);
        renderSteps();
      }
      if (payload.prefill && typeof payload.prefill === "object") {
        state.defaults = { ...state.defaults, ...payload.prefill };
      }
      if (Object.prototype.hasOwnProperty.call(payload, "isAssignee")) {
        state.isAssignee = Boolean(payload.isAssignee);
      }
      const availableBefore = state.currentAction;
      renderActions();
      if (availableBefore && state.currentAction === availableBefore) {
        renderFields();
      }
    }

    function setDefaults(prefill = {}) {
      state.defaults = { ...prefill };
      state.specialistSelections = new Set(normalizeAssigneeList(state.defaults.assignees));
      renderFields();
    }

    return {
      update,
      setDefaults,
    };
  }

  global.DocWorkflow = {
    mount,
    ensureInboundDocsClient,
    mapRoleCode,
  };
})(window);
