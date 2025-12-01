from .views_ui import UIPageView


class LoginView(UIPageView):
    template_name = "chung/login.html"


class IndexView(UIPageView):
    template_name = "chung/index.html"


class TemplateSampleView(UIPageView):
    template_name = "chung/template.html"
    extra_context = {
        "body_role": "template",
        "body_page": "__page_key__",
    }
