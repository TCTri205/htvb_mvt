/**
 * quantri-notifications.js
 * Dedicated module for Notifications & Reminders management
 */

(function() {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // State management
  const state = {
    channels: [],
    stats: null,
    rules: [],
    logs: []
  };

  // Utility functions
  const escapeHtml = (unsafe) => {
    if (!unsafe) return '';
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const formatNumber = (num) => {
    return Number(num).toLocaleString('vi-VN');
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('vi-VN');
    } catch {
      return dateString;
    }
  };

  const formatTimeAgo = (dateString) => {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Vừa xong';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 30) return `${diffDays} ngày trước`;
    return date.toLocaleDateString('vi-VN');
  };

  const getAuthToken = () => {
    return window.ApiClient?.getAccessToken?.() ||
      sessionStorage.getItem('htvb.accessToken') ||
      localStorage.getItem('htvb.accessToken') ||
      localStorage.getItem('access_token') || '';
  };

  const requestJson = async (path, options = {}) => {
    const api = window.ApiClient;
    if (api?.request) {
      return api.request(path, options);
    }

    const headers = new Headers(options.headers || {});
    const token = getAuthToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    
    if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const init = {
      ...options,
      headers,
      body: options.body && !(options.body instanceof FormData) 
        ? JSON.stringify(options.body) 
        : options.body
    };

    const res = await fetch(path, init);
    const payload = await res.json().catch(() => null);
    
    if (!res.ok) {
      const err = new Error(payload?.detail || 'Yêu cầu thất bại.');
      err.data = payload;
      throw err;
    }
    
    return payload;
  };

  const showToast = (message, type = 'info') => {
    if (window.AdminApp?.showToast) {
      window.AdminApp.showToast(message, type);
    } else if (window.AdminRuntime?.toast) {
      window.AdminRuntime.toast(message, type);
    } else {
      console.log(`[Toast ${type}]`, message);
    }
  };

  // ===========================================
  // MODAL HANDLERS
  // ===========================================

  function setupModalHandlers() {
    // Channel Detail Form
    const channelDetailForm = $('#channelDetailForm');
    if (channelDetailForm) {
      channelDetailForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const type = formData.get('channel_type');
        
        try {
          let config = {};
          try {
            config = JSON.parse(formData.get('config') || '{}');
          } catch (err) {
            showToast('Cấu hình JSON không hợp lệ', 'error');
            return;
          }

          const payload = {
            name: formData.get('name'),
            description: formData.get('description') || '',
            config: config,
            is_enabled: formData.has('is_enabled')
          };

          await requestJson(`/api/v1/notifications/channels/${type}/`, {
            method: 'PATCH',
            body: payload
          });

          showToast('Cập nhật kênh thành công', 'success');
          $('#channelDetailModal').close();
          await loadChannels();
          await loadChannelStats();
        } catch (error) {
          console.error('[notifications] Update channel failed', error);
          showToast(error.message || 'Không thể cập nhật kênh', 'error');
        }
      });
    }

    // Channel Test Form
    const channelTestForm = $('#channelTestForm');
    if (channelTestForm) {
      channelTestForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const type = formData.get('channel_type');
        const recipient = formData.get('recipient');

        try {
          const result = await requestJson(`/api/v1/notifications/channels/${type}/test`, {
            method: 'POST',
            body: { recipient }
          });

          showToast(result?.data?.message || 'Kiểm thử thành công', 'success');
          $('#channelTestModal').close();
        } catch (error) {
          console.error('[notifications] Test channel failed', error);
          showToast(error.message || 'Kiểm thử thất bại', 'error');
        }
      });
    }

    // Automation Rule Form
    const ruleForm = $('#automationRuleForm');
    if (ruleForm) {
      ruleForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const ruleId = formData.get('rule_id');
        const isEdit = Boolean(ruleId);

        try {
          let conditions = {};
          let template = {};
          try {
            conditions = JSON.parse(formData.get('conditions') || '{}');
            template = JSON.parse(formData.get('template') || '{}');
          } catch (err) {
            showToast('JSON không hợp lệ', 'error');
            return;
          }

          const payload = {
            name: formData.get('name'),
            description: formData.get('description') || '',
            event_type: formData.get('event_type'),
            channel: formData.get('channel'),
            conditions: conditions,
            template: template,
            is_enabled: formData.has('is_enabled')
          };

          if (isEdit) {
            await requestJson(`/api/v1/notifications/automation-rules/${ruleId}/`, {
              method: 'PATCH',
              body: payload
            });
            showToast('Cập nhật quy tắc thành công', 'success');
          } else {
            await requestJson('/api/v1/notifications/automation-rules/', {
              method: 'POST',
              body: payload
            });
            showToast('Tạo quy tắc thành công', 'success');
          }

          $('#automationRuleModal').close();
          await loadAutomationRules();
          await loadChannelStats();
        } catch (error) {
          console.error('[notifications] Save rule failed', error);
          showToast(error.message || 'Không thể lưu quy tắc', 'error');
        }
      });
    }
  }

  function openChannelDetail(channelType) {
    const channel = state.channels.find(c => c.channel_type === channelType);
    if (!channel) {
      showToast('Không tìm thấy kênh', 'error');
      return;
    }

    const form = $('#channelDetailForm');
    if (!form) return;

    form.elements.channel_type.value = channel.channel_type;
    form.elements.name.value = channel.name || '';
    form.elements.description.value = channel.description || '';
    form.elements.config.value = JSON.stringify(channel.config || {}, null, 2);
    form.elements.is_enabled.checked = channel.is_enabled;

    $('#channelDetailModal')?.showModal();
  }

  function openChannelTest(channelType) {
    const form = $('#channelTestForm');
    if (!form) return;

    form.elements.channel_type.value = channelType;
    form.elements.recipient.value = '';

    $('#channelTestModal')?.showModal();
  }

  function openRuleModal(mode = 'create', ruleId = null) {
    const modal = $('#automationRuleModal');
    const form = $('#automationRuleForm');
    const title = $('#ruleModalTitle');
    
    if (!modal || !form) return;

    if (mode === 'create') {
      title.textContent = 'Tạo quy tắc tự động';
      form.reset();
      form.elements.rule_id.value = '';
      form.elements.is_enabled.checked = true;
      modal.showModal();
    } else if (mode === 'edit' && ruleId) {
      const rule = state.rules.find(r => (r.rule_id || r.id) == ruleId);
      if (!rule) {
        showToast('Không tìm thấy quy tắc', 'error');
        return;
      }

      title.textContent = 'Sửa quy tắc tự động';
      form.elements.rule_id.value = ruleId;
      form.elements.name.value = rule.name || '';
      form.elements.description.value = rule.description || '';
      form.elements.event_type.value = rule.event_type || '';
      
      // Handle both channels array and single channel
      const channel = Array.isArray(rule.channels) ? rule.channels[0] : rule.channel;
      form.elements.channel.value = channel || '';
      
      form.elements.conditions.value = JSON.stringify(rule.conditions || {}, null, 2);
      form.elements.template.value = JSON.stringify(rule.template || {}, null, 2);
      form.elements.is_enabled.checked = rule.is_enabled;

      modal.showModal();
    }
  }

  async function deleteRule(ruleId) {
    if (!confirm('Bạn có chắc muốn xóa quy tắc này?')) {
      return;
    }

    try {
      await requestJson(`/api/v1/notifications/automation-rules/${ruleId}/`, {
        method: 'DELETE'
      });

      showToast('Đã xóa quy tắc', 'success');
      await loadAutomationRules();
      await loadChannelStats();
    } catch (error) {
      console.error('[notifications] Delete rule failed', error);
      showToast(error.message || 'Không thể xóa quy tắc', 'error');
    }
  }

  // ===========================================
  // DATA LOADING
  // ===========================================

  async function  loadChannelStats() {
    try {
      const payload = await requestJson('/api/v1/notifications/channels/stats');
      state.stats = payload?.data || payload?.results || payload || null;
      updateKPIs();
    } catch (error) {
      console.error('[notifications] Load stats failed', error);
    }
  }

  async function loadChannels() {
    try {
      const payload = await requestJson('/api/v1/notifications/channels/');
      const channels = payload?.data || payload?.results || [];
      state.channels = Array.isArray(channels) ? channels : [];
      
      state.channels.forEach(updateChannelCard);
      setupChannelToggles();
      setupChannelButtons();
      updateKPIs();
    } catch (error) {
      console.error('[notifications] Load channels failed', error);
    }
  }

  async function loadAutomationRules() {
    try {
      const payload = await requestJson('/api/v1/notifications/automation-rules/');
      const rules = payload?.data || payload?.results || [];
      state.rules = Array.isArray(rules) ? rules : [];
      renderAutomationRules();
      updateKPIs();
    } catch (error) {
      console.error('[notifications] Load rules failed', error);
      const container = $('#notifAutomationList');
      if (container) container.innerHTML = '<p class="text-sm text-rose-600">Không thể tải dữ liệu</p>';
    }
  }

  async function loadNotificationLogs() {
    try {
      const payload = await requestJson('/api/v1/notifications/logs/?page=1');
      const logs = extractLogItems(payload);
      renderNotificationLogs(logs);
    } catch (error) {
      console.error('[notifications] Load logs failed', error);
      const container = $('#notifLogList');
      if (container) container.innerHTML = '<p class="text-sm text-rose-600">Không thể tải nhật ký</p>';
    }
  }

  // ===========================================
  // RENDERING FUNCTIONS
  // ===========================================

  function updateKPIs() {
    const { stats, channels, rules } = state;
    const activeChannels = typeof stats?.active_channels_count === 'number'
      ? stats.active_channels_count
      : channels.filter(c => c.is_enabled).length;
    const totalChannels = channels.length || 3;
    const sentCount = stats?.total_sent_30days;
    const errorCount = stats?.total_errors_30days;
    const activeRules = typeof stats?.automation_rules_active === 'number'
      ? stats.automation_rules_active
      : rules.filter(r => r.is_enabled).length;
    const totalRules = rules.length;

    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el && value !== undefined && value !== null) {
        el.textContent = value;
      }
    };

    setText('notifChannelsValue', totalChannels ? `${activeChannels}/${totalChannels}` : String(activeChannels || 0));
    setText('notifChannelsText', totalChannels ? `${activeChannels} kênh đang bật` : 'Kênh online đang hoạt động');
    if (sentCount !== null && sentCount !== undefined) {
      setText('notifSentValue', formatNumber(sentCount));
    }
    if (errorCount !== null && errorCount !== undefined) {
      setText('notifErrorValue', formatNumber(errorCount));
    }
    setText('notifAutomationValue', totalRules ? `${activeRules}/${totalRules}` : String(activeRules || 0));
  }

  function updateChannelCard(channel) {
    const card = document.querySelector(`[data-channel-card="${channel.channel_type}"]`);
    if (!card) return;

    const sent = card.querySelector(`[data-channel-sent="${channel.channel_type}"]`);
    if (sent) sent.textContent = formatNumber(channel.sent_count || 0);

    const error = card.querySelector(`[data-channel-error="${channel.channel_type}"]`);
    if (error) error.textContent = `Lỗi ${channel.error_count || 0}`;

    const rate = card.querySelector(`[data-channel-rate="${channel.channel_type}"]`);
    if (rate) rate.textContent = `Tỷ lệ thành công ${channel.success_rate || 0}%`;

    const configEl = card.querySelector(`[data-channel-config="${channel.channel_type}"]`);
    if (configEl) {
      configEl.textContent = formatChannelConfig(channel);
    }

    const lastUsedEl = card.querySelector(`[data-channel-lastused="${channel.channel_type}"]`);
    if (lastUsedEl) {
      lastUsedEl.textContent = channel.last_used_at
        ? `Sử dụng gần nhất ${formatDateTime(channel.last_used_at)}`
        : 'Chưa sử dụng';
    }

    const toggle = card.querySelector('input[type="checkbox"]');
    if (toggle) toggle.checked = channel.is_enabled;

    const badge = card.querySelector('.inline-flex');
    if (badge) {
      badge.classList.toggle('bg-emerald-50', channel.is_enabled);
      badge.classList.toggle('text-emerald-700', channel.is_enabled);
      badge.classList.toggle('bg-slate-100', !channel.is_enabled);
      badge.classList.toggle('text-slate-600', !channel.is_enabled);
      badge.textContent = channel.is_enabled ? 'Hoạt động' : 'Tạm dừng';
    }
  }

  function formatChannelConfig(channel) {
    const cfg = channel?.config || {};
    const type = channel?.channel_type;
    
    if (type === 'email') {
      const host = cfg.smtp_host || cfg.host || 'SMTP';
      const port = cfg.smtp_port || cfg.port;
      const user = cfg.from_email || cfg.username || cfg.user;
      return `SMTP: ${host}${port ? ` • cổng ${port}` : ''}${user ? ` • tài khoản: ${user}` : ''}`;
    }
    
    if (type === 'push') {
      const service = cfg.service || cfg.provider || 'Push service';
      const project = cfg.project_id || cfg.project || '';
      return `Dịch vụ: ${service}${project ? ` • dự án: ${project}` : ''}`;
    }
    
    if (type === 'sms') {
      const provider = cfg.provider || cfg.gateway || 'Nhà cung cấp';
      const brand = cfg.brandname || cfg.brand || '';
      return `Nhà mạng: ${provider}${brand ? ` • brand: ${brand}` : ''}`;
    }
    
    return Object.keys(cfg || {}).length ? JSON.stringify(cfg) : 'Chưa cấu hình';
  }

  function renderAutomationRules() {
    const container = $('#notifAutomationList');
    if (!container) return;

    if (state.rules.length === 0) {
      container.innerHTML = '<p class="text-sm text-slate-500">Chưa có quy tắc tự động nào</p>';
      return;
    }

    container.innerHTML = state.rules.map(rule => {
      const ruleId = rule.rule_id || rule.id;
      const channels = Array.isArray(rule.channels) ? rule.channels.join(', ') : (rule.channel || 'N/A');
      
      return `
        <article class="rounded-xl border border-slate-200 p-4">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1">
              <h4 class="font-semibold">${escapeHtml(rule.name)}</h4>
              <p class="text-sm text-slate-600 mt-1">${escapeHtml(rule.description || '')}</p>
              <div class="flex gap-3 mt-2 text-xs text-slate-500">
                <span>📌 ${escapeHtml(rule.event_type || 'N/A')}</span>
                <span>📱 ${channels}</span>
              </div>
            </div>
            <div class="flex gap-2 items-center">
              <span class="px-2 py-1 rounded text-xs ${
                rule.is_enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'
              }">
                ${rule.is_enabled ? 'Hoạt động' : 'Tạm dừng'}
              </span>
              <button class="btn-icon text-sm" data-action="edit-rule" data-rule-id="${ruleId}" title="Sửa">✏️</button>
              <button class="btn-icon text-rose-600 text-sm" data-action="delete-rule" data-rule-id="${ruleId}" title="Xóa">🗑️</button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    // Attach event handlers
    container.querySelectorAll('[data-action="edit-rule"]').forEach(btn => {
      btn.addEventListener('click', () => openRuleModal('edit', btn.dataset.ruleId));
    });

    container.querySelectorAll('[data-action="delete-rule"]').forEach(btn => {
      btn.addEventListener('click', () => deleteRule(btn.dataset.ruleId));
    });
  }

  function renderNotificationLogs(logs) {
    const container = $('#notifLogList');
    if (!container) return;

    if (logs.length === 0) {
      container.innerHTML = '<p class="text-sm text-slate-500">Chưa có nhật ký gửi</p>';
      return;
    }

    container.innerHTML = logs.map(log => {
      const statusClass = log.status === 'sent' 
        ? 'bg-emerald-50 text-emerald-700'
        : log.status === 'failed'
        ? 'bg-rose-50 text-rose-700'
        : 'bg-amber-50 text-amber-700';
      
      const timeAgo = formatTimeAgo(log.sent_at);

      return `
        <article class="rounded-xl border border-slate-200 p-4">
          <div class="flex items-start justify-between gap-4">
            <div class="flex-1">
              <div class="flex items-center gap-2 mb-1">
                <span class="inline-flex px-2 py-0.5 rounded text-[11px] font-semibold ${statusClass}">
                  ${escapeHtml(log.status_display || log.status || '')}
                </span>
                <span class="text-[12px] text-slate-500">${escapeHtml(log.channel || '')}</span>
              </div>
              <h4 class="font-medium text-[14px]">${escapeHtml(log.title || '')}</h4>
              <p class="text-[12.5px] text-slate-500 mt-1">
                Gửi tới: ${escapeHtml(log.recipient || '')}
                ${log.error_message ? `<br><span class="text-rose-600">Lỗi: ${escapeHtml(log.error_message)}</span>` : ''}
              </p>
            </div>
            <div class="text-right text-[12px] text-slate-500">${timeAgo}</div>
          </div>
        </article>
      `;
    }).join('');
  }

  function extractLogItems(payload) {
    if (!payload) return [];
    if (Array.isArray(payload.data)) return payload.data;
    if (Array.isArray(payload.results)) return payload.results;
    if (Array.isArray(payload?.results?.data)) return payload.results.data;
    if (Array.isArray(payload?.data?.results)) return payload.data.results;
    return Array.isArray(payload) ? payload : [];
  }

  // ===========================================
  // EVENT SETUP
  // ===========================================

  function setupChannelToggles() {
    $$('[data-channel-card]').forEach(card => {
      const toggle = card.querySelector('input[type="checkbox"]');
      const type = card.getAttribute('data-channel-card');
      if (toggle && !toggle.dataset.ready) {
        toggle.addEventListener('change', (e) => toggleChannel(type, e.target.checked));
        toggle.dataset.ready = 'true';
      }
    });
  }

  function setupChannelButtons() {
    // Detail buttons
    $$('[data-action="detail"]').forEach(btn => {
      if (!btn.dataset.ready) {
        btn.addEventListener('click', () => openChannelDetail(btn.dataset.channel));
        btn.dataset.ready = 'true';
      }
    });

    // Test buttons
    $$('[data-action="test"]').forEach(btn => {
      if (!btn.dataset.ready) {
        btn.addEventListener('click', () => openChannelTest(btn.dataset.channel));
        btn.dataset.ready = 'true';
      }
    });
  }

  async function toggleChannel(type, enabled) {
    try {
      const result = await requestJson(`/api/v1/notifications/channels/${type}/`, {
        method: 'PATCH',
        body: { is_enabled: enabled }
      });

      const channel = result?.data || result;
      if (channel) {
        updateChannelCard(channel);
      }
      
      showToast(enabled ? `Đã bật kênh ${type}` : `Đã tắt kênh ${type}`, 'success');
      loadChannelStats();
    } catch (error) {
      console.error('[notifications] Toggle channel failed', error);
      showToast('Không thể thay đổi trạng thái kênh', 'error');
      // Revert toggle
      const card = document.querySelector(`[data-channel-card="${type}"]`);
      const toggle = card?.querySelector('input[type="checkbox"]');
      if (toggle) toggle.checked = !enabled;
    }
  }

  function setupTabs() {
    $$('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-tab');
        
        $$('.tab-btn').forEach(b => {
          b.classList.remove('border-blue-600', 'text-blue-600', 'font-medium');
          b.classList.add('border-transparent');
        });
        
        btn.classList.add('border-blue-600', 'text-blue-600', 'font-medium');
        btn.classList.remove('border-transparent');

        ['tab-channels', 'tab-automation', 'tab-logs'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.classList.toggle('hidden', id !== target);
        });
      });
    });
    
    // Click first tab
    document.querySelector('.tab-btn')?.click();
  }

  function setupAutomationActions() {
    const btnCreate = $('#btnCreateRule');
    if (btnCreate && !btnCreate.dataset.ready) {
      btnCreate.addEventListener('click', () => openRuleModal('create'));
      btnCreate.dataset.ready = 'true';
    }
  }

  // ===========================================
  // MAIN INITIALIZATION
  // ===========================================

  async function init() {
    console.log('[quantri-notifications] Initializing...');
    
    setupTabs();
    setupModalHandlers();
    setupAutomationActions();

    await Promise.all([
      loadChannels(),
      loadChannelStats(),
      loadAutomationRules(),
      loadNotificationLogs()
    ]);

    console.log('[quantri-notifications] Initialization complete');
  }

  // Export to global scope
  window.NotificationsModule = {
    init,
    loadChannels,
    loadChannelStats,
    loadAutomationRules,
    loadNotificationLogs
  };

  // Auto-init if DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM already loaded, but wait a tick for other scripts
    setTimeout(init, 100);
  }

})();
