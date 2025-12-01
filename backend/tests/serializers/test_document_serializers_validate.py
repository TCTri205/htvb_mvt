# tests/serializers/test_document_serializers_validate.py
from types import SimpleNamespace
import pytest
from rest_framework.exceptions import ValidationError

from documents.serializers import DocumentDetailSerializer


@pytest.mark.parametrize(
    "direction, attrs, bad_field",
    [
        ("di", {"incoming_number": "001"}, "incoming_number"),
        ("den", {"outgoing_number": "123/UBND"}, "outgoing_number"),
    ],
)
def test_document_detail_alias_guard(direction, attrs, bad_field):
    """
    - Outbound ('di') không cho set incoming_number
    - Inbound ('den') không cho set outgoing_number
    """
    # Không cần DB: gắn instance giả có thuộc tính direction
    ser = DocumentDetailSerializer()
    ser.instance = SimpleNamespace(direction=direction)

    with pytest.raises(ValidationError) as ei:
        ser.validate(attrs)

    err = ei.value.detail
    assert bad_field in err
