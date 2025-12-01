// ===============================================
// NOTIFICATIONS & REMINDERS PAGE (Thông báo - Nhắc việc)
// ===============================================

async function initNotifications() {
  console.log('[quantri] Initializing Notifications & Reminders page');
  
  // Setup tab switching
  initNotificationTabs();
  
  // Load initial data
  await loadChannelStats();
  await loadChannels();
  await loadAutomationRules();
  await loadNotificationLogs();
}

function initNotificationTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      
      // Update buttons
      tabBtns.forEach(b => {
        b.classList.remove('border-blue-600', 'text-blue-600', 'font-medium');
        b.classList.add('border-transparent');
      });
      btn.classList.add('border-blue-600', 'text-blue-600', 'font-medium');
      btn.classList.remove('border-transparent');
      
      // Update tab content
      document.getElementById('tab-channels')?.classList.add('hidden');
      document.getElementById('tab-automation')?.classList.add('hidden');
      document.getElementById('tab-logs')?.classList.add('hidden');
      document.getElementById(targetTab)?.classList.remove('hidden');
    });
  });
}

async function loadChannelStats() {
  try {
    const response = await fetch('/api/v1/notifications/channels/stats', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}`
      }
    });
    
    if (!response.ok) throw new Error('Failed to load channel stats');
    
    const result = await response.json();
    const stats = result.data;
    
    // Update KPI cards
    const channelsEl = document.getElementById('notifChannelsValue');
    if (channelsEl) {
      channelsEl.textContent = `${stats.active_channels_count}/3`;
    }
    
    const sentEl = document.getElementById('notifSentValue');
    if (sentEl) {
      sentEl.textContent = stats.total_sent_30days.toLocaleString();
    }
    
    const errorEl = document.getElementById('notifErrorValue');
    if (errorEl) {
      errorEl.textContent = stats.total_errors_30days.toLocaleString();
    }
    
    const automationEl = document.getElementById('notifAutomationValue');
    if (automationEl) {
      automationEl.textContent = `${stats.automation_rules_active}/5`;
    }
    
    console.log('[quantri] Channel stats updated');
    
  } catch (error) {
    console.error('[quantri] Failed to load channel stats', error);
  }
}

async function loadChannels() {
  try {
    const response = await fetch('/api/v1/notifications/channels', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}`
      }
    });
    
    if (!response.ok) throw new Error('Failed to load channels');
    
    const result = await response.json();
    const channels = result.data;
    
    channels.forEach(channel => {
      updateChannelCard(channel);
    });
    
    // Setup event listeners
    setupChannelToggles();
    setupChannelTests();
    
    console.log('[quantri] Channels loaded');
    
  } catch (error) {
    console.error('[quantri] Failed to load channels', error);
  }
}

function updateChannelCard(channel) {
  const channelType = channel.channel_type;
  const card = document.querySelector(`[data-channel-card="${channelType}"]`);
  if (!card) return;
  
  // Update sent count
  const sentEl = card.querySelector(`[data-channel-sent="${channelType}"]`);
  if (sentEl) {
    sentEl.textContent = channel.sent_count.toLocaleString();
  }
  
  // Update error count
  const errorEl = card.querySelector(`[data-channel-error="${channelType}"]`);
  if (errorEl) {
    errorEl.textContent = `Lỗi ${channel.error_count}`;
  }
  
  // Update success rate
  const rateEl = card.querySelector(`[data-channel-rate="${channelType}"]`);
  if (rateEl) {
    rateEl.textContent = `Tỷ lệ thành công ${channel.success_rate}%`;
  }
  
  // Update toggle state
  const toggle = card.querySelector('input[type="checkbox"]');
  if (toggle) {
    toggle.checked = channel.is_enabled;
  }
  
  // Update enabled badge
  const badge = card.querySelector('.inline-flex');
  if (badge && channel.is_enabled) {
    badge.classList.remove('bg-slate-100', 'text-slate-600');
    badge.classList.add('bg-emerald-50', 'text-emerald-700');
    badge.textContent = 'Hoạt động';
  } else if (badge) {
    badge.classList.remove('bg-emerald-50', 'text-emerald-700');
    badge.classList.add('bg-slate-100', 'text-slate-600');
    badge.textContent = 'Tạm dừng';
  }
}

function setupChannelToggles() {
  document.querySelectorAll('[data-channel-card]').forEach(card => {
    const toggle = card.querySelector('input[type="checkbox"]');
    const channelType = card.getAttribute('data-channel-card');
    
    if (toggle && !toggle.hasAttribute('data-listener-added')) {
      toggle.addEventListener('change', async (e) => {
        const isEnabled = e.target.checked;
        await toggleChannel(channelType, isEnabled);
      });
      toggle.setAttribute('data-listener-added', 'true');
    }
  });
}

async function toggleChannel(channelType, isEnabled) {
  try {
    const response = await fetch(`/api/v1/notifications/channels/${channelType}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}`
      },
      body: JSON.stringify({ is_enabled: isEnabled })
    });
    
    if (!response.ok) throw new Error('Failed to toggle channel');
    
    const result = await response.json();
    updateChannelCard(result.data);
    
    AdminRuntime.toast(
      isEnabled ? `Đã bật kênh ${channelType}` : `Đã tắt kênh ${channelType}`,
      'success'
    );
    
    // Reload stats
    await loadChannelStats();
    
  } catch (error) {
    console.error('[quantri] Failed to toggle channel', error);
    AdminRuntime.toast('Không thể thay đổi trạng thái kênh', 'error');
  }
}

function setupChannelTests() {
  document.querySelectorAll('[data-action="test"]').forEach(btn => {
    if (!btn.hasAttribute('data-listener-added')) {
      btn.addEventListener('click', async (e) => {
        const channelType = e.target.getAttribute('data-channel');
        await testChannel(channelType);
      });
      btn.setAttribute('data-listener-added', 'true');
    }
  });
}

async function testChannel(channelType) {
  try {
    const response = await fetch(`/api/v1/notifications/channels/${channelType}/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}`
      },
      body: JSON.stringify({ recipient: 'test@example.com' })
    });
    
    if (!response.ok) throw new Error('Test failed');
    
    const result = await response.json();
    AdminRuntime.toast(result.data.message || 'Kiểm thử thành công (demo)', 'success');
    
  } catch (error) {
    console.error('[quantri] Test channel failed', error);
    AdminRuntime.toast('Không thể kiểm thử kênh', 'error');
  }
}

async function loadAutomationRules() {
  try {
    const response = await fetch('/api/v1/notifications/automation-rules', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}`
      }
    });
    
    if (!response.ok) throw new Error('Failed to load rules');
    
    const result = await response.json();
    const rules = result.data;
    
    const container = document.getElementById('notifAutomationList');
    if (!container) return;
    
    if (rules.length === 0) {
      container.innerHTML = '<p class="text-sm text-slate-500">Chưa có quy tắc tự động nào</p>';
      return;
    }
    
    container.innerHTML = rules.map(rule => `
      <article class="rounded-xl border border-slate-200 p-4">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <h4 class="font-semibold">${escapeHtml(rule.name)}</h4>
            <div class="flex items-center gap-3 text-[12.5px] text-slate-500 mt-1">
              <span>Sự kiện: ${escapeHtml(rule.trigger_display)}</span>
              <span>•</span>
              <span>Kênh: ${rule.channels.join(', ')}</span>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="inline-flex px-2 py-1 rounded-full text-[12px] font-semibold ${
              rule.is_enabled 
                ? 'bg-emerald-50 text-emerald-700' 
                : 'bg-slate-100 text-slate-600'
            }">
              ${rule.is_enabled ? 'Hoạt động' : 'Tạm dừng'}
            </span>
          </div>
        </div>
      </article>
    `).join('');
    
    console.log('[quantri] Automation rules loaded');
    
  } catch (error) {
    console.error('[quantri] Failed to load automation rules', error);
    const container = document.getElementById('notifAutomationList');
    if (container) {
      container.innerHTML = '<p class="text-sm text-rose-600">Không thể tải dữ liệu</p>';
    }
  }
}

async function loadNotificationLogs() {
  try {
    const response = await fetch('/api/v1/notifications/logs?page=1', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('access_token') || ''}`
      }
    });
    
    if (!response.ok) throw new Error('Failed to load logs');
    
    const result = await response.json();
    const logs = result.data;
    
    const container = document.getElementById('notifLogList');
    if (!container) return;
    
    if (logs.length === 0) {
      container.innerHTML = '<p class="text-sm text-slate-500">Chưa có nhật ký nào</p>';
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
                  ${escapeHtml(log.status_display)}
                </span>
                <span class="text-[12px] text-slate-500">${escapeHtml(log.channel)}</span>
              </div>
              <h4 class="font-medium text-[14px]">${escapeHtml(log.title)}</h4>
              <p class="text-[12.5px] text-slate-500 mt-1">
                Gửi tới: ${escapeHtml(log.recipient)}
                ${log.error_message ? `<br><span class="text-rose-600">Lỗi: ${escapeHtml(log.error_message)}</span>` : ''}
              </p>
            </div>
            <div class="text-right text-[12px] text-slate-500">
              ${timeAgo}
            </div>
          </div>
        </article>
      `;
    }).join('');
    
    console.log('[quantri] Notification logs loaded');
    
  } catch (error) {
    console.error('[quantri] Failed to load notification logs', error);
    const container = document.getElementById('notifLogList');
    if (container) {
      container.innerHTML = '<p class="text-sm text-rose-600">Không thể tải nhật ký</p>';
    }
  }
}

function formatTimeAgo(dateString) {
  const date = new Date(dateString);
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
}
