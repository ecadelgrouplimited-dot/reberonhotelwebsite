import {
  AlignLeft, BedDouble, BookOpen, Building, CircleHelp, CloudSun, Gift, Hammer, Hash, Images, ListChecks, ListPlus, Map, MapPin, Megaphone, MessageSquare,
  LayoutGrid, MessageCircleHeart, Mountain, Phone, Play, Quote, Rotate3d, Route, SeparatorHorizontal, Sparkles, type LucideIcon,
} from 'lucide-react';

const I: Record<string, LucideIcon> = {
  mountain: Mountain, 'book-open': BookOpen, hash: Hash, 'bed-double': BedDouble, sparkles: Sparkles, building: Building, images: Images, hammer: Hammer,
  map: Map, route: Route, 'cloud-sun': CloudSun, quote: Quote, 'circle-help': CircleHelp, 'map-pin': MapPin, phone: Phone, 'message-square': MessageSquare,
  'list-plus': ListPlus, megaphone: Megaphone, 'list-checks': ListChecks, 'align-left': AlignLeft, 'separator-horizontal': SeparatorHorizontal, gift: Gift, 'rotate-3d': Rotate3d, 'message-circle-heart': MessageCircleHeart,
  'layout-grid': LayoutGrid, play: Play,
};

export function BlockIcon({ name, className }: { name: string; className?: string }) {
  const C = I[name] ?? Sparkles;
  return <C className={className} strokeWidth={1.6} />;
}
