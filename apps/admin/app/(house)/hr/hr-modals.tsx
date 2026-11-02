'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  FileText,
  KeyRound,
  Mail,
  MapPin,
  Phone,
  Plus,
  Printer,
  ShieldCheck,
  Trash2,
  UserCheck,
} from 'lucide-react';
import type {
  HotelDepartmentDTO,
  RoleDefinitionDTO,
  StaffDocumentDTO,
  StaffLeaveRequestDTO,
  StaffPayrollRecordDTO,
  StaffProfileDTO,
  StaffShiftDTO,
} from '@reberon/contracts';
import { ApiError, del, get, post } from '@/lib/api';
import { money } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { SelectInput, TextInput } from '@/components/ui/field';
import { Empty, Skeleton, Tabs } from '@/components/ui/bits';

function calculatePreviewPaye(gross: number): number {
  if (gross <= 235_000) return 0;
  let tax = 0;
  if (gross <= 335_000) {
    tax = (gross - 235_000) * 0.1;
  } else if (gross <= 410_000) {
    tax = 10_000 + (gross - 335_000) * 0.2;
  } else {
    tax = 25_000 + (gross - 410_000) * 0.3;
    if (gross > 10_000_000) {
      tax += (gross - 10_000_000) * 0.1;
    }
  }
  return Math.round(tax);
}

/* ───────────────────────── 1. Create Staff Modal ───────────────────────── */

export function CreateStaffModal({
  open,
  onClose,
  departments,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  departments: HotelDepartmentDTO[];
  onSubmit: (body: any) => void;
  isPending: boolean;
}) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [otherNames, setOtherNames] = useState('');
  const [gender, setGender] = useState('OTHER');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [nssfNumber, setNssfNumber] = useState('');
  const [tinNumber, setTinNumber] = useState('');
  const [residenceAddress, setResidenceAddress] = useState('');
  const [departmentCode, setDepartmentCode] = useState(departments[0]?.code || 'FRONT_DESK');
  const [jobTitle, setJobTitle] = useState('');
  const [employmentType, setEmploymentType] = useState('FULL_TIME');
  const [dateJoined, setDateJoined] = useState(new Date().toISOString().slice(0, 10));
  const [contractEndDate, setContractEndDate] = useState('');
  const [salaryStr, setSalaryStr] = useState('1500000');
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER');
  const [bankName, setBankName] = useState('Stanbic Bank Uganda');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [mobileMoneyNumber, setMobileMoneyNumber] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyRelation, setEmergencyRelation] = useState('SPOUSE');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !jobTitle.trim() || !emergencyName.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }
    onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      otherNames: otherNames.trim() || undefined,
      gender,
      dateOfBirth: dateOfBirth || undefined,
      phone: phone.trim(),
      email: email.trim() || undefined,
      nationalIdNumber: nationalId.trim() || undefined,
      nssfNumber: nssfNumber.trim() || undefined,
      tinNumber: tinNumber.trim() || undefined,
      residenceAddress: residenceAddress.trim() || undefined,
      departmentCode,
      jobTitle: jobTitle.trim(),
      employmentType,
      dateJoined: dateJoined || undefined,
      contractEndDate: contractEndDate || undefined,
      baseSalaryMinor: salaryStr.replace(/[^0-9]/g, '') || '0',
      currency: 'UGX',
      paymentMethod,
      bankName: bankName.trim() || undefined,
      bankAccountNumber: bankAccountNumber.trim() || undefined,
      mobileMoneyNumber: mobileMoneyNumber.trim() || undefined,
      emergencyContactName: emergencyName.trim(),
      emergencyContactPhone: emergencyPhone.trim() || phone.trim(),
      emergencyContactRelation: emergencyRelation.trim() || 'NEXT_OF_KIN',
      notes: notes.trim() || undefined,
      status: 'ACTIVE',
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title="Register New Hotel Employee" size="xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">First Name *</label>
            <TextInput value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Last Name *</label>
            <TextInput value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Other Names</label>
            <TextInput value={otherNames} onChange={(e) => setOtherNames(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Gender</label>
            <SelectInput value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other / Unspecified</option>
            </SelectInput>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Phone Number *</label>
            <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+2567..." required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Official Email</label>
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@reberonhotel.com" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Date of Birth</label>
            <TextInput type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Residence Address</label>
            <TextInput value={residenceAddress} onChange={(e) => setResidenceAddress(e.target.value)} placeholder="Kapchorwa / Sipi" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-line bg-surface-2/40 p-3">
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">National ID (NIN) / Passport</label>
            <TextInput value={nationalId} onChange={(e) => setNationalId(e.target.value)} placeholder="CM90..." />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">NSSF Social Security #</label>
            <TextInput value={nssfNumber} onChange={(e) => setNssfNumber(e.target.value)} placeholder="NSSF-..." />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">URA TIN Number</label>
            <TextInput value={tinNumber} onChange={(e) => setTinNumber(e.target.value)} placeholder="100..." />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Department *</label>
            <SelectInput value={departmentCode} onChange={(e) => setDepartmentCode(e.target.value)}>
              {departments.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </SelectInput>
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Job Title *</label>
            <TextInput value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Executive Chef" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Employment Type</label>
            <SelectInput value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
              <option value="FULL_TIME">Full Time</option>
              <option value="PART_TIME">Part Time</option>
              <option value="CONTRACT">Fixed Contract</option>
              <option value="PROBATION">Probation</option>
              <option value="CASUAL">Casual / Seasonal</option>
            </SelectInput>
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Date Joined</label>
            <TextInput type="date" value={dateJoined} onChange={(e) => setDateJoined(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Monthly Base Salary (UGX) *</label>
            <TextInput value={salaryStr} onChange={(e) => setSalaryStr(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Payment Method</label>
            <SelectInput value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="MOBILE_MONEY">Mobile Money</option>
              <option value="CASH">Cash</option>
            </SelectInput>
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Bank / Provider Name</label>
            <TextInput value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Stanbic / MTN MoMo" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Account / MoMo Number</label>
            <TextInput
              value={paymentMethod === 'MOBILE_MONEY' ? mobileMoneyNumber : bankAccountNumber}
              onChange={(e) =>
                paymentMethod === 'MOBILE_MONEY'
                  ? setMobileMoneyNumber(e.target.value)
                  : setBankAccountNumber(e.target.value)
              }
              placeholder="Account or +256..."
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-line">
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Emergency Contact Name *</label>
            <TextInput value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Emergency Phone *</label>
            <TextInput value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} placeholder="+256..." />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Relationship</label>
            <TextInput value={emergencyRelation} onChange={(e) => setEmergencyRelation(e.target.value)} placeholder="SPOUSE / PARENT" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Contract End Date (Optional)</label>
            <TextInput type="date" value={contractEndDate} onChange={(e) => setContractEndDate(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-fg-muted mb-1">HR Notes / Qualifications</label>
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Certifications, languages spoken, accommodation notes..." />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isPending}>
            {isPending ? 'Registering...' : 'Register Employee'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/* ───────────────────────── 2. Edit Staff Modal ───────────────────────── */

export function EditStaffModal({
  staff,
  open,
  onClose,
  departments,
  onSubmit,
  isPending,
}: {
  staff: StaffProfileDTO;
  open: boolean;
  onClose: () => void;
  departments: HotelDepartmentDTO[];
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const [firstName, setFirstName] = useState(staff.firstName);
  const [lastName, setLastName] = useState(staff.lastName);
  const [otherNames, setOtherNames] = useState(staff.otherNames || '');
  const [gender, setGender] = useState<string>(staff.gender || 'OTHER');
  const [dateOfBirth, setDateOfBirth] = useState(staff.dateOfBirth || '');
  const [phone, setPhone] = useState(staff.phone);
  const [email, setEmail] = useState(staff.email || '');
  const [nationalId, setNationalId] = useState(staff.nationalIdNumber || '');
  const [nssfNumber, setNssfNumber] = useState(staff.nssfNumber || '');
  const [tinNumber, setTinNumber] = useState(staff.tinNumber || '');
  const [residenceAddress, setResidenceAddress] = useState(staff.residenceAddress || '');
  const [jobTitle, setJobTitle] = useState(staff.jobTitle);
  const [departmentCode, setDepartmentCode] = useState(staff.departmentCode);
  const [employmentType, setEmploymentType] = useState<string>(staff.employmentType);
  const [contractEndDate, setContractEndDate] = useState(staff.contractEndDate || '');
  const [salaryStr, setSalaryStr] = useState(staff.baseSalaryMinor);
  const [paymentMethod, setPaymentMethod] = useState<string>(staff.paymentMethod);
  const [bankName, setBankName] = useState(staff.bankName || '');
  const [bankAccountNumber, setBankAccountNumber] = useState(staff.bankAccountNumber || '');
  const [mobileMoneyNumber, setMobileMoneyNumber] = useState(staff.mobileMoneyNumber || '');
  const [emergencyName, setEmergencyName] = useState(staff.emergencyContactName);
  const [emergencyPhone, setEmergencyPhone] = useState(staff.emergencyContactPhone);
  const [emergencyRelation, setEmergencyRelation] = useState(staff.emergencyContactRelation);
  const [status, setStatus] = useState<string>(staff.status);
  const [notes, setNotes] = useState(staff.notes || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      otherNames: otherNames.trim() || null,
      gender,
      dateOfBirth: dateOfBirth || null,
      phone: phone.trim(),
      email: email.trim() || null,
      nationalIdNumber: nationalId.trim() || null,
      nssfNumber: nssfNumber.trim() || null,
      tinNumber: tinNumber.trim() || null,
      residenceAddress: residenceAddress.trim() || null,
      jobTitle: jobTitle.trim(),
      departmentCode,
      employmentType,
      contractEndDate: contractEndDate || null,
      baseSalaryMinor: salaryStr.replace(/[^0-9]/g, '') || '0',
      paymentMethod,
      bankName: bankName.trim() || null,
      bankAccountNumber: bankAccountNumber.trim() || null,
      mobileMoneyNumber: mobileMoneyNumber.trim() || null,
      emergencyContactName: emergencyName.trim(),
      emergencyContactPhone: emergencyPhone.trim(),
      emergencyContactRelation: emergencyRelation.trim(),
      status,
      notes: notes.trim() || null,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title={`Edit Employee Profile · ${staff.employeeNumber}`} size="xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">First Name</label>
            <TextInput value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Last Name</label>
            <TextInput value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Other Names</label>
            <TextInput value={otherNames} onChange={(e) => setOtherNames(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Status</label>
            <SelectInput value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="ACTIVE">Active</option>
              <option value="ON_LEAVE">On Leave</option>
              <option value="SUSPENDED">Suspended</option>
              <option value="TERMINATED">Terminated</option>
            </SelectInput>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Phone</label>
            <TextInput value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Email</label>
            <TextInput value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Gender</label>
            <SelectInput value={gender} onChange={(e) => setGender(e.target.value)}>
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </SelectInput>
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Date of Birth</label>
            <TextInput type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-line bg-surface-2/40 p-3">
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">NIN / Passport</label>
            <TextInput value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">NSSF Number</label>
            <TextInput value={nssfNumber} onChange={(e) => setNssfNumber(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">URA TIN Number</label>
            <TextInput value={tinNumber} onChange={(e) => setTinNumber(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Department</label>
            <SelectInput value={departmentCode} onChange={(e) => setDepartmentCode(e.target.value)}>
              {departments.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </SelectInput>
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Job Title</label>
            <TextInput value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Employment Type</label>
            <SelectInput value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
              <option value="FULL_TIME">Full Time</option>
              <option value="PART_TIME">Part Time</option>
              <option value="CONTRACT">Fixed Contract</option>
              <option value="PROBATION">Probation</option>
              <option value="CASUAL">Casual</option>
            </SelectInput>
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Contract End Date</label>
            <TextInput type="date" value={contractEndDate} onChange={(e) => setContractEndDate(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Base Salary (UGX)</label>
            <TextInput value={salaryStr} onChange={(e) => setSalaryStr(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Payment Method</label>
            <SelectInput value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="MOBILE_MONEY">Mobile Money</option>
              <option value="CASH">Cash</option>
            </SelectInput>
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Bank / Provider</label>
            <TextInput value={bankName} onChange={(e) => setBankName(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Account / MoMo #</label>
            <TextInput
              value={paymentMethod === 'MOBILE_MONEY' ? mobileMoneyNumber : bankAccountNumber}
              onChange={(e) =>
                paymentMethod === 'MOBILE_MONEY'
                  ? setMobileMoneyNumber(e.target.value)
                  : setBankAccountNumber(e.target.value)
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-line">
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Emergency Contact</label>
            <TextInput value={emergencyName} onChange={(e) => setEmergencyName(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Emergency Phone</label>
            <TextInput value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Relation</label>
            <TextInput value={emergencyRelation} onChange={(e) => setEmergencyRelation(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Residence</label>
            <TextInput value={residenceAddress} onChange={(e) => setResidenceAddress(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-fg-muted mb-1">HR Notes</label>
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isPending}>
            {isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/* ───────────────────────── 3. Full 360° Staff Dossier Modal ───────────────────────── */

type DossierDetail = StaffProfileDTO & {
  shifts: StaffShiftDTO[];
  leaveRequests: StaffLeaveRequestDTO[];
  payrollRecords: StaffPayrollRecordDTO[];
  documents: StaffDocumentDTO[];
};

export function StaffDetailModal({
  staff,
  open,
  onClose,
  onAssignRole,
  onEdit,
}: {
  staff: StaffProfileDTO;
  open: boolean;
  onClose: () => void;
  onAssignRole: (s: StaffProfileDTO) => void;
  onEdit: (s: StaffProfileDTO) => void;
}) {
  const qc = useQueryClient();
  const [subTab, setSubTab] = useState<'OVERVIEW' | 'SHIFTS' | 'LEAVES' | 'PAYROLL' | 'DOCS'>('OVERVIEW');
  const [docTitle, setDocTitle] = useState('');
  const [docKind, setDocKind] = useState('CONTRACT');
  const [docExpiry, setDocExpiry] = useState('');
  const [docNotes, setDocNotes] = useState('');

  const { data: dossier, isLoading } = useQuery({
    queryKey: ['hr-staff-dossier', staff.id],
    queryFn: () => get<DossierDetail>(`/hr/staff/${staff.id}`),
    enabled: open,
  });

  const addDocMutation = useMutation({
    mutationFn: (body: any) => post<StaffDocumentDTO>(`/hr/staff/${staff.id}/documents`, body),
    onSuccess: () => {
      toast.success('Document added to employee dossier');
      setDocTitle('');
      setDocExpiry('');
      setDocNotes('');
      qc.invalidateQueries({ queryKey: ['hr-staff-dossier', staff.id] });
      qc.invalidateQueries({ queryKey: ['hr-documents'] });
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to add document'),
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: string) => del(`/hr/documents/${docId}`),
    onSuccess: () => {
      toast.success('Document removed');
      qc.invalidateQueries({ queryKey: ['hr-staff-dossier', staff.id] });
      qc.invalidateQueries({ queryKey: ['hr-documents'] });
    },
  });

  const d = dossier || staff;

  return (
    <Dialog open={open} onClose={onClose} title={`360° Personnel Dossier · ${d.fullName}`} size="xl">
      <div className="space-y-4 text-sm">
        {/* Top Banner */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface-2/50 p-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-13 w-13 items-center justify-center rounded-2xl bg-emerald-600/15 text-base font-bold text-emerald-700 dark:text-emerald-300">
              {d.firstName[0]}
              {d.lastName[0]}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-fg">{d.fullName}</h3>
                <span className="rounded-md bg-surface px-2 py-0.5 font-mono text-xs text-fg-muted border border-line">
                  {d.employeeNumber}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                    d.status === 'ACTIVE'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : d.status === 'ON_LEAVE'
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                  }`}
                >
                  {d.status}
                </span>
              </div>
              <p className="text-xs text-fg-muted mt-0.5">
                {d.jobTitle} · <span className="font-semibold text-fg">{d.departmentName || d.departmentCode}</span> · Joined {d.dateJoined}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onClose();
                onAssignRole(d);
              }}
              className="gap-1.5"
            >
              <KeyRound className="size-3.5" />
              {d.systemAccess ? `Role: ${d.systemAccess.roleDisplayName}` : 'Assign System Role'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onClose();
                onEdit(d);
              }}
            >
              Edit Profile
            </Button>
          </div>
        </div>

        <Tabs
          value={subTab}
          onChange={(v) => setSubTab(v as any)}
          items={[
            { value: 'OVERVIEW', label: 'Profile & Statutory' },
            { value: 'SHIFTS', label: 'Shifts & Attendance', count: dossier?.shifts?.length },
            { value: 'LEAVES', label: 'Leave History', count: dossier?.leaveRequests?.length },
            { value: 'PAYROLL', label: 'Payroll & Payslips', count: dossier?.payrollRecords?.length },
            { value: 'DOCS', label: 'Contracts & Documents', count: dossier?.documents?.length },
          ]}
        />

        {isLoading && subTab !== 'OVERVIEW' ? (
          <div className="space-y-2 py-6">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : null}

        {subTab === 'OVERVIEW' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="rounded-xl border border-line p-3">
                <span className="text-fg-subtle block">Phone Number</span>
                <span className="font-semibold text-fg mt-0.5 block">{d.phone}</span>
              </div>
              <div className="rounded-xl border border-line p-3">
                <span className="text-fg-subtle block">Official Email</span>
                <span className="font-semibold text-fg mt-0.5 block truncate">{d.email || 'Not set'}</span>
              </div>
              <div className="rounded-xl border border-line p-3">
                <span className="text-fg-subtle block">Gender & DOB</span>
                <span className="font-semibold text-fg mt-0.5 block">
                  {d.gender} {d.dateOfBirth ? `· ${d.dateOfBirth}` : ''}
                </span>
              </div>
              <div className="rounded-xl border border-line p-3">
                <span className="text-fg-subtle block">Residence Address</span>
                <span className="font-semibold text-fg mt-0.5 block">{d.residenceAddress || 'Kapchorwa'}</span>
              </div>

              <div className="rounded-xl border border-line p-3">
                <span className="text-fg-subtle block">National ID (NIN)</span>
                <span className="font-mono font-semibold text-fg mt-0.5 block">{d.nationalIdNumber || '—'}</span>
              </div>
              <div className="rounded-xl border border-line p-3">
                <span className="text-fg-subtle block">NSSF Number</span>
                <span className="font-mono font-semibold text-fg mt-0.5 block">{d.nssfNumber || '—'}</span>
              </div>
              <div className="rounded-xl border border-line p-3">
                <span className="text-fg-subtle block">URA TIN Number</span>
                <span className="font-mono font-semibold text-fg mt-0.5 block">{d.tinNumber || '—'}</span>
              </div>
              <div className="rounded-xl border border-line p-3">
                <span className="text-fg-subtle block">Contract Type & End</span>
                <span className="font-semibold text-fg mt-0.5 block">
                  {d.employmentType.replace('_', ' ')} {d.contractEndDate ? `→ ${d.contractEndDate}` : '(Permanent)'}
                </span>
              </div>

              <div className="rounded-xl border border-line bg-emerald-500/5 p-3">
                <span className="text-fg-subtle block">Base Monthly Salary</span>
                <span className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                  {money(d.baseSalaryMinor, d.currency)}
                </span>
              </div>
              <div className="rounded-xl border border-line p-3">
                <span className="text-fg-subtle block">Payment Method</span>
                <span className="font-semibold text-fg mt-0.5 block">{d.paymentMethod.replace('_', ' ')}</span>
              </div>
              <div className="rounded-xl border border-line p-3">
                <span className="text-fg-subtle block">Bank / MoMo Provider</span>
                <span className="font-semibold text-fg mt-0.5 block">{d.bankName || 'Mobile Money'}</span>
              </div>
              <div className="rounded-xl border border-line p-3">
                <span className="text-fg-subtle block">Account / MoMo Number</span>
                <span className="font-mono font-semibold text-fg mt-0.5 block">
                  {d.bankAccountNumber || d.mobileMoneyNumber || '—'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-line bg-surface-2/30 p-3.5">
                <span className="font-semibold text-fg block mb-1">Emergency Next of Kin</span>
                <p className="text-fg-muted">
                  <strong className="text-fg">{d.emergencyContactName}</strong> ({d.emergencyContactRelation}) ·{' '}
                  <span className="font-mono">{d.emergencyContactPhone}</span>
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface-2/30 p-3.5">
                <span className="font-semibold text-fg block mb-1">System Access & House Login Status</span>
                {d.systemAccess ? (
                  <p className="text-fg-muted">
                    Assigned Role: <strong className="text-emerald-600 dark:text-emerald-400">{d.systemAccess.roleDisplayName}</strong> ·{' '}
                    {d.systemAccess.canSignIn ? 'Sign-in enabled' : 'Record only (No sign-in)'} ·{' '}
                    {d.systemAccess.email || 'No email'}
                  </p>
                ) : (
                  <p className="text-fg-muted">
                    No system access role assigned yet. Click <strong>Assign System Role</strong> above to grant dashboard access.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {subTab === 'SHIFTS' && dossier && (
          <div className="max-h-72 overflow-y-auto rounded-xl border border-line">
            {dossier.shifts.length === 0 ? (
              <div className="p-6 text-center text-xs text-fg-muted">No shifts recorded for this employee yet.</div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line bg-surface-2/50 text-[11px] font-semibold uppercase text-fg-subtle">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Shift</th>
                    <th className="px-3 py-2">Scheduled Hours</th>
                    <th className="px-3 py-2">Attendance</th>
                    <th className="px-3 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {dossier.shifts.map((sh) => (
                    <tr key={sh.id}>
                      <td className="px-3 py-2 font-mono">{sh.date}</td>
                      <td className="px-3 py-2 font-semibold">{sh.shiftType}</td>
                      <td className="px-3 py-2 font-mono">
                        {sh.scheduledStartTime || '08:00'} – {sh.scheduledEndTime || '17:00'}
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 font-semibold">{sh.attendanceStatus}</span>
                      </td>
                      <td className="px-3 py-2 text-fg-muted">{sh.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {subTab === 'LEAVES' && dossier && (
          <div className="max-h-72 overflow-y-auto rounded-xl border border-line">
            {dossier.leaveRequests.length === 0 ? (
              <div className="p-6 text-center text-xs text-fg-muted">No leave requests on file for this employee.</div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line bg-surface-2/50 text-[11px] font-semibold uppercase text-fg-subtle">
                  <tr>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Dates</th>
                    <th className="px-3 py-2">Days</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {dossier.leaveRequests.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2 font-semibold">{l.leaveType}</td>
                      <td className="px-3 py-2 font-mono">
                        {l.startDate} → {l.endDate}
                      </td>
                      <td className="px-3 py-2 font-mono">{l.daysCount}d</td>
                      <td className="px-3 py-2 text-fg-muted">{l.reason}</td>
                      <td className="px-3 py-2 font-semibold">{l.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {subTab === 'PAYROLL' && dossier && (
          <div className="max-h-72 overflow-y-auto rounded-xl border border-line">
            {dossier.payrollRecords.length === 0 ? (
              <div className="p-6 text-center text-xs text-fg-muted">No payroll records generated yet.</div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="border-b border-line bg-surface-2/50 text-[11px] font-semibold uppercase text-fg-subtle">
                  <tr>
                    <th className="px-3 py-2">Period</th>
                    <th className="px-3 py-2">Gross Pay</th>
                    <th className="px-3 py-2">PAYE Tax</th>
                    <th className="px-3 py-2">NSSF (5%)</th>
                    <th className="px-3 py-2">Net Pay</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {dossier.payrollRecords.map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2 font-mono font-semibold">{p.periodMonth}</td>
                      <td className="px-3 py-2 font-mono">{money(p.grossSalaryMinor, p.currency)}</td>
                      <td className="px-3 py-2 font-mono">{money(p.payeTaxMinor, p.currency)}</td>
                      <td className="px-3 py-2 font-mono">{money(p.nssfEmployeeMinor, p.currency)}</td>
                      <td className="px-3 py-2 font-mono font-bold text-emerald-600">{money(p.netSalaryMinor, p.currency)}</td>
                      <td className="px-3 py-2 font-semibold">{p.paymentStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {subTab === 'DOCS' && dossier && (
          <div className="space-y-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!docTitle.trim()) return;
                addDocMutation.mutate({
                  title: docTitle.trim(),
                  kind: docKind,
                  expiryDate: docExpiry || null,
                  notes: docNotes.trim() || null,
                });
              }}
              className="grid grid-cols-1 sm:grid-cols-5 gap-2 rounded-xl border border-line bg-surface-2/40 p-3"
            >
              <TextInput
                placeholder="Document title (e.g. Signed Contract)"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                required
              />
              <SelectInput value={docKind} onChange={(e) => setDocKind(e.target.value)}>
                <option value="CONTRACT">Employment Contract</option>
                <option value="NATIONAL_ID">National ID / Passport</option>
                <option value="ACADEMIC">Academic Certificate</option>
                <option value="MEDICAL">Medical Fitness</option>
                <option value="APPRAISAL">Performance Appraisal</option>
                <option value="WARNING">Disciplinary / Warning</option>
              </SelectInput>
              <TextInput
                type="date"
                value={docExpiry}
                onChange={(e) => setDocExpiry(e.target.value)}
                title="Expiry Date (Optional)"
              />
              <TextInput
                placeholder="Reference / Notes"
                value={docNotes}
                onChange={(e) => setDocNotes(e.target.value)}
              />
              <Button variant="primary" size="sm" type="submit" disabled={addDocMutation.isPending}>
                <Plus className="size-3.5" /> Add Record
              </Button>
            </form>

            <div className="max-h-56 overflow-y-auto rounded-xl border border-line">
              {dossier.documents.length === 0 ? (
                <div className="p-6 text-center text-xs text-fg-muted">
                  No contracts or compliance documents logged for {d.fullName} yet. Use the bar above to log one.
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-line bg-surface-2/50 text-[11px] font-semibold uppercase text-fg-subtle">
                    <tr>
                      <th className="px-3 py-2">Document Title</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Expiry Date</th>
                      <th className="px-3 py-2">Notes</th>
                      <th className="px-3 py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {dossier.documents.map((doc) => (
                      <tr key={doc.id}>
                        <td className="px-3 py-2 font-semibold text-fg">{doc.title}</td>
                        <td className="px-3 py-2">
                          <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[11px]">{doc.kind}</span>
                        </td>
                        <td className="px-3 py-2 font-mono">{doc.expiryDate || 'Permanent'}</td>
                        <td className="px-3 py-2 text-fg-muted">{doc.notes || '—'}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => deleteDocMutation.mutate(doc.id)}
                            className="text-rose-600 hover:underline text-xs font-semibold"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>
            Close Dossier
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/* ───────────────────────── 4. Assign System Role Modal ───────────────────────── */

export function AssignSystemRoleModal({
  staff,
  open,
  onClose,
}: {
  staff: StaffProfileDTO;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: roles } = useQuery({
    queryKey: ['roles-definitions'],
    queryFn: () => get<RoleDefinitionDTO[]>('/users/roles'),
    enabled: open,
  });

  const currentKey = staff.systemAccess?.customRoleKey || staff.systemAccess?.role || 'DESK';
  const [roleKey, setRoleKey] = useState(currentKey);
  const [email, setEmail] = useState(staff.email || staff.systemAccess?.email || '');
  const [canSignIn, setCanSignIn] = useState(staff.systemAccess ? staff.systemAccess.canSignIn : true);

  const assignMutation = useMutation({
    mutationFn: () =>
      post<StaffProfileDTO>(`/hr/staff/${staff.id}/system-role`, {
        roleKey,
        email: email.trim() || null,
        canSignIn,
      }),
    onSuccess: () => {
      toast.success(`Updated system access role for ${staff.fullName}`);
      qc.invalidateQueries({ queryKey: ['hr-staff'] });
      qc.invalidateQueries({ queryKey: ['hr-staff-dossier', staff.id] });
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to assign role'),
  });

  return (
    <Dialog open={open} onClose={onClose} title={`System Access & Role · ${staff.fullName}`}>
      <div className="space-y-4 text-sm">
        <div className="rounded-xl border border-line bg-surface-2/50 p-3 text-xs">
          <div className="font-semibold text-fg">
            {staff.fullName} ({staff.employeeNumber})
          </div>
          <div className="text-fg-muted mt-0.5">
            {staff.jobTitle} · {staff.departmentName || staff.departmentCode}
          </div>
          {staff.systemAccess && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-500/15 px-2.5 py-1 text-amber-800 dark:text-amber-300 font-semibold">
              <ShieldCheck className="size-3.5" />
              Currently assigned: {staff.systemAccess.roleDisplayName}
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-fg-muted mb-1">Select Hotel Access Role *</label>
          <SelectInput value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>
            {(roles || []).map((r) => (
              <option key={r.key} value={r.key}>
                {r.name} ({r.permissions.length} permissions)
              </option>
            ))}
            {(!roles || roles.length === 0) && (
              <>
                <option value="DESK">Front Desk & Reception</option>
                <option value="HR">Human Resources</option>
                <option value="ACCOUNTANT">Finance & Accounts</option>
                <option value="KITCHEN">Kitchen & Culinary</option>
                <option value="BAR">Bar & Beverage</option>
                <option value="GYM">Health Club & Spa</option>
                <option value="HOUSEKEEPING">Housekeeping & Rooms</option>
                <option value="MANAGER">General Manager</option>
              </>
            )}
          </SelectInput>
        </div>

        <div>
          <label className="block text-xs font-semibold text-fg-muted mb-1">Official Sign-In Email</label>
          <TextInput
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="staff@reberonhotel.com"
          />
          <p className="text-[11px] text-fg-subtle mt-1">
            Required if the employee needs to sign in to The House dashboard. You can set or reset their password in People & Access.
          </p>
        </div>

        <label className="flex items-center gap-2 text-xs font-medium text-fg cursor-pointer">
          <input
            type="checkbox"
            checked={canSignIn}
            onChange={(e) => setCanSignIn(e.target.checked)}
            className="rounded border-line"
          />
          Enable interactive dashboard sign-in for this employee
        </label>

        <div className="flex justify-end gap-2 pt-3">
          <Button variant="ghost" onClick={onClose} disabled={assignMutation.isPending}>
            Keep Current & Exit
          </Button>
          <Button variant="primary" onClick={() => assignMutation.mutate()} disabled={assignMutation.isPending}>
            {assignMutation.isPending
              ? 'Saving...'
              : staff.systemAccess
              ? 'Change Access Role'
              : 'Assign Access Role'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/* ───────────────────────── 5. Single & Bulk Shift Modals ───────────────────────── */

const SHIFT_PRESET_HOURS: Record<string, { start: string; end: string }> = {
  MORNING: { start: '06:00', end: '14:00' },
  EVENING: { start: '14:00', end: '22:00' },
  NIGHT: { start: '22:00', end: '06:00' },
  FULL_DAY: { start: '07:00', end: '19:00' },
  OFF: { start: '00:00', end: '00:00' },
};

export function CreateShiftModal({
  open,
  onClose,
  staffList,
  departments,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  staffList: StaffProfileDTO[];
  departments: HotelDepartmentDTO[];
  onSubmit: (body: any) => void;
  isPending: boolean;
}) {
  const [staffId, setStaffId] = useState(staffList[0]?.id || '');
  const [departmentCode, setDepartmentCode] = useState(departments[0]?.code || 'FRONT_DESK');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [shiftType, setShiftType] = useState('MORNING');
  const [startTime, setStartTime] = useState('06:00');
  const [endTime, setEndTime] = useState('14:00');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!staffId && staffList[0]?.id) {
      setStaffId(staffList[0].id);
      setDepartmentCode(staffList[0].departmentCode);
    }
  }, [staffList, staffId]);

  return (
    <Dialog open={open} onClose={onClose} title="Assign Duty Shift">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            staffId,
            departmentCode,
            date,
            shiftType,
            scheduledStartTime: startTime,
            scheduledEndTime: endTime,
            attendanceStatus: 'SCHEDULED',
            notes: notes.trim() || undefined,
          });
        }}
        className="space-y-4"
      >
        <div>
          <label className="block text-xs font-semibold text-fg-muted mb-1">Staff Member *</label>
          <SelectInput
            value={staffId}
            onChange={(e) => {
              setStaffId(e.target.value);
              const found = staffList.find((s) => s.id === e.target.value);
              if (found) setDepartmentCode(found.departmentCode);
            }}
          >
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName} ({s.jobTitle})
              </option>
            ))}
          </SelectInput>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Department *</label>
            <SelectInput value={departmentCode} onChange={(e) => setDepartmentCode(e.target.value)}>
              {departments.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </SelectInput>
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Shift Date *</label>
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Shift Type</label>
            <SelectInput
              value={shiftType}
              onChange={(e) => {
                const next = e.target.value;
                setShiftType(next);
                const preset = SHIFT_PRESET_HOURS[next];
                if (preset) {
                  setStartTime(preset.start);
                  setEndTime(preset.end);
                }
              }}
            >
              <option value="MORNING">Morning (06:00–14:00)</option>
              <option value="EVENING">Evening (14:00–22:00)</option>
              <option value="NIGHT">Night (22:00–06:00)</option>
              <option value="FULL_DAY">Full Day (07:00–19:00)</option>
              <option value="OFF">Off Duty</option>
            </SelectInput>
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Start Time</label>
            <TextInput value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">End Time</label>
            <TextInput value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-fg-muted mb-1">Duty / Station Notes</label>
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Main Reception Desk / VIP Wing" />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isPending}>
            {isPending ? 'Assigning...' : 'Assign Shift'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function BulkShiftModal({
  open,
  onClose,
  staffList,
  departments,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  staffList: StaffProfileDTO[];
  departments: HotelDepartmentDTO[];
  onSubmit: (body: any) => void;
  isPending: boolean;
}) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const nextWeekStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 6);
    return d.toISOString().slice(0, 10);
  }, []);

  const [deptFilter, setDeptFilter] = useState('ALL');
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(nextWeekStr);
  const [shiftType, setShiftType] = useState('MORNING');
  const [startTime, setStartTime] = useState('06:00');
  const [endTime, setEndTime] = useState('14:00');
  const [notes, setNotes] = useState('');

  const filteredStaff = useMemo(() => {
    if (deptFilter === 'ALL') return staffList.filter((s) => s.status === 'ACTIVE');
    return staffList.filter((s) => s.status === 'ACTIVE' && s.departmentCode === deptFilter);
  }, [staffList, deptFilter]);

  const toggleStaff = (id: string) => {
    setSelectedStaffIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <Dialog open={open} onClose={onClose} title="Bulk Weekly / Multi-Day Roster Generator" size="xl">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (selectedStaffIds.length === 0) {
            toast.error('Select at least one employee to schedule');
            return;
          }
          onSubmit({
            staffIds: selectedStaffIds,
            departmentCode: deptFilter !== 'ALL' ? deptFilter : undefined,
            startDate,
            endDate,
            shiftType,
            scheduledStartTime: startTime,
            scheduledEndTime: endTime,
            notes: notes.trim() || undefined,
          });
        }}
        className="space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-fg-muted">Filter Department:</label>
            <SelectInput value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="w-52">
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name}
                </option>
              ))}
            </SelectInput>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelectedStaffIds(filteredStaff.map((s) => s.id))}
            >
              Select All ({filteredStaff.length})
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedStaffIds([])}>
              Clear
            </Button>
          </div>
        </div>

        <div className="max-h-44 overflow-y-auto grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-xl border border-line p-3 bg-surface-2/30">
          {filteredStaff.map((s) => {
            const checked = selectedStaffIds.includes(s.id);
            return (
              <label
                key={s.id}
                className={`flex items-center gap-2 rounded-lg border p-2 text-xs cursor-pointer transition ${
                  checked ? 'border-emerald-500 bg-emerald-500/10 font-semibold' : 'border-line bg-surface'
                }`}
              >
                <input type="checkbox" checked={checked} onChange={() => toggleStaff(s.id)} />
                <div className="truncate">
                  <div className="truncate text-fg">{s.fullName}</div>
                  <div className="truncate text-[10px] text-fg-subtle">{s.jobTitle}</div>
                </div>
              </label>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">From Date *</label>
            <TextInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">To Date *</label>
            <TextInput type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Shift Type</label>
            <SelectInput
              value={shiftType}
              onChange={(e) => {
                const next = e.target.value;
                setShiftType(next);
                const preset = SHIFT_PRESET_HOURS[next];
                if (preset) {
                  setStartTime(preset.start);
                  setEndTime(preset.end);
                }
              }}
            >
              <option value="MORNING">Morning</option>
              <option value="EVENING">Evening</option>
              <option value="NIGHT">Night</option>
              <option value="FULL_DAY">Full Day</option>
              <option value="OFF">Off Duty</option>
            </SelectInput>
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Start Time</label>
            <TextInput value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">End Time</label>
            <TextInput value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-fg-muted mb-1">Roster Notes (Optional)</label>
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Weekly rotation notes..." />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isPending}>
            {isPending ? 'Generating Roster...' : `Generate Shifts (${selectedStaffIds.length} Staff)`}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/* ───────────────────────── 6. Leave Request & Review Modals ───────────────────────── */

export function CreateLeaveModal({
  open,
  onClose,
  staffList,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onClose: () => void;
  staffList: StaffProfileDTO[];
  onSubmit: (body: any) => void;
  isPending: boolean;
}) {
  const [staffId, setStaffId] = useState(staffList[0]?.id || '');
  const [leaveType, setLeaveType] = useState('ANNUAL');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [handoverNotes, setHandoverNotes] = useState('');

  useEffect(() => {
    if (!staffId && staffList[0]?.id) setStaffId(staffList[0].id);
  }, [staffList, staffId]);

  const computedDays = useMemo(() => {
    const s = new Date(startDate);
    const e = new Date(endDate);
    const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return diff > 0 ? diff : 1;
  }, [startDate, endDate]);

  return (
    <Dialog open={open} onClose={onClose} title="Submit Employee Leave Request">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!reason.trim()) {
            toast.error('Please enter leave reason');
            return;
          }
          onSubmit({
            staffId,
            leaveType,
            startDate,
            endDate,
            daysCount: computedDays,
            reason: reason.trim(),
            handoverNotes: handoverNotes.trim() || undefined,
          });
        }}
        className="space-y-4"
      >
        <div>
          <label className="block text-xs font-semibold text-fg-muted mb-1">Staff Member *</label>
          <SelectInput value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            {staffList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.fullName} ({s.departmentName || s.departmentCode})
              </option>
            ))}
          </SelectInput>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Leave Type</label>
            <SelectInput value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
              <option value="ANNUAL">Annual Leave (21d/yr)</option>
              <option value="SICK">Sick / Medical Leave</option>
              <option value="COMPASSIONATE">Compassionate Leave</option>
              <option value="MATERNITY">Maternity Leave (60d)</option>
              <option value="PATERNITY">Paternity Leave (4d)</option>
              <option value="STUDY">Study Leave</option>
              <option value="UNPAID">Unpaid Leave</option>
            </SelectInput>
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Start Date</label>
            <TextInput type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">
              End Date ({computedDays} day{computedDays === 1 ? '' : 's'})
            </label>
            <TextInput type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-fg-muted mb-1">Reason for Leave *</label>
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for absence..." required />
        </div>

        <div>
          <label className="block text-xs font-semibold text-fg-muted mb-1">Duty Handover & Relief Coverage Notes</label>
          <TextInput
            value={handoverNotes}
            onChange={(e) => setHandoverNotes(e.target.value)}
            placeholder="Who is covering shifts and key tasks handed over..."
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isPending}>
            {isPending ? 'Submitting...' : `Submit (${computedDays} Days)`}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function ReviewLeaveModal({
  leave,
  open,
  onClose,
  onSubmit,
  isPending,
}: {
  leave: StaffLeaveRequestDTO;
  open: boolean;
  onClose: () => void;
  onSubmit: (action: string, notes?: string) => void;
  isPending: boolean;
}) {
  const [notes, setNotes] = useState('');

  return (
    <Dialog open={open} onClose={onClose} title="Review Leave Request">
      <div className="space-y-4 text-sm">
        <div className="rounded-xl border border-line bg-surface-2/40 p-3.5 text-xs space-y-1.5">
          <p>
            <span className="font-semibold text-fg">Employee:</span> {leave.staffName} ({leave.departmentCode})
          </p>
          <p>
            <span className="font-semibold text-fg">Leave Type:</span> {leave.leaveType}
          </p>
          <p>
            <span className="font-semibold text-fg">Duration:</span> {leave.startDate} to {leave.endDate} ({leave.daysCount} days)
          </p>
          <p>
            <span className="font-semibold text-fg">Reason:</span> {leave.reason}
          </p>
          {leave.handoverNotes && (
            <p>
              <span className="font-semibold text-fg">Handover Notes:</span> {leave.handoverNotes}
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-fg-muted mb-1">Reviewer Remarks / Conditions</label>
          <TextInput
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Approval conditions, relief person confirmed..."
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant="ghost"
            onClick={() => onSubmit('REJECT', notes)}
            disabled={isPending}
            className="text-rose-600 hover:bg-rose-500/10"
          >
            Reject Request
          </Button>
          <Button variant="primary" onClick={() => onSubmit('APPROVE', notes)} disabled={isPending}>
            Approve Leave
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/* ───────────────────────── 7. Adjust Payroll Modal & Mark Paid Modal ───────────────────────── */

export function AdjustPayrollModal({
  record,
  open,
  onClose,
  onSubmit,
  isPending,
}: {
  record: StaffPayrollRecordDTO;
  open: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const [baseStr, setBaseStr] = useState(record.baseSalaryMinor);
  const [overtimeStr, setOvertimeStr] = useState(record.overtimeMinor);
  const [allowancesStr, setAllowancesStr] = useState(record.allowancesMinor);
  const [advancesStr, setAdvancesStr] = useState(record.advancesDeductionMinor);
  const [otherDedStr, setOtherDedStr] = useState(record.otherDeductionsMinor);

  const preview = useMemo(() => {
    const base = Number(baseStr.replace(/[^0-9]/g, '') || 0);
    const ot = Number(overtimeStr.replace(/[^0-9]/g, '') || 0);
    const alw = Number(allowancesStr.replace(/[^0-9]/g, '') || 0);
    const adv = Number(advancesStr.replace(/[^0-9]/g, '') || 0);
    const oth = Number(otherDedStr.replace(/[^0-9]/g, '') || 0);

    const gross = base + ot + alw;
    const nssfEmp = Math.round(gross * 0.05);
    const nssfEmpr = Math.round(gross * 0.1);
    const paye = calculatePreviewPaye(gross);
    const net = Math.max(0, gross - nssfEmp - paye - adv - oth);

    return { gross, nssfEmp, nssfEmpr, paye, net };
  }, [baseStr, overtimeStr, allowancesStr, advancesStr, otherDedStr]);

  return (
    <Dialog open={open} onClose={onClose} title={`Adjust Compensation · ${record.staffName} (${record.periodMonth})`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({
            baseSalaryMinor: baseStr.replace(/[^0-9]/g, '') || '0',
            overtimeMinor: overtimeStr.replace(/[^0-9]/g, '') || '0',
            allowancesMinor: allowancesStr.replace(/[^0-9]/g, '') || '0',
            advancesDeductionMinor: advancesStr.replace(/[^0-9]/g, '') || '0',
            otherDeductionsMinor: otherDedStr.replace(/[^0-9]/g, '') || '0',
          });
        }}
        className="space-y-4 text-sm"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-fg-muted mb-1">Base Salary (UGX)</label>
            <TextInput value={baseStr} onChange={(e) => setBaseStr(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-emerald-600 mb-1">+ Overtime Pay (UGX)</label>
            <TextInput value={overtimeStr} onChange={(e) => setOvertimeStr(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-emerald-600 mb-1">+ Allowances / Bonus (UGX)</label>
            <TextInput value={allowancesStr} onChange={(e) => setAllowancesStr(e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-rose-600 mb-1">- Salary Advance Recovery (UGX)</label>
            <TextInput value={advancesStr} onChange={(e) => setAdvancesStr(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-rose-600 mb-1">- Other Deductions / Damage (UGX)</label>
            <TextInput value={otherDedStr} onChange={(e) => setOtherDedStr(e.target.value)} />
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface-2/50 p-3.5 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-fg-muted">Recomputed Gross Pay:</span>
            <span className="font-mono font-semibold text-fg">{money(String(preview.gross), record.currency)}</span>
          </div>
          <div className="flex justify-between text-rose-600 dark:text-rose-400">
            <span>URA PAYE Tax (Auto-Calculated):</span>
            <span className="font-mono">- {money(String(preview.paye), record.currency)}</span>
          </div>
          <div className="flex justify-between text-rose-600 dark:text-rose-400">
            <span>NSSF 5% Employee Contribution:</span>
            <span className="font-mono">- {money(String(preview.nssfEmp), record.currency)}</span>
          </div>
          <div className="flex justify-between pt-1.5 border-t border-line font-bold text-sm text-emerald-600 dark:text-emerald-400">
            <span>New Net Take-Home Pay:</span>
            <span className="font-mono">{money(String(preview.net), record.currency)}</span>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isPending}>
            {isPending ? 'Recalculating...' : 'Save & Recalculate'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function MarkPaidModal({
  record,
  open,
  onClose,
  onSubmit,
  isPending,
}: {
  record: StaffPayrollRecordDTO;
  open: boolean;
  onClose: () => void;
  onSubmit: (reference: string) => void;
  isPending: boolean;
}) {
  const [reference, setReference] = useState(
    record.paymentReference || `PAY-${record.periodMonth}-${record.employeeNumber || 'STAFF'}`,
  );

  return (
    <Dialog open={open} onClose={onClose} title={`Confirm Salary Disbursement · ${record.staffName}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(reference.trim());
        }}
        className="space-y-4 text-sm"
      >
        <div className="rounded-xl border border-line bg-surface-2/40 p-3.5 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-fg-muted">Employee:</span>
            <span className="font-semibold text-fg">{record.staffName} ({record.employeeNumber})</span>
          </div>
          <div className="flex justify-between">
            <span className="text-fg-muted">Net Disbursement Amount:</span>
            <span className="font-mono font-bold text-emerald-600">{money(record.netSalaryMinor, record.currency)}</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-fg-muted mb-1">Bank Transfer / Mobile Money Reference *</label>
          <TextInput
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="STANBIC-TXN-... or MOMO-..."
            required
          />
          <p className="text-[11px] text-fg-subtle mt-1">
            Marking as PAID automatically posts an audited expense voucher under Staff Payroll & Welfare.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isPending}>
            {isPending ? 'Recording...' : 'Confirm & Mark Paid'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function PayslipModal({
  record,
  open,
  onClose,
}: {
  record: StaffPayrollRecordDTO;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={`Official Hotel Payslip · ${record.periodMonth}`}>
      <div className="space-y-4 text-sm">
        <div className="border-b border-line pb-3 flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-fg">REBERON HOTEL · KAPCHORWA</h2>
            <p className="text-xs text-fg-muted">Official Staff Remuneration & Tax Advice · Period: {record.periodMonth}</p>
            <p className="text-xs font-mono text-fg mt-1">
              {record.staffName} ({record.employeeNumber}) · {record.jobTitle}
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
              record.paymentStatus === 'PAID'
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
            }`}
          >
            {record.paymentStatus}
          </span>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex justify-between py-1 border-b border-line">
            <span className="text-fg-muted">Basic Monthly Salary</span>
            <span className="font-mono font-semibold">{money(record.baseSalaryMinor, record.currency)}</span>
          </div>
          {BigInt(record.overtimeMinor || '0') > 0n && (
            <div className="flex justify-between py-1 border-b border-line text-emerald-600">
              <span>+ Overtime Pay</span>
              <span className="font-mono">+ {money(record.overtimeMinor, record.currency)}</span>
            </div>
          )}
          {BigInt(record.allowancesMinor || '0') > 0n && (
            <div className="flex justify-between py-1 border-b border-line text-emerald-600">
              <span>+ Allowances & Bonuses</span>
              <span className="font-mono">+ {money(record.allowancesMinor, record.currency)}</span>
            </div>
          )}
          <div className="flex justify-between py-1.5 border-b border-line font-semibold">
            <span>Gross Taxable Earnings</span>
            <span className="font-mono">{money(record.grossSalaryMinor, record.currency)}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-line text-rose-600 dark:text-rose-400">
            <span>Less: NSSF Employee Contribution (5%)</span>
            <span className="font-mono">- {money(record.nssfEmployeeMinor, record.currency)}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-line text-rose-600 dark:text-rose-400">
            <span>Less: URA PAYE Income Tax</span>
            <span className="font-mono">- {money(record.payeTaxMinor, record.currency)}</span>
          </div>
          {BigInt(record.advancesDeductionMinor || '0') > 0n && (
            <div className="flex justify-between py-1 border-b border-line text-rose-600 dark:text-rose-400">
              <span>Less: Salary Advance Recovery</span>
              <span className="font-mono">- {money(record.advancesDeductionMinor, record.currency)}</span>
            </div>
          )}
          {BigInt(record.otherDeductionsMinor || '0') > 0n && (
            <div className="flex justify-between py-1 border-b border-line text-rose-600 dark:text-rose-400">
              <span>Less: Other Deductions</span>
              <span className="font-mono">- {money(record.otherDeductionsMinor, record.currency)}</span>
            </div>
          )}
          <div className="flex justify-between py-2.5 font-bold text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 px-3 rounded-lg">
            <span>NET TAKE-HOME PAY</span>
            <span className="font-mono">{money(record.netSalaryMinor, record.currency)}</span>
          </div>
          <div className="flex justify-between py-1 text-fg-subtle text-[11px]">
            <span>Employer NSSF Contribution (10% · Paid by Reberon Hotel)</span>
            <span className="font-mono">{money(record.nssfEmployerMinor, record.currency)}</span>
          </div>
        </div>

        {record.paymentReference && (
          <div className="rounded-xl border border-line p-2.5 bg-surface-2/40 text-xs flex justify-between">
            <span className="text-fg-muted">Disbursement Reference:</span>
            <span className="font-mono font-semibold">{record.paymentReference}</span>
          </div>
        )}

        <div className="mt-4 flex justify-between items-center">
          <Button variant="secondary" size="sm" onClick={() => window.print()} className="gap-1.5">
            <Printer className="h-4 w-4" /> Print Official Payslip
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
