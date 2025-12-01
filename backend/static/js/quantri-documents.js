(function () {
  const PAGE_ROUTE = "/quantri/quanlyhethong.html";
  const inboundStatuses = [
    "RECEIVED",
    "WAITING_ASSIGNMENT",
    "PROCESSING",
    "PENDING_LEADER_APPROVAL",
    "REGISTERED",
    "DISPATCHED",
  ];
  const outboundStatuses = [
    "DRAFT",
    "SUBMITTED",
    "APPROVED",
    "PENDING_CLERK_CHECK",
    "REGISTERED",
    "ISSUED",
  ];

  function getDocumentApi() {
    const api = window.ApiClient;
    return api?.documents ?? null;
  }

  function renderCount(elementId, count) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.textContent = Number.isFinite(count) ? String(count) : "0";
  }

  function readTotal(api, payload) {
    if (!payload) return 0;
    if (typeof api.extractPageMeta === "function") {
      const meta = api.extractPageMeta(payload);
      if (meta && Number.isFinite(meta.totalItems)) {
        return meta.totalItems;
      }
    }
    if (Array.isArray(payload)) {
      return payload.length;
    }
    if (Array.isArray(payload.items)) {
      return payload.items.length;
    }
    if (Array.isArray(payload.results)) {
      return payload.results.length;
    }
    if (Number.isFinite(payload.total_items)) {
      return payload.total_items;
    }
    return 0;
  }

  async function fetchStatusCount(direction, status) {
    const docApi = getDocumentApi();
    if (!docApi) return 0;
    try {
      const response = await docApi.list({
        direction,
        status,
        page_size: 1,
      });
      return readTotal(docApi, response);
    } catch (error) {
      console.error("[quantri] Lỗi tải số lượng văn bản:", error);
      return 0;
    }
  }

  async function updateStats(direction, statuses) {
    for (const status of statuses) {
      const count = await fetchStatusCount(direction, status);
      renderCount(`qt-${direction.toLowerCase()}-${status}`, count);
    }
  }

  function init() {
    if (!document.body?.dataset?.page) return;
    const current = document.body.dataset.page.toLowerCase();
    if (current !== "quanlyhethong") {
      return;
    }
    const docApi = getDocumentApi();
    if (!docApi) {
      console.warn("[quantri] Document API không sẵn sàng.");
      return;
    }
    updateStats("INBOUND", inboundStatuses);
    updateStats("OUTBOUND", outboundStatuses);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
