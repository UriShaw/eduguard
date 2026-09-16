"""
Huấn luyện model và lưu lại.

    python -m scripts.train_model

Chạy lại mỗi khi có dữ liệu huấn luyện mới. Kết quả in ra là số đo thật trên
tập test, không phải con số mong đợi.
"""
from app.logging_setup import get_logger
from app.ml.registry import save_artifacts
from app.ml.training import comparison_table, select_best, train_all

logger = get_logger("scripts.train_model")


def main() -> None:
    results, pipeline, (n_train, n_test) = train_all()

    print("\nSo sánh các model trên tập test:")
    print(comparison_table(results).to_string())

    best_name, best_model = select_best(results, metric="recall")
    metrics = results[best_name]["metrics"]

    version = save_artifacts(best_model, pipeline, best_name, metrics, n_train, n_test)

    print(f"\nĐã chọn: {best_name}")
    print(f"  recall    = {metrics['recall']:.4f}   (tiêu chí chọn)")
    print(f"  precision = {metrics['precision']:.4f}")
    print(f"  roc_auc   = {metrics['roc_auc']:.4f}")
    print(f"  phiên bản = {version}")

    # Nhắc lại ý nghĩa của recall thấp, để người chạy không bỏ qua con số này.
    if metrics["recall"] < 0.7:
        print("\nCẢNH BÁO: recall dưới 0.70 — model đang bỏ sót hơn 30% sinh viên "
              "thực sự có nguy cơ. Cân nhắc bổ sung dữ liệu trước khi dùng thật.")


if __name__ == "__main__":
    main()
