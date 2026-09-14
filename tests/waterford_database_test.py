"""Integration tests against a disposable local PostgreSQL database (no .env access).

Run: python tests/waterford_database_test.py
Requires psycopg and a local PostgreSQL server on port 55439.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import unittest
import uuid

import psycopg
from psycopg import sql

ROOT = Path(__file__).resolve().parents[1]
DATABASE = "sccs_waterford_test_" + uuid.uuid4().hex
CONNECTION = dict(host="127.0.0.1", port=55439, user="postgres")


class WaterfordDatabaseTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = psycopg.connect(**CONNECTION, dbname=DATABASE, autocommit=True)
        cls.db.execute("""
            do $$ begin
              if not exists (select from pg_roles where rolname='anon') then create role anon; end if;
              if not exists (select from pg_roles where rolname='authenticated') then create role authenticated; end if;
              if not exists (select from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
            end $$;
            create schema auth;
            create schema private;
            create table auth.users (id uuid primary key, email text);
            create function auth.uid() returns uuid language sql as $$
              select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
            $$;
            grant usage on schema auth, private to authenticated;
        """)
        cls.db.execute((ROOT / "supabase/migrations/20260615_initial_schema.sql").read_text())
        cls.db.execute("""
            create type sccs.app_role as enum ('sccs_family_role', 'sccs_admin_team_role', 'sccs_superadmin_role');
            create table sccs.user_roles(user_id uuid primary key, role sccs.app_role);
            create function private.current_user_has_role(allowed sccs.app_role[]) returns boolean language sql security definer set search_path = '' as $$
              select exists(select 1 from sccs.user_roles where user_id=auth.uid() and role=any(allowed));
            $$;
            create table sccs.admin_team_members(user_id uuid primary key, email text);
            create table sccs.site_settings (key text primary key, value jsonb, description text);
            alter table sccs.site_settings enable row level security;
            grant select on sccs.site_settings to authenticated;
            alter table sccs.families add column waterford_resident boolean not null default false;
            alter table sccs.families add column pfizer_employee boolean not null default false;
            insert into sccs.classes(id, name, type, donation) values
              (1,'Grade 1','CHN',290), (2,'Mandarin','CHN',150),
              (3,'Chinese Painting','CC',290), (4,'SAT','SAT',290), (5,'Legacy Chinese','CHN2',100);
            insert into sccs.families(id,city) values(1000,'Waterford');
            insert into sccs.students(id,family_id) select n,1000 from generate_series(1001,1023) n;
            insert into sccs.class_registrations(student_id,session_1,registered_at)
              select n,1,'2026-08-01'::timestamptz + n * interval '1 second' from generate_series(1001,1022) n;
            insert into sccs.class_registrations(student_id,session_1,registered_at) values(1023,1,'2025-08-01');
        """)
        cls.db.execute((ROOT / "supabase/migrations/20260913230655_waterford_annual_seats.sql").read_text())
        cls.db.execute((ROOT / "supabase/migrations/20260913231422_member_deposit_waivers_pta.sql").read_text(encoding="utf-8"))
        cls.seeded_pta = cls.db.execute(
            "select name_zh,email from sccs.pta_leaders order by display_order"
        ).fetchall()
        cls.backfill_usage = cls.db.execute("select used,waiting from sccs.waterford_seat_usage").fetchone()
        cls.backfill_awards = cls.db.execute("select student_id from sccs.waterford_seats where seat_number is not null order by student_id").fetchall()

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def setUp(self):
        self.db.execute("""
          truncate sccs.waterford_seats, sccs.waterford_seat_usage restart identity;
          truncate sccs.class_registrations, sccs.students, sccs.families cascade;
          truncate sccs.pta_leaders, sccs.teachers, sccs.admin_team_members, sccs.user_roles cascade;
          insert into sccs.families (id,city) values (1,'Waterford'), (2,'Norwich');
          insert into sccs.students (id,family_id) select n,1 from generate_series(1,40) n;
          insert into sccs.students (id,family_id) values (100,2);
        """)

    def register(self, student, c1=1, c2=None, c3=None, connection=None):
        (connection or self.db).execute("""
          insert into sccs.class_registrations(student_id,session_1,session_2,session_3)
          values (%s,%s,%s,%s) on conflict(student_id) do update
          set session_1=excluded.session_1,session_2=excluded.session_2,session_3=excluded.session_3
        """, (student, c1, c2, c3))

    def usage(self):
        return self.db.execute("select used,waiting from sccs.waterford_seat_usage").fetchone()

    def test_migration_backfill_uses_all_existing_registrations_without_date_cutoff(self):
        self.assertEqual(self.backfill_usage, (20,3))
        self.assertEqual(self.backfill_awards, [(n,) for n in range(1001,1020)] + [(1023,)])

    def test_seeded_pta_household_emails(self):
        self.assertEqual(self.seeded_pta, [
            ('罗雪梅', 'xuemei.luo@pfizer.com'),
            ('伍緎榛', None),
            ('吴霞', 'wuxiayu@gmail.com'),
            ('曾百灵', 'bevanzeng8@gmail.com'),
            ('待定', None),
        ])

    def test_twentieth_twenty_first_and_release_promotes_oldest(self):
        for student in range(1,23):
            self.register(student)
        self.assertEqual(self.usage(), (20,2))
        self.register(1, None)
        self.assertEqual(self.usage(), (20,1))
        awards = self.db.execute("select student_id from sccs.waterford_seats where seat_number is not null and released_at is null").fetchall()
        self.assertIn((21,), awards)
        self.assertNotIn((22,), awards)
        self.register(1)
        self.assertEqual(self.usage(), (20,2))
        self.register(2, None)
        self.assertIsNone(self.db.execute("select seat_number from sccs.waterford_seats where student_id=1 and released_at is null").fetchone()[0])

    def test_only_language_courses_and_residents(self):
        self.register(1,1,3,4)
        self.register(100,1,2)
        self.assertEqual(self.usage(), (1,0))
        self.register(2,5)
        self.assertEqual(self.usage(), (2,0))

    def test_two_courses_one_student_consume_two_seats(self):
        self.register(1,1,2)
        self.assertEqual(self.usage(), (2,0))
        self.register(1,1,2)
        self.assertEqual(self.usage(), (2,0))
        self.register(1,1,1)
        self.assertEqual(self.usage(), (1,0))

    def test_new_course_does_not_jump_waitlist_using_old_registration_date(self):
        for student in range(1,22):
            self.register(student)
        self.register(1,1,2)
        self.register(2,None)
        self.assertIsNotNone(self.db.execute("select seat_number from sccs.waterford_seats where student_id=21").fetchone()[0])
        self.assertIsNone(self.db.execute("select seat_number from sccs.waterford_seats where student_id=1 and class_id=2").fetchone()[0])

    def test_concurrent_registrations_cannot_overallocate(self):
        def work(student):
            with psycopg.connect(**CONNECTION, dbname=DATABASE) as connection:
                self.register(student, connection=connection)
        with ThreadPoolExecutor(max_workers=12) as pool:
            list(pool.map(work, range(1,31)))
        self.assertEqual(self.usage(), (20,10))
        self.assertEqual(self.db.execute("select count(distinct seat_number) from sccs.waterford_seats where released_at is null").fetchone()[0], 20)

    def test_calendar_year_change_does_not_reset_awards(self):
        self.register(1)
        self.db.execute("update sccs.class_registrations set registered_at='2027-01-10' where student_id=1")
        self.register(2)
        self.assertEqual(self.usage(), (2,0))
        self.assertEqual(self.db.execute("select count(*) from sccs.waterford_seats where student_id=1").fetchone()[0], 1)

    def test_annual_reset_restores_all_twenty_seats(self):
        for student in range(1,23):
            self.register(student)
        self.db.execute("truncate sccs.class_registrations, sccs.waterford_seats, sccs.waterford_seat_usage restart identity")
        self.assertEqual(self.usage(), (0,0))
        for student in range(1,21):
            self.register(student)
        self.assertEqual(self.usage(), (20,0))
        self.assertEqual(self.db.execute("select count(*) from sccs.waterford_seats").fetchone()[0], 20)

    def test_delete_and_residency_change_release_seats(self):
        self.register(1)
        self.db.execute("delete from sccs.students where id=1")
        self.assertEqual(self.usage(), (0,0))
        self.register(2)
        self.db.execute("update sccs.families set city='Norwich' where id=1")
        self.assertEqual(self.usage(), (0,0))

    def test_failed_transaction_does_not_consume_seat(self):
        with psycopg.connect(**CONNECTION, dbname=DATABASE) as connection:
            self.register(1, connection=connection)
            connection.rollback()
        self.assertEqual(self.usage(), (0,0))

    def member_connection(self, email, admin=False):
        user_id = uuid.uuid4()
        self.db.execute("insert into auth.users(id,email) values(%s,%s)", (user_id,email))
        self.db.execute("update sccs.families set user_id=%s,email=%s where id=1", (user_id,email))
        if admin:
            self.db.execute("insert into sccs.user_roles values(%s,'sccs_admin_team_role')", (user_id,))
        connection = psycopg.connect(**CONNECTION, dbname=DATABASE, autocommit=True)
        connection.execute("set role authenticated")
        connection.execute("select set_config('request.jwt.claim.sub',%s,false)", (str(user_id),))
        return connection

    def test_deposit_matches_admin_teacher_primary_and_secondary_email(self):
        with self.member_connection("Member@Example.com") as connection:
            deposit = lambda: connection.execute("select private.family_patrol_deposit(1)").fetchone()[0]
            self.assertEqual(deposit(),40)
            self.db.execute("insert into sccs.admin_team_members values(%s,' member@example.com ')",(uuid.uuid4(),))
            self.assertEqual(deposit(),0)
            self.db.execute("delete from sccs.admin_team_members")
            self.db.execute("insert into sccs.teachers(id,email_1) values(1,'MEMBER@example.com')")
            self.assertEqual(deposit(),0)
            self.db.execute("update sccs.teachers set email_1='other@example.com',email_2='member@example.com'")
            self.assertEqual(deposit(),0)
            self.db.execute("delete from sccs.teachers")
            self.assertEqual(deposit(),40)

    def test_pta_active_email_waiver_independent_of_public_display(self):
        with self.member_connection("pta@example.com") as connection:
            self.db.execute("insert into sccs.pta_leaders(name_en,email,is_public) values('Leader','pta@example.com',false)")
            self.assertEqual(connection.execute("select private.family_patrol_deposit(1)").fetchone()[0],0)
            self.db.execute("update sccs.pta_leaders set is_active=false")
            self.assertEqual(connection.execute("select private.family_patrol_deposit(1)").fetchone()[0],40)
            self.db.execute("update sccs.pta_leaders set is_active=true,email=null")
            self.assertEqual(connection.execute("select private.family_patrol_deposit(1)").fetchone()[0],40)

    def test_employee_waiver_remains_and_admin_can_match_legacy_family_email(self):
        with self.member_connection("employee@pfizer.com",admin=True) as connection:
            self.assertEqual(connection.execute("select private.family_patrol_deposit(1)").fetchone()[0],40)
            self.db.execute("update sccs.families set pfizer_employee=true where id=1")
            self.assertEqual(connection.execute("select private.family_patrol_deposit(1)").fetchone()[0],0)
            self.db.execute("update sccs.families set email='legacy@example.com' where id=2")
            self.db.execute("insert into sccs.teachers(email_2) values('LEGACY@example.com')")
            self.assertEqual(connection.execute("select private.family_patrol_deposit(2)").fetchone()[0],0)

    def test_family_cannot_forge_email_or_manage_pta_or_query_other_deposit(self):
        with self.member_connection("ordinary@example.com") as connection:
            self.db.execute("insert into sccs.teachers(email_1) values('teacher@example.com')")
            connection.execute("update sccs.families set email='teacher@example.com' where id=1")
            self.assertEqual(connection.execute("select private.family_patrol_deposit(1)").fetchone()[0],40)
            for query in ["select private.family_patrol_deposit(2)", "select sccs.manage_pta_leaders()", "select email from sccs.pta_leaders", "delete from sccs.pta_leaders"]:
                with self.assertRaises(psycopg.Error): connection.execute(query)

    def test_admin_pta_crud_and_public_names_without_emails(self):
        with self.member_connection("admin@example.com",admin=True) as connection:
            rows=connection.execute("select sccs.manage_pta_leaders('save',%s)", ('{"name_en":"Public Leader","email":"private@example.com"}',)).fetchone()[0]
            member=rows[0]
            self.assertEqual(member['email'],'private@example.com')
            snapshot=connection.execute("select sccs.waterford_billing_snapshot()").fetchone()[0]
            self.assertEqual(len(snapshot['deposits']),1)  # test fixture only grants own-family RLS
            with psycopg.connect(**CONNECTION,dbname=DATABASE,autocommit=True) as public:
                public.execute("set role anon")
                self.assertEqual(public.execute("select name_en from sccs.pta_leaders").fetchone()[0],'Public Leader')
                with self.assertRaises(psycopg.Error): public.execute("select email from sccs.pta_leaders")
                with self.assertRaises(psycopg.Error): public.execute("select sccs.manage_pta_leaders()")
            connection.execute("select sccs.manage_pta_leaders('save',%s)", (psycopg.types.json.Jsonb({**member,'is_active':False}),))
            connection.execute("select sccs.manage_pta_leaders('delete',%s)", (psycopg.types.json.Jsonb({'id':member['id']}),))
            self.assertEqual(connection.execute("select sccs.manage_pta_leaders()").fetchone()[0],[])

    def test_rls_allows_own_records_but_not_forged_awards(self):
        user_id = uuid.uuid4()
        self.db.execute("insert into auth.users(id) values(%s)", (user_id,))
        self.db.execute("update sccs.families set user_id=%s where id=1", (user_id,))
        with psycopg.connect(**CONNECTION, dbname=DATABASE, autocommit=True) as connection:
            connection.execute("set role authenticated")
            connection.execute("select set_config('request.jwt.claim.sub',%s,false)", (str(user_id),))
            self.register(1, connection=connection)
            self.assertEqual(connection.execute("select count(*) from sccs.waterford_seats").fetchone()[0], 1)
            for query in [
                "update sccs.waterford_seats set seat_number=20",
                "insert into sccs.waterford_seats(student_id,family_id,class_id) values(1,1,2)",
                "select private.refresh_waterford_seats()",
            ]:
                with self.assertRaises(psycopg.Error):
                    connection.execute(query)
        self.db.execute("update sccs.families set city='Waterford' where id=2")
        self.register(100)
        with psycopg.connect(**CONNECTION, dbname=DATABASE) as connection:
            connection.execute("set role authenticated")
            connection.execute("select set_config('request.jwt.claim.sub',%s,false)", (str(user_id),))
            self.assertEqual(connection.execute("select count(*) from sccs.waterford_seats").fetchone()[0], 1)
            self.assertEqual(connection.execute("select used from sccs.waterford_seat_usage").fetchone()[0], 2)
            snapshot = connection.execute("select sccs.waterford_billing_snapshot(2)").fetchone()[0]
            self.assertEqual(snapshot["seats"], [])
            self.assertEqual(snapshot["registrations"], [])
            own = connection.execute("select sccs.waterford_billing_snapshot(1)").fetchone()[0]
            self.assertEqual(len(own["seats"]), 1)
            self.assertEqual(len(own["registrations"]), 1)


if __name__ == "__main__":
    with psycopg.connect(**CONNECTION, dbname="postgres", autocommit=True) as admin:
        admin.execute(sql.SQL("create database {}").format(sql.Identifier(DATABASE)))
        try:
            unittest.main(verbosity=2)
        finally:
            admin.execute(sql.SQL("drop database {} with (force)").format(sql.Identifier(DATABASE)))
