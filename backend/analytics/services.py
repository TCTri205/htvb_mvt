# analytics/services.py
"""
Analytics service layer for KPIs, statistics, and performance metrics.
FIXED: Date range handling, efficiency caps, NULL handling, consistent query patterns.
"""
from __future__ import annotations

from datetime import datetime, timedelta, date
from functools import lru_cache
import re
import unicodedata
from typing import Optional, Dict, Any, List

from django.db.models import Count, Q, F, Avg, ExpressionWrapper, DurationField, Prefetch
from django.db.models.functions import TruncDate
from django.utils import timezone
from django.contrib.auth import get_user_model

from documents.models import Document, DocumentAssignment, DocumentWorkflowLog
from accounts.models import Department
from catalog.models import DocumentStatus
from cases.models import CaseTask
from notifications.models import Notification
from workflow.services.status_resolver import (
    InboundStatus,
    OutboundStatus,
    canonical_status_key,
)

User = get_user_model()

PROCESSED_STATUS_KEYS = {
    # Canonical inbound/outbound statuses
    'REGISTERED',
    'DISPATCHED',
    'ISSUED',
    'ARCHIVED',
    'APPROVED',
    # Common Vietnamese/legacy labels
    'DA_KY',
    'DA_PHAT_HANH',
    'PHAT_HANH',
    'DA_LUU_TRU',
    'HOAN_THANH',
    'HOAN_TAT',
    'DONG',
    'CLOSED',
    'COMPLETED',
}

_STATUS_SANITIZE_RE = re.compile(r"[^A-Z0-9_]+")


def _normalize_status(name: Optional[str]) -> str:
    """
    Normalize status text to a stable key for comparison.
    Removes accents, uppercases, collapses whitespace/invalid chars to '_'. 
    """
    if not name:
        return ""
    stripped = unicodedata.normalize("NFD", name.strip())
    collapsed = "".join(ch for ch in stripped if unicodedata.category(ch) != "Mn")
    collapsed = _STATUS_SANITIZE_RE.sub("_", collapsed.upper().replace(" ", "_"))
    return collapsed.strip("_")


@lru_cache(maxsize=1)
def get_processed_status_names() -> List[str]:
    """
    Return DocumentStatus.status_name values that should be treated as 'processed'.
    Uses DB data instead of hard-coded lists.
    """
    names = list(DocumentStatus.objects.values_list("status_name", flat=True))
    return [name for name in names if _normalize_status(name) in PROCESSED_STATUS_KEYS]


def duration_to_days(value) -> float:
    """Convert a timedelta/DurationField result to days (1 decimal)."""
    if not value:
        return 0.0
    return round(value.total_seconds() / 86_400, 1)


class DashboardService:
    """Service for dashboard KPIs."""
    
    @staticmethod
    def get_kpis(
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        department_id: Optional[int] = None,
        user_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Get dashboard KPIs with optional filtering.
        FIXED: Made date_to inclusive, added date filter to overdue query.
        """
        # Default to last 30 days if not specified
        if not date_to:
            date_to = timezone.now()
        if not date_from:
            date_from = date_to - timedelta(days=30)
        
        # Make date_to inclusive (include full end date)
        date_to_inclusive = date_to + timedelta(days=1)
        
        # Previous period for growth calculation
        period_days = (date_to - date_from).days
        prev_date_from = date_from - timedelta(days=period_days)
        prev_date_to = date_from
        
        # Build base querysets
        doc_qs = Document.objects.all()
        if department_id:
            doc_qs = doc_qs.filter(department_id=department_id)

        processed_names = get_processed_status_names()
        
        if user_id:
            # Filter docs the user is involved in (assigned or created)
            doc_qs = doc_qs.filter(
                Q(assignments__user_id=user_id) | Q(created_by_id=user_id)
            ).distinct()

        # Total documents (using gte/lt for consistency)
        current_count = doc_qs.filter(
            created_at__gte=date_from, 
            created_at__lt=date_to_inclusive
        ).count()
        previous_count = doc_qs.filter(
            created_at__gte=prev_date_from, 
            created_at__lt=prev_date_to
        ).count()
        
        if previous_count > 0:
            growth_rate = ((current_count - previous_count) / previous_count) * 100
        else:
            growth_rate = 100.0 if current_count > 0 else 0.0
        
        # Active users (logged in within last 7 days)
        active_threshold = timezone.now() - timedelta(days=7)
        active_users = User.objects.filter(last_login__gte=active_threshold).count()
        total_users = User.objects.filter(is_active=True).count()
        activity_rate = (active_users / total_users * 100) if total_users > 0 else 0.0
        
        # Processing efficiency (completed vs total in period)
        docs_in_period = doc_qs.filter(
            created_at__gte=date_from, 
            created_at__lt=date_to_inclusive
        )
        total_docs = docs_in_period.count()
        
        completed_docs = docs_in_period.filter(
            status__status_name__in=processed_names
        ).count()
        
        efficiency = (completed_docs / total_docs * 100) if total_docs > 0 else 0.0
        
        # Overdue rate (documents past deadline, not completed, WITHIN DATE RANGE)
        # FIXED: Added date filter to overdue query
        overdue_qs = DocumentAssignment.objects.filter(
            due_at__lt=timezone.now(),
            document__created_at__gte=date_from,
            document__created_at__lt=date_to_inclusive
        ).exclude(document__status__status_name__in=processed_names)
        
        if user_id:
            overdue_qs = overdue_qs.filter(user_id=user_id)
        overdue_count = overdue_qs.count()
        
        overdue_rate = (overdue_count / total_docs * 100) if total_docs > 0 else 0.0
        
        # Inbound/Outbound counts (using consistent date range)
        inbound_count = doc_qs.filter(
            created_at__gte=date_from,
            created_at__lt=date_to_inclusive,
            doc_direction='den'
        ).count()
        
        outbound_count = doc_qs.filter(
            created_at__gte=date_from,
            created_at__lt=date_to_inclusive,
            doc_direction='di'
        ).count()
        
        return {
            "total_documents": {
                "current": current_count,
                "previous": previous_count,
                "growth_rate": round(growth_rate, 1),
                "period": "vs previous period"
            },
            "active_users": {
                "active": active_users,
                "total": total_users,
                "rate": round(activity_rate, 1)
            },
            "processing_efficiency": {
                "rate": round(efficiency, 1),
                "completed": completed_docs,
                "total": total_docs
            },
            "overdue_rate": {
                "rate": round(overdue_rate, 1),
                "count": overdue_count
            },
            "document_counts": {
                "inbound": inbound_count,
                "outbound": outbound_count
            }
        }


class DocumentAnalyticsService:
    """Service for document-specific analytics."""
    
    @staticmethod
    def get_by_type(
        date_from: Optional[datetime] = None, 
        date_to: Optional[datetime] = None, 
        user_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Get document statistics by type.
        FIXED: Made date_to inclusive, improved NULL type_name handling.
        """
        qs = Document.objects.all()
        
        if date_from and date_to:
            # FIXED: Make date_to inclusive
            date_to_inclusive = date_to + timedelta(days=1)
            qs = qs.filter(created_at__gte=date_from, created_at__lt=date_to_inclusive)
        elif date_from:
            qs = qs.filter(created_at__gte=date_from)
        elif date_to:
            date_to_inclusive = date_to + timedelta(days=1)
            qs = qs.filter(created_at__lt=date_to_inclusive)
            
        if user_id:
            qs = qs.filter(
                Q(assignments__user_id=user_id) | Q(created_by_id=user_id)
            ).distinct()

        processed_names = get_processed_status_names()
        processing_expr = ExpressionWrapper(
            F('updated_at') - F('created_at'), output_field=DurationField()
        )

        stats = qs.annotate(processing_time=processing_expr).values('document_type__type_name').annotate(
            total=Count('document_id'),
            processed=Count('document_id', filter=Q(
                status__status_name__in=processed_names
            )),
            avg_time=Avg('processing_time', filter=Q(status__status_name__in=processed_names))
        )
        
        result = []
        for stat in stats:
            # FIXED: Handle NULL type_name properly with fallback
            type_name = stat['document_type__type_name']
            if not type_name:
                type_name = 'Chưa phân loại'
            
            total = stat['total']
            processed = stat['processed']
            success_rate = (processed / total * 100) if total > 0 else 0.0
            avg_days = duration_to_days(stat.get('avg_time'))
            
            result.append({
                "type_name": type_name,
                "total": total,
                "processed": processed,
                "success_rate": round(success_rate, 1),
                "avg_processing_days": avg_days
            })
        
        return sorted(result, key=lambda x: x['total'], reverse=True)
    
    @staticmethod
    def get_by_priority(
        date_from: Optional[datetime] = None, 
        date_to: Optional[datetime] = None, 
        user_id: Optional[int] = None
    ) -> Dict[str, int]:
        """Get document distribution by priority."""
        qs = Document.objects.all()
        
        if date_from and date_to:
            date_to_inclusive = date_to + timedelta(days=1)
            qs = qs.filter(created_at__gte=date_from, created_at__lt=date_to_inclusive)
        elif date_from:
            qs = qs.filter(created_at__gte=date_from)
        elif date_to:
            date_to_inclusive = date_to + timedelta(days=1)
            qs = qs.filter(created_at__lt=date_to_inclusive)
            
        if user_id:
            qs = qs.filter(
                Q(assignments__user_id=user_id) | Q(created_by_id=user_id)
            ).distinct()
        
        priorities = qs.values('urgency_level__level_name').annotate(
            count=Count('document_id')
        )
        
        result = {
            "URGENT": 0,
            "HIGH": 0,
            "MEDIUM": 0,
            "LOW": 0
        }
        
        # Mapping Vietnamese levels to keys
        map_level = {
            "Hỏa tốc": "URGENT",
            "Khẩn": "HIGH",
            "Thường": "MEDIUM",
        }
        
        for p in priorities:
            level_name = p['urgency_level__level_name']
            count = p['count']
            key = map_level.get(level_name, "MEDIUM")
            if key in result:
                result[key] += count
        
        return result

    @staticmethod
    def get_by_status(
        date_from: Optional[datetime] = None, 
        date_to: Optional[datetime] = None, 
        user_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Get document distribution by status."""
        qs = Document.objects.all()
        
        if date_from and date_to:
            date_to_inclusive = date_to + timedelta(days=1)
            qs = qs.filter(created_at__gte=date_from, created_at__lt=date_to_inclusive)
        elif date_from:
            qs = qs.filter(created_at__gte=date_from)
        elif date_to:
            date_to_inclusive = date_to + timedelta(days=1)
            qs = qs.filter(created_at__lt=date_to_inclusive)
            
        if user_id:
            qs = qs.filter(
                Q(assignments__user_id=user_id) | Q(created_by_id=user_id)
            ).distinct()
        
        # Group by status name
        stats = qs.values('status__status_name').annotate(
            count=Count('document_id')
        ).order_by('-count')
        
        result = []
        for stat in stats:
            status_name = stat['status__status_name'] or 'Unknown'
            count = stat['count']
            result.append({
                "status": status_name,
                "count": count
            })
            
        return result

    @staticmethod
    def get_status_summary() -> dict[str, dict[str, int]]:
        summary = {
            "INBOUND": {},
            "OUTBOUND": {},
        }
        qs = Document.objects.filter(status__status_name__isnull=False)
        stats = (
            qs.values("doc_direction", "status__status_name")
            .annotate(count=Count("document_id"))
        )
        for stat in stats:
            direction = stat.get("doc_direction")
            bucket = "INBOUND" if direction == Document.Direction.DEN else "OUTBOUND"
            status_name = (stat.get("status__status_name") or "").upper()
            if not status_name:
                continue
            summary[bucket][status_name] = summary[bucket].get(status_name, 0) + stat.get("count", 0)
        return summary


class PerformanceService:
    """Service for performance metrics."""
    
    @staticmethod
    def get_department_performance(
        department_id: Optional[int] = None,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """
        Get performance metrics by department.
        FIXED: Added date range filters, capped efficiency at 100%, improved NULL handling.
        """
        processed_names = get_processed_status_names()
        docs = Document.objects.all()
        
        # Apply department filter
        if department_id:
            docs = docs.filter(department_id=department_id)
        
        # FIXED: Apply date range filter
        if date_from and date_to:
            date_to_inclusive = date_to + timedelta(days=1)
            docs = docs.filter(created_at__gte=date_from, created_at__lt=date_to_inclusive)
        elif date_from:
            docs = docs.filter(created_at__gte=date_from)
        elif date_to:
            date_to_inclusive = date_to + timedelta(days=1)
            docs = docs.filter(created_at__lt=date_to_inclusive)

        processing_expr = ExpressionWrapper(
            F('updated_at') - F('created_at'), output_field=DurationField()
        )

        stats = (
            docs.annotate(processing_time=processing_expr)
            .values('department_id', 'department__name')
            .annotate(
                doc_count=Count('document_id'),
                completed_count=Count('document_id', filter=Q(
                    status__status_name__in=processed_names
                )),
                avg_time=Avg('processing_time', filter=Q(status__status_name__in=processed_names)),
            )
            .order_by('-doc_count')
        )
        
        result = []
        for idx, dept in enumerate(stats, 1):
            doc_count = dept['doc_count']
            completed = dept['completed_count']
            efficiency = (completed / doc_count * 100) if doc_count else 0.0
            
            # FIXED: Handle NULL department name
            dept_name = dept['department__name']
            if not dept_name:
                dept_name = "Chưa gán phòng ban"
            
            result.append({
                "department": dept_name,
                "doc_count": doc_count,
                "efficiency": round(min(100.0, efficiency), 1),  # FIXED: Cap at 100%
                "avg_time": duration_to_days(dept.get('avg_time')),
                "ranking": idx
            })
        
        return result
    
    @staticmethod
    def get_top_users(
        limit: int = 10,
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None
    ) -> List[Dict[str, Any]]:
        """
        Get top performing users.
        FIXED: Added date range filters, capped efficiency at 100%, added assigned_count.
        """
        # Import at function level to avoid circular import issues
        from workflow.services.rbac import get_single_role_code, Role
        
        processed_names = get_processed_status_names()
        assignments = DocumentAssignment.objects.select_related('user', 'document', 'document__status')
        
        # FIXED: Apply date filter if provided
        if date_from and date_to:
            date_to_inclusive = date_to + timedelta(days=1)
            assignments = assignments.filter(
                document__created_at__gte=date_from,
                document__created_at__lt=date_to_inclusive
            )
        elif date_from:
            assignments = assignments.filter(document__created_at__gte=date_from)
        elif date_to:
            date_to_inclusive = date_to + timedelta(days=1)
            assignments = assignments.filter(document__created_at__lt=date_to_inclusive)
        
        assignments = assignments.annotate(
            processing_time=ExpressionWrapper(
                F('document__updated_at') - F('assigned_at'), output_field=DurationField()
            )
        )

        stats = (
            assignments.values('user_id', 'user__full_name', 'user__username')
            .annotate(
                assigned=Count('id'),
                completed=Count('id', filter=Q(document__status__status_name__in=processed_names)),
                avg_time=Avg('processing_time', filter=Q(document__status__status_name__in=processed_names))
            )
            .filter(assigned__gt=0)
            .order_by('-completed', 'user_id')[:limit]
        )
        
        result = []
        for idx, user in enumerate(stats, 1):
            # Get user's primary role
            user_obj = User.objects.filter(pk=user['user_id']).first()
            role_code = get_single_role_code(user_obj) if user_obj else None
            role_name = {
                Role.QT.value: "Quản trị",
                Role.VT.value: "Văn thư",
                Role.CV.value: "Chuyên viên",
                Role.LD.value: "Lãnh đạo"
            }.get(role_code, "Không rõ")

            efficiency = (user['completed'] / user['assigned'] * 100) if user['assigned'] else 0.0
            # FIXED: Cap efficiency at 100% to handle edge cases
            efficiency = round(min(100.0, max(0.0, efficiency)), 1)
            
            result.append({
                "user": user['user__full_name'] or user['user__username'],
                "role": role_name,
                "processed_count": user['completed'],
                "assigned_count": user['assigned'],  # FIXED: Added for transparency
                "efficiency": efficiency,
                "avg_time": duration_to_days(user.get('avg_time')),
                "rank": idx
            })
        
        return result


class ActivityService:
    """Service for activity timeline metrics."""
    
    @staticmethod
    def get_timeline(
        period: str = 'week', 
        metric: str = 'documents', 
        user_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Get activity timeline for charts.
        
        Args:
            period: 'day', 'week', or 'month'
            metric: 'logins', 'documents', 'meetings'
            user_id: Optional user ID to filter by
        """
        now = timezone.now()
        
        if period == 'day':
            start_date = now - timedelta(hours=24)
            trunc_func = TruncDate('created_at')
        elif period == 'month':
            start_date = now - timedelta(days=30)
            trunc_func = TruncDate('created_at')
        else:  # week
            start_date = now - timedelta(days=7)
            trunc_func = TruncDate('created_at')
        
        if metric == 'documents':
            qs = Document.objects.filter(created_at__gte=start_date)
            
            if user_id:
                # Filter by user involvement
                qs = qs.filter(
                    Q(assignments__user_id=user_id) | Q(created_by_id=user_id)
                ).distinct()
                
            data = qs.annotate(
                period=trunc_func
            ).values('period').annotate(
                count=Count('document_id')
            ).order_by('period')
            
            labels = [str(d['period']) for d in data]
            values = [d['count'] for d in data]
        
        elif metric == 'logins':
            # NOTE: Login analytics not tracked yet in current system
            labels = []
            values = []
        
        else:  # meetings - placeholder
            # NOTE: Meeting analytics not implemented yet
            labels = []
            values = []
        
        return {
            "labels": labels,
            "datasets": [{
                "label": metric.capitalize(),
                "data": values
            }]
        }


class LeaderDashboardService:
    """Aggregated helpers for the lãnh đạo dashboard."""

    PENDING_STATUSES = {
        InboundStatus.PENDING_LEADER_APPROVAL.value,
        OutboundStatus.SUBMITTED.value,
        OutboundStatus.PENDING_CLERK_CHECK.value,
    }

    TASK_STATUS_OPEN = {
        CaseTask.Status.OPEN,
        CaseTask.Status.IN_PROGRESS,
    }

    @staticmethod
    def _to_datetime(value: Any) -> Optional[datetime]:
        if isinstance(value, datetime):
            return value
        if isinstance(value, date):
            return datetime.combine(value, datetime.min.time())
        return None

    @staticmethod
    def _ensure_timezone(value: Optional[datetime]) -> Optional[datetime]:
        if value is None:
            return None
        if timezone.is_naive(value):
            return timezone.make_aware(value)
        return value

    @staticmethod
    def _serialize_document(doc: Document) -> Dict[str, Any]:
        status_name = getattr(doc.status, "status_name", None)
        assignments: list[DocumentAssignment] = getattr(doc, "leader_assignments", [])
        due_raw = assignments[0].due_at if assignments else None
        if not due_raw:
            due_raw = getattr(doc, "received_date", None) or getattr(doc, "issued_date", None)
        due_at = LeaderDashboardService._ensure_timezone(
            LeaderDashboardService._to_datetime(due_raw)
        )

        code = (
            doc.document_code
            or doc.issue_number
            or doc.received_number
            or str(getattr(doc, "document_id", ""))
        )

        now = timezone.now()
        is_overdue = bool(due_at and due_at < now)

        return {
            "document_id": getattr(doc, "document_id", None),
            "title": doc.title,
            "code": code,
            "direction": doc.doc_direction,
            "status": status_name,
            "status_key": canonical_status_key(status_name, doc.doc_direction) if status_name else "",
            "due_at": due_at.isoformat() if due_at else None,
            "updated_at": doc.updated_at.isoformat() if getattr(doc, "updated_at", None) else None,
            "department": getattr(doc.department, "name", None),
            "is_overdue": is_overdue,
        }

    @staticmethod
    def _serialize_approval_step(log: DocumentWorkflowLog) -> Dict[str, Any]:
        doc = getattr(log, "document", None)
        code = (
            getattr(doc, "document_code", None)
            or getattr(doc, "issue_number", None)
            or getattr(doc, "received_number", None)
            or (str(getattr(doc, "document_id", None)) if doc else None)
            or ""
        )
        return {
            "log_id": getattr(log, "log_id", None),
            "document_id": getattr(doc, "document_id", None) if doc else None,
            "code": code,
            "title": getattr(doc, "title", None) if doc else None,
            "action": getattr(log, "action", None),
            "status": getattr(getattr(log, "to_status", None), "status_name", None)
            or getattr(getattr(log, "from_status", None), "status_name", None),
            "actor": getattr(getattr(log, "acted_by", None), "full_name", None),
            "timestamp": getattr(log, "acted_at", None).isoformat()
            if getattr(log, "acted_at", None)
            else None,
            "note": getattr(log, "comment", None),
        }

    @staticmethod
    def get_pending_documents(
        user_id: Optional[int] = None,
        department_id: Optional[int] = None,
        limit: int = 5,
    ) -> Dict[str, Any]:
        qs = Document.objects.select_related("status", "department")
        if user_id:
            qs = qs.filter(Q(assignments__user_id=user_id) | Q(created_by_id=user_id))
        elif department_id:
            qs = qs.filter(department_id=department_id)
        qs = qs.filter(status__status_name__in=LeaderDashboardService.PENDING_STATUSES).distinct()

        inbound_pending = qs.filter(doc_direction=Document.Direction.DEN).count()
        outbound_pending = qs.filter(doc_direction=Document.Direction.DI).count()

        if user_id:
            qs = qs.prefetch_related(
                Prefetch(
                    "assignments",
                    queryset=DocumentAssignment.objects.filter(user_id=user_id).order_by("due_at"),
                    to_attr="leader_assignments",
                )
            )

        docs = qs.order_by("-updated_at")[:limit]

        return {
            "items": [LeaderDashboardService._serialize_document(doc) for doc in docs],
            "counts": {
                "approval": inbound_pending,
                "sign": outbound_pending,
            },
        }

    @staticmethod
    def get_recent_approval_steps(
        user_id: Optional[int] = None,
        department_id: Optional[int] = None,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        qs = DocumentWorkflowLog.objects.select_related(
            "document", "acted_by", "to_status", "from_status"
        )
        if user_id:
            qs = qs.filter(document__assignments__user_id=user_id)
        elif department_id:
            qs = qs.filter(document__department_id=department_id)
        logs = qs.order_by("-acted_at")[:limit]
        return [LeaderDashboardService._serialize_approval_step(log) for log in logs]

    @staticmethod
    def get_task_progress(
        user_id: Optional[int] = None,
        department_id: Optional[int] = None,
        limit: int = 5,
    ) -> Dict[str, Any]:
        qs = CaseTask.objects.select_related("assignee", "case")
        if department_id:
            qs = qs.filter(case__department_id=department_id)
        elif user_id:
            qs = qs.filter(Q(case__leader_id=user_id) | Q(assignee_id=user_id))

        total = qs.count()
        completed = qs.filter(status=CaseTask.Status.DONE).count()
        late = (
            qs.filter(status__in=LeaderDashboardService.TASK_STATUS_OPEN)
            .filter(due_at__isnull=False, due_at__lt=timezone.now())
            .count()
        )

        tasks = qs.order_by("due_at", "-created_at")[:limit]
        items = []
        for task in tasks:
            items.append(
                {
                    "task_id": getattr(task, "task_id", None),
                    "title": task.title,
                    "status": task.status,
                    "due_at": getattr(task, "due_at", None).isoformat()
                    if getattr(task, "due_at", None)
                    else None,
                    "assignee": getattr(getattr(task, "assignee", None), "full_name", None),
                    "case_title": getattr(getattr(task, "case", None), "title", None),
                    "case_code": getattr(getattr(task, "case", None), "case_code", None),
                }
            )

        return {
            "total": total,
            "completed": completed,
            "late": late,
            "items": items,
        }

    @staticmethod
    def _normalize_notification_link(link: Optional[str]) -> str:
        if not link:
            return ""
        normalized = str(link).strip()
        if not normalized:
            return ""
        lower = normalized.lower()
        if lower.startswith("http://") or lower.startswith("https://"):
            return normalized
        trimmed = normalized if normalized.startswith("/") else f"/{normalized}"
        if trimmed.startswith("/lanhdao/"):
            return trimmed

        mapping = {
            "/vanbanden/": "/lanhdao/vanbanden/",
            "/vanbandi/": "/lanhdao/vanbandi/",
            "/hosocongviec/": "/lanhdao/hosocongviec/",
            "/vanban/": "/lanhdao/vanbanden/",
        }

        for prefix, target in mapping.items():
            if trimmed.startswith(prefix):
                return target + trimmed[len(prefix) :]
        return trimmed

    @staticmethod
    def get_notifications(user_id: Optional[int], limit: int = 5) -> List[Dict[str, Any]]:
        if not user_id:
            return []
        qs = Notification.objects.filter(user_id=user_id).order_by("-sent_at")[:limit]
        result = []
        for note in qs:
            result.append(
                {
                    "notification_id": getattr(note, "notification_id", None),
                    "title": note.title,
                    "body": note.body,
                    "sent_at": note.sent_at.isoformat() if note.sent_at else None,
                    "read": note.read_at is not None,
                    "link": LeaderDashboardService._normalize_notification_link(note.link),
                }
            )
        return result

    @staticmethod
    def get_status_summary() -> dict[str, dict[str, int]]:
        summary = {
            "INBOUND": {},
            "OUTBOUND": {},
        }
        qs = Document.objects.filter(status__status_name__isnull=False)
        stats = (
            qs.values("doc_direction", "status__status_name")
            .annotate(count=Count("document_id"))
        )
        for stat in stats:
            direction = stat.get("doc_direction")
            bucket = "INBOUND" if direction == Document.Direction.DEN else "OUTBOUND"
            status_name = (stat.get("status__status_name") or "").upper()
            if not status_name:
                continue
            summary[bucket][status_name] = summary[bucket].get(status_name, 0) + stat.get("count", 0)
        return summary
