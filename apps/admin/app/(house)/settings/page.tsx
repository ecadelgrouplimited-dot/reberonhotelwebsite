'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Building2, CircleAlert, CircleCheck, FileText, KeyRound, Lock,
  Mail, PlugZap, Send, Settings2, Share2, ShieldCheck,
} from 'lucide-react';
import { INTEGRATIONS, type IntegrationDTO } from '@reberon/contracts';
import { ApiError, get, patch, post, put } from '@/lib/api';
import { useCan } from '@/lib/providers';
import { ago } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { PageHeader, Pill, Section, Skeleton, Tabs } from '@/components/ui/bits';
import { FieldRenderer, type AdminFieldDef } from '@/components/forms/field-renderer';
import { FieldShell, Switch, TextInput } from '@/components/ui/field';

type Settings = Record<string, { value: unknown; group: string }>;

const GENERAL_SECTIONS: { title: string; description: string; fields: AdminFieldDef[] }[] = [
  {
    title: 'Hotel Identity',
    description: 'Core name, tagline, and brand elements displayed across reberonhotel.com.',
    fields: [
      { kind: 'group', label: '', fields: [{ kind: 'text', name: 'hotel.name', label: 'Hotel name', required: true }, { kind: 'ltext', name: 'hotel.openingLabel', label: 'Opening badge', help: 'e.g. “Opening 2027”' }] },
      { kind: 'ltext', name: 'hotel.tagline', label: 'Tagline' },
      { kind: 'ltext', name: 'hotel.footerNote', label: 'Footer note' },
      { kind: 'media', name: 'hotel.logoId', label: 'Logo (optional)', help: 'Defaults to the Reberon wordmark.' },
    ],
  },
  {
    title: 'Contact & Front Desk Hours',
    description: 'Displayed in the website header, footer, contact page, and email acknowledgements.',
    fields: [
      { kind: 'group', label: '', fields: [{ kind: 'text', name: 'contact.whatsapp', label: 'WhatsApp number', help: '+256 7…' }, { kind: 'text', name: 'contact.email', label: 'Official reception email' }] },
      { kind: 'ltext', name: 'contact.address', label: 'Physical address' },
      { kind: 'group', label: '', fields: [{ kind: 'ltext', name: 'contact.hours', label: 'Front desk hours' }, { kind: 'ltext', name: 'contact.responsePromise', label: 'Enquiry reply promise' }] },
      { kind: 'group', label: '', fields: [{ kind: 'text', name: 'hotel.checkInTime', label: 'Check-in from', placeholder: '14:00' }, { kind: 'text', name: 'hotel.checkOutTime', label: 'Check-out by', placeholder: '10:30' }] },
    ],
  },
];

const RECEIPT_SEO_SECTIONS: { title: string; description: string; fields: AdminFieldDef[] }[] = [
  {
    title: 'Receipts, Tax & Invoicing',
    description: 'Printed on every official receipt, proforma invoice, quotation, and refund voucher.',
    fields: [
      { kind: 'group', label: '', fields: [{ kind: 'text', name: 'hotel.legalName', label: 'Registered company name' }, { kind: 'text', name: 'receipts.tin', label: 'TIN (Tax Identification Number)' }] },
      { kind: 'boolean', name: 'receipts.vatRegistered', label: 'VAT registered (show 18% VAT breakdown on invoices)' },
      { kind: 'text', name: 'receipts.footer', label: 'Receipt footer note' },
      { kind: 'select', name: 'receipts.paper', label: 'Default print format', options: [{ value: 'A4', label: 'A4 Full Tax Receipt' }, { value: '80MM', label: '80mm Thermal POS Slip' }] },
    ],
  },
  {
    title: 'SEO & Social Sharing Defaults',
    description: 'Default metadata for search engines and WhatsApp/social link previews.',
    fields: [
      { kind: 'group', label: '', fields: [{ kind: 'text', name: 'seo.defaultTitle', label: 'Home page title' }, { kind: 'text', name: 'seo.titleTemplate', label: 'Title pattern', help: '%s is replaced by page title' }] },
      { kind: 'ltext', name: 'seo.defaultDescription', label: 'Default meta description', multiline: true },
      { kind: 'media', name: 'seo.shareImageId', label: 'Default OpenGraph share image' },
    ],
  },
];

const FEATURES: [string, string, string][] = [
  ['features.maintenanceMode', 'Under Maintenance / Coming Soon Gate', 'Require staff/admin sign-in to view the public website. Visitors without a session see the Coming Soon page with a Sign In option.'],
  ['features.waitlistEnabled', 'First-stay waitlist', 'Show the first-stay registration form across the website.'],
  ['features.progressEnabled', 'Construction journal', 'Publish construction milestones on the public progress page.'],
  ['features.bookingEnabled', 'Live online booking', 'Switch public CTAs from waitlist to instant room booking.'],
  ['features.toursEnabled', '360° virtual tours', 'Display interactive room walkthroughs where available.'],
  ['features.stayOtp', 'SMS OTP for guest lookup', 'Require a 6-digit SMS code when guests look up a booking online.'],
];

const SOCIAL_KEYS: [string, string, string][] = [
  ['tiktok', 'TikTok URL', 'https://tiktok.com/@reberonhotel'],
  ['instagram', 'Instagram URL', 'https://instagram.com/reberonhotel'],
  ['facebook', 'Facebook URL', 'https://facebook.com/reberonhotel'],
  ['x', 'X (Twitter) URL', 'https://x.com/reberonhotel'],
];

export default function SettingsPage() {
  const qc = useQueryClient();
  const can = useCan();
  const [tab, setTab] = useState<'general' | 'email' | 'receipts'>('general');
  const { data } = useQuery({ queryKey: ['settings'], queryFn: () => get<Settings>('/settings') });
  const { data: integrations } = useQuery({
    queryKey: ['integrations'],
    queryFn: () => get<IntegrationDTO[]>('/integrations'),
    enabled: can('vault:manage'),
  });

  const [v, setV] = useState<Record<string, unknown>>({});
  useEffect(() => {
    if (data) setV(Object.fromEntries(Object.entries(data).map(([k, s]) => [k, s.value])));
  }, [data]);

  const original = data ? Object.fromEntries(Object.entries(data).map(([k, s]) => [k, s.value])) : {};
  const changed = Object.fromEntries(Object.entries(v).filter(([k, x]) => JSON.stringify(x) !== JSON.stringify(original[k])));

  const save = useMutation({
    mutationFn: () => patch<Settings>('/settings', changed),
    onSuccess: (d) => {
      qc.setQueryData(['settings'], d);
      toast.success('Settings saved & live on reberonhotel.com');
    },
    onError: (e) => toast.error(e instanceof ApiError ? (e.errors[0]?.message ?? e.message) : 'Could not save settings'),
  });

  if (!data) return <Skeleton className="h-96" />;
  const editable = can('settings:write');
  const n = Object.keys(changed).length;
  const smtpRow = integrations?.find((i) => i.kind === 'SMTP');
  const socialObj = (v['social'] && typeof v['social'] === 'object' ? (v['social'] as Record<string, string>) : {}) ?? {};

  return (
    <div className="fade-in space-y-5">
      <PageHeader
        title="Settings & Notification Hub"
        description="Configure hotel identity, official reberonhotel.com contact details, SMTP email delivery (alerts@reberonhotel.com), receipt headers, and website modules."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/settings/users"><Button size="sm" variant="secondary">People & Access</Button></Link>
            <Link href="/settings/messages"><Button size="sm" variant="secondary">Email Templates</Button></Link>
            <Link href="/settings/integrations"><Button size="sm" variant="secondary"><PlugZap className="size-3.5" /> All Integrations</Button></Link>
            {editable && (
              <Button variant="primary" size="sm" disabled={!n} loading={save.isPending} onClick={() => save.mutate()}>
                {n ? `Save ${n} change${n > 1 ? 's' : ''}` : 'All changes saved'}
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-3.5">
          <div className="text-[11px] font-medium text-fg-muted">Official Domain</div>
          <div className="mt-0.5 text-[15px] font-bold text-fg">reberonhotel.com</div>
          <div className="mt-0.5 text-[11px] text-fg-subtle">Primary web & staff domain</div>
        </div>
        <div className="card p-3.5">
          <div className="text-[11px] font-medium text-fg-muted">Default Alert Sender</div>
          <div className="mt-0.5 text-[15px] font-bold text-fg">alerts@reberonhotel.com</div>
          <div className="mt-0.5 text-[11px] text-fg-subtle">All outbound notifications</div>
        </div>
        <div className="card p-3.5">
          <div className="text-[11px] font-medium text-fg-muted">SMTP Status</div>
          <div className="mt-0.5 text-[15px] font-bold text-fg">
            {smtpRow ? (smtpRow.source !== 'NONE' ? (smtpRow.enabled ? 'Connected' : 'Standby') : 'Local / Env') : 'Active'}
          </div>
          <div className="mt-0.5 text-[11px] text-fg-subtle">
            {smtpRow?.lastTest ? `Last tested ${ago(smtpRow.lastTest.at)}` : 'Ready for alerts & credentials'}
          </div>
        </div>
        <div className="card p-3.5">
          <div className="text-[11px] font-medium text-fg-muted">Staff Alert Recipients</div>
          <div className="mt-0.5 text-[15px] font-bold text-fg">{((v['notifications.staffEmails'] as string[]) ?? []).length}</div>
          <div className="mt-0.5 truncate text-[11px] text-fg-subtle">
            {((v['notifications.staffEmails'] as string[]) ?? ['alerts@reberonhotel.com']).join(', ')}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'general', label: 'General, Contact & Social' },
            { value: 'email', label: 'Email, SMTP & Notifications' },
            { value: 'receipts', label: 'Receipts, SEO & Feature Flags' },
          ]}
        />
        {n > 0 && (
          <span className="text-[12px] font-medium text-warning">
            {n} unsaved setting change{n > 1 ? 's' : ''} — click Save in the top bar
          </span>
        )}
      </div>

      {tab === 'general' && (
        <fieldset disabled={!editable} className="grid gap-5 xl:grid-cols-2">
          {GENERAL_SECTIONS.map((s) => (
            <Section key={s.title} title={s.title} description={s.description}>
              <FieldRenderer fields={s.fields} value={v} onChange={setV} />
            </Section>
          ))}

          <Section title="Phone Lines" description="Shown in the website contact bar and printed on receipts (one number per line).">
            <FieldShell label="Official phone numbers">
              <textarea
                className="input font-mono text-[12.5px]"
                rows={4}
                placeholder="+256 768 262409"
                value={((v['contact.phones'] as string[]) ?? []).join('\n')}
                onChange={(e) => setV({ ...v, 'contact.phones': e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })}
              />
            </FieldShell>
          </Section>

          <Section title="Social Channels" description="Official social media links shown in the website footer.">
            <div className="grid gap-3 sm:grid-cols-2">
              {SOCIAL_KEYS.map(([key, label, placeholder]) => (
                <TextInput
                  key={key}
                  label={label}
                  placeholder={placeholder}
                  value={socialObj[key] ?? ''}
                  onChange={(e) => setV({ ...v, social: { ...socialObj, [key]: e.target.value } })}
                />
              ))}
            </div>
          </Section>
        </fieldset>
      )}

      {tab === 'email' && (
        <div className="grid gap-5 xl:grid-cols-12">
          <div className="xl:col-span-7">
            {can('vault:manage') && smtpRow ? (
              <SmtpConfigCard row={smtpRow} />
            ) : (
              <Section title="SMTP Server Configuration" description="Outbound mail transport for alerts@reberonhotel.com.">
                <p className="text-[13px] text-fg-muted">
                  Only Super Admin / Owner accounts with <code className="font-mono">vault:manage</code> permission can modify encrypted SMTP credentials.
                </p>
              </Section>
            )}
          </div>

          <fieldset disabled={!editable} className="space-y-5 xl:col-span-5">
            <Section
              title="Notification Routing & Alert Recipients"
              description="Control which official email addresses receive instant booking alerts, guest enquiries, and daily operational briefs."
              actions={
                editable && n > 0 ? (
                  <Button size="sm" variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
                    Save Routing
                  </Button>
                ) : undefined
              }
            >
              <div className="grid gap-4">
                <FieldShell
                  label="Staff Alert Emails (one per line)"
                  hint="Every new reservation, guest enquiry, and payment alert is dispatched to these addresses from alerts@reberonhotel.com."
                >
                  <textarea
                    className="input font-mono text-[12.5px]"
                    rows={4}
                    placeholder="alerts@reberonhotel.com&#10;info@reberonhotel.com"
                    value={((v['notifications.staffEmails'] as string[]) ?? []).join('\n')}
                    onChange={(e) =>
                      setV({
                        ...v,
                        'notifications.staffEmails': e.target.value
                          .split('\n')
                          .map((x) => x.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </FieldShell>

                <TextInput
                  label="Daily Owner Brief Delivery Time (EAT)"
                  placeholder="19:00"
                  hint="24-hour Africa/Kampala time (e.g. 19:00) for automated evening revenue & occupancy summary."
                  value={String(v['notifications.ownerBriefTime'] ?? '19:00')}
                  onChange={(e) => setV({ ...v, 'notifications.ownerBriefTime': e.target.value })}
                />

                <div className="rounded-lg border border-border bg-surface-2/60 p-3.5 text-[12px] leading-relaxed text-fg-muted">
                  <div className="font-semibold text-fg">Active Automated Notification Flows</div>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4">
                    <li><b>Staff Credentials & Password Resets:</b> Sent immediately when Super Admin creates a user or resets a password with email notification enabled.</li>
                    <li><b>Booking Confirmations & Receipts:</b> Sent to the guest and copied to <code className="font-mono text-fg">alerts@reberonhotel.com</code>.</li>
                    <li><b>Website Enquiries & Waitlist:</b> Guest receives instant acknowledgement; staff alert recipients receive the full enquiry details.</li>
                  </ul>
                </div>
              </div>
            </Section>
          </fieldset>
        </div>
      )}

      {tab === 'receipts' && (
        <fieldset disabled={!editable} className="grid gap-5 xl:grid-cols-2">
          {RECEIPT_SEO_SECTIONS.map((s) => (
            <Section key={s.title} title={s.title} description={s.description}>
              <FieldRenderer fields={s.fields} value={v} onChange={setV} />
            </Section>
          ))}

          <Section
            title="Website Feature Flags"
            description={can('settings:features') ? 'Toggle public website capabilities immediately.' : 'Owner permission required to toggle website feature flags.'}
          >
            <div className="grid gap-4">
              {FEATURES.map(([k, label, hint]) => (
                <Switch
                  key={k}
                  label={
                    <span className="flex items-center gap-1.5">
                      {label}
                      {!can('settings:features') && <Lock className="size-3" />}
                    </span>
                  }
                  hint={hint}
                  checked={!!v[k]}
                  disabled={!can('settings:features')}
                  onChange={(x) => setV({ ...v, [k]: x })}
                />
              ))}
            </div>
          </Section>
        </fieldset>
      )}
    </div>
  );
}

function SmtpConfigCard({ row }: { row: IntegrationDTO }) {
  const qc = useQueryClient();
  const def = INTEGRATIONS.find((d) => d.kind === 'SMTP')!;
  const [enabled, setEnabled] = useState(row.enabled);
  const [mode, setMode] = useState(row.mode);
  const [values, setValues] = useState<Record<string, string>>({});
  const [testRecipient, setTestRecipient] = useState('alerts@reberonhotel.com');

  useEffect(() => {
    setEnabled(row.enabled);
    setMode(row.mode);
    setValues(
      Object.fromEntries(
        def.fields.map((f) => [
          f.name,
          f.secret
            ? ''
            : (row.config[f.name] ??
              (f.name === 'from'
                ? 'Reberon Hotel <alerts@reberonhotel.com>'
                : f.name === 'user'
                  ? 'alerts@reberonhotel.com'
                  : f.name === 'port'
                    ? '587'
                    : '')),
        ]),
      ),
    );
  }, [row, def]);

  const dirty =
    enabled !== row.enabled ||
    mode !== row.mode ||
    def.fields.some((f) => (f.secret ? !!values[f.name] : (values[f.name] ?? '') !== (row.config[f.name] ?? '')));

  const save = useMutation({
    mutationFn: () => put<IntegrationDTO[]>('/integrations/SMTP', { enabled, mode, values }),
    onSuccess: (d) => {
      qc.setQueryData(['integrations'], d);
      toast.success('SMTP configuration saved and encrypted');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not save SMTP settings'),
  });

  const testConn = useMutation({
    mutationFn: () => post<{ ok: boolean; message: string }>('/integrations/SMTP/test'),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['integrations'] });
      (r.ok ? toast.success : toast.error)(r.message, { duration: 6000 });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'SMTP verification failed'),
  });

  const sendTestEmail = useMutation({
    mutationFn: () => post<{ ok: boolean; message: string }>('/integrations/SMTP/test-email', { to: testRecipient }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['integrations'] });
      (r.ok ? toast.success : toast.error)(r.message, { duration: 7000 });
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not send test email'),
  });

  const connected = row.source !== 'NONE';

  return (
    <Section
      title="Outbound Email Server (SMTP)"
      description="Encrypted credentials for sending booking confirmations, receipts, staff access credentials, and alerts from alerts@reberonhotel.com."
      actions={
        connected ? (
          <Pill tone={row.source === 'VAULT' && row.mode === 'LIVE' ? 'green' : 'blue'} dot>
            {row.source === 'ENVIRONMENT' ? 'Server Default' : row.mode === 'LIVE' ? 'Live SMTP' : 'Test Mode'}
          </Pill>
        ) : (
          <Pill dot>Not configured</Pill>
        )
      }
    >
      <div className="grid gap-3.5">
        <div className="grid gap-3.5 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <TextInput
              label="SMTP Host"
              placeholder="smtp.zoho.com or mail.reberonhotel.com"
              value={values.host ?? ''}
              onChange={(e) => setValues({ ...values, host: e.target.value })}
            />
          </div>
          <TextInput
            label="SMTP Port"
            placeholder="587 (STARTTLS) or 465 (SSL)"
            value={values.port ?? ''}
            onChange={(e) => setValues({ ...values, port: e.target.value })}
          />
        </div>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <TextInput
            label="SMTP Username"
            placeholder="alerts@reberonhotel.com"
            value={values.user ?? ''}
            onChange={(e) => setValues({ ...values, user: e.target.value })}
          />
          <TextInput
            label={
              <span className="flex items-center gap-1.5">
                SMTP Password / App Password <KeyRound className="size-3 text-fg-subtle" />
              </span>
            }
            type="password"
            autoComplete="new-password"
            placeholder={row.secrets.pass ? `Stored (ends in ${row.secrets.pass}) — leave blank to keep` : 'Enter SMTP password'}
            value={values.pass ?? ''}
            onChange={(e) => setValues({ ...values, pass: e.target.value })}
          />
        </div>

        <TextInput
          label="Default From Address & Display Name"
          placeholder="Reberon Hotel <alerts@reberonhotel.com>"
          hint="All system emails and staff alerts are sent from this address by default."
          value={values.from ?? ''}
          onChange={(e) => setValues({ ...values, from: e.target.value })}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-2/50 p-3">
          <Switch
            label="Enable Custom SMTP Server"
            hint={
              enabled
                ? 'Active: Using these encrypted SMTP credentials for all emails.'
                : 'Off: Falling back to the server environment mail relay.'
            }
            checked={enabled}
            onChange={setEnabled}
          />
          <div className="flex items-center gap-1 rounded-md bg-surface p-1 border border-border">
            {(['TEST', 'LIVE'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  'h-7 rounded px-2.5 text-[11.5px] font-semibold transition',
                  mode === m ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:text-fg',
                )}
              >
                {m === 'TEST' ? 'Test Mode' : 'Live Delivery'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          <Button variant="primary" size="sm" loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>
            Save SMTP Settings
          </Button>
          <Button size="sm" variant="secondary" loading={testConn.isPending} disabled={dirty} onClick={() => testConn.mutate()}>
            Verify Handshake
          </Button>
          {row.lastTest && (
            <span
              className={cn('flex items-center gap-1.5 text-[12px]', row.lastTest.ok ? 'text-success' : 'text-danger')}
              title={row.lastTest.message}
            >
              {row.lastTest.ok ? <CircleCheck className="size-3.5" /> : <CircleAlert className="size-3.5" />}
              <span className="max-w-[20rem] truncate">
                {row.lastTest.ok ? 'Verified' : 'Error'} {ago(row.lastTest.at)}: {row.lastTest.message}
              </span>
            </span>
          )}
        </div>

        <div className="mt-2 border-t border-border pt-3.5">
          <div className="mb-2 text-[12px] font-semibold text-fg">Send Live Diagnostic Email</div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="email"
              className="input flex-1 text-[12.5px]"
              placeholder="Recipient email (e.g. alerts@reberonhotel.com)"
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
            />
            <Button
              size="sm"
              variant="dark"
              loading={sendTestEmail.isPending}
              disabled={!testRecipient.trim() || dirty}
              onClick={() => sendTestEmail.mutate()}
            >
              <Send className="size-3.5" /> Send Test Email
            </Button>
          </div>
          {dirty && (
            <p className="mt-1 text-[11px] text-warning">Save your SMTP changes above before sending a test email.</p>
          )}
        </div>
      </div>
    </Section>
  );
}
