# chatbot/signals.py
"""
Django signals để tự động index PDF khi upload
"""
from django.db.models.signals import post_save
from django.dispatch import receiver
from documents.models import DocumentAttachment
from .models import DocumentVectorIndex
from .services.rag_service import add_document_to_vectorstore, is_initialized
from .services.pdf_loader import load_single_pdf
import logging

logger = logging.getLogger(__name__)


@receiver(post_save, sender=DocumentAttachment)
def auto_index_pdf(sender, instance, created, **kwargs):
    """
    Tự động index PDF mới vào vectorstore khi upload
    
    NOTE: Chỉ chạy khi:
    - Document mới được tạo (created=True)
    - File là PDF (file_name endswith .pdf)
    - RAG system đã được khởi tạo (để tránh lỗi khi chưa có vectorstore)
    """
    # Chỉ index khi là document mới
    if not created:
        return
    
    # Kiểm tra file có phải PDF không (support both 'PDF' and 'pdf', or check extension)
    is_pdf_type = instance.attachment_type and instance.attachment_type.lower() == 'pdf'
    is_pdf_ext = instance.file_name and instance.file_name.lower().endswith('.pdf')
    
    if not (is_pdf_type or is_pdf_ext):
        return
    
    # Chỉ index nếu RAG đã được khởi tạo
    if not is_initialized():
        logger.warning(
            f"RAG system chưa khởi tạo. Skipping auto-index cho {instance.file_name}. "
            "Sẽ được index khi RAG initialize."
        )
        return
    
    try:
        logger.info(f"Auto-indexing PDF: {instance.file_name} (attachment_id: {instance.attachment_id})")
        
        # Load PDF
        docs = load_single_pdf(instance.attachment_id)
        
        # Add to vectorstore
        add_document_to_vectorstore(docs)
        
        # Track index
        DocumentVectorIndex.objects.create(
            attachment=instance,
            chunk_count=len(docs)
        )
        
        logger.info(f"✓ Successfully indexed {instance.file_name} ({len(docs)} chunks)")
        
    except Exception as e:
        logger.error(f"Failed to auto-index PDF {instance.file_name}: {str(e)}", exc_info=True)
        # Không raise exception để không block quá trình upload document
