import random
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.core.files.storage import default_storage
from django.db.models import Max
from django.utils import timezone

from cases.models import Case
from documents.models import Document, DocumentAttachment

from .models import ArchiveBackupRecord, ArchiveQueueItem, RetentionPolicy


class ArchiveService:
    CATEGORY_DEFINITIONS = [
        ("Văn bản", {".doc", ".docx", ".pdf", ".txt", ".xls", ".xlsx", ".ppt", ".pptx"}),
        ("Hình ảnh", {".png", ".jpg", ".jpeg", ".gif", ".svg", ".bmp"}),
        ("Đoạn phim", {".mp4", ".mov", ".avi", ".mkv"}),
    ]

    DEFAULT_CAPACITY_BYTES = getattr(settings, "ARCHIVE_STORAGE_LIMIT_BYTES", 500 * 1024**3)

    @classmethod
    def _classify_extension(cls, extension: str) -> str:
        ext = extension.lower()
        for label, bucket in cls.CATEGORY_DEFINITIONS:
            if ext in bucket:
                return label
        return "Khác"

    @classmethod
    def _file_size(cls, storage_path: str | None) -> int:
        if not storage_path:
            return 0
        try:
            return default_storage.size(storage_path)
        except Exception:
            return 0

    @classmethod
    def get_storage_usage(cls) -> tuple[int, dict[str, int]]:
        breakdown = {label: 0 for label, _ in cls.CATEGORY_DEFINITIONS}
        breakdown["Khác"] = 0
        total_bytes = 0
        for attachment in DocumentAttachment.objects.only("file_name", "storage_path"):
            path = attachment.storage_path
            size = cls._file_size(path)
            if size <= 0:
                continue
            label = cls._classify_extension(Path(attachment.file_name or path or "").suffix)
            breakdown[label] = breakdown.get(label, 0) + size
            total_bytes += size
        return total_bytes, breakdown

    @classmethod
    def get_summary(cls) -> dict:
        total_documents = Document.objects.count()
        total_cases = Case.objects.count()
        pending_queue = ArchiveQueueItem.objects.exclude(status=ArchiveQueueItem.Status.COMPLETED).count()
        latest_doc = Document.objects.aggregate(last_updated=Max("updated_at"))["last_updated"]
        total_bytes, breakdown = cls.get_storage_usage()
        return {
            "total_documents": total_documents,
            "total_cases": total_cases,
            "pending_queue": pending_queue,
            "latest_sync": timezone.localtime(latest_doc).isoformat() if latest_doc else None,
            "storage": {
                "total_bytes": total_bytes,
                "capacity_bytes": cls.DEFAULT_CAPACITY_BYTES,
                "breakdown": [
                    {"label": label, "size_bytes": size} for label, size in breakdown.items()
                ],
            },
        }

    @classmethod
    def queue_archive_job(cls, label: str, category: str, size_bytes: int | None = None) -> ArchiveQueueItem:
        if size_bytes is None:
            size_bytes, _ = cls.get_storage_usage()
        progress = random.randint(25, 85)
        status = ArchiveQueueItem.Status.PROCESSING if progress < 90 else ArchiveQueueItem.Status.COMPLETED
        metadata = {"category_hint": category}
        return ArchiveQueueItem.objects.create(
            label=label,
            category=category,
            size_bytes=size_bytes,
            progress=progress,
            status=status,
            metadata=metadata,
        )

    @classmethod
    def create_backup(cls, title: str, method: str) -> ArchiveBackupRecord:
        total_bytes, _ = cls.get_storage_usage()
        duration_seconds = random.randint(90, 180)
        backup = ArchiveBackupRecord.objects.create(
            title=title,
            method=method,
            size_bytes=total_bytes,
            duration_seconds=duration_seconds,
            status=ArchiveBackupRecord.Status.SUCCESS,
            completed_at=timezone.now(),
        )
        cls.queue_archive_job(f"Sao lưu {title}", "backup", total_bytes)
        return backup

    @classmethod
    def create_restore_job(cls, backup: ArchiveBackupRecord) -> ArchiveQueueItem:
        return cls.queue_archive_job(f"Khôi phục {backup.title}", "restore", backup.size_bytes)

    @classmethod
    def ensure_policies(cls) -> None:
        if RetentionPolicy.objects.exists():
            return
        defaults = [
            {
                "name": "Hồ sơ hành chính",
                "category": "Hành chính",
                "retention_years": 5,
                "quantity": 1247,
                "status": RetentionPolicy.Status.ACTIVE,
                "next_review_at": timezone.now().date() + timedelta(days=45),
                "description": "Các văn bản hành chính thường ngày, thông báo nội bộ",
            },
            {
                "name": "Hồ sơ tài chính",
                "category": "Tài chính",
                "retention_years": 15,
                "quantity": 856,
                "status": RetentionPolicy.Status.ACTIVE,
                "next_review_at": timezone.now().date() + timedelta(days=90),
                "description": "Báo cáo tài chính, ngân sách, quyết toán",
            },
            {
                "name": "Hồ sơ quy hoạch",
                "category": "Quy hoạch",
                "retention_years": 999,
                "quantity": 423,
                "status": RetentionPolicy.Status.ACTIVE,
                "next_review_at": None,
                "description": "Quy hoạch phát triển kinh tế xã hội, quy hoạch đô thị",
            },
            {
                "name": "Hồ sơ nhân sự",
                "category": "Nhân sự",
                "retention_years": 20,
                "quantity": 689,
                "status": RetentionPolicy.Status.REVIEW,
                "next_review_at": timezone.now().date() - timedelta(days=10),
                "description": "Hồ sơ cán bộ, công chức, viên chức",
            },
        ]
        for data in defaults:
            RetentionPolicy.objects.create(**data)
