/**
 * Vẽ biểu đồ bằng Chart.js.
 *
 * Một file dùng chung cho cả dashboard nội bộ và trang chủ công khai: hai nơi
 * vẽ khác biểu đồ nhưng dùng chung bảng màu và cách xử lý lỗi, tách đôi sẽ
 * dẫn tới hai bảng màu trôi dạt khỏi nhau.
 *
 * Màu phải khớp với biến CSS trong app.css — cùng một mức nguy cơ thì màu ở
 * biểu đồ và màu ở nhãn trong bảng phải là một.
 */
const EduGuardCharts = (function () {
    "use strict";

    const RISK_COLORS = {
        "Thấp": "#006c49",
        "Trung bình": "#996100",
        "Cao": "#ba1a1a",
        "Rất cao": "#7a0000",
    };
    const PRIMARY = "#004ac6";

    async function fetchData(url) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Máy chủ trả về ${response.status}`);
        }
        const payload = await response.json();
        if (!payload.success) {
            throw new Error(payload.error || "Không lấy được dữ liệu");
        }
        return payload.data;
    }

    /** Báo lỗi ngay trên chỗ đáng lẽ là biểu đồ, thay vì để một ô trắng im lặng. */
    function showError(canvasId, message) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const note = document.createElement("p");
        note.className = "text-muted small mb-0";
        note.textContent = `Không hiển thị được biểu đồ: ${message}`;
        canvas.replaceWith(note);
    }

    function pieChart(canvasId, distribution) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const labels = Object.keys(distribution);
        new Chart(canvas, {
            type: "doughnut",
            data: {
                labels: labels,
                datasets: [{
                    data: Object.values(distribution),
                    backgroundColor: labels.map((l) => RISK_COLORS[l] || "#999"),
                    borderWidth: 0,
                }],
            },
            options: {
                responsive: true,
                plugins: { legend: { position: "bottom" } },
            },
        });
    }

    function barChart(canvasId, labels, values, label) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        // Không có dữ liệu thì nói thẳng, đừng vẽ một biểu đồ rỗng trông như
        // thể mọi thứ đều bằng không.
        if (!labels.length) {
            showError(canvasId, "chưa có dữ liệu");
            return;
        }

        new Chart(canvas, {
            type: "bar",
            data: {
                labels: labels,
                datasets: [{ label: label, data: values, backgroundColor: PRIMARY }],
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
            },
        });
    }

    function scatterChart(canvasId, points, xLabel) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        if (!points.length) {
            showError(canvasId, "chưa có dữ liệu");
            return;
        }

        new Chart(canvas, {
            type: "scatter",
            data: {
                datasets: [{
                    data: points,
                    backgroundColor: "rgba(0, 74, 198, 0.55)",
                    pointRadius: 3,
                }],
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: { title: { display: true, text: xLabel } },
                    // Trục y cố định 0–1: để Chart.js tự co giãn thì hai biểu
                    // đồ cạnh nhau có thang khác nhau và không so sánh được.
                    y: { title: { display: true, text: "Xác suất bỏ học" }, min: 0, max: 1 },
                },
            },
        });
    }

    async function loadDashboard(url) {
        let data;
        try {
            data = await fetchData(url);
        } catch (error) {
            ["chart-risk-pie", "chart-by-class", "chart-gpa", "chart-attendance"]
                .forEach((id) => showError(id, error.message));
            return;
        }

        pieChart("chart-risk-pie", data.risk_distribution);
        barChart("chart-by-class", data.by_class.labels, data.by_class.values, "Sinh viên nguy cơ cao");
        scatterChart("chart-gpa", data.gpa, "GPA");
        scatterChart("chart-attendance", data.attendance, "Tỷ lệ chuyên cần (%)");
    }

    async function loadHome(url) {
        let data;
        try {
            data = await fetchData(url);
        } catch (error) {
            ["chart-risk-pie", "chart-by-class"].forEach((id) => showError(id, error.message));
            return;
        }

        pieChart("chart-risk-pie", data.risk_summary);
        barChart("chart-by-class", data.by_class.labels, data.by_class.values, "Sinh viên nguy cơ cao");
    }

    return { loadDashboard, loadHome };
})();
