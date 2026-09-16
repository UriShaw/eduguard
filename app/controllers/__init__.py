"""
Tầng Controller của mô hình MVC.

Nhiệm vụ duy nhất: nhận HTTP request, kiểm tra quyền, gọi tầng Model
(app/services), rồi chọn View để render hoặc trả JSON. Không có truy vấn
CSDL và không có luật nghiệp vụ nào được viết ở đây.
"""
