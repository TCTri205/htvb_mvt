from accounts.models import User
from documents.models import Document
from workflow.services.inbound_service import InboundService
from workflow.services import errors
actor = User.objects.filter(is_active=True).first()
doc = Document.objects.get(document_id=15)
service = InboundService(actor=actor)
print('before', doc.status_id, doc.status.status_name if doc.status else None)
try:
    service.dispatch_result(doc)
    doc.refresh_from_db()
    print('after', doc.status_id, doc.status.status_name if doc.status else None)
except Exception as exc:
    print('error', exc)
