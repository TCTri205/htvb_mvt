from django.core.management.base import BaseCommand
from django.db import transaction
from accounts.models import User, Department
from documents.models import Document


class Command(BaseCommand):
    help = 'Fix department assignments for cv01 and their documents'

    def handle(self, *args, **options):
        self.stdout.write("=" * 60)
        self.stdout.write("FIXING DEPARTMENT ASSIGNMENTS")
        self.stdout.write("=" * 60)
        
        try:
            # Get Department 1
            dept1 = Department.objects.filter(pk=1).first()
            if not dept1:
                self.stdout.write(self.style.ERROR("❌ Department 1 not found!"))
                return
            
            self.stdout.write(f"\n✓ Target Department: {dept1.name} (ID: {dept1.department_id})")
            
            with transaction.atomic():
                # Fix user cv01
                try:
                    user = User.objects.get(username='cv01')
                    old_dept = user.department_id
                    user.department = dept1
                    user.save()
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"\n✓ Updated user 'cv01': Dept {old_dept} → {dept1.department_id}"
                        )
                    )
                except User.DoesNotExist:
                    self.stdout.write(self.style.ERROR("\n❌ User 'cv01' not found!"))
                    return
                
                # Fix all documents created by cv01
                docs = Document.objects.filter(created_by=user)
                count = docs.count()
                self.stdout.write(f"\n✓ Found {count} documents created by cv01")
                
                updated = 0
                for doc in docs:
                    if doc.department_id != dept1.department_id:
                        old_dept_id = doc.department_id
                        doc.department = dept1
                        doc.save()
                        updated += 1
                        self.stdout.write(
                            f"  → Doc {doc.document_id}: Dept {old_dept_id} → {dept1.department_id}"
                        )
                
                self.stdout.write(
                    self.style.SUCCESS(f"\n✓ Updated {updated} documents to Department {dept1.department_id}")
                )
            
            self.stdout.write("\n" + "=" * 60)
            self.stdout.write(self.style.SUCCESS("✓ COMPLETED SUCCESSFULLY"))
            self.stdout.write("=" * 60)
            self.stdout.write("\nPlease restart the Django server now.\n")
            
        except Exception as e:
            self.stdout.write(self.style.ERROR(f"\n❌ Error: {e}"))
            import traceback
            traceback.print_exc()
