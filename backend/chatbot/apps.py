from django.apps import AppConfig


class ChatbotConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'chatbot'
    verbose_name = 'Chatbot RAG'
    
    # Class-level flag to prevent double initialization
    _rag_initialized = False
    
    def ready(self):
        """Import signals and initialize RAG on startup"""
        # Import signals for auto-indexing
        try:
            import chatbot.signals  # noqa
        except ImportError:
            pass
        
        # Auto-initialize RAG on server startup (only once)
        if not self._is_migration_running() and not self._rag_initialized:
            self._schedule_rag_init()
    
    def _is_migration_running(self):
        """Check if we're running migrations or other management commands that shouldn't init RAG"""
        import sys
        import os
        
        # Skip RAG init for these commands
        skip_commands = ['migrate', 'makemigrations', 'showmigrations', 'sqlmigrate', 'help']
        if any(cmd in sys.argv for cmd in skip_commands):
            return True
        
        # Skip if this is the reloader process (not the main process)
        # Django runserver spawns 2 processes: main + autoreloader
        if os.environ.get('RUN_MAIN') != 'true':
            return True
        
        return False
    
    def _schedule_rag_init(self):
        """Schedule RAG initialization to run after Django is fully ready"""
        import threading
        
        def init_worker():
            """Worker thread to initialize RAG after a short delay"""
            import time
            import logging
            from .services.rag_service import initialize_rag, is_initialized
            
            logger = logging.getLogger(__name__)
            
            # Wait a bit for Django to finish setup
            time.sleep(0.5)
            
            # Double-check: already initialized?
            if is_initialized() or self.__class__._rag_initialized:
                logger.info("RAG already initialized, skipping")
                return
            
            # Mark as initialized (prevent race condition)
            self.__class__._rag_initialized = True
            
            try:
                logger.info("🚀 Initializing RAG system on server startup...")
                initialize_rag()
                logger.info("✓ RAG system initialized successfully on startup")
            except Exception as e:
                logger.error(f"Failed to initialize RAG on startup: {e}")
                logger.warning("RAG will be initialized on first request instead")
                self.__class__._rag_initialized = False  # Reset flag on failure
        
        # Start initialization in background thread
        thread = threading.Thread(target=init_worker, daemon=True)
        thread.start()

