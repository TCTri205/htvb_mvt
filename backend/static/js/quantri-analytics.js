/**
 * quantri-analytics.js
 * Module for handling Analytics & Reporting page logic.
 * FIXED: Full implementation of chart rendering and stats population.
 */

(function () {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  // State management
  const state = {
    dateFrom: null,
    dateTo: null,
    departmentId: null,
    charts: {},
    currentTab: 'tab-overview'
  };

  // Helper functions
  function getToken() {
    return localStorage.getItem('access_token') || localStorage.getItem('htvb.accessToken') || '';
  }

  function setText(selector, text) {
    const el = $(selector);
    if (el) el.textContent = text;
  }

  function showLoading(show) {
    const overlay = $('#analyticsLoading');
    if (overlay) {
      overlay.classList.toggle('hidden', !show);
    }
  }

  function setDefaultDateRange(dateFromEl, dateToEl) {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), 0, 1);
    
    if (dateFromEl) {
      dateFromEl.valueAsDate = firstDay;
      state.dateFrom = dateFromEl.value;
    }
    if (dateToEl) {
      dateToEl.valueAsDate = today;
      state.dateTo = dateToEl.value;
    }
  }

  function updateStateFromInputs() {
    const dateFromEl = $('#dateFrom');
    const dateToEl = $('#dateTo');
    const deptEl = $('#filterDept');

    state.dateFrom = dateFromEl?.value || null;
    state.dateTo = dateToEl?.value || null;
    state.departmentId = (deptEl?.value === 'all' || !deptEl?.value) ? null : deptEl.value;
  }

  // API request handler
  async function requestAnalytics(path, params = {}) {
    const client = window.ApiClient;
    if (client?.request) {
      return client.request(path, { params });
    }

    // Fallback to fetch
    const qs = new URLSearchParams(params).toString();
    const url = path + (qs ? `?${qs}` : '');
    const token = getToken();
    
    const response = await fetch(url, {
      headers: { 'Authorization': token ? `Bearer ${token}` : '' }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return response.json();
  }

  // Setup functions
  function setupFilters() {
    const btnFilter = $('#btnFilter');
    const btnRefresh = $('#btnRefresh');
    
    if (btnFilter) {
      btnFilter.addEventListener('click', () => {
        updateStateFromInputs();
        loadAllData();
      });
    }

    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => {
        const dateFromEl = $('#dateFrom');
        const dateToEl = $('#dateTo');
        const deptEl = $('#filterDept');
        
        setDefaultDateRange(dateFromEl, dateToEl);
        if (deptEl) deptEl.value = 'all';  // FIXED: was departEl
        
        updateStateFromInputs();
        loadAllData();
        window.AdminApp?.showToast('Đã làm mới dữ liệu', 'success');
      });
    }
  }

  function setupTabs() {
    const tabBtns = $$('.tab-btn');
    const tabPanels = $$('.tab-panel');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.dataset.tab;
        state.currentTab = targetTab;

        // Update button states
        tabBtns.forEach(b => {
          b.classList.remove('text-blue-700', 'border-b-2', 'border-blue-600', 'font-medium');
          b.classList.add('text-slate-600', 'hover:text-slate-800');
        });
        btn.classList.remove('text-slate-600', 'hover:text-slate-800');
        btn.classList.add('text-blue-700', 'border-b-2', 'border-blue-600', 'font-medium');

        // Update panel visibility
        tabPanels.forEach(panel => {
          panel.classList.add('hidden');
        });
        const targetPanel = $(`#${targetTab}`);
        if (targetPanel) {
          targetPanel.classList.remove('hidden');
        }
      });
    });
  }

  async function loadDepartments() {
    try {
      const response = await requestAnalytics('/api/v1/departments/');
      const depts = response?.data || response || [];
      const deptSelect = $('#filterDept');
      
      if (!deptSelect || !Array.isArray(depts)) return;

      depts.forEach(dept => {
        const option = document.createElement('option');
        option.value = dept.department_id;
        option.textContent = dept.name;
        deptSelect.appendChild(option);
      });
    } catch (error) {
      console.warn('[quantri-analytics] Failed to load departments', error);
    }
  }

  // Data loading functions
  async function loadAllData() {
    showLoading(true);
    try {
      await Promise.all([
        loadKPIs(),
        loadCharts(),
        loadTables()
      ]);
    } catch (error) {
      console.error('[quantri-analytics] loadAllData failed', error);
      window.AdminApp?.showToast('Không thể tải dữ liệu thống kê', 'error');
    } finally {
      showLoading(false);
    }
  }

  async function loadKPIs() {
    try {
      const params = {};
      if (state.dateFrom) params.date_from = state.dateFrom;
      if (state.dateTo) params.date_to = state.dateTo;
      if (state.departmentId) params.department_id = state.departmentId;

      const response = await requestAnalytics('/api/v1/analytics/dashboard', params);

      if (response?.success && response.data) {
        updateKPIUI(response.data);
      }
    } catch (error) {
      console.error('[quantri-analytics] Load KPIs failed', error);
      updateKPIUI({});
    }
  }

  function updateKPIUI(data) {
    const { total_documents, active_users, processing_efficiency, overdue_rate, document_counts } = data;
    
    // Total documents
    if (total_documents) {
      setText('#kpiTotalDocs', total_documents.current || 0);
      setText('#kpiTotalDocsNote', `Tăng ${total_documents.growth_rate || 0}% so với kỳ trước`);
    }

    // Active users
    if (active_users) {
      setText('#kpiActiveUsersValue', active_users.active || 0);
      setText('#kpiActiveUsersNote', `${active_users.rate || 0}% tổng người dùng`);
    }

    // Processing efficiency
    if (processing_efficiency) {
      setText('#kpiEfficiencyValue', `${processing_efficiency.rate || 0}%`);
      setText('#kpiEfficiencyNote', `${processing_efficiency.completed || 0}/${processing_efficiency.total || 0} văn bản`);
    }

    // Overdue rate
    if (overdue_rate) {
      setText('#kpiOverdueValue', `${overdue_rate.rate || 0}%`);
      setText('#kpiOverdueNote', `${overdue_rate.count || 0} văn bản quá hạn`);
    }

    // FIXED: Populate "Thống kê tổng quát" section
    setText('#sumLogin', active_users?.active || '--');
    setText('#avgSessionTime', '--'); // Not available yet
    setText('#docsHandledToday', processing_efficiency?.completed || '--');
    setText('#meetingsCount', '--'); // Not available yet
    setText('#notificationsSent', '--'); // Not available yet
    
    // Also for activity tab
    setText('#sumLoginActivity', active_users?.active || '--');
    setText('#avgSessionActivity', '--');
    setText('#docsHandledActivity', processing_efficiency?.completed || '--');
    setText('#meetingsActivity', '--');
    setText('#notificationsActivity', '--');
  }

  async function loadCharts() {
    console.log('[quantri-analytics] Loading charts...');
    
    const params = {};
    if (state.dateFrom) params.date_from = state.dateFrom;
    if (state.dateTo) params.date_to = state.dateTo;

    try {
      // 1. Activity timeline (line chart)
      const timelineResponse = await requestAnalytics('/api/v1/analytics/activity/timeline', {
        ...params,
        period: 'day',
        metric: 'documents'
      });
      
      if (timelineResponse?.success && timelineResponse.data) {
        renderTimelineChart(timelineResponse.data);
      }

      // 2. Priority distribution (pie chart)
      try {
        const priorityResponse = await requestAnalytics('/api/v1/analytics/documents/by-priority', params);
        if (priorityResponse?.success && priorityResponse.data) {
          renderPriorityChart(priorityResponse.data);
        }
      } catch (e) {
        console.warn('[quantri-analytics] Priority chart failed', e);
      }

      // 3. Department performance (horizontal bar chart)
      try {
        const deptResponse = await requestAnalytics('/api/v1/analytics/performance/by-department', params);
        if (deptResponse?.success && deptResponse.data) {
          renderDepartmentChart(deptResponse.data);
        }
      } catch (e) {
        console.warn('[quantri-analytics] Department chart failed', e);
      }

      // 4. Document status distribution
      try {
        const statusResponse = await requestAnalytics('/api/v1/analytics/documents/by-status', params);
        if (statusResponse?.success && statusResponse.data) {
          // Could render another chart here if needed
          console.log('[quantri-analytics] Status data loaded', statusResponse.data);
        }
      } catch (e) {
        console.warn('[quantri-analytics] Status data failed', e);
      }

    } catch (error) {
      console.warn('[quantri-analytics] Charts loading failed', error);
    }
  }

  function renderTimelineChart(data) {
    if (!window.Chart) {
      console.warn('[quantri-analytics] Chart.js not available');
      return;
    }

    const labels = data.labels || [];
    const values = data.datasets?.[0]?.data || [];

    // Render to multiple canvases if needed
    const canvasIds = ['chAccessDay', 'chAccessDay2', 'chDayLine', 'chWeekBars', 'chWeekBars2'];
    
    canvasIds.forEach(canvasId => {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;

      // Destroy existing chart
      if (state.charts[canvasId]) {
        state.charts[canvasId].destroy();
      }

      const isBarChart = canvasId.includes('Bar');
      const ctx = canvas.getContext('2d');
      
      state.charts[canvasId] = new Chart(ctx, {
        type: isBarChart ? 'bar' : 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Văn bản',
            data: values,
            backgroundColor: isBarChart ? 'rgba(59, 130, 246, 0.5)' : 'rgba(59, 130, 246, 0.1)',
            borderColor: 'rgb(59, 130, 246)',
            borderWidth: 2,
            tension: 0.4
          }]
        },
        options: {
          // FIXED: Use aspect ratio to prevent infinite stretch
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: isBarChart ? 2.5 : 3.5, // FIXED: Increased for wider charts
          // FIXED: Horizontal bars for better readability
          indexAxis: isBarChart ? 'y' : 'x',
          plugins: {
            legend: {
              display: false
            }
          },
          scales: {
            [isBarChart ? 'x' : 'y']: {
              beginAtZero: true,
              ticks: {
                precision: 0
              }
            }
          }
        }
      });
    });
  }

  function renderPriorityChart(data) {
    if (!window.Chart) return;

    const canvas = document.getElementById('chPriority');
    if (!canvas) return;

    // Destroy existing
    if (state.charts.chPriority) {
      state.charts.chPriority.destroy();
    }

    const labels = Object.keys(data);
    const values = Object.values(data);
    const colors = [
      'rgb(239, 68, 68)',   // URGENT - red
      'rgb(249, 115, 22)',  // HIGH - orange
      'rgb(59, 130, 246)',  // MEDIUM - blue
      'rgb(34, 197, 94)'    // LOW - green
    ];

    const ctx = canvas.getContext('2d');
    state.charts.chPriority = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true, // FIXED: Use aspect ratio
        aspectRatio: 1.5, // Slightly wider than tall
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  }

  function renderDepartmentChart(data) {
    if (!window.Chart) return;

    const canvas = document.getElementById('chPerfDept');
    if (!canvas) return;

    // Destroy existing
    if (state.charts.chPerfDept) {
      state.charts.chPerfDept.destroy();
    }

    if (!data || !data.length) {
      console.log('[quantri-analytics] No department data to render');
      return;
    }

    // Sort by efficiency descending
    const sorted = [...data].sort((a, b) => b.efficiency - a.efficiency);
    const labels = sorted.map(d => d.department);
    const efficiencies = sorted.map(d => d.efficiency);

    // Color code: green if >80%, yellow if >50%, orange if >30%, red otherwise
    const backgroundColors = efficiencies.map(eff => {
      if (eff >= 80) return 'rgba(34, 197, 94, 0.7)';   // green
      if (eff >= 50) return 'rgba(234, 179, 8, 0.7)';   // yellow
      if (eff >= 30) return 'rgba(249, 115, 22, 0.7)';  // orange
      return 'rgba(239, 68, 68, 0.7)';                  // red
    });

    const ctx = canvas.getContext('2d');
    state.charts.chPerfDept = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Hiệu suất (%)',
          data: efficiencies,
          backgroundColor: backgroundColors,
          borderColor: backgroundColors.map(c => c.replace('0.7', '1')),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 2.5,
        indexAxis: 'y', // Horizontal bars
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const index = context.dataIndex;
                const dept = sorted[index];
                return [
                  `Hiệu suất: ${dept.efficiency}%`,
                  `Số văn bản: ${dept.doc_count}`,
                  `Thời gian TB: ${dept.avg_time} ngày`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            max: 100,
            ticks: {
              callback: (value) => value + '%'
            }
          }
        }
      }
    });
  }

  async function loadTables() {
    const params = {};
    if (state.dateFrom) params.date_from = state.dateFrom;
    if (state.dateTo) params.date_to = state.dateTo;

    try {
      // Load document types table
      const typeResponse = await requestAnalytics('/api/v1/analytics/documents/by-type', params);
      if (typeResponse?.success && typeResponse.data) {
        populateDocTypeTable(typeResponse.data);
      }

      // Load department performance table
      const deptResponse = await requestAnalytics('/api/v1/analytics/performance/by-department', params);
      if (deptResponse?.success && deptResponse.data) {
        populateDeptPerfTable(deptResponse.data);
      }

      // Load user performance table
      const userResponse = await requestAnalytics('/api/v1/analytics/performance/top-users', { ...params, limit: 10 });
      if (userResponse?.success && userResponse.data) {
        populateUserPerfTable(userResponse.data);
        // Also populate user summary cards
        populateUserSummary(userResponse.data);
      }
    } catch (error) {
      console.error('[quantri-analytics] Load tables failed', error);
    }
  }

  function populateDocTypeTable(data) {
    const tbody = $('#docTypeTableBody');
    if (!tbody) return;

    if (!data || !data.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-3 text-center text-slate-500">Không có dữ liệu</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(item => `
      <tr>
        <td class="px-4 py-3">${item.type_name || 'N/A'}</td>
        <td class="px-4 py-3 text-right">${item.total || 0}</td>
        <td class="px-4 py-3 text-right">${item.processed || 0}</td>
        <td class="px-4 py-3 text-right">${item.success_rate || 0}%</td>
        <td class="px-4 py-3 text-right">${item.avg_processing_days || 0} ngày</td>
      </tr>
    `).join('');
  }

  function populateDeptPerfTable(data) {
    const tbody = $('#deptPerfTableBody');
    if (!tbody) return;

    if (!data || !data.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="px-4 py-3 text-center text-slate-500">Không có dữ liệu</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(item => `
      <tr>
        <td class="px-4 py-3">${item.department || 'N/A'}</td>
        <td class="px-4 py-3 text-right">${item.doc_count || 0}</td>
        <td class="px-4 py-3 text-right">${item.efficiency || 0}%</td>
        <td class="px-4 py-3 text-right">${item.avg_time || 0}</td>
        <td class="px-4 py-3 text-right">#${item.ranking || 0}</td>
      </tr>
    `).join('');
  }

  function populateUserPerfTable(data) {
    const tbody = $('#userPerfTableBody');
    if (!tbody) return;

    if (!data || !data.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-3 text-center text-slate-500">Không có dữ liệu</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(item => `
      <tr>
        <td class="px-4 py-3">${item.user || 'N/A'}</td>
        <td class="px-4 py-3">${item.role || 'N/A'}</td>
        <td class="px-4 py-3 text-right">${item.processed_count || 0}</td>
        <td class="px-4 py-3 text-right">${item.efficiency || 0}%</td>
        <td class="px-4 py-3 text-right">${item.avg_time || 0} ngày</td>
        <td class="px-4 py-3 text-right">#${item.rank || 0}</td>
      </tr>
    `).join('');
  }

  function populateUserSummary(data) {
    if (!data || !data.length) return;

    // Calculate summary statistics
    const totalUsers = data.length;
    const avgEfficiency = data.reduce((sum, u) => sum + (u.efficiency || 0), 0) / totalUsers;
    const targetHit = data.filter(u => u.efficiency >= 80).length; // 80% is target

    setText('#usersActiveSummary', totalUsers);
    setText('#avgEfficiencySummary', `${Math.round(avgEfficiency)}%`);
    setText('#targetHitSummary', targetHit);
  }

  // Main initialization
  window.initQuantriAnalytics = async function () {
    console.info('[quantri-analytics] Initializing...');
    
    const dateFromEl = $('#dateFrom');
    const dateToEl = $('#dateTo');
    const deptEl = $('#filterDept');

    setDefaultDateRange(dateFromEl, dateToEl);
    if (deptEl) state.departmentId = (deptEl.value === 'all') ? null : deptEl.value;

    setupFilters();
    setupTabs();
    await loadDepartments();
    await loadAllData();
  };

  // Export for quantri.js
  window.initThongKe = window.initQuantriAnalytics;

  console.info('[quantri-analytics] Module loaded');
})();
