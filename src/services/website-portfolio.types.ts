/**
 * LiveDemo mirrors the interface in brandlifters-website/src/lib/data/portfolio.ts.
 * Keep these two in sync if you add/remove fields.
 */
export interface LiveDemo {
  id: string;
  industry: string;
  name: string;
  description: string;
  features: string[];
  tags?: string[];
  demoUrl: string;
  thumbnailUrl: string;
  accentFrom: string;
  accentTo: string;
  publishedAt: string;
  isCustomerSite?: boolean;
}
