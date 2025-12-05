(function () {
  const api = window.ApiClient;
  if (!api?.cases?.list) {
    console.warn(
      "[chuyenvien-hosocongviec] ApiClient.cases.list không sẵn sàng; bỏ qua danh sách hồ sơ."
    );
    return;
  }

  onReady(init);

  function onReady(callback) {
    const layout = window.Layout || {};
    const ready =
      layout.authPromise && typeof layout.authPromise.then === "function"
        ? layout.authPromise
        : Promise.resolve();
    ready.then(callback).catch(() => console.error("Không thể xác thực."));
  }

  function init() {
    const PRIORITY_LABELS = {
      URGENT: "Khẩn cấp",
      HIGH: "Cao",
      MEDIUM: "Trung bình",
      LOW: "Thấp",
    };
    const STATUS_LABELS = {
      MOI_TAO: "Mới tạo",
      CHO_PHAN_CONG: "Chờ phân công",
      DA_PHAN_CONG: "Đã phân công",
      DANG_THUC_HIEN: "Đang thực hiện",
      TAM_DUNG: "Tạm dừng",
      CHO_DUYET_DONG: "Chờ duyệt đóng",
      DONG: "Đã đóng",
    };

    const tbody = document.getElementById("cvCaseTable")?.querySelector("tbody");
    const summaryEl = document.querySelector("[data-count='rows']");
    const searchInput = document.querySelector("input[data-filter='q']");
    const statusSelect = document.querySelector("select[data-filter='status']");
    const prioritySelect = document.querySelector("select[data-filter='priority']");
    const btnMyTasks = document.getElementById("btnMyTasks");
    const kpis = {
      total: document.querySelector("[data-case-kpi='total']"),
      inProgress: document.querySelector("[data-case-kpi='in-progress']"),
      done: document.querySelector("[data-case-kpi='done']"),
      overdue: document.querySelector("[data-case-kpi='overdue']"),
    };

    let allCases = [];
    let myTasks = false;

    fetchCases();
    registerFilters();

    function fetchCases() {
      renderMessage("Đang tải danh sách công việc...");
      api.cases
        .list({ page: 1, page_size: 100, include: "participants" })
        .then((payload) => {
          allCases = extractItemsFromResponse(payload);
          applyFilters();
        })
        .catch(() => renderMessage("Không thể tải dữ liệu."));
    }

    function registerFilters() {
      if (searchInput) {
        const onSearch = debounce(() => applyFilters(), 250);
        searchInput.addEventListener("input", onSearch);
      }
      if (statusSelect) {
        statusSelect.addEventListener("change", applyFilters);
      }
      if (prioritySelect) {
        prioritySelect.addEventListener("change", applyFilters);
      }
      if (btnMyTasks) {
        btnMyTasks.addEventListener("click", () => {
          myTasks = !myTasks;
          btnMyTasks.classList.toggle("active", myTasks);
          applyFilters();
        });
      }
    }

    function applyFilters() {
      const q = normalizeText(searchInput?.value || "");
      const status = (statusSelect?.value || "").toUpperCase();
      const priority = (prioritySelect?.value || "").toUpperCase();

      let list = allCases.filter((item) => {
        const title = normalizeText(item.title || item.name || "");
        const code = normalizeText(item.code || item.case_code || "");
        if (q && !title.includes(q) && !code.includes(q)) return false;
        const sk = statusKeyFromCase(item);
        if (status && sk !== status) return false;
        const pk = (item.priority || "").toUpperCase();
        if (priority && pk !== priority) return false;
        return true;
      });

      // Apply myTasks filter (client-side)
      if (myTasks) {
        const AI = window.ActionIndicator;
        if (AI && typeof AI.caseNeedsAction === "function") {
          list = list.filter((caseItem) => AI.caseNeedsAction(caseItem));
        }
      }

      renderList(list);
      updateKPIs(list);
      updateSummary(list.length);
    }

    function renderList(list) {
      if (!tbody) return;
      if (!list.length) {
        renderMessage("Không có công việc nào phù hợp.");
        return;
      }
      tbody.innerHTML = "";
      const fragment = document.createDocumentFragment();
      list.forEach((item) => fragment.appendChild(createCaseRow(item)));
      tbody.appendChild(fragment);
    }

    function updateSummary(count) {
      if (summaryEl) summaryEl.textContent = `Hiển thị ${count} công việc`;
    }

    function updateKPIs(list) {
      let total = 0, inProgress = 0, done = 0, overdue = 0;
      (list || []).forEach((item) => {
        total += 1;
        const sk = statusKeyFromCase(item);
        if (isDoneStatus(sk)) done += 1;
        else if (sk === "DANG_THUC_HIEN") inProgress += 1;
        if (isOverdue(item)) overdue += 1;
      });
      setText(kpis.total, total);
      setText(kpis.inProgress, inProgress);
      setText(kpis.done, done);
      setText(kpis.overdue, overdue);
    }

    function createCaseRow(item) {
      // Check if case needs action from current user
      const AI = window.ActionIndicator;
      const needsAction = AI && typeof AI.caseNeedsAction === "function" ? AI.caseNeedsAction(item) : false;
      const indicatorHtml = needsAction ? '<span class="action-indicator" style="position:absolute;top:8px;left:8px;width:10px;height:10px;background:#22c55e;border-radius:50%;animation:action-pulse 2s ease-in-out infinite;"></span>' : '';

      const tr = document.createElement("tr");
      tr.className = "border-b border-slate-100 bg-white relative" + (needsAction ? " action-card" : "");
      tr.dataset.needsAction = needsAction ? "1" : "0";
      tr.dataset.caseId = item.id || "";
      tr.dataset.caseCode = item.code || item.case_code || "";

      const title = escapeHtml(item.title || item.name || "Công việc");
      const description = escapeHtml(item.description || "");
      const leader = escapeHtml(
        item.leader?.full_name || item.owner?.full_name || item.assigned_to?.full_name || "—"
      );
      const createdAt = formatDate(item.created_at);
      const due = formatDate(item.deadline || item.due_date);
      const statusKey = statusKeyFromCase(item);
      const statusLabel = STATUS_LABELS[statusKey] || statusKey;
      const priorityKey = (item.priority || "MEDIUM").toUpperCase();
      const priorityLabel = PRIORITY_LABELS[priorityKey] || priorityKey;
      const detailUrl = item.id
        ? `/chuyenvien/hosocongviec/${item.id}/`
        : "/chuyenvien/hosocongviec/";
      const progress = Math.min(100, Math.max(0, item.progress_percent || 0));

      const isLate = isOverdue(item);
      const dueCls = isLate ? "text-rose-600 font-medium" : "";
      const statusCls = isLate
        ? "chip chip--rose"
        : statusKey === "DONG"
        ? "chip chip--green"
        : statusKey === "DANG_THUC_HIEN"
        ? "chip chip--blue"
        : "chip chip--default";
      const priorityCls =
        priorityKey === "URGENT"
          ? "chip chip--rose"
          : priorityKey === "HIGH"
          ? "chip chip--amber"
          : "chip chip--default";

      tr.innerHTML = `
        ${indicatorHtml}
        <td class="py-3 pr-3 align-top">
          <div class="font-medium break-words">
            <a href="${detailUrl}" class="text-blue-700 hover:underline flex flex-wrap items-center gap-2">
              <span class="badge-dot bg-blue-600"></span>
              ${title}
            </a>
          </div>
          <div class="text-xs text-slate-500">${description || title}</div>
        </td>
        <td class="py-3 pr-3 whitespace-nowrap align-top">${leader}</td>
        <td class="py-3 pr-3 whitespace-nowrap align-top">${createdAt}</td>
        <td class="py-3 pr-3 whitespace-nowrap align-top ${dueCls}">${due}</td>
        <td class="py-3 pr-3 align-top">
          <div class="w-28 h-2 rounded-full bg-slate-200">
            <div class="h-full bg-slate-700 rounded-full" style="width:${progress}%"></div>
          </div>
          <div class="text-xs text-slate-500 mt-1">${progress}%</div>
        </td>
        <td class="py-3 pr-3 whitespace-nowrap align-top">
          <span class="${priorityCls}">${priorityLabel}</span>
        </td>
        <td class="py-3 pr-3 whitespace-nowrap align-top">
          <span class="${statusCls}">${isLate ? "Trễ hạn" : statusLabel}</span>
        </td>
        <td class="py-3 pr-0 text-right align-top">
          <div class="flex items-center justify-end gap-2">
            <a href="${detailUrl}" class="btn-icon" title="Xem">👁</a>
          </div>
        </td>
      `;
      return tr;
    }

    function renderMessage(text) {
      if (!tbody) return;
      tbody.innerHTML = `<tr><td colspan="8" class="py-6 text-center text-sm text-slate-500">${escapeHtml(
        text
      )}</td></tr>`;
    }

    function setText(element, value) {
      if (element) element.textContent = String(value);
    }

    function extractItemsFromResponse(payload) {
      if (Array.isArray(payload)) return payload;
      if (payload?.results) return payload.results;
      if (payload?.data) return payload.data;
      if (payload?.items) return payload.items;
      return [];
    }

    function normalizeText(value) {
      return (value || "")
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .trim();
    }

    function debounce(fn, delay) {
      let timer;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
      };
    }

    function statusKeyFromCase(item) {
      const raw =
        item.status?.code ||
        item.status?.name ||
        item.status ||
        item.state ||
        "";
      return (raw || "")
        .toString()
        .toUpperCase()
        .replace(/\s+/g, "_");
    }

    function isDoneStatus(key) {
      return key === "DONG" || key === "COMPLETED" || key === "DONE";
    }

    function isOverdue(item) {
      if (isDoneStatus(statusKeyFromCase(item))) return false;
      const due = item.deadline || item.due_date;
      if (!due) return false;
      return new Date(due) < new Date();
    }

    function formatDate(value) {
      if (!value) return "—";
      const date = new Date(String(value));
      if (Number.isNaN(date.getTime())) return String(value).split("T")[0] || "—";
      return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
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
  }
})();
