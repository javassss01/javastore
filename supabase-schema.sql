-- JAVASTORE stock database — jalankan di Supabase SQL Editor (project javastore)
-- Tabel licenses = stok key supplier. Tabel orders = pesanan dari website.
-- TIDAK ADA credential di file ini. Aman disimpan di repo.

create table if not exists licenses (
  id bigint generated always as identity primary key,
  code text not null unique,
  product text not null,            -- xreg, phantom, ch3atgpt, drip, dripclient
  duration text not null,           -- '1 JAM', '1 HARI', ...
  status text not null default 'AVAILABLE',  -- AVAILABLE | SOLD
  cost_price integer,               -- harga beli dari supplier (rupiah)
  supplier text,
  buyer_wa text,
  transaction_id text,
  sold_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists licenses_product_duration_status_idx
  on licenses (product, duration, status);

create table if not exists orders (
  id bigint generated always as identity primary key,
  invoice text not null unique,
  transaction_id text not null unique,
  product text not null,
  duration text not null,
  amount integer not null,
  name text,
  wa text,
  status text not null default 'pending',  -- pending | paid | expired | cancel
  license_code text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists orders_transaction_id_idx on orders (transaction_id);

-- Klaim 1 key AVAILABLE untuk sebuah transaksi (atomik + idempotent).
-- Dipanggil webhook saat Casaku melaporkan paid. Mengembalikan kode key,
-- atau NULL kalau stok habis / order tidak ditemukan (order tetap ditandai paid).
create or replace function claim_license_for_transaction(p_transaction_id text)
returns text language plpgsql as $$
declare
  v_product text;
  v_duration text;
  v_wa text;
  v_code text;
begin
  select product, duration, wa, license_code
    into v_product, v_duration, v_wa, v_code
    from orders where transaction_id = p_transaction_id;
  if v_product is null then
    return null;
  end if;
  if v_code is not null then
    return v_code; -- sudah pernah diklaim, jangan ambil key kedua
  end if;

  update orders set status = 'paid', paid_at = now()
   where transaction_id = p_transaction_id;

  update licenses
     set status = 'SOLD', transaction_id = p_transaction_id,
         buyer_wa = v_wa, sold_at = now()
   where id = (
     select id from licenses
      where product = v_product
        and duration = v_duration
        and status = 'AVAILABLE'
      order by created_at asc
      limit 1
      for update skip locked
   )
   returning code into v_code;

  if v_code is not null then
    update orders set license_code = v_code
     where transaction_id = p_transaction_id;
  end if;
  return v_code;
end;
$$;

-- Kunci akses: hanya service_role key (di Vercel env vars, server-side saja)
-- yang boleh baca/tulis. Anon key tidak dapat apa-apa.
alter table licenses enable row level security;
alter table orders enable row level security;
