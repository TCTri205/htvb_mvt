# chatbot/services/document_query.py
"""
Service để query thông tin văn bản liên quan đến user
"""
from django.db.models import Q
from documents.models import Document, DocumentAssignment

def get_user_documents_summary(user):
    """
    Lấy tóm tắt về số lượng văn bản của user
    
    Args:
        user: User model instance
        
    Returns:
        str: Text tóm tắt (hoặc None nếu user None)
    """
    if not user:
        return None
        
    # Documents created by user
    created_count = Document.objects.filter(created_by=user).count()
    
    # Documents assigned to user (primary or secondary)
    assigned_count = DocumentAssignment.objects.filter(user=user).count()
    
    # Documents waiting for processing (example logic)
    # processing_count = DocumentAssignment.objects.filter(assignee=user, status='processing').count()
    
    summary = f"Thống kê văn bản của bạn:\n- Đã tạo: {created_count} văn bản\n- Được phân công: {assigned_count} văn bản"
    
    return summary

def search_user_documents(user, query_text, limit=5):
    """
    Tìm kiếm trong các văn bản liên quan đến user
    """
    if not user:
        return []
        
    docs = Document.objects.filter(
        Q(created_by=user) | Q(assignments__user=user)
    ).filter(
        Q(title__icontains=query_text) | Q(document_code__icontains=query_text)
    ).distinct().order_by('-created_at')[:limit]
    
    results = []
    for doc in docs:
        results.append({
            'id': doc.document_id,
            'title': doc.title,
            'code': doc.document_code or doc.issue_number or 'N/A',
            'created_at': doc.created_at.strftime('%d/%m/%Y')
        })
    
    return results
