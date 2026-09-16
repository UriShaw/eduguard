"""
Biểu mẫu hồ sơ sinh viên và biểu mẫu nhập chỉ số.

Mọi trường số đều dùng InputRequired chứ không phải DataRequired.
DataRequired coi giá trị 0 là rỗng (0 là falsy trong Python) nên sẽ từ chối
những giá trị hoàn toàn hợp lệ: 0 môn trượt, 0 bài tập thiếu, 0 bài đăng
diễn đàn. InputRequired chỉ hỏi "có gửi dữ liệu lên không", đúng điều cần.
"""
from flask_wtf import FlaskForm
from wtforms import FloatField, IntegerField, SelectField, StringField
from wtforms.validators import (Email, InputRequired, Length, NumberRange,
                                Optional)


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
    # Lựa chọn được nạp trong view vì phụ thuộc dữ liệu; chỉ quản trị viên thấy.
    advisor_user_id = SelectField("Giảng viên phụ trách", coerce=int, validators=[Optional()])


class MetricsForm(FlaskForm):
    semester = StringField("Học kỳ", validators=[InputRequired(), Length(max=20)],
                           render_kw={"placeholder": "VD: 2025.1"})

    # --- Kết quả học tập ---
    gpa = FloatField("Điểm trung bình (GPA)",
                     validators=[InputRequired(), NumberRange(min=0, max=10)])
    failed_subjects = IntegerField("Số môn trượt",
                                   validators=[InputRequired(), NumberRange(min=0)])
    credits_completed = IntegerField("Tín chỉ tích luỹ",
                                     validators=[InputRequired(), NumberRange(min=0)])
    credits_registered = IntegerField("Tín chỉ đăng ký trong kỳ",
                                      validators=[InputRequired(), NumberRange(min=0)])

    # --- Chuyên cần ---
    attendance_rate = FloatField("Tỷ lệ chuyên cần (%)",
                                 validators=[InputRequired(), NumberRange(min=0, max=100)])
    total_sessions = IntegerField("Tổng số buổi",
                                  validators=[InputRequired(), NumberRange(min=0)])
    absent_sessions = IntegerField("Số buổi vắng",
                                   validators=[InputRequired(), NumberRange(min=0)])

    # --- Tương tác học tập ---
    login_count = IntegerField("Số lần đăng nhập",
                               validators=[InputRequired(), NumberRange(min=0)])
    assignment_submitted = IntegerField("Bài tập đã nộp",
                                        validators=[InputRequired(), NumberRange(min=0)])
    assignment_missing = IntegerField("Bài tập còn thiếu",
                                      validators=[InputRequired(), NumberRange(min=0)])
    forum_posts = IntegerField("Bài đăng diễn đàn",
                               validators=[InputRequired(), NumberRange(min=0)])
    video_views = IntegerField("Lượt xem bài giảng",
                               validators=[InputRequired(), NumberRange(min=0)])
    learning_hours = FloatField("Số giờ học trên hệ thống",
                                validators=[InputRequired(), NumberRange(min=0)])

    def validate(self, extra_validators=None) -> bool:
        """Số buổi vắng không thể lớn hơn tổng số buổi."""
        if not super().validate(extra_validators):
            return False

        if self.absent_sessions.data > self.total_sessions.data:
            self.absent_sessions.errors.append("Số buổi vắng không thể lớn hơn tổng số buổi.")
            return False

        return True
