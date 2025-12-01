/**
 * chuyenvien-analytics.js
 * Module for handling Analytics & Reporting page logic for Specialist role.
 */

(function () {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  // State
  const state = {
    scope: 'all',
    range: 'month',
    charts: {}
  };

  // Main entry point
  window.initChuyenVienAnalytics = function () {
    console.info('[chuyenvien-analytics] Initializing...');
    
    setupFilters();
    loadAllData();
  };

  function setupFilters() {
    const scopeEl = $('select[data-filter="scope"]');
    const rangeEl = $('select[data-filter="period"]');
    const btnPick = $('button[data-action="pick-range"]');

    scopeEl?.addEventListener('change', () => {
      state.scope = scopeEl.value;
      loadAllData();
    });

    rangeEl?.addEventListener('change', () => {
      state.range = rangeEl.value;
      loadAllData();
    });

    btnPick?.addEventListener('click', () => {
      window.TrisApp?.showToast('Tính năng chọn ngày tùy chỉnh đang phát triển.');
    });
  }

  function loadAllData() {
    // Calculate dates based on range
    const { dateFrom, dateTo } = getDateRange(state.range);
    
    loadKPIs(dateFrom, dateTo);
    loadCharts(dateFrom, dateTo);
  }

  function getDateRange(range) {
    const end = new Date();
    const start = new Date();
    
    switch (range) {
      case 'month':
        start.setDate(1);
        break;
      case 'quarter':
        start.setMonth(Math.floor(start.getMonth() / 3) * 3);
        start.setDate(1);
        break;
      case 'year':
        start.setMonth(0);
        start.setDate(1);
        break;
      case 'last6':
        start.setMonth(start.getMonth() - 6);
        break;
      default:
        start.setDate(1);
    }
    
    return {
      dateFrom: start.toISOString().split('T')[0],
      dateTo: end.toISOString().split('T')[0]
    };
  }

  async function loadKPIs(dateFrom, dateTo) {
    if (!window.ApiClient) return;
    
    try {
      const response = await window.ApiClient.request('/api/v1/analytics/dashboard', {
        method: 'GET',
        params: { date_from: dateFrom, date_to: dateTo, scope: state.scope }
      });

      if (response && response.success && response.data) {
        updateKPIUI(response.data);
      }
    } catch (error) {
      console.error('[chuyenvien-analytics] Load KPIs failed', error);
    }
  }

  function updateKPIUI(data) {
    const { processing_efficiency, overdue_rate, total_documents } = data;

    // Use text content matching or structure since IDs are missing in some cards
    const articles = Array.from($$('article'));

    // Completion Rate
    const kpiCompleteArticle = articles.find(a => a.textContent.includes('Tỷ lệ hoàn thành'));
    if (kpiCompleteArticle && processing_efficiency) {
        const valDiv = kpiCompleteArticle.querySelector('.text-3xl');
        if (valDiv) valDiv.textContent = `${Math.round(processing_efficiency.rate)}%`;
    }

    // Efficiency
    const kpiEffArticle = articles.find(a => a.textContent.includes('Hiệu suất xử lý'));
    if (kpiEffArticle && processing_efficiency) {
        const valDiv = kpiEffArticle.querySelector('.text-3xl');
        if (valDiv) valDiv.textContent = `${Math.round(processing_efficiency.rate)}%`;
    }

    // Docs Processed
    const kpiDocsArticle = articles.find(a => a.textContent.includes('Văn bản xử lý'));
    if (kpiDocsArticle && processing_efficiency) {
        const valDiv = kpiDocsArticle.querySelector('.text-3xl');
        if (valDiv) valDiv.textContent = `${processing_efficiency.completed}/${processing_efficiency.total}`;
    }

    // Late Tasks
    const kpiLateArticle = articles.find(a => a.textContent.includes('Công việc trễ hạn'));
    if (kpiLateArticle && overdue_rate) {
        const valDiv = kpiLateArticle.querySelector('.text-3xl');
        if (valDiv) valDiv.textContent = overdue_rate.count;
    }
  }

  async function loadCharts(dateFrom, dateTo) {
    if (!window.Chart) return;

    // 1. Bar Docs - Activity Timeline
    try {
      const res = await window.ApiClient.request('/api/v1/analytics/activity/timeline', {
        params: { date_from: dateFrom, date_to: dateTo, period: 'month', metric: 'documents', scope: state.scope }
      });
      if (res.success) renderBarChart('barDocs', res.data);
    } catch (e) { console.warn('Chart barDocs failed', e); }

    // 2. Pie Tasks - Status Distribution (NO date filter)
    try {
      const res = await window.ApiClient.request('/api/v1/analytics/documents/by-status', {
        params: { scope: state.scope }
      });
      if (res.success) renderPieChart('pieTasks', res.data);
    } catch (e) { console.warn('Chart pieTasks failed', e); }

    // 3. Line Perf - Activity Timeline (Daily)
    try {
      const res = await window.ApiClient.request('/api/v1/analytics/activity/timeline', {
        params: { date_from: dateFrom, date_to: dateTo, period: 'week', metric: 'documents', scope: state.scope }
      });
      if (res.success) renderLineChart('linePerf', res.data);
    } catch (e) { console.warn('Chart linePerf failed', e); }
  }

  function renderBarChart(canvasId, data) {
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
          backgroundColor: '#3b82f6',
          borderRadius: 4
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

  function renderPieChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    
    destroyChart(canvasId);
    
    // Handle empty data
    if (!data || !Array.isArray(data) || data.length === 0) {
      console.warn('[chuyenvien-analytics] No data for pieChart, showing placeholder:', canvasId);
      state.charts[canvasId] = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: ['Không có dữ liệu'],
          datasets: [{
            data: [1],
            backgroundColor: ['#e2e8f0'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { 
            legend: { position: 'right' },
            tooltip: { enabled: false }
          }
        }
      });
      return;
    }

    // data is [{status: '...', count: ...}]
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

  function renderLineChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    destroyChart(canvasId);

    state.charts[canvasId] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [{
          label: 'Hoạt động',
          data: data.datasets[0].data,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          tension: 0.3,
          fill: true
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

  function destroyChart(id) {
    if (state.charts[id]) {
      state.charts[id].destroy();
      delete state.charts[id];
    }
  }

})();
