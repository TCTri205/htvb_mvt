from accounts.models import User
from documents.models import Document
from workflow.services.inbound_service import InboundService
actor = User.objects.filter(username='vt01').first()
doc = Document.objects.get(document_id=15)
service = InboundService(actor=actor)
try:
    service.dispatch_result(doc)
    doc.refresh_from_db()
    print('after', doc.status.status_name if doc.status else None)
except Exception as exc:
    print('error', exc)
