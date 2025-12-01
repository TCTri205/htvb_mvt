# apps/catalog/models.py
from django.db import models


class Field(models.Model):
    class Meta:
        db_table = "fields"

    field_id = models.BigAutoField(primary_key=True)
    field_name = models.CharField(max_length=200, unique=True)


class DocumentType(models.Model):
    class Meta:
        db_table = "document_types"

    document_type_id = models.BigAutoField(primary_key=True)
    type_name = models.CharField(max_length=200, unique=True)


class IssueLevel(models.Model):
    class Meta:
        db_table = "issue_levels"

    issue_level_id = models.BigAutoField(primary_key=True)
    level_name = models.CharField(max_length=200, unique=True)


class SecurityLevel(models.Model):
    class Meta:
        db_table = "security_levels"

    security_level_id = models.BigAutoField(primary_key=True)
    level_name = models.CharField(max_length=200, unique=True)


class UrgencyLevel(models.Model):
    class Meta:
        db_table = "urgency_levels"

    urgency_level_id = models.BigAutoField(primary_key=True)
    level_name = models.CharField(max_length=200, unique=True)


class DocumentStatus(models.Model):
    class Meta:
        db_table = "document_statuses"

    status_id = models.BigAutoField(primary_key=True)
    status_name = models.CharField(max_length=200, unique=True)

    @property
    def name(self):
        return self.status_name

    @property
    def code(self):
        return self.status_name.lower()


class CaseType(models.Model):
    class Meta:
        db_table = "case_types"

    case_type_id = models.BigAutoField(primary_key=True)
    case_type_name = models.CharField(max_length=200, unique=True)


class CaseStatus(models.Model):
    class Meta:
        db_table = "case_statuses"

    case_status_id = models.BigAutoField(primary_key=True)
    case_status_name = models.CharField(max_length=200, unique=True)

    @property
    def name(self):
        return self.case_status_name

    @property
    def code(self):
        return self.case_status_name.upper()


class AttachmentType(models.Model):
    class Meta:
        db_table = "attachment_types"

    attachment_type_id = models.BigAutoField(primary_key=True)
    type_name = models.CharField(max_length=100, unique=True)
