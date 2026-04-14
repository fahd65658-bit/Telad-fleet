import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const BASE_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top',
      labels: { font: { family: 'Tajawal', size: 12 }, color: '#94a3b8' },
    },
    tooltip: {
      titleFont: { family: 'Tajawal' },
      bodyFont:  { family: 'Tajawal' },
    },
  },
  scales: {
    x: {
      ticks: { font: { family: 'Tajawal' }, color: '#94a3b8' },
      grid:  { color: 'rgba(148,163,184,0.1)' },
    },
    y: {
      ticks: { font: { family: 'Tajawal' }, color: '#94a3b8' },
      grid:  { color: 'rgba(148,163,184,0.1)' },
    },
  },
};

export function BarChart({ labels, datasets, title, height = 280 }) {
  const data = {
    labels,
    datasets: datasets.map((ds, i) => ({
      backgroundColor: ds.color || ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'][i % 4],
      borderRadius: 6,
      ...ds,
    })),
  };

  const options = {
    ...BASE_OPTIONS,
    plugins: {
      ...BASE_OPTIONS.plugins,
      title: title ? { display: true, text: title, font: { family: 'Tajawal', size: 14 }, color: '#64748b' } : { display: false },
    },
  };

  return (
    <div style={{ height }}>
      <Bar data={data} options={options} />
    </div>
  );
}

export function LineChart({ labels, datasets, title, height = 280 }) {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

  const data = {
    labels,
    datasets: datasets.map((ds, i) => ({
      borderColor:     ds.color || colors[i % 4],
      backgroundColor: (ds.color || colors[i % 4]) + '20',
      borderWidth: 2,
      fill: true,
      tension: 0.4,
      pointRadius: 4,
      ...ds,
    })),
  };

  const options = {
    ...BASE_OPTIONS,
    plugins: {
      ...BASE_OPTIONS.plugins,
      title: title ? { display: true, text: title, font: { family: 'Tajawal', size: 14 }, color: '#64748b' } : { display: false },
    },
  };

  return (
    <div style={{ height }}>
      <Line data={data} options={options} />
    </div>
  );
}
