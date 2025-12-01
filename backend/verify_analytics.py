
import os
import django
import sys
from datetime import datetime

# Setup Django environment
sys.path.append(r'd:\Projects_IT\htvb_mvt\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from analytics.services import DashboardService, DocumentAnalyticsService, PerformanceService, ActivityService

def test_services():
    print("Testing DashboardService...")
    try:
        kpis = DashboardService.get_kpis()
        print(f"KPIs: {kpis.keys()}")
        if 'document_counts' in kpis:
            print(f"Document Counts: {kpis['document_counts']}")
    except Exception as e:
        print(f"DashboardService failed: {e}")

    print("\nTesting DocumentAnalyticsService...")
    try:
        by_type = DocumentAnalyticsService.get_by_type()
        print(f"By Type count: {len(by_type)}")
        by_priority = DocumentAnalyticsService.get_by_priority()
        print(f"By Priority: {by_priority}")
    except Exception as e:
        print(f"DocumentAnalyticsService failed: {e}")

    print("\nTesting PerformanceService...")
    try:
        dept_perf = PerformanceService.get_department_performance()
        print(f"Dept Performance count: {len(dept_perf)}")
        top_users = PerformanceService.get_top_users()
        print(f"Top Users count: {len(top_users)}")
    except Exception as e:
        print(f"PerformanceService failed: {e}")

    print("\nTesting ActivityService...")
    try:
        timeline = ActivityService.get_timeline()
        print(f"Timeline keys: {timeline.keys()}")
    except Exception as e:
        print(f"ActivityService failed: {e}")

if __name__ == "__main__":
    test_services()
