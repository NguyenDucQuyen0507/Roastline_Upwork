-- Roastline schema. Business rules live in the API; the database guards
-- what it can cheaply: types, ranges, references and allowed values.

CREATE TABLE coffees (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  origin        text NOT NULL,
  price_per_kg  numeric(8, 2) NOT NULL CHECK (price_per_kg > 0),
  is_blend      boolean NOT NULL DEFAULT false
);

CREATE SEQUENCE order_no_seq;
CREATE SEQUENCE batch_no_seq;

CREATE TABLE orders (
  id          text PRIMARY KEY,
  customer    text NOT NULL,
  city        text NOT NULL,
  due         date NOT NULL,
  status      text NOT NULL CHECK (status IN ('New', 'Roasting', 'Packed', 'Shipped')),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_due_idx ON orders (due);
CREATE INDEX orders_status_idx ON orders (status);

CREATE TABLE order_lines (
  order_id   text NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  line_no    smallint NOT NULL,
  coffee_id  text NOT NULL REFERENCES coffees (id),
  kg         numeric(7, 2) NOT NULL CHECK (kg > 0),
  grind      text NOT NULL CHECK (grind IN ('Whole bean', 'Espresso', 'Filter')),
  PRIMARY KEY (order_id, line_no)
);

CREATE TABLE batches (
  id            text PRIMARY KEY,
  coffee_id     text NOT NULL REFERENCES coffees (id),
  roaster       text NOT NULL CHECK (roaster IN ('Probat P12', 'Loring S15')),
  start_min     integer NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
  duration_min  integer NOT NULL CHECK (duration_min > 0),
  kg            numeric(6, 1) NOT NULL CHECK (kg > 0),
  roast_level   smallint NOT NULL CHECK (roast_level BETWEEN 1 AND 5),
  CHECK (start_min + duration_min <= 1440)
);
CREATE INDEX batches_roaster_start_idx ON batches (roaster, start_min);

-- Green coffee taken from stock for each batch (blends use several origins).
CREATE TABLE batch_green_use (
  batch_id   text NOT NULL REFERENCES batches (id) ON DELETE CASCADE,
  coffee_id  text NOT NULL REFERENCES coffees (id),
  kg         numeric(7, 1) NOT NULL CHECK (kg > 0),
  PRIMARY KEY (batch_id, coffee_id)
);

CREATE TABLE green_stock (
  coffee_id   text PRIMARY KEY REFERENCES coffees (id),
  kg          numeric(8, 1) NOT NULL CHECK (kg >= 0),
  reorder_at  numeric(8, 1) NOT NULL CHECK (reorder_at >= 0),
  capacity    numeric(8, 1) NOT NULL CHECK (capacity > 0),
  CHECK (kg <= capacity)
);
