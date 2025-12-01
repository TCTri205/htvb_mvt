
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
from django.contrib.auth import get_user_model

User = get_user_model()

def test_get_by_status():
    print("Testing DocumentAnalyticsService.get_by_status...")
    user = User.objects.first()
    if not user:
        print("No user found")
        return

    print(f"User: {user.username}")
    
    # Test system wide
    try:
        stats = DocumentAnalyticsService.get_by_status()
        print(f"System wide stats: {stats}")
    except Exception as e:
        print(f"System wide failed: {e}")
        import traceback
        traceback.print_exc()

    # Test personal scope
    try:
        stats_personal = DocumentAnalyticsService.get_by_status(user_id=user.id)
        print(f"Personal stats: {stats_personal}")
    except Exception as e:
        print(f"Personal failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_get_by_status()
