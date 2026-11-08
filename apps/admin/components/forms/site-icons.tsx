'use client';
/* The icons the website can draw (same names as apps/web/components/ui/icon.tsx). */
import {
  Accessibility, Archive, Bath, Bed, BedDouble, BedSingle, BookOpen, Building, CalendarCheck, Car, CircleHelp, Clock, Cloud, CloudSun, Coffee,
  DoorOpen, Droplets, Eye, Flame, Gift, HandCoins, Hash, Hammer, Images, LampDesk, ListChecks, ListOrdered, ListPlus, Lock, Map, MapPin, Megaphone,
  MessageCircle, MessageSquare, Mountain, MountainSnow, Phone, Plug, Presentation, Quote, Route, Shield, ShieldCheck, ShowerHead, Shirt, Sofa,
  Sparkles, Sun, Trees, Tv, Users, Utensils, Wifi, Zap, type LucideIcon,
} from 'lucide-react';

export const SITE_ICONS: Record<string, LucideIcon> = {
  accessibility: Accessibility, archive: Archive, bath: Bath, bed: Bed, 'bed-double': BedDouble, 'bed-single': BedSingle, 'book-open': BookOpen,
  building: Building, 'calendar-check': CalendarCheck, car: Car, 'circle-help': CircleHelp, clock: Clock, cloud: Cloud, 'cloud-sun': CloudSun,
  coffee: Coffee, 'door-open': DoorOpen, droplets: Droplets, eye: Eye, flame: Flame, gift: Gift, 'hand-coins': HandCoins, hash: Hash, hammer: Hammer,
  images: Images, 'lamp-desk': LampDesk, 'list-checks': ListChecks, 'list-ordered': ListOrdered, 'list-plus': ListPlus, lock: Lock, map: Map,
  'map-pin': MapPin, megaphone: Megaphone, 'message-circle': MessageCircle, 'message-square': MessageSquare, mountain: Mountain,
  'mountain-snow': MountainSnow, phone: Phone, plug: Plug, presentation: Presentation, quote: Quote, route: Route, shield: Shield,
  'shield-check': ShieldCheck, 'shower-head': ShowerHead, shirt: Shirt, sofa: Sofa, sparkles: Sparkles, sun: Sun, trees: Trees, tv: Tv,
  users: Users, utensils: Utensils, wifi: Wifi, zap: Zap,
};
