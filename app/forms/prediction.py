"""
Biểu mẫu nhập chỉ số để dự đoán.

Mười trường ở đây khớp đúng RAW_FEATURES trong app/ml/features.py. Ràng buộc
được kiểm tra lại ở phía server dù trình duyệt đã có min/max: dữ liệu từ
client không bao giờ đáng tin, và API cũng dùng lại chính các giới hạn này.
"""
from flask_wtf import FlaskForm
from wtforms import FloatField, IntegerField
from wtforms.validators import InputRequired, NumberRange


class PredictionForm(FlaskForm):
    gpa = FloatField("Điểm trung bình (GPA)", validators=[
        InputRequired(message="Vui lòng nhập GPA."),
        NumberRange(min=0, max=10, message="GPA phải nằm trong khoảng 0 đến 10."),
    ])
    failed_subjects = IntegerField("Số môn trượt", validators=[
        InputRequired(), NumberRange(min=0, message="Số môn trượt không thể âm."),
    ])
    credits_completed = IntegerField("Tín chỉ tích luỹ", validators=[
        InputRequired(), NumberRange(min=0),
    ])
    attendance_rate = FloatField("Tỷ lệ chuyên cần (%)", validators=[
        InputRequired(),
        NumberRange(min=0, max=100, message="Tỷ lệ chuyên cần phải nằm trong khoảng 0 đến 100."),
    ])
    login_count = IntegerField("Số lần đăng nhập", validators=[
        InputRequired(), NumberRange(min=0),
    ])
    assignment_submitted = IntegerField("Bài tập đã nộp", validators=[
        InputRequired(), NumberRange(min=0),
    ])
    assignment_missing = IntegerField("Bài tập còn thiếu", validators=[
        InputRequired(), NumberRange(min=0),
    ])
    forum_posts = IntegerField("Bài đăng diễn đàn", validators=[
        InputRequired(), NumberRange(min=0),
    ])
    video_views = IntegerField("Lượt xem bài giảng", validators=[
        InputRequired(), NumberRange(min=0),
    ])
    learning_hours = FloatField("Số giờ học trên hệ thống", validators=[
        InputRequired(), NumberRange(min=0),
    ])

    def to_features(self) -> dict:
        """Chuyển dữ liệu đã kiểm tra thành dict đúng khoá mà model cần."""
        from app.ml.features import RAW_FEATURES

        return {name: getattr(self, name).data for name in RAW_FEATURES}
