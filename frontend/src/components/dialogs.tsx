"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Eye, EyeOff, LoaderCircle, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Monogram, Segmented } from "@/components/mac/controls";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  api, ROLE_LABELS, STATUS_LABELS, useApi, type Account, type Counselor, type Intervention, type InterventionStatus,
  type Meeting, type MetricsRecord, type Options, type Page, type Role, type Student, type StudentRow,
} from "@/lib/api";
import { cn } from "cn";

const today = () => new Date().toISOString().slice(0, 10);

// ===== Khung chung =====

interface ShellProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Hộp thoại mở bằng nút (trigger) hoặc điều khiển từ ngoài (open/onOpenChange — dùng cho menu
 * chuột phải). Nội dung chỉ được gắn khi mở, nên form bên trong luôn bắt đầu với dữ liệu mới.
 */
function DialogShell({ trigger, open, onOpenChange, wide, children }: ShellProps & {
  wide?: boolean;
  children: (close: () => void) => React.ReactNode;
}) {
  const [internal, setInternal] = useState(false);
  const isOpen = open ?? internal;
  const setOpen = onOpenChange ?? setInternal;

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className={cn("mac-scroll max-h-[calc(100dvh-2rem)] overflow-y-auto", wide ? "sm:max-w-2xl" : "sm:max-w-lg")}>
        {children(() => setOpen(false))}
      </DialogContent>
    </Dialog>
  );
}

/** Thân biểu mẫu: tự lo trạng thái đang gửi, báo lỗi ngay trong hộp thoại, báo thành công, đóng lại. */
function FormBody({ title, description, submitLabel, onSubmit, close, children, icon }: {
  title: string;
  description?: string;
  submitLabel: string;
  onSubmit: () => Promise<string | void>;
  close: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const message = await onSubmit();
      toast.success(message ?? "Đã lưu");
      close();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <DialogHeader className="flex-row items-center gap-3">
        {icon}
        <div className="space-y-1">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </div>
      </DialogHeader>
      {children}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto", x: [0, -8, 8, -5, 5, 0] }}
                      exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.35 }}
                      className="flex items-start gap-2 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />{error}
          </motion.div>
        )}
      </AnimatePresence>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={close}>Huỷ</Button>
        <Button type="submit" disabled={busy} className="min-w-28">
          {busy ? <LoaderCircle className="animate-spin" /> : <Check />} {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function Field({ label, hint, className, children }: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Choice({ value, onChange, options, placeholder, className }: {
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  placeholder?: string;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn("w-full", className)}><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {options.map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** Ô chọn Radix không nhận giá trị rỗng, nên "không chọn" được biểu diễn bằng "none". */
const NONE = "none";
const idOrNull = (value: string) => (value === NONE ? null : Number(value));
const idOrNone = (value: number | null | undefined) => (value == null ? NONE : String(value));

function useForm<T extends Record<string, string | boolean>>(initial: T) {
  const [form, setForm] = useState(initial);
  const set = <K extends keyof T>(key: K) => (value: T[K]) => setForm((f) => ({ ...f, [key]: value }));
  const input = (key: keyof T) => ({
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });
  return { form, set, input };
}

// ===== Xác nhận xoá =====

export function ConfirmDelete({ trigger, open, onOpenChange, title, description, confirmLabel = "Xoá", onConfirm }: ShellProps & {
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => Promise<void>;
}) {
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  const isOpen = open ?? internal;
  const setOpen = onOpenChange ?? setInternal;

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={setOpen}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent>
        <AlertDialogHeader>
          <motion.div initial={{ scale: 0.5, rotate: -10 }} animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 15 }}
                      className="mb-1 grid size-12 place-items-center rounded-2xl bg-destructive/12 text-destructive">
            <TriangleAlert className="size-6" />
          </motion.div>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Huỷ</AlertDialogCancel>
          <Button onClick={confirm} disabled={busy}
                  className="bg-[linear-gradient(180deg,oklch(0.68_0.22_27),oklch(0.58_0.23_27))] text-white">
            {busy && <LoaderCircle className="animate-spin" />}{confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ===== Sinh viên =====

export function StudentDialog({ student, onSaved, ...shell }: ShellProps & {
  student?: Student;
  onSaved: (student: Student) => void;
}) {
  return (
    <DialogShell {...shell} wide>
      {(close) => <StudentForm student={student} onSaved={onSaved} close={close} />}
    </DialogShell>
  );
}

function StudentForm({ student, onSaved, close }: { student?: Student; onSaved: (s: Student) => void; close: () => void }) {
  const { data: options } = useApi<Options>("/options");
  const { form, set, input } = useForm({
    student_code: student?.student_code ?? "",
    full_name: student?.full_name ?? "",
    email: student?.email ?? "",
    phone: student?.phone ?? "",
    class_name: student?.class_name ?? "",
    major: student?.major ?? "",
    enrollment_year: student?.enrollment_year?.toString() ?? String(new Date().getFullYear()),
    status: student?.status ?? ("active" as string),
    advisor: idOrNone(student?.advisor_user_id),
  });

  return (
    <FormBody
      close={close}
      icon={<Monogram name={form.full_name || "?"} className="size-11 text-lg" />}
      title={student ? "Sửa hồ sơ sinh viên" : "Thêm sinh viên"}
      description={student ? student.student_code : "Hồ sơ mới chưa có chỉ số — nhập chỉ số sau khi tạo để chạy dự đoán."}
      submitLabel={student ? "Lưu thay đổi" : "Thêm sinh viên"}
      onSubmit={async () => {
        const saved = await api<Student>(student ? `/students/${student.student_id}` : "/students", {
          method: student ? "PUT" : "POST",
          json: {
            ...form,
            email: form.email || null,
            enrollment_year: form.enrollment_year ? Number(form.enrollment_year) : null,
            advisor_user_id: idOrNull(form.advisor),
          },
        });
        onSaved(saved);
        return student ? "Đã lưu hồ sơ" : `Đã thêm ${saved.student_code}`;
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mã sinh viên"><Input required autoFocus {...input("student_code")} /></Field>
        <Field label="Họ và tên"><Input required {...input("full_name")} /></Field>
        <Field label="Email"><Input type="email" {...input("email")} /></Field>
        <Field label="Số điện thoại"><Input {...input("phone")} /></Field>
        <Field label="Lớp"><Input placeholder="CNTT-K25-01" list="class-options" {...input("class_name")} /></Field>
        <Field label="Ngành"><Input {...input("major")} /></Field>
        <Field label="Năm nhập học"><Input type="number" min={2000} max={2100} {...input("enrollment_year")} /></Field>
        <Field label="Trạng thái">
          <Choice value={form.status} onChange={set("status")} options={Object.entries(STATUS_LABELS)} />
        </Field>
        <Field label="Giảng viên phụ trách" className="sm:col-span-2"
               hint="Chỉ giảng viên được gán mới nhập chỉ số và chạy dự đoán cho sinh viên này.">
          <Choice value={form.advisor} onChange={set("advisor")}
                  options={[[NONE, "— Chưa gán —"], ...(options?.lecturers ?? []).map((l) => [String(l.id), l.name] as [string, string])]} />
        </Field>
      </div>
      <datalist id="class-options">{options?.classes.map((c) => <option key={c} value={c} />)}</datalist>
    </FormBody>
  );
}

// ===== Chỉ số học tập =====

const METRIC_FIELDS: { group: string; fields: [string, string, string?][] }[] = [
  { group: "Kết quả học tập", fields: [["gpa", "Điểm trung bình (0–10)", "0.01"], ["failed_subjects", "Số môn trượt"],
      ["credits_completed", "Tín chỉ tích luỹ"], ["credits_registered", "Tín chỉ đăng ký kỳ này"]] },
  { group: "Chuyên cần", fields: [["attendance_rate", "Tỷ lệ chuyên cần (%)", "0.1"], ["total_sessions", "Tổng số buổi"],
      ["absent_sessions", "Số buổi vắng"]] },
  { group: "Tương tác học tập", fields: [["login_count", "Số lần đăng nhập"], ["assignment_submitted", "Bài tập đã nộp"],
      ["assignment_missing", "Bài tập còn thiếu"], ["forum_posts", "Bài đăng diễn đàn"], ["video_views", "Lượt xem bài giảng"],
      ["learning_hours", "Số giờ học", "0.1"]] },
];

/** Thêm lát cắt chỉ số mới (record không có) hoặc sửa lỗi nhập liệu trên một lát cắt đã có. */
export function MetricsDialog({ studentId, initial, record, onSaved, ...shell }: ShellProps & {
  studentId: number;
  initial?: Record<string, number | null>;
  record?: MetricsRecord;
  onSaved: () => void;
}) {
  return (
    <DialogShell {...shell} wide>
      {(close) => <MetricsForm studentId={studentId} initial={initial} record={record} onSaved={onSaved} close={close} />}
    </DialogShell>
  );
}

function MetricsForm({ studentId, initial, record, onSaved, close }: {
  studentId: number;
  initial?: Record<string, number | null>;
  record?: MetricsRecord;
  onSaved: () => void;
  close: () => void;
}) {
  const source = (record ?? initial ?? {}) as Record<string, unknown>;
  const [values, setValues] = useState<Record<string, string>>(() => ({
    semester: record?.semester ?? "",
    ...Object.fromEntries(METRIC_FIELDS.flatMap((g) => g.fields).map(([key]) => [key, source[key] == null ? "" : String(source[key])])),
  }));

  return (
    <FormBody
      close={close}
      title={record ? `Sửa chỉ số học kỳ ${record.semester}` : "Nhập chỉ số học tập"}
      description={record
        ? "Dùng để sửa lỗi nhập liệu. Các lần dự đoán cũ giữ nguyên vì chúng phản ánh số liệu tại thời điểm chạy."
        : "Tạo một bản ghi mới, không ghi đè dữ liệu cũ. Đã điền sẵn số liệu gần nhất để chỉ cần sửa phần thay đổi."}
      submitLabel={record ? "Lưu thay đổi" : "Lưu chỉ số"}
      onSubmit={async () => {
        const json = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, k === "semester" ? v : Number(v)]));
        await api(record ? `/students/${studentId}/metrics/${record.result_id}` : `/students/${studentId}/metrics`,
                  { method: record ? "PUT" : "POST", json });
        onSaved();
        return record ? "Đã cập nhật chỉ số" : "Đã ghi nhận chỉ số mới";
      }}
    >
      <Field label="Học kỳ">
        <Input required autoFocus placeholder="2025.2" value={values.semester}
               onChange={(e) => setValues((v) => ({ ...v, semester: e.target.value }))} />
      </Field>
      {METRIC_FIELDS.map(({ group, fields }) => (
        <fieldset key={group} className="space-y-3 rounded-2xl bg-muted/50 p-3.5">
          <legend className="float-left mb-1 text-sm font-semibold">{group}</legend>
          <div className="clear-both grid grid-cols-2 gap-3 sm:grid-cols-3">
            {fields.map(([key, label, step]) => (
              <Field key={key} label={label}>
                <Input required type="number" min={0} step={step ?? "1"} value={values[key] ?? ""}
                       onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))} />
              </Field>
            ))}
          </div>
        </fieldset>
      ))}
    </FormBody>
  );
}

// ===== Gặp mặt =====

export function MeetingDialog({ studentId, meeting, onSaved, ...shell }: ShellProps & {
  studentId: number;
  meeting?: Meeting;
  onSaved: () => void;
}) {
  return (
    <DialogShell {...shell}>
      {(close) => <MeetingForm studentId={studentId} meeting={meeting} onSaved={onSaved} close={close} />}
    </DialogShell>
  );
}

function MeetingForm({ studentId, meeting, onSaved, close }: {
  studentId: number;
  meeting?: Meeting;
  onSaved: () => void;
  close: () => void;
}) {
  const { data: options } = useApi<Options>("/options");
  const { form, set, input } = useForm({
    meeting_date: meeting?.meeting_date ?? today(),
    meeting_type: meeting?.meeting_type ?? ("academic_counseling" as string),
    duration_minutes: String(meeting?.duration_minutes ?? 30),
    counselor: idOrNone(meeting?.counselor_id),
    notes: meeting?.notes ?? "",
  });

  return (
    <FormBody
      close={close}
      title={meeting ? "Sửa biên bản gặp mặt" : "Ghi biên bản gặp mặt"}
      submitLabel={meeting ? "Lưu thay đổi" : "Lưu biên bản"}
      onSubmit={async () => {
        const { counselor, ...rest } = form;
        await api(meeting ? `/meetings/${meeting.meeting_id}` : `/students/${studentId}/meetings`, {
          method: meeting ? "PUT" : "POST",
          json: { ...rest, duration_minutes: Number(form.duration_minutes), counselor_id: idOrNull(counselor), notes: form.notes || null },
        });
        onSaved();
        return meeting ? "Đã cập nhật biên bản" : "Đã lưu biên bản";
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ngày gặp"><Input type="date" required {...input("meeting_date")} /></Field>
        <Field label="Thời lượng (phút)"><Input type="number" min={1} max={480} {...input("duration_minutes")} /></Field>
        <Field label="Nội dung buổi gặp">
          <Choice value={form.meeting_type} onChange={set("meeting_type")} options={Object.entries(options?.meeting_types ?? {})} />
        </Field>
        <Field label="Cán bộ tư vấn">
          <Choice value={form.counselor} onChange={set("counselor")}
                  options={[[NONE, "— Không chỉ định —"], ...(options?.counselors ?? []).map((c) => [String(c.id), c.name] as [string, string])]} />
        </Field>
      </div>
      <Field label="Ghi chú">
        <Textarea rows={4} placeholder="Sinh viên trình bày điều gì, hai bên thống nhất làm gì tiếp theo…" {...input("notes")} />
      </Field>
    </FormBody>
  );
}

// ===== Can thiệp =====

const STATUS_OPTIONS: { value: InterventionStatus; label: string }[] = [
  { value: "not_started", label: "Chưa bắt đầu" },
  { value: "in_progress", label: "Đang xử lý" },
  { value: "completed", label: "Đã xong" },
];

export function InterventionDialog({ studentId, item, onSaved, ...shell }: ShellProps & {
  studentId: number;
  item?: Intervention;
  onSaved: () => void;
}) {
  return (
    <DialogShell {...shell}>
      {(close) => <InterventionForm studentId={studentId} item={item} onSaved={onSaved} close={close} />}
    </DialogShell>
  );
}

function InterventionForm({ studentId, item, onSaved, close }: {
  studentId: number;
  item?: Intervention;
  onSaved: () => void;
  close: () => void;
}) {
  const { data: options } = useApi<Options>("/options");
  const { form, set, input } = useForm({
    category: item?.category ?? ("academic_counseling" as string),
    title: item?.title ?? "",
    description: item?.description ?? "",
    due_date: item?.due_date ?? "",
    counselor: idOrNone(item?.counselor_id),
    status: item?.status ?? ("not_started" as string),
  });

  return (
    <FormBody
      close={close}
      title={item ? "Sửa việc can thiệp" : "Thêm việc can thiệp"}
      submitLabel={item ? "Lưu thay đổi" : "Thêm vào kế hoạch"}
      onSubmit={async () => {
        const { counselor, status, ...rest } = form;
        const json = { ...rest, due_date: form.due_date || null, description: form.description || null, counselor_id: idOrNull(counselor) };
        await api(item ? `/interventions/${item.intervention_id}` : `/students/${studentId}/interventions`, {
          method: item ? "PUT" : "POST",
          json: item ? { ...json, status } : json,
        });
        onSaved();
        return item ? "Đã cập nhật việc can thiệp" : "Đã thêm việc cần làm";
      }}
    >
      {item && (
        <Segmented value={form.status as InterventionStatus} onChange={set("status")} options={STATUS_OPTIONS} className="w-full [&>button]:flex-1 [&>button]:justify-center" />
      )}
      <Field label="Việc cần làm">
        <Input required autoFocus placeholder="Xếp lịch phụ đạo môn Giải tích" {...input("title")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Loại can thiệp">
          <Choice value={form.category} onChange={set("category")} options={Object.entries(options?.intervention_categories ?? {})} />
        </Field>
        <Field label="Hạn hoàn thành"><Input type="date" {...input("due_date")} /></Field>
      </div>
      <Field label="Cán bộ tư vấn phụ trách">
        <Choice value={form.counselor} onChange={set("counselor")}
                options={[[NONE, "— Không chỉ định —"], ...(options?.counselors ?? []).map((c) => [String(c.id), c.name] as [string, string])]} />
      </Field>
      <Field label="Mô tả"><Textarea rows={3} {...input("description")} /></Field>
    </FormBody>
  );
}

// ===== Tài khoản =====

export function AccountDialog({ account, onSaved, ...shell }: ShellProps & { account?: Account; onSaved: () => void }) {
  return (
    <DialogShell {...shell}>
      {(close) => <AccountForm account={account} onSaved={onSaved} close={close} />}
    </DialogShell>
  );
}

function AccountForm({ account, onSaved, close }: { account?: Account; onSaved: () => void; close: () => void }) {
  const { form, set, input } = useForm({
    username: account?.username ?? "",
    full_name: account?.full_name ?? "",
    email: account?.email ?? "",
    role: account?.role ?? ("lecturer" as string),
    password: "",
    is_active: account?.is_active ?? true,
  });
  const [student, setStudent] = useState<{ id: number; label: string } | null>(
    account?.student_id ? { id: account.student_id, label: account.student_code ?? `#${account.student_id}` } : null,
  );

  return (
    <FormBody
      close={close}
      icon={<Monogram name={form.full_name || "?"} className="size-11 text-lg" />}
      title={account ? "Sửa tài khoản" : "Tạo tài khoản"}
      description={account ? `@${account.username}` : "Tài khoản đăng nhập cho quản trị viên, giảng viên hoặc sinh viên."}
      submitLabel={account ? "Lưu thay đổi" : "Tạo tài khoản"}
      onSubmit={async () => {
        await api(account ? `/users/${account.user_id}` : "/users", {
          method: account ? "PUT" : "POST",
          json: { ...form, email: form.email || null, password: form.password || null,
                  student_id: form.role === "student" ? student?.id ?? null : null },
        });
        onSaved();
        return account ? "Đã lưu tài khoản" : `Đã tạo @${form.username}`;
      }}
    >
      <Segmented value={form.role as Role} onChange={set("role")} className="w-full [&>button]:flex-1 [&>button]:justify-center"
                 options={(Object.keys(ROLE_LABELS) as Role[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tên đăng nhập" hint="Chữ không dấu, số, dấu chấm, gạch dưới.">
          <Input required autoFocus pattern="[A-Za-z0-9_.\-]+" autoComplete="off" {...input("username")} />
        </Field>
        <Field label="Họ và tên"><Input required {...input("full_name")} /></Field>
        <Field label="Email"><Input type="email" {...input("email")} /></Field>
        <Field label={account ? "Mật khẩu mới" : "Mật khẩu"} hint={account ? "Để trống để giữ mật khẩu hiện tại." : "Ít nhất 6 ký tự."}>
          <PasswordInput required={!account} value={form.password} onChange={set("password")} />
        </Field>
      </div>
      <AnimatePresence initial={false}>
        {form.role === "student" && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden">
            <Field label="Hồ sơ sinh viên" hint="Mỗi hồ sơ chỉ gắn với một tài khoản.">
              <StudentPicker value={student} onChange={setStudent} />
            </Field>
          </motion.div>
        )}
      </AnimatePresence>
      <label className="flex items-center justify-between rounded-2xl bg-muted/50 px-4 py-3">
        <span>
          <span className="block text-sm font-medium">Cho phép đăng nhập</span>
          <span className="block text-xs text-muted-foreground">Tắt để khoá tài khoản ngay lập tức, kể cả phiên đang mở.</span>
        </span>
        <Switch checked={form.is_active} onCheckedChange={set("is_active")} />
      </label>
    </FormBody>
  );
}

export function PasswordInput({ value, onChange, required, autoComplete = "new-password", className }: {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  autoComplete?: string;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input type={visible ? "text" : "password"} required={required} minLength={required || value ? 6 : undefined}
             autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} className={cn("pr-9", className)} />
      <button type="button" onClick={() => setVisible((v) => !v)} aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/** Tìm hồ sơ sinh viên theo mã hoặc tên để gắn vào tài khoản. */
function StudentPicker({ value, onChange }: {
  value: { id: number; label: string } | null;
  onChange: (value: { id: number; label: string } | null) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(keyword.trim()), 250);
    return () => clearTimeout(timer);
  }, [keyword]);
  const { data } = useApi<Page<StudentRow>>(debounced ? `/students?${new URLSearchParams({ keyword: debounced, per_page: "5" })}` : null);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-[10px] bg-(--field) px-3 py-1.5 ring-1 ring-input">
        <Check className="size-4 text-risk-low" />
        <span className="flex-1 text-sm font-medium">{value.label}</span>
        <Button type="button" size="xs" variant="ghost" onClick={() => onChange(null)}>Đổi</Button>
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Input placeholder="Gõ mã hoặc tên sinh viên…" value={keyword} onChange={(e) => setKeyword(e.target.value)} />
      <AnimatePresence>
        {!!data?.items.length && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="overflow-hidden rounded-xl bg-muted/60 p-1">
            {data.items.map((s) => (
              <button key={s.student_id} type="button"
                      onClick={() => onChange({ id: s.student_id, label: `${s.student_code} · ${s.full_name}` })}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-primary hover:text-primary-foreground">
                <Monogram name={s.full_name} className="size-6 text-[10px]" />
                <span className="flex-1 truncate">{s.full_name}</span>
                <span className="text-xs opacity-70">{s.student_code}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function PasswordResetDialog({ account, ...shell }: ShellProps & { account: Account }) {
  return (
    <DialogShell {...shell}>
      {(close) => <PasswordResetForm account={account} close={close} />}
    </DialogShell>
  );
}

function PasswordResetForm({ account, close }: { account: Account; close: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  return (
    <FormBody
      close={close}
      title="Đặt lại mật khẩu"
      description={`Cho tài khoản @${account.username}. Gửi mật khẩu mới cho người dùng qua kênh riêng.`}
      submitLabel="Đặt mật khẩu"
      onSubmit={async () => {
        if (password !== confirm) throw new Error("Hai lần nhập mật khẩu không khớp.");
        await api(`/users/${account.user_id}/password`, { method: "POST", json: { password } });
        return `Đã đặt lại mật khẩu cho @${account.username}`;
      }}
    >
      <Field label="Mật khẩu mới" hint="Ít nhất 6 ký tự."><PasswordInput required value={password} onChange={setPassword} /></Field>
      <Field label="Nhập lại"><PasswordInput required value={confirm} onChange={setConfirm} /></Field>
    </FormBody>
  );
}

// ===== Cán bộ tư vấn =====

export function CounselorDialog({ counselor, onSaved, ...shell }: ShellProps & { counselor?: Counselor; onSaved: () => void }) {
  return (
    <DialogShell {...shell}>
      {(close) => <CounselorForm counselor={counselor} onSaved={onSaved} close={close} />}
    </DialogShell>
  );
}

function CounselorForm({ counselor, onSaved, close }: { counselor?: Counselor; onSaved: () => void; close: () => void }) {
  const { form, input } = useForm({
    full_name: counselor?.full_name ?? "",
    title: counselor?.title ?? "",
    email: counselor?.email ?? "",
    phone: counselor?.phone ?? "",
  });

  return (
    <FormBody
      close={close}
      icon={<Monogram name={form.full_name || "?"} className="size-11 text-lg" />}
      title={counselor ? "Sửa cán bộ tư vấn" : "Thêm cán bộ tư vấn"}
      description="Người phụ trách buổi gặp và việc can thiệp."
      submitLabel={counselor ? "Lưu thay đổi" : "Thêm cán bộ"}
      onSubmit={async () => {
        await api(counselor ? `/counselors/${counselor.counselor_id}` : "/counselors", {
          method: counselor ? "PUT" : "POST",
          json: { ...form, email: form.email || null },
        });
        onSaved();
        return counselor ? "Đã lưu thông tin cán bộ" : `Đã thêm ${form.full_name}`;
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Họ và tên"><Input required autoFocus {...input("full_name")} /></Field>
        <Field label="Chức danh"><Input placeholder="Chuyên viên tư vấn" {...input("title")} /></Field>
        <Field label="Email"><Input type="email" {...input("email")} /></Field>
        <Field label="Số điện thoại"><Input {...input("phone")} /></Field>
      </div>
    </FormBody>
  );
}
