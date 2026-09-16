-- =====================================================================
-- EduGuard AI — lược đồ CSDL MySQL 8.0
--
-- Chạy:  mysql -u root -p < database/schema.sql
-- Script này TẠO LẠI TỪ ĐẦU: mọi dữ liệu cũ trong CSDL cùng tên sẽ mất.
-- =====================================================================

-- Khai báo bộ ký tự của CHÍNH FILE NÀY trước mọi câu lệnh. File lưu UTF-8 và
-- có giá trị ENUM tiếng Việt (predictions.risk_level). Thiếu dòng này, client
-- nạp file bằng latin1 sẽ lưu ENUM sai thành 'Tháº¥p', khiến mọi lần ghi dự
-- đoán về sau chết với lỗi #1265 "Data truncated for column 'risk_level'".
SET NAMES utf8mb4;

DROP DATABASE IF EXISTS eduguard;
CREATE DATABASE eduguard CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE eduguard;


-- ---------------------------------------------------------------------
-- users — tài khoản đăng nhập, 3 vai trò
--   admin    : toàn quyền
--   lecturer : chỉ thao tác trên sinh viên mình phụ trách
--   student  : chỉ xem hồ sơ của chính mình
-- ---------------------------------------------------------------------
CREATE TABLE users (
    user_id       INT AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(50)  NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(150) NOT NULL,
    email         VARCHAR(150) NULL,
    role          ENUM('admin', 'lecturer', 'student') NOT NULL,
    -- Chỉ có giá trị khi role='student': hồ sơ sinh viên mà tài khoản này sở hữu.
    student_id    INT          NULL,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_users_username UNIQUE (username),
    CONSTRAINT uq_users_email    UNIQUE (email),
    INDEX idx_users_role (role)
) ENGINE = InnoDB;


-- ---------------------------------------------------------------------
-- students — hồ sơ sinh viên
-- ---------------------------------------------------------------------
CREATE TABLE students (
    student_id      INT AUTO_INCREMENT PRIMARY KEY,
    student_code    VARCHAR(20)  NOT NULL,
    full_name       VARCHAR(150) NOT NULL,
    email           VARCHAR(150) NULL,
    phone           VARCHAR(20)  NULL,
    class_name      VARCHAR(50)  NULL,
    major           VARCHAR(100) NULL,
    enrollment_year SMALLINT     NULL,
    status          ENUM('active', 'dropped', 'graduated') NOT NULL DEFAULT 'active',
    -- Giảng viên phụ trách; khoá ngoại được thêm ở cuối file (xem ghi chú).
    advisor_user_id INT          NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT uq_students_code  UNIQUE (student_code),
    CONSTRAINT uq_students_email UNIQUE (email),
    INDEX idx_students_class   (class_name),
    INDEX idx_students_status  (status),
    INDEX idx_students_advisor (advisor_user_id)
) ENGINE = InnoDB;


-- ---------------------------------------------------------------------
-- academic_results — kết quả học tập theo từng học kỳ
-- ---------------------------------------------------------------------
CREATE TABLE academic_results (
    result_id          INT AUTO_INCREMENT PRIMARY KEY,
    student_id         INT          NOT NULL,
    semester           VARCHAR(20)  NOT NULL,
    gpa                DECIMAL(3,2) NOT NULL,
    failed_subjects    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    -- TÍN CHỈ TÍCH LUỸ từ đầu khoá đến hết học kỳ này, không phải riêng kỳ này.
    -- Đây là ý nghĩa mà model được huấn luyện — xem app/ml/features.py.
    credits_completed  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    -- Số tín chỉ đăng ký TRONG học kỳ này.
    credits_registered SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_academic_student FOREIGN KEY (student_id)
        REFERENCES students (student_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_academic_gpa CHECK (gpa BETWEEN 0 AND 10),
    INDEX idx_academic_student_created (student_id, created_at)
) ENGINE = InnoDB;


-- ---------------------------------------------------------------------
-- attendance — chuyên cần theo khoảng thời gian
-- ---------------------------------------------------------------------
CREATE TABLE attendance (
    attendance_id   INT AUTO_INCREMENT PRIMARY KEY,
    student_id      INT          NOT NULL,
    period_start    DATE         NOT NULL,
    period_end      DATE         NOT NULL,
    attendance_rate DECIMAL(5,2) NOT NULL,
    total_sessions  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    absent_sessions SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_attendance_student FOREIGN KEY (student_id)
        REFERENCES students (student_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_attendance_rate   CHECK (attendance_rate BETWEEN 0 AND 100),
    CONSTRAINT chk_attendance_period CHECK (period_end >= period_start),
    INDEX idx_attendance_student_created (student_id, created_at)
) ENGINE = InnoDB;


-- ---------------------------------------------------------------------
-- learning_interactions — mức độ tương tác trên hệ thống học tập
-- ---------------------------------------------------------------------
CREATE TABLE learning_interactions (
    interaction_id       INT AUTO_INCREMENT PRIMARY KEY,
    student_id           INT          NOT NULL,
    period_start         DATE         NOT NULL,
    period_end           DATE         NOT NULL,
    login_count          INT UNSIGNED NOT NULL DEFAULT 0,
    assignment_submitted INT UNSIGNED NOT NULL DEFAULT 0,
    assignment_missing   INT UNSIGNED NOT NULL DEFAULT 0,
    forum_posts          INT UNSIGNED NOT NULL DEFAULT 0,
    video_views          INT UNSIGNED NOT NULL DEFAULT 0,
    learning_hours       DECIMAL(6,2) NOT NULL DEFAULT 0,
    created_at           TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_interaction_student FOREIGN KEY (student_id)
        REFERENCES students (student_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_interaction_hours CHECK (learning_hours >= 0),
    INDEX idx_interaction_student_created (student_id, created_at)
) ENGINE = InnoDB;


-- ---------------------------------------------------------------------
-- predictions — kết quả dự đoán, lưu lại từng lần để có lịch sử
-- ---------------------------------------------------------------------
CREATE TABLE predictions (
    prediction_id    INT AUTO_INCREMENT PRIMARY KEY,
    student_id       INT           NOT NULL,
    probability      DECIMAL(5,4)  NOT NULL,
    risk_level       ENUM('Thấp', 'Trung bình', 'Cao', 'Rất cao') NOT NULL,
    is_at_risk       BOOLEAN       NOT NULL,
    model_version    VARCHAR(50)   NOT NULL,
    -- Top-5 yếu tố ảnh hưởng do SHAP tính, lưu nguyên JSON để hiển thị lại
    -- đúng những gì model căn cứ tại thời điểm dự đoán.
    shap_top_factors JSON          NULL,
    created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_prediction_student FOREIGN KEY (student_id)
        REFERENCES students (student_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT chk_prediction_probability CHECK (probability BETWEEN 0 AND 1),
    INDEX idx_prediction_student_created (student_id, created_at),
    INDEX idx_prediction_risk (risk_level)
) ENGINE = InnoDB;


-- ---------------------------------------------------------------------
-- counselors — cố vấn học tập / chuyên viên hỗ trợ
-- ---------------------------------------------------------------------
CREATE TABLE counselors (
    counselor_id INT AUTO_INCREMENT PRIMARY KEY,
    full_name    VARCHAR(150) NOT NULL,
    title        VARCHAR(150) NULL,
    email        VARCHAR(150) NULL,
    phone        VARCHAR(20)  NULL,
    created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_counselors_email UNIQUE (email)
) ENGINE = InnoDB;


-- ---------------------------------------------------------------------
-- meeting_logs — biên bản buổi gặp sinh viên
-- ---------------------------------------------------------------------
CREATE TABLE meeting_logs (
    meeting_id       INT AUTO_INCREMENT PRIMARY KEY,
    student_id       INT       NOT NULL,
    counselor_id     INT       NULL,
    meeting_date     DATE      NOT NULL,
    meeting_type     ENUM('academic_counseling', 'financial_aid_review', 'disciplinary_review',
                          'parental_outreach', 'personal_check_in') NOT NULL,
    duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 30,
    notes            TEXT      NULL,
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_meeting_student FOREIGN KEY (student_id)
        REFERENCES students (student_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_meeting_counselor FOREIGN KEY (counselor_id)
        REFERENCES counselors (counselor_id) ON DELETE SET NULL ON UPDATE CASCADE,
    INDEX idx_meeting_student_date (student_id, meeting_date)
) ENGINE = InnoDB;


-- ---------------------------------------------------------------------
-- interventions — hành động can thiệp cần theo dõi tiến độ
--
-- Thư gửi phụ huynh là category='parental_outreach' trong chính bảng này,
-- không tách bảng riêng: bản chất vẫn là "một việc cần làm, có hạn hoàn
-- thành và có trạng thái", tách ra chỉ nhân đôi cấu trúc.
-- ---------------------------------------------------------------------
CREATE TABLE interventions (
    intervention_id INT AUTO_INCREMENT PRIMARY KEY,
    student_id      INT          NOT NULL,
    prediction_id   INT          NULL,   -- lần dự đoán làm phát sinh can thiệp này
    meeting_id      INT          NULL,   -- buổi gặp đã thống nhất can thiệp này
    counselor_id    INT          NULL,
    category        ENUM('academic_counseling', 'financial_aid_review', 'peer_tutoring',
                         'parental_outreach', 'emergency_grant', 'fafsa_check',
                         'advising', 'other') NOT NULL DEFAULT 'other',
    title           VARCHAR(255) NOT NULL,
    description     TEXT         NULL,
    status          ENUM('not_started', 'in_progress', 'completed') NOT NULL DEFAULT 'not_started',
    due_date        DATE         NULL,
    completed_at    DATETIME     NULL,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_intervention_student FOREIGN KEY (student_id)
        REFERENCES students (student_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_intervention_prediction FOREIGN KEY (prediction_id)
        REFERENCES predictions (prediction_id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_intervention_meeting FOREIGN KEY (meeting_id)
        REFERENCES meeting_logs (meeting_id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_intervention_counselor FOREIGN KEY (counselor_id)
        REFERENCES counselors (counselor_id) ON DELETE SET NULL ON UPDATE CASCADE,
    INDEX idx_intervention_student_status (student_id, status),
    INDEX idx_intervention_due (due_date)
) ENGINE = InnoDB;


-- ---------------------------------------------------------------------
-- Hai khoá ngoại khép vòng users <-> students
--
-- users.student_id trỏ sang students, students.advisor_user_id trỏ ngược lại
-- users. Không thứ tự CREATE TABLE nào thoả mãn được cả hai, nên chúng được
-- thêm ở đây, sau khi cả hai bảng đã tồn tại.
-- ---------------------------------------------------------------------
ALTER TABLE users
    ADD CONSTRAINT fk_users_student FOREIGN KEY (student_id)
        REFERENCES students (student_id) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE students
    ADD CONSTRAINT fk_students_advisor FOREIGN KEY (advisor_user_id)
        REFERENCES users (user_id) ON DELETE SET NULL ON UPDATE CASCADE;
