'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check as CheckIcon, FileText, LoaderCircle, Upload, X } from 'lucide-react';
import { CV_MAX_BYTES } from '@reberon/contracts';
import { submitApplication, type FormState } from '@/app/actions';
import { cn } from '@/lib/cn';
import { Check, Field, Honeypot, TextArea } from './fields';
import { useIdempotencyKey } from './use-idempotency';

const initial: FormState = { status: 'idle' };
const OK_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const OK_EXT = /\.(pdf|docx?|DOCX?|PDF)$/;
const size = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Apply for a role (or send an open application): details, CV, questions, consent. */
export function ApplyForm({ slug, jobTitle, questions = [] }: { slug: string; jobTitle: string | null; questions?: { id: string; label: string; required: boolean }[] }) {
  const [state, action, pending] = useActionState(submitApplication.bind(null, slug), initial);
  const key = useIdempotencyKey();
  const v = state.values ?? {};
  const err = state.fieldErrors ?? {};
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  const pick = (f: File | null | undefined) => {
    setFileError(null);
    if (!f) return setFile(null);
    if (!(OK_TYPES.includes(f.type) || OK_EXT.test(f.name))) {
      setFileError('Please choose a PDF or Word document.');
      return;
    }
    if (f.size > CV_MAX_BYTES) {
      setFileError(`That file is ${size(f.size)} — the limit is 5 MB.`);
      return;
    }
    setFile(f);
    // Keep the real input in step (drag-and-drop puts the file only in our state).
    if (input.current) {
      const dt = new DataTransfer();
      dt.items.add(f);
      input.current.files = dt.files;
    }
  };

  // A failed send resets the form, which empties the file input: put the chosen CV back.
  useEffect(() => {
    if (file && input.current && !input.current.files?.length) {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.current.files = dt.files;
    }
  }, [state, file]);

  if (state.status === 'success' && state.reference) {
    return (
      <div role="status" aria-live="polite" className="fade-up grid gap-4 rounded-[var(--r-lg)] border border-line bg-surface p-8 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-moss-700 text-mist-50">
          <CheckIcon className="size-7" strokeWidth={1.8} />
        </span>
        <h3 className="text-step-3">Thank you — your application is in</h3>
        <p className="mx-auto max-w-md text-fg-muted">
          {jobTitle ? `We have received your application for ${jobTitle}.` : 'We have your details and will be in touch when a role fits you.'} Every application is read by a person.
          {state.data?.email ? ` A confirmation is on its way to ${state.data.email}.` : ''}
        </p>
        <p className="text-sm text-fg-subtle">
          Your reference <span className="ml-1 rounded-md bg-surface-2 px-2 py-1 font-mono text-base font-semibold tracking-wider text-fg">{state.reference}</span>
        </p>
        <Link href="/careers" className="btn btn-secondary justify-self-center">
          <span className="btn-label">See other roles</span>
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="relative grid gap-5" noValidate>
      <Honeypot />
      <input type="hidden" name="idempotencyKey" value={key} />
      <input type="hidden" name="source" value="website" />
      {state.status === 'error' && state.message && (
        <p role="alert" className="rounded-[var(--r-md)] border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          {state.message}
        </p>
      )}
      <Field label="Full name" name="name" required autoComplete="name" defaultValue={v.name} error={err.name} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Email" name="email" type="email" required autoComplete="email" defaultValue={v.email} error={err.email} />
        <Field label="Phone or WhatsApp" name="phone" type="tel" required inputMode="tel" autoComplete="tel" placeholder="07xx xxx xxx" defaultValue={v.phone} error={err.phone} />
      </div>
      <Field label="Where do you live? (optional)" name="location" autoComplete="address-level2" placeholder="e.g. Kapchorwa, Mbale" defaultValue={v.location} error={err.location} />

      <div className="field">
        <span className="text-sm font-medium">CV (optional but helpful)</span>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            pick(e.dataTransfer.files?.[0]);
          }}
          className={cn('rounded-[var(--r-md)] border-2 border-dashed p-5 transition-colors', drag ? 'border-accent bg-accent/5' : 'border-line-strong', (fileError || err.cv) && 'border-danger')}
        >
          <input ref={input} id="cv" type="file" name="cv" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
          {file ? (
            <div className="flex items-center gap-3">
              <FileText className="size-8 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{file.name}</p>
                <p className="text-sm text-fg-muted">{size(file.size)}</p>
              </div>
              <button
                type="button"
                aria-label="Remove the file"
                className="grid size-9 place-items-center rounded-full hover:bg-surface-2"
                onClick={() => {
                  setFile(null);
                  if (input.current) input.current.value = '';
                }}
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <label htmlFor="cv" className="flex cursor-pointer flex-col items-center gap-2 text-center">
              <Upload className="size-6 text-fg-muted" />
              <span className="font-medium">Choose a file <span className="font-normal text-fg-muted">or drop it here</span></span>
              <span className="text-sm text-fg-subtle">PDF or Word, up to 5 MB</span>
            </label>
          )}
        </div>
        {(fileError || err.cv) && <p className="error">{fileError ?? err.cv}</p>}
      </div>

      {questions.map((q) => (
        <TextArea key={q.id} label={q.label} name={`answer:${q.id}`} required={q.required} rows={3} defaultValue={v[`answer:${q.id}`]} error={err[`answers`] && q.required && !v[`answer:${q.id}`] ? 'Please answer this' : undefined} />
      ))}
      <TextArea
        label={jobTitle ? 'Why this role, and why you? (optional)' : 'Tell us about yourself and the work you love (optional)'}
        name="coverLetter"
        rows={5}
        defaultValue={v.coverLetter}
        error={err.coverLetter}
        hint="A few honest lines beat a long letter."
      />
      <Check
        name="consent"
        required
        error={err.consent}
        label={
          <>
            I agree that Reberon Hotel may use my application, including my CV, to consider me for {jobTitle ? 'this and similar roles' : 'future roles'}, and keep it for up to a year. <Link href="/legal/privacy" className="underline">Privacy</Link>
          </>
        }
      />
      <button type="submit" className="btn btn-lg w-full" disabled={pending}>
        {pending ? <LoaderCircle className="size-5 animate-spin" /> : null}
        <span className="btn-label">{pending ? 'Sending…' : 'Send my application'}</span>
      </button>
    </form>
  );
}
