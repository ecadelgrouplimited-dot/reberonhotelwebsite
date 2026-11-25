import { CmsPage, cmsMetadata } from '@/lib/cms-page';

export const revalidate = 60;
export const generateMetadata = () => cmsMetadata('events');

export default function Page() {
  return <CmsPage slug="events" />;
}
