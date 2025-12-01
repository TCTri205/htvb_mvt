from django.core.management.base import BaseCommand
from django.conf import settings
import json, sys

class Command(BaseCommand):
    help = "Subscribe Redis Pub/Sub channels and print envelopes."

    def add_arguments(self, parser):
        parser.add_argument("channels", nargs="*", help="Channels to subscribe (default: events)")

    def handle(self, *args, **opts):
        try:
            import redis
        except Exception:
            self.stderr.write("redis package not installed. pip install redis")
            sys.exit(1)

        url = getattr(settings, "EVENTS_REDIS_URL", None) or getattr(settings, "REDIS_URL", "redis://localhost:6379/0")
        r = redis.Redis.from_url(url, decode_responses=True)
        p = r.pubsub()

        channels = opts["channels"] or ["events"]
        self.stdout.write(f"Subscribing to: {', '.join(channels)}")
        p.subscribe(*channels)

        for msg in p.listen():
            if msg.get("type") != "message":
                continue
            try:
                payload = json.loads(msg["data"])
            except Exception:
                payload = msg["data"]
            self.stdout.write(f"[{msg['channel']}] {payload}")
