(function () {
  // CRITICAL: Set this flag FIRST, before any checks, to prevent lanhdao.js from running old code
  window.LDOutgoingListOverride = true;
  
  const pageId = (document.body?.dataset?.page || "").toLowerCase();
  if (pageId !== "vanbandi") {
    return;
  }

  // Custom status labels for Leader interface
  const STATUS_LABELS = {
    draft: "Dự thảo",
    submitted: "Chờ duyệt",
    processing: "Chờ văn thư kiểm tra",
    registered: "Đã vào sổ",
    published: "Đã phát hành",
  };

  const tableBody = document.getElementById("docTableBody");
  if (!tableBody) {
    return;
  }

  const searchTitle = document.getElementById("searchTitle");
  const searchGlobal = document.getElementById("globalSearch");
  const statusBtn = document.getElementById("btnStatusFilter");
  const statusMenu = document.getElementById("statusMenu");
  const statusLabel = document.getElementById("statusLabel");
  const levelBtn = document.getElementById("btnLevelFilter");
  const levelMenu = document.getElementById("levelMenu");
  const levelLabel = document.getElementById("levelLabel");
  const countShown = document.getElementById("countShown");
  const kpiEls = {
    draft: document.getElementById("kpiDraft"), // Add this element if it exists or reuse another
    submitted: document.getElementById("kpiPendingApprove"), // Was kpiPendingApprove (Cho duyet)
    processing: document.getElementById("kpiProcessing"), // Was kpiProcessing (Dang xu ly)
    published: document.getElementById("kpiIssued"), // Was kpiIssued (Da phat hanh)
  };

  const helpers = window.DocHelpers;
  if (!helpers) {
    console.warn(
      "[lanhdao-vanbandi] DocHelpers missing; cannot render outbound list."
    );
    return;
  }

  const api = window.ApiClient;
  const docApi = api?.documents;
  if (!docApi) {
    console.warn("[lanhdao-vanbandi] ApiClient.documents is not ready.");
    return;
  }

  const state = {
    keyword: "",
    globalKeyword: "",
    status: "all",
    level: "all",
    myTasks: false, // Filter for items needing action
  };
  const btnMyTasks = document.getElementById("btnMyTasks");

  let normalizedDocs = [];
  const filterTrigger = debounce(applyFilters, 180);

  initFilters();
  onReady(loadDocuments);

  function initFilters() {
    bindDropdown(statusBtn, statusMenu, statusLabel, "status");
    bindDropdown(levelBtn, levelMenu, levelLabel, "level");
    registerSearch(searchTitle, "keyword");
    registerSearch(searchGlobal, "globalKeyword");
    // My Tasks filter button
    if (btnMyTasks) {
      btnMyTasks.addEventListener("click", () => {
        state.myTasks = !state.myTasks;
        btnMyTasks.classList.toggle("active", state.myTasks);
        applyFilters();
      });
    }
  }

  function bindDropdown(button, menu, label, key) {
    if (!button || !menu || !label) return;
    button.dataset[key] = "all";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = !menu.classList.contains("hidden");
      menu.classList.toggle("hidden", isOpen);
      button.setAttribute("aria-expanded", isOpen ? "false" : "true");
    });
    menu.addEventListener("click", (event) => {
      const item = event.target.closest(".filter-item");
      if (!item) return;
      const value = item.getAttribute(`data-${key}`) || "all";
      label.textContent = item.textContent.trim();
      button.dataset[key] = value;
      state[key] = value;
      menu.classList.add("hidden");
      button.setAttribute("aria-expanded", "false");
      filterTrigger();
    });
    document.addEventListener("click", (event) => {
      if (
        !menu.classList.contains("hidden") &&
        !menu.contains(event.target) &&
        event.target !== button
      ) {
        menu.classList.add("hidden");
        button.setAttribute("aria-expanded", "false");
      }
    });
  }

  function registerSearch(input, key) {
    if (!input) return;
    input.addEventListener("input", (event) => {
      state[key] = event.target.value || "";
      filterTrigger();
    });
  }

  function onReady(callback) {
    if (typeof callback !== "function") return;
    if (window.Layout?.whenReady) {
      window.Layout.whenReady(callback);
      return;
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
      return;
    }
    callback();
  }

  function loadDocuments() {
    renderLoading();
    docApi
      .list({
        direction: "OUTBOUND",
        ordering: "-updated_at",
        page_size: 50,
      })
      .then((payload) => {
        const items = api.extractItems(payload) || [];
        normalizedDocs = items.map((item) =>
          helpers.normalizeOutboundDoc(item)
        );
        applyFilters();
      })
      .catch((error) => {
        const message =
          typeof helpers.resolveErrorMessage === "function"
            ? helpers.resolveErrorMessage(error)
            : "Không thể tải dữ liệu văn bản.";
        console.error("[lanhdao-vanbandi] Lỗi tải văn bản đi:", error);
        renderError(message);
      });
  }

  function applyFilters() {
    const keyword = helpers.normalizeText
      ? helpers.normalizeText(activeKeyword())
      : (activeKeyword() || "").trim();
    const normalizedKeyword = keyword || "";
    const statusTargets = mapStatusTargets(state.status);
    const levelFilter = state.level;

    let filtered = normalizedDocs.filter((doc) =>
      matchesDoc(doc, statusTargets, levelFilter, normalizedKeyword)
    );

    // Apply myTasks filter (client-side)
    if (state.myTasks) {
      const AI = window.ActionIndicator;
      if (AI && typeof AI.outboundNeedsAction === "function") {
        filtered = filtered.filter((doc) => AI.outboundNeedsAction(doc.raw || doc));
      }
    }

    renderRows(filtered);
    updateKPIs(filtered);
  }

  function matchesDoc(doc, statusTargets, levelFilter, keyword) {
    if (!doc) return false;
    if (statusTargets?.length && !statusTargets.includes(doc.statusKey)) {
      return false;
    }
    if (levelFilter !== "all") {
      const levelValue = mapLevelFromUrgency(doc.urgencyKey);
      if (!levelMatches(levelValue, levelFilter)) {
        return false;
      }
    }
    if (keyword && doc.searchText && !doc.searchText.includes(keyword)) {
      return false;
    }
    return true;
  }

  function renderRows(list) {
    tableBody.innerHTML = "";
    if (!list.length) {
      renderEmpty();
      updateCount(0);
      return;
    }
    const fragment = document.createDocumentFragment();
    list.forEach((doc) => fragment.appendChild(createRow(doc)));
    tableBody.appendChild(fragment);
    updateCount(list.length);
  }

  function updateCount(value) {
    if (!countShown) return;
    countShown.textContent = String(value);
  }

  function createRow(doc) {
    const tr = document.createElement("tr");
    // Check if document needs action from current user
    const AI = window.ActionIndicator;
    const needsAction = AI && typeof AI.outboundNeedsAction === "function" ? AI.outboundNeedsAction(doc.raw || doc) : false;
    
    const levelValue = mapLevelFromUrgency(doc.urgencyKey);
    const statusValue = mapStatusForDataset(doc.statusKey);
    tr.className = needsAction ? "action-card" : "";
    tr.dataset.row = "1";
    tr.dataset.status = statusValue;
    tr.dataset.priority = levelValue;
    tr.dataset.needsAction = needsAction ? "1" : "0";
    tr.dataset.docId = doc.id != null ? String(doc.id) : "";
    tr.dataset.docTitle = doc.title || "";
    tr.dataset.docNumber = doc.number || "";
    tr.dataset.docSigner = doc.signer || "";
    tr.dataset.docReceiver = doc.recipients || "";
    tr.dataset.docIssuedDate = doc.issuedDate || "";
    tr.dataset.docDispatchAt = doc.publishedDate || "";
    tr.dataset.docUrgency = doc.urgencyLabel || "";
    tr.dataset.docStatus = doc.statusLabel || "";

    const docId =
      doc.id ||
      doc.document_id ||
      doc.documentId ||
      doc.raw?.id ||
      doc.raw?.document_id ||
      doc.raw?.documentId ||
      "";
    const detailHref = docId
      ? `/lanhdao/vanbandi/${encodeURIComponent(docId)}/`
      : "/lanhdao/vanbandi/";

    const urgencyClass = urgencyBadgeClass(doc.urgencyKey);
    const statusClass = outboundStatusClass(doc.statusKey);

    const publishedInfo = doc.publishedDate
      ? `        <div class="text-[12px] text-slate-500">Phát hành: ${helpers.escapeHtml(
          helpers.formatDate?.(doc.publishedDate) || doc.publishedDate
        )}</div>`
      : "";

    tr.innerHTML = [
      '<td class="py-2 pr-3">',
      `  <a href="${detailHref}" class="text-blue-700 hover:underline">`,
      `    ${helpers.escapeHtml(doc.title || "Văn bản")}`,
      "  </a>",
      "</td>",
      `<td class="py-2 px-3">${helpers.escapeHtml(doc.number || "—")}</td>`,
      '<td class="py-2 px-3">',
      doc.issuedDate
        ? `  <div>Ngày ký: ${helpers.escapeHtml(
            helpers.formatDate?.(doc.issuedDate) || doc.issuedDate
          )}</div>`
        : "",
      publishedInfo,
      "</td>",
      `<td class="py-2 px-3">${helpers.escapeHtml(doc.recipients || "—")}</td>`,
      `<td class="py-2 px-3"><span class="inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold ${urgencyClass}">${helpers.escapeHtml(
        doc.urgencyLabel || ""
      )}</span></td>`,
      `<td class="py-2 px-3"><span class="px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass}">${helpers.escapeHtml(
        STATUS_LABELS[doc.statusKey] || doc.statusLabel || ""
      )}</span></td>`,
      '<td class="py-2 pl-3 pr-0 text-right relative">',
      needsAction ? '<span class="action-indicator" style="position:absolute;top:8px;right:8px;width:8px;height:8px;background:#22c55e;border-radius:50%;animation:action-pulse 2s ease-in-out infinite;"></span>' : '',
      `  <a href="${detailHref}" class="inline-flex items-center gap-1 px-3 py-1 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 text-[12px]">`,
      '    Chi tiết',
      "  </a>",
      "</td>",
    ]
      .filter(Boolean)
      .join("\n");

    return tr;
  }

  function mapStatusTargets(value) {
    switch (value) {
      case "cho_duyet":
        return ["submitted"];
      case "dang_xu_ly":
        return ["processing"];
      case "da_vao_so":
        return ["registered"];
      case "da_phat_hanh":
        return ["published"];
      case "du_thao":
        return ["draft"];
      default:
        return value === "all" ? null : [value];
    }
  }

  function mapStatusForDataset(status) {
    switch (status) {
      case "published":
        return "da_phat_hanh";
      case "registered":
        return "da_vao_so";
      case "processing":
        return "dang_xu_ly";
      case "submitted":
        return "cho_duyet";
      case "draft":
      default:
        return "du_thao";
    }
  }

  function mapLevelFromUrgency(urgencyKey) {
    switch (urgencyKey) {
      case "ratkhan":
      case "khan":
        return "urgent";
      case "cao":
        return "high";
      default:
        return "normal";
    }
  }

  function levelMatches(levelValue, filter) {
    if (filter === "urgent") return levelValue === "urgent";
    if (filter === "high") return levelValue === "high";
    if (filter === "normal") return levelValue === "normal";
    return true;
  }

  function outboundStatusClass(key) {
    switch (key) {
      case "published":
        return "bg-emerald-50 text-emerald-700";
      case "registered":
        return "bg-teal-100 text-teal-700";
      case "processing":
        return "bg-blue-100 text-blue-700";
      case "submitted":
        return "bg-amber-100 text-amber-700";
      default:
        return "bg-slate-100 text-slate-700";
    }
  }

  function urgencyBadgeClass(key) {
    switch (key) {
      case "ratkhan":
        return "bg-rose-100 text-rose-700";
      case "khan":
        return "bg-amber-100 text-amber-700";
      case "cao":
        return "bg-orange-100 text-orange-700";
      default:
        return "bg-slate-100 text-slate-700";
    }
  }

  function activeKeyword() {
    const local = (state.keyword || "").trim();
    if (local) return local;
    return (state.globalKeyword || "").trim();
  }

  function renderLoading() {
    tableBody.innerHTML =
      '<tr><td colspan="7" class="py-6 text-center text-[13px] text-slate-500">Đang tải dữ liệu văn bản…</td></tr>';
  }

  function renderEmpty() {
    tableBody.innerHTML =
      '<tr><td colspan="7" class="py-6 text-center text-[13px] text-slate-500">Không có văn bản phù hợp với bộ lọc.</td></tr>';
  }

  function renderError(message) {
    tableBody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-[13px] text-rose-600">${helpers.escapeHtml(
      message
    )}</td></tr>`;
  }

  function debounce(fn, delay = 180) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  function updateKPIs(docs) {
    const counts = helpers.computeOutboundKPIs(Array.isArray(docs) ? docs : []);
    // Map new keys to UI elements
    // kpiEls.submitted -> counts.submitted
    // kpiEls.processing -> counts.processing
    // kpiEls.published -> counts.published
    
    if (kpiEls.submitted) kpiEls.submitted.textContent = String(counts.submitted || 0);
    if (kpiEls.processing) kpiEls.processing.textContent = String(counts.processing || 0);
    if (kpiEls.published) kpiEls.published.textContent = String(counts.published || 0);
    
    // Legacy support if needed, or clear old elements
    const kpiSign = document.getElementById("kpiPendingSign");
    if (kpiSign) kpiSign.textContent = "0"; // No longer used
  }
})();
