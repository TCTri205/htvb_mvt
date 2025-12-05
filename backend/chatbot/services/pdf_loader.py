# chatbot/services/pdf_loader.py
"""
Service để load PDF từ database (DocumentAttachment)
"""
from pathlib import Path
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


def load_pdfs_from_database():
    """
    Đọc tất cả PDF từ DocumentAttachment trong database
    
    Returns:
        list: Danh sách documents từ LangChain loader
    """
    try:
        from documents.models import DocumentAttachment
        from langchain_community.document_loaders import UnstructuredFileLoader
    except ImportError as e:
        logger.error(f"Import error: {e}")
        raise

    documents = []
    
    # Lấy tất cả PDF attachments
    # Support cả 'PDF' (uppercase) và 'pdf' (lowercase) trong db, hoặc filter by extension
    from django.db.models import Q
    attachments = DocumentAttachment.objects.filter(
        Q(attachment_type__iexact='pdf') | Q(file_name__iendswith='.pdf')
    ).select_related('document', 'uploaded_by')
    
    logger.info(f"Found {attachments.count()} PDF attachments in database")
    
    for att in attachments:
        try:
            # Construct full file path
            file_path = Path(settings.MEDIA_ROOT) / att.storage_path
            
            if not file_path.exists():
                logger.warning(f"File not found: {file_path} (attachment_id: {att.attachment_id})")
                continue
            
            # Load PDF using Unstructured
            loader = UnstructuredFileLoader(str(file_path))
            docs = loader.load()
            
            # Add metadata từ database
            for doc in docs:
                doc.metadata.update({
                    'attachment_id': str(att.attachment_id),
                    'document_id': att.document.document_id,
                    'file_name': att.file_name,
                    'uploaded_by': att.uploaded_by.username if att.uploaded_by else 'unknown',
                    'uploaded_at': att.uploaded_at.isoformat(),
                    'source': str(file_path)
                })
            
            documents.extend(docs)
            logger.info(f"Loaded {len(docs)} chunks from {att.file_name}")
            
        except Exception as e:
            logger.error(f"Error loading PDF {att.file_name}: {str(e)}")
            continue
    
    logger.info(f"Total documents loaded: {len(documents)}")
    return documents


def load_single_pdf(attachment_id):
    """
    Đọc 1 PDF cụ thể từ database
    
    Args:
        attachment_id: UUID của DocumentAttachment
        
    Returns:
        list: Danh sách documents từ PDF
    """
    try:
        from documents.models import DocumentAttachment
        from langchain_community.document_loaders import UnstructuredFileLoader
    except ImportError as e:
        logger.error(f"Import error: {e}")
        raise

    try:
        att = DocumentAttachment.objects.select_related('document', 'uploaded_by').get(attachment_id=attachment_id)
        
        file_path = Path(settings.MEDIA_ROOT) / att.storage_path
        
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        # Load PDF
        loader = UnstructuredFileLoader(str(file_path))
        docs = loader.load()
        
        # Add metadata
        for doc in docs:
            doc.metadata.update({
                'attachment_id': str(att.attachment_id),
                'document_id': att.document.document_id,
                'file_name': att.file_name,
                'uploaded_by': att.uploaded_by.username if att.uploaded_by else 'unknown',
                'uploaded_at': att.uploaded_at.isoformat(),
                'source': str(file_path)
            })
        
        logger.info(f"Loaded {len(docs)} chunks from {att.file_name}")
        return docs
        
    except Exception as e:
        logger.error(f"Error loading PDF with attachment_id {attachment_id}: {str(e)}")
        raise


def get_pdf_count():
    """
    Đếm số lượng PDF trong database
    
    Returns:
        int: Số lượng PDF
    """
    try:
        from documents.models import DocumentAttachment
        from django.db.models import Q
        return DocumentAttachment.objects.filter(
            Q(attachment_type__iexact='pdf') | Q(file_name__iendswith='.pdf')
        ).count()
    except Exception as e:
        logger.error(f"Error counting PDFs: {str(e)}")
        return 0
