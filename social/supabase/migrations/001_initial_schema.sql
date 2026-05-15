-- ============================================================
-- WM 2026 Social — Initial Schema
-- Run in: https://supabase.com/dashboard/project/wbuipkeapzohtnlyxidv/sql/new
-- ============================================================

-- ── 1. profiles ──────────────────────────────────────────────────────────────
-- One row per auth user; auto-created on first sign-up via trigger.
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT UNIQUE,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read"        ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Own write"          ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Trigger: create profile row automatically when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 2. favorites ─────────────────────────────────────────────────────────────
-- Users can favourite individual teams.
CREATE TABLE IF NOT EXISTS public.favorites (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id    TEXT NOT NULL,            -- FIFA team code, e.g. "GER"
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, team_id)
);

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own read"   ON public.favorites FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Own insert" ON public.favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own delete" ON public.favorites FOR DELETE USING (auth.uid() = user_id);

-- ── 3. filter_profiles ───────────────────────────────────────────────────────
-- Saved filter sets (groups, teams, date range, time windows, etc.)
CREATE TABLE IF NOT EXISTS public.filter_profiles (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  filters     JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, name)
);

ALTER TABLE public.filter_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own all" ON public.filter_profiles
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 4. tips (Tipp-Spiel) ─────────────────────────────────────────────────────
-- One tip per user per match. match_id = numeric WC 2026 match number.
CREATE TABLE IF NOT EXISTS public.tips (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id     INTEGER NOT NULL,       -- WC match number (1-104)
  home_goals   SMALLINT NOT NULL CHECK (home_goals >= 0),
  away_goals   SMALLINT NOT NULL CHECK (away_goals >= 0),
  submitted_at TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, match_id)
);

ALTER TABLE public.tips ENABLE ROW LEVEL SECURITY;

-- Everyone can read tips (social transparency), only owner can write
CREATE POLICY "Public read"  ON public.tips FOR SELECT USING (true);
CREATE POLICY "Own insert"   ON public.tips FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own update"   ON public.tips FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Own delete"   ON public.tips FOR DELETE USING (auth.uid() = user_id);

-- Auto-update updated_at on tip change
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS tips_set_updated_at ON public.tips;
CREATE TRIGGER tips_set_updated_at
  BEFORE UPDATE ON public.tips
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 5. match_results (admin-only, for scoring) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.match_results (
  match_id     INTEGER PRIMARY KEY,
  home_goals   SMALLINT NOT NULL,
  away_goals   SMALLINT NOT NULL,
  recorded_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.match_results ENABLE ROW LEVEL SECURITY;

-- Anyone can read results; only service role can write (via Netlify Function)
CREATE POLICY "Public read" ON public.match_results FOR SELECT USING (true);

-- ── 6. leaderboard view ──────────────────────────────────────────────────────
-- Scoring: exact score = 3 pts, correct tendency = 1 pt
CREATE OR REPLACE VIEW public.leaderboard AS
SELECT
  p.id              AS user_id,
  COALESCE(p.username, split_part(u.email, '@', 1)) AS display_name,
  COUNT(t.id)       AS tips_submitted,
  SUM(
    CASE
      WHEN t.home_goals = r.home_goals AND t.away_goals = r.away_goals THEN 3
      WHEN
        SIGN(t.home_goals - t.away_goals) = SIGN(r.home_goals - r.away_goals) THEN 1
      ELSE 0
    END
  )                 AS points
FROM public.profiles      p
JOIN auth.users           u  ON u.id = p.id
LEFT JOIN public.tips     t  ON t.user_id = p.id
LEFT JOIN public.match_results r ON r.match_id = t.match_id
GROUP BY p.id, p.username, u.email
ORDER BY points DESC NULLS LAST;
