# common/schema.py
from rest_framework import serializers as drf_serializers
from drf_spectacular.utils import extend_schema_serializer


@extend_schema_serializer(component_name="APIError")
class APIError(drf_serializers.Serializer):
    """
    Mô tả lỗi chuẩn hoá theo contract:
      - detail: mô tả lỗi cho người dùng cuối
      - code:   mã lỗi rõ ràng (UPPER_CASE) để FE và QA map hành vi
      - field_errors: dict {field: [message, ...]} cho lỗi dạng form

    Không sử dụng thêm cấu trúc RFC7807 để tránh nhiễu thông tin với FE.
    """
    detail = drf_serializers.CharField()
    code = drf_serializers.CharField()
    field_errors = drf_serializers.DictField(
        child=drf_serializers.ListField(child=drf_serializers.CharField()),
        required=False,
        allow_empty=True,
    )


@extend_schema_serializer(component_name="StatusOnlyResponse")
class StatusOnlyResponse(drf_serializers.Serializer):
    """
    Phản hồi tối giản cho các action/state-transition.
    - status_id: mã số trạng thái (đang dùng thực tế trong dự án)
    - status: chuỗi mô tả trạng thái (tùy chọn, mở rộng)
    """
    status_id = drf_serializers.IntegerField(required=False)
    status = drf_serializers.CharField(required=False)


@extend_schema_serializer(component_name="PublishResponse")
class PublishResponse(drf_serializers.Serializer):
    """
    Phản hồi khi phát hành văn bản đi.
    - issue_number: số phát hành (có thể rỗng)
    - issued_date:  ngày phát hành
    """
    issue_number = drf_serializers.CharField(allow_null=True, required=False)
    issued_date = drf_serializers.DateField(allow_null=True, required=False)
