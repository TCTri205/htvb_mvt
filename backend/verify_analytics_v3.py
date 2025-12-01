
import os
import django
import sys
from datetime import datetime
from django.utils import timezone

# Setup Django environment
sys.path.append(r'd:\Projects_IT\htvb_mvt\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from analytics.services import DashboardService, DocumentAnalyticsService, PerformanceService, ActivityService
from django.contrib.auth import get_user_model

User = get_user_model()

def test_services_with_params():
    print("Testing Services with Params...")
    user = User.objects.first()
    if not user:
        print("No user found to test personal scope")
        return

    print(f"Testing with user: {user.username} (ID: {user.id})")
    
    # 1. DashboardService
    print("\n1. DashboardService (user_id)")
    try:
        kpis = DashboardService.get_kpis(user_id=user.id)
        print(f"KPIs keys: {kpis.keys()}")
        print(f"Personal Inbound: {kpis['document_counts']['inbound']}")
    except Exception as e:
        print(f"DashboardService failed: {e}")
        import traceback
        traceback.print_exc()

    # 2. DocumentAnalyticsService
    print("\n2. DocumentAnalyticsService (user_id)")
    try:
        by_type = DocumentAnalyticsService.get_by_type(user_id=user.id)
        print(f"By Type count: {len(by_type)}")
        by_priority = DocumentAnalyticsService.get_by_priority(user_id=user.id)
        print(f"By Priority: {by_priority}")
    except Exception as e:
        print(f"DocumentAnalyticsService failed: {e}")
        import traceback
        traceback.print_exc()

    # 3. ActivityService
    print("\n3. ActivityService (user_id)")
    try:
        timeline = ActivityService.get_timeline(user_id=user.id)
        print(f"Timeline keys: {timeline.keys()}")
    except Exception as e:
        print(f"ActivityService failed: {e}")
        import traceback
        traceback.print_exc()
        
    # 4. PerformanceService
    print("\n4. PerformanceService (department_id)")
    try:
        # Assuming user has a department or just picking one
        dept_id = 1
        perf = PerformanceService.get_department_performance(department_id=dept_id)
        print(f"Dept Performance count: {len(perf)}")
    except Exception as e:
        print(f"PerformanceService failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_services_with_params()
