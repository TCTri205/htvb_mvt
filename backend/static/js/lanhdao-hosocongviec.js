(function () {
  const api = window.ApiClient;
  if (!api?.cases?.list) {
    console.warn(
      "[lanhdao-hosocongviec] ApiClient.cases.list không sẵn sàng; bỏ qua danh sách hồ sơ."
    );
    return;
  }

  onReady(init);

  function onReady(callback) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  function init() {
    const tableBody = document.getElementById("cvCaseTableBody");
    const searchInput = document.querySelector("[data-filter='q']");
    const statusSelect = document.querySelector("[data-filter='status']");
    const prioritySelect = document.querySelector("[data-filter='priority']");
    const summaryLabel = document.querySelector("[data-count='rows']");
    const kpiTotal = document.querySelector("[data-case-kpi='total']");
    const kpiInProgress = document.querySelector("[data-case-kpi='in-progress']");
    const kpiDone = document.querySelector("[data-case-kpi='done']");
    const kpiOverdue = document.querySelector("[data-case-kpi='overdue']");

    if (!tableBody) {
      console.warn(
        "[lanhdao-hosocongviec] Không tìm thấy bảng hồ sơ; dừng khởi tạo."
      );
      return;
    }

    const state = {
      cases: [],
      keyword: "",
      status: "",
      priority: "",
    };

    registerFilters();
    renderMessage("Đang tải hồ sơ công việc...");
    fetchCases();

    async function fetchCases() {
      try {
        const response = await api.cases.list({
          ordering: "-created_at",
          page_size: 100,
        });
        state.cases = extractItemsFromResponse(response);
        applyFilters();
      } catch (error) {
        console.error("[lanhdao-hosocongviec] Lỗi khi tải hồ sơ:", error);
        renderMessage("Không thể tải dữ liệu hồ sơ công việc.");
      }
    }

    function registerFilters() {
      const debouncedSearch = debounce(applyFilters, 180);
      if (searchInput) {
        searchInput.addEventListener("input", (event) => {
          state.keyword = event.target.value || "";
          debouncedSearch();
        });
      }
      if (statusSelect) {
        statusSelect.addEventListener("change", (event) => {
          state.status = event.target.value;
          applyFilters();
        });
      }
      if (prioritySelect) {
        prioritySelect.addEventListener("change", (event) => {
          state.priority = event.target.value;
          applyFilters();
        });
      }
    }

    function applyFilters() {
      const keyword = normalizeText(state.keyword);
      const filtered = state.cases.filter((item) => {
        if (!item) return false;
        const statusKey = statusKeyFromCase(item);
        if (state.status && state.status !== statusKey) return false;
        if (state.priority) {
          const itemPriority = (item.priority || "").toString().toUpperCase();
          if (itemPriority !== state.priority) return false;
        }
        if (keyword) {
          const haystack = normalizeText(
            [
              item.case_code,
              item.title,
              item.status_name,
              item.status?.name,
              item.status?.case_status_name,
              item.description,
              item.goal,
            ]
              .filter(Boolean)
              .join(" ")
          );
          if (!haystack.includes(keyword)) {
            return false;
          }
        }
        return true;
      });
      renderList(filtered);
      updateKPIs(filtered);
    }

    function renderList(list) {
      if (!tableBody) return;
      if (!list.length) {
        renderMessage("Không có hồ sơ nào phù hợp.");
        updateSummary(0);
        return;
      }
      tableBody.innerHTML = "";
      const fragment = document.createDocumentFragment();
      list.forEach((item) => fragment.appendChild(createCaseRow(item)));
      tableBody.appendChild(fragment);
      updateSummary(list.length);
    }

    function updateSummary(count) {
      if (!summaryLabel) return;
      summaryLabel.textContent = `Hiển thị ${count} công việc`;
    }

    function updateKPIs(list) {
      const items = Array.isArray(list) ? list : [];
      const total = items.length;
      const done = items.filter((item) =>
        isDoneStatus(statusKeyFromCase(item))
      ).length;
      const overdue = items.filter(
        (item) =>
          !isDoneStatus(statusKeyFromCase(item)) && isOverdue(item)
      ).length;
      const inProgress = total - done;
      setText(kpiTotal, total);
      setText(kpiInProgress, inProgress);
      setText(kpiDone, done);
      setText(kpiOverdue, overdue);
    }

    function createCaseRow(item) {
      const tr = document.createElement("tr");
      tr.className = "border-b border-slate-100 bg-white";
      const statusKey = statusKeyFromCase(item);
      const isDone = isDoneStatus(statusKey);
      const hasOverdue = !isDone && isOverdue(item);
      const statusLabel =
        item.status?.name ||
        item.status?.case_status_name ||
        item.status_name ||
        "Chưa xác định";
      const leaderName =
        item.leader?.full_name || item.leader?.username || "Chưa có";
      const createdDate = formatDate(item.created_at);
      const dueDateValue = item.deadline || item.due_date;
      const dueDate = formatDate(dueDateValue);
      const statusClass = isDone
        ? "chip chip--green"
        : hasOverdue
        ? "chip chip--rose"
        : "chip chip--blue";
      const priorityLabel = item.priority || "";
      const priorityLine = priorityLabel
        ? `<div class="text-[12px] text-slate-500 mt-1">Mức độ: ${escapeHtml(
            priorityLabel
          )}</div>`
        : "";
      const description = item.description || item.goal || "";
      const caseId = item.case_id || item.id || "";
      const detailUrl = caseId
        ? `/lanhdao/hosocongviec/${encodeURIComponent(caseId)}/`
        : "#";

      tr.innerHTML = `
        <td class="py-3 pr-3 align-top">
          <div class="font-medium text-slate-800 break-words">
            <a href="${detailUrl}" class="text-blue-700 hover:underline flex flex-wrap items-center gap-2">
              <span class="badge-dot bg-blue-500"></span>
              ${escapeHtml(item.title || "Hồ sơ công việc")}
            </a>
          </div>
          <div class="text-[12px] text-slate-500 mt-1 line-clamp-2">${escapeHtml(
            description
          )}</div>
          ${priorityLine}
        </td>
        <td class="py-3 pr-3 whitespace-nowrap align-top">
          ${escapeHtml(leaderName)}
        </td>
        <td class="py-3 pr-3 whitespace-nowrap align-top">
          ${escapeHtml(createdDate)}
        </td>
        <td class="py-3 pr-3 whitespace-nowrap align-top ${
          hasOverdue ? "text-rose-600 font-medium" : "text-slate-600"
        }">
          ${escapeHtml(dueDate)}
        </td>
        <td class="py-3 pr-3 whitespace-nowrap align-top">
          <span class="${statusClass}">${escapeHtml(statusLabel)}</span>
        </td>
        <td class="py-3 pr-0 text-right align-top">
          <a href="${detailUrl}" class="text-sm font-medium text-blue-600 hover:text-blue-700">
            Chi tiết
          </a>
        </td>
      `;
      return tr;
    }

    function renderMessage(text) {
      if (!tableBody) return;
      tableBody.innerHTML = `<tr><td colspan="6" class="px-5 py-8 text-center text-sm text-slate-500">${escapeHtml(
        text
      )}</td></tr>`;
      updateSummary(0);
    }

    function setText(element, value) {
      if (!element) return;
      element.textContent = value != null ? String(value) : "0";
    }

    function extractItemsFromResponse(payload) {
      if (!payload) return [];
      if (Array.isArray(payload)) return payload;
      if (Array.isArray(payload.results)) return payload.results;
      if (Array.isArray(payload.items)) return payload.items;
      if (typeof api.extractItems === "function") {
        const extracted = api.extractItems(payload);
        if (Array.isArray(extracted)) return extracted;
      }
      return [];
    }

    function normalizeText(value) {
      return (value || "")
        .toString()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
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
      if (!item) return "";
      const raw =
        item.status?.code ||
        item.status?.case_status_name ||
        item.status?.name ||
        item.status_name ||
        "";
      if (!raw) return "";
      return raw.toString().trim().replace(/\s+/g, "_").toUpperCase();
    }

    function isDoneStatus(key) {
      if (!key) return false;
      return /(HOAN_TAT|DONG|LUU_TRU)/.test(key);
    }

    function isOverdue(item) {
      const value = item.deadline || item.due_date;
      if (!value) return false;
      const target = new Date(value);
      if (Number.isNaN(target.getTime())) return false;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return target < today;
    }

    function formatDate(value) {
      if (!value) return "—";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return value.slice(0, 10);
      }
      return date.toISOString().slice(0, 10);
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
