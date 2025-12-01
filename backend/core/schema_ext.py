# core/schema_ext.py
from drf_spectacular.extensions import OpenApiAuthenticationExtension

class BearerAuthScheme(OpenApiAuthenticationExtension):
    """
    Ép tên security scheme của SimpleJWT thành 'BearerAuth'
    để đồng bộ với test & tài liệu.
    Ưu tiên >0 để ghi đè extension mặc định (thường =0).
    """
    target_class = 'rest_framework_simplejwt.authentication.JWTAuthentication'
    name = 'BearerAuth'
    priority = 1

    def get_security_definition(self, auto_schema):
        return {
            'type': 'http',
            'scheme': 'bearer',
            'bearerFormat': 'JWT',
        }
