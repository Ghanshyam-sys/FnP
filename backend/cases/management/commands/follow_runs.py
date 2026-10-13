"""Follows every engine run in progress, so no page has to wait on the engine.

    manage.py follow_runs          keeps running (stop with Ctrl+C); run it next to the web server
    manage.py follow_runs --once   one pass, for a scheduler or a test

The pages still move a run on when they find one overdue, so cases never stall while this is not
running; with it running, nothing is ever overdue and pages only read the database."""

import time

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import close_old_connections

from cases import workflow

# Runs followed per pass. A pass takes a few database queries and one engine call per run.
BATCH = 50


class Command(BaseCommand):
    help = "Follow engine runs in progress (submission → report → score)."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true", help="Make one pass and exit.")

    def handle(self, *args, once, **options):
        while True:
            followed = workflow.follow_due_runs(BATCH)
            if once:
                self.stdout.write(f"Followed {followed} run(s).")
                return
            # A full batch means more are waiting: go again straight away.
            if followed < BATCH:
                time.sleep(settings.ENGINE_POLL_INTERVAL_SECONDS)
            # A long-lived process: never hold on to a connection the database has since closed.
            close_old_connections()
