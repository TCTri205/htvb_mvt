(function () {
  const FORM_ID = "workflow-action-form";
  const ROUTE_DEFAULT = "vanbanden";

  function getForm() {
    return document.getElementById(FORM_ID);
  }

  function getCurrentRole() {
    return (document.body?.dataset?.role || "vanthu").toLowerCase();
  }

  function buildUrl(route, docId) {
    if (!docId) {
      throw new Error("Thiếu document_id.");
    }
    const role = getCurrentRole();
    const prefix = `/${role}`;
    const cleanRoute = (route || ROUTE_DEFAULT).replace(/^\/+/, "").replace(/\/+$/, "");
    const cleanDocId = String(docId).trim();
    return `${prefix}/${cleanRoute}/${cleanDocId}/`.replace(/\/+/g, "/");
  }

  function setHiddenValue(form, name, value) {
    if (!form || !name) return;
    let element = form.querySelector(`[name="${name}"]`);
    if (!element) {
      element = document.createElement("input");
      element.type = "hidden";
      element.name = name;
      form.appendChild(element);
    }
    element.value = value ?? "";
  }

  function clearHiddenFields(form) {
    if (!form) return;
    Array.from(form.elements).forEach((element) => {
      if (!element.name || element.name === "csrfmiddlewaretoken") return;
      element.value = "";
    });
  }

  function prepareFormSubmission(route, docId, action, payload) {
    const form = getForm();
    if (!form) return null;
    const url = buildUrl(route, docId);
    form.action = url;
    form.method = "post";
    clearHiddenFields(form);
    // Ensure lowercase for backend compatibility (backend expects lowercase)
    const actionLowercase = action ? String(action).toLowerCase() : "";
    setHiddenValue(form, "action", actionLowercase);
    setHiddenValue(form, "route", route || "");
    if (payload && typeof payload === "object") {
      Object.entries(payload).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") {
          return;
        }
        if (Array.isArray(value)) {
          setHiddenValue(form, key, value.join(","));
          return;
        }
        setHiddenValue(form, key, String(value));
      });
    }
    return form;
  }

  window.WorkflowActionDispatcher = {
    submit(route, docId, action, payload) {
      if (!docId) {
        return Promise.reject(new Error("Thiếu document_id."));
      }

      const form = prepareFormSubmission(route, docId, action, payload);
      if (!form) {
        const message = "workflow-action-form không tồn tại trong DOM.";
        console.error(message);
        return Promise.reject(new Error(message));
      }
      setTimeout(() => {
        form.submit();
      }, 0);
      return Promise.resolve();
    },
  };
})();
