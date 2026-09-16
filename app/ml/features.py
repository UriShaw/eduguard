"""
Khai báo tập trung mọi thứ liên quan đến feature và ngưỡng rủi ro.

Đây là nơi DUY NHẤT định nghĩa tên feature và ngưỡng phân mức. Không hard-code
lại ở chỗ khác: model, form nhập liệu, API và phần giải thích SHAP đều phải
nhìn thấy cùng một danh sách theo đúng một thứ tự.
"""

# Mười chỉ số người dùng nhập vào, đúng thứ tự cột mà pipeline mong đợi.
RAW_FEATURES = [
    "gpa",
    "failed_subjects",
    "credits_completed",
    "attendance_rate",
    "login_count",
    "assignment_submitted",
    "assignment_missing",
    "forum_posts",
    "video_views",
    "learning_hours",
]

# Ba feature do FeatureEngineer tính thêm từ 10 feature trên.
ENGINEERED_FEATURES = ["academic_score", "attendance_score", "engagement_score"]

ALL_FEATURES = RAW_FEATURES + ENGINEERED_FEATURES

TARGET_COLUMN = "dropout_risk"

# Nhãn tiếng Việt để hiển thị, khớp đúng tên cột trong CSDL.
FEATURE_LABELS = {
    "gpa": "Điểm trung bình (GPA)",
    "failed_subjects": "Số môn trượt",
    "credits_completed": "Tín chỉ tích luỹ",
    "attendance_rate": "Tỷ lệ chuyên cần",
    "login_count": "Số lần đăng nhập",
    "assignment_submitted": "Bài tập đã nộp",
    "assignment_missing": "Bài tập còn thiếu",
    "forum_posts": "Bài đăng diễn đàn",
    "video_views": "Lượt xem bài giảng",
    "learning_hours": "Số giờ học trên hệ thống",
    "academic_score": "Điểm học tập tổng hợp",
    "attendance_score": "Điểm chuyên cần tổng hợp",
    "engagement_score": "Điểm tương tác tổng hợp",
}

# Ngưỡng chia 4 mức nguy cơ theo xác suất model trả về: (cận dưới, cận trên, nhãn).
# Cận trên của mức cuối là 1.01 để bao được đúng giá trị 1.0.
RISK_THRESHOLDS = [
    (0.00, 0.30, "Thấp"),
    (0.30, 0.60, "Trung bình"),
    (0.60, 0.80, "Cao"),
    (0.80, 1.01, "Rất cao"),
]

RISK_LEVELS = [label for _, _, label in RISK_THRESHOLDS]

# Hai mức được coi là cần can thiệp, dùng thống nhất ở dashboard và báo cáo.
AT_RISK_LEVELS = ("Cao", "Rất cao")


def risk_level_for(probability: float) -> str:
    """Quy xác suất về một trong bốn mức nguy cơ."""
    for low, high, label in RISK_THRESHOLDS:
        if low <= probability < high:
            return label
    raise ValueError(f"Xác suất {probability} nằm ngoài khoảng [0, 1]")


def feature_label(name: str) -> str:
    return FEATURE_LABELS.get(name, name)
