# core/management/commands/seed_case_statuses.py
"""Seed all required case statuses for workflow."""

from django.core.management.base import BaseCommand
from django.apps import apps


class Command(BaseCommand):
    help = "Seed all required case statuses for workflow"

    def handle(self, *args, **options):
        try:
            CaseStatus = apps.get_model('catalog', 'CaseStatus')
        except LookupError:
            self.stdout.write(self.style.ERROR('❌ Model catalog.CaseStatus not found'))
            return

        # All required case statuses for workflow
        required_statuses = [
            "MOI_TAO",           # Newly created
            "CHO_PHAN_CONG",     # Waiting for assignment
            "DA_PHAN_CONG",      # Assigned
            "DANG_THUC_HIEN",    # In progress
            "TAM_DUNG",          # Paused
            "CHO_DUYET_DONG",    # Waiting for close approval
            "DONG",              # Closed
            "LUU_TRU",           # Archived
        ]

        created_count = 0
        existing_count = 0

        for status_name in required_statuses:
            obj, created = CaseStatus.objects.get_or_create(
                case_status_name=status_name
            )
            if created:
                created_count += 1
                self.stdout.write(self.style.SUCCESS(f'✓ Created: {status_name}'))
            else:
                existing_count += 1
                self.stdout.write(f'  Already exists: {status_name}')

        self.stdout.write(
            self.style.SUCCESS(
                f'\n✓ Done! Created: {created_count}, Existing: {existing_count}, Total: {len(required_statuses)}'
            )
        )
