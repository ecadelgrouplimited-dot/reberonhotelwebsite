'use client';
import { useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { readHousePrefs, type HousePrefs, type MeDTO } from '@reberon/contracts';
import { patch } from './api';
import { useMeQuery } from './providers';
import { APP_BY_HREF, appsFor, defaultPins, type HouseApp } from '@/components/os/apps';

/**
 * The signed-in person's House layout: pinned apps (dock + top of Home), hidden
 * apps, and the dock switch. Changes show at once and save to their account.
 */
export function usePrefs() {
  const qc = useQueryClient();
  const { data: me } = useMeQuery();
  const prefs = readHousePrefs(me?.preferences);

  const save = useMutation({
    mutationFn: (p: HousePrefs) => patch<HousePrefs>('/auth/me/preferences', p),
    onError: () => toast.error('Could not save your layout — it will be kept on this device'),
  });

  const set = useCallback(
    (p: HousePrefs) => {
      qc.setQueryData<MeDTO>(['me'], (old) => (old ? { ...old, preferences: { ...readHousePrefs(old.preferences), ...p } } : old));
      save.mutate(p);
    },
    [qc, save],
  );

  const apps = useMemo(() => (me ? appsFor(me.permissions) : []), [me]);
  const allowed = useMemo(() => new Set(apps.map((a) => a.href)), [apps]);
  const pinned: HouseApp[] = useMemo(() => {
    if (!me) return [];
    const hrefs = prefs.pinned ?? defaultPins(me.role, me.permissions);
    return hrefs.filter((h) => allowed.has(h)).map((h) => APP_BY_HREF.get(h)!).filter(Boolean);
  }, [me, prefs.pinned, allowed]);
  const hidden = useMemo(() => new Set(prefs.hidden ?? []), [prefs.hidden]);

  const isPinned = (href: string) => pinned.some((a) => a.href === href);
  const pin = (href: string) => {
    if (!allowed.has(href) || isPinned(href)) return;
    if (pinned.length >= 14) return toast.info('The dock holds 14 apps — unpin one first');
    set({ pinned: [...pinned.map((a) => a.href), href] });
    toast.success(`${APP_BY_HREF.get(href)?.name ?? 'App'} pinned to the dock`);
  };
  const unpin = (href: string) => set({ pinned: pinned.map((a) => a.href).filter((h) => h !== href) });
  const movePin = (href: string, dir: -1 | 1) => {
    const list = pinned.map((a) => a.href);
    const i = list.indexOf(href);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    set({ pinned: list });
  };
  const reorderPins = (hrefs: string[]) => set({ pinned: hrefs });
  const hide = (href: string) => {
    set({ hidden: [...hidden, href], pinned: pinned.map((a) => a.href).filter((h) => h !== href) });
    toast.success(`${APP_BY_HREF.get(href)?.name ?? 'App'} hidden from Home — find it with search or “Show hidden apps”`);
  };
  const unhideAll = () => set({ hidden: [] });
  const resetLayout = () => set({ pinned: me ? defaultPins(me.role, me.permissions) : [], hidden: [], largeIcons: false, dock: true });

  return {
    ready: !!me,
    prefs,
    apps,
    pinned,
    hidden,
    dock: prefs.dock !== false,
    largeIcons: !!prefs.largeIcons,
    isPinned,
    pin,
    unpin,
    movePin,
    reorderPins,
    hide,
    unhideAll,
    resetLayout,
    set,
  };
}
