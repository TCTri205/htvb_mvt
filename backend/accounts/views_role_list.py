from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from accounts.models import User
from accounts.serializers import UserSerializer


class SpecialistViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for listing specialists (users with CV/Chuyên viên role).
    Read-only: only supports listing specialists.
    """
    queryset = User.objects.filter(is_active=True)
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Filter users to only include specialists (CV role)"""
        queryset = super().get_queryset()
        
        # Filter by role CV (Chuyên viên - Specialist)
        queryset = queryset.filter(roles__role_code='CV').distinct()
        
        # Optional filtering by department
        department_id = self.request.query_params.get('department_id')
        if department_id:
            queryset = queryset.filter(department_id=department_id)
        
        # Optional filtering by full_name search
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(full_name__icontains=search)
        
        # Default ordering
        ordering = self.request.query_params.get('ordering', 'full_name')
        queryset = queryset.order_by(ordering)
        
        return queryset


class ClerkViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for listing clerks (users with VT/Văn thư role).
    Read-only: only supports listing clerks.
    """
    queryset = User.objects.filter(is_active=True)
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        """Filter users to only include clerks (VT role)"""
        queryset = super().get_queryset()
        
        # Filter by role VT (Văn thư - Clerk)
        queryset = queryset.filter(roles__role_code='VT').distinct()
        
        # Optional filtering by department
        department_id = self.request.query_params.get('department_id')
        if department_id:
            queryset = queryset.filter(department_id=department_id)
        
        # Optional filtering by full_name search
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(full_name__icontains=search)
        
        # Default ordering
        ordering = self.request.query_params.get('ordering', 'full_name')
        queryset = queryset.order_by(ordering)
        
        return queryset
