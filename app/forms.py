"""
Toàn bộ biểu mẫu WTForms — nơi khai báo mọi ràng buộc kiểm tra phía server.

Ràng buộc được kiểm tra lại ở đây dù trình duyệt đã có min/max: dữ liệu từ
client không bao giờ đáng tin.

Mọi trường số dùng InputRequired, KHÔNG dùng DataRequired. DataRequired coi 0
là rỗng (0 là falsy trong Python) nên từ chối những giá trị hoàn toàn hợp lệ
và rất thường gặp: 0 môn trượt, 0 bài tập thiếu, 0 bài đăng diễn đàn.
InputRequired chỉ hỏi "có gửi dữ liệu lên không", đúng điều cần kiểm tra.
"""
from flask_wtf import FlaskForm
from wtforms import (BooleanField, DateField, FloatField, IntegerField,
                     PasswordField, SelectField, StringField, TextAreaField)
from wtforms.validators import (Email, InputRequired, Length, NumberRange,
                                Optional)

from app.ml.features import RAW_FEATURES
from app.models import Intervention, MeetingLog


def _count(label: str) -> IntegerField:
    """Trường số nguyên không âm — dạng lặp lại nhiều nhất trong các biểu mẫu."""
    return IntegerField(label, validators=[InputRequired(), NumberRange(min=0)])


# ---------------------------------------------------------------------------
# Đăng nhập
# ---------------------------------------------------------------------------

class LoginForm(FlaskForm):
    username = StringField("Tên đăng nhập", validators=[InputRequired(), Length(max=50)])
    password = PasswordField("Mật khẩu", validators=[InputRequired()])
    remember_me = BooleanField("Ghi nhớ đăng nhập")


# ---------------------------------------------------------------------------
# Hồ sơ sinh viên
# ---------------------------------------------------------------------------

class StudentForm(FlaskForm):
    student_code = StringField("Mã sinh viên", validators=[InputRequired(), Length(max=20)],
                               render_kw={"placeholder": "VD: SV20250001"})
    full_name = StringField("Họ và tên", validators=[InputRequired(), Length(max=150)])
    email = StringField("Email", validators=[Optional(), Email(), Length(max=150)])
    phone = StringField("Số điện thoại", validators=[Optional(), Length(max=20)])
    class_name = StringField("Lớp", validators=[Optional(), Length(max=50)],
                             render_kw={"placeholder": "VD: CNTT-K25-01"})
    major = StringField("Ngành", validators=[Optional(), Length(max=100)])
    enrollment_year = IntegerField("Năm nhập học",
                                   validators=[Optional(), NumberRange(min=2000, max=2100)])
    status = SelectField("Trạng thái", default="active", choices=[
        ("active", "Đang học"),
        ("dropped", "Đã nghỉ"),
        ("graduated", "Đã tốt nghiệp"),
    ])
    # Lựa chọn nạp trong controller vì phụ thuộc dữ liệu.
    advisor_user_id = SelectField("Giảng viên phụ trách", coerce=int, validators=[Optional()])


# ---------------------------------------------------------------------------
# Dự đoán — mười trường khớp đúng RAW_FEATURES trong app/ml/features.py
# ---------------------------------------------------------------------------

class PredictionForm(FlaskForm):
    gpa = FloatField("Điểm trung bình (GPA)", validators=[
        InputRequired(message="Vui lòng nhập GPA."),
        NumberRange(min=0, max=10, message="GPA phải nằm trong khoảng 0 đến 10."),
    ])
    failed_subjects = _count("Số môn trượt")
    credits_completed = _count("Tín chỉ tích luỹ")
    attendance_rate = FloatField("Tỷ lệ chuyên cần (%)", validators=[
        InputRequired(),
        NumberRange(min=0, max=100, message="Tỷ lệ chuyên cần phải nằm trong khoảng 0 đến 100."),
    ])
    login_count = _count("Số lần đăng nhập")
    assignment_submitted = _count("Bài tập đã nộp")
    assignment_missing = _count("Bài tập còn thiếu")
    forum_posts = _count("Bài đăng diễn đàn")
    video_views = _count("Lượt xem bài giảng")
    learning_hours = FloatField("Số giờ học trên hệ thống",
                                validators=[InputRequired(), NumberRange(min=0)])

    def to_features(self) -> dict:
        """Dữ liệu đã kiểm tra, đúng khoá mà model cần."""
        return {name: getattr(self, name).data for name in RAW_FEATURES}


class MetricsForm(PredictionForm):
    """
    Nhập một lát cắt chỉ số: đủ mười trường của dự đoán, cộng thêm các trường
    chỉ để lưu trữ mà model không dùng.

    Kế thừa PredictionForm thay vì khai báo lại, để hai biểu mẫu không bao giờ
    lệch nhau về ràng buộc của cùng một chỉ số.
    """
    semester = StringField("Học kỳ", validators=[InputRequired(), Length(max=20)],
                           render_kw={"placeholder": "VD: 2025.1"})
    credits_registered = _count("Tín chỉ đăng ký trong kỳ")
    total_sessions = _count("Tổng số buổi")
    absent_sessions = _count("Số buổi vắng")

    def validate(self, extra_validators=None) -> bool:
        if not super().validate(extra_validators):
            return False

        if self.absent_sessions.data > self.total_sessions.data:
            self.absent_sessions.errors.append("Số buổi vắng không thể lớn hơn tổng số buổi.")
            return False

        return True


# ---------------------------------------------------------------------------
# Hỗ trợ sinh viên
# ---------------------------------------------------------------------------

class MeetingForm(FlaskForm):
    meeting_date = DateField("Ngày gặp", validators=[InputRequired()])
    # Lựa chọn lấy thẳng từ nhãn khai báo trong model, để thêm loại mới chỉ
    # phải sửa một nơi.
    meeting_type = SelectField("Nội dung buổi gặp", choices=list(MeetingLog.TYPE_LABELS.items()),
                               validators=[InputRequired()])
    duration_minutes = IntegerField("Thời lượng (phút)", default=30,
                                    validators=[InputRequired(), NumberRange(min=1, max=480)])
    counselor_id = SelectField("Cố vấn phụ trách", coerce=int, validators=[Optional()])
    notes = TextAreaField("Ghi chú", validators=[Optional(), Length(max=4000)])


class InterventionForm(FlaskForm):
    category = SelectField("Loại can thiệp", choices=list(Intervention.CATEGORY_LABELS.items()),
                           validators=[InputRequired()])
    title = StringField("Việc cần làm", validators=[InputRequired(), Length(max=255)],
                        render_kw={"placeholder": "VD: Xếp lịch phụ đạo môn Giải tích"})
    description = TextAreaField("Mô tả chi tiết", validators=[Optional(), Length(max=4000)])
    due_date = DateField("Hạn hoàn thành", validators=[Optional()])
