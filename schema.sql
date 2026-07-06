-- 在 Supabase Dashboard → SQL Editor 里运行这个文件

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,
  is_pro boolean default false,
  pro_expires_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  date date not null default current_date,
  message_count integer default 0,
  unique(user_id, date)
);

create table if not exists sms_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  code text not null,
  expires_at timestamptz not null,
  used boolean default false,
  created_at timestamptz default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  token text unique not null,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz default now()
);

create index if not exists idx_sessions_token on sessions(token);
create index if not exists idx_usage_user_date on usage_logs(user_id, date);
create index if not exists idx_sms_phone on sms_codes(phone, created_at desc);

-- 禁止匿名key直接访问（所有操作都走服务端API）
alter table profiles enable row level security;
alter table usage_logs enable row level security;
alter table sms_codes enable row level security;
alter table sessions enable row level security;
