"""Biểu mẫu biên bản gặp mặt và kế hoạch can thiệp."""
from flask_wtf import FlaskForm
from wtforms import (DateField, IntegerField, SelectField, StringField,
                     TextAreaField)
from wtforms.validators import InputRequired, Length, NumberRange, Optional

from app.models import Intervention, MeetingLog

# Lựa chọn lấy thẳng từ nhãn khai báo trong model, để thêm một loại mới chỉ
# phải sửa model chứ không phải nhớ cập nhật cả hai nơi.
MEETING_TYPES = list(MeetingLog.TYPE_LABELS.items())
INTERVENTION_CATEGORIES = list(Intervention.CATEGORY_LABELS.items())


class MeetingForm(FlaskForm):
    meeting_date = DateField("Ngày gặp", validators=[InputRequired()])
    meeting_type = SelectField("Nội dung buổi gặp", choices=MEETING_TYPES,
                               validators=[InputRequired()])
    duration_minutes = IntegerField("Thời lượng (phút)", default=30,
                                    validators=[InputRequired(), NumberRange(min=1, max=480)])
    counselor_id = SelectField("Cố vấn phụ trách", coerce=int, validators=[Optional()])
    notes = TextAreaField("Ghi chú", validators=[Optional(), Length(max=4000)])


class InterventionForm(FlaskForm):
    category = SelectField("Loại can thiệp", choices=INTERVENTION_CATEGORIES,
                           validators=[InputRequired()])
    title = StringField("Việc cần làm", validators=[InputRequired(), Length(max=255)],
                        render_kw={"placeholder": "VD: Xếp lịch phụ đạo môn Giải tích"})
    description = TextAreaField("Mô tả chi tiết", validators=[Optional(), Length(max=4000)])
    due_date = DateField("Hạn hoàn thành", validators=[Optional()])
