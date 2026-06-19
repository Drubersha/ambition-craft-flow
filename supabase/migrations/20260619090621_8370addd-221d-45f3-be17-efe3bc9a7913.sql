
CREATE TABLE public.property_markings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  folder_id uuid NOT NULL REFERENCES public.folders(id) ON DELETE CASCADE,
  shape text NOT NULL CHECK (shape IN ('polygon','circle','point')),
  coords jsonb NOT NULL,
  color text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, folder_id)
);

CREATE INDEX property_markings_folder_idx ON public.property_markings(folder_id);
CREATE INDEX property_markings_property_idx ON public.property_markings(property_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_markings TO authenticated;
GRANT ALL ON public.property_markings TO service_role;

ALTER TABLE public.property_markings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their markings"
  ON public.property_markings
  FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER property_markings_touch_updated_at
  BEFORE UPDATE ON public.property_markings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
