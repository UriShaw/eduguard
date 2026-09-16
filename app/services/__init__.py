"""
Tầng Model (MVC) — phần luật nghiệp vụ.

Controller chỉ nhận request, gọi service, rồi chọn View. Mọi truy vấn và
luật nghiệp vụ nằm ở đây, nhờ vậy cùng một logic dùng được cho giao diện
web, REST API và script chạy nền mà không phải viết lại lần nào.

Ranh giới cần giữ: service không import flask.request và không trả về
Response. Nhận vào dữ liệu đã bóc tách, trả ra dữ liệu thuần — có vậy mới
gọi được từ ngoài ngữ cảnh HTTP.
"""
