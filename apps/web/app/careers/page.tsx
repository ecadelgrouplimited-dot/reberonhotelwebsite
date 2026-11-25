import { CmsPage, cmsMetadata } from '@/lib/cms-page';

export const revalidate = 60;
export const generateMetadata = () => cmsMetadata('careers');

export default function Page() {
  return <CmsPage slug="careers" />;
}
