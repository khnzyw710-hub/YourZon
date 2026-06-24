-- YourZon Database Schema
-- Run this in Supabase SQL Editor to create all tables

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  name_en TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  icon TEXT,
  parent_id INTEGER REFERENCES categories(id),
  business_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Businesses table
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  name_en TEXT,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  subcategory TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  address TEXT,
  city TEXT,
  area TEXT,
  lat DECIMAL(10, 7),
  lng DECIMAL(10, 7),
  opening_hours JSONB DEFAULT '{}',
  social_links JSONB DEFAULT '{}',
  images TEXT[] DEFAULT '{}',
  logo TEXT,
  rating DECIMAL(2, 1) DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT,
  verified BOOLEAN DEFAULT FALSE,
  claimed BOOLEAN DEFAULT FALSE,
  claimed_by UUID,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reviews table
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_businesses_category ON businesses(category);
CREATE INDEX IF NOT EXISTS idx_businesses_city ON businesses(city);
CREATE INDEX IF NOT EXISTS idx_businesses_slug ON businesses(slug);
CREATE INDEX IF NOT EXISTS idx_businesses_rating ON businesses(rating DESC);
CREATE INDEX IF NOT EXISTS idx_businesses_source ON businesses(source);
CREATE INDEX IF NOT EXISTS idx_businesses_name_trgm ON businesses USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_reviews_business ON reviews(business_id);

-- Enable trigram extension for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Full text search index
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(city, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(category, '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'D')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_businesses_fts ON businesses USING gin(fts);

-- Function to update rating when review is added
CREATE OR REPLACE FUNCTION update_business_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE businesses SET
    rating = (SELECT ROUND(AVG(rating)::numeric, 1) FROM reviews WHERE business_id = NEW.business_id),
    review_count = (SELECT COUNT(*) FROM reviews WHERE business_id = NEW.business_id),
    updated_at = NOW()
  WHERE id = NEW.business_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_update_rating
AFTER INSERT OR DELETE ON reviews
FOR EACH ROW EXECUTE FUNCTION update_business_rating();

-- Function to auto-generate slug
CREATE OR REPLACE FUNCTION generate_slug()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := lower(replace(replace(NEW.name, ' ', '-'), '"', '')) || '-' || substr(NEW.id::text, 1, 8);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_generate_slug
BEFORE INSERT ON businesses
FOR EACH ROW EXECUTE FUNCTION generate_slug();

-- RLS Policies (Row Level Security)
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON businesses FOR SELECT USING (true);
CREATE POLICY "Service role insert" ON businesses FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role update" ON businesses FOR UPDATE USING (true);

CREATE POLICY "Public read reviews" ON reviews FOR SELECT USING (true);
CREATE POLICY "Anyone can add reviews" ON reviews FOR INSERT WITH CHECK (true);
