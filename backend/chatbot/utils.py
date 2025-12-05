# chatbot/utils.py
"""
Utility functions for chatbot user context management
"""
from typing import Dict, Optional
from django.contrib.auth import get_user_model

User = get_user_model()


def get_user_context(user: User) -> Dict:
    """
    Extract relevant user info for chatbot context
    
    Args:
        user: User model instance
        
    Returns:
        dict: User context data with keys:
            - username: str
            - full_name: str
            - role: str (primary role name, or None)
            - department_name: str (or None)
            - department_code: str (or None)
    """
    if not user:
        return {}
    
    # Get primary role (first role if user has multiple)
    primary_role = None
    user_role = user.user_roles.select_related('role').first()
    if user_role:
        primary_role = user_role.role.name
    
    # Build context dictionary
    context = {
        'username': user.username,
        'full_name': user.full_name,
        'role': primary_role,
        'department_name': user.department.name if user.department else None,
        'department_code': user.department.department_code if user.department else None,
    }
    
    return context


def format_user_context_for_prompt(context: Optional[Dict]) -> str:
    """
    Format user context as readable text for LLM prompt
    
    Args:
        context: User context dict from get_user_context()
        
    Returns:
        str: Formatted text for prompt injection
    """
    if not context:
        return "Thông tin người dùng: Không xác định"
    
    parts = []
    
    # Always include name if available
    if context.get('full_name'):
        parts.append(f"Tên: {context['full_name']}")
    
    # Add role if available
    if context.get('role'):
        role_vietnamese = {
            'VT': 'Văn thư',
            'CV': 'Chuyên viên', 
            'LD': 'Lãnh đạo',
            'QT': 'Quản trị viên'
        }.get(context['role'], context['role'])
        parts.append(f"Vai trò: {role_vietnamese}")
    
    # Add department if available
    if context.get('department_name'):
        parts.append(f"Phòng ban: {context['department_name']}")
    
    if not parts:
        return "Thông tin người dùng: Không xác định"
    
    return "Thông tin người dùng đang hỏi:\n" + "\n".join(f"- {p}" for p in parts)
