/**
 * vanthu-analytics.js
 * Module for handling Analytics & Reporting page logic for Clerk (Van Thu) role.
 */

(function () {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  // State
  const state = {
    dateFrom: null,
    dateTo: null,
    departmentId: null,
    charts: {}
  };

  // Main entry point
  window.initVanThuAnalytics = function () {
    console.info('[vanthu-analytics] Initializing...');
    
    // Initialize state from inputs
    const dateFromEl = $('#dateFrom');
    const dateToEl = $('#dateTo');
    const deptEl = $('#selDept');
    
    if (dateFromEl) state.dateFrom = dateFromEl.value;
    if (dateToEl) state.dateTo = dateToEl.value;
    if (deptEl) state.departmentId = deptEl.value;

    setupFilters();
    setupExport();
    loadAllData();
  };

  function setupFilters() {
    const btnMakeReport = $('#btnMakeReport');
    const dateFromEl = $('#dateFrom');
    const dateToEl = $('#dateTo');
    const deptEl = $('#selDept');

    // Load departments
    loadDepartments();

    const apply = () => {
      state.dateFrom = dateFromEl?.value;
      state.dateTo = dateToEl?.value;
      state.departmentId = deptEl?.value;
      loadAllData();
      window.TrisApp?.showToast('Đang cập nhật báo cáo...');
    };

    btnMakeReport?.addEventListener('click', apply);
    dateFromEl?.addEventListener('change', apply);
    dateToEl?.addEventListener('change', apply);
    deptEl?.addEventListener('change', apply);
  }

  function setupExport() {
    const btnExcel = $('#btnExportExcel');
    const btnPdf = $('#btnExportPDF');

    const handleExport = async (format) => {
      if (!window.ApiClient) return;
      
      const btn = format === 'CSV' ? btnExcel : btnPdf;
      const originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span>⏳</span> Đang xuất...`;

      try {
        const payload = {
          format: format,
          date_from: state.dateFrom,
          date_to: state.dateTo
        };

        const token = localStorage.getItem('access_token');
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };

        const response = await fetch('/api/v1/analytics/export', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error('Export failed');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        const disposition = response.headers.get('Content-Disposition');
        let filename = `baocao_${format.toLowerCase()}.csv`;
        if (disposition && disposition.indexOf('attachment') !== -1) {
            const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
            const matches = filenameRegex.exec(disposition);
            if (matches != null && matches[1]) { 
                filename = matches[1].replace(/['"]/g, '');
            }
        }
        
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        window.TrisApp?.showToast('Xuất báo cáo thành công!', 'success');
      } catch (error) {
        console.error('[vanthu-analytics] Export failed', error);
        window.TrisApp?.showToast('Có lỗi khi xuất báo cáo.', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    };

    btnExcel?.addEventListener('click', () => handleExport('CSV'));
    btnPdf?.addEventListener('click', () => window.TrisApp?.showToast('Tính năng xuất PDF đang phát triển.', 'info'));
  }

  async function loadDepartments() {
    const deptSelect = $('#selDept');
    if (!deptSelect || !window.ApiClient) return;

    try {
      const response = await window.ApiClient.departments.list({ page_size: 100 });
      const depts = window.ApiClient.extractItems(response);
      
      deptSelect.innerHTML = '<option value="">Tất cả phòng ban</option>';
      
      depts.forEach(dept => {
        const option = document.createElement('option');
        option.value = dept.department_id;
        option.textContent = dept.name;
        deptSelect.appendChild(option);
      });
    } catch (error) {
      console.warn('[vanthu-analytics] Failed to load departments', error);
    }
  }

  function loadAllData() {
    loadKPIs();
    loadCharts();
    loadTable();
  }

  async function loadKPIs() {
    if (!window.ApiClient) return;
    
    try {
      const params = {};
      if (state.dateFrom) params.date_from = state.dateFrom;
      if (state.dateTo) params.date_to = state.dateTo;
      if (state.departmentId) params.department_id = state.departmentId;

      const response = await window.ApiClient.request('/api/v1/analytics/dashboard', {
        method: 'GET',
        params: params
      });

      if (response && response.success && response.data) {
        updateKPIUI(response.data);
      }
    } catch (error) {
      console.error('[vanthu-analytics] Load KPIs failed', error);
    }
  }

  function updateKPIUI(data) {
    const { total_documents, processing_efficiency, document_counts } = data;

    // Total
    if (total_documents) {
        const el = $('#kpi-total');
        if (el) el.textContent = total_documents.count;
        
        // Growth trend
        const trendEl = $('#kpi-total-trend');
        if (trendEl) {
            const rate = total_documents.growth_rate;
            const color = rate >= 0 ? 'text-emerald-600' : 'text-rose-600';
            const sign = rate > 0 ? '+' : '';
            trendEl.innerHTML = `<span class="${color} font-medium">${sign}${rate}% so với kỳ trước</span>`;
        }
    }

    // On time
    if (processing_efficiency) {
        const el = $('#kpi-ontime');
        if (el) el.textContent = `${Math.round(processing_efficiency.rate)}%`;
    }

    // In/Out
    if (document_counts) {
        const elIn = $('#kpi-in');
        if (elIn) elIn.textContent = document_counts.inbound;

        const elOut = $('#kpi-out');
        if (elOut) elOut.textContent = document_counts.outbound;
    }
  }

  async function loadCharts() {
    if (!window.Chart) return;

    const commonParams = {};
    if (state.dateFrom) commonParams.date_from = state.dateFrom;
    if (state.dateTo) commonParams.date_to = state.dateTo;

    // 1. Monthly Bar - Activity Timeline
    try {
      const res = await window.ApiClient.request('/api/v1/analytics/activity/timeline', {
        params: { ...commonParams, period: 'month', metric: 'documents' }
      });
      if (res.success) renderMonthlyChart('chartMonthly', res.data);
    } catch (e) { console.warn('Chart chartMonthly failed', e); }

    // 2. Status Doughnut
    try {
      const res = await window.ApiClient.request('/api/v1/analytics/documents/by-status', {
        params: commonParams
      });
      if (res.success) renderStatusChart('chartStatus', res.data);
    } catch (e) { console.warn('Chart chartStatus failed', e); }

    // 3. Dept Bar - Performance
    try {
      const res = await window.ApiClient.request('/api/v1/analytics/performance/by-department', {
        params: commonParams
      });
      if (res.success) renderDeptChart('chartDept', res.data);
    } catch (e) { console.warn('Chart chartDept failed', e); }

    // 4. Priority Pie
    try {
      const res = await window.ApiClient.request('/api/v1/analytics/documents/by-priority', {
        params: commonParams
      });
      if (res.success) renderPriorityChart('chartPriority', res.data);
    } catch (e) { console.warn('Chart chartPriority failed', e); }
  }

  function renderMonthlyChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    destroyChart(canvasId);

    state.charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Văn bản',
          data: data.datasets[0].data,
          backgroundColor: '#3b82f6'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  function renderStatusChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    destroyChart(canvasId);

    const labels = data.map(d => d.status);
    const values = data.map(d => d.count);
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#8b5cf6'];

    state.charts[canvasId] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: colors.slice(0, values.length),
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'right' } }
      }
    });
  }

  function renderDeptChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    destroyChart(canvasId);

    state.charts[canvasId] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => d.department),
        datasets: [{
          label: 'Văn bản',
          data: data.map(d => d.doc_count),
          backgroundColor: '#10b981'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  function renderPriorityChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    destroyChart(canvasId);

    const labels = ['Khẩn cấp', 'Cao', 'Trung bình', 'Thấp'];
    const values = [data.URGENT || 0, data.HIGH || 0, data.MEDIUM || 0, data.LOW || 0];
    const colors = ['#e11d48', '#f59e0b', '#3b82f6', '#94a3b8'];

    state.charts[canvasId] = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: labels,
        datasets: [{
          data: values,
          backgroundColor: colors
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  function destroyChart(id) {
    if (state.charts[id]) {
      state.charts[id].destroy();
      delete state.charts[id];
    }
  }

  async function loadTable() {
    // Reuse documents by type endpoint for the table
    const commonParams = {};
    if (state.dateFrom) commonParams.date_from = state.dateFrom;
    if (state.dateTo) commonParams.date_to = state.dateTo;

    try {
        const res = await window.ApiClient.request('/api/v1/analytics/documents/by-type', {
            params: commonParams
        });
        if (res.success) renderReportTable(res.data);
    } catch (e) { console.warn('Table failed', e); }
  }

  function renderReportTable(data) {
    const tbody = $('#reportTable');
    if (!tbody) return;

    tbody.innerHTML = data.map((item, index) => `
        <tr class="hover:bg-slate-50">
            <td class="px-4 py-2">${index + 1}</td>
            <td class="px-4 py-2">${item.type_name}</td>
            <td class="px-4 py-2 text-center">${item.total}</td>
            <td class="px-4 py-2 text-center">${item.processed}</td>
            <td class="px-4 py-2 text-center">
                <span class="${item.success_rate >= 90 ? 'text-emerald-600' : 'text-rose-600'} font-medium">
                    ${Math.round(item.success_rate)}%
                </span>
            </td>
        </tr>
    `).join('');
  }

})();
