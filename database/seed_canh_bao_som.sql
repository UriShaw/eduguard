-- =====================================================================
-- EduGuard AI — DỮ LIỆU MẪU CHO TRANG "CẢNH BÁO SỚM"
--
-- Mục đích: làm đầy cả ba danh sách trên trang Cảnh báo sớm.
--
--   1. Đang xấu đi nhanh  — hiện đang TRỐNG vì mỗi sinh viên mới chỉ có
--                           MỘT lần dự đoán, không có lần trước để so.
--                           Script này chèn thêm lần dự đoán CŨ HƠN với
--                           xác suất thấp hơn, tạo ra độ tăng ≥ 15 điểm %.
--   2. Chưa có kế hoạch   — đã có sẵn 10 sinh viên, script KHÔNG đụng vào.
--   3. Việc quá hạn       — hiện mới có 1 việc, script thêm 6 việc nữa.
--
-- ---------------------------------------------------------------------
-- CÁCH CHẠY
--
--   Cách 1 — dòng lệnh:
--       mysql -u root -p eduguard < seed_canh_bao_som.sql
--
--   Cách 2 — phpMyAdmin:
--       Chọn CSDL eduguard → tab SQL → dán toàn bộ file này → Go
--
-- ---------------------------------------------------------------------
-- CHẠY TRƯỚC KHI DÙNG FILE NÀY
--
--   python main.py init-db      (tạo lược đồ)
--   python main.py seed         (20 sinh viên mẫu)
--   python main.py train        (huấn luyện mô hình)
--   python main.py predict-all  (BẮT BUỘC — sinh lần dự đoán đầu tiên)
--
--   Phần 1 chỉ hoạt động khi bảng predictions ĐÃ CÓ dữ liệu, vì nó lấy
--   lần dự đoán mới nhất làm mốc rồi trừ đi để tạo lần dự đoán cũ.
--
-- ---------------------------------------------------------------------
-- LƯU Ý: file này chỉ THÊM dữ liệu, không xoá và không sửa dòng nào có
--        sẵn. Chạy lại nhiều lần sẽ sinh ra bản ghi trùng — muốn chạy
--        lại, xem phần HOÀN TÁC ở cuối file.
-- =====================================================================

SET NAMES utf8mb4;
USE eduguard;


-- =====================================================================
-- PHẦN 1 — DANH SÁCH "ĐANG XẤU ĐI NHANH"
-- ---------------------------------------------------------------------
-- Điều kiện hiển thị (backend/services/analytics.py, DETERIORATION_THRESHOLD):
--
--     (xác_suất_lần_mới_nhất − xác_suất_lần_liền_trước) × 100  ≥  15
--
-- Cách làm: với mỗi sinh viên dưới đây, chèn MỘT lần dự đoán có
-- created_at SỚM HƠN lần hiện tại và xác suất THẤP HƠN đúng `giam_bao_nhieu`.
-- Nhờ lấy mốc từ chính lần dự đoán mới nhất trong CSDL nên script chạy
-- đúng dù mô hình của bạn cho ra xác suất bao nhiêu.
-- =====================================================================

DROP TEMPORARY TABLE IF EXISTS tmp_xau_di;
CREATE TEMPORARY TABLE tmp_xau_di (
    student_code   VARCHAR(20)  NOT NULL,
    giam_bao_nhieu DECIMAL(5,4) NOT NULL,   -- chênh lệch xác suất muốn tạo ra
    so_ngay_truoc  INT          NOT NULL,   -- lần dự đoán cũ cách lần mới mấy ngày
    ghi_chu        VARCHAR(100) NOT NULL
);

INSERT INTO tmp_xau_di (student_code, giam_bao_nhieu, so_ngay_truoc, ghi_chu) VALUES
('SV20220011', 0.2200, 21, 'Hồ Phương Lan — tăng 22 điểm %'),
('SV20230013', 0.1800, 28, 'Lý Ngọc Mai — tăng 18 điểm %'),
('SV20240020', 0.2800, 14, 'Vũ Kim Trang — tăng 28 điểm %'),
('SV20220017', 0.2500, 24, 'Lê Thị Quỳnh — tăng 25 điểm %'),
('SV20240010', 0.1900, 30, 'Ngô Minh Khoa — tăng 19 điểm %'),
('SV20230019', 0.3200, 18, 'Hoàng Minh Thắng — tăng 32 điểm %'),
('SV20240009', 0.1600, 26, 'Đỗ Khánh Huyền — tăng 16 điểm %');


-- Lấy lần dự đoán MỚI NHẤT của từng sinh viên làm mốc, tính ra lần cũ.
-- Materialise sang bảng tạm trước khi INSERT để không vừa đọc vừa ghi
-- trên cùng bảng predictions.
DROP TEMPORARY TABLE IF EXISTS tmp_du_doan_cu;
CREATE TEMPORARY TABLE tmp_du_doan_cu AS
SELECT
    s.student_id,
    ROUND(moi_nhat.probability - t.giam_bao_nhieu, 4)                  AS probability,
    DATE_SUB(moi_nhat.created_at, INTERVAL t.so_ngay_truoc DAY)        AS created_at
FROM tmp_xau_di t
JOIN students s
     ON s.student_code = t.student_code
JOIN (
        SELECT p.student_id, p.probability, p.created_at
        FROM predictions p
        JOIN (
                SELECT student_id, MAX(created_at) AS max_at
                FROM predictions
                GROUP BY student_id
             ) m ON m.student_id = p.student_id AND m.max_at = p.created_at
     ) moi_nhat ON moi_nhat.student_id = s.student_id
-- Chỉ chèn khi trừ xong vẫn còn xác suất hợp lệ, để chênh lệch đúng bằng
-- `giam_bao_nhieu` chứ không bị kẹp về 0.
WHERE moi_nhat.probability >= t.giam_bao_nhieu + 0.0500;


INSERT INTO predictions
    (student_id, probability, risk_level, is_at_risk, model_version, shap_top_factors, created_at)
SELECT
    c.student_id,
    c.probability,
    CASE
        WHEN c.probability < 0.30 THEN 'Thấp'
        WHEN c.probability < 0.60 THEN 'Trung bình'
        WHEN c.probability < 0.80 THEN 'Cao'
        ELSE 'Rất cao'
    END,
    c.probability >= 0.50,
    'logistic_regression_20260815_0930',
    CAST(CONCAT(
        '[',
        '{"feature":"failed_subjects","label":"Số môn trượt","value":1.0,',
        ' "shap_value":0.4218,"effect":"increase"},',
        '{"feature":"attendance_score","label":"Điểm chuyên cần tổng hợp","value":0.74,',
        ' "shap_value":0.2105,"effect":"increase"},',
        '{"feature":"academic_score","label":"Điểm học tập tổng hợp","value":0.61,',
        ' "shap_value":0.1832,"effect":"increase"},',
        '{"feature":"engagement_score","label":"Điểm tương tác tổng hợp","value":0.68,',
        ' "shap_value":-0.1470,"effect":"decrease"},',
        '{"feature":"credits_completed","label":"Tín chỉ tích luỹ","value":88.0,',
        ' "shap_value":-0.0921,"effect":"decrease"}',
        ']'
    ) AS JSON),
    c.created_at
FROM tmp_du_doan_cu c;


-- =====================================================================
-- PHẦN 2 — DANH SÁCH "VIỆC QUÁ HẠN"
-- ---------------------------------------------------------------------
-- Điều kiện hiển thị: status <> 'completed'  AND  due_date < CURDATE()
--
-- Dùng DATE_SUB(CURDATE(), ...) thay vì ngày cố định để việc luôn quá hạn
-- dù bạn chạy file này vào thời điểm nào.
--
-- CHỈ thêm việc cho những sinh viên ĐÃ CÓ kế hoạch từ trước (SV 11, 13,
-- 14, 17, 19) — như vậy danh sách "Chưa có kế hoạch" giữ nguyên 10 người,
-- không bị hụt đi.
-- =====================================================================

INSERT INTO interventions
    (student_id, counselor_id, category, title, description, status, due_date, completed_at)
SELECT s.student_id, v.counselor_id, v.category, v.title, v.description,
       v.status, DATE_SUB(CURDATE(), INTERVAL v.tre_may_ngay DAY), NULL
FROM (
    SELECT 'SV20220011' AS code, 1 AS counselor_id, 'academic_counseling' AS category,
           'Nộp bù bài tập môn Lập trình hướng đối tượng' AS title,
           'Rà soát 4 bài còn thiếu, thống nhất hạn nộp bù với giảng viên bộ môn.' AS description,
           'in_progress' AS status, 12 AS tre_may_ngay
    UNION ALL SELECT 'SV20230013', 3, 'parental_outreach',
           'Trao đổi với gia đình về tình hình chuyên cần',
           'Gọi điện thông báo tỷ lệ vắng học và tìm hiểu nguyên nhân.',
           'not_started', 25
    UNION ALL SELECT 'SV20220017', 2, 'peer_tutoring',
           'Phụ đạo môn Cơ sở dữ liệu',
           'Ghép nhóm với sinh viên khá cùng lớp, học 2 buổi/tuần.',
           'in_progress', 7
    UNION ALL SELECT 'SV20230019', 4, 'financial_aid_review',
           'Bổ sung hồ sơ xin hỗ trợ tài chính',
           'Sinh viên còn thiếu giấy xác nhận hoàn cảnh của địa phương.',
           'in_progress', 18
    UNION ALL SELECT 'SV20240014', 2, 'advising',
           'Rà soát tiến độ tích luỹ tín chỉ',
           'Đối chiếu với chương trình đào tạo, lên kế hoạch học lại môn đã trượt.',
           'not_started', 40
    UNION ALL SELECT 'SV20220011', 2, 'advising',
           'Theo dõi việc học trên hệ thống trực tuyến',
           'Kiểm tra sinh viên có khó khăn về thiết bị hay kết nối mạng không.',
           'not_started', 5
) AS v
JOIN students s ON s.student_code = v.code;


-- =====================================================================
-- PHẦN 3 — BIÊN BẢN GẶP MẶT (tuỳ chọn)
-- ---------------------------------------------------------------------
-- Không ảnh hưởng tới trang Cảnh báo sớm, nhưng làm trang Hồ sơ sinh viên
-- có nội dung khi thầy bấm vào xem. Bỏ qua phần này cũng được.
-- =====================================================================

INSERT INTO meeting_logs
    (student_id, counselor_id, meeting_date, meeting_type, duration_minutes, notes)
SELECT s.student_id, v.counselor_id,
       DATE_SUB(CURDATE(), INTERVAL v.cach_may_ngay DAY),
       v.meeting_type, v.duration_minutes, v.notes
FROM (
    SELECT 'SV20220011' AS code, 1 AS counselor_id, 'academic_counseling' AS meeting_type,
           45 AS duration_minutes, 10 AS cach_may_ngay,
           'Sinh viên cho biết đang đi làm thêm ca tối nên khó theo kịp bài. Đã thống nhất giảm ca làm và tham gia nhóm phụ đạo.' AS notes
    UNION ALL SELECT 'SV20230013', 3, 'personal_check_in', 30, 18,
           'Sinh viên có dấu hiệu quá tải, lo lắng về kết quả học kỳ. Chuyển tiếp sang chuyên viên tư vấn tâm lý.'
    UNION ALL SELECT 'SV20220017', 2, 'academic_counseling', 40, 6,
           'Rà soát lại các môn đã trượt, lên kế hoạch đăng ký học lại trong học kỳ tới.'
    UNION ALL SELECT 'SV20240014', 4, 'financial_aid_review', 35, 32,
           'Hướng dẫn sinh viên hoàn thiện hồ sơ miễn giảm học phí. Còn thiếu giấy xác nhận của địa phương.'
    UNION ALL SELECT 'SV20230019', 4, 'parental_outreach', 25, 14,
           'Đã liên hệ phụ huynh, gia đình cho biết sẽ hỗ trợ thêm để sinh viên không phải đi làm thêm.'
) AS v
JOIN students s ON s.student_code = v.code;


-- =====================================================================
-- DỌN DẸP
-- =====================================================================
DROP TEMPORARY TABLE IF EXISTS tmp_xau_di;
DROP TEMPORARY TABLE IF EXISTS tmp_du_doan_cu;


-- =====================================================================
-- KIỂM TRA KẾT QUẢ
-- ---------------------------------------------------------------------
-- Chạy ba truy vấn dưới đây để đối chiếu với ba thẻ trên giao diện.
-- =====================================================================

-- ─── Thẻ 1: Đang xấu đi nhanh ────────────────────────────────────────
SELECT  s.student_code                                   AS 'Mã SV',
        s.full_name                                      AS 'Họ và tên',
        ROUND(truoc.probability * 100, 1)                AS 'Lần trước (%)',
        ROUND(moi.probability   * 100, 1)                AS 'Lần này (%)',
        ROUND((moi.probability - truoc.probability) * 100, 1) AS 'Tăng (điểm %)',
        moi.risk_level                                   AS 'Mức nguy cơ'
FROM students s
JOIN predictions moi
     ON moi.student_id = s.student_id
    AND moi.created_at = (SELECT MAX(created_at) FROM predictions
                          WHERE student_id = s.student_id)
JOIN predictions truoc
     ON truoc.student_id = s.student_id
    AND truoc.created_at = (SELECT MAX(created_at) FROM predictions
                            WHERE student_id = s.student_id
                              AND created_at < moi.created_at)
WHERE (moi.probability - truoc.probability) * 100 >= 15
ORDER BY (moi.probability - truoc.probability) DESC;


-- ─── Thẻ 2: Chưa có kế hoạch ─────────────────────────────────────────
SELECT  s.student_code                    AS 'Mã SV',
        s.full_name                       AS 'Họ và tên',
        s.class_name                      AS 'Lớp',
        ROUND(moi.probability * 100, 1)   AS 'Xác suất (%)',
        moi.risk_level                    AS 'Mức nguy cơ'
FROM students s
JOIN predictions moi
     ON moi.student_id = s.student_id
    AND moi.created_at = (SELECT MAX(created_at) FROM predictions
                          WHERE student_id = s.student_id)
WHERE moi.risk_level IN ('Cao', 'Rất cao')
  AND NOT EXISTS (SELECT 1 FROM interventions i
                  WHERE i.student_id = s.student_id
                    AND i.status <> 'completed')
ORDER BY moi.probability DESC;


-- ─── Thẻ 3: Việc quá hạn ─────────────────────────────────────────────
SELECT  s.student_code                              AS 'Mã SV',
        s.full_name                                 AS 'Họ và tên',
        i.title                                     AS 'Việc can thiệp',
        i.due_date                                  AS 'Hạn hoàn thành',
        DATEDIFF(CURDATE(), i.due_date)             AS 'Trễ (ngày)',
        i.status                                    AS 'Trạng thái'
FROM interventions i
JOIN students s ON s.student_id = i.student_id
WHERE i.status <> 'completed'
  AND i.due_date < CURDATE()
ORDER BY i.due_date;


-- =====================================================================
-- HOÀN TÁC — chạy nếu muốn xoá sạch dữ liệu do file này sinh ra
-- ---------------------------------------------------------------------
-- Bỏ dấu chú thích (--) ở đầu ba lệnh dưới rồi chạy.
--
-- Nhận diện dựa trên model_version riêng và các tiêu đề việc can thiệp
-- do file này đặt, nên KHÔNG đụng tới dữ liệu của seed.sql hay của
-- lệnh predict-all.
-- =====================================================================

-- DELETE FROM predictions
--  WHERE model_version = 'logistic_regression_20260815_0930';

-- DELETE FROM interventions
--  WHERE title IN ('Nộp bù bài tập môn Lập trình hướng đối tượng',
--                  'Trao đổi với gia đình về tình hình chuyên cần',
--                  'Phụ đạo môn Cơ sở dữ liệu',
--                  'Bổ sung hồ sơ xin hỗ trợ tài chính',
--                  'Rà soát tiến độ tích luỹ tín chỉ',
--                  'Theo dõi việc học trên hệ thống trực tuyến');

-- DELETE FROM meeting_logs
--  WHERE notes LIKE 'Sinh viên cho biết đang đi làm thêm ca tối%'
--     OR notes LIKE 'Sinh viên có dấu hiệu quá tải%'
--     OR notes LIKE 'Rà soát lại các môn đã trượt%'
--     OR notes LIKE 'Hướng dẫn sinh viên hoàn thiện hồ sơ miễn giảm%'
--     OR notes LIKE 'Đã liên hệ phụ huynh, gia đình cho biết%';
