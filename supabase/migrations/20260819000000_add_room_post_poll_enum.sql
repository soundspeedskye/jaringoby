-- PostgreSQL requires the new enum value to be committed before it is used.
alter type public.room_post_kind add value if not exists 'poll';
