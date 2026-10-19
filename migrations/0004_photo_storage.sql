-- Garment photos can live in a private Supabase Storage bucket instead of the row. A row holds its bytes or the
-- object path (`<user id>/<garment id>.jpg`), never neither.
alter table garments alter column photo drop not null;
alter table garments add column photo_object text;
alter table garments add constraint garments_photo_location check (photo is not null or photo_object is not null);
