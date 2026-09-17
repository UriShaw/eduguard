/**
 * Giao tiếp với backend: kiểu dữ liệu, hàm gọi API, hook SWR.
 *
 * Kiểu ở đây phải khớp models/schemas.py và các controller của FastAPI. Mọi lời
 * gọi đi qua /api cùng nguồn (Next.js chuyển tiếp), nên cookie đăng nhập tự kèm.
 */
import useSWR, { type SWRConfiguration } from "swr";

// ===== Kiểu dữ liệu =====

export type Role = "admin" | "lecturer" | "student";
export type RiskLevel = "Thấp" | "Trung bình" | "Cao" | "Rất cao";
export type StudentStatus = "active" | "dropped" | "graduated";
export type InterventionStatus = "not_started" | "in_progress" | "completed";

export interface User {
  user_id: number;
  username: string;
  full_name: string;
  role: Role;
  student_id: number | null;
}

export interface Features {
  gpa: number;
  failed_subjects: number;
  credits_completed: number;
  attendance_rate: number;
  login_count: number;
  assignment_submitted: number;
  assignment_missing: number;
  forum_posts: number;
  video_views: number;
  learning_hours: number;
}
export type FeatureKey = keyof Features;

export interface Student {
  student_id: number;
  student_code: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  class_name: string | null;
  major: string | null;
  enrollment_year: number | null;
  status: StudentStatus;
  advisor_user_id: number | null;
}

export interface StudentRow extends Student {
  gpa: number | null;
  attendance_rate: number | null;
  risk_level: RiskLevel | null;
  probability: number | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
}

export interface Factor {
  feature: string;
  label: string;
  value: number;
  shap_value: number;
  effect: "increase" | "decrease";
}

export interface Suggestion {
  category: string;
  title: string;
  description: string;
  reason: string;
}

export interface Prediction {
  prediction_id: number;
  probability: number;
  risk_level: RiskLevel;
  is_at_risk: boolean;
  model_version: string;
  shap_top_factors: Factor[] | null;
  created_at: string;
}

export interface Meeting {
  meeting_id: number;
  meeting_date: string;
  meeting_type: string;
  type_label: string;
  duration_minutes: number;
  notes: string | null;
  counselor: string | null;
}

export interface Intervention {
  intervention_id: number;
  category: string;
  category_label: string;
  title: string;
  description: string | null;
  status: InterventionStatus;
  due_date: string | null;
  completed_at: string | null;
  counselor: string | null;
  is_overdue: boolean;
}

export interface TrendPoint {
  semester: string;
  gpa: number;
  attendance: number | null;
  risk: number | null;
}

export interface StudentDetail {
  student: Student;
  advisor: string | null;
  can_edit: boolean;
  is_admin: boolean;
  features: Record<FeatureKey, number | null>;
  features_complete: boolean;
  latest_metrics: { semester: string; recorded_at: string } | null;
  prediction: Prediction | null;
  previous_probability: number | null;
  suggestions: Suggestion[];
  trend: TrendPoint[];
  meetings: Meeting[];
  interventions: Intervention[];
}

export interface Options {
  classes: string[];
  lecturers: { id: number; name: string }[];
  counselors: { id: number; name: string }[];
  meeting_types: Record<string, string>;
  intervention_categories: Record<string, string>;
  intervention_statuses: Record<InterventionStatus, string>;
  features: Record<FeatureKey, string>;
}

export interface Dashboard {
  summary: {
    total_students: number;
    predicted: number;
    not_predicted: number;
    distribution: Record<RiskLevel, number>;
    at_risk: number;
  };
  by_class: { class_name: string; count: number }[];
  scatter: { gpa: number; attendance: number; risk: number; level: RiskLevel }[];
  alerts: number;
  model: { version: string; name: string; trained_at: string; metrics: Record<string, number> } | null;
}

export interface AlertCard {
  student_id: number;
  student_code: string;
  full_name: string;
  class_name: string | null;
  risk_level: RiskLevel | null;
  probability: number | null;
}

export interface Alerts {
  worsening: (AlertCard & { delta: number; from: number; to: number })[];
  unplanned: AlertCard[];
  overdue: (AlertCard & { intervention_id: number; title: string; due_date: string; days_overdue: number })[];
}

export interface PredictionResult {
  probability: number;
  risk_level: RiskLevel;
  is_at_risk: boolean;
  model_version: string;
}

export interface SimulationResult {
  before: PredictionResult;
  after: PredictionResult;
  delta: number;
  outside_training_range: string[];
}

// ===== Gọi API =====

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Gom thông điệp lỗi của FastAPI (chuỗi hoặc danh sách lỗi kiểm tra 422) thành một câu. */
function describe(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((d) => (d as { msg?: string }).msg ?? "Dữ liệu không hợp lệ").join("; ");
  }
  return "Đã có lỗi xảy ra";
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const response = await fetch(`/api${path}`, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...headers } : headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  if (response.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/login")) {
    // Phiên hết hạn giữa chừng: về trang đăng nhập, quay lại đúng trang đang xem sau đó.
    // Cố ý tải lại toàn trang thay vì router.push: xoá sạch cache SWR đang giữ dữ liệu của
    // phiên cũ, để người đăng nhập tiếp theo trên cùng máy không thấy lại dữ liệu đó.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, describe(body.detail));
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export function useApi<T>(path: string | null, config?: SWRConfiguration<T>) {
  return useSWR<T>(path, (p: string) => api<T>(p), { revalidateOnFocus: false, ...config });
}

// ===== Định dạng =====

export const RISK_LEVELS: RiskLevel[] = ["Thấp", "Trung bình", "Cao", "Rất cao"];

export const STATUS_LABELS: Record<StudentStatus, string> = {
  active: "Đang học",
  dropped: "Đã nghỉ",
  graduated: "Đã tốt nghiệp",
};

export const percent = (value: number | null | undefined, digits = 0) =>
  value == null ? "—" : `${(value * 100).toFixed(digits)}%`;

export const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("vi-VN") : "—";
