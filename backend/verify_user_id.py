
import os
import django
import sys

# Setup Django environment
sys.path.append(r'd:\Projects_IT\htvb_mvt\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model

User = get_user_model()

def test_user_attributes():
    print("Testing User model attributes...")
    user = User.objects.first()
    if not user:
        print("No user found.")
        return

    print(f"User: {user.username}")
    
    try:
        print(f"user.pk: {user.pk}")
        print("user.pk works!")
    except AttributeError:
        print("user.pk failed!")

    try:
        print(f"user.user_id: {user.user_id}")
        print("user.user_id works!")
    except AttributeError:
        print("user.user_id failed!")

    try:
        print(f"user.id: {user.id}")
        print("user.id works!")
    except AttributeError:
        print("user.id failed (EXPECTED)!")

if __name__ == "__main__":
    test_user_attributes()
