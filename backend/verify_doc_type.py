
import os
import django
import sys
from datetime import datetime
from django.utils import timezone

# Setup Django environment
sys.path.append(r'd:\Projects_IT\htvb_mvt\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from analytics.services import DocumentAnalyticsService

def test_get_by_type():
    print("Testing DocumentAnalyticsService.get_by_type...")
    try:
        by_type = DocumentAnalyticsService.get_by_type()
        print(f"By Type count: {len(by_type)}")
        for item in by_type:
            print(f" - {item['type_name']}: {item['total']}")
    except Exception as e:
        print(f"DocumentAnalyticsService.get_by_type failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_get_by_type()
