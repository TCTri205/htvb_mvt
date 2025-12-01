
import os
import django
import sys

# Setup Django environment
sys.path.append(r'd:\Projects_IT\htvb_mvt\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from analytics.services import PerformanceService

def test_department_performance():
    print("Testing PerformanceService.get_department_performance...")
    
    # Test system wide
    try:
        perf = PerformanceService.get_department_performance()
        print(f"✓ System wide test PASSED. Found {len(perf)} departments.")
        if perf:
            print(f"  Sample: {perf[0]}")
    except Exception as e:
        print(f"✗ System wide test FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False

    # Test with specific department
    try:
        perf_dept = PerformanceService.get_department_performance(department_id=1)
        print(f"✓ Department filter test PASSED. Found {len(perf_dept)} department(s).")
        if perf_dept:
            print(f"  Details: {perf_dept[0]}")
    except Exception as e:
        print(f"✗ Department filter test FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    print("\n✓ All tests PASSED!")
    return True

if __name__ == "__main__":
    success = test_department_performance()
    sys.exit(0 if success else 1)
