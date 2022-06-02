CREATE TABLE public.items (
  id uuid DEFAULT public.gen_random_uuid() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  name text NOT NULL,
  user_id uuid NOT NULL
);

ALTER TABLE
  ONLY public.items
ADD
  CONSTRAINT items_pkey PRIMARY KEY (id);

ALTER TABLE
  ONLY public.items
ADD
  CONSTRAINT items_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;