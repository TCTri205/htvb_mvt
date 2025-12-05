# Generated migration to comprehensively normalize all document statuses
from django.db import migrations


def normalize_all_statuses_forward(apps, schema_editor):
    """
    Comprehensive migration to normalize ALL legacy statuses to canonical forms.
    
    Handles:
    - Outbound: RETURNED, TRA_LAI, BI_TRA_LAI → DRAFT
    - Outbound: APPROVED, PHE_DUYET, KY_SO, LD_DA_PHE_DUYET → PENDING_CLERK_CHECK
    - Inbound: TIEP_NHAN, PHAN_CONG, DANG_XU_LY, DANG_KY, HOAN_TAT, LUU_TRU → canonical equivalents
    - All Vietnamese variations → English canonical names
    """
    Document = apps.get_model('documents', 'Document')
    DocumentStatus = apps.get_model('catalog', 'DocumentStatus')
    DocumentWorkflowLog = apps.get_model('documents', 'DocumentWorkflowLog')
    
    # Define canonical statuses (must exist)
    CANONICAL_STATUSES = {
        # Inbound
        'RECEIVED', 'WAITING_ASSIGNMENT', 'PROCESSING',
        'PENDING_LEADER_APPROVAL', 'PENDING_CLERK_CHECK',
        'REGISTERED', 'DISPATCHED', 'ARCHIVED', 'THU_HOI',
        # Outbound
        'DRAFT', 'SUBMITTED', 'PENDING_CLERK_CHECK',
        'REGISTERED', 'ISSUED', 'ARCHIVED', 'HUY_PHAT_HANH',
    }
    
    # Create canonical statuses if they don't exist
    print("📝 Ensuring canonical statuses exist...")
    for status_name in CANONICAL_STATUSES:
        status, created = DocumentStatus.objects.get_or_create(status_name=status_name)
        if created:
            print(f"   ✓ Created: {status_name}")
    
    # Define ALL legacy→canonical mappings (comprehensive)
    LEGACY_MAPPINGS = {
        # Outbound legacy: RETURNED variations → DRAFT
        'RETURNED': 'DRAFT',
        'TRA_LAI': 'DRAFT',
        'BI_TRA_LAI': 'DRAFT',
        'Bị trả lại': 'DRAFT',
        'Trả lại': 'DRAFT',
        'Nháp': 'DRAFT',  # Vietnamese for Draft
        
        # Outbound legacy: APPROVED variations → PENDING_CLERK_CHECK
        'APPROVED': 'PENDING_CLERK_CHECK',
        'PHE_DUYET': 'PENDING_CLERK_CHECK',
        'KY_SO': 'PENDING_CLERK_CHECK',
        'LD_DA_PHE_DUYET': 'PENDING_CLERK_CHECK',
        'Phê duyệt': 'PENDING_CLERK_CHECK',
        'Lãnh đạo đã phê duyệt': 'PENDING_CLERK_CHECK',
        'Ký số': 'PENDING_CLERK_CHECK',
        'Đã ký': 'PENDING_CLERK_CHECK',  # Vietnamese for Signed/Approved
        
        # Outbound legacy: Other Vietnamese names
        'DU_THAO': 'DRAFT',
        'Dự thảo': 'DRAFT',
        'TRINH_DUYET': 'SUBMITTED',
        'DA_TRINH': 'SUBMITTED',
        'Trình duyệt': 'SUBMITTED',
        'Đã trình': 'SUBMITTED',
        'TRINH_LANH_DAO': 'SUBMITTED',
        'DA_TRINH_LANH_DAO': 'SUBMITTED',
        'TRINH_LD': 'SUBMITTED',
        'DA_TRINH_LD': 'SUBMITTED',
        'CHO_LANH_DAO_PHE_DUYET': 'SUBMITTED',
        'CHO_LD_PHE_DUYET': 'SUBMITTED',
        'Chờ lãnh đạo phê duyệt': 'SUBMITTED',
        'CHO_VAN_THU_KIEM_TRA': 'PENDING_CLERK_CHECK',
        'CHO_VT_KIEM_TRA': 'PENDING_CLERK_CHECK',
        'Chờ văn thư kiểm tra': 'PENDING_CLERK_CHECK',
        'DANG_KY': 'REGISTERED',
        'DA_VAO_SO': 'REGISTERED',
        'Đăng ký': 'REGISTERED',
        'Đã vào sổ': 'REGISTERED',
        'PHAT_HANH': 'ISSUED',
        'DA_PHAT_HANH': 'ISSUED',
        'Phát hành': 'ISSUED',
        'Đã phát hành': 'ISSUED',
        'LUU_TRU': 'ARCHIVED',
        'DA_LUU_TRU': 'ARCHIVED',
        'Lưu trữ': 'ARCHIVED',
        'Đã lưu trữ': 'ARCHIVED',
        
        # Inbound legacy
        'TIEP_NHAN': 'RECEIVED',
        'Tiếp nhận': 'RECEIVED',
        'PHAN_CONG': 'WAITING_ASSIGNMENT',
        'Phân công': 'WAITING_ASSIGNMENT',
        'Chờ phân công': 'WAITING_ASSIGNMENT',
        'DANG_XU_LY': 'PROCESSING',
        'Đang xử lý': 'PROCESSING',
        'HOAN_TAT': 'DISPATCHED',
        'Hoàn tất': 'DISPATCHED',
        'Đã phát hành kết quả': 'DISPATCHED',
        'Thu hồi': 'THU_HOI',
    }
    
    # Step 1: Get canonical status objects
    canonical_status_objs = {}
    for canonical_name in CANONICAL_STATUSES:
        try:
            canonical_status_objs[canonical_name] = DocumentStatus.objects.get(
                status_name=canonical_name
            )
        except DocumentStatus.DoesNotExist:
            print(f"⚠️  WARNING: Canonical status '{canonical_name}' not found!")
            continue
    
    # Step 2: Migrate documents
    print("\n📊 Migrating documents...")
    total_migrated = 0
    for legacy_name, canonical_name in LEGACY_MAPPINGS.items():
        if canonical_name not in canonical_status_objs:
            continue
        
        try:
            legacy_status = DocumentStatus.objects.get(status_name=legacy_name)
            canonical_status = canonical_status_objs[canonical_name]
            
            count = Document.objects.filter(status=legacy_status).update(
                status=canonical_status
            )
            
            if count > 0:
                total_migrated += count
                print(f"   ✓ {legacy_name:30} → {canonical_name:25} ({count:4} docs)")
        except DocumentStatus.DoesNotExist:
            # Legacy status doesn't exist in DB, skip
            pass
    
    print(f"\n   Total documents migrated: {total_migrated}")
    
    # Step 3: Migrate workflow logs (from_status and to_status)
    print("\n📜 Migrating workflow logs...")
    total_logs_migrated = 0
    for legacy_name, canonical_name in LEGACY_MAPPINGS.items():
        if canonical_name not in canonical_status_objs:
            continue
        
        try:
            legacy_status = DocumentStatus.objects.get(status_name=legacy_name)
            canonical_status = canonical_status_objs[canonical_name]
            
            # Update from_status
            count_from = DocumentWorkflowLog.objects.filter(
                from_status=legacy_status
            ).update(from_status=canonical_status)
            
            # Update to_status
            count_to = DocumentWorkflowLog.objects.filter(
                to_status=legacy_status
            ).update(to_status=canonical_status)
            
            total_count = count_from + count_to
            if total_count > 0:
                total_logs_migrated += total_count
                print(f"   ✓ {legacy_name:30} → {canonical_name:25} ({total_count:4} logs)")
        except DocumentStatus.DoesNotExist:
            pass
    
    print(f"\n   Total workflow logs migrated: {total_logs_migrated}")
    
    # Step 4: Delete legacy status records that are no longer referenced
    print("\n🗑️  Cleaning up legacy status records...")
    deleted_count = 0
    for legacy_name in LEGACY_MAPPINGS.keys():
        try:
            legacy_status = DocumentStatus.objects.get(status_name=legacy_name)
            
            # Double-check no documents or logs reference this status
            doc_count = Document.objects.filter(status=legacy_status).count()
            log_from_count = DocumentWorkflowLog.objects.filter(from_status=legacy_status).count()
            log_to_count = DocumentWorkflowLog.objects.filter(to_status=legacy_status).count()
            
            if doc_count == 0 and log_from_count == 0 and log_to_count == 0:
                legacy_status.delete()
                deleted_count += 1
                print(f"   ✓ Deleted: {legacy_name}")
            else:
                print(f"   ⚠️  Skipped (still referenced): {legacy_name} "
                      f"(docs={doc_count}, logs_from={log_from_count}, logs_to={log_to_count})")
        except DocumentStatus.DoesNotExist:
            pass
    
    print(f"\n   Total legacy statuses deleted: {deleted_count}")
    
    # Step 5: Final validation
    print("\n✅ Validation...")
    remaining_statuses = DocumentStatus.objects.all()
    print(f"   Total DocumentStatus records: {remaining_statuses.count()}")
    
    non_canonical = remaining_statuses.exclude(status_name__in=CANONICAL_STATUSES)
    if non_canonical.exists():
        print(f"\n   ⚠️  WARNING: {non_canonical.count()} non-canonical statuses still exist:")
        for status in non_canonical:
            doc_count = Document.objects.filter(status=status).count()
            print(f"      - {status.status_name} ({doc_count} docs)")
    else:
        print("   ✓ All DocumentStatus records are canonical!")
    
    print("\n✅ Migration complete!")


def normalize_all_statuses_reverse(apps, schema_editor):
    """
    Reverse migration.
    
    NOTE: This is intentionally limited. We cannot perfectly restore
    which documents were originally RETURNED vs DRAFT, or APPROVED vs
    PENDING_CLERK_CHECK. The information is lost after forward migration.
    """
    print("⚠️  WARNING: Reverse migration is limited and cannot perfectly restore original states")
    print("   Documents will remain in their canonical states.")
    print("   To restore legacy statuses, you must restore from a database backup.")


class Migration(migrations.Migration):

    dependencies = [
        ('catalog', '0003_add_huy_phat_hanh_status'),
        ('documents', '0010_alter_documentworkflowlog_action'),  # Use latest documents migration
    ]

    operations = [
        migrations.RunPython(
            normalize_all_statuses_forward,
            normalize_all_statuses_reverse
        ),
    ]
