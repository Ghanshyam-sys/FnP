from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("api/", include("cases.urls")),
    # Staff only (manage.py createsuperuser); see cases/admin.py.
    path("admin/", admin.site.urls),
]
