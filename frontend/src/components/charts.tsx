"use client";

import {
  Bar, BarChart, CartesianGrid, Cell, Label, Line, LineChart, Pie, PieChart, ReferenceLine, Scatter, ScatterChart,
  XAxis, YAxis, ZAxis,
} from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { RISK_STYLE } from "@/components/risk";
import { RISK_LEVELS, type Dashboard, type TrendPoint } from "@/lib/api";

const riskConfig = Object.fromEntries(
  RISK_LEVELS.map((level) => [level, { label: level, color: RISK_STYLE[level].color }]),
) satisfies ChartConfig;

export function RiskDonut({ distribution, total }: { distribution: Dashboard["summary"]["distribution"]; total: number }) {
  const data = RISK_LEVELS.map((level) => ({ level, value: distribution[level], fill: RISK_STYLE[level].color }));

  return (
    <ChartContainer config={riskConfig} className="mx-auto aspect-square max-h-64">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="level" hideLabel />} />
        <Pie data={data} dataKey="value" nameKey="level" innerRadius="62%" strokeWidth={4} paddingAngle={2}>
          <Label
            content={({ viewBox }) => {
              if (!viewBox || !("cx" in viewBox)) return null;
              return (
                <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                  <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-3xl font-bold">{total}</tspan>
                  <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 22} className="fill-muted-foreground text-xs">
                    đã dự đoán
                  </tspan>
                </text>
              );
            }}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}

export function ClassBar({ data }: { data: Dashboard["by_class"] }) {
  const config = { count: { label: "Sinh viên nguy cơ cao", color: "var(--risk-high)" } } satisfies ChartConfig;

  if (!data.length) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Không có sinh viên nguy cơ cao.</p>;
  }
  return (
    <ChartContainer config={config} className="h-64 w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="class_name" width={96} tickLine={false} axisLine={false}
               tick={{ fontSize: 12 }} />
        <ChartTooltip cursor={{ fill: "var(--muted)" }} content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={6} />
      </BarChart>
    </ChartContainer>
  );
}

/**
 * Phân tán GPA hoặc chuyên cần theo xác suất nguy cơ, tô màu theo mức.
 * Trục y cố định 0–100 để hai biểu đồ cạnh nhau so sánh được với nhau.
 */
export function RiskScatter({ data, x, label }: {
  data: Dashboard["scatter"];
  x: "gpa" | "attendance";
  label: string;
}) {
  return (
    <ChartContainer config={riskConfig} className="h-64 w-full">
      <ScatterChart margin={{ top: 8, right: 16, bottom: 16 }}>
        <CartesianGrid />
        <XAxis type="number" dataKey={x} name={label} tickLine={false} axisLine={false}
               domain={x === "gpa" ? [0, 10] : [0, 100]}>
          <Label value={label} position="insideBottom" offset={-10} className="fill-muted-foreground text-xs" />
        </XAxis>
        <YAxis type="number" dataKey="risk" name="Nguy cơ" unit="%" domain={[0, 100]} tickLine={false}
               axisLine={false} width={44} />
        <ZAxis range={[28, 28]} />
        <ChartTooltip cursor={{ strokeDasharray: "3 3" }} content={<ChartTooltipContent hideLabel />} />
        <Scatter data={data} fillOpacity={0.7}>
          {data.map((point, index) => <Cell key={index} fill={RISK_STYLE[point.level].color} />)}
        </Scatter>
      </ScatterChart>
    </ChartContainer>
  );
}

const trendConfig = {
  risk: { label: "Nguy cơ (%)", color: "var(--risk-critical)" },
  attendance: { label: "Chuyên cần (%)", color: "var(--chart-2)" },
  gpa: { label: "GPA (×10)", color: "var(--chart-1)" },
} satisfies ChartConfig;

/**
 * Diễn biến qua các học kỳ. GPA nhân 10 để chung trục 0–100 với hai đường còn lại —
 * đọc hình dạng đi lên hay đi xuống quan trọng hơn đọc giá trị tuyệt đối.
 */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  const rows = data.map((d) => ({ ...d, gpa: d.gpa * 10 }));

  if (rows.length < 2) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Cần ít nhất hai học kỳ dữ liệu để thấy xu hướng.
      </p>
    );
  }
  return (
    <ChartContainer config={trendConfig} className="h-60 w-full">
      <LineChart data={rows} margin={{ top: 8, right: 16, left: -8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="semester" tickLine={false} axisLine={false} />
        <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={36} />
        <ReferenceLine y={60} stroke="var(--risk-high)" strokeDasharray="4 4" strokeOpacity={0.5} />
        <ChartTooltip content={<ChartTooltipContent />} />
        {(Object.keys(trendConfig) as (keyof typeof trendConfig)[]).map((key) => (
          <Line key={key} dataKey={key} type="monotone" stroke={`var(--color-${key})`} strokeWidth={2.5}
                dot={{ r: 4 }} connectNulls animationDuration={600} />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
