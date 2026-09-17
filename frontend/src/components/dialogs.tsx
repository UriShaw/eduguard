"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, useApi, type Options, type Student } from "@/lib/api";
import { cn } from "cn";

const today = () => new Date().toISOString().slice(0, 10);

// ===== Khung chung =====

/**
 * Hộp thoại biểu mẫu: tự lo trạng thái đang gửi, báo lỗi, báo thành công, đóng lại.
 * Mỗi biểu mẫu cụ thể chỉ còn khai báo các ô nhập và dữ liệu gửi đi.
 */
function FormDialog({ trigger, title, description, submitLabel, onSubmit, children, wide }: {
  trigger: React.ReactNode;
  title: string;
  description?: string;
  submitLabel: string;
  onSubmit: () => Promise<string | void>;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const message = await onSubmit();
      toast.success(message ?? "Đã lưu");
      setOpen(false);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={cn(wide && "sm:max-w-2xl")}>
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          {children}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Huỷ</Button>
            <Button type="submit" disabled={busy}>{busy ? "Đang lưu…" : submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, hint, className, children }: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Choice({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
  placeholder?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {options.map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

/** Ô chọn Radix không nhận giá trị rỗng, nên "không chọn" được biểu diễn bằng "none". */
const NONE = "none";
const idOrNull = (value: string) => (value === NONE ? null : Number(value));

// ===== Sinh viên =====

export function StudentDialog({ student, trigger, onSaved }: {
  student?: Student;
  trigger: React.ReactNode;
  onSaved: (student: Student) => void;
}) {
  const { data: options } = useApi<Options>("/options");
  const [form, setForm] = useState({
    student_code: student?.student_code ?? "",
    full_name: student?.full_name ?? "",
    email: student?.email ?? "",
    phone: student?.phone ?? "",
    class_name: student?.class_name ?? "",
    major: student?.major ?? "",
    enrollment_year: student?.enrollment_year?.toString() ?? String(new Date().getFullYear()),
    status: student?.status ?? "active",
    advisor: student?.advisor_user_id?.toString() ?? NONE,
  });
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <FormDialog
      trigger={trigger}
      title={student ? "Sửa hồ sơ sinh viên" : "Thêm sinh viên"}
      submitLabel={student ? "Lưu thay đổi" : "Thêm sinh viên"}
      wide
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
        <Field label="Mã sinh viên">
          <Input required value={form.student_code} onChange={(e) => set("student_code")(e.target.value)} />
        </Field>
        <Field label="Họ và tên">
          <Input required value={form.full_name} onChange={(e) => set("full_name")(e.target.value)} />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(e) => set("email")(e.target.value)} />
        </Field>
        <Field label="Số điện thoại">
          <Input value={form.phone} onChange={(e) => set("phone")(e.target.value)} />
        </Field>
        <Field label="Lớp">
          <Input value={form.class_name} placeholder="CNTT-K25-01" onChange={(e) => set("class_name")(e.target.value)} />
        </Field>
        <Field label="Ngành">
          <Input value={form.major} onChange={(e) => set("major")(e.target.value)} />
        </Field>
        <Field label="Năm nhập học">
          <Input type="number" min={2000} max={2100} value={form.enrollment_year}
                 onChange={(e) => set("enrollment_year")(e.target.value)} />
        </Field>
        <Field label="Trạng thái">
          <Choice value={form.status} onChange={set("status")}
                  options={[["active", "Đang học"], ["dropped", "Đã nghỉ"], ["graduated", "Đã tốt nghiệp"]]} />
        </Field>
        <Field label="Giảng viên phụ trách" className="sm:col-span-2"
               hint="Chỉ giảng viên được gán mới nhập chỉ số và chạy dự đoán cho sinh viên này.">
          <Choice value={form.advisor} onChange={set("advisor")}
                  options={[[NONE, "— Chưa gán —"], ...(options?.lecturers ?? []).map((l) => [String(l.id), l.name] as [string, string])]} />
        </Field>
      </div>
    </FormDialog>
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

export function MetricsDialog({ studentId, initial, trigger, onSaved }: {
  studentId: number;
  initial: Record<string, number | null>;
  trigger: React.ReactNode;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => ({
    semester: "",
    ...Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, v == null ? "" : String(v)])),
  }));

  return (
    <FormDialog
      trigger={trigger}
      title="Nhập chỉ số học tập"
      description="Tạo một bản ghi mới, không ghi đè dữ liệu cũ. Đã điền sẵn số liệu gần nhất để chỉ cần sửa phần thay đổi."
      submitLabel="Lưu chỉ số"
      wide
      onSubmit={async () => {
        await api(`/students/${studentId}/metrics`, {
          method: "POST",
          json: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, k === "semester" ? v : Number(v)])),
        });
        onSaved();
        return "Đã ghi nhận chỉ số mới";
      }}
    >
      <Field label="Học kỳ">
        <Input required placeholder="2025.2" value={values.semester}
               onChange={(e) => setValues((v) => ({ ...v, semester: e.target.value }))} />
      </Field>
      {METRIC_FIELDS.map(({ group, fields }) => (
        <fieldset key={group} className="space-y-3">
          <legend className="text-sm font-semibold">{group}</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {fields.map(([key, label, step]) => (
              <Field key={key} label={label}>
                <Input required type="number" min={0} step={step ?? "1"} value={values[key] ?? ""}
                       onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))} />
              </Field>
            ))}
          </div>
        </fieldset>
      ))}
    </FormDialog>
  );
}

// ===== Hỗ trợ sinh viên =====

export function MeetingDialog({ studentId, trigger, onSaved }: {
  studentId: number;
  trigger: React.ReactNode;
  onSaved: () => void;
}) {
  const { data: options } = useApi<Options>("/options");
  const [form, setForm] = useState({ meeting_date: today(), meeting_type: "academic_counseling",
                                     duration_minutes: "30", counselor: NONE, notes: "" });

  return (
    <FormDialog
      trigger={trigger}
      title="Ghi biên bản gặp mặt"
      submitLabel="Lưu biên bản"
      onSubmit={async () => {
        await api(`/students/${studentId}/meetings`, {
          method: "POST",
          json: { ...form, duration_minutes: Number(form.duration_minutes), counselor_id: idOrNull(form.counselor) },
        });
        onSaved();
        return "Đã lưu biên bản";
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Ngày gặp">
          <Input type="date" required value={form.meeting_date}
                 onChange={(e) => setForm((f) => ({ ...f, meeting_date: e.target.value }))} />
        </Field>
        <Field label="Thời lượng (phút)">
          <Input type="number" min={1} max={480} value={form.duration_minutes}
                 onChange={(e) => setForm((f) => ({ ...f, duration_minutes: e.target.value }))} />
        </Field>
        <Field label="Nội dung buổi gặp">
          <Choice value={form.meeting_type} onChange={(v) => setForm((f) => ({ ...f, meeting_type: v }))}
                  options={Object.entries(options?.meeting_types ?? {})} />
        </Field>
        <Field label="Cố vấn">
          <Choice value={form.counselor} onChange={(v) => setForm((f) => ({ ...f, counselor: v }))}
                  options={[[NONE, "— Không chỉ định —"], ...(options?.counselors ?? []).map((c) => [String(c.id), c.name] as [string, string])]} />
        </Field>
      </div>
      <Field label="Ghi chú">
        <Textarea rows={4} placeholder="Sinh viên trình bày điều gì, hai bên thống nhất làm gì tiếp theo…"
                  value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
      </Field>
    </FormDialog>
  );
}

export function InterventionDialog({ studentId, trigger, onSaved }: {
  studentId: number;
  trigger: React.ReactNode;
  onSaved: () => void;
}) {
  const { data: options } = useApi<Options>("/options");
  const [form, setForm] = useState({ category: "academic_counseling", title: "", description: "", due_date: "" });

  return (
    <FormDialog
      trigger={trigger}
      title="Thêm việc can thiệp"
      submitLabel="Thêm vào kế hoạch"
      onSubmit={async () => {
        await api(`/students/${studentId}/interventions`, {
          method: "POST",
          json: { ...form, due_date: form.due_date || null },
        });
        onSaved();
        return "Đã thêm việc cần làm";
      }}
    >
      <Field label="Loại can thiệp">
        <Choice value={form.category} onChange={(v) => setForm((f) => ({ ...f, category: v }))}
                options={Object.entries(options?.intervention_categories ?? {})} />
      </Field>
      <Field label="Việc cần làm">
        <Input required placeholder="Xếp lịch phụ đạo môn Giải tích" value={form.title}
               onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
      </Field>
      <Field label="Mô tả">
        <Textarea rows={3} value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </Field>
      <Field label="Hạn hoàn thành">
        <Input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
      </Field>
    </FormDialog>
  );
}
