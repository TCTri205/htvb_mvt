from django.contrib.auth.mixins import LoginRequiredMixin
from django.urls import reverse_lazy
from django.views.generic import TemplateView


class UIPageView(TemplateView):
    """
    Generic TemplateView for MVT-only screens. Extra context is copied through so
    each URL can provide the body role/page and an explicit login path.
    """

    default_login_path = reverse_lazy("ui:index")

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        extras = self.extra_context or {}
        context.setdefault("body_role", extras.get("body_role"))
        context.setdefault("body_page", extras.get("body_page"))
        context.setdefault("body_class", extras.get("body_class"))
        context.setdefault("login_path", extras.get("login_path") or self.default_login_path)
        return context


class LoginRequiredUIPageView(LoginRequiredMixin, UIPageView):
    login_url = UIPageView.default_login_path
