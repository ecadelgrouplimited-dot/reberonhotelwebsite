'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  BellRing,
  CheckCircle2,
  Mail,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Users,
  Volume2,
} from 'lucide-react';
import { ROLE_LABELS } from '@reberon/contracts';
import { ApiError, get, patch } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { PageHeader, Pill, Section, Skeleton } from '@/components/ui/bits';
import {
  playAlertChime,
  triggerManualLiveAlert,
  type NotificationRuleDTO,
  type SoundTone,
} from '@/components/shell/live-alerts';

interface StaffUserSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  jobTitle: string | null;
  customRoleName: string | null;
}

interface NotificationRulesResponse {
  rules: NotificationRuleDTO[];
  staffUsers: StaffUserSummary[];
  currentUser: { id: string; role: string; name: string };
}

const ALL_ROLES = [
  'OWNER',
  'MANAGER',
  'DESK',
  'HOUSEKEEPING',
  'KITCHEN',
  'BAR',
  'ACCOUNTANT',
  'HR',
  'GYM',
] as const;

const SOUND_OPTIONS: { value: SoundTone; label: string }[] = [
  { value: 'booking', label: 'Reception Bell (Ascending 4-Note)' },
  { value: 'checkout', label: 'Check-Out & Turnover Chime' },
  { value: 'pos', label: 'Kitchen / Bar Double Bell' },
  { value: 'register', label: 'Cashier Confirmation Chord' },
  { value: 'urgent', label: 'Urgent Priority Pulse' },
  { value: 'ding', label: 'Single Desk Bell' },
  { value: 'soft', label: 'Gentle Tap' },
];

export default function NotificationSettingsPage() {
  const qc = useQueryClient();
  const can = useCan();
  const editable = can('settings:write');

  const { data, isLoading } = useQuery({
    queryKey: ['notification-rules'],
    queryFn: () => get<NotificationRulesResponse>('/notification-rules'),
  });

  const [rules, setRules] = useState<NotificationRuleDTO[]>([]);
  const [customEmailInput, setCustomEmailInput] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data?.rules) {
      setRules(data.rules);
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => patch('/notification-rules', { rules }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-rules'] });
      qc.invalidateQueries({ queryKey: ['live-console'] });
      toast.success('Notification rules, sound alerts & recipients saved');
    },
    onError: (e) =>
      toast.error(e instanceof ApiError ? e.message : 'Could not save notification rules'),
  });

  const updateRule = (id: string, patchObj: Partial<NotificationRuleDTO>) => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patchObj } : r)));
  };

  const toggleRole = (ruleId: string, role: string) => {
    const target = rules.find((r) => r.id === ruleId);
    if (!target) return;
    const exists = target.roles.includes(role);
    updateRule(ruleId, {
      roles: exists ? target.roles.filter((x) => x !== role) : [...target.roles, role],
    });
  };

  const toggleUserRecipient = (ruleId: string, userId: string) => {
    const target = rules.find((r) => r.id === ruleId);
    if (!target) return;
    const exists = target.recipientUserIds.includes(userId);
    updateRule(ruleId, {
      recipientUserIds: exists
        ? target.recipientUserIds.filter((x) => x !== userId)
        : [...target.recipientUserIds, userId],
    });
  };

  const addCustomEmail = (ruleId: string) => {
    const email = (customEmailInput[ruleId] ?? '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      toast.error('Enter a valid email address');
      return;
    }
    const target = rules.find((r) => r.id === ruleId);
    if (!target) return;
    if (!target.customEmails.includes(email)) {
      updateRule(ruleId, { customEmails: [...target.customEmails, email] });
    }
    setCustomEmailInput((prev) => ({ ...prev, [ruleId]: '' }));
  };

  const removeCustomEmail = (ruleId: string, email: string) => {
    const target = rules.find((r) => r.id === ruleId);
    if (!target) return;
    updateRule(ruleId, { customEmails: target.customEmails.filter((e) => e !== email) });
  };

  if (isLoading || !data) return <Skeleton className="h-96" />;

  return (
    <div className="fade-in space-y-5 pb-12">
      <PageHeader
        crumbs={[
          { label: 'Settings', href: '/settings' },
          { label: 'Notifications & Recipients' },
        ]}
        title="Important Notifications, Live Pop-Ups & Recipients"
        description="Configure real-time screen pop-up alerts, distinct audio chimes, and automated email routing for Front Desk, Head of Housekeeping, POS, and Hotel Hierarchy."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon={<Volume2 className="size-3.5" />}
              onClick={() =>
                triggerManualLiveAlert({
                  ruleLabel: 'Live Pop-Up & Audio Verification',
                  summary:
                    'New Booking RB-2026 & Check-Out Turnover alerts are active with audio chimes.',
                  urgency: 'HIGH',
                  soundTone: 'booking',
                })
              }
            >
              Test Live Pop-Up & Sound
            </Button>
            <Link href="/settings">
              <Button size="sm" variant="ghost">
                Hotel Settings
              </Button>
            </Link>
            {editable && (
              <Button
                size="sm"
                variant="primary"
                icon={<Save className="size-3.5" />}
                loading={saveMut.isPending}
                onClick={() => saveMut.mutate()}
              >
                Save Notification Rules
              </Button>
            )}
          </div>
        }
      />

      {/* Quick Summary Banner */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card flex items-center gap-3 p-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#1A1E43] text-white dark:bg-[#D76E1B]">
            <BellRing className="size-5" />
          </span>
          <div>
            <p className="text-xs font-bold text-fg">Live Screen Pop-Up Banners</p>
            <p className="text-[11.5px] text-fg-muted">
              {rules.filter((r) => r.popupEnabled).length} of {rules.length} operational triggers active
            </p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#D76E1B]/15 text-[#D76E1B]">
            <Volume2 className="size-5" />
          </span>
          <div>
            <p className="text-xs font-bold text-fg">Distinct Web-Audio Chimes</p>
            <p className="text-[11.5px] text-fg-muted">
              {rules.filter((r) => r.soundEnabled).length} rules with custom department tones
            </p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-success">
            <Mail className="size-5" />
          </span>
          <div>
            <p className="text-xs font-bold text-fg">Hierarchy & Dept Email Dispatch</p>
            <p className="text-[11.5px] text-fg-muted">
              Sent automatically via alerts@reberonhotel.com
            </p>
          </div>
        </div>
      </div>

      {/* Rules Matrix */}
      <div className="grid gap-4">
        {rules.map((rule) => {
          const isCrit = rule.urgency === 'CRITICAL';
          const isHigh = rule.urgency === 'HIGH';

          return (
            <Section
              key={rule.id}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <span>{rule.label}</span>
                  <Pill
                    tone={isCrit ? 'red' : isHigh ? 'amber' : 'green'}
                    dot
                  >
                    {rule.urgency}
                  </Pill>
                  <span className="rounded bg-surface-2 px-2 py-0.5 font-mono text-[10.5px] text-fg-subtle">
                    {rule.category}
                  </span>
                </span>
              }
              description={rule.description}
              actions={
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Sparkles className="size-3.5" />}
                  onClick={() => {
                    playAlertChime(rule.soundTone);
                    triggerManualLiveAlert({
                      ruleId: rule.id,
                      ruleLabel: rule.label,
                      category: rule.category,
                      urgency: rule.urgency,
                      summary: `Test alert for "${rule.label}" — routed to ${rule.roles.join(', ')}`,
                      soundEnabled: rule.soundEnabled,
                      soundTone: rule.soundTone,
                    });
                  }}
                >
                  Preview Pop-Up & Chime
                </Button>
              }
            >
              <div className="grid gap-4 lg:grid-cols-12">
                {/* Left 5 cols: Delivery Channels & Sound Tone */}
                <div className="space-y-3 rounded-xl border border-line bg-surface-2/40 p-3.5 lg:col-span-5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle">
                    1. Alert Channels & Sound Chime
                  </p>

                  <div className="grid gap-2 text-xs">
                    <label className="flex cursor-pointer items-center justify-between rounded-lg border border-line bg-surface px-3 py-2">
                      <span className="font-semibold text-fg">Live Screen Pop-Up Banner</span>
                      <input
                        type="checkbox"
                        checked={rule.popupEnabled}
                        disabled={!editable}
                        onChange={(e) =>
                          updateRule(rule.id, { popupEnabled: e.target.checked })
                        }
                        className="size-4 accent-[#D76E1B]"
                      />
                    </label>

                    <label className="flex cursor-pointer items-center justify-between rounded-lg border border-line bg-surface px-3 py-2">
                      <span className="font-semibold text-fg">Play Audio Alert Chime</span>
                      <input
                        type="checkbox"
                        checked={rule.soundEnabled}
                        disabled={!editable}
                        onChange={(e) =>
                          updateRule(rule.id, { soundEnabled: e.target.checked })
                        }
                        className="size-4 accent-[#D76E1B]"
                      />
                    </label>

                    {rule.soundEnabled && (
                      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
                        <span className="shrink-0 text-[11.5px] font-medium text-fg-muted">
                          Chime Tone:
                        </span>
                        <select
                          value={rule.soundTone}
                          disabled={!editable}
                          onChange={(e) => {
                            const nextTone = e.target.value as SoundTone;
                            updateRule(rule.id, { soundTone: nextTone });
                            playAlertChime(nextTone);
                          }}
                          className="input !h-7 !min-h-0 flex-1 py-0 text-xs"
                        >
                          {SOUND_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <label className="flex cursor-pointer items-center justify-between rounded-lg border border-line bg-surface px-3 py-2">
                      <span className="font-semibold text-fg">
                        Automated Email to Recipients
                      </span>
                      <input
                        type="checkbox"
                        checked={rule.emailEnabled}
                        disabled={!editable}
                        onChange={(e) =>
                          updateRule(rule.id, { emailEnabled: e.target.checked })
                        }
                        className="size-4 accent-[#D76E1B]"
                      />
                    </label>
                  </div>
                </div>

                {/* Right 7 cols: Target Roles, Specific Staff / Heads of Department, and Custom Emails */}
                <div className="space-y-3.5 rounded-xl border border-line bg-surface-2/25 p-3.5 lg:col-span-7">
                  <div>
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-fg-subtle">
                      2. Hotel Hierarchy & Department Roles Notified
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_ROLES.map((roleKey) => {
                        const active = rule.roles.includes(roleKey);
                        return (
                          <button
                            key={roleKey}
                            type="button"
                            disabled={!editable}
                            onClick={() => toggleRole(rule.id, roleKey)}
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold transition',
                              active
                                ? 'border-[#1A1E43] bg-[#1A1E43] text-white dark:border-[#D76E1B] dark:bg-[#D76E1B]'
                                : 'border-line bg-surface text-fg-muted hover:border-line-strong hover:text-fg',
                            )}
                          >
                            {active && <CheckCircle2 className="size-3" />}
                            <span>{ROLE_LABELS[roleKey] ?? roleKey}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Specific Staff / Heads of Department */}
                  <div className="border-t border-line pt-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-fg-subtle">
                        3. Specific Heads of Department / Named Staff Recipients
                      </p>
                      <span className="text-[11px] text-fg-muted">
                        <Users className="mr-1 inline size-3" />
                        {rule.recipientUserIds.length} pinned staff
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {data.staffUsers.map((u) => {
                        const selected = rule.recipientUserIds.includes(u.id);
                        return (
                          <button
                            key={u.id}
                            type="button"
                            disabled={!editable}
                            onClick={() => toggleUserRecipient(rule.id, u.id)}
                            className={cn(
                              'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] transition',
                              selected
                                ? 'border-[#D76E1B] bg-[#D76E1B]/15 font-bold text-[#D76E1B]'
                                : 'border-line bg-surface text-fg-muted hover:text-fg',
                            )}
                            title={`${u.jobTitle || u.role} · ${u.email || 'No email'}`}
                          >
                            <span>{u.name}</span>
                            <span className="text-[10px] opacity-75">
                              ({u.jobTitle || (ROLE_LABELS as Record<string, string>)[u.role] || u.role})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Additional Custom Email Recipients */}
                  <div className="border-t border-line pt-3">
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-fg-subtle">
                      4. Additional External / Direct Email Recipients
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        className="input !h-8 !min-h-0 max-w-xs flex-1 text-xs"
                        placeholder="Add email (e.g. housekeeping.head@reberonhotel.com)…"
                        value={customEmailInput[rule.id] ?? ''}
                        disabled={!editable}
                        onChange={(e) =>
                          setCustomEmailInput((prev) => ({
                            ...prev,
                            [rule.id]: e.target.value,
                          }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addCustomEmail(rule.id);
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Plus className="size-3.5" />}
                        disabled={!editable}
                        onClick={() => addCustomEmail(rule.id)}
                      >
                        Add Recipient
                      </Button>
                    </div>
                    {rule.customEmails.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {rule.customEmails.map((em) => (
                          <span
                            key={em}
                            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-0.5 font-mono text-[11px] text-fg"
                          >
                            {em}
                            {editable && (
                              <button
                                type="button"
                                onClick={() => removeCustomEmail(rule.id, em)}
                                className="text-fg-subtle hover:text-danger"
                              >
                                <Trash2 className="size-3" />
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Section>
          );
        })}
      </div>
    </div>
  );
}
