import pytest

from catalog.models import DocumentStatus
from documents.filters import DocumentFilterSet
from documents.models import Document
from documents.serializers import DocumentSlimSerializer
from documents.utils.outbound_status import cv_assignable_status_kind
from workflow.services.status_resolver import (
    OutboundStatus,
    canonical_status_key,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (OutboundStatus.LEGACY_DU_THAO.value, OutboundStatus.DRAFT.value),
        (OutboundStatus.LEGACY_TRINH_DUYET.value, OutboundStatus.SUBMITTED.value),
        (OutboundStatus.LEGACY_TRA_LAI.value, OutboundStatus.RETURNED.value),
        (OutboundStatus.LEGACY_PHE_DUYET.value, OutboundStatus.APPROVED.value),
        (OutboundStatus.LEGACY_KY_SO.value, OutboundStatus.APPROVED.value),
        (OutboundStatus.LEGACY_PHAT_HANH.value, OutboundStatus.ISSUED.value),
        (OutboundStatus.LEGACY_LUU_TRU.value, OutboundStatus.ARCHIVED.value),
    ],
)
def test_canonical_status_key_maps_legacy_outbound_codes(raw: str, expected: str):
    assert canonical_status_key(raw, direction="OUTBOUND") == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("DA_TRINH", OutboundStatus.SUBMITTED.value),
        ("TRINH_LANH_DAO", OutboundStatus.SUBMITTED.value),
        ("DA_TRINH_LANH_DAO", OutboundStatus.SUBMITTED.value),
        ("TRINH_LD", OutboundStatus.SUBMITTED.value),
        ("DA_TRINH_LD", OutboundStatus.SUBMITTED.value),
        ("CHO_LANH_DAO_PHE_DUYET", OutboundStatus.SUBMITTED.value),
        ("CHO_LD_PHE_DUYET", OutboundStatus.SUBMITTED.value),
        ("BI_TRA_LAI", OutboundStatus.RETURNED.value),
        ("LD_DA_PHE_DUYET", OutboundStatus.APPROVED.value),
        ("DA_PHAT_HANH", OutboundStatus.ISSUED.value),
        ("CHO_VAN_THU_KIEM_TRA", OutboundStatus.PENDING_CLERK_CHECK.value),
        ("CHO_VT_KIEM_TRA", OutboundStatus.PENDING_CLERK_CHECK.value),
    ],
)
def test_canonical_status_key_maps_common_outbound_aliases(raw: str, expected: str):
    assert canonical_status_key(raw, direction="OUTBOUND") == expected


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("trinh lanh dao", OutboundStatus.SUBMITTED.value),
        ("phe duyet", OutboundStatus.APPROVED.value),
        ("tra lai", OutboundStatus.RETURNED.value),
        ("cho van thu kiem tra", OutboundStatus.PENDING_CLERK_CHECK.value),
        ("phat hanh", OutboundStatus.ISSUED.value),
        ("luu tru", OutboundStatus.ARCHIVED.value),
        ("huy phat hanh", OutboundStatus.HUY_PHAT_HANH.value),
    ],
)
def test_canonical_status_key_outbound_heuristics(raw: str, expected: str):
    assert canonical_status_key(raw, direction="OUTBOUND") == expected


@pytest.mark.django_db
def test_filter_kind_and_serializer_handle_legacy_outbound_statuses():
    # Seed statuses (idempotent across seeded DB)
    needed = {
        OutboundStatus.LEGACY_TRINH_DUYET.value,
        OutboundStatus.LEGACY_PHE_DUYET.value,
        OutboundStatus.LEGACY_PHAT_HANH.value,
        "DA_TRINH",
        "CHO_VAN_THU_KIEM_TRA",
        "BI_TRA_LAI",
    }
    statuses = {
        name: DocumentStatus.objects.get_or_create(status_name=name)[0]
        for name in needed
    }

    doc_trinh = Document.objects.create(
        title="Legacy submitted",
        doc_direction=Document.Direction.DU_THAO,
        document_code="DT-LEGACY-1",
        status=statuses[OutboundStatus.LEGACY_TRINH_DUYET.value],
    )
    doc_da_trinh = Document.objects.create(
        title="Alias submitted",
        doc_direction=Document.Direction.DU_THAO,
        document_code="DT-ALIAS-1",
        status=statuses["DA_TRINH"],
    )
    doc_pheduyet = Document.objects.create(
        title="Legacy approved",
        doc_direction=Document.Direction.DU_THAO,
        document_code="DT-LEGACY-2",
        status=statuses[OutboundStatus.LEGACY_PHE_DUYET.value],
    )
    doc_phathanh = Document.objects.create(
        title="Legacy issued",
        doc_direction=Document.Direction.DU_THAO,
        document_code="DT-LEGACY-3",
        status=statuses[OutboundStatus.LEGACY_PHAT_HANH.value],
    )
    doc_vt_check = Document.objects.create(
        title="Alias pending clerk",
        doc_direction=Document.Direction.DU_THAO,
        document_code="DT-ALIAS-2",
        status=statuses["CHO_VAN_THU_KIEM_TRA"],
    )
    doc_return_alias = Document.objects.create(
        title="Alias returned",
        doc_direction=Document.Direction.DU_THAO,
        document_code="DT-ALIAS-3",
        status=statuses["BI_TRA_LAI"],
    )

    qs_all = Document.objects.all()
    draft_qs = DocumentFilterSet(data={"kind": "DRAFT"}, queryset=qs_all).qs
    official_qs = DocumentFilterSet(data={"kind": "OFFICIAL"}, queryset=qs_all).qs

    draft_ids = set(draft_qs.values_list("document_id", flat=True))
    official_ids = set(official_qs.values_list("document_id", flat=True))

    assert doc_trinh.document_id in draft_ids
    assert doc_da_trinh.document_id in draft_ids
    assert doc_pheduyet.document_id not in draft_ids
    assert doc_phathanh.document_id not in draft_ids
    assert doc_vt_check.document_id not in draft_ids
    assert doc_return_alias.document_id in draft_ids

    assert doc_pheduyet.document_id in official_ids
    assert doc_phathanh.document_id in official_ids
    assert doc_vt_check.document_id in official_ids
    assert doc_return_alias.document_id not in official_ids

    # Serializer kind also classifies legacy outbound states as draft/official consistently
    draft_ser = DocumentSlimSerializer(doc_trinh)
    draft_alias_ser = DocumentSlimSerializer(doc_da_trinh)
    official_ser = DocumentSlimSerializer(doc_phathanh)
    official_alias_ser = DocumentSlimSerializer(doc_vt_check)
    returned_alias_ser = DocumentSlimSerializer(doc_return_alias)
    assert draft_ser.data.get("kind") == "DRAFT"
    assert draft_alias_ser.data.get("kind") == "DRAFT"
    assert official_ser.data.get("kind") == "OFFICIAL"
    assert official_alias_ser.data.get("kind") == "OFFICIAL"
    assert returned_alias_ser.data.get("kind") == "DRAFT"


@pytest.mark.django_db
def test_cv_assignable_status_kind_handles_alias_ids():
    status_return_alias, _ = DocumentStatus.objects.get_or_create(status_name="BI_TRA_LAI")
    status_submitted_alias, _ = DocumentStatus.objects.get_or_create(status_name="DA_TRINH")
    assert cv_assignable_status_kind(status_return_alias.status_id) == "return"
    # Submitted alias should be treated as draft/editable for assignment purposes
    assert cv_assignable_status_kind(status_submitted_alias.status_id) == "draft"
