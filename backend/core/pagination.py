# core/pagination.py
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

class DefaultPageNumberPagination(PageNumberPagination):
    """
    Contract-compliant pagination envelope:
      - items: dữ liệu của trang hiện tại
      - total_items: tổng số bản ghi
      - total_pages: tổng số trang
      - page: trang hiện tại (1-based)
      - page_size: kích thước trang đang áp dụng (đã clamp <= max_page_size)
    """

    page_size = 20          # theo chính sách tích hợp
    page_query_param = "page"
    page_size_query_param = "page_size"
    max_page_size = 200

    def get_paginated_response(self, data):
        page_size = self.get_page_size(self.request)
        if not page_size:
            page_size = self.page.paginator.per_page

        total_items = self.page.paginator.count
        total_pages = self.page.paginator.num_pages

        return Response({
            "items": data,
            "total_items": total_items,
            "total_pages": total_pages,
            "page": self.page.number,
            "page_size": page_size,
        })

    def get_paginated_response_schema(self, schema):
        return {
            "type": "object",
            "properties": {
                "items": schema,
                "total_items": {"type": "integer"},
                "total_pages": {"type": "integer"},
                "page": {"type": "integer"},
                "page_size": {"type": "integer"},
            },
            "required": ["items", "total_items", "total_pages", "page", "page_size"],
        }
