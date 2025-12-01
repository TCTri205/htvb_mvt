/* ============================================================
   quantri-cauhinh.js
   Script dành riêng cho trang Quản trị › Cấu hình quy trình
   (độc lập với quantri.js để tránh ảnh hưởng các trang khác).
============================================================ */

(function () {
  const PAGE_KEY = "cauhinh";

  function onReady(callback) {
    if (typeof callback !== "function") return;
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", callback, { once: true });
    } else {
      callback();
    }
  }

  onReady(() => {
    const currentPage = (document.body?.dataset?.page || "").toLowerCase();
    if (currentPage !== PAGE_KEY) return;

    const api = window.ApiClient;
    if (!api) {
      console.warn("[quantri-cauhinh] ApiClient không sẵn sàng.");
      return;
    }

    const qs = (sel, root = document) => root.querySelector(sel);
    const toastEl = qs("#toast");

    const state = {
      numbering: { items: [], loading: false },
      templates: { items: [], loading: false },
      transitions: { items: [], loading: false },
    };

    const resetLabels = {
      yearly: "Hằng năm",
      quarterly: "Theo quý",
      monthly: "Hằng tháng",
      never: "Không reset",
      manual: "Thủ công",
    };
    const moduleLabels = {
      doc_in: "Văn bản đến",
      doc_out: "Văn bản đi",
      case: "Hồ sơ công việc",
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
        const firstKey = Object.keys(error.data)[0];
        if (firstKey) {
          const detail = error.data[firstKey];
          if (Array.isArray(detail) && detail.length) return String(detail[0]);
        }
      }
      if (error.message) return String(error.message);
      return "Không thể thực hiện thao tác.";
    }

    /* ===========================
       1. Quy tắc đánh số
    =========================== */
    const numberingBody = qs("#qt-numbering-body");
    const numberingOpenBtn = qs("#qt-btn-open-numbering");
    const numberingPanel = qs("#qt-numbering-panel");
    const numberingForm = qs("#qt-numbering-form");
    const numberingFeedback = qs("#qt-numbering-feedback");
    const numberingCloseBtn = qs("#qt-numbering-close");
    const numberingResetBtn = qs("#qt-numbering-reset-form");

    function renderNumbering() {
      if (!numberingBody) return;
      const items = state.numbering.items || [];
      if (!items.length) {
        numberingBody.innerHTML =
          '<tr><td colspan="8" class="px-4 py-6 text-center text-slate-400 text-sm">Chưa có quy tắc đánh số.</td></tr>';
        return;
      }
      numberingBody.innerHTML = items
        .map((item) => {
          const statusClass = item.is_active ? "text-emerald-600" : "text-slate-500";
          const toggleLabel = item.is_active ? "Khoá" : "Mở";
          const target = moduleLabels[item.target] || (item.target === "incoming" ? "Văn bản đến" : "Văn bản đi");
          const reset = resetLabels[item.reset_policy] || item.reset_policy || "—";
          return `<tr>
            <td class="px-4 py-3">
              <div class="font-medium text-slate-900">${escapeHtml(item.code)}</div>
              <div class="text-xs text-slate-400">ID: ${item.rule_id}</div>
            </td>
            <td class="px-4 py-3">${escapeHtml(item.name)}</td>
            <td class="px-4 py-3">${escapeHtml(target)}</td>
            <td class="px-4 py-3">
              <div class="text-sm">Prefix: <span class="font-medium">${escapeHtml(item.prefix || "—")}</span></div>
              <div class="text-sm">Suffix: <span class="font-medium">${escapeHtml(item.suffix || "—")}</span></div>
              <div class="text-xs text-slate-400">Padding: ${item.padding || 0}</div>
            </td>
            <td class="px-4 py-3">${escapeHtml(reset)}</td>
            <td class="px-4 py-3">${item.next_sequence ?? item.start_sequence ?? 0}</td>
            <td class="px-4 py-3"><span class="${statusClass} font-medium">${item.is_active ? "Kích hoạt" : "Đã khóa"}</span></td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-2">
                <button data-numbering-action="edit" data-id="${item.rule_id}" class="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">Sửa</button>
                <button data-numbering-action="toggle" data-id="${item.rule_id}" class="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">${toggleLabel}</button>
                <button data-numbering-action="delete" data-id="${item.rule_id}" class="rounded border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50">Xoá</button>
              </div>
            </td>
          </tr>`;
        })
        .join("");
    }

    async function loadNumbering() {
      if (state.numbering.loading) return;
      state.numbering.loading = true;
      if (numberingBody) {
        numberingBody.innerHTML =
          '<tr><td colspan="8" class="px-4 py-6 text-center text-slate-400 text-sm">Đang tải dữ liệu...</td></tr>';
      }
      try {
        const data = await api.numberingRules.list({ page_size: 200 });
        state.numbering.items = api.extractItems(data);
        renderNumbering();
      } catch (error) {
        console.error("[quantri-cauhinh] loadNumbering error", error);
        if (numberingBody) {
          numberingBody.innerHTML = `<tr><td colspan="8" class="px-4 py-6 text-center text-rose-500 text-sm">${escapeHtml(
            resolveErrorMessage(error)
          )}</td></tr>`;
        }
      } finally {
        state.numbering.loading = false;
      }
    }

    function setNumberingForm(item) {
      qs("#qt-numbering-id").value = item?.rule_id || "";
      qs("#qt-numbering-code").value = item?.code || "";
      qs("#qt-numbering-name").value = item?.name || "";
      qs("#qt-numbering-target").value = item?.target || "outgoing";
      qs("#qt-numbering-prefix").value = item?.prefix || "";
      qs("#qt-numbering-suffix").value = item?.suffix || "";
      qs("#qt-numbering-padding").value = item?.padding || 4;
      qs("#qt-numbering-reset").value = item?.reset_policy || "yearly";
      qs("#qt-numbering-next").value = item?.next_sequence ?? item?.start_sequence ?? 1;
      qs("#qt-numbering-description").value = item?.description || "";
      qs("#qt-numbering-active").checked = item?.is_active ?? true;
      numberingFeedback.textContent = "";
    }

    function openNumberingPanel(item = null) {
      if (!numberingPanel) return;
      setNumberingForm(item);
      numberingPanel.classList.remove("hidden");
      numberingPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function closeNumberingPanel() {
      if (!numberingPanel) return;
      numberingPanel.classList.add("hidden");
      if (numberingForm) numberingForm.reset();
      qs("#qt-numbering-id").value = "";
      numberingFeedback.textContent = "";
    }

    async function submitNumbering(event) {
      event.preventDefault();
      const id = qs("#qt-numbering-id")?.value?.trim();
      const payload = {
        code: qs("#qt-numbering-code")?.value?.trim() || "",
        name: qs("#qt-numbering-name")?.value?.trim() || "",
        target: qs("#qt-numbering-target")?.value || "outgoing",
        prefix: qs("#qt-numbering-prefix")?.value?.trim() || null,
        suffix: qs("#qt-numbering-suffix")?.value?.trim() || null,
        padding: Number(qs("#qt-numbering-padding")?.value || 4),
        reset_policy: qs("#qt-numbering-reset")?.value || "yearly",
        next_sequence: Number(qs("#qt-numbering-next")?.value || 1),
        description: qs("#qt-numbering-description")?.value?.trim() || null,
        is_active: !!qs("#qt-numbering-active")?.checked,
      };
      if (!payload.code || !payload.name) {
        numberingFeedback.textContent = "Vui lòng nhập đầy đủ mã và tên.";
        return;
      }
      if (payload.next_sequence < 1) {
        numberingFeedback.textContent = "Giá trị số tiếp theo phải >= 1.";
        return;
      }
      try {
        if (id) {
          await api.numberingRules.update(id, payload);
          toast("Đã cập nhật quy tắc đánh số.", "success");
        } else {
          payload.start_sequence = payload.next_sequence;
          await api.numberingRules.create(payload);
          toast("Đã tạo quy tắc đánh số.", "success");
        }
        closeNumberingPanel();
        await loadNumbering();
      } catch (error) {
        console.error("[quantri-cauhinh] submitNumbering error", error);
        numberingFeedback.textContent = resolveErrorMessage(error);
      }
    }

    async function toggleNumbering(id) {
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
        console.error("[quantri-cauhinh] toggleNumbering error", error);
        toast(resolveErrorMessage(error), "error");
      }
    }

    async function deleteNumbering(id) {
      if (!window.confirm("Bạn chắc chắn muốn xoá quy tắc này?")) return;
      try {
        await api.numberingRules.remove(id);
        toast("Đã xoá quy tắc đánh số.", "success");
        await loadNumbering();
      } catch (error) {
        console.error("[quantri-cauhinh] deleteNumbering error", error);
        toast(resolveErrorMessage(error), "error");
      }
    }

    numberingOpenBtn?.addEventListener("click", () =>
      openNumberingPanel({
        target: "outgoing",
        padding: 4,
        reset_policy: "yearly",
        next_sequence: 1,
        is_active: true,
      })
    );
    numberingForm?.addEventListener("submit", submitNumbering);
    numberingCloseBtn?.addEventListener("click", () => closeNumberingPanel());
    numberingResetBtn?.addEventListener("click", () => {
      numberingForm?.reset();
      qs("#qt-numbering-id").value = "";
      numberingFeedback.textContent = "";
    });
    numberingBody?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-numbering-action]");
      if (!btn) return;
      const id = btn.dataset.id;
      if (!id) return;
      if (btn.dataset.numberingAction === "edit") {
        const item = state.numbering.items.find((x) => x.rule_id === Number(id));
        if (item) openNumberingPanel(item);
      }
      if (btn.dataset.numberingAction === "toggle") toggleNumbering(id);
      if (btn.dataset.numberingAction === "delete") deleteNumbering(id);
    });

    /* ===========================
       2. Mẫu văn bản
    =========================== */
    const templateBody = qs("#qt-template-body");
    const templateOpenBtn = qs("#qt-btn-open-template");
    const templatePanel = qs("#qt-template-panel");
    const templateForm = qs("#qt-template-form");
    const templateFeedback = qs("#qt-template-feedback");
    const templateCloseBtn = qs("#qt-template-close");
    const templateResetBtn = qs("#qt-template-reset");

    function renderTemplates() {
      if (!templateBody) return;
      const items = state.templates.items || [];
      if (!items.length) {
        templateBody.innerHTML =
          '<tr><td colspan="7" class="px-4 py-6 text-center text-slate-400 text-sm">Chưa có mẫu văn bản.</td></tr>';
        return;
      }
      templateBody.innerHTML = items
        .map((item) => {
          const direction =
            {
              den: "Văn bản đến",
              di: "Văn bản đi",
              du_thao: "Dự thảo",
            }[item.doc_direction] || item.doc_direction;
          const tags = Array.isArray(item.tags)
            ? item.tags
                .map(
                  (tag) =>
                    `<span class="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">${escapeHtml(
                      tag
                    )}</span>`
                )
                .join(" ")
            : '<span class="text-xs text-slate-400">—</span>';
          const statusClass = item.is_active ? "text-emerald-600" : "text-slate-500";
          return `<tr>
            <td class="px-4 py-3">
              <div class="font-medium text-slate-900">${escapeHtml(item.name)}</div>
              <div class="text-xs text-slate-400">ID: ${item.template_id}</div>
            </td>
            <td class="px-4 py-3">${escapeHtml(direction)}</td>
            <td class="px-4 py-3">v${item.version || 1}</td>
            <td class="px-4 py-3">${escapeHtml(item.format || "html")}</td>
            <td class="px-4 py-3"><span class="${statusClass} font-medium">${item.is_active ? "Kích hoạt" : "Đã khóa"}</span></td>
            <td class="px-4 py-3">${tags}</td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-2">
                <button data-template-action="edit" data-id="${item.template_id}" class="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">Sửa</button>
                <button data-template-action="toggle" data-id="${item.template_id}" class="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">${item.is_active ? "Khoá" : "Mở"}</button>
                <button data-template-action="delete" data-id="${item.template_id}" class="rounded border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50">Xoá</button>
              </div>
            </td>
          </tr>`;
        })
        .join("");
    }

    async function loadTemplates() {
      if (state.templates.loading) return;
      state.templates.loading = true;
      if (templateBody) {
        templateBody.innerHTML =
          '<tr><td colspan="7" class="px-4 py-6 text-center text-slate-400 text-sm">Đang tải dữ liệu...</td></tr>';
      }
      try {
        const data = await api.documentTemplates.list({ page_size: 200 });
        state.templates.items = api.extractItems(data);
        renderTemplates();
      } catch (error) {
        console.error("[quantri-cauhinh] loadTemplates error", error);
        if (templateBody) {
          templateBody.innerHTML = `<tr><td colspan="7" class="px-4 py-6 text-center text-rose-500 text-sm">${escapeHtml(
            resolveErrorMessage(error)
          )}</td></tr>`;
        }
      } finally {
        state.templates.loading = false;
      }
    }

    function setTemplateForm(item) {
      qs("#qt-template-id").value = item?.template_id || "";
      qs("#qt-template-name").value = item?.name || "";
      qs("#qt-template-direction").value = item?.doc_direction || "du_thao";
      qs("#qt-template-format").value = item?.format || "html";
      qs("#qt-template-tags").value = Array.isArray(item?.tags) ? item.tags.join(", ") : "";
      qs("#qt-template-description").value = item?.description || "";
      qs("#qt-template-content").value = item?.content || "";
      qs("#qt-template-active").checked = item?.is_active ?? true;
      templateForm.dataset.version = item?.version ? String(item.version) : "1";
      templateFeedback.textContent = "";
    }

    function openTemplatePanel(item = null) {
      if (!templatePanel) return;
      setTemplateForm(item);
      templatePanel.classList.remove("hidden");
      templatePanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function closeTemplatePanel() {
      if (!templatePanel) return;
      templatePanel.classList.add("hidden");
      if (templateForm) templateForm.reset();
      templateForm.dataset.version = "1";
      qs("#qt-template-id").value = "";
      templateFeedback.textContent = "";
    }

    async function submitTemplate(event) {
      event.preventDefault();
      const id = qs("#qt-template-id")?.value?.trim();
      const tagsRaw = qs("#qt-template-tags")?.value || "";
      const tags = tagsRaw
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      const payload = {
        name: qs("#qt-template-name")?.value?.trim() || "",
        doc_direction: qs("#qt-template-direction")?.value || "du_thao",
        format: qs("#qt-template-format")?.value || "html",
        tags,
        description: qs("#qt-template-description")?.value?.trim() || null,
        content: qs("#qt-template-content")?.value || "",
        is_active: !!qs("#qt-template-active")?.checked,
        version: Number(templateForm.dataset.version || "1") || 1,
      };
      if (!payload.name || !payload.content) {
        templateFeedback.textContent = "Vui lòng nhập tên mẫu và nội dung.";
        return;
      }
      try {
        if (id) {
          await api.documentTemplates.update(id, payload);
          toast("Đã cập nhật mẫu văn bản.", "success");
        } else {
          const created = await api.documentTemplates.create(payload);
          templateForm.dataset.version = String(created?.version || 1);
          toast("Đã tạo mẫu văn bản.", "success");
        }
        closeTemplatePanel();
        await loadTemplates();
      } catch (error) {
        console.error("[quantri-cauhinh] submitTemplate error", error);
        templateFeedback.textContent = resolveErrorMessage(error);
      }
    }

    async function toggleTemplate(id) {
      const item = state.templates.items.find((x) => x.template_id === Number(id));
      if (!item) {
        toast("Không tìm thấy mẫu.", "error");
        return;
      }
      try {
        await api.documentTemplates.update(id, { is_active: !item.is_active });
        toast(item.is_active ? "Đã khoá mẫu." : "Đã kích hoạt mẫu.", "success");
        await loadTemplates();
      } catch (error) {
        console.error("[quantri-cauhinh] toggleTemplate error", error);
        toast(resolveErrorMessage(error), "error");
      }
    }

    async function deleteTemplate(id) {
      if (!window.confirm("Bạn chắc chắn muốn xoá mẫu văn bản này?")) return;
      try {
        await api.documentTemplates.remove(id);
        toast("Đã xoá mẫu văn bản.", "success");
        await loadTemplates();
      } catch (error) {
        console.error("[quantri-cauhinh] deleteTemplate error", error);
        toast(resolveErrorMessage(error), "error");
      }
    }

    templateOpenBtn?.addEventListener("click", () =>
      openTemplatePanel({
        doc_direction: "du_thao",
        format: "html",
        tags: [],
        is_active: true,
        version: 1,
      })
    );
    templateForm?.addEventListener("submit", submitTemplate);
    templateCloseBtn?.addEventListener("click", () => closeTemplatePanel());
    templateResetBtn?.addEventListener("click", () => {
      templateForm?.reset();
      templateForm.dataset.version = "1";
      qs("#qt-template-id").value = "";
      templateFeedback.textContent = "";
    });
    templateBody?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-template-action]");
      if (!btn) return;
      const id = btn.dataset.id;
      if (!id) return;
      if (btn.dataset.templateAction === "edit") {
        const item = state.templates.items.find((x) => x.template_id === Number(id));
        if (item) openTemplatePanel(item);
      }
      if (btn.dataset.templateAction === "toggle") toggleTemplate(id);
      if (btn.dataset.templateAction === "delete") deleteTemplate(id);
    });

    /* ===========================
       3. Cấu hình chuyển trạng thái
    =========================== */
    const transitionBody = qs("#qt-transition-body");
    const transitionOpenBtn = qs("#qt-btn-open-transition");
    const transitionPanel = qs("#qt-transition-panel");
    const transitionForm = qs("#qt-transition-form");
    const transitionFeedback = qs("#qt-transition-feedback");
    const transitionCloseBtn = qs("#qt-transition-close");
    const transitionResetBtn = qs("#qt-transition-reset");

    function renderTransitions() {
      if (!transitionBody) return;
      const items = state.transitions.items || [];
      if (!items.length) {
        transitionBody.innerHTML =
          '<tr><td colspan="7" class="px-4 py-6 text-center text-slate-400 text-sm">Chưa có cấu hình chuyển trạng thái.</td></tr>';
        return;
      }
      transitionBody.innerHTML = items
        .map((item) => {
          const statusClass = item.is_active ? "text-emerald-600" : "text-slate-500";
          const roles = Array.isArray(item.allowed_roles) ? item.allowed_roles.join(", ") : "—";
          const perms = Array.isArray(item.allowed_permissions) ? item.allowed_permissions.join(", ") : "—";
          return `<tr>
            <td class="px-4 py-3">
              <div class="font-medium text-slate-900">${escapeHtml(moduleLabels[item.module] || item.module)}</div>
              <div class="text-xs text-slate-400">ID: ${item.transition_id}</div>
            </td>
            <td class="px-4 py-3">${escapeHtml(item.from_status)}</td>
            <td class="px-4 py-3">${escapeHtml(item.to_status)}</td>
            <td class="px-4 py-3"><span class="text-xs text-slate-600">${escapeHtml(roles)}</span></td>
            <td class="px-4 py-3"><span class="text-xs text-slate-600">${escapeHtml(perms)}</span></td>
            <td class="px-4 py-3"><span class="${statusClass} font-medium">${item.is_active ? "Kích hoạt" : "Đã khóa"}</span></td>
            <td class="px-4 py-3 text-right">
              <div class="flex items-center justify-end gap-2">
                <button data-transition-action="edit" data-id="${item.transition_id}" class="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">Sửa</button>
                <button data-transition-action="toggle" data-id="${item.transition_id}" class="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">${item.is_active ? "Khoá" : "Mở"}</button>
                <button data-transition-action="delete" data-id="${item.transition_id}" class="rounded border border-rose-200 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50">Xoá</button>
              </div>
            </td>
          </tr>`;
        })
        .join("");
    }

    async function loadTransitions() {
      if (state.transitions.loading) return;
      state.transitions.loading = true;
      if (transitionBody) {
        transitionBody.innerHTML =
          '<tr><td colspan="7" class="px-4 py-6 text-center text-slate-400 text-sm">Đang tải dữ liệu...</td></tr>';
      }
      try {
        const data = await api.workflowTransitions.list({ page_size: 200 });
        state.transitions.items = api.extractItems(data);
        renderTransitions();
      } catch (error) {
        console.error("[quantri-cauhinh] loadTransitions error", error);
        if (transitionBody) {
          transitionBody.innerHTML = `<tr><td colspan="7" class="px-4 py-6 text-center text-rose-500 text-sm">${escapeHtml(
            resolveErrorMessage(error)
          )}</td></tr>`;
        }
      } finally {
        state.transitions.loading = false;
      }
    }

    function setTransitionForm(item) {
      qs("#qt-transition-id").value = item?.transition_id || "";
      qs("#qt-transition-module").value = item?.module || "doc_in";
      qs("#qt-transition-from").value = item?.from_status || "";
      qs("#qt-transition-to").value = item?.to_status || "";
      qs("#qt-transition-roles").value = Array.isArray(item?.allowed_roles)
        ? item.allowed_roles.join(", ")
        : "";
      qs("#qt-transition-perms").value = Array.isArray(item?.allowed_permissions)
        ? item.allowed_permissions.join(", ")
        : "";
      qs("#qt-transition-description").value = item?.description || "";
      qs("#qt-transition-active").checked = item?.is_active ?? true;
      transitionFeedback.textContent = "";
    }

    function openTransitionPanel(item = null) {
      if (!transitionPanel) return;
      setTransitionForm(item);
      transitionPanel.classList.remove("hidden");
      transitionPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function closeTransitionPanel() {
      if (!transitionPanel) return;
      transitionPanel.classList.add("hidden");
      transitionForm?.reset();
      qs("#qt-transition-id").value = "";
      transitionFeedback.textContent = "";
    }

    async function submitTransition(event) {
      event.preventDefault();
      const id = qs("#qt-transition-id")?.value?.trim();
      const rolesRaw = qs("#qt-transition-roles")?.value || "";
      const permsRaw = qs("#qt-transition-perms")?.value || "";
      const payload = {
        module: qs("#qt-transition-module")?.value || "doc_in",
        from_status: qs("#qt-transition-from")?.value?.trim() || "",
        to_status: qs("#qt-transition-to")?.value?.trim() || "",
        allowed_roles: rolesRaw
          .split(",")
          .map((r) => r.trim().toUpperCase())
          .filter(Boolean),
        allowed_permissions: permsRaw
          .split(",")
          .map((p) => p.trim().toUpperCase())
          .filter(Boolean),
        description: qs("#qt-transition-description")?.value?.trim() || null,
        is_active: !!qs("#qt-transition-active")?.checked,
      };
      if (!payload.from_status || !payload.to_status) {
        transitionFeedback.textContent = "Vui lòng nhập trạng thái nguồn và đích.";
        return;
      }
      try {
        if (id) {
          await api.workflowTransitions.update(id, payload);
          toast("Đã cập nhật cấu hình chuyển trạng thái.", "success");
        } else {
          await api.workflowTransitions.create(payload);
          toast("Đã tạo cấu hình chuyển trạng thái.", "success");
        }
        closeTransitionPanel();
        await loadTransitions();
      } catch (error) {
        console.error("[quantri-cauhinh] submitTransition error", error);
        transitionFeedback.textContent = resolveErrorMessage(error);
      }
    }

    async function toggleTransition(id) {
      const item = state.transitions.items.find((x) => x.transition_id === Number(id));
      if (!item) {
        toast("Không tìm thấy cấu hình.", "error");
        return;
      }
      try {
        await api.workflowTransitions.update(id, { is_active: !item.is_active });
        toast(item.is_active ? "Đã khoá cấu hình." : "Đã kích hoạt cấu hình.", "success");
        await loadTransitions();
      } catch (error) {
        console.error("[quantri-cauhinh] toggleTransition error", error);
        toast(resolveErrorMessage(error), "error");
      }
    }

    async function deleteTransition(id) {
      if (!window.confirm("Bạn chắc chắn muốn xoá cấu hình này?")) return;
      try {
        await api.workflowTransitions.remove(id);
        toast("Đã xoá cấu hình chuyển trạng thái.", "success");
        await loadTransitions();
      } catch (error) {
        console.error("[quantri-cauhinh] deleteTransition error", error);
        toast(resolveErrorMessage(error), "error");
      }
    }

    transitionOpenBtn?.addEventListener("click", () =>
      openTransitionPanel({
        module: "doc_in",
        from_status: "",
        to_status: "",
        allowed_roles: ["QT"],
        allowed_permissions: [],
        is_active: true,
      })
    );
    transitionForm?.addEventListener("submit", submitTransition);
    transitionCloseBtn?.addEventListener("click", () => closeTransitionPanel());
    transitionResetBtn?.addEventListener("click", () => {
      transitionForm?.reset();
      qs("#qt-transition-id").value = "";
      transitionFeedback.textContent = "";
    });
    transitionBody?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-transition-action]");
      if (!btn) return;
      const id = btn.dataset.id;
      if (!id) return;
      if (btn.dataset.transitionAction === "edit") {
        const item = state.transitions.items.find((x) => x.transition_id === Number(id));
        if (item) openTransitionPanel(item);
      }
      if (btn.dataset.transitionAction === "toggle") toggleTransition(id);
      if (btn.dataset.transitionAction === "delete") deleteTransition(id);
    });

    // Khởi tạo
    loadNumbering();
    loadTemplates();
    loadTransitions();
  });
})();
