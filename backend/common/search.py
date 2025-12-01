# common/search.py
"""
Unified search API for documents and cases.
"""
from __future__ import annotations

from typing import Optional

from django.db.models import Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from drf_spectacular.utils import extend_schema, OpenApiParameter
from drf_spectacular.types import OpenApiTypes

from cases.models import Case
from cases.serializers import CaseSerializer
from documents.models import Document
from documents.serializers import DocumentListSerializer
from workflow.services.rbac import get_single_role_code, Role


class UnifiedSearchView(APIView):
    """
    Unified search across documents and cases.
    
    Query Parameters:
        - q: Search query string (required)
        - scope: 'documents', 'cases', or 'all' (default: 'all')
        - limit: Max results per type (default: 20, max: 100)
    """
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Search"],
        operation_id="unified_search",
        summary="Tìm kiếm hợp nhất (documents & cases)",
        parameters=[
            OpenApiParameter(
                name="q",
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                required=True,
                description="Search query string",
            ),
            OpenApiParameter(
                name="scope",
                type=OpenApiTypes.STR,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Search scope: 'documents', 'cases', or 'all' (default)",
            ),
            OpenApiParameter(
                name="limit",
                type=OpenApiTypes.INT,
                location=OpenApiParameter.QUERY,
                required=False,
                description="Max results per type (default: 20, max: 100)",
            ),
        ],
        responses={
            200: {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "scope": {"type": "string"},
                    "documents": {"type": "array", "items": {}},
                    "cases": {"type": "array", "items": {}},
                },
            },
            400: {"description": "Bad request - missing query"},
        },
    )
    def get(self, request):
        # Get query parameters
        query = request.query_params.get("q", "").strip()
        scope = request.query_params.get("scope", "all").lower()
        limit = min(int(request.query_params.get("limit", 20)), 100)

        if not query:
            return Response(
                {"detail": "Query parameter 'q' is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate scope
        if scope not in ("documents", "cases", "all"):
            scope = "all"

        result = {
            "query": query,
            "scope": scope,
            "documents": [],
            "cases": [],
        }

        # Search documents
        if scope in ("documents", "all"):
            doc_results = self._search_documents(request.user, query, limit)
            result["documents"] = DocumentListSerializer(
                doc_results, many=True, context={"request": request}
            ).data

        # Search cases
        if scope in ("cases", "all"):
            case_results = self._search_cases(request.user, query, limit)
            result["cases"] = CaseSerializer(
                case_results, many=True, context={"request": request}
            ).data

        return Response(result)

    def _search_documents(self, user, query: str, limit: int):
        """
        Search documents by query.
        Searches in: doc_number, title, summary
        """
        # Build search filter
        q_filter = (
            Q(doc_number__icontains=query)
            | Q(title__icontains=query)
            | Q(summary__icontains=query)
        )

        # Base queryset
        qs = Document.objects.filter(q_filter).select_related(
            "status", "doc_type", "created_by"
        )

        # Apply RBAC filtering based on user role
        role_code = get_single_role_code(user)
        
        # QT can see all
        if role_code == Role.QT.value:
            pass
        # VT can see all inbound/outbound
        elif role_code == Role.VT.value:
            pass
        # LD can see all documents
        elif role_code == Role.LD.value:
            pass
        # CV can only see assigned documents or created by them
        elif role_code == Role.CV.value:
            user_id = getattr(user, "user_id", None)
            qs = qs.filter(
                Q(created_by=user) | Q(assignments__user_id=user_id)
            ).distinct()
        else:
            # Unknown role, return empty
            return Document.objects.none()

        return qs.order_by("-created_at")[:limit]

    def _search_cases(self, user, query: str, limit: int):
        """
        Search cases by query.
        Searches in: case_id, title, description
        """
        # Build search filter
        q_filter = (
            Q(title__icontains=query)
            | Q(description__icontains=query)
        )
        
        # Try to search by case_id if query is numeric
        try:
            case_id = int(query)
            q_filter |= Q(case_id=case_id)
        except ValueError:
            pass

        # Base queryset
        qs = Case.objects.filter(q_filter).select_related(
            "status", "case_type", "department", "leader", "created_by"
        )

        # Apply RBAC filtering
        role_code = get_single_role_code(user)
        
        # QT can see all
        if role_code == Role.QT.value:
            pass
        # VT can see all
        elif role_code == Role.VT.value:
            pass
        # LD can see all cases
        elif role_code == Role.LD.value:
            pass
        # CV can only see cases they participate in
        elif role_code == Role.CV.value:
            user_id = getattr(user, "user_id", None)
            qs = qs.filter(
                Q(created_by=user) | Q(participants__user_id=user_id)
            ).distinct()
        else:
            return Case.objects.none()

        return qs.order_by("-created_at")[:limit]
