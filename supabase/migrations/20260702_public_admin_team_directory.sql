alter table sccs.admin_team_members
  add column if not exists name_zh varchar(100),
  add column if not exists name_en varchar(100),
  add column if not exists title_zh varchar(100),
  add column if not exists title_en varchar(100),
  add column if not exists display_order integer not null default 0,
  add column if not exists is_public boolean not null default false;

update sccs.admin_team_members
set is_public = false;

update sccs.admin_team_members as member
set name_zh = directory.name_zh,
    name_en = directory.name_en,
    title_zh = directory.title_zh,
    title_en = directory.title_en,
    display_order = directory.display_order,
    is_public = true
from (
  values
    ('yyang@ctsccs.org', '杨永华', 'Mr. Yonghua Yang', '校长', 'Principal', 10),
    ('wyu@ctsccs.org', '于卫里', 'Ms. Weili Yu', '教务长', 'Provost', 20),
    ('yxiang@ctsccs.org', '向轶', 'Ms. Yi Xiang', '财务总监', 'Director of Finance', 30),
    ('lan@ctsccs.org', '安玲', 'Ms. Ling An', '总务长', 'Director of School Services', 40),
    ('zliu@ctsccs.org', '刘泽亚', 'Ms. Zeya Liu', '总务长', 'Director of School Services', 50),
    ('ywang@ctsccs.org', '王瑜涛', 'Mr. Yutao Wang', '信息技术部门', 'IT Department', 60)
) as directory(email, name_zh, name_en, title_zh, title_en, display_order)
where lower(member.email) = directory.email;

grant select on sccs.admin_team_members to anon;

drop policy if exists "Public view admin team directory" on sccs.admin_team_members;
create policy "Public view admin team directory" on sccs.admin_team_members
for select to anon, authenticated
using (is_public);
