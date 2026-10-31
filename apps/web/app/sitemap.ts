import type { MetadataRoute } from 'next';
import { api } from '@/lib/api';
import { WEB_URL } from '@/lib/seo';

export const revalidate = 60;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages = await api.pageIndex().catch(() => []);
  const entries: MetadataRoute.Sitemap = pages.map((p) => ({
    url: `${WEB_URL}${p.path === '/' ? '' : p.path}`,
    lastModified: p.updatedAt,
    changeFrequency: p.path.startsWith('/rising') ? 'monthly' : 'weekly',
    priority: p.path === '/' ? 1 : p.path.split('/').length === 2 ? 0.8 : 0.6,
  }));
  if (!entries.some((e) => e.url.endsWith('/concierge'))) {
    entries.push({
      url: `${WEB_URL}/concierge`,
      lastModified: new Date().toISOString(),
      changeFrequency: 'weekly',
      priority: 0.9,
    });
  }
  return entries;
}
