/* ============================================================
   catalog-page.js
   Helper to hydrate trang Danh mục với dữ liệu thật từ API
   Dùng chung cho các vai trò (văn thư, chuyên viên, lãnh đạo).
============================================================ */
(function (global) {
  const CatalogPage = global.CatalogPage || {};

  const qs = (selector, root = document) => root.querySelector(selector);
  const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const COLORS = ["blue", "amber", "emerald", "violet", "rose", "slate"];

  const escapeHtml = (value) => {
    const text = value == null ? "" : String(value);
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return text.replace(/[&<>"']/g, (ch) => map[ch] || ch);
  };

  const normalizeText = (value) =>
    (value || "")
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const debounce = (fn, delay = 160) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), delay);
    };
  };

  const getColspan = (tbody, fallback = 4) => {
    if (!tbody) return fallback;
    const table = tbody.closest("table");
    const headers = table ? table.querySelectorAll("thead th") : null;
    return headers && headers.length ? headers.length : fallback;
  };

  const setMessage = (tbody, text, tone = "text-slate-500") => {
    if (!tbody) return;
    const span = getColspan(tbody);
    tbody.innerHTML = `
      <tr data-dm-message="true">
        <td colspan="${span}" class="px-4 py-4 text-center text-[13px] ${tone}">
          ${escapeHtml(text || "Không có dữ liệu.")}
        </td>
      </tr>
    `;
  };

  const setLoading = (tbody) => setMessage(tbody, "Đang tải dữ liệu...");

  const toArray = (payload, api) => {
    if (!payload) return [];
    if (api && typeof api.extractItems === "function") {
      const items = api.extractItems(payload);
      if (Array.isArray(items)) return items;
    }
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.results)) return payload.results;
    if (Array.isArray(payload)) return payload;
    return [];
  };

  const formatError = (error, fallback = "Không thể tải dữ liệu.") => {
    if (!error) return fallback;
    if (error.data && typeof error.data.detail === "string") return error.data.detail;
    if (error.message) return error.message;
    return fallback;
  };

  const renderRows = (tbody, rows, emptyText) => {
    if (!tbody) return;
    if (!rows.length) {
      setMessage(tbody, emptyText || "Chưa có dữ liệu.");
      return;
    }
    tbody.innerHTML = rows.join("");
  };

  const statusBadge = (label, tone = "default") =>
    `<span class="chip chip--${tone}">${escapeHtml(label || "")}</span>`;

  const renderDocPreviewList = (previews = []) => {
    if (!Array.isArray(previews) || previews.length === 0) {
      return "—";
    }
    return previews
      .map((doc) => {
        const title = doc?.title || "Văn bản";
        const id = doc?.document_id || doc?.id || "";
        return `<div class="truncate text-[13px] text-slate-700" title="${escapeHtml(title)}">• ${escapeHtml(
          title
        )}${id ? ` (#${escapeHtml(id)})` : ""}</div>`;
      })
      .join("");
  };

  const renderViewButton = (item, type) => {
    const list = Array.isArray(item?.documents_preview) ? item.documents_preview : [];
    const count = Number.isFinite(item?.documents_count) ? item.documents_count : 0;
    const payload = encodeURIComponent(JSON.stringify(list));
    if (!count) return "—";
    return `
      <button
        type="button"
        class="text-blue-600 hover:underline text-[13px]"
        data-action="view-docs"
        data-docs-type="${escapeHtml(type || "")}"
        data-docs-name="${escapeHtml(item?.name || item?.type_name || item?.status_name || item?.level_name || "")}"
        data-docs-count="${escapeHtml(count)}"
        data-docs-preview="${payload}"
      >
        Xem (${escapeHtml(count)})
      </button>
    `;
  };

  const renderDocTypeRow = (item, index) => {
    const name = item?.name || item?.type_name || `Loại #${item?.id || index + 1}`;
    const desc = item?.description || "—";
    const count = Number.isFinite(item?.documents_count) ? item.documents_count : "—";
    const previews = Array.isArray(item?.documents_preview) ? item.documents_preview : [];
    return `
      <tr data-dm-row="true" class="border-b border-slate-100">
        <td class="px-4 py-3">${escapeHtml(name)}</td>
        <td class="px-4 py-3 text-slate-600">${escapeHtml(desc)}</td>
        <td class="px-4 py-3 text-center text-slate-700">${escapeHtml(count)}</td>
        <td class="px-4 py-3 text-[13px] text-slate-600">${renderViewButton(item, "document_type")}</td>
      </tr>
    `;
  };

  const renderStatusRow = (item, index) => {
    const name = item?.name || item?.status_name || `Trạng thái #${item?.id || index + 1}`;
    const desc = item?.description || "—";
    const count = Number.isFinite(item?.documents_count) ? item.documents_count : "—";
    const previews = Array.isArray(item?.documents_preview) ? item.documents_preview : [];
    const tone = COLORS[index % COLORS.length];
    return `
      <tr data-dm-row="true" class="border-b border-slate-100">
        <td class="px-4 py-3">${escapeHtml(name)}</td>
        <td class="px-4 py-3 text-slate-600">${escapeHtml(desc)}</td>
        <td class="px-4 py-3">${statusBadge(name, tone)}</td>
        <td class="px-4 py-3 text-center text-slate-700">${escapeHtml(count)}</td>
        <td class="px-4 py-3 text-[13px] text-slate-600">${renderViewButton(item, "status")}</td>
      </tr>
    `;
  };

  const renderUrgencyRow = (item, index) => {
    const name = item?.name || item?.level_name || `Mức độ #${item?.id || index + 1}`;
    const desc = item?.description || "—";
    const count = Number.isFinite(item?.documents_count) ? item.documents_count : "—";
    const previews = Array.isArray(item?.documents_preview) ? item.documents_preview : [];
    const tone = COLORS[index % COLORS.length];
    return `
      <tr data-dm-row="true" class="border-b border-slate-100">
        <td class="px-4 py-3">${escapeHtml(name)}</td>
        <td class="px-4 py-3 text-slate-600">${escapeHtml(desc)}</td>
        <td class="px-4 py-3">${statusBadge(name, tone)}</td>
        <td class="px-4 py-3 text-center text-slate-700">${escapeHtml(count)}</td>
        <td class="px-4 py-3 text-[13px] text-slate-600">${renderViewButton(item, "urgency")}</td>
      </tr>
    `;
  };

  const renderDepartmentRow = (item) => {
    const name = item?.name || "Phòng ban";
    const address = item?.address || "";
    const code = item?.department_code ? `Mã: ${item.department_code}` : "";
    const desc = address || code || "—";
    const count = Number.isFinite(item?.documents_count) ? item.documents_count : "—";
    const lead = item?.lead_user_name || "Chưa phân công";
    const leadId = item?.lead_user_id ? ` (${item.lead_user_id})` : "";
    return `
      <tr data-dm-row="true" class="border-b border-slate-100">
        <td class="px-4 py-3">
          <div class="font-medium text-slate-800">${escapeHtml(name)}</div>
          <div class="text-[12.5px] text-slate-500">${escapeHtml(code || "")}</div>
        </td>
        <td class="px-4 py-3 text-slate-600">${escapeHtml(desc)}</td>
        <td class="px-4 py-3 text-slate-700">${escapeHtml(lead)}${escapeHtml(leadId)}</td>
        <td class="px-4 py-3 text-[13px] text-slate-700 text-center">${escapeHtml(count)}</td>
        <td class="px-4 py-3 text-[13px] text-slate-600">${renderViewButton(item, "department")}</td>
      </tr>
    `;
  };

  const renderOrganizationRow = (item) => {
    const name = item?.name || "Cơ quan";
    const desc =
      item?.address || item?.email || item?.phone || "Chưa cập nhật thông tin liên hệ";
    const classification =
      item?.tax_code || (item?.is_active === false ? "Ngưng hoạt động" : "Đang hoạt động");
    const tone = item?.is_active === false ? "rose" : "default";
    const count = Number.isFinite(item?.dispatches_count) ? item.dispatches_count : "—";
    const normalized = {
      ...item,
      documents_count: Number.isFinite(item?.dispatches_count) ? item.dispatches_count : 0,
      documents_preview: Array.isArray(item?.documents_preview) ? item.documents_preview : [],
    };
    return `
      <tr data-dm-row="true" class="border-b border-slate-100">
        <td class="px-4 py-3">
          <div class="font-medium text-slate-800">${escapeHtml(name)}</div>
        </td>
        <td class="px-4 py-3 text-slate-600">${escapeHtml(desc)}</td>
        <td class="px-4 py-3">${statusBadge(classification, tone)}</td>
        <td class="px-4 py-3 text-center text-[13px] text-slate-700">${escapeHtml(count)}</td>
        <td class="px-4 py-3 text-[13px] text-slate-600">${renderViewButton(normalized, "organization")}</td>
      </tr>
    `;
  };

  const setupTabsAndSearch = (root) => {
    const buttons = qsa("[data-tab]", root);
    const panels = qsa("[data-panel]", root);
    const searchInput = qs("#dm-search", root);
    let activeTab = buttons[0]?.dataset?.tab || panels[0]?.dataset?.panel || null;

    const applySearch = () => {
      const keyword = normalizeText(searchInput?.value || "");
      const activePanel = panels.find((panel) => !panel.classList.contains("hidden"));
      if (!activePanel) return;
      const rows = qsa("tbody tr[data-dm-row]", activePanel);
      if (!rows.length) return;
      let visible = 0;
      rows.forEach((row) => {
        const text = normalizeText(row.innerText);
        const show = !keyword || text.includes(keyword);
        row.classList.toggle("hidden", !show);
        if (show) visible++;
      });
      const messageRow = activePanel.querySelector("tbody tr[data-dm-message]");
      if (messageRow) {
        messageRow.classList.toggle("hidden", visible > 0);
      }
    };

    const showTab = (tabName = activeTab) => {
      if (!tabName) return;
      activeTab = tabName;
      panels.forEach((panel) => {
        const on = panel.dataset.panel === tabName;
        panel.classList.toggle("hidden", !on);
      });
      buttons.forEach((btn) => {
        const on = btn.dataset.tab === tabName;
        btn.classList.toggle("bg-slate-900", on);
        btn.classList.toggle("text-white", on);
        btn.classList.toggle("bg-slate-100", !on);
        btn.classList.toggle("text-slate-600", !on);
        btn.setAttribute("aria-pressed", String(on));
      });
      applySearch();
    };

    buttons.forEach((btn) => btn.addEventListener("click", () => showTab(btn.dataset.tab)));
    if (searchInput) {
      searchInput.addEventListener("input", debounce(applySearch, 150));
    }
    showTab(activeTab);

    return { applySearch, showTab };
  };

  function initReadonlyCatalog(options = {}) {
    const root = options.root || document;
    const api = options.api || global.ApiClient;
    if (!root || !api) {
      return null;
    }

    const layout = global.Layout || {};
    const role = (layout.role || document.body?.dataset?.role || "").toLowerCase();
    const canViewOrganizations = role === "vt" || role === "quantri";

    const ready =
      layout.authPromise && typeof layout.authPromise.then === "function"
        ? layout.authPromise.catch(() => null)
        : Promise.resolve(null);

    const bodies = {
      types: qs('[data-panel="loai"] tbody', root),
      statuses: qs('[data-panel="trangthai"] tbody', root),
      urgency: qs('[data-panel="mucdo"] tbody', root),
      departments: qs('[data-panel="phongban"] tbody', root),
      organizations: qs('[data-panel="coquan"] tbody', root),
    };

    const modal = {
      overlay: qs("#dm-modal"),
      title: qs("#dm-modal-title"),
      body: qs("#dm-modal-body"),
      closeBtn: qs("#dm-modal-close"),
    };

    const openModal = (title, docs) => {
      if (!modal.overlay || !modal.title || !modal.body) return;
      modal.title.textContent = title || "Danh sách văn bản";
      if (!Array.isArray(docs) || !docs.length) {
        modal.body.innerHTML =
          '<p class="text-[13px] text-slate-500">Chưa có văn bản nào.</p>';
      } else {
        modal.body.innerHTML = docs
          .map((doc) => {
            const name = doc?.title || "Văn bản";
            const id = doc?.document_id || doc?.id || "";
            return `<li class="px-3 py-2 border-b border-slate-100 last:border-b-0">
              <div class="font-medium text-slate-800">${escapeHtml(name)}</div>
              ${id ? `<div class="text-[12px] text-slate-500">#${escapeHtml(id)}</div>` : ""}
            </li>`;
          })
          .join("");
      }
      modal.overlay.classList.remove("hidden");
    };

    const closeModal = () => {
      modal.overlay?.classList.add("hidden");
    };

    modal.closeBtn?.addEventListener("click", closeModal);
    modal.overlay?.addEventListener("click", (e) => {
      if (e.target === modal.overlay) closeModal();
    });

    let authFailed = false;
    const authMessage =
      "Phiên đã hết hạn hoặc chưa đăng nhập. Vui lòng đăng nhập lại để xem danh mục.";
    const forbiddenMessage = "Bạn không có quyền xem danh mục này.";

    const { applySearch } = setupTabsAndSearch(root);

    const handleError = (tbody, error, fallback) => {
      if (!tbody) return;
      const status = error?.status;
      if (status === 401) {
        authFailed = true;
        setMessage(tbody, authMessage, "text-rose-600");
        return;
      }
      if (status === 403) {
        setMessage(tbody, forbiddenMessage, "text-amber-600");
        return;
      }
      setMessage(tbody, formatError(error, fallback), "text-rose-600");
    };

    const ensureAuthAwareMessage = () => {
      if (!authFailed) return;
      Object.values(bodies).forEach((body) => {
        if (body) {
          const hasData = body.querySelector("[data-dm-row]");
          if (!hasData) {
            setMessage(body, authMessage, "text-rose-600");
          }
        }
      });
    };

    const loadDocTypes = async () => {
      if (!bodies.types) return;
      if (authFailed) {
        setMessage(bodies.types, authMessage, "text-rose-600");
        return;
      }
      setLoading(bodies.types);
      if (!api.catalog || typeof api.catalog.list !== "function") {
        setMessage(bodies.types, "API danh mục chưa sẵn sàng.", "text-rose-600");
        return;
      }
      try {
        const response = await api.catalog.list("document-types", {
          page_size: 200,
          with_counts: true,
          with_docs: true,
        });
        const items = toArray(response, api);
        renderRows(bodies.types, items.map(renderDocTypeRow), "Chưa có loại văn bản.");
      } catch (error) {
        handleError(bodies.types, error, "Không thể tải loại văn bản.");
      } finally {
        applySearch();
        ensureAuthAwareMessage();
      }
    };

    const loadStatuses = async () => {
      if (!bodies.statuses) return;
      if (authFailed) {
        setMessage(bodies.statuses, authMessage, "text-rose-600");
        return;
      }
      setLoading(bodies.statuses);
      if (!api.catalog || typeof api.catalog.list !== "function") {
        setMessage(bodies.statuses, "API danh mục chưa sẵn sàng.", "text-rose-600");
        return;
      }
      try {
        const response = await api.catalog.list("document-statuses", {
          page_size: 200,
          with_counts: true,
          with_docs: true,
        });
        const items = toArray(response, api);
        renderRows(bodies.statuses, items.map(renderStatusRow), "Chưa có trạng thái văn bản.");
      } catch (error) {
        handleError(bodies.statuses, error, "Không thể tải trạng thái văn bản.");
      } finally {
        applySearch();
        ensureAuthAwareMessage();
      }
    };

    const loadUrgency = async () => {
      if (!bodies.urgency) return;
      if (authFailed) {
        setMessage(bodies.urgency, authMessage, "text-rose-600");
        return;
      }
      setLoading(bodies.urgency);
      if (!api.catalog || typeof api.catalog.list !== "function") {
        setMessage(bodies.urgency, "API danh mục chưa sẵn sàng.", "text-rose-600");
        return;
      }
      try {
        const response = await api.catalog.list("urgency-levels", {
          page_size: 200,
          with_counts: true,
          with_docs: true,
        });
        const items = toArray(response, api);
        renderRows(bodies.urgency, items.map(renderUrgencyRow), "Chưa có mức độ ưu tiên.");
      } catch (error) {
        handleError(bodies.urgency, error, "Không thể tải mức độ ưu tiên.");
      } finally {
        applySearch();
        ensureAuthAwareMessage();
      }
    };

    const loadDepartments = async () => {
      if (!bodies.departments) return;
      if (authFailed) {
        setMessage(bodies.departments, authMessage, "text-rose-600");
        return;
      }
      setLoading(bodies.departments);
      if (!api.departments || typeof api.departments.list !== "function") {
        setMessage(bodies.departments, "API phòng ban chưa sẵn sàng.", "text-rose-600");
        return;
      }
      try {
        const response = await api.departments.list({
          page_size: 200,
          ordering: "name",
          with_counts: true,
          with_docs: true,
        });
        const items = toArray(response, api);
        renderRows(bodies.departments, items.map(renderDepartmentRow), "Chưa có phòng ban.");
      } catch (error) {
        handleError(bodies.departments, error, "Không thể tải phòng ban.");
      } finally {
        applySearch();
        ensureAuthAwareMessage();
      }
    };

    const loadOrganizations = async () => {
      if (!bodies.organizations) return;
      if (!canViewOrganizations) {
        setMessage(
          bodies.organizations,
          "Bạn không có quyền xem danh mục cơ quan ngoài.",
          "text-amber-600"
        );
        return;
      }
      if (authFailed) {
        setMessage(bodies.organizations, authMessage, "text-rose-600");
        return;
      }
      setLoading(bodies.organizations);
      if (!api.organizations || typeof api.organizations.list !== "function") {
        setMessage(bodies.organizations, "API cơ quan chưa sẵn sàng.", "text-rose-600");
        return;
      }
      try {
        const response = await api.organizations.list({
          page_size: 200,
          ordering: "name",
          with_counts: true,
          with_docs: true,
        });
        const items = toArray(response, api);
        renderRows(bodies.organizations, items.map(renderOrganizationRow), "Chưa có cơ quan.");
      } catch (error) {
        handleError(bodies.organizations, error, "Không thể tải cơ quan.");
      } finally {
        applySearch();
        ensureAuthAwareMessage();
      }
    };

    const hydrate = () => {
      loadDocTypes();
      loadStatuses();
      loadUrgency();
      loadDepartments();
      loadOrganizations();
    };

    root.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-action='view-docs']");
      if (!btn) return;
      let previews = [];
      if (btn.dataset.docsPreview) {
        try {
          previews = JSON.parse(decodeURIComponent(btn.dataset.docsPreview));
        } catch (_) {
          previews = [];
        }
      }
      const name = btn.dataset.docsName || "Danh mục";
      const count = btn.dataset.docsCount || "";
      const title = count ? `${name} · ${count} văn bản` : name;
      openModal(title, previews);
    });

    ready.then(hydrate).catch(hydrate);

    return { reload: hydrate };
  }

  CatalogPage.initReadonlyCatalog = initReadonlyCatalog;
  global.CatalogPage = CatalogPage;
})(window);
