from django.urls import path

from .views import CatalogEntriesView, CatalogItemDetailView, CatalogStatsView

app_name = "catalog"

urlpatterns = [
    path("stats/", CatalogStatsView.as_view(), name="catalog-stats"),
    path("<slug:name>/", CatalogEntriesView.as_view(), name="catalog-entries"),
    path("<slug:name>/<int:item_id>/", CatalogItemDetailView.as_view(), name="catalog-detail"),
]
