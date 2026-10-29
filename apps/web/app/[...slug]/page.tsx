import { CmsPage, cmsMetadata } from '@/lib/cms-page';
import { api } from '@/lib/api';

export const revalidate = 60;
export const dynamicParams = true;

type Props = { params: Promise<{ slug: string[] }> };

export async function generateStaticParams() {
  const pages = await api.pageIndex().catch(() => []);
  return pages
    .map((p) => p.path.replace(/^\//, ''))
    .filter((p) => p && !/^(rooms|kapchorwa|rising|facilities\/)/.test(p))
    .map((p) => ({ slug: p.split('/') }));
}

export async function generateMetadata({ params }: Props) {
  return cmsMetadata((await params).slug.join('/'));
}

export default async function Page({ params }: Props) {
  return <CmsPage slug={(await params).slug.join('/')} />;
}
