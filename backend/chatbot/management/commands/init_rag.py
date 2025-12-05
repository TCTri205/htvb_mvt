# chatbot/management/commands/init_rag.py
"""
Management command to manually initialize RAG system
Usage: python manage.py init_rag
"""
from django.core.management.base import BaseCommand
from chatbot.services.rag_service import initialize_rag, is_initialized
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Initialize RAG system with existing PDFs'

    def add_arguments(self, parser):
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force re-initialization even if already initialized',
        )

    def handle(self, *args, **options):
        force = options.get('force', False)
        
        if is_initialized() and not force:
            self.stdout.write(self.style.SUCCESS('✓ RAG already initialized'))
            return
        
        try:
            self.stdout.write('Initializing RAG system...')
            initialize_rag()
            self.stdout.write(self.style.SUCCESS('✓ RAG initialized successfully'))
        except Exception as e:
            self.stderr.write(self.style.ERROR(f'✗ Failed to initialize RAG: {e}'))
            raise
