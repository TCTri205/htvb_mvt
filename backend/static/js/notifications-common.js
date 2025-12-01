/* ============================================================
   notifications-common.js
   Shared helpers for fetching and normalizing notifications
   and reminders from the backend APIs.
   ============================================================ */

(function (global) {
  const getClient = () => global.ApiClient || null;

  function ensureClient() {
    const client = getClient();
    if (!client) {
      throw new Error("ApiClient chưa sẵn sàng");
    }
    return client;
  }

  function extractItems(payload, client) {
    if (client?.extractItems) {
      return client.extractItems(payload);
    }
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.results)) return payload.results;
    if (Array.isArray(payload)) return payload;
    return [];
  }

  async function fetchNotifications(params = {}) {
    const api = ensureClient();
    const payload = await api.notifications.list({
      ordering: "-sent_at",
      page_size: 200,
      ...params,
    });
    return extractItems(payload, api);
  }

  async function fetchReminders(params = {}) {
    const api = ensureClient();
    const payload = await api.reminders.list({
      ordering: "-due_at",
      page_size: 200,
      ...params,
    });
    return extractItems(payload, api);
  }

  async function markNotificationRead(id) {
    if (!id) return null;
    const api = ensureClient();
    return api.request(`/api/v1/notifications/${id}/read/`, {
      method: "POST",
    });
  }

  function normalizeNotification(item = {}) {
    return {
      id: item.notification_id || item.id || item.pk,
      title: item.title || "Thông báo",
      body: item.body || "",
      channel: item.channel || "app",
      sentAt: item.sent_at || item.created_at,
      readAt: item.read_at,
      link: item.link || "",
      user: item.user_summary || null,
    };
  }

  function normalizeReminder(item = {}) {
    const title =
      item.title ||
      (item.entity_type
        ? `Nhắc việc ${item.entity_type}${item.entity_id ? ` #${item.entity_id}` : ""}`
        : "Nhắc việc");
    return {
      id: item.reminder_id || item.id || item.pk,
      title,
      body: item.note || item.description || "",
      status: item.status || "",
      entityType: item.entity_type || "",
      entityId: item.entity_id,
      dueAt: item.due_at || item.deadline,
      lastNotifiedAt: item.last_notified_at,
      user: item.user_summary || null,
    };
  }

  function formatDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString("vi-VN", { hour12: false });
  }

  global.NotificationApi = {
    fetchNotifications,
    fetchReminders,
    markNotificationRead,
    normalizeNotification,
    normalizeReminder,
    formatDateTime,
  };
})(window);
