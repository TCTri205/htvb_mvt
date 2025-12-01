# notifications/management/commands/populate_notification_demo.py
"""
Management command to populate demo data for notification channels, rules, and logs.
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
import random

from notifications.models import NotificationChannel, AutomationRule, NotificationLog


class Command(BaseCommand):
    help = 'Populate demo data for notification management'
    
    def handle(self, *args, **kwargs):
        self.stdout.write('Populating notification demo data...')
        
        # Clear existing data (optional)
        if input('Clear existing data? (y/N): ').lower() == 'y':
            NotificationLog.objects.all().delete()
            AutomationRule.objects.all().delete()
            NotificationChannel.objects.all().delete()
            self.stdout.write(self.style.SUCCESS('Cleared existing data'))
        
        # Create channels
        self.create_channels()
        
        # Create automation rules
        self.create_automation_rules()
        
        # Create demo logs
        self.create_notification_logs()
        
        self.stdout.write(self.style.SUCCESS('✅ Demo data populated successfully!'))
    
    def create_channels(self):
        """Create 3 notification channels."""
        channels_data = [
            {
                'channel_type': 'email',
                'is_enabled': True,
                'config': {
                    'smtp_host': 'smtp.gmail.com',
                    'smtp_port': 587,
                    'from_email': 'noreply@demo.com',
                    'from_name': 'Hệ thống Quản lý Văn bản'
                },
                'sent_count': 850,
                'error_count': 10,
                'last_used_at': timezone.now() - timedelta(hours=2)
            },
            {
                'channel_type': 'push',
                'is_enabled': True,
                'config': {
                    'service': 'Firebase',
                    'project_id': 'demo-project',
                    'server_key': 'demo-server-key-xxxx'
                },
                'sent_count': 320,
                'error_count': 5,
                'last_used_at': timezone.now() - timedelta(hours=1)
            },
            {
                'channel_type': 'sms',
                'is_enabled': False,
                'config': {
                    'provider': 'Twilio',
                    'account_sid': 'demo-sid',
                    'phone_from': '+84987654321'
                },
                'sent_count': 80,
                'error_count': 0,
                'last_used_at': timezone.now() - timedelta(days=3)
            }
        ]
        
        for data in channels_data:
            channel, created = NotificationChannel.objects.get_or_create(
                channel_type=data['channel_type'],
                defaults=data
            )
            if created:
                self.stdout.write(f'  ✓ Created channel: {channel.channel_type}')
            else:
                self.stdout.write(f'  • Channel already exists: {channel.channel_type}')
    
    def create_automation_rules(self):
        """Create 5 automation rules."""
        rules_data = [
            {
                'name': 'Thông báo phân công mới',
                'trigger': 'assignment',
                'is_enabled': True,
                'channels': ['email', 'push'],
                'conditions': {
                    'priority': ['URGENT', 'HIGH']
                },
                'template': 'Bạn đã được phân công văn bản {{doc_number}}'
            },
            {
                'name': 'Nhắc việc trước hạn 24h',
                'trigger': 'deadline',
                'is_enabled': True,
                'channels': ['email', 'push', 'sms'],
                'conditions': {
                    'hours_before': 24
                },
                'template': 'Văn bản {{doc_number}} sắp đến hạn xử lý'
            },
            {
                'name': 'Thông báo thay đổi trạng thái',
                'trigger': 'status_change',
                'is_enabled': True,
                'channels': ['push'],
                'conditions': {
                    'from_status': ['DRAFT', 'PENDING'],
                    'to_status': ['APPROVED', 'REJECTED']
                },
                'template': 'Văn bản {{doc_number}} đã chuyển sang {{new_status}}'
            },
            {
                'name': 'Nhắc việc quá hạn',
                'trigger': 'deadline',
                'is_enabled': False,
                'channels': ['email'],
                'conditions': {
                    'hours_after': 0
                },
                'template': 'Văn bản {{doc_number}} đã quá hạn xửlý'
            },
            {
                'name': 'Thông báo văn bản khẩn cấp',
                'trigger': 'assignment',
                'is_enabled': True,
                'channels': ['email', 'push', 'sms'],
                'conditions': {
                    'priority': ['URGENT']
                },
                'template': '🚨 VĂN BẢN KHẨN: {{doc_number}} - {{subject}}'
            }
        ]
        
        for data in rules_data:
            rule, created = AutomationRule.objects.get_or_create(
                name=data['name'],
                defaults=data
            )
            if created:
                self.stdout.write(f'  ✓ Created rule: {rule.name}')
            else:
                self.stdout.write(f'  • Rule already exists: {rule.name}')
    
    def create_notification_logs(self):
        """Create 50 demo notification logs."""
        rules = list(AutomationRule.objects.all())
        channels = ['email', 'push', 'sms']
        statuses = ['sent', 'sent', 'sent', 'failed']  # 75% success rate
        
        recipients = [
            'user1@example.com',
            'user2@example.com',
            'admin@example.com',
            'manager@example.com',
            'clerk@example.com'
        ]
        
        titles = [
            'Bạn được phân công văn bản số 123/VB-VP',
            'Văn bản 456/QĐ-UB sắp đến hạn xử lý',
            'Văn bản 789/TB-PC đã được phê duyệt',
            '🚨 VĂN BẢN KHẨN: 999/CV-KT cần xử lý ngay',
            'Nhắc việc: Văn bản 111/BC-TC đến hạn hôm nay'
        ]
        
        created_count = 0
        for i in range(50):
            days_ago = random.randint(0, 30)
            sent_at = timezone.now() - timedelta(days=days_ago, hours=random.randint(0, 23))
            
            status = random.choice(statuses)
            error_msg = None
            if status == 'failed':
                error_msg = random.choice([
                    'SMTP connection timeout',
                    'Invalid recipient email',
                    'Firebase token expired',
                    'SMS quota exceeded'
                ])
            
            log = NotificationLog.objects.create(
                channel=random.choice(channels),
                recipient=random.choice(recipients),
                title=random.choice(titles),
                body=f'Nội dung chi tiết thông báo số {i+1}...',
                status=status,
                error_message=error_msg,
                rule=random.choice(rules) if rules and random.random() > 0.3 else None
            )
            # Override sent_at to spread across 30 days
            NotificationLog.objects.filter(pk=log.pk).update(sent_at=sent_at)
            created_count += 1
        
        self.stdout.write(f'  ✓ Created {created_count} notification logs')
