from flask_wtf import FlaskForm
from wtforms import BooleanField, PasswordField, StringField
from wtforms.validators import InputRequired, Length


class LoginForm(FlaskForm):
    username = StringField("Tên đăng nhập", validators=[InputRequired(), Length(max=50)])
    password = PasswordField("Mật khẩu", validators=[InputRequired()])
    remember_me = BooleanField("Ghi nhớ đăng nhập")
