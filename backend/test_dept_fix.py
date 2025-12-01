
import os
import django
import sys

# Setup Django environment
sys.path.append(r'd:\Projects_IT\htvb_mvt\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from analytics.services import PerformanceService

print("Testing PerformanceService.get_department_performance...")
try:
    perf = PerformanceService.get_department_performance()
    print(f"✓ SUCCESS! Found {len(perf)} departments.")
    if perf:
        print(f"Sample: {perf[0]}")
except Exception as e:
    print(f"✗ FAILED: {e}")
    import traceback
    traceback.print_exc()
