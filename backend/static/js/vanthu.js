/* ============================================================
   vanthu.js
   Auto-generated from inline scripts to centralize logic per trang
   Không chỉnh sửa trực tiếp trong HTML nữa.
============================================================ */

(function () {
  const pageHandlers = {};

  onReady(() => {
    const page = detectPage();
    setupSidebar();
    const globalHandlers =
      typeof window !== 'undefined' && window.pageHandlers ? window.pageHandlers : {};
    const handler =
      typeof globalHandlers[page] === 'function' ? globalHandlers[page] : pageHandlers[page];
    if (typeof handler === 'function') {
      handler();
    }
    if (!handler) {
      const detailHandler =
        typeof globalHandlers['vanbanden-detail'] === 'function'
          ? globalHandlers['vanbanden-detail']
          : pageHandlers['vanbanden-detail'];
      if (typeof detailHandler === 'function' && document.getElementById('doc-detail-meta')) {
        detailHandler();
      }
    }
  });

  function onReady(callback) {
    if (typeof callback !== 'function') return;
    const run = () => {
      if (window.Layout?.isReady) {
        callback();
        return;
      }
      if (window.Layout) {
        window.addEventListener('layout:ready', callback, { once: true });
        return;
      }
      callback();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
      run();
    }
  }

  function runAfterDom(callback) {
    if (typeof callback !== 'function') return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback, { once: true });
    } else {
      callback();
    }
  }

  function detectPage() {
    const path = (location.pathname || '').toLowerCase();
    if (path.includes('/vanbanden/') && !path.endsWith('.html')) {
      return 'vanbanden-detail';
    }
    const data = document.body?.dataset?.page;
    if (data) {
      const normalized = data.toLowerCase();
      if (normalized === 'dashboard-vanthu') return 'dashboard';
      return normalized;
    }
    const last = path.split('/').pop() || '';
    return last.replace(/\.html$/i, '');
  }

  function setupSidebar() {
    const btn = document.querySelector('#btnSidebar') || document.querySelector('#btn-sidebar');
    const sidebar = document.querySelector('#sidebar');
    if (!btn || !sidebar) return;
    btn.addEventListener('click', () => {
      const open = sidebar.classList.toggle('is-open');
      sidebar.classList.toggle('hidden', !open);
      btn.setAttribute('aria-expanded', String(open));
    });
  }

  function resolveInboundApi(client) {
    if (!client) return null;
    const workflowLib = window.DocWorkflow;
    if (workflowLib && typeof workflowLib.ensureInboundDocsClient === "function") {
      try {
        const api = workflowLib.ensureInboundDocsClient(client);
        if (api) {
          return api;
        }
      } catch (error) {
        console.warn("[vanthu] Không thể khởi tạo client văn bản đến:", error);
      }
    }
    const documentClient = client.document || client.documents || null;
    if (!documentClient) {
      return null;
    }
    return buildInboundDocsFacade(documentClient);
  }

  function buildInboundDocsFacade(documentClient) {
    const dispatcher = window.WorkflowActionDispatcher;

    const submitAction = (action, docId, payload) => {
      if (!dispatcher || typeof dispatcher.submit !== "function") {
        return Promise.reject(
          new Error("WorkflowActionDispatcher không khả dụng. Hãy chắc chắn form MVT đã được hiển thị.")
        );
      }
      dispatcher.submit("vanbanden", docId, action, payload);
      return Promise.resolve();
    };

    return {
      list(params) {
        return documentClient.list({ ...(params || {}), direction: "INBOUND" });
      },
      retrieve(id, params) {
        if (!id) throw new Error("Thiếu document_id");
        return documentClient.retrieve(id, params);
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
        return submitAction("receive", id, payload);
      },
      register(id, payload) {
        return submitAction("register", id, payload);
      },
      assign(id, payload) {
        return submitAction("assign", id, payload);
      },
      start(id) {
        return submitAction("start", id);
      },
      complete(id, payload) {
        return submitAction("complete", id, payload);
      },
      archive(id, payload) {
        return submitAction("archive", id, payload);
      },
      withdraw(id, payload) {
        return submitAction("withdraw", id, payload);
      },
      import(payload) {
        return documentClient.import(payload, { direction: "INBOUND" });
      },
      export(params) {
        return documentClient.export({ ...(params || {}), direction: "INBOUND" });
      },
    };
  }

  pageHandlers['baocaothongke'] = function () {
    if (typeof window.initVanThuAnalytics === 'function') {
      window.initVanThuAnalytics();
    } else {
      console.warn('Analytics module not loaded');
    }
  };

  pageHandlers['danhmuc'] = function () {
    const helper = window.CatalogPage && window.CatalogPage.initReadonlyCatalog;
    if (typeof helper === 'function') {
      helper();
    } else {
      console.warn('[vanthu] CatalogPage helper chưa sẵn sàng.');
    }

    // Cho phép gõ tìm kiếm nhanh từ ô search chung nếu có
    const localSearch = document.querySelector('#dm-search');
    const globalSearch = document.querySelector('#global-search');
    if (localSearch && globalSearch) {
      globalSearch.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        localSearch.value = event.target.value || '';
        localSearch.dispatchEvent(new Event('input'));
      });
    }
  };

  pageHandlers['dashboard'] = function () {
    if (typeof window.initVanThuDashboard === 'function') {
      window.initVanThuDashboard();
    } else {
      console.warn('[vanthu-dashboard] initVanThuDashboard not defined.');
    }
  };

  pageHandlers['hosocongviec'] = function () {
    const api = window.ApiClient;
    if (!api) {
      console.warn("[vanthu] ApiClient không sẵn sàng; bỏ qua hồ sơ công việc.");
      return;
    }

    const listContainer = document.getElementById("caseList");
    const txtSearch = document.getElementById("txtSearch");
    const selStatus = document.getElementById("selStatus");
    const selCategory = document.getElementById("selCategory");
    const kpiTotal = document.getElementById("kpi-total");
    const kpiCollect = document.getElementById("kpi-collect");
    const kpiDone = document.getElementById("kpi-done");
    const kpiDocs = document.getElementById("kpi-docs");
    const exportBtn = document.getElementById("btnExport");
    const createBtn = document.getElementById("btnCreate");
    const toast = document.getElementById("toast");

    if (!listContainer) {
      return;
    }

    const state = {
      keyword: "",
      status: "",
      category: "",
      statuses: [],
      caseTypes: [],
    };
    let cases = [];

    const STATUS_LABEL_OVERRIDES = {
      MOI_TAO: "Mới tạo",
      CHO_PHAN_CONG: "Chờ phân công",
      DA_PHAN_CONG: "Đã phân công",
      DANG_THUC_HIEN: "Đang thực hiện",
      TAM_DUNG: "Tạm dừng",
      CHO_DUYET_DONG: "Chờ duyệt đóng",
      DONG: "Đã đóng",
      LUU_TRU: "Lưu trữ",
      HOAN_TAT: "Hoàn tất",
    };
    const DONE_STATUS_KEYS = new Set(["HOAN_TAT", "DONG", "LUU_TRU"]);

    const layout = window.Layout || {};
    const ready =
      layout.authPromise && typeof layout.authPromise.then === "function"
        ? layout.authPromise
        : Promise.resolve();

    ready
      .then(() => {
        loadCaseMeta();
        return loadCases();
      })
      .catch(() => renderMessage("Không thể xác thực người dùng hiện tại."));

    async function loadCaseMeta() {
      try {
        await Promise.all([fetchCaseStatuses(), fetchCaseTypes()]);
      } catch (error) {
        console.error("[vanthu] lỗi tải dữ liệu phụ trợ hồ sơ:", error);
      } finally {
        renderStatusOptions();
        renderCategoryOptions();
      }
    }

    async function fetchCaseStatuses() {
      if (!api.catalog) return;
      try {
        const response = await api.catalog.list("case-statuses", { page_size: 200 });
        state.statuses = normalizeStatusEntries(response);
      } catch (error) {
        console.error("[vanthu] lỗi tải danh mục trạng thái hồ sơ:", error);
      }
    }

    async function fetchCaseTypes() {
      if (!api.catalog) return;
      try {
        const response = await api.catalog.list("case-types", { page_size: 200 });
        state.caseTypes = normalizeCaseTypeEntries(response);
      } catch (error) {
        console.error("[vanthu] lỗi tải danh mục loại hồ sơ:", error);
      }
    }

    function loadCases() {
      renderMessage("Đang tải hồ sơ công việc...");
      return api
        .cases.list({ ordering: "-created_at", page_size: 50 })
        .then((response) => {
          const items = Array.isArray(response)
            ? response
            : api.extractItems
            ? api.extractItems(response) || []
            : [];
          cases = Array.isArray(items) ? items : [];
          applyFilters();
        })
        .catch((error) => {
          console.error("[vanthu] lỗi tải hồ sơ công việc:", error);
          renderMessage("Không thể tải dữ liệu hồ sơ công việc.");
        });
    }

    function applyFilters() {
      const keyword = normalizeText(state.keyword);
      const filtered = cases.filter((item) => {
        if (!item) return false;
        const statusValue = getStatusFilterValue(item);
        const caseTypeValue = getCaseTypeValue(item);
        const matchesStatus = !state.status || state.status === statusValue;
        const matchesCategory = !state.category || state.category === caseTypeValue;
        const haystack = normalizeText(
          [
            item.case_code,
            item.title,
            item.status_name,
            item.status?.name,
            item.status?.case_status_name,
            item.department?.name,
            item.leader?.full_name,
          ]
            .filter(Boolean)
            .join(" ")
        );
        const matchesKeyword = !keyword || haystack.includes(keyword);
        return matchesStatus && matchesCategory && matchesKeyword;
      });
      renderList(filtered);
      updateKPIs(filtered);
    }

    function renderList(list) {
      if (!listContainer) return;
      if (!list.length) {
        renderEmpty();
        return;
      }
      listContainer.innerHTML = "";
      const fragment = document.createDocumentFragment();
      list.forEach((item) => fragment.appendChild(createCaseItem(item)));
      listContainer.appendChild(fragment);
      updateSummary(list.length);
    }

    function renderEmpty() {
      listContainer.innerHTML =
        '<li class="px-4 py-8 text-center text-sm text-slate-500">Không có hồ sơ nào phù hợp.</li>';
      updateSummary(0);
    }

    function renderMessage(message) {
      if (!listContainer) return;
      listContainer.innerHTML = `<li class="px-4 py-8 text-center text-sm text-slate-500">${escapeHtml(
        message
      )}</li>`;
      updateSummary(0);
    }

    function updateSummary(count) {
      if (kpiTotal) {
        kpiTotal.textContent = String(count || 0);
      }
    }

    function updateKPIs(list) {
      const filtered = Array.isArray(list) ? list : cases;
      const counts = filtered.reduce(
        (acc, item) => {
          const statusName =
            item.status_name ||
            item.status?.name ||
            item.status?.case_status_name ||
            "";
          const statusKey = statusKeyFromName(statusName);
          if (isDoneStatus(statusKey)) {
            acc.done += 1;
          } else {
            acc.processing += 1;
          }
          acc.docs += item.case_documents?.length || 0;
          return acc;
        },
        { processing: 0, done: 0, docs: 0 }
      );
      if (kpiCollect) kpiCollect.textContent = String(counts.processing);
      if (kpiDone) kpiDone.textContent = String(counts.done);
      if (kpiDocs) kpiDocs.textContent = String(counts.docs);
    }

    function createCaseItem(item) {
      const li = document.createElement("li");
      li.className =
        "bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-sm";
      const rawStatus =
        item.status_name ||
        item.status?.name ||
        item.status?.case_status_name ||
        "";
      const statusKey = statusKeyFromName(rawStatus);
      const statusLabel = getStatusLabelFromSource(rawStatus, statusKey);
      const statusValue = getStatusFilterValue(item);
      const caseTypeValue = getCaseTypeValue(item);
      const categoryLabel =
        item.case_type?.name || item.case_type_name || "Chưa phân loại";
      li.dataset.status = statusValue;
      li.dataset.category = caseTypeValue;
      li.dataset.key = normalizeText(
        [
          item.case_code,
          item.title,
          statusLabel,
          item.department?.name,
          categoryLabel,
        ]
          .filter(Boolean)
          .join(" ")
      );
      const priorityLabel = item.priority || "Trung bình";
      const dueDate = formatDate(item.due_date);
      const leader = item.leader?.full_name || item.leader?.username || "Chưa rõ";
      const department = item.department?.name || "Chưa có";
      const code = item.case_code || `HS-${item.case_id}`;
      const summary = item.description || item.goal || "";
      const badgeClass = isDoneStatus(statusKey) ? "chip chip--green" : "chip chip--blue";
      const statusBadge = `<span class="${badgeClass}">${escapeHtml(statusLabel)}</span>`;
      const priorityBadge = `<span class="text-[12px] text-slate-600 font-semibold">${escapeHtml(
        priorityLabel
      )}</span>`;
      li.innerHTML = [
        '<div class="flex items-center justify-between gap-2">',
        '  <div class="min-w-0">',
        `    <h4 class="text-[15px] font-semibold text-slate-800 truncate">${escapeHtml(
          item.title || "Hồ sơ công việc"
        )}</h4>`,
        "  </div>",
        '  <div class="flex items-center gap-2">',
        `    ${statusBadge}`,
        `    ${priorityBadge}`,
        "  </div>",
        "</div>",
        '<div class="text-[12px] text-slate-500 flex flex-wrap gap-3">',
        `  <span>HS: ${escapeHtml(code)}</span>`,
        `  <span>Phòng: ${escapeHtml(department)}</span>`,
        `  <span>Chủ trì: ${escapeHtml(leader)}</span>`,
        `  <span>Nhóm: ${escapeHtml(categoryLabel)}</span>`,
        dueDate ? `  <span>Hạn: ${escapeHtml(dueDate)}</span>` : "",
        "</div>",
        `<p class="text-[13px] text-slate-600 line-clamp-2">${escapeHtml(
          summary
        )}</p>`,
        '<div class="flex items-center justify-end gap-2">',
        `  <a href="/vanthu/hosocongviec/${encodeURIComponent(
          item.case_id || item.id || ""
        )}/" class="btn-icon text-blue-600 hover:bg-blue-50" title="Xem chi tiết">Chi tiết</a>`,
        "</div>",
      ]
        .filter(Boolean)
        .join("");
      return li;
    }

    function registerFilters() {
      const debounced = debounce(applyFilters, 150);
      if (txtSearch) {
        txtSearch.addEventListener("input", (event) => {
          state.keyword = event.target.value || "";
          debounced();
        });
      }
      if (selStatus) {
        selStatus.addEventListener("change", (event) => {
          state.status = event.target.value;
          applyFilters();
        });
      }
      if (selCategory) {
        selCategory.addEventListener("change", (event) => {
          state.category = event.target.value;
          applyFilters();
        });
      }
    }

    if (exportBtn) {
      exportBtn.addEventListener("click", () =>
        showToast("Chức năng xuất đang trong quá trình triển khai.")
      );
    }
    if (createBtn) {
      createBtn.addEventListener("click", () => {
        window.location.href = "/vanthu/hosocongviec-taomoi.html";
      });
    }

    function showToast(message) {
      if (!toast) {
        console.log(message);
        return;
      }
      toast.textContent = message;
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 1800);
    }

    function normalizeText(value) {
      return (value || "")
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .trim();
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
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return value.slice(0, 10);
      }
      return date.toISOString().slice(0, 10);
    }

    function isDoneStatus(key) {
      if (!key) return false;
      return DONE_STATUS_KEYS.has(key);
    }

    function statusKeyFromName(value) {
      const normalized = normalizeText(value);
      if (!normalized) return "";
      return normalized.replace(/\s+/g, "_").toUpperCase();
    }

    function getStatusLabelFromSource(raw, key) {
      const candidateKey = key || statusKeyFromName(raw);
      if (candidateKey && STATUS_LABEL_OVERRIDES[candidateKey]) {
        return STATUS_LABEL_OVERRIDES[candidateKey];
      }
      return raw || "Chưa xác định";
    }

    function getStatusFilterValue(item) {
      const statusRef = item.status || {};
      const statusId =
        statusRef.id ?? statusRef.case_status_id ?? item.status_id ?? "";
      if (statusId) {
        return String(statusId);
      }
      const fallbackName =
        item.status_name || statusRef.name || statusRef.case_status_name || "";
      return statusKeyFromName(fallbackName);
    }

    function getCaseTypeValue(item) {
      const caseType = item.case_type || {};
      if (caseType.id) return String(caseType.id);
      if (caseType.case_type_id) return String(caseType.case_type_id);
      return "";
    }

    function normalizeStatusEntries(payload) {
      const items = extractItemsFromResponse(payload);
      return items
        .map((entry) => {
          const rawName = (entry.name || entry.status_name || entry.case_status_name || "").trim();
          const key = statusKeyFromName(rawName);
          const id = entry.id ?? entry.case_status_id ?? "";
          const value = id ? String(id) : key;
          if (!value) return null;
          return { value, label: rawName || key || "Trạng thái", key };
        })
        .filter(Boolean);
    }

    function normalizeCaseTypeEntries(payload) {
      const items = extractItemsFromResponse(payload);
      return items
        .map((entry) => {
          const name = (entry.name || entry.case_type_name || "").trim();
          const id = entry.id ?? entry.case_type_id;
          if (!name || id == null) return null;
          return { value: String(id), label: name };
        })
        .filter(Boolean);
    }

    function extractItemsFromResponse(payload) {
      if (!payload) return [];
      if (Array.isArray(payload)) return payload;
      if (Array.isArray(payload.results)) return payload.results;
      if (Array.isArray(payload.items)) return payload.items;
      if (typeof api.extractItems === "function") {
        return api.extractItems(payload);
      }
      return [];
    }

    function renderStatusOptions() {
      if (!selStatus) return;
      const previous = selStatus.value;
      const options = [
        '<option value="">Tất cả trạng thái</option>',
        ...state.statuses.map(
          (status) =>
            `<option value="${escapeHtml(status.value)}">${escapeHtml(
              getStatusLabelFromSource(status.label, status.key)
            )}</option>`
        ),
      ].join("");
      selStatus.innerHTML = options;
      const found = Array.from(selStatus.options).some((opt) => opt.value === previous);
      if (previous && found) {
        selStatus.value = previous;
      } else {
        selStatus.value = "";
        state.status = "";
      }
    }

    function renderCategoryOptions() {
      if (!selCategory) return;
      const previous = selCategory.value;
      const options = [
        '<option value="">Tất cả nhóm</option>',
        ...state.caseTypes.map(
          (group) =>
            `<option value="${escapeHtml(group.value)}">${escapeHtml(group.label)}</option>`
        ),
      ].join("");
      selCategory.innerHTML = options;
      const found = Array.from(selCategory.options).some((opt) => opt.value === previous);
      if (previous && found) {
        selCategory.value = previous;
      } else {
        selCategory.value = "";
        state.category = "";
      }
    }

    function debounce(fn, delay) {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
      };
    }

    registerFilters();
  };

  pageHandlers['hosocongviec-detail'] = function () {
    const api = window.ApiClient;
    if (!api) {
      console.warn("[vanthu] ApiClient không sẵn sàng; bỏ qua tính năng theo dõi hồ sơ.");
      return;
    }

    const body = document.body;
    const queryId = new URLSearchParams(window.location.search).get("id");
    const caseId = body?.dataset?.caseId || queryId;
    if (!caseId) {
      console.warn("[vanthu] Thiếu case_id trong trang chi tiết hồ sơ.");
      return;
    }
    if (!body?.dataset?.caseId) {
      body.dataset.caseId = caseId;
    }

    const caseTitleEl = document.getElementById("case-title");
    const caseDescriptionEl = document.getElementById("case-description");
    const caseCodeEl = document.getElementById("case-code");
    const caseStatusEl = document.getElementById("case-status");
    const caseCreatedEl = document.getElementById("case-created");
    const caseOwnerEl = document.getElementById("case-owner");
    const caseDepartmentEl = document.getElementById("case-department");
    const caseDueEl = document.getElementById("case-due");
    const casePriorityEl = document.getElementById("case-priority");
    const caseTasksList = document.getElementById("case-tasks-list");
    const caseActivityList = document.getElementById("case-activity-list");
    const caseProgressCompleted = document.getElementById("case-progress-completed");
    const caseProgressOverdue = document.getElementById("case-progress-overdue");
    const caseProgressDocs = document.getElementById("case-progress-docs");
    const caseProgressPending = document.getElementById("case-progress-pending");

    const watchBtn = document.getElementById("btn-case-watch");
    const watchersList = document.getElementById("case-watchers-list");
    const watchersCount = document.getElementById("case-watchers-count");
    const toast = document.getElementById("toast");
    const storedUser = api.getCurrentUser ? api.getCurrentUser() : null;
    const currentUserId = storedUser?.id ?? storedUser?.user_id ?? storedUser?.userId;

    const state = { watching: false };

    function escapeHtml(value) {
      return (value || "")
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    async function refreshWatchers() {
      try {
        const participants = await api.cases.participants(caseId);
        const watchers = Array.isArray(participants)
          ? participants.filter((item) => item?.role_on_case === "watcher")
          : [];
        renderWatchers(watchers);
      } catch (error) {
        console.error("[vanthu] lỗi tải danh sách người theo dõi:", error);
      }
    }

    function renderWatchers(watchers) {
      const list = Array.isArray(watchers) ? watchers : [];
      if (watchersCount) {
        watchersCount.textContent = String(list.length);
      }
      if (watchersList) {
        if (!list.length) {
          watchersList.innerHTML =
            '<li class="text-[13px] text-slate-500">Chưa có người theo dõi hồ sơ.</li>';
        } else {
          watchersList.innerHTML = list
            .map((entry) => {
              const user = entry?.user;
              const name =
                user?.full_name || user?.username || user?.id || "Người dùng";
              return `<li class="flex items-center justify-between gap-2 text-[13px]">
                <span>${escapeHtml(name)}</span>
                <span class="chip chip--info">Đang theo dõi</span>
              </li>`;
            })
            .join("");
        }
      }
      state.watching = list.some(
        (entry) =>
          entry?.user &&
          (String(entry.user.id) === String(currentUserId) ||
            String(entry.user.user_id) === String(currentUserId))
      );
      updateWatchButton();
    }

    function updateWatchButton() {
      if (!watchBtn) return;
      watchBtn.textContent = state.watching ? "Bỏ theo dõi" : "Theo dõi hồ sơ";
      watchBtn.classList.toggle("bg-blue-600", !state.watching);
      watchBtn.classList.toggle("text-white", !state.watching);
      watchBtn.classList.toggle("bg-white", state.watching);
      watchBtn.classList.toggle("text-slate-900", state.watching);
    }

    async function toggleWatch() {
      if (!watchBtn) return;
      watchBtn.disabled = true;
      try {
        if (state.watching) {
          await api.cases.unwatch(caseId);
        } else {
          await api.cases.watch(caseId);
        }
        await refreshWatchers();
        showToast(
          state.watching ? "Bạn đang theo dõi hồ sơ." : "Đã bỏ theo dõi hồ sơ.",
          "success"
        );
      } catch (error) {
        console.error("[vanthu] lỗi thao tác theo dõi:", error);
        showToast(resolveErrorMessage(error), "error");
      } finally {
        watchBtn.disabled = false;
      }
    }

    function showToast(message, type = "info") {
      if (!toast) {
        console.log(message);
        return;
      }
      toast.textContent = message;
      toast.classList.remove("show", "toast--error", "toast--success", "toast--warn");
      if (type === "error") toast.classList.add("toast--error");
      else if (type === "success") toast.classList.add("toast--success");
      else if (type === "warn") toast.classList.add("toast--warn");
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 2200);
    }

    function resolveErrorMessage(error) {
      if (!error) return "Không thể thực hiện thao tác.";
      if (error.data) {
        if (typeof error.data === "string") return error.data;
        if (error.data.detail) return String(error.data.detail);
        if (error.data.message) return String(error.data.message);
      }
      if (error.message) return String(error.message);
      return "Không thể thực hiện thao tác.";
    }

    async function loadCaseDetail() {
      try {
        const detail = await api.cases.retrieve(caseId);
        renderCaseDetails(detail);
        const [tasks, logs] = await Promise.all([
          api.cases.tasks(caseId).catch(() => []),
          api.cases.activityLogs(caseId).catch(() => []),
        ]);
        const taskList = Array.isArray(tasks) ? tasks : [];
        renderCaseTasks(taskList);
        updateProgressStats(taskList, detail);
        renderCaseActivity(Array.isArray(logs) ? logs : []);
      } catch (error) {
        console.error("[vanthu] lỗi tải thông tin hồ sơ:", error);
      }
    }

    function renderCaseDetails(detail) {
      if (!detail) return;
      if (caseTitleEl) caseTitleEl.textContent = detail.title || "Hồ sơ công việc";
      if (caseDescriptionEl)
        caseDescriptionEl.textContent =
          detail.description || detail.goal || detail.instruction || "";
      if (caseCodeEl)
        caseCodeEl.textContent = detail.case_code || `HS-${detail.case_id}`;
      if (caseStatusEl)
        caseStatusEl.textContent =
          detail.status?.case_status_name || "Chưa xác định";
      if (caseCreatedEl) caseCreatedEl.textContent = formatDate(detail.created_at);
      if (caseOwnerEl)
        caseOwnerEl.textContent =
          detail.owner?.full_name || detail.owner?.username || "Chưa rõ";
      if (caseDepartmentEl)
        caseDepartmentEl.textContent =
          detail.department?.name || detail.department?.department_code || "";
      if (caseDueEl) caseDueEl.textContent = formatDate(detail.due_date);
      if (casePriorityEl) casePriorityEl.textContent = detail.priority || "Trung bình";
      if (caseProgressDocs)
        caseProgressDocs.textContent = String(getDocumentCount(detail));
    }

    function formatDate(value) {
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return value.slice(0, 10);
      }
      return date.toISOString().slice(0, 10);
    }

    function renderCaseTasks(tasks) {
      if (!caseTasksList) return;
      if (!tasks.length) {
        caseTasksList.innerHTML =
          '<li class="text-[13px] text-slate-500">Chưa có nhiệm vụ liên quan.</li>';
        return;
      }
      caseTasksList.innerHTML = tasks
        .map((task) => {
          const title = escapeHtml(task.title || "Nhiệm vụ");
          const status = (task.status || task.status_name || "").toString();
          const due = formatDate(task.due_at || task.due_date);
          const assignee =
            task.assignee?.full_name || task.assignee?.username || "Chưa rõ";
          const badgeClass = status.toLowerCase().includes("done")
            ? "chip chip--green"
            : "chip chip--default";
          return `<li class="rounded-lg border border-slate-100 p-3">
            <div class="flex items-center justify-between gap-2">
              <div>
                <div class="font-medium text-slate-700">${title}</div>
                <div class="text-[12px] text-slate-500">Phụ trách: ${escapeHtml(
                  assignee
                )} · Hạn: ${escapeHtml(due || "Chưa có")}</div>
              </div>
              <span class="${badgeClass}">${escapeHtml(status || "Chờ xử lý")}</span>
            </div>
          </li>`;
        })
        .join("");
    }

    function renderCaseActivity(logs) {
      if (!caseActivityList) return;
      if (!logs.length) {
        caseActivityList.innerHTML =
          '<li class="text-[13px] text-slate-500">Chưa có hoạt động nào.</li>';
        return;
      }
      caseActivityList.innerHTML = logs
        .map((log) => {
          const actor =
            log.actor?.full_name || log.actor?.username || "Hệ thống";
          const time = formatDate(log.at || log.created_at);
          const action = log.action || log.activity || "Hoạt động";
          const note = log.note || log.meta || log.comment || "";
          return `<li class="rounded-lg border border-slate-100 p-3">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-slate-700">${time}</span>
              <span class="text-[12px] text-slate-500">${escapeHtml(actor)}</span>
            </div>
            <div class="text-[13px] text-slate-600 mt-1">${escapeHtml(
              action
            )}</div>
            ${
              note
                ? `<p class="mt-2 text-[12px] text-slate-500">${escapeHtml(
                    note
                  )}</p>`
                : ""
            }
          </li>`;
        })
        .join("");
    }

    function updateProgressStats(tasks, detail) {
      const list = Array.isArray(tasks) ? tasks : [];
      const total = list.length;
      const completed = list.filter((task) =>
        (task.status || task.status_name || "")
          .toString()
          .toLowerCase()
          .includes("done")
      ).length;
      const pending = list.filter((task) => {
        const status = (task.status || task.status_name || "")
          .toString()
          .toLowerCase();
        return (
          status.includes("pending") ||
          status.includes("open") ||
          (status && !status.includes("done"))
        );
      }).length;
      const overdue = list.filter((task) => {
        const due = new Date(task.due_at || task.due_date || task.deadline);
        return (
          due instanceof Date &&
          !Number.isNaN(due.getTime()) &&
          Date.now() > due.getTime() &&
          !(
            (task.status || task.status_name || "")
              .toString()
              .toLowerCase()
              .includes("done")
          )
        );
      }).length;
      if (caseProgressCompleted)
        caseProgressCompleted.textContent = `${completed} / ${total}`;
      if (caseProgressPending) caseProgressPending.textContent = String(pending);
      if (caseProgressOverdue) caseProgressOverdue.textContent = String(overdue);
      if (caseProgressDocs) caseProgressDocs.textContent = String(getDocumentCount(detail));
    }

    function getDocumentCount(detail) {
      if (!detail) return 0;
      if (Array.isArray(detail.documents)) return detail.documents.length;
      if (Array.isArray(detail.case_documents)) return detail.case_documents.length;
      if (typeof detail.case_documents_count === "number")
        return detail.case_documents_count;
      return 0;
    }

    if (watchBtn) {
      watchBtn.addEventListener("click", toggleWatch);
    }

    refreshWatchers();
    loadCaseDetail();
  };

  pageHandlers['taikhoan'] = function () {
    const qs = (s, r = document) => r.querySelector(s);
            const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));
            const getApiClient = () => window.ApiClient || null;

            // Simple toast (fallback if shared one not present)
            function toast(msg, type = "info") {
              const t = qs("#toast");
              if (!t) return alert(msg);
              t.textContent = msg;
              t.classList.remove(
                "toast--show",
                "toast--success",
                "toast--error",
                "toast--warn"
              );
              t.classList.add("toast--show");
              if (type === "success") t.classList.add("toast--success");
              else if (type === "error") t.classList.add("toast--error");
              else if (type === "warn") t.classList.add("toast--warn");
              setTimeout(() => t.classList.remove("toast--show"), 2000);
            }

            // Sidebar toggle on small screens if header has a menu button (optional)
            qsa("#btn-sidebar").forEach((btn) => {
              btn.addEventListener("click", () =>
                qs("#sidebar")?.classList.toggle("hidden")
              );
            });

            // ---------- Profile edit / save ----------
            const btnEdit = qs("#btnEdit");
            const btnSave = qs("#btnSave");
            const btnCancel = qs("#btnCancel");

            const inputs = ["#inpName", "#inpEmail", "#inpPhone", "#inpDept"].map(
              (id) => qs(id)
            );
            const displayName = qs("#displayName");
            const displayRole = qs("#displayRole");
            const displayUsername = qs("#displayUsername");
            const displaySince = qs("#displaySince");
            const avatarEl = qs("[data-avatar-initials]");
            const layout = window.Layout || null;

            let snapshot = {};

            const textInputs = {
              name: qs("#inpName"),
              email: qs("#inpEmail"),
              phone: qs("#inpPhone"),
              department: qs("#inpDept"),
            };

            function deriveInitials(value) {
              const raw = (value || "").trim();
              if (!raw) return "--";
              const parts = raw.split(/\s+/).filter(Boolean);
              if (!parts.length) return raw.slice(0, 2).toUpperCase();
              if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
              const first = parts[0][0] || "";
              const last = parts[parts.length - 1][0] || "";
              return (first + last).toUpperCase();
            }

            function applyUserProfile(user) {
              if (!user) return;
              const fullName = (user.full_name || user.name || "").trim();
              const username = (user.username || "").trim();
              const email = (user.email || "").trim();
              const phone = (user.phone || "").trim();
              const department =
                (user.department_name || user.department || "").trim();
              const roleLabel = user.role_name || user.role || displayRole?.textContent;
              const createdAt = user.created_at;

              if (displayName) {
                displayName.textContent = fullName || username || displayName.textContent;
              }
              if (displayRole && roleLabel) {
                displayRole.textContent = roleLabel;
              }
              if (displayUsername) {
                displayUsername.textContent = username ? `@${username}` : displayUsername.textContent;
              }
              if (displaySince && createdAt) {
                const date = new Date(createdAt);
                if (!Number.isNaN(date.getTime())) {
                  displaySince.textContent = `Tài khoản tạo ngày ${date.toLocaleDateString(
                    "vi-VN"
                  )}`;
                }
              }

              if (textInputs.name) textInputs.name.value = fullName || "";
              if (textInputs.email) textInputs.email.value = email || "";
              if (textInputs.phone) textInputs.phone.value = phone || "";
              if (textInputs.department) textInputs.department.value = department || "";

              if (avatarEl) {
                const initials =
                  user.initials ||
                  layout?.userDisplay?.initials ||
                  deriveInitials(fullName || username);
                avatarEl.textContent = initials || "--";
              }
            }

            function memoizeProfile() {
              if (!layout) return;
              if (layout.user) {
                applyUserProfile(layout.user);
              }
              if (typeof layout.ensureUser === "function") {
                layout
                  .ensureUser()
                  .then((user) => {
                    if (user) applyUserProfile(user);
                  })
                  .catch(() => {});
              }
            }

            function setEditMode(on) {
              inputs.forEach((el) => (el.disabled = !on));
              btnEdit.classList.toggle("hidden", on);
              btnSave.classList.toggle("hidden", !on);
              btnCancel.classList.toggle("hidden", !on);
            }

            btnEdit?.addEventListener("click", () => {
              // take snapshot
              snapshot = Object.fromEntries(inputs.map((el) => [el.id, el.value]));
              setEditMode(true);
              inputs[0]?.focus();
            });

            btnCancel?.addEventListener("click", () => {
              // restore
              inputs.forEach((el) => {
                if (snapshot[el.id] != null) el.value = snapshot[el.id];
              });
              setEditMode(false);
              toast("Đã huỷ thay đổi.");
            });

            async function handleProfileSave() {
              const email = qs("#inpEmail").value.trim();
              const name = qs("#inpName").value.trim();
              const phone = qs("#inpPhone").value.trim();
              console.debug("[vanthu] handleProfileSave invoked", { name, email, phone });

              if (!name) return toast("Vui lòng nhập họ và tên.", "error");
              if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                return toast("Email không hợp lệ.", "error");

              const apiClient = getApiClient();
              if (!apiClient || typeof apiClient.updateProfile !== "function") {
                toast("Không thể lưu thông tin hiện tại.", "error");
                return;
              }

              const originalLabel = btnSave?.textContent || "Lưu thay đổi";
              setEditMode(false);
              btnSave.disabled = true;
              btnSave.textContent = "Đang lưu...";
              try {
                const updatedUser = await apiClient.updateProfile({
                  full_name: name,
                  email,
                  phone,
                });
                if (updatedUser) {
                  if (layout) {
                    layout.user = updatedUser;
                  }
                  applyUserProfile(updatedUser);
                }
                toast("Đã lưu thông tin tài khoản.", "success");
              } catch (err) {
                const message =
                  err?.data?.detail ||
                  (err && err.message) ||
                  "Không thể lưu thông tin. Vui lòng thử lại.";
                toast(message, "error");
              } finally {
                btnSave.disabled = false;
                btnSave.textContent = originalLabel;
              }
            }

            btnSave?.addEventListener("click", handleProfileSave);

            // ---------- Password modal ----------
            const modal = qs("#pwdModal");
            const openPwd = qs("#btnOpenPwd");
            const closePwd = qs("#pwdClose");
            const cancelPwd = qs("#pwdCancel");
            const curPwd = qs("#curPwd");
            const newPwd = qs("#newPwd");
            const cfmPwd = qs("#cfmPwd");
            const pwdLast = qs("#pwdLastChanged");
            const pwdForm = qs("#pwdForm");
            const submitPwd = qs("#pwdSubmit");

            function openModal() {
              modal?.classList.remove("hidden");
              setTimeout(() => curPwd?.focus(), 10);
            }
            function closeModal() {
              modal?.classList.add("hidden");
              resetPasswordInputs();
            }

            function resetPasswordInputs() {
              [curPwd, newPwd, cfmPwd].forEach((input) => {
                if (input) input.value = "";
              });
            }

            openPwd?.addEventListener("click", openModal);
            closePwd?.addEventListener("click", closeModal);
            cancelPwd?.addEventListener("click", closeModal);
            modal?.addEventListener("click", (e) => {
              if (e.target === modal) closeModal();
            });

            const logPrefix = "[vanthu]";
            function getSubmitButton() {
              return submitPwd || pwdForm?.querySelector('button[type="submit"]');
            }

            async function handlePasswordSubmit(event) {
              if (event) event.preventDefault();
              console.info(`${logPrefix} password submit triggered`);
              const current = curPwd?.value?.trim() || "";
              const next = newPwd?.value?.trim() || "";
              const confirm = cfmPwd?.value?.trim() || "";

              console.info(`${logPrefix} payload`, {
                hasCurrent: Boolean(current),
                newPasswordLength: next.length,
              });

              if (!current || !next || !confirm) {
                toast("Vui lòng nhập đầy đủ thông tin.", "error");
                return;
              }
              if (next.length < 8) {
                toast("Mật khẩu mới tối thiểu 8 ký tự.", "error");
                return;
              }
              if (next !== confirm) {
                toast("Xác nhận mật khẩu chưa khớp.", "error");
                return;
              }
              if (next === current) {
                toast("Mật khẩu mới không được trùng mật khẩu hiện tại.", "error");
                return;
              }

              const apiClient = getApiClient();
              if (!apiClient || typeof apiClient.changePassword !== "function") {
                console.warn(`${logPrefix} ApiClient unavailable`);
                toast("Không thể đổi mật khẩu tại thời điểm này.", "error");
                return;
              }

              const submitBtn = getSubmitButton();
              if (submitBtn) submitBtn.disabled = true;
              try {
                console.info(`${logPrefix} calling changePassword API`);
                await apiClient.changePassword({
                  current_password: current,
                  new_password: next,
                  new_password_confirm: confirm,
                });
                const today = new Date();
                const dd = String(today.getDate()).padStart(2, "0");
                const mm = String(today.getMonth() + 1).padStart(2, "0");
                const yyyy = today.getFullYear();
                if (pwdLast) {
                  pwdLast.textContent = `${dd}/${mm}/${yyyy}`;
                }
                toast("Đã cập nhật mật khẩu.", "success");
                closeModal();
              } catch (err) {
                console.error(`${logPrefix} changePassword failed`, err);
                const message =
                  err?.data?.detail ||
                  err?.message ||
                  "Không thể đổi mật khẩu. Vui lòng thử lại.";
                toast(message, "error");
              } finally {
                if (submitBtn) submitBtn.disabled = false;
              }
            }

            console.info(`${logPrefix} binding password handler`);
            pwdForm?.addEventListener("submit", handlePasswordSubmit);

            // ---------- Sign-in history (demo data) ----------
            const signinList = qs("#signinList");

            function escapeHtml(value) {
              const text = String(value || "");
              const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
              return text.replace(/[&<>"']/g, (ch) => map[ch] || ch);
            }

            function formatDateTime(value) {
              if (!value) return null;
              const date = new Date(value);
              if (Number.isNaN(date.getTime())) return null;
              return date.toLocaleString("vi-VN");
            }

            function renderSessions(records = []) {
              if (!signinList) return;
              const sessions = Array.isArray(records) ? records : [];
              if (!sessions.length) {
                signinList.innerHTML =
                  '<li class="px-4 py-3 text-[13px] text-slate-500">Chưa có phiên đăng nhập nào.</li>';
                return;
              }
              const apiClient = getApiClient();
              const currentSession =
                apiClient && typeof apiClient.getSessionId === "function"
                  ? apiClient.getSessionId()
                  : null;
              signinList.innerHTML = sessions
                .map((session) => {
                  const sessionId = String(session.session_id || session.id || "");
                  if (!sessionId) return "";
                  const issued = formatDateTime(session.issued_at || session.issuedAt);
                  const expires = formatDateTime(session.expires_at || session.expiresAt);
                  const device = session.user_agent || session.device || "Trình duyệt không xác định";
                  const ip = session.ip || "IP ẩn danh";
                  const revoked = Boolean(session.revoked);
                  const isCurrent =
                    currentSession && currentSession.toString() === sessionId.toString();
                  const badgeClass = revoked
                    ? "chip chip--rose"
                    : isCurrent
                    ? "chip chip--blue"
                    : "chip chip--green";
                  const badgeLabel = revoked
                    ? "Đã thu hồi"
                    : isCurrent
                    ? "Phiên hiện tại"
                    : "Hoạt động";
                  const safeId = sessionId.replace(/["']/g, "");
                  const actionButton =
                    !revoked && !isCurrent
                      ? `<button type="button" data-revoke-session="${safeId}" class="text-[12px] text-slate-900 hover:underline">Thu hồi</button>`
                      : "";
                  return `
                    <li class="px-4 py-3 flex items-center justify-between">
                      <div>
                        <div class="font-medium text-[13.5px]">${escapeHtml(device)}</div>
                        <div class="text-[12px] text-slate-500">
                          ${issued ? `Đăng nhập lúc ${escapeHtml(issued)}` : "Thời điểm không xác định"}
                          ${ip ? ` • IP ${escapeHtml(ip)}` : ""}
                        </div>
                        ${
                          expires
                            ? `<div class="text-[11px] text-slate-400">Hết hạn ${escapeHtml(
                                expires
                              )}</div>`
                            : ""
                        }
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="${badgeClass}">${badgeLabel}</span>
                        ${actionButton}
                      </div>
                    </li>
                  `;
                })
                .join("");
            }

            async function loadSessions() {
              if (!signinList) return;
              const apiClient = getApiClient();
              if (!apiClient || typeof apiClient.listSessions !== "function") {
                renderSessions();
                return;
              }
              signinList.innerHTML =
                '<li class="px-4 py-3 text-[13px] text-slate-500">Đang tải phiên đăng nhập...</li>';
              try {
                const records = await apiClient.listSessions();
                renderSessions(records);
              } catch (err) {
                console.error("[vanthu] loadSessions failed", err);
                signinList.innerHTML =
                  '<li class="px-4 py-3 text-[13px] text-rose-600">Không thể tải lịch sử đăng nhập.</li>';
              }
            }

            signinList?.addEventListener("click", async (event) => {
              const button = event.target.closest("[data-revoke-session]");
              if (!button) return;
              const sessionId = button.dataset.revokeSession;
              const apiClient = getApiClient();
              if (!sessionId || !apiClient || typeof apiClient.revokeSession !== "function") return;
              button.disabled = true;
              try {
                await apiClient.revokeSession(sessionId);
                toast("Đã thu hồi phiên đăng nhập.", "success");
                await loadSessions();
              } catch (err) {
                const message =
                  err?.data?.detail || err?.message || "Không thể thu hồi phiên đăng nhập.";
                toast(message, "error");
              } finally {
                button.disabled = false;
              }
            });

            memoizeProfile();
            loadSessions();

            const logoutBtn = qs("#btnLogout");
            if (logoutBtn) {
              logoutBtn.dataset.action = logoutBtn.dataset.action || "logout";
              logoutBtn.dataset.logoutConfirm =
                logoutBtn.dataset.logoutConfirm || "Bạn có chắc muốn đăng xuất?";
              window.Layout?.setupLogoutHandler?.();
            }
  };

  pageHandlers['thongbaonhacviec'] = function () {
    const qs = (s, r = document) => r.querySelector(s);
    const qsa = (s, r = document) => Array.from(r.querySelectorAll(s));

    // Sidebar toggle (mobile)
    qs("#btn-sidebar")?.addEventListener("click", () => {
      qs("#sidebar")?.classList.toggle("hidden");
    });

    const tabNoti = qs("#tab-noti");
    const tabRemind = qs("#tab-remind");
    const blockNoti = qs("#block-noti");
    const blockRemind = qs("#block-remind");
    const listNoti = qs("#list-noti");
    const listRemind = qs("#list-remind");
    const emptyNoti = qs("#noti-empty");
    const emptyRemind = qs("#remind-empty");
    const searchBox = qs("#searchBox");
    const filterType = qs("#filterType");
    const filterPriority = qs("#filterPriority");
    const kpiTotal = qs("#kpi-total");
    const kpiIncoming = qs("#kpi-incoming");
    const kpiOutgoing = qs("#kpi-outgoing");
    const kpiUnread = qs("#kpi-unread");

    const state = {
      notifications: [],
      reminders: [],
      tab: "noti",
      loading: false,
    };

    const escapeHtmlLocal = (value) => {
      const helper = window.Layout?.helpers?.escapeHtml;
      if (typeof helper === "function") {
        return helper(value);
      }
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    };

    const toast = (msg) => {
      const t = qs("#toast");
      if (!t) return;
      t.textContent = msg;
      t.classList.add("show");
      setTimeout(() => t.classList.remove("show"), 1800);
    };

    const channelLabel = (value) => {
      const map = {
        app: "Ứng dụng",
        email: "Email",
        sms: "SMS",
        push: "Push",
      };
      return map[value?.toLowerCase?.() || ""] || "Khác";
    };

    const entityLabel = (value) => {
      const map = {
        document: "Văn bản",
        case: "Hồ sơ",
        task: "Công việc",
      };
      return map[value?.toLowerCase?.() || ""] || "Nhắc việc";
    };

    function setLoading(isLoading) {
      state.loading = isLoading;
      const placeholder =
        '<li class="px-4 py-6 text-sm text-slate-500">Đang tải dữ liệu...</li>';
      if (isLoading) {
        if (listNoti) listNoti.innerHTML = placeholder;
        if (listRemind) listRemind.innerHTML = placeholder;
      }
    }

    function updateFilterOptions() {
      if (!filterType || !filterPriority) return;
      if (state.tab === "noti") {
        const channels = Array.from(
          new Set(state.notifications.map((n) => (n.channel || "other").toLowerCase()))
        );
        filterType.innerHTML = `<option value="all">Tất cả kênh</option>` + channels
          .map((ch) => `<option value="${escapeHtmlLocal(ch)}">${escapeHtmlLocal(channelLabel(ch))}</option>`)
          .join("");
        filterPriority.innerHTML = `
          <option value="all">Tất cả trạng thái</option>
          <option value="unread">Chưa đọc</option>
          <option value="read">Đã đọc</option>
        `;
      } else {
        const entities = Array.from(
          new Set(state.reminders.map((r) => (r.entityType || "other").toLowerCase()))
        );
        filterType.innerHTML = `<option value="all">Tất cả loại</option>` + entities
          .map((et) => `<option value="${escapeHtmlLocal(et)}">${escapeHtmlLocal(entityLabel(et))}</option>`)
          .join("");
        filterPriority.innerHTML = `
          <option value="all">Tất cả trạng thái</option>
          <option value="PENDING">Đang chờ</option>
          <option value="SENT">Đã gửi</option>
          <option value="CLEARED">Đã kết thúc</option>
        `;
      }
    }

    function applyFilters(items, kind) {
      const keyword = (searchBox?.value || "").toLowerCase().trim();
      const typeVal = filterType?.value || "all";
      const statusVal = filterPriority?.value || "all";

      return items.filter((item) => {
        const text = `${item.title || ""} ${item.body || ""}`.toLowerCase();
        const matchesText = !keyword || text.includes(keyword);
        let matchesType = true;
        let matchesStatus = true;

        if (kind === "noti") {
          const channel = (item.channel || "other").toLowerCase();
          matchesType = typeVal === "all" || channel === typeVal;
          if (statusVal === "unread") matchesStatus = !item.readAt;
          else if (statusVal === "read") matchesStatus = !!item.readAt;
        } else {
          const entity = (item.entityType || "other").toLowerCase();
          matchesType = typeVal === "all" || entity === typeVal;
          if (statusVal !== "all") {
            matchesStatus =
              (item.status || "").toUpperCase() === statusVal.toUpperCase();
          }
        }
        return matchesText && matchesType && matchesStatus;
      });
    }

    function renderNotificationItem(item) {
      const unreadDot = item.readAt
        ? ""
        : '<span class="w-2 h-2 rounded-full bg-amber-500 inline-block ml-2" title="Chưa đọc"></span>';
      const statusChip = item.readAt
        ? '<span class="rounded-full px-2.5 py-0.5 bg-slate-100 text-slate-700 font-medium">Đã đọc</span>'
        : '<span class="rounded-full px-2.5 py-0.5 bg-amber-50 text-amber-700 font-medium">Chưa đọc</span>';
      const sentAt = window.NotificationApi?.formatDateTime(item.sentAt) || "";
      return `
        <li class="px-4 py-3 flex items-start justify-between gap-4 hover:bg-slate-50/60" data-id="${escapeHtmlLocal(item.id)}">
          <div class="min-w-0">
            <p class="font-medium line-clamp-1">${escapeHtmlLocal(item.title)}${unreadDot}</p>
            <p class="text-[12.5px] text-slate-500 mt-0.5 line-clamp-1">${escapeHtmlLocal(item.body || "")}</p>
            <div class="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
              <span class="rounded-full px-2.5 py-0.5 bg-blue-50 text-blue-700 font-medium">${escapeHtmlLocal(channelLabel(item.channel))}</span>
              ${statusChip}
              ${sentAt ? `<span class="text-slate-400">🗓 ${escapeHtmlLocal(sentAt)}</span>` : ""}
            </div>
          </div>
          <div class="shrink-0 flex items-center gap-2">
            <button class="btn-outline mark-read" type="button" title="Đánh dấu đã đọc">👁 Đã đọc</button>
          </div>
        </li>
      `;
    }

    function renderReminderItem(item) {
      const status = (item.status || "").toUpperCase();
      const statusMap = {
        PENDING: { cls: "bg-amber-50 text-amber-700", label: "Đang chờ" },
        SENT: { cls: "bg-emerald-50 text-emerald-700", label: "Đã gửi" },
        CLEARED: { cls: "bg-slate-100 text-slate-700", label: "Đã kết thúc" },
      };
      const stat = statusMap[status] || { cls: "bg-slate-100 text-slate-700", label: status || "Trạng thái" };
      const dueAt = window.NotificationApi?.formatDateTime(item.dueAt) || "";
      const lastNotified = window.NotificationApi?.formatDateTime(item.lastNotifiedAt) || "";
      return `
        <li class="px-4 py-3 flex items-start justify-between gap-4 hover:bg-amber-50/40" data-id="${escapeHtmlLocal(item.id)}">
          <div class="min-w-0">
            <p class="font-medium line-clamp-1">${escapeHtmlLocal(entityLabel(item.entityType))}${item.entityId ? ` • #${escapeHtmlLocal(item.entityId)}` : ""}</p>
            <p class="text-[12.5px] text-slate-500 mt-0.5 line-clamp-2">${escapeHtmlLocal(item.title || "")}</p>
            <div class="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
              <span class="rounded-full px-2.5 py-0.5 bg-amber-50 text-amber-700 font-medium">Nhắc việc</span>
              <span class="rounded-full px-2.5 py-0.5 ${stat.cls} font-medium">${escapeHtmlLocal(stat.label)}</span>
              ${dueAt ? `<span class="text-slate-400">🗓 Hạn: ${escapeHtmlLocal(dueAt)}</span>` : ""}
              ${lastNotified ? `<span class="text-slate-400">⏱ Lần cuối: ${escapeHtmlLocal(lastNotified)}</span>` : ""}
            </div>
          </div>
        </li>
      `;
    }

    function updateKpis() {
      const totalReminds = state.reminders.length;
      const incoming = state.reminders.filter((r) => (r.entityType || "").toLowerCase() === "document").length;
      const outgoing = state.reminders.filter((r) => (r.entityType || "").toLowerCase() !== "document").length;
      const unread = state.notifications.filter((n) => !n.readAt).length;

      if (kpiTotal) kpiTotal.textContent = String(totalReminds);
      if (kpiIncoming) kpiIncoming.textContent = String(incoming);
      if (kpiOutgoing) kpiOutgoing.textContent = String(outgoing);
      if (kpiUnread) kpiUnread.textContent = String(unread);
    }

    function refreshView() {
      const filteredNoti = applyFilters(state.notifications, "noti");
      const filteredRemind = applyFilters(state.reminders, "remind");

      if (listNoti) listNoti.innerHTML = filteredNoti.map(renderNotificationItem).join("");
      if (listRemind) listRemind.innerHTML = filteredRemind.map(renderReminderItem).join("");

      if (emptyNoti) emptyNoti.classList.toggle("hidden", filteredNoti.length > 0);
      if (emptyRemind) emptyRemind.classList.toggle("hidden", filteredRemind.length > 0);

      qsa(".mark-read", listNoti).forEach((btn) =>
        btn.addEventListener("click", (ev) => {
          const li = ev.currentTarget.closest("li[data-id]");
          if (!li) return;
          const id = li.getAttribute("data-id");
          markAsRead(id);
        })
      );

      const isNoti = state.tab === "noti";
      if (blockNoti) blockNoti.classList.toggle("hidden", !isNoti);
      if (blockRemind) blockRemind.classList.toggle("hidden", isNoti);
      updateKpis();
    }

    async function markAsRead(id) {
      if (!id) return;
      const api = window.NotificationApi;
      if (!api) return;
      const idx = state.notifications.findIndex((n) => String(n.id) === String(id));
      if (idx < 0) return;
      if (state.notifications[idx].readAt) return refreshView();
      try {
        await api.markNotificationRead(id);
        state.notifications[idx].readAt = new Date().toISOString();
        toast("Đã đánh dấu đã đọc.");
        refreshView();
      } catch (err) {
        console.error("[vanthu] markAsRead failed", err);
        toast("Không thể đánh dấu đã đọc.");
      }
    }

    async function loadData() {
      const api = window.NotificationApi;
      if (!api) {
        console.warn("[vanthu] NotificationApi unavailable");
        return;
      }
      try {
        setLoading(true);
        const [notiRaw, remindRaw] = await Promise.all([
          api.fetchNotifications().catch(() => []),
          api.fetchReminders().catch(() => []),
        ]);
        state.notifications = (notiRaw || []).map((n) =>
          api.normalizeNotification(n) || n
        );
        state.reminders = (remindRaw || []).map((r) =>
          api.normalizeReminder(r) || r
        );
        updateFilterOptions();
        refreshView();
      } catch (error) {
        console.error("[vanthu] load notifications/reminders failed", error);
        toast("Không thể tải thông báo & nhắc việc.");
      } finally {
        setLoading(false);
      }
    }

    tabNoti?.addEventListener("click", () => {
      state.tab = "noti";
      tabNoti.classList.add("bg-slate-900", "text-white");
      tabRemind?.classList.remove("bg-slate-900", "text-white");
      updateFilterOptions();
      refreshView();
    });

    tabRemind?.addEventListener("click", () => {
      state.tab = "remind";
      tabRemind.classList.add("bg-slate-900", "text-white");
      tabNoti?.classList.remove("bg-slate-900", "text-white");
      updateFilterOptions();
      refreshView();
    });

    searchBox?.addEventListener("input", () => refreshView());
    filterType?.addEventListener("change", () => refreshView());
    filterPriority?.addEventListener("change", () => refreshView());

    qs("#globalSearch")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        searchBox.value = e.target.value;
        refreshView();
      }
    });

    updateFilterOptions();
    loadData();
  };

  pageHandlers['vanbanden-tiepnhan'] = function () {
    // Elements
          const req = {
            soKyHieu: document.getElementById("fldSoKyHieu"),
            ngayBanHanh: document.getElementById("fldNgayBanHanh"),
            coQuan: document.getElementById("fldCoQuan"),
            trichYeu: document.getElementById("fldTrichYeu"),
            soDangKy: document.getElementById("fldSoDangKy"),
            ngayDen: document.getElementById("fldNgayDen"),
          };
          const doKhan = document.getElementById("fldDoKhan");
          const doMat = document.getElementById("fldDoMat");
          const pv = {
            soDen: document.getElementById("pvSoDen"),
            ngayDen: document.getElementById("pvNgayDen"),
            soDangKy: document.getElementById("pvSoDangKy"),
            doKhan: document.getElementById("pvDoKhan"),
            doMat: document.getElementById("pvDoMat"),
            files: document.getElementById("pvFiles"),
          };
          const fldSoDen = document.getElementById("fldSoDen");
          const btnRegister = document.getElementById("btnRegister");
          const btnAssign = document.getElementById("btnAssign");
          const btnAddAssignee = document.getElementById("btnAddAssignee");
          const validList = document.getElementById("validList");
          const upload = document.getElementById("fldUpload");
          const lstFiles = document.getElementById("lstFiles");
          const noteField = document.getElementById("fldGhiChu");

          const api = window.ApiClient;
          const inboundApi = resolveInboundApi(api);
          const helpers = window.DocHelpers || {};
          const layout = window.Layout || {};
          const authReady =
            layout.authPromise && typeof layout.authPromise.then === "function"
              ? layout.authPromise
              : Promise.resolve();
          const escapeRecent = (value) => {
            if (helpers.escapeHtml) return helpers.escapeHtml(value);
            const raw = value == null ? "" : String(value);
            return raw
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#39;");
          };
          const formatRecentDate = (value) => {
            if (helpers.formatDate) return helpers.formatDate(value);
            if (!value) return "";
            return String(value).slice(0, 10);
          };
          const recentDocsList = document.getElementById("recent-docs-list");
          const recentDocsEmpty = document.getElementById("recent-docs-empty");
          const recentDocsLoading = document.getElementById("recent-docs-loading");
          let currentDocId = null;
          let registerLock = false;
          let assignLock = false;
          const pendingFiles = []; // Store files for upload after registration

          // Defaults
          (function initDefaults() {
            const today = new Date().toISOString().slice(0, 10);
            req.ngayDen.value = today;
            req.ngayBanHanh.value = today;
            updatePreview();
            renderFilesPlaceholder();
            checkValidity();
          })();

          // Helpers
          function markCheck(key, ok) {
            const li = validList.querySelector(`[data-check="${key}"]`);
            if (!li) return;
            const dot = li.querySelector(".status-dot");
            if (ok) {
              dot.textContent = "✅";
              li.classList.remove("text-rose-600");
              li.classList.add("text-emerald-700");
            } else {
              dot.textContent = "⛔";
              li.classList.add("text-rose-600");
              li.classList.remove("text-emerald-700");
            }
          }

          function checkValidity() {
            const checks = {
              so_ky_hieu: !!req.soKyHieu.value.trim(),
              ngay_ban_hanh: !!req.ngayBanHanh.value,
              co_quan: !!req.coQuan.value.trim(),
              trich_yeu: !!req.trichYeu.value.trim(),
              so_dang_ky: !!req.soDangKy.value,
              ngay_den: !!req.ngayDen.value,
            };
            Object.entries(checks).forEach(([k, v]) => markCheck(k, v));
            const allOk = Object.values(checks).every(Boolean);
            btnRegister.disabled = !allOk;
            return allOk;
          }

          function updatePreview() {
            pv.ngayDen.textContent = req.ngayDen.value || "—";
            pv.soDangKy.textContent =
              req.soDangKy.options[req.soDangKy.selectedIndex]?.text || "—";
            pv.doKhan.textContent =
              doKhan.options[doKhan.selectedIndex]?.text || "Thường";
            pv.doMat.textContent =
              doMat.options[doMat.selectedIndex]?.text || "Thường";
          }

          // File uploads (mock UI)
          function renderFilesPlaceholder() {
            if (!lstFiles.querySelector("[data-empty-hint]")) {
              const li = document.createElement("li");
              li.className =
                "rounded-lg border border-slate-100 p-3 flex items-center justify-between gap-3";
              li.dataset.emptyHint = "1";
              li.innerHTML =
                '<div class="text-slate-500">Chưa có tệp. Nhấn <span class="font-medium">Thêm tệp</span> để tải lên.</div>';
              lstFiles.appendChild(li);
            }
          }

          function refreshFilesCount() {
            const count = lstFiles.querySelectorAll("li[data-file]").length;
            pv.files.textContent = count;
            const hint = lstFiles.querySelector("li[data-empty-hint]");
            if (hint) hint.style.display = count ? "none" : "";
          }

          upload.addEventListener("change", () => {
            Array.from(upload.files || []).forEach((f) => {
              const fileIndex = pendingFiles.length;
              pendingFiles.push(f); // Store file for later upload
              const li = document.createElement("li");
              li.dataset.file = "1";
              li.dataset.fileIndex = String(fileIndex);
              li.className =
                "rounded-lg border border-slate-100 p-3 flex items-center justify-between gap-3";
              li.innerHTML = `
                <div>
                  <div class="font-medium text-slate-700 break-all">${f.name}</div>
                  <div class="text-[12px] text-slate-500">${(f.size / 1024).toFixed(
                    0
                  )} KB • Sẽ tải lên khi lưu</div>
                </div>
                <button type="button" class="btn-icon" title="Gỡ tệp">⛔</button>
              `;
              li.querySelector("button").addEventListener("click", () => {
                const idx = parseInt(li.dataset.fileIndex, 10);
                if (!isNaN(idx) && pendingFiles[idx]) {
                  pendingFiles[idx] = null; // Mark as removed
                }
                li.remove();
                refreshFilesCount();
              });
              lstFiles.appendChild(li);
            });
            upload.value = "";
            refreshFilesCount();
          });

          // Assign table
          function addAssignRow() {
            const body = document.getElementById("assignBody");
            const empty = body.querySelector("[data-empty-row]");
            if (empty) empty.remove();

            const tr = document.createElement("tr");
            tr.innerHTML = `
              <td class="px-5 py-2">
                <input type="text" class="w-full border border-slate-200 rounded-md px-2 py-1.5 text-[13px]" placeholder="VD: Nguyễn Văn An / Phòng Y tế" />
              </td>
              <td class="px-5 py-2">
                <select class="w-full border border-slate-200 rounded-md px-2 py-1.5 text-[13px]">
                  <option>Chủ trì</option>
                  <option>Phối hợp</option>
                </select>
              </td>
              <td class="px-5 py-2">
                <input type="date" class="w-full border border-slate-200 rounded-md px-2 py-1.5 text-[13px]" />
              </td>
              <td class="px-5 py-2">
                <input type="text" class="w-full border border-slate-200 rounded-md px-2 py-1.5 text-[13px]" placeholder="Ghi chú…" />
              </td>
              <td class="px-5 py-2 text-right">
                <button type="button" class="btn-icon" title="Xóa dòng">⛔</button>
              </td>
            `;
            tr.querySelector("button").addEventListener("click", () => tr.remove());
            body.appendChild(tr);
          }

          btnAddAssignee.addEventListener("click", addAssignRow);

          // Register helper + API integration
          function generateIncomingNumber() {
            const year = (
              req.ngayDen.value || new Date().toISOString().slice(0, 10)
            ).slice(0, 4);
            const rand = Math.floor(50 + Math.random() * 50); // 50-99
            return String(rand).padStart(3, "0") + "/" + year;
          }

          function applyPreview(soDen) {
            fldSoDen.value = soDen;
            pv.soDen.textContent = soDen;

            btnAssign.disabled = false;
            btnAddAssignee.disabled = false;

            [
              req.soKyHieu,
              req.ngayBanHanh,
              req.coQuan,
              req.trichYeu,
              req.ngayDen,
              req.soDangKy,
            ].forEach((el) => el.setAttribute("disabled", "disabled"));
            checkValidity();
          }

          function resolveErrorMessage(error) {
            if (helpers.resolveErrorMessage) {
              return helpers.resolveErrorMessage(error);
            }
            if (!error) return "Không thể kết nối tới máy chủ.";
            if (error.data) {
              if (typeof error.data === "string") return error.data;
              if (error.data.detail) return String(error.data.detail);
              if (error.data.message) return String(error.data.message);
            }
            return error.message || "Đã xảy ra lỗi.";
          }

          function getCurrentUserId() {
            const user = api?.getCurrentUser ? api.getCurrentUser() : null;
            return user?.id || user?.user_id || user?.userId || null;
          }

          async function syncWithInbound(soDen) {
            const createDocFn =
              inboundApi && typeof inboundApi.create === "function"
                ? inboundApi.create
                : null;
            if (!inboundApi || !createDocFn) {
              toast(
                "Chức năng đồng bộ văn bản đến đang thực hiện trực tiếp trong giao diện đa tầng.",
                "warn"
              );
              return;
            }
            if (registerLock) {
              return;
            }
            registerLock = true;
            try {
              const sender = req.coQuan.value.trim() || undefined;
              const receivedDate = req.ngayDen.value || undefined;
              const payload = {
                doc_direction: "den",
                document_code: req.soKyHieu.value.trim() || undefined,
                title: req.trichYeu.value.trim() || "Văn bản đến",
                received_number: soDen,
                received_date: receivedDate,
                sender,
                summary: req.trichYeu.value.trim() || undefined,
              };

              const created = await createDocFn(payload);
              currentDocId = created?.id || created?.document_id;
              if (!currentDocId) {
                throw new Error("Không xác định được ID văn bản.");
              }

              const note = noteField?.value?.trim();
              await inboundApi.receive(currentDocId, { note });
              
              // Upload attached files BEFORE register (register causes page redirect)
              const docApi = api?.documents;
              if (docApi && typeof docApi.uploadAttachment === "function") {
                const filesToUpload = pendingFiles.filter((f) => f !== null);
                if (filesToUpload.length > 0) {
                  let uploadSuccess = 0;
                  let uploadFail = 0;
                  for (const fileData of filesToUpload) {
                    try {
                      const formData = new FormData();
                      formData.append("file", fileData);
                      await docApi.uploadAttachment(currentDocId, formData);
                      uploadSuccess++;
                    } catch (uploadErr) {
                      console.error("[vanthu] file upload error:", fileData.name, uploadErr);
                      uploadFail++;
                    }
                  }
                  if (uploadSuccess > 0) {
                    toast(`Đã tải lên ${uploadSuccess} tệp đính kèm.`, "success");
                  }
                  if (uploadFail > 0) {
                    toast(`Không thể tải ${uploadFail} tệp.`, "error");
                  }
                }
              }

              // Register last - this triggers form submit which redirects page
              await inboundApi.register(currentDocId, {
                received_number: soDen,
                received_date: receivedDate,
                sender,
              });

              toast("Đã đồng bộ văn bản đến với hệ thống.", "success");
            } catch (error) {
              console.error("[vanthu] register inbound doc error", error);
              toast(resolveErrorMessage(error), "error");
            } finally {
              registerLock = false;
            }
          }



          // Register (API-aware)
          btnRegister.addEventListener("click", async () => {
            if (!checkValidity()) return;
            const soDen = generateIncomingNumber();
            applyPreview(soDen);
            if (inboundApi && typeof inboundApi.create === "function") {
              await syncWithInbound(soDen);
            } else {
              toast("Đã tiếp nhận & ghi số: " + soDen);
            }
          });

          authReady
            .then(() => loadRecentDocs())
            .catch(() => {
              renderRecentDocs([]);
              setRecentLoading(false);
            });

          function loadRecentDocs() {
            if (!recentDocsList) return;
            setRecentLoading(true);
            const docApi = api?.documents;
            if (!docApi) {
              renderRecentDocs([]);
              setRecentLoading(false);
              return;
            }
            docApi
              .list({ doc_direction: "den", ordering: "-created_at", page_size: 4 })
              .then((data) => {
                const docs = typeof api.extractItems === "function" ? api.extractItems(data) || [] : [];
                renderRecentDocs(docs);
              })
              .catch((error) => {
                console.error("[vanthu] Lỗi tải danh sách văn bản gần đây:", error);
                renderRecentDocs([]);
              })
              .finally(() => {
                setRecentLoading(false);
              });
          }

          function renderRecentDocs(items) {
            if (!recentDocsList) return;
            recentDocsList.innerHTML = "";
            if (!Array.isArray(items) || !items.length) {
              recentDocsEmpty?.classList.remove("hidden");
              return;
            }
            recentDocsEmpty?.classList.add("hidden");
            const fragment = document.createDocumentFragment();
            items.forEach((doc) => {
              const title = doc.title || "Văn bản";
              const number = doc.incoming_number || doc.document_code || "";
              const received = doc.received_date || doc.created_at || "";
              const li = document.createElement("li");
              li.className =
                "rounded-lg border border-slate-100 p-3 text-sm text-slate-700 grid gap-1";
              li.innerHTML = `
                  <div class="font-semibold text-slate-900">${escapeRecent(title)}</div>
                <div class="text-[12px] text-slate-500 flex justify-between gap-2">
                  <span>${escapeRecent(number)}</span>
                  <span>${formatRecentDate(received)}</span>
                </div>
              `;
              fragment.appendChild(li);
            });
            recentDocsList.appendChild(fragment);
          }

          function setRecentLoading(state) {
            if (!recentDocsLoading) return;
            recentDocsLoading.textContent = state ? "Đang tải..." : "Cập nhật";
          }

          // Assign (API-aware)
          btnAssign.addEventListener("click", async () => {
            if (assignLock) return;
            if (!currentDocId) {
              toast("Chưa có văn bản để chuyển xử lý.", "warn");
              return;
            }
            if (!api || !inboundApi) {
              toast("Đã lưu phân công và chuyển xử lý.", "success");
              return;
            }
            assignLock = true;
            try {
              const note = noteField?.value?.trim();
              const userId = getCurrentUserId();
              if (!userId) {
                throw new Error("Không xác định người dùng hiện tại.");
              }
              await inboundApi.assign(currentDocId, {
                assignees: [userId],
                instruction: note || undefined,
              });
              await inboundApi.start(currentDocId);
              toast("Đã lưu phân công và chuyển xử lý.", "success");
            } catch (error) {
              console.error("[vanthu] assign inbound doc error", error);
              toast(resolveErrorMessage(error), "error");
            } finally {
              assignLock = false;
            }
          });

          // Save draft (mock)
          document.getElementById("btnSaveDraft").addEventListener("click", () => {
            toast("Đã lưu nháp thông tin tiếp nhận.");
          });

          // Bind change events
          [
            req.soKyHieu,
            req.ngayBanHanh,
            req.coQuan,
            req.trichYeu,
            req.soDangKy,
            req.ngayDen,
            doKhan,
            doMat,
          ].forEach((el) => {
            el.addEventListener("input", () => {
              checkValidity();
              updatePreview();
            });
            el.addEventListener("change", () => {
              checkValidity();
              updatePreview();
            });
          });

          // Tiny toast
          function toast(msg) {
            let el = document.getElementById("toast");
            if (!el) {
              el = document.createElement("div");
              el.id = "toast";
              el.className =
                "fixed bottom-4 right-4 z-[60] rounded-lg bg-slate-900 text-white text-sm px-3 py-2 shadow-lg";
              document.body.appendChild(el);
            }
            el.textContent = msg;
            el.style.opacity = "1";
            setTimeout(() => (el.style.opacity = "0"), 2200);
          }
  };

  pageHandlers['vanbanden'] = function () {
    const api = window.ApiClient;
    if (!api) {
      console.warn("[vanthu] ApiClient không sẵn sàng; bỏ qua tải văn bản đến.");
      return;
    }

    const helpers = window.DocHelpers || {};
    const inboundApi = resolveInboundApi(api);
    if (!inboundApi) {
      console.warn("[vanthu] Không thể khởi tạo client văn bản đến từ documentApi.");
      return;
    }

    const layout = window.Layout || {};
    const listEl = document.getElementById("inbox-list");
    if (!listEl) {
      return;
    }

    const countEl = document.getElementById("total-count");
    const statusButton = document.getElementById("btn-status");
    const statusMenu = document.getElementById("menu-status");
    const statusLabel = document.getElementById("status-label");
    const levelButton = document.getElementById("btn-level");
    const levelMenu = document.getElementById("menu-level");
    const levelLabel = document.getElementById("level-label");
    const urgentBtn = document.getElementById("btn-filter-khan");
    const searchInput = document.getElementById("search-inbox");
    const importBtn = document.getElementById("btn-import-inbound");
    const toast = document.getElementById("toast");

    const kpi = {
      "tiep-nhan": document.getElementById("kpi-tiep-nhan"),
      "dang-ky": document.getElementById("kpi-dang-ky"),
      "phan-cong": document.getElementById("kpi-phan-cong"),
      "dang-xu-ly": document.getElementById("kpi-dang-xu-ly"),
      "hoan-tat": document.getElementById("kpi-hoan-tat"),
      "luu-tru": document.getElementById("kpi-luu-tru"),
      urgent: document.getElementById("kpi-khan-cap"),
    };

    const state = { keyword: "", status: "all", level: "all" };
    let normalizedDocs = [];
    const importApiAvailable = () => typeof inboundApi?.import === "function";
    const exportApiAvailable = () => typeof inboundApi?.export === "function";

    attachMenu(statusButton, statusMenu, statusLabel, (value) => {
      state.status = value;
      applyFilters();
    });

    attachMenu(levelButton, levelMenu, levelLabel, (value) => {
      state.level = value;
      applyFilters();
    });

    if (urgentBtn) {
      urgentBtn.addEventListener("click", () => {
        state.level = state.level === "khan" ? "all" : "khan";
        if (levelLabel) {
          levelLabel.textContent = state.level === "khan" ? "Khẩn" : "Tất cả mức độ";
        }
        applyFilters();
      });
    }

    if (searchInput) {
      searchInput.addEventListener(
        "input",
        debounce((event) => {
          state.keyword = event.target.value || "";
          applyFilters();
        }, 200)
      );
    }

    const authReady = layout.authPromise && typeof layout.authPromise.then === "function"
      ? layout.authPromise
      : Promise.resolve();

    authReady
      .then(() => loadDocuments())
      .catch(() => {
        renderError("Không thể xác thực người dùng hiện tại.");
      });

    function loadDocuments() {
      if (!api.documents) {
        renderError("Chưa cấu hình Document API.");
        return Promise.resolve();
      }
      renderLoading();
      return api.documents
        .list({ doc_direction: "den", ordering: "-created_at", page_size: 50 })
        .then((data) => {
          const docs = api.extractItems(data);
          normalizedDocs = docs.map(normalizeDoc);
          updateKPIs();
          applyFilters();
        })
        .catch((error) => {
          console.error("[vanthu] Lỗi tải văn bản đến:", error);
          renderError(resolveErrorMessage(error));
        });
    }

    function normalizeDoc(raw) {
      if (helpers.normalizeInboundDoc) {
        const normalized = helpers.normalizeInboundDoc(raw);
        normalized.searchValue =
          normalized.searchText ||
          normalizeText([normalized.title, normalized.number, normalized.sender, normalized.department].join(" "));
        normalized.raw = raw;
        return normalized;
      }
      const statusKey = mapStatusKey(raw?.status_name || raw?.status?.name || raw?.status?.code || "");
      const urgencyRaw = String(raw?.urgency?.name || raw?.urgency?.code || "");
      const urgencyKey = mapUrgencyKey(urgencyRaw);
      const receivedDate = raw?.received_date || (raw?.created_at ? raw.created_at.slice(0, 10) : "");
      const number = raw?.incoming_number ? String(raw.incoming_number) : raw?.document_code || "";
      const sender = raw?.sender || "";
      const department = raw?.department?.name || "";
      const searchValue = normalizeText([raw?.title, number, sender, department].join(" "));
      return {
        raw,
        statusKey,
        statusLabel: mapStatusLabel(statusKey, raw?.status_name),
        urgencyKey,
        urgencyLabel: mapUrgencyLabel(urgencyKey, urgencyRaw),
        receivedDate,
        number,
        sender,
        department,
        searchValue,
      };
    }

    function applyFilters() {
      if (!normalizedDocs.length) {
        renderList([]);
        if (countEl) countEl.textContent = "0";
        return;
      }
      const keyword = normalizeText(state.keyword);
      const filtered = normalizedDocs.filter((doc) => {
        if (state.status !== "all" && doc.statusKey !== state.status) {
          return false;
        }
        if (state.level !== "all" && doc.urgencyKey !== state.level) {
          return false;
        }
        if (keyword && !doc.searchValue.includes(keyword)) {
          return false;
        }
        return true;
      });
      renderList(filtered);
      if (countEl) {
        countEl.textContent = String(filtered.length);
      }
    }

    function renderList(list) {
      listEl.innerHTML = "";
      if (!list.length) {
        renderEmpty();
        return;
      }
      const fragment = document.createDocumentFragment();
      list.forEach((doc) => {
        fragment.appendChild(createItem(doc));
      });
      listEl.appendChild(fragment);
    }

    function createItem(doc) {
      const li = document.createElement("li");
      li.className = "bg-white border border-slate-200 rounded-xl";
      if (doc.statusKey) li.dataset.status = doc.statusKey;
      if (doc.urgencyKey) li.dataset.level = doc.urgencyKey;
      li.dataset.key = doc.searchValue;

      const statusClass = mapStatusClass(doc.statusKey);
      const urgencyClass = mapUrgencyClass(doc.urgencyKey);
      const docId =
        doc.id ||
        doc.document_id ||
        doc.raw?.id ||
        doc.raw?.document_id ||
        "";
      const detailHref = docId
        ? `/vanthu/vanbanden/${encodeURIComponent(docId)}/`
        : "vanbanden-detail.html?id=" + encodeURIComponent(doc.id ?? doc.raw?.id ?? "");

      li.innerHTML = [
        '<div class="p-4">',
        '  <div class="flex items-start justify-between gap-4">',
        '    <div class="min-w-0">',
        '      <h4 class="text-[15px] font-semibold truncate">' + escapeHtml(doc.title || doc.raw?.title || "Văn bản") + '</h4>',
        '      <div class="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-slate-600">',
        doc.number ? '        <span class="inline-flex items-center gap-1 text-slate-500">' + escapeHtml(doc.number) + '</span>' : '',
        doc.receivedDate ? '        <span class="inline-flex items-center gap-1 text-slate-500">' + escapeHtml(formatDate(doc.receivedDate)) + '</span>' : '',
        doc.sender ? '        <span class="inline-flex items-center gap-1 text-slate-500">' + escapeHtml(doc.sender) + '</span>' : '',
        doc.department ? '        <span class="inline-flex items-center gap-1 text-slate-500">' + escapeHtml(doc.department) + '</span>' : '',
        '      </div>',
        '      <div class="mt-2 flex flex-wrap items-center gap-2">',
        '        <span class="' + statusClass + '">' + escapeHtml(doc.statusLabel) + '</span>',
        doc.urgencyLabel ? '        <span class="' + urgencyClass + '">' + escapeHtml(doc.urgencyLabel) + '</span>' : '',
        '      </div>',
        '    </div>',
        '    <div class="shrink-0">',
        '      <a href="' + detailHref + '" class="btn-outline"><span>🔍</span> Chi tiết</a>',
        '    </div>',
        '  </div>',
        '</div>',
      ]
        .filter(Boolean)
        .join("\n");
      return li;
    }

    function renderLoading() {
      listEl.innerHTML = '<li class="bg-white border border-slate-200 rounded-xl p-4 text-[13px] text-slate-500">Đang tải dữ liệu...</li>';
    }

    function renderEmpty() {
      listEl.innerHTML = '<li class="bg-white border border-slate-200 rounded-xl p-4 text-[13px] text-slate-500">Không có văn bản phù hợp với bộ lọc.</li>';
    }

    function renderError(message) {
      listEl.innerHTML = '<li class="bg-white border border-rose-200 rounded-xl p-4 text-[13px] text-rose-600">' + escapeHtml(message) + '</li>';
      if (toast) {
        toast.textContent = message;
        toast.classList.add("show");
        setTimeout(() => toast.classList.remove("show"), 2200);
      }
    }

    function updateKPIs() {
      const summary = helpers.computeInboundKPIs
        ? helpers.computeInboundKPIs(normalizedDocs)
        : fallbackKPIs();
      if (summary && summary.states) {
        Object.keys(kpi).forEach((key) => {
          const el = kpi[key];
          if (!el) return;
          if (key === "urgent") {
            el.textContent = String(summary.urgent || 0);
          } else {
            el.textContent = String(summary.states[key] || 0);
          }
        });
      }
      if (countEl) countEl.textContent = String(summary?.total ?? normalizedDocs.length);
    }

    function fallbackKPIs() {
      const template = {
        "tiep-nhan": 0,
        "dang-ky": 0,
        "phan-cong": 0,
        "dang-xu-ly": 0,
        "hoan-tat": 0,
        "luu-tru": 0,
        "thu-hoi": 0,
      };
      const result = { total: normalizedDocs.length, urgent: 0, states: { ...template } };
      normalizedDocs.forEach((doc) => {
        if (Object.prototype.hasOwnProperty.call(result.states, doc.statusKey)) {
          result.states[doc.statusKey] += 1;
        }
        if (doc.urgencyKey === "khan" || doc.urgencyKey === "ratkhan") {
          result.urgent += 1;
        }
      });
      return result;
    }

    function attachMenu(button, menu, label, onSelect) {
      if (!button || !menu || !label) {
        return;
      }
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        menu.classList.toggle("hidden");
        button.setAttribute("aria-expanded", menu.classList.contains("hidden") ? "false" : "true");
      });
      menu.addEventListener("click", (event) => {
        const target = event.target.closest(".menu-item");
        if (!target) return;
        const value = target.getAttribute("data-status") || target.getAttribute("data-level") || "all";
        label.textContent = target.textContent.trim();
        button.dataset.value = value;
        menu.classList.add("hidden");
        button.setAttribute("aria-expanded", "false");
        onSelect(value);
      });
      document.addEventListener("click", (event) => {
        if (menu.classList.contains("hidden")) return;
        if (!menu.contains(event.target) && event.target !== button) {
          menu.classList.add("hidden");
          button.setAttribute("aria-expanded", "false");
        }
      });
    }

    function mapStatusKey(raw) {
      if (helpers.mapInboundStatusKey) {
        return helpers.mapInboundStatusKey(raw);
      }
      const value = normalizeText(raw);
      if (/hoan_tat|done|complete/.test(value)) return "hoan-tat";
      if (/dang_xu_ly|processing/.test(value)) return "dang-xu-ly";
      if (/phan_cong|assign/.test(value)) return "phan-cong";
      if (/dang_ky|register/.test(value)) return "dang-ky";
      if (/luu_tru|archive/.test(value)) return "luu-tru";
      if (/thu_hoi|withdraw/.test(value)) return "thu-hoi";
      return "tiep-nhan";
    }

    function mapStatusLabel(key, fallback) {
      if (helpers.mapInboundStatusLabel) {
        return helpers.mapInboundStatusLabel(key, fallback);
      }
      switch (key) {
        case "tiep-nhan":
          return "Tiếp nhận";
        case "dang-ky":
          return "Đăng ký";
        case "phan-cong":
          return "Phân công";
        case "dang-xu-ly":
          return "Đang xử lý";
        case "hoan-tat":
          return "Hoàn tất";
        case "luu-tru":
          return "Lưu trữ";
        case "thu-hoi":
          return "Thu hồi";
        default:
          return fallback || "Chưa xác định";
      }
    }

    if (importBtn) {
      const importInput = document.createElement("input");
      importInput.type = "file";
      importInput.accept = ".xlsx,.xls,.csv,.json";
      importInput.style.display = "none";
      document.body.appendChild(importInput);

      importBtn.addEventListener("click", () => {
        if (!importApiAvailable()) {
          showToast("Không thể nhập văn bản đến: thiếu API.", "error");
          return;
        }
        importInput.value = "";
        importInput.click();
      });

      importInput.addEventListener("change", async () => {
        const file = importInput.files?.[0];
        if (!file) return;
        if (!importApiAvailable()) {
          showToast("Không thể nhập văn bản đến: thiếu API.", "error");
          return;
        }
        const formData = new FormData();
        formData.append("direction", "den");
        formData.append("file", file);
        importBtn.disabled = true;
        try {
          const resp = await inboundApi.import(formData);
          const accepted = Number(resp?.accepted ?? 0);
          const skipped = Number(resp?.skipped ?? 0);
          const filename = resp?.filename || file.name;
          const jobId = resp?.job_id ? ` (mã: ${resp.job_id})` : "";
          let message;
          if (accepted > 0) {
            message = `Đã tiếp nhận ${accepted} bản ghi từ ${filename}${jobId}.`;
          } else {
            message = `Đã gửi yêu cầu xử lý ${filename}${jobId}.`;
          }
          if (skipped > 0) {
            message += ` Bỏ qua ${skipped} bản ghi.`;
          }
          showToast(message, "success");
        } catch (error) {
          console.error("[vanthu] import inbound docs error", error);
          showToast(resolveErrorMessage(error), "error");
        } finally {
          importBtn.disabled = false;
          importInput.value = "";
        }
      });
    }

    function mapStatusClass(key) {
      switch (key) {
        case "tiep-nhan":
          return "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[12px] font-semibold";
        case "dang-ky":
          return "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-100 text-sky-700 text-[12px] font-semibold";
        case "phan-cong":
          return "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[12px] font-semibold";
        case "dang-xu-ly":
          return "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[12px] font-semibold";
        case "hoan-tat":
          return "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[12px] font-semibold";
        case "luu-tru":
          return "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[12px] font-semibold";
        case "thu-hoi":
          return "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[12px] font-semibold";
        default:
          return "inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[12px] font-semibold";
      }
    }

    function mapUrgencyKey(raw) {
      const value = normalizeText(raw);
      if (/rat_khan|very_urgent/.test(value)) return "ratkhan";
      if (/khan|urgent/.test(value)) return "khan";
      if (/cao|high/.test(value)) return "cao";
      return "thuong";
    }

    function mapUrgencyLabel(key, fallback) {
      switch (key) {
        case "ratkhan":
          return "Rất khẩn";
        case "khan":
          return "Khẩn";
        case "cao":
          return "Cao";
        case "thuong":
          return fallback || "Thường";
        default:
          return fallback || "";
      }
    }

    function mapUrgencyClass(key) {
      switch (key) {
        case "ratkhan":
        case "khan":
          return "chip chip-danger";
        case "cao":
          return "chip chip-info";
        default:
          return "chip chip-muted";
      }
    }

    function debounce(fn, delay) {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(null, args), delay);
      };
    }

    function normalizeText(value) {
      return (value || "")
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
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
      if (!value) return "";
      const parts = value.split("-");
      if (parts.length === 3) {
        return parts[2] + "/" + parts[1] + "/" + parts[0];
      }
      return value;
    }

    function showToast(message, type = "info") {
      if (!toast) {
        console.log(message);
        return;
      }
      toast.textContent = message;
      toast.classList.remove("show", "toast--error", "toast--success", "toast--warn");
      if (type === "error") toast.classList.add("toast--error");
      else if (type === "success") toast.classList.add("toast--success");
      else if (type === "warn") toast.classList.add("toast--warn");
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 2200);
    }

    function resolveErrorMessage(error) {
      if (!error) return "Không thể tải dữ liệu từ máy chủ.";
      if (error.data) {
        if (typeof error.data === "string") return error.data;
        if (error.data.detail) return String(error.data.detail);
        if (error.data.message) return String(error.data.message);
      }
      if (error.message) return String(error.message);
      return "Không thể tải dữ liệu từ máy chủ.";
    }
  };

  pageHandlers['vanbanden-detail'] = function () {
    // Handled in vanthu-vanbanden-detail.js
  };

  pageHandlers['vanbanden-export'] = function () {
    const api = window.ApiClient;
    if (!api) {
      console.warn("[vanthu] ApiClient không sẵn sàng; bỏ qua trang xuất văn bản.");
      return;
    }
    const inboundApi = resolveInboundApi(api);
    const helpers = window.DocHelpers || {};
    if (!inboundApi) {
      console.warn("[vanthu] Không thể khởi tạo client văn bản đến để xuất dữ liệu.");
      return;
    }

    const form = document.getElementById("export-form");
    const statusSelect = document.getElementById("exportStatus");
    const levelSelect = document.getElementById("exportLevel");
    const keywordInput = document.getElementById("exportKeyword");
    const summaryEl = document.getElementById("export-summary");
    const alertEl = document.getElementById("export-alert");
    const tableBody = document.getElementById("export-table-body");
    const runBtn = document.getElementById("btn-run-export");
    const downloadBtn = document.getElementById("btn-export-download");

    let currentItems = [];
    let isLoading = false;

    function loopEscape(value) {
      if (helpers.escapeHtml) {
        return helpers.escapeHtml(value);
      }
      return (value || "")
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function loopFormatDate(value) {
      if (helpers.formatDate) {
        const formatted = helpers.formatDate(value);
        if (formatted) return formatted;
      }
      if (!value) return "";
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        return value.slice(0, 10);
      }
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${date.getFullYear()}-${month}-${day}`;
      }
      return String(value);
    }

    function loopResolveError(error) {
      if (helpers.resolveErrorMessage) {
        return helpers.resolveErrorMessage(error);
      }
      if (!error) return "Không thể kết nối tới máy chủ.";
      if (error.data) {
        if (typeof error.data === "string") return error.data;
        if (error.data.detail) return String(error.data.detail);
        if (error.data.message) return String(error.data.message);
      }
      if (error.message) return String(error.message);
      return "Không thể kết nối tới máy chủ.";
    }

    function setAlert(message, type = "info") {
      if (!alertEl) return;
      if (!message) {
        alertEl.textContent = "";
        alertEl.className = "hidden";
        return;
      }
      const classes = ["text-[13px]", "rounded-md", "border", "px-3", "py-2"];
      if (type === "error") {
        classes.push("border-rose-200", "bg-rose-50", "text-rose-700");
      } else if (type === "success") {
        classes.push("border-emerald-200", "bg-emerald-50", "text-emerald-700");
      } else {
        classes.push("border-slate-200", "bg-slate-50", "text-slate-600");
      }
      alertEl.className = classes.join(" ");
      alertEl.textContent = message;
    }

    function setSummary(message) {
      if (summaryEl) {
        summaryEl.textContent = message || "Chưa có dữ liệu. Chọn bộ lọc và chạy xuất.";
      }
    }

    function setTablePlaceholder(message) {
      if (!tableBody) return;
      tableBody.innerHTML = `<tr><td colspan="6" class="px-5 py-6 text-center text-slate-500">${message}</td></tr>`;
    }

    function setLoading(state) {
      isLoading = state;
      if (runBtn) {
        runBtn.disabled = state;
        runBtn.textContent = state ? "Đang xử lý..." : "Xuất dữ liệu";
      }
    }

    function renderTable(items) {
      if (!tableBody) return;
      if (!items.length) {
        setTablePlaceholder("Không tìm thấy văn bản phù hợp.");
        return;
      }
      tableBody.innerHTML = items
        .map((item) => {
          const title = item.title || item.raw?.title || "Văn bản";
          const incomingNumber = item.incoming_number || item.number || item.document_code || "—";
          const sender = item.sender || item.raw?.sender || "—";
          const received = item.received_date || item.raw?.received_date || "";
          const status = item.status_label || item.statusLabel || "Chưa xử lý";
          const urgency = item.urgency_label || item.urgencyLabel || "Thường";
          return `<tr>
              <td class="px-5 py-3 font-medium text-slate-700">${loopEscape(incomingNumber)}</td>
              <td class="px-5 py-3">
                <div class="font-semibold text-slate-800">${loopEscape(title)}</div>
                <div class="text-[12px] text-slate-500">${loopEscape(item.document_code || "")}</div>
              </td>
              <td class="px-5 py-3 text-slate-600">${loopEscape(sender)}</td>
              <td class="px-5 py-3 text-slate-600">${loopEscape(loopFormatDate(received))}</td>
              <td class="px-5 py-3">${loopEscape(status)}</td>
              <td class="px-5 py-3">${loopEscape(urgency)}</td>
            </tr>`;
        })
        .join("");
    }

    function buildCsv(items) {
      const header = ["So den", "Tieu de", "Co quan gui", "Ngay den", "Trang thai", "Do khan"];
      const rows = items.map((item) => {
        const incoming = item.incoming_number || item.number || item.document_code || "";
        const title = item.title || item.raw?.title || "";
        const sender = item.sender || item.raw?.sender || "";
        const received = loopFormatDate(item.received_date || item.raw?.received_date || "");
        const status = item.status_label || item.statusLabel || "";
        const urgency = item.urgency_label || item.urgencyLabel || "";
        return [incoming, title, sender, received, status, urgency]
          .map((value) => `"${String(value || "").replace(/"/g, '""')}"`)
          .join(",");
      });
      return [header.join(","), ...rows].join("\n");
    }

    async function runExport(params) {
      setLoading(true);
      setAlert("");
      setTablePlaceholder("Đang tải dữ liệu...");
      downloadBtn && (downloadBtn.disabled = true);
      try {
        const response = await inboundApi.export(params);
        const items = Array.isArray(response?.items)
          ? response.items
          : api.extractItems(response);
        currentItems = items;
        renderTable(items);
        const totalRows = response?.total_rows ?? items.length;
        setSummary(`Đã tìm thấy ${items.length} / ${totalRows} văn bản phù hợp.`);
        if (!items.length) {
          setAlert("Không tìm thấy dữ liệu với bộ lọc hiện tại.", "info");
        } else {
          setAlert(
            `Đã tạo dữ liệu, bạn có thể tải CSV hoặc sao chép bảng.${response?.download_url ? " Mở cùng đường dẫn: " + response.download_url : ""}`,
            "success"
          );
        }
        if (downloadBtn) {
          downloadBtn.disabled = !items.length;
        }
      } catch (error) {
        setTablePlaceholder("Không thể tải dữ liệu.");
        setSummary("Không thể tải dữ liệu do lỗi hệ thống.");
        setAlert(loopResolveError(error), "error");
      } finally {
        setLoading(false);
      }
    }

    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      if (isLoading) return;
      const params = { direction: "den", page_size: 200, ordering: "-created_at" };
      const status = statusSelect?.value || "all";
      if (status && status !== "all") {
        params.status = status;
      }
      const level = levelSelect?.value || "all";
      if (level && level !== "all") {
        params.level = level;
      }
      const keyword = keywordInput?.value?.trim();
      if (keyword) {
        params.keyword = keyword;
      }
      runExport(params);
    });

    downloadBtn?.addEventListener("click", () => {
      if (!currentItems.length || isLoading) return;
      const csv = buildCsv(currentItems);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vanban-den-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  };

  pageHandlers['vanbandi'] = function () {
    if (window.VTOutboundListOverride) {
      return;
    }
    const api = window.ApiClient;
    if (!api) {
      console.warn("[vanthu] ApiClient không sẵn sàng; bỏ qua tải văn bản đi.");
      return;
    }

    const layout = window.Layout || {};
    const listEl = document.getElementById("outbox-list");
    if (!listEl) {
      return;
    }

    const countEl = document.getElementById("total-count");
    const statusButton = document.getElementById("btn-status");
    const statusMenu = document.getElementById("menu-status");
    const statusLabel = document.getElementById("status-label");
    const levelButton = document.getElementById("btn-level");
    const levelMenu = document.getElementById("menu-level");
    const levelLabel = document.getElementById("level-label");
    const searchInput = document.getElementById("search-outbox");
    const toast = document.getElementById("toast");

    const kpi = {
      draft: document.getElementById("kpi-soanthao"),
      pending: document.getElementById("kpi-choky"),
      approved: document.getElementById("kpi-dakyduyet"),
      published: document.getElementById("kpi-daphathanh"),
    };

    const state = { keyword: "", status: "all", level: "all" };
    let normalizedDocs = [];

    attachMenu(statusButton, statusMenu, statusLabel, (value) => {
      state.status = value;
      applyFilters();
    });

    attachMenu(levelButton, levelMenu, levelLabel, (value) => {
      state.level = value;
      applyFilters();
    });

    if (searchInput) {
      searchInput.addEventListener(
        "input",
        debounce((event) => {
          state.keyword = event.target.value || "";
          applyFilters();
        }, 200)
      );
    }


    const authReady = layout.authPromise && typeof layout.authPromise.then === "function"
      ? layout.authPromise
      : Promise.resolve();

    authReady
      .then(() => loadDocuments())
      .catch(() => {
        renderError("Không thể xác thực người dùng hiện tại.");
      });

    function loadDocuments() {
      if (!api.documents) {
        renderError("Chưa cấu hình Document API.");
        return Promise.resolve();
      }
      renderLoading();
      return api.documents
        .list({ doc_direction: "di", ordering: "-created_at", page_size: 50 })
        .then((data) => {
          const docs = api.extractItems(data);
          normalizedDocs = docs.map(normalizeDoc);
          updateKPIs();
          applyFilters();
        })
        .catch((error) => {
          console.error("[vanthu] Lỗi tải văn bản đi:", error);
          renderError(resolveErrorMessage(error));
        });
    }

    function normalizeDoc(raw) {
      const statusRaw = String(raw?.status_name || raw?.status?.name || raw?.status?.code || "");
      const statusKey = mapStatusKey(statusRaw);
      const urgencyRaw = String(raw?.urgency?.name || raw?.urgency?.code || "");
      const urgencyKey = mapUrgencyKey(urgencyRaw);
      const issuedDate = raw?.issued_date || (raw?.created_at ? raw.created_at.slice(0, 10) : "");
      const number = raw?.outgoing_number || raw?.document_code || "";
      const signer = raw?.creator?.full_name || raw?.creator?.username || "";
      const recipients = raw?.department?.name || "";
      const searchValue = normalizeText([raw?.title, number, signer, recipients].join(" "));
      return {
        raw,
        statusKey,
        statusLabel: mapStatusLabel(statusKey, statusRaw),
        urgencyKey,
        urgencyLabel: mapUrgencyLabel(urgencyKey, urgencyRaw),
        issuedDate,
        number,
        signer,
        recipients,
        searchValue,
      };
    }

    function applyFilters() {
      if (!normalizedDocs.length) {
        renderList([]);
        if (countEl) countEl.textContent = "0";
        return;
      }
      const keyword = normalizeText(state.keyword);
      const filtered = normalizedDocs.filter((doc) => {
        if (state.status !== "all" && doc.statusKey !== state.status) {
          return false;
        }
        if (state.level !== "all" && doc.urgencyKey !== state.level) {
          return false;
        }
        if (keyword && !doc.searchValue.includes(keyword)) {
          return false;
        }
        return true;
      });
      renderList(filtered);
      if (countEl) {
        countEl.textContent = String(filtered.length);
      }
    }

    function renderList(list) {
      listEl.innerHTML = "";
      if (!list.length) {
        renderEmpty();
        return;
      }
      const fragment = document.createDocumentFragment();
      list.forEach((doc) => {
        fragment.appendChild(createItem(doc));
      });
      listEl.appendChild(fragment);
    }

    function createItem(doc) {
      const li = document.createElement("li");
      li.className = "bg-white border border-slate-200 rounded-xl";
      if (doc.statusKey) li.dataset.status = doc.statusKey;
      if (doc.urgencyKey) li.dataset.level = doc.urgencyKey;
      li.dataset.key = doc.searchValue;

      const statusClass = mapStatusClass(doc.statusKey);
      const urgencyClass = mapUrgencyClass(doc.urgencyKey);
      const docId =
        doc.id ||
        doc.document_id ||
        doc.raw?.id ||
        doc.raw?.document_id ||
        "";
      const detailHref = docId
        ? `/vanthu/vanbandi/${encodeURIComponent(docId)}/`
        : "vanbandi-detail.html?id=" + encodeURIComponent(doc.raw?.id ?? "");

      li.innerHTML = [
        '<div class="p-4">',
        '  <div class="flex items-start justify-between gap-4">',
        '    <div class="min-w-0">',
        '      <h4 class="text-[15px] font-semibold truncate">' + escapeHtml(doc.raw?.title || "Văn bản") + '</h4>',
        '      <div class="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-slate-600">',
        doc.number ? '        <span class="inline-flex items-center gap-1 text-slate-500">' + escapeHtml(doc.number) + '</span>' : '',
        doc.issuedDate ? '        <span class="inline-flex items-center gap-1 text-slate-500">' + escapeHtml(formatDate(doc.issuedDate)) + '</span>' : '',
        doc.signer ? '        <span class="inline-flex items-center gap-1 text-slate-500">' + escapeHtml(doc.signer) + '</span>' : '',
        doc.recipients ? '        <span class="inline-flex items-center gap-1 text-slate-500">' + escapeHtml(doc.recipients) + '</span>' : '',
        '      </div>',
        '      <div class="mt-2 flex flex-wrap items-center gap-2">',
        '        <span class="' + statusClass + '">' + escapeHtml(doc.statusLabel) + '</span>',
        doc.urgencyLabel ? '        <span class="' + urgencyClass + '">' + escapeHtml(doc.urgencyLabel) + '</span>' : '',
        '      </div>',
        '    </div>',
        '    <div class="shrink-0 flex items-center gap-2">',
        '      <a href="' + detailHref + '" class="btn-outline"><span>🔍</span> Chi tiết</a>',
        '    </div>',
        '  </div>',
        '</div>',
      ]
        .filter(Boolean)
        .join("\n");
      return li;
    }

    function renderLoading() {
      listEl.innerHTML = '<li class="bg-white border border-slate-200 rounded-xl p-4 text-[13px] text-slate-500">Đang tải dữ liệu...</li>';
    }

    function renderEmpty() {
      listEl.innerHTML = '<li class="bg-white border border-slate-200 rounded-xl p-4 text-[13px] text-slate-500">Không có văn bản phù hợp với bộ lọc.</li>';
    }

    function renderError(message) {
      listEl.innerHTML = '<li class="bg-white border border-rose-200 rounded-xl p-4 text-[13px] text-rose-600">' + escapeHtml(message) + '</li>';
      showToast(message);
    }

    function showToast(message) {
      if (!toast) return;
      toast.textContent = message;
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 2200);
    }

    function updateKPIs() {
      const counts = { draft: 0, pending: 0, approved: 0, published: 0 };
      normalizedDocs.forEach((doc) => {
        counts[doc.statusKey] = (counts[doc.statusKey] || 0) + 1;
      });
      if (kpi.draft) kpi.draft.textContent = String(counts.draft || 0);
      if (kpi.pending) kpi.pending.textContent = String(counts['pending-sign'] || 0);
      if (kpi.approved) kpi.approved.textContent = String(counts.approved || 0);
      if (kpi.published) kpi.published.textContent = String(counts.published || 0);
      if (countEl) countEl.textContent = String(normalizedDocs.length);
    }

    function attachMenu(button, menu, label, onSelect) {
      if (!button || !menu || !label) {
        return;
      }
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        menu.classList.toggle("hidden");
        button.setAttribute("aria-expanded", menu.classList.contains("hidden") ? "false" : "true");
      });
      menu.addEventListener("click", (event) => {
        const target = event.target.closest(".menu-item");
        if (!target) return;
        const value = target.getAttribute("data-status") || target.getAttribute("data-level") || "all";
        label.textContent = target.textContent.trim();
        button.dataset.value = value;
        menu.classList.add("hidden");
        button.setAttribute("aria-expanded", "false");
        onSelect(value);
      });
      document.addEventListener("click", (event) => {
        if (menu.classList.contains("hidden")) return;
        if (!menu.contains(event.target) && event.target !== button) {
          menu.classList.add("hidden");
          button.setAttribute("aria-expanded", "false");
        }
      });
    }

    function mapStatusKey(raw) {
      const value = normalizeText(raw);
      if (!value) return "draft";
      if (/phat_hanh|publish|published/.test(value)) return "published";
      if (/duyet|approve|approved|ky_duyet|signed/.test(value)) return "approved";
      if (/cho_ky|pending|submit|waiting|trinh/.test(value)) return "pending-sign";
      return "draft";
    }

    function mapStatusLabel(key, fallback) {
      switch (key) {
        case "pending-sign":
          return "Chờ ký";
        case "approved":
          return "Đã ký duyệt";
        case "published":
          return "Đã phát hành";
        default:
          return fallback || "Soạn thảo";
      }
    }

    function mapStatusClass(key) {
      switch (key) {
        case "pending-sign":
          return "chip chip-warn";
        case "approved":
          return "chip chip-info";
        case "published":
          return "chip chip-success";
        default:
          return "chip chip-muted";
      }
    }

    function mapUrgencyKey(raw) {
      const value = normalizeText(raw);
      if (/rat_khan|very_urgent/.test(value)) return "ratkhan";
      if (/khan|urgent/.test(value)) return "khan";
      if (/cao|high/.test(value)) return "cao";
      return "thuong";
    }

    function mapUrgencyLabel(key, fallback) {
      switch (key) {
        case "ratkhan":
          return "Rất khẩn";
        case "khan":
          return "Khẩn";
        case "cao":
          return "Cao";
        case "thuong":
          return fallback || "Thường";
        default:
          return fallback || "";
      }
    }

    function mapUrgencyClass(key) {
      switch (key) {
        case "ratkhan":
        case "khan":
          return "chip chip-danger";
        case "cao":
          return "chip chip-info";
        default:
          return "chip chip-muted";
      }
    }

    function debounce(fn, delay) {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(null, args), delay);
      };
    }

    function normalizeText(value) {
      return (value || "")
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
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
      if (!value) return "";
      const parts = value.split("-");
      if (parts.length === 3) {
        return parts[2] + "/" + parts[1] + "/" + parts[0];
      }
      return value;
    }

    function resolveErrorMessage(error) {
      if (!error) return "Không thể tải dữ liệu từ máy chủ.";
      if (error.data) {
        if (typeof error.data === "string") return error.data;
        if (error.data.detail) return String(error.data.detail);
        if (error.data.message) return String(error.data.message);
      }
      if (error.message) return String(error.message);
      return "Không thể tải dữ liệu từ máy chủ.";
    }
  };

  pageHandlers['vanbandi-detail'] = function () {
    if (window.VTOutboundDetailOverride) {
      return;
    }
    const api = window.ApiClient;
    const helpers = window.DocHelpers || {};
    if (!api || !api.documents) {
      console.warn("[vanthu] ApiClient.documents không sẵn sàng.");
      return;
    }

    const docId = getDocId();
    if (!docId) {
      console.warn("[vanthu] Không xác định ID văn bản đi.");
      return;
    }

    const detailError = document.getElementById("doc-detail-error");
    const detailNumberEl = document.getElementById("doc-detail-number");
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
    const metaSignerMethod = document.getElementById("doc-meta-sign-method");
    const metaDepartment = document.getElementById("doc-meta-department");
    const metaPublisher = document.getElementById("doc-meta-publisher");
    const metaRecipients = document.getElementById("doc-meta-recipients");
    const assignmentsBody = document.getElementById("doc-assignments-body");
    const approvalsList = document.getElementById("doc-approvals");
    const approvalsCount = document.getElementById("doc-approval-count");
    const logsList = document.getElementById("doc-log-list");
    const attachmentsList = document.getElementById("doc-attachment-list");
    const dispatchList = document.getElementById("doc-dispatch-list");
    const dispatchNumberEl = document.getElementById("doc-dispatch-number");
    const dispatchDateEl = document.getElementById("doc-dispatch-date");
    const dispatchMethodEl = document.getElementById("doc-dispatch-methods");
    const versionsList = document.getElementById("doc-versions-list");
    const buttons = document.querySelectorAll("[data-doc-action]");
    let currentDoc = null;

    setupActionButtons();
    refreshDetail();

    function setupActionButtons() {
      if (!buttons.length) {
        return;
      }
      const actionMap = {
        publish: {
          success: "Đã phát hành văn bản.",
          payload: collectPublishPayload,
        },
        recall: {
          success: "Đã thu hồi phát hành.",
          payload: () => ({
            comment: "Thu hồi phát hành từ giao diện Văn thư.",
          }),
        },
      };
      const hasDocumentAction = (method) =>
        typeof api.documents?.[method] === "function";

      buttons.forEach((button) => {
        const action = button.dataset.docAction;
        const config = actionMap[action];
        if (!config) {
          button.disabled = true;
          button.title = "Chức năng chưa được cấu hình.";
          return;
        }
        const method = action === "publish" ? "publish" : "recall";
        if (!hasDocumentAction(method)) {
          button.disabled = true;
          button.title = "Hành động xử lý qua giao diện MVT.";
          button.addEventListener("click", () => {
            showActionToast(
              "Các thao tác xử lý văn bản đang chạy trong giao diện nhiệm vụ.",
              "warn"
            );
          });
          return;
        }
        button.addEventListener("click", async () => {
          if (button.disabled) return;
          button.disabled = true;
          try {
            const payload =
              typeof config.payload === "function"
                ? config.payload()
                : config.payload;
            if (payload === null) {
              button.disabled = false;
              return;
            }
            await api.documents[method](docId, payload);
            showActionToast(config.success, "success");
          } catch (error) {
            console.error(`[vanthu] Lỗi thực hiện hành động ${action}:`, error);
            showActionToast(resolveActionError(error), "error");
            button.disabled = false;
          }
        });
      });
    }

    function refreshDetail() {
      clearError();
      if (summaryEl) {
        summaryEl.textContent = "Đang tải dữ liệu văn bản…";
      }
      return api.documents
        .retrieve(docId)
        .then((doc) => {
          currentDoc = doc;
          renderDoc(doc);
          return Promise.allSettled([
            fetchAssignments(),
            fetchApprovals(),
            fetchAttachments(),
            fetchLogs(),
            fetchDispatches(),
            fetchVersions(),
          ]);
        })
        .catch((error) => {
          console.error("[vanthu] Lỗi tải chi tiết văn bản đi:", error);
          showErrorMessage(resolveDetailError(error));
        });
    }

    function renderDoc(doc) {
      const normalized =
        typeof helpers.normalizeOutboundDoc === "function"
          ? helpers.normalizeOutboundDoc(doc)
          : fallbackNormalize(doc);
      updateBadges(normalized);
      if (detailNumberEl) {
        detailNumberEl.textContent = doc.document_id || doc.id || "—";
      }
      if (titleEl) {
        titleEl.textContent = normalized.title || doc.title || "Văn bản đi";
      }
      if (summaryEl) {
        summaryEl.textContent =
          doc.summary || doc.content || normalized.title || "—";
      }
      if (metaCode) {
        metaCode.textContent =
          doc.document_code || normalized.number || normalized.issue_number || "—";
      }
    if (metaIssue) {
      metaIssue.textContent =
        doc.issue_number || normalized.issue_number || "—";
    }
    if (metaIssued) {
      metaIssued.textContent = formatDateValue(
        normalized.issuedDate || doc.issued_date || doc.created_at
      );
    }
    if (metaSignDate) {
      metaSignDate.textContent = formatDateValue(
        doc.sign_date || doc.presented_at || doc.submitted_at || ""
      );
    }
      if (metaSigner) {
        metaSigner.textContent =
          normalized.signer || formatUserName(doc.signer) || "—";
      }
      if (metaSignerMethod) {
        const method =
          doc.sign_method || doc.signature_method || doc.signing_method || "";
        metaSignerMethod.textContent = method || "—";
      }
      if (metaDepartment) {
        metaDepartment.textContent =
          doc.department?.name || doc.created_by?.department?.name || "";
      }
      if (metaPublisher) {
        metaPublisher.textContent = doc.publisher?.name || doc.sender || "";
      }
      if (metaRecipients) {
        metaRecipients.textContent =
          normalized.recipients || doc.receiver || doc.department?.name || "—";
      }
    }

    function updateBadges(normalized) {
      if (directionBadge) {
        directionBadge.textContent = "Văn bản đi";
      }
      if (statusBadge) {
        const statusClass = statusBadgeClass(normalized.statusKey);
        statusBadge.className = `px-2.5 py-1 rounded-full ${statusClass}`;
        statusBadge.textContent = normalized.statusLabel || "Chưa xử lý";
      }
      if (urgencyBadge) {
        const urgencyClass = urgencyBadgeClass(normalized.urgencyKey);
        urgencyBadge.className = `px-2.5 py-1 rounded-full ${urgencyClass}`;
        urgencyBadge.textContent = normalized.urgencyLabel || "Thường";
      }
    }

    function fetchAssignments() {
      if (!api.documents?.assignments) {
        renderAssignments([]);
        return Promise.resolve();
      }
      return api.documents
        .assignments(docId)
        .then(renderAssignments)
        .catch((error) => {
          console.warn("[vanthu] Lỗi tải phân công:", error);
          renderAssignments([]);
        });
    }

    function fetchApprovals() {
      if (!api.documents?.approvals) {
        renderApprovals([]);
        return Promise.resolve();
      }
      return api.documents
        .approvals(docId)
        .then(renderApprovals)
        .catch((error) => {
          console.warn("[vanthu] Lỗi tải quy trình trình ký:", error);
          renderApprovals([]);
        });
    }

    function fetchAttachments() {
      if (!api.documents?.attachments) {
        renderAttachments([]);
        return Promise.resolve();
      }
      return api.documents
        .attachments(docId)
        .then(renderAttachments)
        .catch((error) => {
          console.warn("[vanthu] Lỗi tải đính kèm:", error);
          renderAttachments([]);
        });
    }

    function fetchLogs() {
      if (!api.documents?.workflowLogs) {
        renderLogs([]);
        return Promise.resolve();
      }
      return api.documents
        .workflowLogs(docId)
        .then(renderLogs)
        .catch((error) => {
          console.warn("[vanthu] Lỗi tải nhật ký:", error);
          renderLogs([]);
        });
    }

    function fetchDispatches() {
      if (!api.documents?.dispatches) {
        renderDispatches([]);
        return Promise.resolve();
      }
      return api.documents
        .dispatches(docId)
        .then(renderDispatches)
        .catch((error) => {
          console.warn("[vanthu] Lỗi tải lịch gửi:", error);
          renderDispatches([]);
        });
    }

    function fetchVersions() {
      if (!api.documents?.versions) {
        renderVersions([]);
        return Promise.resolve();
      }
      return api.documents
        .versions(docId)
        .then(renderVersions)
        .catch((error) => {
          console.warn("[vanthu] Lỗi tải phiên bản:", error);
          renderVersions([]);
        });
    }

    function renderAssignments(list) {
      if (!assignmentsBody) return;
      assignmentsBody.innerHTML = "";
      if (!Array.isArray(list) || !list.length) {
        assignmentsBody.appendChild(
          createPlaceholderRow("Chưa có phân công xử lý.")
        );
        return;
      }
      list.forEach((item) => {
        assignmentsBody.appendChild(buildAssignmentRow(item));
      });
    }

    function renderApprovals(list) {
      if (!approvalsList) return;
      if (!Array.isArray(list) || !list.length) {
        approvalsList.innerHTML =
          '<li class="text-[13px] text-slate-500">Chưa có quy trình trình ký.</li>';
        if (approvalsCount) {
          approvalsCount.textContent = "0";
        }
        return;
      }
      approvalsList.innerHTML = list
        .map((step) => {
          const approver = formatUserName(step.approver);
          const label = step.step_no ? `Bước ${step.step_no}` : "Bước duyệt";
          const decision = step.decision || "Chưa quyết định";
          const decidedAt = formatDateTime(
            step.decided_at || step.updated_at
          );
          const note = step.comment || "";
          return `<li class="rounded-lg border border-slate-100 p-3">
            <div class="flex items-center justify-between gap-2">
              <div>
                <div class="font-semibold text-slate-700">${escapeHtml(
                  label
                )}</div>
                <div class="text-[12px] text-slate-500">${escapeHtml(
                  approver || "—"
                )}</div>
              </div>
              <span class="text-[12px] text-slate-500">
                ${escapeHtml(decision)}
                ${decidedAt ? " • " + escapeHtml(decidedAt) : ""}
              </span>
            </div>
            ${
              note
                ? `<p class="mt-1 text-[12.5px] text-slate-600">${escapeHtml(
                    note
                  )}</p>`
                : ""
            }
          </li>`;
        })
        .join("");
      if (approvalsCount) {
        approvalsCount.textContent = String(list.length);
      }
    }

    function renderLogs(list) {
      if (!logsList) return;
      if (!Array.isArray(list) || !list.length) {
        logsList.innerHTML =
          '<li class="text-[13px] text-slate-500">Chưa có nhật ký xử lý.</li>';
        return;
      }
      logsList.innerHTML = list
        .map((log) => {
          const time = formatDateTime(
            log.acted_at || log.created_at || log.updated_at
          );
          const action = log.action || log.activity || "Hoạt động";
          const actor = formatUserName(log.actor) || "Hệ thống";
          const note = log.comment || "";
          return `<li class="rounded-lg border border-slate-100 p-3">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-slate-700">${escapeHtml(
                `${time} • ${action}`
              )}</span>
              <span class="text-[12px] text-slate-500">${escapeHtml(actor)}</span>
            </div>
            ${
              note
                ? `<p class="mt-1 text-[12.5px] text-slate-600">${escapeHtml(
                    note
                  )}</p>`
                : ""
            }
          </li>`;
        })
        .join("");
    }

    function renderAttachments(list) {
      if (!attachmentsList) return;
      if (!Array.isArray(list) || !list.length) {
        attachmentsList.innerHTML =
          '<li class="text-[13px] text-slate-500">Chưa có tệp đính kèm.</li>';
        return;
      }
      attachmentsList.innerHTML = list
        .map((file) => {
          const name = file.file_name || file.attachment_id;
          const uploadedAt = formatDateTime(file.uploaded_at);
          const uploader = formatUserName(file.uploaded_by);
          const extras = [uploadedAt, uploader].filter(Boolean).join(" • ");
          const url =
            file.file_url && /^https?:\/\//i.test(file.file_url)
              ? file.file_url
              : file.file_url
              ? api.buildUrl(file.file_url)
              : null;
          return `<li class="rounded-lg border border-slate-100 p-3 flex items-center justify-between gap-3">
            <div>
              <div class="font-medium text-slate-700">${escapeHtml(name)}</div>
              <div class="text-[12px] text-slate-500">${escapeHtml(extras)}</div>
            </div>
            ${
              url
                ? `<a class="btn-icon" href="${url}" target="_blank" rel="noreferrer" title="Tải xuống">⬇</a>`
                : '<span class="btn-icon text-slate-400" title="Không có đường dẫn">⬇</span>'
            }
          </li>`;
        })
        .join("");
    }

    function renderVersions(list) {
      if (!versionsList) return;
      if (!Array.isArray(list) || !list.length) {
        versionsList.innerHTML =
          '<li class="text-[13px] text-slate-500">Chưa có phiên bản.</li>';
        return;
      }
      versionsList.innerHTML = list
        .map((version) => {
          const label = version.version_no
            ? `Phiên bản ${version.version_no}`
            : "Phiên bản";
          const note = version.note || "";
          const time = formatDateTime(version.created_at || version.updated_at);
          const author = formatUserName(version.changed_by);
          return `<li class="rounded-lg border border-slate-100 p-3 space-y-1">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-slate-700">${escapeHtml(label)}</span>
              <span class="text-[12px] text-slate-500">${escapeHtml(time)}</span>
            </div>
            <div class="text-[12px] text-slate-500">
              ${escapeHtml(author)}
              ${note ? " • " + escapeHtml(note) : ""}
            </div>
          </li>`;
        })
        .join("");
    }

    function renderDispatches(list) {
      if (!dispatchList) return;
      if (!Array.isArray(list) || !list.length) {
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
            item.organization?.name || item.contact?.full_name || item.method || "Đơn vị nhận";
          const status = item.status || "—";
          const time = formatDateTime(item.sent_at);
          const tracking = item.tracking_no
            ? `Tracking: ${escapeHtml(item.tracking_no)}`
            : "";
          return `<li class="rounded-lg border border-slate-100 p-3 space-y-2">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-slate-700">${escapeHtml(receiver)}</span>
              <span class="text-[12px] text-slate-500">${escapeHtml(status)}</span>
            </div>
            <div class="text-[12px] text-slate-500">
              ${time || "Chưa gửi"} ${tracking ? " • " + tracking : ""}
            </div>
          </li>`;
        })
        .join("");
      const latest = list[0];
      if (dispatchNumberEl) {
        dispatchNumberEl.textContent =
          latest?.tracking_no || latest?.dispatch_id || "—";
      }
      if (dispatchDateEl) {
        dispatchDateEl.textContent = formatDateValue(latest?.sent_at);
      }
      if (dispatchMethodEl) {
        dispatchMethodEl.textContent = latest?.method || "—";
      }
    }

    function showErrorMessage(message) {
      if (!detailError) return;
      detailError.textContent = message || "Không thể tải dữ liệu văn bản.";
      detailError.classList.remove("hidden");
    }

    function clearError() {
      if (!detailError) return;
      detailError.textContent = "";
      detailError.classList.add("hidden");
    }

    function resolveDetailError(error) {
      if (helpers.resolveErrorMessage) {
        return helpers.resolveErrorMessage(error);
      }
      if (!error) return "Không thể tải dữ liệu từ máy chủ.";
      if (error.data) {
        if (typeof error.data === "string") return error.data;
        if (error.data.detail) return String(error.data.detail);
      }
      if (error.message) return String(error.message);
      return "Không thể tải dữ liệu từ máy chủ.";
    }

    function fallbackNormalize(raw) {
      if (!raw) {
        return {
          title: "",
          statusKey: "draft",
          statusLabel: "Chưa xử lý",
          urgencyKey: "thuong",
          urgencyLabel: "Thường",
          number: "",
          issue_number: "",
          issuedDate: "",
          signer: "",
          recipients: "",
        };
      }
      const statusKey = mapStatusKey(
        raw.status_name || raw.status?.name || raw.status?.code || ""
      );
      const statusLabel = mapStatusLabel(statusKey, raw.status_name);
      const urgencyKey = mapUrgencyKey(raw.urgency?.name || raw.urgency?.code || "");
      const urgencyLabel = mapUrgencyLabel(urgencyKey);
      return {
        title: raw.title || "",
        statusKey,
        statusLabel,
        urgencyKey,
        urgencyLabel,
        number: raw.document_code || raw.outgoing_number || "",
        issue_number: raw.issue_number || "",
        issuedDate: raw.issued_date || raw.created_at || "",
        signer:
          raw.signer?.full_name || raw.creator?.full_name || raw.creator?.username || "",
        recipients: raw.department?.name || raw.receiver || "",
      };
    }

    function mapStatusKey(value) {
      const raw = (value || "").toString().toLowerCase();
      if (raw.includes("phat") || raw.includes("publish") || raw.includes("ban_hanh")) return "published";
      if (raw.includes("ky") || raw.includes("approve") || raw.includes("duyet")) return "approved";
      if (raw.includes("cho") || raw.includes("pending") || raw.includes("trinh")) return "pending-sign";
      return "draft";
    }

    function mapStatusLabel(key, fallback) {
      switch (key) {
        case "pending-sign":
          return "Chờ ký";
        case "approved":
          return "Đã ký duyệt";
        case "published":
          return "Đã phát hành";
        default:
          return fallback || "Soạn thảo";
      }
    }

    function mapUrgencyKey(value) {
      const raw = (value || "").toString().toLowerCase();
      if (raw.includes("rat") || raw.includes("very_urgent") || raw.includes("hoa_toc")) return "ratkhan";
      if (raw.includes("khan") || raw.includes("urgent")) return "khan";
      if (raw.includes("cao") || raw.includes("high")) return "cao";
      return "thuong";
    }

    function mapUrgencyLabel(key) {
      switch (key) {
        case "ratkhan":
          return "Rất khẩn";
        case "khan":
          return "Khẩn";
        case "cao":
          return "Cao";
        default:
          return "Thường";
      }
    }

    function statusBadgeClass(key) {
      switch (key) {
        case "pending-sign":
          return "chip chip-warn";
        case "approved":
          return "chip chip-info";
        case "published":
          return "chip chip-success";
        default:
          return "chip chip-muted";
      }
    }

    function urgencyBadgeClass(key) {
      switch (key) {
        case "ratkhan":
        case "khan":
          return "chip chip-danger";
        case "cao":
          return "chip chip-info";
        default:
          return "chip chip-muted";
      }
    }

    function buildAssignmentRow(item) {
      const tr = document.createElement("tr");
      const assignee = formatUserName(item.user) || "Người dùng";
      const assignor = formatUserName(item.assigned_by) || "—";
      const due = item.due_at ? formatDateValue(item.due_at) : "Chưa có hạn";
      const roleLabel = assignmentRoleLabel(item.role_on_doc);
      tr.innerHTML = `
        <td class="px-5 py-3">
          ${escapeHtml(assignee)}
          <div class="text-[12px] text-slate-500">${escapeHtml(roleLabel)}</div>
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
          <span class="chip chip--amber">Đang xử lý</span>
        </td>
      `;
      return tr;
    }

    function createPlaceholderRow(message) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td class="px-5 py-3 text-center text-[13px] text-slate-500" colspan="5">${escapeHtml(
        message
      )}</td>`;
      return tr;
    }

    function assignmentRoleLabel(role) {
      switch (role) {
        case "owner":
          return "Chủ trì";
        case "assignee":
          return "Người được giao";
        case "watcher":
          return "Theo dõi";
        default:
          return role || "Đã giao";
      }
    }

    function formatUserName(data) {
      if (!data) return "";
      return data.full_name || data.name || data.username || "";
    }

    function formatDateValue(value) {
      if (!value) return "—";
      if (typeof helpers.formatDate === "function") {
        const formatted = helpers.formatDate(value);
        if (formatted) return formatted;
      }
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        const [year, month, day] = value.split("-");
        return `${day}/${month}/${year}`;
      }
      return value;
    }

    function formatDateTime(value) {
      if (!value) return "";
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        const hours = String(date.getHours()).padStart(2, "0");
        const minutes = String(date.getMinutes()).padStart(2, "0");
        return `${formatDateValue(date.toISOString().slice(0, 10))} ${hours}:${minutes}`;
      }
      return formatDateValue(value);
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

    function collectPublishPayload() {
      const defaultYear =
        (currentDoc?.issued_date &&
          Number.parseInt(currentDoc.issued_date.slice(0, 4), 10)) ||
        new Date().getFullYear();
      const prefixInput = window.prompt(
        "Tiền tố số phát hành",
        currentDoc?.issue_number?.split("/")?.[0] || "UBND"
      );
      if (prefixInput === null) {
        return null;
      }
      const postfixInput = window.prompt("Hậu tố số phát hành", "/VP");
      if (postfixInput === null) {
        return null;
      }
      const yearInput = window.prompt("Năm phát hành", String(defaultYear));
      if (yearInput === null) {
        return null;
      }
      const year = Number.parseInt(yearInput, 10);
      return {
        prefix: prefixInput.trim() || "UBND",
        postfix: postfixInput.trim() || "/VP",
        year: Number.isFinite(year) ? year : defaultYear,
      };
    }

    function resolveActionError(error) {
      if (helpers.resolveErrorMessage) {
        return helpers.resolveErrorMessage(error);
      }
      if (!error) return "Không thể thực hiện thao tác.";
      if (error.data) {
        if (typeof error.data === "string") return error.data;
        if (error.data.detail) return String(error.data.detail);
      }
      if (error.message) return String(error.message);
      return "Không thể thực hiện thao tác.";
    }

    function showActionToast(message, tone = "info") {
      const toast = document.getElementById("toast");
      if (!toast) {
        console.log(message);
        return;
      }
      toast.textContent = message;
      toast.classList.remove(
        "toast--show",
        "toast--error",
        "toast--success",
        "toast--warn"
      );
      if (tone === "error") toast.classList.add("toast--error");
      else if (tone === "success") toast.classList.add("toast--success");
      toast.classList.add("toast--show");
      setTimeout(() => toast.classList.remove("toast--show"), 2200);
    }

    function getDocId() {
      const meta = document.getElementById("doc-detail-meta");
      const fromMeta = meta?.dataset?.docId;
      if (fromMeta) {
        return fromMeta.trim();
      }
      const matches = (window.location.pathname || "").match(/vanbandi\/([^/]+)/i);
      return matches?.[1] ? matches[1].trim() : "";
    }
  };

  pageHandlers["sodangky"] = function () {
    const qs = (sel, root = document) => root.querySelector(sel);
    const api = window.ApiClient;
    if (!api) {
      console.warn("[vanthu] ApiClient không sẵn sàng; bỏ qua trang sổ đăng ký.");
      return;
    }

    const role = (document.body?.dataset?.role || "").toLowerCase();
    const canManage = role === "vanthu" || role === "quantri";
    const toastEl = qs("#toast");

    const filterYear = qs("#register-filter-year");
    const filterDirection = qs("#register-filter-direction");
    const filterStatus = qs("#register-filter-status");
    const filterDept = qs("#register-filter-dept");
    const filterApplyBtn = qs("#register-filter-apply");
    const filterResetBtn = qs("#register-filter-reset");

    const registerBody = qs("#register-table-body");
    const registerSummary = qs("#register-summary");
    const registerPagination = qs("#register-pagination");
    const registerPrev = qs("#register-prev");
    const registerNext = qs("#register-next");
    const registerOpenBtn = qs("#btn-open-register-form");
    const registerFormPanel = qs("#register-form-panel");
    const registerForm = qs("#register-form");
    const registerFormFeedback = qs("#register-form-feedback");
    const registerFormClose = qs("#register-form-close");
    const registerFormReset = qs("#register-form-reset");
    const importBtn = qs("#btn-import-register");
    const exportBtn = qs("#btn-export-register");

    const numberingBody = qs("#numbering-table-body");
    const numberingOpenBtn = qs("#btn-open-numbering-form");
    const numberingPanel = qs("#numbering-form-panel");
    const numberingForm = qs("#numbering-form");
    const numberingFeedback = qs("#numbering-form-feedback");
    const numberingCloseBtn = qs("#numbering-form-close");
    const numberingResetBtn = qs("#numbering-form-reset");

    const state = {
      registers: {
        items: [],
        loading: false,
        page: 1,
        pageSize: 20,
        totalPages: 1,
        count: 0,
        filters: {
          year: "",
          direction: "",
          status: "",
          dept: "",
        },
      },
      numbering: {
        items: [],
        loading: false,
      },
    };

    const resetLabels = {
      yearly: "Hằng năm",
      quarterly: "Theo quý",
      monthly: "Hằng tháng",
      never: "Không reset",
    };

    const directionLabels = {
      den: "Văn bản đến",
      di: "Văn bản đi",
      incoming: "Văn bản đến",
      outgoing: "Văn bản đi",
    };

    function toast(message, type = "info") {
      if (!toastEl) {
        console.log(message);
        return;
      }
      toastEl.textContent = message;
      toastEl.classList.remove("toast--show", "toast--error", "toast--success", "toast--warn");
      if (type === "error") toastEl.classList.add("toast--error");
      else if (type === "success") toastEl.classList.add("toast--success");
      else if (type === "warn") toastEl.classList.add("toast--warn");
      toastEl.classList.add("toast--show");
      setTimeout(() => toastEl.classList.remove("toast--show"), 2200);
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

    function resolveErrorMessage(error) {
      if (!error) return "Không thể thực hiện thao tác.";
      if (error.data) {
        if (typeof error.data === "string") return error.data;
        if (error.data.detail) return String(error.data.detail);
        const first = Object.keys(error.data)[0];
        if (first && Array.isArray(error.data[first]) && error.data[first].length) {
          return String(error.data[first][0]);
        }
      }
      if (error.message) return String(error.message);
      return "Không thể thực hiện thao tác.";
    }

    // ===== Sổ đăng ký =====
    if (!canManage && registerOpenBtn) {
      registerOpenBtn.classList.add("hidden");
      registerOpenBtn.disabled = true;
    }
    if (!canManage && importBtn) {
      importBtn.disabled = true;
      importBtn.classList.add("opacity-60", "cursor-not-allowed");
    }

    function setRegisterLoading() {
      if (!registerBody) return;
      registerBody.innerHTML =
        '<tr><td colspan="8" class="px-4 py-6 text-center text-slate-400 text-sm">Đang tải dữ liệu...</td></tr>';
    }

    function updateRegisterPager() {
      const { page, totalPages, count } = state.registers;
      if (registerSummary) {
        registerSummary.textContent =
          count > 0 ? `${count} sổ theo bộ lọc hiện tại` : "Chưa có dữ liệu phù hợp.";
      }
      if (registerPagination) {
        registerPagination.textContent =
          count > 0 ? `Trang ${page}/${totalPages}` : "Không có dữ liệu.";
      }
      if (registerPrev) {
        registerPrev.disabled = page <= 1;
        registerPrev.classList.toggle("opacity-50", registerPrev.disabled);
      }
      if (registerNext) {
        registerNext.disabled = page >= totalPages;
        registerNext.classList.toggle("opacity-50", registerNext.disabled);
      }
    }

    function renderRegisters() {
      if (!registerBody) return;
      const deptKeyword = (state.registers.filters.dept || "").trim().toLowerCase();
      let items = state.registers.items || [];
      if (deptKeyword) {
        items = items.filter((item) => {
          const name = (item.department?.name || "").toLowerCase();
          return name.includes(deptKeyword);
        });
      }
      if (!items.length) {
        registerBody.innerHTML =
          '<tr><td colspan="8" class="px-4 py-6 text-center text-slate-400 text-sm">Không có sổ đăng ký nào.</td></tr>';
        updateRegisterPager();
        return;
      }
      registerBody.innerHTML = items
        .map((item) => {
          const id = item.register_id;
          const status = item.is_active ? "Đang hoạt động" : "Đã khóa";
          const statusClass = item.is_active ? "text-emerald-600" : "text-slate-500";
          const actionLabel = item.is_active ? "Khoá" : "Mở";
          const prefix = item.prefix || "—";
          const suffix = item.suffix || "—";
          const nextSequence = item.next_sequence ?? 0;
          const reset = resetLabels[item.reset_policy] || item.reset_policy || "—";
          const direction = directionLabels[item.direction] || item.direction;
          const deptName = item.department?.name || "—";
          const managerControls = canManage
            ? `<div class="flex items-center gap-2">
                <button data-register-action="edit" data-id="${id}" class="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">Sửa</button>
                <button data-register-action="toggle" data-id="${id}" class="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">${actionLabel}</button>
              </div>`
            : '<span class="text-xs text-slate-400">Chỉ xem</span>';
          const detailLink = `<a href="/vanthu/sodangky/${id}/" class="text-blue-600 hover:underline text-xs font-medium">Xem văn bản đã lưu</a>`;
          const actionButtons = `<div class="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
            ${detailLink}
            ${managerControls}
          </div>`;

          return `<tr>
            <td class="px-4 py-3">
              <div class="font-medium text-slate-900">${escapeHtml(item.name)}</div>
              <div class="text-xs text-slate-400">ID: ${id}</div>
            </td>
            <td class="px-4 py-3">${escapeHtml(direction)}</td>
            <td class="px-4 py-3">${item.year || "—"}</td>
            <td class="px-4 py-3">
              <div class="text-sm">Prefix: <span class="font-medium">${escapeHtml(prefix)}</span></div>
              <div class="text-sm">Suffix: <span class="font-medium">${escapeHtml(suffix)}</span></div>
              <div class="text-xs text-slate-400">Độ dài: ${item.padding || 0}</div>
            </td>
            <td class="px-4 py-3">${nextSequence}</td>
            <td class="px-4 py-3">${escapeHtml(reset)}</td>
            <td class="px-4 py-3">
              <span class="${statusClass} font-medium">${status}</span>
              <div class="text-xs text-slate-400">${escapeHtml(deptName)}</div>
            </td>
            <td class="px-4 py-3 text-right">${actionButtons}</td>
          </tr>`;
        })
        .join("");
      updateRegisterPager();
    }

    async function loadRegisters({ resetPage = false } = {}) {
      if (state.registers.loading) return;
      if (resetPage) state.registers.page = 1;
      state.registers.loading = true;
      setRegisterLoading();
      try {
        const params = {
          page: state.registers.page,
          page_size: state.registers.pageSize,
        };
        if (state.registers.filters.direction) params.direction = state.registers.filters.direction;
        if (state.registers.filters.year) params.year = state.registers.filters.year;
        if (state.registers.filters.status === "active") params.is_active = true;
        if (state.registers.filters.status === "inactive") params.is_active = false;
        const data = await api.registerBooks.list(params);
        const results = api.extractItems(data);
        state.registers.items = results;
        const meta = api.extractPageMeta(data);
        state.registers.count = meta.totalItems;
        state.registers.page = meta.page;
        state.registers.pageSize = meta.pageSize;
        state.registers.totalPages = meta.totalPages;
        renderRegisters();
      } catch (error) {
        console.error("[vanthu] loadRegisters error", error);
        if (registerBody) {
          registerBody.innerHTML = `<tr><td colspan="8" class="px-4 py-6 text-center text-rose-500 text-sm">${escapeHtml(
            resolveErrorMessage(error)
          )}</td></tr>`;
        }
        updateRegisterPager();
      } finally {
        state.registers.loading = false;
      }
    }

    function getRegisterPayload() {
      const id = qs("#register-id")?.value?.trim() || "";
      const name = qs("#register-name")?.value?.trim() || "";
      const direction = qs("#register-direction")?.value || "den";
      const year = Number(qs("#register-year")?.value || 0);
      const prefix = qs("#register-prefix")?.value?.trim() || null;
      const suffix = qs("#register-suffix")?.value?.trim() || null;
      const padding = Number(qs("#register-padding")?.value || 4);
      const resetPolicy = qs("#register-reset")?.value || "yearly";
      const description = qs("#register-description")?.value?.trim() || null;
      const isActive = !!qs("#register-active")?.checked;

      return {
        id,
        payload: {
          name,
          direction,
          year,
          prefix,
          suffix,
          padding,
          reset_policy: resetPolicy,
          description,
          is_active: isActive,
        },
      };
    }

    function fillRegisterForm(item) {
      qs("#register-id").value = item?.register_id || "";
      qs("#register-name").value = item?.name || "";
      qs("#register-direction").value = item?.direction || "den";
      qs("#register-year").value = item?.year || new Date().getFullYear();
      qs("#register-prefix").value = item?.prefix || "";
      qs("#register-suffix").value = item?.suffix || "";
      qs("#register-padding").value = item?.padding || 4;
      qs("#register-reset").value = item?.reset_policy || "yearly";
      qs("#register-description").value = item?.description || "";
      qs("#register-active").checked = item?.is_active ?? true;
      if (registerFormFeedback) registerFormFeedback.textContent = "";
    }

    function openRegisterForm(item = null) {
      if (!registerFormPanel) return;
      fillRegisterForm(item);
      registerFormPanel.classList.remove("hidden");
      registerFormPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function closeRegisterForm() {
      if (registerFormPanel) registerFormPanel.classList.add("hidden");
      if (registerForm) registerForm.reset();
      qs("#register-id").value = "";
      if (registerFormFeedback) registerFormFeedback.textContent = "";
    }

    async function submitRegisterForm(event) {
      event.preventDefault();
      if (!canManage) {
        toast("Bạn không có quyền chỉnh sửa sổ đăng ký.", "error");
        return;
      }
      const { id, payload } = getRegisterPayload();
      if (!payload.name) {
        registerFormFeedback.textContent = "Vui lòng nhập tên sổ.";
        return;
      }
      if (!payload.year || payload.year < 2010) {
        registerFormFeedback.textContent = "Năm áp dụng không hợp lệ.";
        return;
      }
      try {
        if (id) {
          await api.registerBooks.update(id, payload);
          toast("Đã cập nhật sổ đăng ký.", "success");
        } else {
          await api.registerBooks.create(payload);
          toast("Đã tạo sổ đăng ký.", "success");
        }
        closeRegisterForm();
        await loadRegisters({ resetPage: !id });
      } catch (error) {
        console.error("[vanthu] submitRegisterForm error", error);
        registerFormFeedback.textContent = resolveErrorMessage(error);
      }
    }

    async function toggleRegister(id) {
      if (!canManage) {
        toast("Bạn không có quyền thao tác.", "error");
        return;
      }
      const target = state.registers.items.find((item) => item.register_id === Number(id));
      if (!target) {
        toast("Không tìm thấy sổ đăng ký.", "error");
        return;
      }
      try {
        await api.registerBooks.update(id, { is_active: !target.is_active });
        toast(target.is_active ? "Đã khoá sổ đăng ký." : "Đã mở sổ đăng ký.", "success");
        await loadRegisters();
      } catch (error) {
        console.error("[vanthu] toggleRegister error", error);
        toast(resolveErrorMessage(error), "error");
      }
    }

    if (registerOpenBtn) {
      registerOpenBtn.addEventListener("click", () => {
        if (!canManage) {
          toast("Bạn không có quyền tạo sổ mới.", "error");
          return;
        }
        openRegisterForm({
          year: new Date().getFullYear(),
          direction: "den",
          padding: 4,
          reset_policy: "yearly",
          is_active: true,
        });
      });
    }
    if (registerForm) registerForm.addEventListener("submit", submitRegisterForm);
    if (registerFormClose) registerFormClose.addEventListener("click", () => closeRegisterForm());
    if (registerFormReset)
      registerFormReset.addEventListener("click", () => {
        if (registerForm) registerForm.reset();
        qs("#register-id").value = "";
        registerFormFeedback.textContent = "";
      });

    if (registerPrev)
      registerPrev.addEventListener("click", () => {
        if (state.registers.page <= 1) return;
        state.registers.page -= 1;
        loadRegisters();
      });
    if (registerNext)
      registerNext.addEventListener("click", () => {
        if (state.registers.page >= state.registers.totalPages) return;
        state.registers.page += 1;
        loadRegisters();
      });

    if (filterApplyBtn)
      filterApplyBtn.addEventListener("click", () => {
        state.registers.filters.year = (filterYear?.value || "").trim();
        state.registers.filters.direction = filterDirection?.value || "";
        state.registers.filters.status = filterStatus?.value || "";
        state.registers.filters.dept = (filterDept?.value || "").trim();
        loadRegisters({ resetPage: true });
      });
    if (filterResetBtn)
      filterResetBtn.addEventListener("click", () => {
        if (filterYear) filterYear.value = "";
        if (filterDirection) filterDirection.value = "";
        if (filterStatus) filterStatus.value = "";
        if (filterDept) filterDept.value = "";
        state.registers.filters = { year: "", direction: "", status: "", dept: "" };
        loadRegisters({ resetPage: true });
      });

    if (registerBody) {
      registerBody.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-register-action]");
        if (!btn) return;
        const id = btn.dataset.id;
        if (!id) return;
        if (btn.dataset.registerAction === "edit") {
          if (!canManage) {
            toast("Bạn không có quyền chỉnh sửa.", "error");
            return;
          }
          const item = state.registers.items.find((x) => x.register_id === Number(id));
          if (item) openRegisterForm(item);
        }
        if (btn.dataset.registerAction === "toggle") {
          toggleRegister(id);
        }
      });
    }

    if (importBtn) {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = ".xlsx,.xls,.csv,.json";
      fileInput.style.display = "none";
      document.body.appendChild(fileInput);

      importBtn.addEventListener("click", () => {
        if (!canManage) {
          toast("Bạn không có quyền nhập sổ.", "error");
          return;
        }
        const registerId = window.prompt(
          "Nhập ID sổ cần nhập (register_id):",
          String(state.registers.items[0]?.register_id || "")
        );
        if (!registerId) return;
        fileInput.dataset.registerId = registerId;
        fileInput.value = "";
        fileInput.click();
      });

      fileInput.addEventListener("change", async () => {
        const registerId = fileInput.dataset.registerId;
        const file = fileInput.files?.[0];
        if (!registerId || !file) return;
        try {
          const formData = new FormData();
          formData.append("register_id", registerId);
          formData.append("file", file);
          await api.registerBooks.import(formData);
          toast("Đã gửi yêu cầu nhập sổ.", "success");
        } catch (error) {
          console.error("[vanthu] import register error", error);
          toast(resolveErrorMessage(error), "error");
        }
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener("click", async () => {
        const registerId = window.prompt(
          "Nhập ID sổ cần xuất (để trống để xuất theo bộ lọc hiện tại):",
          ""
        );
        const params = {};
        if (registerId) params.register_id = registerId;
        if (state.registers.filters.year) params.year = state.registers.filters.year;
        if (state.registers.filters.direction) params.direction = state.registers.filters.direction;
        if (state.registers.filters.status === "active") params.is_active = true;
        if (state.registers.filters.status === "inactive") params.is_active = false;
        try {
          const data = await api.registerBooks.export(params);
          toast("Đã tạo bản xuất. Vui lòng tải xuống từ liên kết được cấp.", "success");
          if (data?.download_url) {
            const url = data.download_url.startsWith("http")
              ? data.download_url
              : api.buildUrl(data.download_url, null);
            window.open(url, "_blank");
          }
        } catch (error) {
          console.error("[vanthu] export register error", error);
          toast(resolveErrorMessage(error), "error");
        }
      });
    }

    // ===== Quy tắc đánh số =====
    function openNumberingForm(item = null) {
      if (!numberingPanel) return;
      qs("#numbering-id").value = item?.rule_id || "";
      qs("#numbering-code").value = item?.code || "";
      qs("#numbering-name").value = item?.name || "";
      qs("#numbering-target").value = item?.target || "outgoing";
      qs("#numbering-prefix").value = item?.prefix || "";
      qs("#numbering-suffix").value = item?.suffix || "";
      qs("#numbering-padding").value = item?.padding || 4;
      qs("#numbering-start").value = item?.start_sequence || 1;
      qs("#numbering-reset").value = item?.reset_policy || "yearly";
      qs("#numbering-description").value = item?.description || "";
      qs("#numbering-active").checked = item?.is_active ?? true;
      if (numberingFeedback) numberingFeedback.textContent = "";
      numberingPanel.classList.remove("hidden");
      numberingPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function closeNumberingForm() {
      if (!numberingPanel) return;
      numberingPanel.classList.add("hidden");
      if (numberingForm) numberingForm.reset();
      qs("#numbering-id").value = "";
      numberingFeedback.textContent = "";
    }

    function renderNumbering() {
      if (!numberingBody) return;
      const items = state.numbering.items || [];
      if (!items.length) {
        numberingBody.innerHTML =
          '<tr><td colspan="9" class="px-4 py-6 text-center text-slate-400 text-sm">Chưa có quy tắc đánh số.</td></tr>';
        return;
      }
      numberingBody.innerHTML = items
        .map((item) => {
          const id = item.rule_id;
          const status = item.is_active ? "Kích hoạt" : "Đã khóa";
          const statusClass = item.is_active ? "text-emerald-600" : "text-slate-500";
          const toggleLabel = item.is_active ? "Khoá" : "Mở";
          const prefix = item.prefix || "—";
          const suffix = item.suffix || "—";
          const nextValue = item.next_sequence ?? item.start_sequence ?? 0;
          const reset = resetLabels[item.reset_policy] || item.reset_policy || "—";
          const target = directionLabels[item.target] || item.target;
          const actions = canManage
            ? `<div class="flex items-center justify-end gap-2">
                <button data-numbering-action="edit" data-id="${id}" class="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">Sửa</button>
                <button data-numbering-action="toggle" data-id="${id}" class="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">${toggleLabel}</button>
                <button data-numbering-action="delete" data-id="${id}" class="rounded border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50">Xoá</button>
              </div>`
            : '<span class="text-xs text-slate-400">Chỉ xem</span>';
          return `<tr>
            <td class="px-4 py-3">
              <div class="font-medium text-slate-900">${escapeHtml(item.code)}</div>
              <div class="text-xs text-slate-400">ID: ${id}</div>
            </td>
            <td class="px-4 py-3">${escapeHtml(item.name)}</td>
            <td class="px-4 py-3">${escapeHtml(target)}</td>
            <td class="px-4 py-3">
              <div class="text-sm">Prefix: <span class="font-medium">${escapeHtml(prefix)}</span></div>
              <div class="text-sm">Suffix: <span class="font-medium">${escapeHtml(suffix)}</span></div>
            </td>
            <td class="px-4 py-3">${escapeHtml(reset)}</td>
            <td class="px-4 py-3">${nextValue}</td>
            <td class="px-4 py-3"><span class="${statusClass} font-medium">${status}</span></td>
            <td class="px-4 py-3 text-right">${actions}</td>
          </tr>`;
        })
        .join("");
    }

    async function loadNumbering() {
      if (state.numbering.loading) return;
      state.numbering.loading = true;
      if (numberingBody) {
        numberingBody.innerHTML =
          '<tr><td colspan="9" class="px-4 py-6 text-center text-slate-400 text-sm">Đang tải dữ liệu...</td></tr>';
      }
      try {
        const data = await api.numberingRules.list({ page_size: 100 });
        state.numbering.items = api.extractItems(data);
        renderNumbering();
      } catch (error) {
        console.error("[vanthu] loadNumbering error", error);
        if (numberingBody) {
          numberingBody.innerHTML = `<tr><td colspan="9" class="px-4 py-6 text-center text-rose-500 text-sm">${escapeHtml(
            resolveErrorMessage(error)
          )}</td></tr>`;
        }
      } finally {
        state.numbering.loading = false;
      }
    }

    async function submitNumbering(event) {
      event.preventDefault();
      if (!canManage) {
        toast("Bạn không có quyền chỉnh sửa quy tắc.", "error");
        return;
      }
      const id = qs("#numbering-id")?.value?.trim();
      const payload = {
        code: qs("#numbering-code")?.value?.trim() || "",
        name: qs("#numbering-name")?.value?.trim() || "",
        target: qs("#numbering-target")?.value || "outgoing",
        prefix: qs("#numbering-prefix")?.value?.trim() || null,
        suffix: qs("#numbering-suffix")?.value?.trim() || null,
        padding: Number(qs("#numbering-padding")?.value || 4),
        start_sequence: Number(qs("#numbering-start")?.value || 1),
        reset_policy: qs("#numbering-reset")?.value || "yearly",
        description: qs("#numbering-description")?.value?.trim() || null,
        is_active: !!qs("#numbering-active")?.checked,
      };
      if (!payload.code || !payload.name) {
        numberingFeedback.textContent = "Vui lòng nhập đầy đủ mã và tên quy tắc.";
        return;
      }
      try {
        if (id) {
          await api.numberingRules.update(id, payload);
          toast("Đã cập nhật quy tắc đánh số.", "success");
        } else {
          payload.next_sequence = payload.start_sequence;
          await api.numberingRules.create(payload);
          toast("Đã tạo quy tắc đánh số.", "success");
        }
        closeNumberingForm();
        await loadNumbering();
      } catch (error) {
        console.error("[vanthu] submitNumbering error", error);
        numberingFeedback.textContent = resolveErrorMessage(error);
      }
    }

    async function toggleNumbering(id) {
      if (!canManage) {
        toast("Bạn không có quyền thao tác.", "error");
        return;
      }
      const item = state.numbering.items.find((x) => x.rule_id === Number(id));
      if (!item) {
        toast("Không tìm thấy quy tắc.", "error");
        return;
      }
      try {
        await api.numberingRules.update(id, { is_active: !item.is_active });
        toast(item.is_active ? "Đã khoá quy tắc." : "Đã kích hoạt quy tắc.", "success");
        await loadNumbering();
      } catch (error) {
        console.error("[vanthu] toggleNumbering error", error);
        toast(resolveErrorMessage(error), "error");
      }
    }

    async function deleteNumbering(id) {
      if (!canManage) {
        toast("Bạn không có quyền xoá.", "error");
        return;
      }
      if (!window.confirm("Bạn chắc chắn muốn xoá quy tắc này?")) return;
      try {
        await api.numberingRules.remove(id);
        toast("Đã xoá quy tắc đánh số.", "success");
        await loadNumbering();
      } catch (error) {
        console.error("[vanthu] deleteNumbering error", error);
        toast(resolveErrorMessage(error), "error");
      }
    }

    if (numberingOpenBtn) {
      numberingOpenBtn.addEventListener("click", () => {
        if (!canManage) {
          toast("Bạn không có quyền tạo quy tắc.", "error");
          return;
        }
        openNumberingForm({
          target: "outgoing",
          padding: 4,
          start_sequence: 1,
          reset_policy: "yearly",
          is_active: true,
        });
      });
    }
    if (numberingForm) numberingForm.addEventListener("submit", submitNumbering);
    if (numberingCloseBtn) numberingCloseBtn.addEventListener("click", () => closeNumberingForm());
    if (numberingResetBtn)
      numberingResetBtn.addEventListener("click", () => {
        if (numberingForm) numberingForm.reset();
        qs("#numbering-id").value = "";
        numberingFeedback.textContent = "";
      });

    if (numberingBody) {
      numberingBody.addEventListener("click", (event) => {
        const btn = event.target.closest("[data-numbering-action]");
        if (!btn) return;
        const id = btn.dataset.id;
        if (!id) return;
        if (btn.dataset.numberingAction === "edit") {
          if (!canManage) {
            toast("Bạn không có quyền chỉnh sửa.", "error");
            return;
          }
          const item = state.numbering.items.find((x) => x.rule_id === Number(id));
          if (item) openNumberingForm(item);
        }
        if (btn.dataset.numberingAction === "toggle") {
          toggleNumbering(id);
        }
        if (btn.dataset.numberingAction === "delete") {
          deleteNumbering(id);
        }
      });
    }

    loadRegisters({ resetPage: true });
    loadNumbering();
  };


  pageHandlers["hosocongviec-taomoi"] = function () {
    const form = document.getElementById("createCaseForm");
    if (!form) return;

    form.addEventListener("submit", (e) => {
      const formData = new FormData(form);
      const payload = Object.fromEntries(formData.entries());
      
      if (!payload.title || !payload.department || !payload.due_date || !payload.leader) {
        e.preventDefault();
        alert("Vui lòng điền đầy đủ các trường bắt buộc (*)");
        return;
      }

      const btn = form.querySelector('button[type="submit"]');
      if (btn) {
        // Don't disable immediately to allow form data to be sent, 
        // or ensure we don't preventDefault.
        // Actually, if we disable the button, it might not submit? 
        // No, submit event happens after click.
        // But let's just change text.
        btn.textContent = "Đang tạo...";
      }
      // Allow default submission to VanthuCaseCreateView
    });
  };

})();
