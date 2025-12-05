# chatbot/management/commands/index_pdfs.py
"""
Management command to index all existing PDFs into vectorstore
Usage: python manage.py index_pdfs
"""
from django.core.management.base import BaseCommand
from documents.models import DocumentAttachment
from chatbot.models import DocumentVectorIndex
from chatbot.services.rag_service import initialize_rag
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Index all existing PDFs from database into vectorstore'
    
    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force rebuild vectorstore từ đầu (xóa index cũ)'
        )
    
    def handle(self, *args, **options):
        self.stdout.write('=' * 60)
        self.stdout.write('Chatbot RAG - PDF Indexing')
        self.stdout.write('=' * 60)
        
        # Count PDFs (support 'PDF' or 'pdf', or by extension)
        from django.db.models import Q
        pdf_count = DocumentAttachment.objects.filter(
            Q(attachment_type__iexact='pdf') | Q(file_name__iendswith='.pdf')
        ).count()
        
        self.stdout.write(f'Found {pdf_count} PDF(s) in database')
        
        if pdf_count == 0:
            self.stdout.write(self.style.WARNING('No PDFs found to index'))
            return
        
        # Initialize RAG system
        self.stdout.write('Initializing RAG system...')
        
        try:
            initialize_rag()
            self.stdout.write(self.style.SUCCESS('✓ RAG system initialized'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'✗ Failed to initialize RAG: {str(e)}'))
            logger.error(f'Failed to initialize RAG: {str(e)}', exc_info=True)
            return
        
        # Track indexed PDFs
        from django.db.models import Q
        attachments = DocumentAttachment.objects.filter(
            Q(attachment_type__iexact='pdf') | Q(file_name__iendswith='.pdf')
        )
        indexed_count = 0
        
        for att in attachments:
            try:
                # Create or update tracking record
                index_record, created = DocumentVectorIndex.objects.get_or_create(
                    attachment=att,
                    defaults={'chunk_count': 0}  # Will be updated by signal if needed
                )
                
                if created:
                    indexed_count += 1
                    self.stdout.write(f'✓ Indexed: {att.file_name}')
                else:
                    self.stdout.write(f'- Already indexed: {att.file_name}')
                    
            except Exception as e:
                self.stdout.write(self.style.WARNING(f'✗ Error tracking {att.file_name}: {str(e)}'))
        
        self.stdout.write('')
        self.stdout.write('=' * 60)
        self.stdout.write(self.style.SUCCESS(f'Indexing completed'))
        self.stdout.write(f'Total PDFs: {pdf_count}')
        self.stdout.write(f'Newly indexed: {indexed_count}')
        self.stdout.write('=' * 60)
