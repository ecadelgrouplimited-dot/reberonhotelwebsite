'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CircleAlert, CircleCheck, KeyRound, PlugZap, Send, ShieldCheck } from 'lucide-react';
import { INTEGRATIONS, type IntegrationDef, type IntegrationDTO } from '@reberon/contracts';
import { ApiError, get, post, put } from '@/lib/api';
import { ago } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { PageHeader, Pill, Skeleton } from '@/components/ui/bits';
import { Switch, TextInput } from '@/components/ui/field';
import { useConfirm } from '@/components/ui/confirm';

export default function IntegrationsPage() {
  const { data } = useQuery({ queryKey: ['integrations'], queryFn: () => get<IntegrationDTO[]>('/integrations') });
  return (
    <div className="fade-in">
      <PageHeader
        title="Integrations & Gateways"
        description="Encrypted credentials for SMTP email (alerts@reberonhotel.com), Pesapal payments, Africa's Talking SMS, and WhatsApp Business."
      />
      <p className="mb-5 flex items-center gap-2 text-[12.5px] text-fg-muted"><ShieldCheck className="size-4 text-success" /> Owner only. Secrets are AES-256-GCM encrypted in the database and never exposed in full.</p>
      <div className="grid gap-5 xl:grid-cols-2">
        {!data && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-80" />)}
        {data && INTEGRATIONS.map((def) => <Card key={def.kind} def={def} row={data.find((d) => d.kind === def.kind)!} />)}
      </div>
    </div>
  );
}

function Card({ def, row }: { def: IntegrationDef; row: IntegrationDTO }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [enabled, setEnabled] = useState(row.enabled);
  const [mode, setMode] = useState(row.mode);
  const [values, setValues] = useState<Record<string, string>>({});
  const [testEmailTo, setTestEmailTo] = useState('alerts@reberonhotel.com');
  useEffect(() => {
    setEnabled(row.enabled);
    setMode(row.mode);
    setValues(Object.fromEntries(def.fields.map((f) => [f.name, f.secret ? '' : (row.config[f.name] ?? '')])));
  }, [row, def]);
  const dirty = enabled !== row.enabled || mode !== row.mode || def.fields.some((f) => (f.secret ? !!values[f.name] : (values[f.name] ?? '') !== (row.config[f.name] ?? '')));
  const save = useMutation({
    mutationFn: () => put<IntegrationDTO[]>(`/integrations/${def.kind}`, { enabled, mode, values }),
    onSuccess: (d) => { qc.setQueryData(['integrations'], d); toast.success(`${def.label} saved`); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not save'),
  });
  const test = useMutation({
    mutationFn: () => post<{ ok: boolean; message: string }>(`/integrations/${def.kind}/test`),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['integrations'] }); (r.ok ? toast.success : toast.error)(r.message, { duration: 8000 }); },
  });
  const sendTestEmail = useMutation({
    mutationFn: () => post<{ ok: boolean; message: string }>('/integrations/SMTP/test-email', { to: testEmailTo }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['integrations'] }); (r.ok ? toast.success : toast.error)(r.message, { duration: 8000 }); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed to send test email'),
  });
  const connected = row.source !== 'NONE';

  return (
    <section className="card flex flex-col p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[15px] font-semibold"><PlugZap className="size-4 text-fg-subtle" /> {def.label}</h2>
          <p className="mt-1 text-[13px] text-fg-muted">{def.purpose}</p>
        </div>
        {connected ? <Pill tone={row.source === 'VAULT' && row.mode === 'LIVE' ? 'green' : 'blue'} dot>{row.source === 'ENVIRONMENT' ? 'From server settings' : row.mode === 'LIVE' ? def.liveLabel : def.testLabel}</Pill> : <Pill dot>Not connected</Pill>}
      </header>

      <div className="mt-5 grid gap-3">
        {def.fields.map((f) => (
          <TextInput
            key={f.name}
            label={<span className="flex items-center gap-1.5">{f.label}{f.secret && <KeyRound className="size-3 text-fg-subtle" aria-label="secret" />}</span>}
            type={f.secret ? 'password' : 'text'}
            autoComplete="off"
            value={values[f.name] ?? ''}
            placeholder={f.secret ? (row.secrets[f.name] ? `Stored — ends in ${row.secrets[f.name]} (leave empty to keep)` : 'Not set') : f.placeholder}
            hint={f.help}
            onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
          />
        ))}
        <div className="grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1" role="radiogroup" aria-label="Mode">
          {(['TEST', 'LIVE'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={cn('h-9 rounded-full text-[13px] font-medium transition', mode === m ? 'bg-surface shadow-[var(--shadow-soft)]' : 'text-fg-muted')}>{m === 'TEST' ? def.testLabel : def.liveLabel}</button>
          ))}
        </div>
        <Switch label="Use these settings" hint={enabled ? 'The house uses the keys above.' : row.source === 'ENVIRONMENT' ? 'Off: the server environment is used instead.' : 'Off: nothing is sent through this provider.'} checked={enabled} onChange={setEnabled} />
      </div>

      <p className="mt-4 rounded-xl bg-surface-2/70 px-3 py-2 text-[12px] leading-relaxed text-fg-muted"><b className="text-fg">Where to get the keys:</b> {def.getKeys}</p>

      {def.kind === 'SMTP' && (
        <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
          <input
            type="email"
            className="input flex-1 text-[12.5px]"
            placeholder="Recipient for live test email"
            value={testEmailTo}
            onChange={(e) => setTestEmailTo(e.target.value)}
          />
          <Button size="sm" variant="secondary" loading={sendTestEmail.isPending} disabled={dirty || !testEmailTo.trim()} onClick={() => sendTestEmail.mutate()}>
            <Send className="size-3.5" /> Send test email
          </Button>
        </div>
      )}

      <footer className="mt-auto flex flex-wrap items-center gap-3 pt-5">
        <Button variant="dark" loading={save.isPending} disabled={!dirty} onClick={async () => {
          if (mode === 'LIVE' && enabled && (row.mode !== 'LIVE' || !row.enabled) && def.kind === 'PESAPAL' && !(await confirm({ title: 'Take real money?', body: 'With Pesapal live, guests pay real money on the website and by payment link.', confirm: 'Go live' }))) return;
          save.mutate();
        }}>Save</Button>
        <Button loading={test.isPending} disabled={!connected || dirty} onClick={() => test.mutate()}>Test connection</Button>
        {row.lastTest && (
          <span className={cn('flex items-center gap-1.5 text-[12px]', row.lastTest.ok ? 'text-success' : 'text-danger')} title={row.lastTest.message}>
            {row.lastTest.ok ? <CircleCheck className="size-3.5" /> : <CircleAlert className="size-3.5" />}
            <span className="max-w-[16rem] truncate">{row.lastTest.ok ? 'Worked' : 'Failed'} {ago(row.lastTest.at)}: {row.lastTest.message}</span>
          </span>
        )}
      </footer>
    </section>
  );
}
