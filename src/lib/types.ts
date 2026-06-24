export interface Business {
  id: string;
  name: string;
  name_en?: string;
  slug: string;
  description?: string;
  category: string;
  subcategory?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  city?: string;
  area?: string;
  lat?: number;
  lng?: number;
  opening_hours?: Record<string, string>;
  social_links?: {
    instagram?: string;
    facebook?: string;
    twitter?: string;
    tiktok?: string;
    whatsapp?: string;
  };
  images: string[];
  logo?: string;
  rating: number;
  review_count: number;
  source: "osm" | "gov" | "scrape" | "user" | "manual";
  source_id?: string;
  verified: boolean;
  claimed: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  business_id: string;
  user_name: string;
  rating: number;
  text: string;
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
  name_en: string;
  slug: string;
  icon: string;
  parent_id?: number;
  business_count: number;
  subcategories?: Category[];
}
