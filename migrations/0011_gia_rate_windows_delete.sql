-- Allow gia_app to prune expired rate windows. Does not edit 0001-0010.
BEGIN;

GRANT DELETE ON gia_rate_windows TO gia_app;

COMMIT;
